/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, expect, it } from 'vitest';
import { FragmentedTimelineProjector } from './fragmentedTimelineProjector';

const summarize = (projector: FragmentedTimelineProjector) =>
  projector
    .snapshot()
    .map((segment) => `${segment.startTime}-${segment.endTime}:${segment.validationState}`)
    .join(', ');

describe('forward playback', () => {
  it('merges same-state ticks into one segment', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(5, 'Valid');
    projector.observe(10, 'Valid');

    expect(summarize(projector)).toBe('0-10:Valid');
  });

  it('starts a new segment on a state change without disturbing the first', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(10, 'Valid');
    projector.observe(15, 'Invalid');

    expect(summarize(projector)).toBe('0-10:Valid, 10-15:Invalid');
  });

  it('extends the tail again after a backward seek', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(10, 'Valid');
    projector.observe(3, 'Valid');
    projector.observe(12, 'Valid');

    expect(summarize(projector)).toBe('0-12:Valid');
  });
});

describe('backward observation (VOD)', () => {
  it('leaves an already-known same-state region untouched, so colours are retained', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(10, 'Valid');
    projector.observe(15, 'Invalid');
    const before = summarize(projector);

    // A playhead sample with no explicit bounds, as the HLS adapter produces.
    projector.observe(3, 'Valid');

    expect(summarize(projector)).toBe(before);
  });

  it('splits an unknown region into three correctly bounded pieces', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(10, 'Unknown');
    projector.observe(6, 'Valid', 2);

    expect(summarize(projector)).toBe('0-2:Unknown, 2-6:Valid, 6-10:Unknown');
  });

  it('drops a fully covered segment and trims the edges rather than duplicating', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(2, 'Valid', 0);
    projector.observe(4, 'Invalid', 2);
    projector.observe(6, 'Valid', 4);

    projector.observe(5, 'Trusted', 1);

    expect(summarize(projector)).toBe('0-1:Valid, 1-5:Trusted, 5-6:Valid');
  });
});

describe('live mode', () => {
  it('wipes history on a backward seek, unlike VOD', () => {
    const projector = new FragmentedTimelineProjector();
    projector.setLiveMode(true);
    projector.observe(10, 'Valid');
    projector.observe(20, 'Trusted');
    expect(projector.snapshot()).toHaveLength(2);

    projector.observe(3, 'Valid');

    expect(summarize(projector)).toBe('0-3:Valid');
  });

  it('prunes segments older than the retention window', () => {
    const projector = new FragmentedTimelineProjector();
    // Retention stated rather than inherited, so the case does not move when
    // the configured default does.
    projector.setLiveMode(true, 600);
    projector.observe(2, 'Valid', 0);
    projector.observe(4, 'Invalid', 2);
    // Far enough forward that the first segment falls outside the window.
    projector.observe(700, 'Valid', 4);

    expect(projector.snapshot()).toHaveLength(1);
    expect(projector.snapshot()[0].startTime).toBe(4);
  });

  it('prunes by the retention it was given, not a fixed one', () => {
    const projector = new FragmentedTimelineProjector();
    projector.setLiveMode(true, 60);
    projector.observe(2, 'Valid', 0);
    projector.observe(4, 'Invalid', 2);
    // Inside the old 600s default, outside the 60s asked for here.
    projector.observe(120, 'Valid', 4);

    expect(projector.snapshot()).toHaveLength(1);
  });

  it('never prunes in VOD mode', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(2, 'Valid', 0);
    projector.observe(4, 'Invalid', 2);
    projector.observe(700, 'Valid', 4);

    expect(projector.snapshot()).toHaveLength(3);
    expect(projector.snapshot()[0].startTime).toBe(0);
  });
});

describe('fragment enumeration', () => {
  const FRAGMENTS = [
    { start: 0, end: 4, state: 'Trusted' as const },
    { start: 4, end: 8, state: 'Trusted' as const },
    { start: 8, end: 12, state: 'Invalid' as const },
    { start: 12, end: 16, state: 'Trusted' as const },
  ];

  const enumerate = (projector: FragmentedTimelineProjector) => {
    for (const fragment of FRAGMENTS) {
      projector.observe(fragment.end, fragment.state, fragment.start);
    }
  };

  it('merges same-state neighbours and keeps the invalid one distinct', () => {
    const projector = new FragmentedTimelineProjector();
    enumerate(projector);

    expect(summarize(projector)).toBe('0-8:Trusted, 8-12:Invalid, 12-16:Trusted');
  });

  it('is idempotent, since the adapter re-enumerates on every rebuild', () => {
    const projector = new FragmentedTimelineProjector();
    enumerate(projector);
    const first = summarize(projector);

    enumerate(projector);
    enumerate(projector);

    expect(summarize(projector)).toBe(first);
  });

  it('keeps a verdict known ahead of the playhead when a sample lands behind it', () => {
    const projector = new FragmentedTimelineProjector();
    // The bridge has validated out to 16s while playback sits near 2s.
    projector.observe(4, 'Trusted', 0);
    projector.observe(8, 'Invalid', 4);
    projector.observe(16, 'Trusted', 8);

    projector.observe(2, 'Trusted');

    const invalid = projector.snapshot().find((segment) => segment.validationState === 'Invalid');
    expect(invalid).toMatchObject({ startTime: 4, endTime: 8 });
  });

  it('corrects a changed verdict in place rather than duplicating the fragment', () => {
    const projector = new FragmentedTimelineProjector();
    projector.observe(4, 'Unknown', 0);
    projector.observe(8, 'Trusted', 4);

    // Same bounds, upgraded verdict once the reader resolved.
    projector.observe(4, 'Trusted', 0);

    expect(summarize(projector)).toBe('0-8:Trusted');
  });
});

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
import { readRegionKey, selectReadRegions } from './readRegionGate';
import { WatchedTimeline } from './watchedTimeline';

/** Sixteen 8s fragments, all validated up front, as a real prefetch produces. */
const FRAGMENTS = Array.from({ length: 16 }, (_, index) => ({
  startTime: index * 8,
  endTime: (index + 1) * 8,
  validationState: index === 2 ? ('Invalid' as const) : ('Trusted' as const),
}));

function play(watched: WatchedTimeline, from: number, to: number, step = 0.25) {
  for (let time = from; time <= to + 1e-9; time += step) {
    watched.observePlayhead(time, true);
  }
}

/** A seek moves the playhead while the element is not playing. */
function seekTo(watched: WatchedTimeline, time: number) {
  watched.observePlayhead(time, false);
}

const covers = (regions: { startTime: number; endTime: number }[], time: number) =>
  regions.some((region) => time >= region.startTime && time < region.endTime);

const summarize = (projector: FragmentedTimelineProjector) =>
  projector
    .snapshot()
    .map((segment) => `${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}:${segment.validationState}`)
    .join(', ');

describe('WatchedTimeline', () => {
  it('claims nothing before playback starts', () => {
    expect(selectReadRegions(FRAGMENTS, new WatchedTimeline())).toHaveLength(0);
  });

  it('does not claim a stretch that was skipped over', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 5);
    seekTo(watched, 60);
    play(watched, 60, 64);

    const regions = selectReadRegions(FRAGMENTS, watched);

    expect(watched.snapshot()).toHaveLength(2);
    expect(covers(regions, 2)).toBe(true);
    expect(covers(regions, 62)).toBe(true);
    for (const skipped of [20, 40, 55]) {
      expect(covers(regions, skipped)).toBe(false);
    }
    expect(Math.max(...regions.map((region) => region.endTime))).toBeLessThanOrEqual(64 + 1e-6);
  });

  it('splits a fragment watched in two sittings, leaving the middle unclaimed', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 2);
    seekTo(watched, 6);
    play(watched, 6, 8);

    const regions = selectReadRegions([FRAGMENTS[0]], watched);

    expect(regions).toHaveLength(2);
    expect(regions[0].source).toBe(regions[1].source);
    expect(covers(regions, 4)).toBe(false);
  });

  it('ignores scrubbing, which moves the playhead without playing', () => {
    const watched = new WatchedTimeline();
    for (let time = 0; time <= 120; time += 0.25) {
      watched.observePlayhead(time, false);
    }

    expect(watched.snapshot()).toHaveLength(0);
    expect(selectReadRegions(FRAGMENTS, watched)).toHaveLength(0);
  });

  it('keeps one run across a pause and resume in place', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 4);
    for (let tick = 0; tick < 20; tick += 1) {
      watched.observePlayhead(4, false);
    }
    play(watched, 4, 6);

    expect(watched.snapshot()).toHaveLength(1);
  });

  it('measures from where playback resumed, not across the jump', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 4);
    seekTo(watched, 90);
    play(watched, 90, 92);

    expect(covers(selectReadRegions(FRAGMENTS, watched), 50)).toBe(false);
  });

  it('refuses an advance too large to be playback, even while playing', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 3);
    watched.observePlayhead(80, true);
    play(watched, 80, 82);

    expect(covers(selectReadRegions(FRAGMENTS, watched), 40)).toBe(false);
  });
});

describe('selectReadRegions', () => {
  it('carries each region back to its own verdict rather than matching by index', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 20);
    const tagged = FRAGMENTS.map((fragment, index) => ({ ...fragment, tag: index }));

    for (const region of selectReadRegions(tagged, watched)) {
      expect(region.startTime).toBeGreaterThanOrEqual(region.source.startTime);
      expect(region.endTime).toBeLessThanOrEqual(region.source.endTime);
    }
  });
});

describe('readRegionKey', () => {
  it('settles once a region is fully read, and changes while it grows', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 10);
    const settled = readRegionKey(selectReadRegions([FRAGMENTS[0]], watched)[0]);

    play(watched, 10, 12);
    expect(readRegionKey(selectReadRegions([FRAGMENTS[0]], watched)[0])).toBe(settled);

    const growing = readRegionKey(selectReadRegions([FRAGMENTS[1]], watched)[0]);
    play(watched, 12, 14);
    expect(readRegionKey(selectReadRegions([FRAGMENTS[1]], watched)[0])).not.toBe(growing);
  });

  it('changes when the verdict changes, so the region is re-projected', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 10);
    const trusted = readRegionKey(selectReadRegions([FRAGMENTS[0]], watched)[0]);
    const flipped = [{ ...FRAGMENTS[0], validationState: 'Invalid' as const }];

    expect(readRegionKey(selectReadRegions(flipped, watched)[0])).not.toBe(trusted);
  });
});

describe('gate and projector together', () => {
  const project = (projector: FragmentedTimelineProjector, watched: WatchedTimeline) => {
    for (const region of selectReadRegions(FRAGMENTS, watched)) {
      projector.observe(region.endTime, region.validationState, region.startTime);
    }
  };

  it('renders a skipped stretch as a real gap', () => {
    const watched = new WatchedTimeline();
    const projector = new FragmentedTimelineProjector();

    play(watched, 0, 5);
    project(projector, watched);
    seekTo(watched, 60);
    play(watched, 60, 64);
    project(projector, watched);

    expect(projector.snapshot()).toHaveLength(2);
    expect(covers(projector.snapshot(), 2)).toBe(true);
    expect(covers(projector.snapshot(), 30)).toBe(false);
    expect(covers(projector.snapshot(), 62)).toBe(true);
  });

  it('preserves the timeline when seeking back into watched ground', () => {
    const watched = new WatchedTimeline();
    const projector = new FragmentedTimelineProjector();

    play(watched, 0, 5);
    project(projector, watched);
    seekTo(watched, 60);
    play(watched, 60, 64);
    project(projector, watched);
    const before = summarize(projector);

    seekTo(watched, 1);
    project(projector, watched);

    expect(summarize(projector)).toBe(before);
  });

  it('colours an invalid fragment in place, not the run around it', () => {
    const watched = new WatchedTimeline();
    const projector = new FragmentedTimelineProjector();

    play(watched, 0, 32);
    project(projector, watched);

    expect(summarize(projector)).toBe(
      '0.00-16.00:Trusted, 16.00-24.00:Invalid, 24.00-32.00:Trusted',
    );
  });
});

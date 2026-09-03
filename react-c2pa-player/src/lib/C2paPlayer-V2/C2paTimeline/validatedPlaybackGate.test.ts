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
import { decideValidatedPlayback, newestVerdictEnd } from './validatedPlaybackGate';

const live = (currentTime: number, verdictEnd: number | null, enforce = true) =>
  decideValidatedPlayback({ isLive: true, enforce, currentTime, newestVerdictEnd: verdictEnd });

describe('decideValidatedPlayback', () => {
  it('lets playback run while it stays inside validated content', () => {
    expect(live(100, 104)).toEqual({ hold: false, reason: 'validated' });
  });

  it('holds once the playhead passes the newest verdict', () => {
    expect(live(110, 104)).toEqual({ hold: true, reason: 'ahead-of-validation' });
  });

  it('tolerates the boundary rather than stuttering on rounding', () => {
    // Position is sampled a few times a second against a float segment end, so
    // an exact comparison would fire at every boundary on a healthy stream.
    expect(live(104.2, 104).hold).toBe(false);
    expect(live(104.9, 104).hold).toBe(true);
  });

  it('does not hold before anything has been validated', () => {
    // Holding here would stop a stream from ever starting.
    expect(live(100, null)).toEqual({ hold: false, reason: 'no-verdicts-yet' });
  });

  it('does nothing on VOD', () => {
    // Verdicts arrive far ahead of playback there, and seeking is free.
    expect(
      decideValidatedPlayback({ isLive: false, enforce: true, currentTime: 500, newestVerdictEnd: 4 }),
    ).toEqual({ hold: false, reason: 'not-live' });
  });

  it('does nothing when switched off', () => {
    expect(live(999, 4, false)).toEqual({ hold: false, reason: 'disabled' });
  });

  it('does not hold on a playhead it cannot read', () => {
    expect(live(Number.NaN, 104).hold).toBe(false);
  });

  it('holds far past the edge, as after a rejoin into unvalidated content', () => {
    // Jumping to the live edge lands ahead of every verdict. Holding there is
    // the rule working, not failing: it releases as verdicts arrive.
    expect(live(1_788_368_500, 1_788_368_400).hold).toBe(true);
  });
});

describe('newestVerdictEnd', () => {
  it('is the furthest point any verdict covers', () => {
    expect(newestVerdictEnd([{ endTime: 4 }, { endTime: 12 }, { endTime: 8 }])).toBe(12);
  });

  it('is null when there is nothing to go on', () => {
    expect(newestVerdictEnd([])).toBeNull();
    expect(newestVerdictEnd(undefined)).toBeNull();
    expect(newestVerdictEnd([{ endTime: Number.NaN }])).toBeNull();
  });

  it('ignores an unusable entry among usable ones', () => {
    expect(newestVerdictEnd([{ endTime: 8 }, { endTime: Number.POSITIVE_INFINITY }])).toBe(8);
  });
});

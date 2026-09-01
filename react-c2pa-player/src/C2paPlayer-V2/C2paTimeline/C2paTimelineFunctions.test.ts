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
import { getTimelineWindow, LIVE_WINDOW_SECONDS } from './C2paTimelineFunctions';

/** What positionTimelineSegment does with a window, as a percentage of the bar. */
const place = (
  window: { start: number; size: number },
  startTime: number,
  endTime: number,
) => {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const toPercent = (time: number) => ((time - window.start) / window.size) * 100;
  const left = clamp(toPercent(startTime));

  return { left, width: clamp(toPercent(endTime)) - left };
};

describe('getTimelineWindow', () => {
  describe('on-demand', () => {
    it('spans the whole asset, which is what scaling from zero already did', () => {
      expect(getTimelineWindow(120, 30, 40, false)).toEqual({ start: 0, size: 120 });
    });

    it('falls back to the furthest point known when the duration is indefinite', () => {
      // Not flagged live, so behaviour is unchanged from before the window existed.
      expect(getTimelineWindow(Number.NaN, 30, 48, false)).toEqual({ start: 0, size: 48 });
      expect(getTimelineWindow(Number.POSITIVE_INFINITY, 30, 10, false)).toEqual({ start: 0, size: 30 });
    });

    it('never divides by zero on an empty asset', () => {
      expect(getTimelineWindow(0, 0, 0, false)).toEqual({ start: 0, size: 1 });
    });
  });

  describe('live', () => {
    it('ends at the live edge and is one window wide', () => {
      const window = getTimelineWindow(Number.POSITIVE_INFINITY, 1_000_000, 1_000_004, true);

      expect(window.size).toBe(LIVE_WINDOW_SECONDS);
      expect(window.start + window.size).toBe(1_000_004);
    });

    it('follows whichever of the playhead or newest segment is further ahead', () => {
      expect(getTimelineWindow(Number.NaN, 500, 900, true).start + LIVE_WINDOW_SECONDS).toBe(900);
      expect(getTimelineWindow(Number.NaN, 900, 500, true).start + LIVE_WINDOW_SECONDS).toBe(900);
    });
  });
});

describe('placing segments in the window', () => {
  // The regression this fixes. This origin's availabilityStartTime is 1970, so
  // currentTime arrives near 1.79e9; scaling that from zero put every segment
  // at left 100% with a width around 5e-8%, an invisible sliver.
  const EPOCH_EDGE = 1_788_292_531.15;

  it('gives an epoch-timed live segment a visible width', () => {
    const window = getTimelineWindow(Number.POSITIVE_INFINITY, EPOCH_EDGE, EPOCH_EDGE, true);
    const { left, width } = place(window, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    expect(width).toBeGreaterThan(0.4);
    expect(left).toBeGreaterThan(99);
    expect(left).toBeLessThan(100);
  });

  it('would have been invisible without the window', () => {
    // The old maths, kept as the thing being guarded against.
    const asBefore = place({ start: 0, size: EPOCH_EDGE }, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    expect(asBefore.width).toBeLessThan(0.001);
  });

  it('spreads a window of segments across the whole bar', () => {
    const window = getTimelineWindow(Number.POSITIVE_INFINITY, EPOCH_EDGE, EPOCH_EDGE, true);
    const oldest = place(window, window.start, window.start + 3.84);
    const newest = place(window, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    expect(oldest.left).toBeCloseTo(0, 5);
    expect(newest.left + newest.width).toBeCloseTo(100, 5);
  });

  it('drops a segment that has fallen out of the back of the window', () => {
    const window = getTimelineWindow(Number.POSITIVE_INFINITY, EPOCH_EDGE, EPOCH_EDGE, true);
    const stale = place(window, window.start - 120, window.start - 116);

    expect(stale.width).toBe(0);
  });

  it('places on-demand segments exactly as before', () => {
    const window = getTimelineWindow(100, 50, 60, false);

    expect(place(window, 0, 25)).toEqual({ left: 0, width: 25 });
    expect(place(window, 25, 50)).toEqual({ left: 25, width: 25 });
    expect(place(window, 75, 100)).toEqual({ left: 75, width: 25 });
  });
});

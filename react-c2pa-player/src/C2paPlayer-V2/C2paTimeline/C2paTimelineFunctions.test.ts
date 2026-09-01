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
import {
  getTimelineWindow,
  LIVE_WINDOW_SECONDS,
  MIN_LIVE_WINDOW_SECONDS,
} from './C2paTimelineFunctions';

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
    const INF = Number.POSITIVE_INFINITY;

    it('starts at the minimum before any history exists', () => {
      // A stream just joined has nothing behind it; the floor stops the first
      // segment from becoming the entire window.
      const window = getTimelineWindow(INF, 1_000_000, 1_000_004, true, INF);

      expect(window.size).toBe(MIN_LIVE_WINDOW_SECONDS);
      expect(window.start + window.size).toBe(1_000_004);
    });

    it('holds at the minimum until history outgrows it', () => {
      const edge = 1_000_000;
      const window = getTimelineWindow(INF, edge, edge, true, edge - 20);

      expect(window.size).toBe(MIN_LIVE_WINDOW_SECONDS);
    });

    it('grows to match the history behind it', () => {
      const edge = 1_000_000;
      const window = getTimelineWindow(INF, edge, edge, true, edge - 300);

      expect(window.size).toBe(300);
      expect(window.start).toBe(edge - 300);
    });

    it('stops growing at the cap and rolls from there', () => {
      const edge = 1_000_000;
      const window = getTimelineWindow(INF, edge, edge, true, edge - 3600);

      expect(window.size).toBe(LIVE_WINDOW_SECONDS);
      expect(window.start).toBe(edge - LIVE_WINDOW_SECONDS);
    });

    it('always ends at the live edge, whichever side is further ahead', () => {
      const INF_START = Number.POSITIVE_INFINITY;

      expect(getTimelineWindow(Number.NaN, 500, 900, true, INF_START).start)
        .toBe(900 - MIN_LIVE_WINDOW_SECONDS);
      expect(getTimelineWindow(Number.NaN, 900, 500, true, INF_START).start)
        .toBe(900 - MIN_LIVE_WINDOW_SECONDS);
    });
  });
});

describe('placing segments in the window', () => {
  // The regression this fixes. This origin's availabilityStartTime is 1970, so
  // currentTime arrives near 1.79e9; scaling that from zero put every segment
  // at left 100% with a width around 5e-8%, an invisible sliver.
  const EPOCH_EDGE = 1_788_292_531.15;
  const INF = Number.POSITIVE_INFINITY;

  it('gives the first epoch-timed live segment a legible width', () => {
    const window = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true, EPOCH_EDGE - 3.84);
    const { left, width } = place(window, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    // 3.84s of the 60s floor.
    expect(width).toBeCloseTo(6.4, 1);
    expect(left + width).toBeCloseTo(100, 5);
  });

  it('would have been invisible without the window', () => {
    // The old maths, kept as the thing being guarded against.
    const asBefore = place({ start: 0, size: EPOCH_EDGE }, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    expect(asBefore.width).toBeLessThan(0.001);
  });

  it('narrows a segment as history accumulates behind it', () => {
    const atOneMinute = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true, EPOCH_EDGE - 60);
    const atFull = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true, EPOCH_EDGE - 3600);

    const early = place(atOneMinute, EPOCH_EDGE - 3.84, EPOCH_EDGE).width;
    const late = place(atFull, EPOCH_EDGE - 3.84, EPOCH_EDGE).width;

    expect(early).toBeGreaterThan(late);
    expect(late).toBeCloseTo((3.84 / LIVE_WINDOW_SECONDS) * 100, 4);
  });

  it('fills the bar with whatever history is known', () => {
    const window = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true, EPOCH_EDGE - 300);
    const whole = place(window, EPOCH_EDGE - 300, EPOCH_EDGE);

    expect(whole.left).toBeCloseTo(0, 5);
    expect(whole.width).toBeCloseTo(100, 5);
  });

  it('drops a segment that has fallen out of the back of the window', () => {
    const window = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true, EPOCH_EDGE - 3600);
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

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
import { decideLiveResume, pauseBudgetSeconds } from './liveResume';

describe('decideLiveResume', () => {
  it('leaves a VOD position alone, however long the pause', () => {
    expect(decideLiveResume(false, 3600, 30)).toEqual({
      rejoinAtLiveEdge: false,
      reason: 'not-live',
    });
  });

  it('continues where it paused when the position is still retained', () => {
    // Three seconds into a thirty-second window: still there. Yanking the
    // viewer to the edge here would be its own bug.
    expect(decideLiveResume(true, 3, 30).rejoinAtLiveEdge).toBe(false);
    expect(decideLiveResume(true, 3, 30).reason).toBe('within-window');
  });

  it('rejoins the edge once the pause has outlasted the window', () => {
    // The measured failure: 25s paused on a 30s window never recovered.
    expect(decideLiveResume(true, 25, 30)).toEqual({
      rejoinAtLiveEdge: true,
      reason: 'pause-outlasted-window',
    });
    expect(decideLiveResume(true, 75, 30).rejoinAtLiveEdge).toBe(true);
  });

  it('keeps a margin rather than trusting the last instant of the window', () => {
    // The origin deletes segments continuously, and the position has to survive
    // resuming and re-buffering, not merely exist when play is pressed.
    expect(decideLiveResume(true, 29, 30).rejoinAtLiveEdge).toBe(true);
    expect(decideLiveResume(true, 20, 30).rejoinAtLiveEdge).toBe(false);
  });

  it('scales with the window rather than assuming 30 seconds', () => {
    // A stream retaining ten minutes should not be jumped forward after one.
    expect(decideLiveResume(true, 60, 600).rejoinAtLiveEdge).toBe(false);
    expect(decideLiveResume(true, 550, 600).rejoinAtLiveEdge).toBe(true);
  });

  it('does not move the viewer when there is nothing to measure against', () => {
    // A stall is recoverable by clicking LIVE; losing content the viewer chose
    // to watch is not, so an unknown window means leave them where they are.
    for (const depth of [null, 0, Number.NaN]) {
      expect(decideLiveResume(true, 999, depth).rejoinAtLiveEdge).toBe(false);
      expect(decideLiveResume(true, 999, depth).reason).toBe('unknown-window');
    }

    expect(decideLiveResume(true, Number.NaN, 30).rejoinAtLiveEdge).toBe(false);
  });
});

describe('pauseBudgetSeconds', () => {
  it('is the fraction of the window a pause may consume', () => {
    expect(pauseBudgetSeconds(30)).toBeCloseTo(24, 5);
    expect(pauseBudgetSeconds(300)).toBeCloseTo(240, 5);
  });

  it('is null when there is nothing to measure against', () => {
    // Read by both callers as "no budget": no rejoin, and no countdown on the
    // consent gate. Correct rather than a shortcut - a position that cannot
    // expire needs no deadline.
    expect(pauseBudgetSeconds(null)).toBeNull();
    expect(pauseBudgetSeconds(0)).toBeNull();
    expect(pauseBudgetSeconds(-30)).toBeNull();
    expect(pauseBudgetSeconds(Number.NaN)).toBeNull();
    expect(pauseBudgetSeconds(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('is the same number decideLiveResume judges against', () => {
    // The whole reason it is exported. 24s on a 30s window means a 24.1s pause
    // rejoins and a 23.9s one does not, and the consent countdown has to expire
    // at exactly that boundary or the two contradict each other.
    const budget = pauseBudgetSeconds(30) as number;

    expect(decideLiveResume(true, budget - 0.1, 30).rejoinAtLiveEdge).toBe(false);
    expect(decideLiveResume(true, budget + 0.1, 30).rejoinAtLiveEdge).toBe(true);
  });
});

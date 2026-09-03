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

/**
 * Rejoining a live stream after a pause.
 *
 * Pausing a live DASH stream stops dash.js completely - measured over 75
 * seconds, `buffered.end` and the whole seekable range advanced by 0.0s, with
 * and without `scheduleWhilePaused`. So on resume the position it was left at
 * may no longer exist at the origin, and playback hangs outright rather than
 * failing visibly. That is the bug this exists to prevent.
 *
 * The decision cannot be made from `video.seekable`: it froze along with
 * everything else, so it still reports the paused position as seekable when it
 * is long gone. What did keep moving is the wall clock, so the rule is how long
 * the pause lasted against how much the origin retains.
 */

/**
 * Fraction of the DVR window a pause may consume before the paused position is
 * treated as gone.
 *
 * Not 1.0: the origin is deleting segments the whole time, and the position has
 * to survive the round trip of resuming and re-buffering, not merely exist at
 * the instant play is pressed. Not much lower either - jumping to the edge
 * after a three-second pause on a thirty-second window would be its own bug.
 */
const PAUSE_BUDGET_FRACTION = 0.8;

/**
 * How long a pause may last before the paused position is treated as gone.
 *
 * Exported because a second thing now needs the same number: the consent gate's
 * countdown, which asks the viewer to decide *before* the moment they are being
 * asked about stops existing. If the two used different figures they would
 * contradict each other - the question could expire while the position was
 * still good, or promise time that had already run out. One number, one
 * meaning.
 *
 * `null` when there is nothing to measure against, which the callers read as
 * "no budget": no rejoin, and no countdown.
 */
export function pauseBudgetSeconds(dvrDepthSeconds: number | null): number | null {
  if (
    dvrDepthSeconds === null ||
    !Number.isFinite(dvrDepthSeconds) ||
    dvrDepthSeconds <= 0
  ) {
    return null;
  }

  return dvrDepthSeconds * PAUSE_BUDGET_FRACTION;
}

export interface LiveResumeDecision {
  /** Whether the paused position has to be abandoned for the live edge. */
  rejoinAtLiveEdge: boolean;
  /** Why, for the debug console and for tests to assert against. */
  reason: 'not-live' | 'unknown-window' | 'within-window' | 'pause-outlasted-window';
}

/**
 * Whether resuming should continue where it paused, or rejoin at the edge.
 *
 * @param isLive - live sources only; a VOD position is always still there
 * @param pausedForSeconds - wall-clock seconds the stream was paused
 * @param dvrDepthSeconds - how much the origin retains, or null if unknown
 */
export function decideLiveResume(
  isLive: boolean,
  pausedForSeconds: number,
  dvrDepthSeconds: number | null,
): LiveResumeDecision {
  if (!isLive) {
    return { rejoinAtLiveEdge: false, reason: 'not-live' };
  }

  const budget = pauseBudgetSeconds(dvrDepthSeconds);

  if (budget === null || !Number.isFinite(pausedForSeconds)) {
    // Nothing to measure against. Leaving the position alone risks a stall;
    // yanking to the edge on a guess loses content the viewer chose to watch.
    // The stall is recoverable by clicking LIVE, so prefer not to move them.
    return { rejoinAtLiveEdge: false, reason: 'unknown-window' };
  }

  return pausedForSeconds > budget
    ? { rejoinAtLiveEdge: true, reason: 'pause-outlasted-window' }
    : { rejoinAtLiveEdge: false, reason: 'within-window' };
}

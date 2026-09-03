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
 * Smooths the live window's right-hand edge, so the bar rolls instead of
 * lurching.
 *
 * The window is anchored to `max(currentTime, latestKnownEndTime)`. On a live
 * stream verdicts arrive on download, ahead of playback, so that anchor is
 * almost always the newest verdict's end - and a verdict covers a whole
 * segment, so the anchor is a *staircase*: it holds still for a segment's
 * duration and then jumps by one. Measured on the WDR feed (3.84s segments, a
 * 300s window, a ~700px bar) that is nothing for four seconds and then a 9px
 * jump left, which is what the roll looked like.
 *
 * A CSS transition does not fix this. Transitions ease *between* the values
 * they are given, and the values arrive four times a second in segment-sized
 * steps; easing them only spreads each lurch over 200ms. What is needed is a
 * continuously advancing anchor, which is what this produces.
 *
 * The edge is a first-order filter on the anchor: it advances at real time and
 * is pulled toward the anchor with a time constant. Two properties follow, and
 * they are the reason it is written this way rather than as a clamp:
 *
 *  - Against an anchor that advances continuously, the error decays to zero.
 *    The edge ends up exactly on the live edge, moving at exactly 1s/s.
 *  - Against the staircase, the error averages zero and the edge's *speed*
 *    varies smoothly between about 0.9x and 2x across each segment. Speed
 *    varying that gently is not something an eye picks up; a stop is. An
 *    earlier version bounded the edge at the anchor, which never overshoots
 *    but reaches it early and then holds - a stop and a start twice per
 *    segment, which is the stutter this exists to remove.
 *
 * Two guards on top:
 *
 *  - **Never backwards.** If the anchor drops - playback held by the
 *    validation gate while no new verdict arrives, so `max(...)` stops
 *    advancing - the edge coasts to a stop instead of reversing. A bar that
 *    rolled backwards would read as history being rewritten.
 *  - **Snap on a discontinuity.** Past a threshold this is not lag, it is a
 *    different position: a rejoin at the live edge, a seek, a new source, or a
 *    switch between an epoch-based and a zero-based timeline. Gliding across
 *    1.79e9 seconds would take fifty years.
 */

export interface LiveEdgeState {
  /** The smoothed edge, in the stream's own time base. */
  edge: number;
  /** When `edge` was computed, from the same clock `nowMs` comes from. */
  atMs: number;
}

/**
 * How quickly the edge closes on the anchor.
 *
 * Also, exactly, the furthest the edge can drift past an anchor that has
 * stopped advancing: with no new verdicts the edge coasts to `anchor + this`
 * and halts, which on a five-minute window is a 1.3% grey sliver at the right
 * telling the viewer nothing has been validated recently. That is a fair thing
 * for a monitoring bar to show, and it is bounded, which is the important part.
 *
 * Sized against a segment duration (3.84s here, 2-10s in general). Larger
 * would make the roll more even still and the recovery from a stall slower;
 * smaller would track the staircase more closely, which is the opposite of the
 * point.
 */
const TIME_CONSTANT_SECONDS = 4;

/**
 * Beyond this much error, jump rather than glide.
 *
 * Has to be larger than any ordinary anchor step, which is one segment. And
 * smaller than a real discontinuity. Thirty seconds sits between the two with
 * room either side, and is also the shallowest DVR these streams advertise -
 * so a rejoin to the live edge from the back of the buffer snaps, which is
 * correct: the viewer moved, the history did not roll.
 */
const SNAP_SECONDS = 30;

/**
 * Longest frame gap treated as elapsed time.
 *
 * A backgrounded tab delivers no animation frames, so the first frame after it
 * returns can be minutes later. Both terms below scale with elapsed time, so
 * without this the edge would take one enormous step; capped, it recovers over
 * the following second or two instead. The anchor is the truth here and the
 * filter converges on it regardless, so under-counting elapsed time costs
 * nothing.
 */
const MAX_ELAPSED_SECONDS = 1;

/**
 * Advances the smoothed edge one frame.
 *
 * Pure, so the properties above are checkable without a browser or a clock.
 *
 * @param state - the previous result, or null to start at the anchor
 * @param anchor - `max(currentTime, latestKnownEndTime)`, the true edge
 * @param nowMs - a monotonic millisecond clock (performance.now)
 */
export function advanceLiveEdge(
  state: LiveEdgeState | null,
  anchor: number,
  nowMs: number,
): LiveEdgeState {
  if (!Number.isFinite(anchor)) {
    // Nothing to track. Hold what we had rather than let a NaN reach every
    // segment's position and blank the bar.
    return state ?? { edge: 0, atMs: nowMs };
  }

  if (!state || !Number.isFinite(state.edge) || !Number.isFinite(state.atMs)) {
    return { edge: anchor, atMs: nowMs };
  }

  const error = anchor - state.edge;

  if (Math.abs(error) > SNAP_SECONDS) {
    return { edge: anchor, atMs: nowMs };
  }

  // Floored at zero so a clock that jumps backwards stalls the glide for a
  // frame rather than dragging the edge back with it.
  const elapsed = Math.min(
    MAX_ELAPSED_SECONDS,
    Math.max(0, (nowMs - state.atMs) / 1000),
  );
  // Written as an exponential rather than `error * k` so the result does not
  // depend on the frame rate: two 8ms frames move the edge as far as one 16ms
  // frame.
  const correction = error * (1 - Math.exp(-elapsed / TIME_CONSTANT_SECONDS));

  return {
    edge: Math.max(state.edge, state.edge + elapsed + correction),
    atMs: nowMs,
  };
}

/** Whether the viewer has asked for less animation. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

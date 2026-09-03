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
import { advanceLiveEdge, type LiveEdgeState } from './liveEdgeClock';

const FRAME_MS = 1000 / 60;

/** Runs the clock at 60fps against an anchor that may change, keeping every step. */
function run(
  state: LiveEdgeState | null,
  frames: number,
  anchorAt: (seconds: number) => number,
  startMs = 0,
) {
  const edges: number[] = [];
  let current = state;

  for (let frame = 0; frame < frames; frame += 1) {
    const atMs = startMs + frame * FRAME_MS;
    current = advanceLiveEdge(current, anchorAt((atMs - startMs) / 1000), atMs);
    edges.push(current.edge);
  }

  return { state: current as LiveEdgeState, edges };
}

/** Per-frame movement, which is what smoothness actually means here. */
const steps = (edges: readonly number[]) =>
  edges.slice(1).map((edge, index) => edge - edges[index]);

/** A staircase: holds for `segment` seconds, then jumps by `segment`. */
const staircase = (from: number, segment: number) => (seconds: number) =>
  from + Math.floor(seconds / segment) * segment;

describe('advanceLiveEdge', () => {
  it('starts at the anchor rather than gliding up to it', () => {
    // A first frame that eased in from zero would sweep the whole window.
    expect(advanceLiveEdge(null, 1_788_368_400, 1000)).toEqual({
      edge: 1_788_368_400,
      atMs: 1000,
    });
  });

  describe('against the staircase anchor, which is the case it exists for', () => {
    // 3.84s segments, as the WDR feed produces. Ten seconds of frames.
    const anchorAt = staircase(1_788_368_400, 3.84);
    const { edges } = run(advanceLiveEdge(null, anchorAt(0), 0), 600, anchorAt);
    const movement = steps(edges);

    it('never stops', () => {
      // The property that matters. The anchor holds still for 3.84s at a time;
      // if the edge did too, the bar would stop and start twice per segment,
      // which is the stutter being removed. Compared against a third of a
      // nominal frame's worth of stream time.
      const nominal = FRAME_MS / 1000;

      expect(Math.min(...movement)).toBeGreaterThan(nominal / 3);
    });

    it('never jumps', () => {
      // And no step is more than about twice nominal, so there is no lurch
      // either. Before this existed the step was a whole segment.
      expect(Math.max(...movement)).toBeLessThan((FRAME_MS / 1000) * 2.1);
    });

    it('keeps pace with the anchor over a long run', () => {
      // The smoothing must not accumulate drift: over a minute the edge has to
      // cover the same ground the anchor did. Measured against the anchor's own
      // movement rather than against wall time, because the staircase itself
      // trails wall time by up to a segment at any instant.
      const long = run(advanceLiveEdge(null, anchorAt(0), 0), 3600, anchorAt);
      const anchorMoved = anchorAt((3599 * FRAME_MS) / 1000) - anchorAt(0);
      const edgeMoved = long.edges[long.edges.length - 1] - long.edges[0];

      expect(edgeMoved - anchorMoved).toBeLessThan(3.84);
      expect(edgeMoved).toBeGreaterThan(anchorMoved);
    });

    it('stays within a segment of the true edge', () => {
      const worst = Math.max(
        ...edges.map((edge, index) => Math.abs(anchorAt((index * FRAME_MS) / 1000) - edge)),
      );

      expect(worst).toBeLessThan(3.84);
    });
  });

  it('settles exactly on an anchor that advances continuously', () => {
    // Where the anchor is `currentTime` rather than a verdict end - a stream
    // playing normally with the gate holding it at the newest verdict. The
    // error decays to zero, so the edge is the live edge.
    const anchorAt = (seconds: number) => 100 + seconds;
    const { state } = run(advanceLiveEdge(null, 100, 0), 900, anchorAt);

    // Within a frame's worth of stream time, which is as exact as anything
    // sampled once per frame can be.
    expect(Math.abs(state.edge - anchorAt((899 * FRAME_MS) / 1000))).toBeLessThan(FRAME_MS / 1000);
  });

  it('coasts to a stop a bounded distance past an anchor that stops', () => {
    // Validation stalls: the anchor freezes. The edge drifts on for one time
    // constant's worth and halts, leaving a small grey band at the right that
    // says nothing has been validated recently - rather than either freezing
    // dead or rolling the history away.
    const { state, edges } = run(advanceLiveEdge(null, 100, 0), 1800, () => 100);

    expect(state.edge).toBeGreaterThan(103);
    expect(state.edge).toBeLessThan(105);
    // And it got there smoothly, not in one step.
    expect(Math.max(...steps(edges))).toBeLessThan(0.02);
  });

  it('never rolls backwards when the anchor drops', () => {
    // Playback held by the validation gate stops advancing `currentTime`, so
    // `max(currentTime, newestVerdictEnd)` can fall below where the edge
    // already is. History must not be seen to rewind.
    const ahead = run(advanceLiveEdge(null, 100, 0), 600, () => 104);
    const after = run(ahead.state, 300, () => 99, 10_000);

    expect(Math.min(...steps(after.edges))).toBeGreaterThanOrEqual(0);
    expect(after.state.edge).toBeGreaterThanOrEqual(ahead.state.edge);
  });

  it('snaps across a discontinuity instead of crawling', () => {
    // A rejoin, a seek, or a source change between a zero-based and an
    // epoch-based timeline.
    expect(advanceLiveEdge({ edge: 40, atMs: 0 }, 1_788_368_400, 16).edge).toBe(1_788_368_400);
    // Backwards too: a new, shorter source.
    expect(advanceLiveEdge({ edge: 1_788_368_400, atMs: 0 }, 12, 16).edge).toBe(12);
  });

  it('glides a gap just inside the threshold and snaps just outside it', () => {
    expect(advanceLiveEdge({ edge: 100, atMs: 0 }, 129, 16).edge).toBeLessThan(101);
    expect(advanceLiveEdge({ edge: 100, atMs: 0 }, 131, 16).edge).toBe(131);
  });

  it('recovers a lag rather than carrying it forever', () => {
    // A lag means the newest verdicts sit past the right edge, clipped out of
    // sight. Ten seconds behind an anchor that is itself advancing: closed.
    const anchorAt = (seconds: number) => 110 + seconds;
    const { state } = run({ edge: 100, atMs: 0 }, 1200, anchorAt);

    // Ten seconds of lag down to well under one.
    expect(Math.abs(state.edge - anchorAt((1199 * FRAME_MS) / 1000))).toBeLessThan(0.2);
  });

  it('takes one bounded step after a backgrounded tab, not one enormous one', () => {
    // No animation frames are delivered while a tab is hidden, so the first
    // frame back can be minutes later.
    const state: LiveEdgeState = { edge: 100, atMs: 0 };

    expect(advanceLiveEdge(state, 104, 600_000).edge).toBeLessThan(102);
  });

  it('stalls for a frame on a clock that jumps backwards', () => {
    // Rather than dragging the edge back with it.
    expect(advanceLiveEdge({ edge: 100, atMs: 5000 }, 104, 4000).edge).toBe(100);
  });

  it('holds the last edge rather than propagating an unusable anchor', () => {
    // A NaN here would reach every segment's `left` and blank the bar.
    const state: LiveEdgeState = { edge: 100, atMs: 0 };

    expect(advanceLiveEdge(state, Number.NaN, 16)).toEqual(state);
    expect(advanceLiveEdge(state, Number.POSITIVE_INFINITY, 16)).toEqual(state);
  });

  it('re-seeds from an unusable previous state', () => {
    expect(advanceLiveEdge({ edge: Number.NaN, atMs: 0 }, 104, 16).edge).toBe(104);
  });
});

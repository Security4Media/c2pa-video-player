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

import type { TimeInterval } from '../types';

/**
 * Whether the element is genuinely playing, as opposed to merely having a
 * playhead somewhere. Scrubbing and stepping through a paused video both move
 * the playhead without playing, and dragging the scrubber across an asset must
 * not mark it read. `ended` counts as not playing so a finished asset stops
 * accumulating.
 */
export function isActuallyPlaying(videoElement: HTMLVideoElement): boolean {
  return !videoElement.paused && !videoElement.seeking && !videoElement.ended;
}

/**
 * Largest playhead advance still treated as continuous playback. Position is
 * sampled a few times a second, so a normal step is a fraction of this even at
 * increased playback rates; anything bigger is a seek, or a stall long enough
 * that we can't claim the gap was watched. Erring small is deliberate - it
 * leaves a thin unpainted sliver at worst, whereas erring large would claim
 * skipped content as read, which is the whole bug this guards against.
 */
const MAX_CONTINUOUS_ADVANCE_SECONDS = 1.5;

/**
 * Record of the parts of an asset playback has actually traversed.
 *
 * Needed because a playhead position alone cannot express this: after seeking
 * from 5s to 60s the playhead is past everything before 60s, but almost none of
 * it was watched. Only genuine playback counts - the playhead also moves while
 * scrubbing or stepping through a paused video, and dragging the scrubber
 * across an asset must not mark it read.
 *
 * Intervals are kept sorted, disjoint and merged, so the count is bounded by
 * the number of discontinuities rather than by duration.
 */
export class WatchedTimeline {
  #intervals: TimeInterval[] = [];
  #lastTime: number | null = null;

  /**
   * Feed the current playhead once per update.
   *
   * `isPlaying` gates accumulation but not tracking: a position reached while
   * paused or seeking still becomes the anchor for the next stretch of real
   * playback, so resuming after a seek measures from where it resumed rather
   * than bridging the jump.
   */
  observePlayhead(time: number, isPlaying: boolean): void {
    if (!Number.isFinite(time) || time < 0) {
      return;
    }

    const previous = this.#lastTime;
    this.#lastTime = time;

    if (!isPlaying) {
      return;
    }

    if (previous === null) {
      // First playing sample. Starting from (near) the beginning means the
      // opening moments really were played, so claim them; joining further in
      // claims nothing and simply anchors here.
      if (time <= MAX_CONTINUOUS_ADVANCE_SECONDS) {
        this.#add(0, time);
      }

      return;
    }

    // Backward or stationary: no new ground covered.
    if (time <= previous) {
      return;
    }

    // Too big a step to be playback - a seek, or a stall we can't vouch for.
    if (time - previous > MAX_CONTINUOUS_ADVANCE_SECONDS) {
      return;
    }

    this.#add(previous, time);
  }

  /**
   * The parts of `[startTime, endTime)` that were watched - zero, one, or
   * several disjoint pieces (watching the start and end of a segment but
   * skipping its middle yields two).
   */
  intersect(startTime: number, endTime: number): TimeInterval[] {
    if (!(endTime > startTime)) {
      return [];
    }

    const overlaps: TimeInterval[] = [];

    this.#intervals.forEach((watched) => {
      const start = Math.max(watched.startTime, startTime);
      const end = Math.min(watched.endTime, endTime);

      if (end > start) {
        overlaps.push({ startTime: start, endTime: end });
      }
    });

    return overlaps;
  }

  /** Watched intervals, for inspection and tests. */
  snapshot(): TimeInterval[] {
    return this.#intervals.map((interval) => ({ ...interval }));
  }

  #add(startTime: number, endTime: number): void {
    this.#intervals.push({ startTime, endTime });
    this.#intervals.sort((left, right) => left.startTime - right.startTime);

    const merged: TimeInterval[] = [];

    this.#intervals.forEach((interval) => {
      const previous = merged[merged.length - 1];

      if (previous && interval.startTime <= previous.endTime) {
        previous.endTime = Math.max(previous.endTime, interval.endTime);
        return;
      }

      merged.push({ ...interval });
    });

    this.#intervals = merged;
  }
}

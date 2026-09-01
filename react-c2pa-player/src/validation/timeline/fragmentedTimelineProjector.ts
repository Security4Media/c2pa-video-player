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

import type {
  ManifestSource,
  PlayerValidationState,
  ValidationTimelineSegment,
} from '../types';

// Segments observed more than this far behind the latest-known time are
// evicted, but only for confirmed-live sources (see `setLiveMode`) - a VOD
// asset's duration is finite and bounded, so nothing needs to expire. This is
// the same 600s value as `runtimes/dashBridgeRuntime.ts`'s
// `SEGMENT_RETENTION_WINDOW_SECONDS`, which bounds a different list (that
// runtime's own point-lookup segments) - kept as an independent constant here
// rather than importing across the timeline/ -> runtimes/ boundary.
const DEFAULT_LIVE_SEGMENT_RETENTION_WINDOW_SECONDS = 15 * 60;

// Tolerance for treating two segments as touching/contiguous rather than
// leaving a hairline gap between them, e.g. from floating-point rounding.
const MERGE_EPSILON_SECONDS = 0.001;

/**
 * Builds the seek-bar's per-fragment validation timeline from a stream of
 * `observe()` calls. Both adapters report real fragment boundaries: DASH as
 * each segment validates, HLS by enumerating the fragments its bridge has
 * already validated (see `runtimes/hlsBridgeRuntime.ts#getFragmentVerdicts`).
 * Callers holding only a playhead sample may omit `startTime`.
 *
 * Backward-time observations are handled differently depending on
 * `setLiveMode`:
 * - Live sources keep the original behavior: a backward observation wipes
 *   the whole known timeline (`#resetOnBackwardSeek`). This class doesn't
 *   change anything about the already-shipped live-streaming experience.
 * - VOD sources (or sources whose live/VOD-ness isn't known yet) never wipe:
 *   a backward observation is upserted into the existing timeline instead,
 *   so previously-validated regions keep their color no matter where
 *   playback seeks to. The underlying content at a given VOD timestamp never
 *   changes, so there's never a reason to forget it.
 */
export class FragmentedTimelineProjector {
  #segments: ValidationTimelineSegment[] = [];
  #lastObservedTime = 0;
  #isLive = false;

  /**
   * Informs the projector whether the source being observed is a confirmed
   * live/dynamic stream. Defaults to `false` (same handling as VOD) until a
   * caller has an actual signal - live/VOD detection (dash.js `isDynamic()`,
   * hls.js `LEVEL_LOADED`) resolves early, well before the first segment
   * validation matters, so there's no meaningful window where guessing wrong
   * would lose data.
   */
  #retentionWindowSeconds = DEFAULT_LIVE_SEGMENT_RETENTION_WINDOW_SECONDS;

  setLiveMode(isLive: boolean, retentionSeconds?: number): void {
    if (retentionSeconds !== undefined && retentionSeconds > 0) {
      this.#retentionWindowSeconds = retentionSeconds;
    }

    this.#isLive = isLive;
  }

  observe(
    time: number,
    validationState: PlayerValidationState,
    startTime?: number,
    manifestRef?: ManifestSource
  ): void {
    if (!Number.isFinite(time)) {
      return;
    }

    const isBackward = time < this.#lastObservedTime;

    if (isBackward && this.#isLive) {
      this.#resetOnBackwardSeek(time);
    }

    const hasExplicitStart = typeof startTime === 'number' && Number.isFinite(startTime);
    const resolvedStartTime = hasExplicitStart
      ? startTime
      : this.#segments.length === 0
        ? 0
        // Forward/no-op move: unchanged fallback (extend from where the last
        // observation left off). Backward move with no explicit boundary
        // (a bare playhead sample): collapse to a point rather than
        // fabricating a wide interval back to #lastObservedTime, which would
        // misrepresent an unvisited gap as known.
        : isBackward
          ? time
          : this.#lastObservedTime;

    const safeStart = Math.min(resolvedStartTime, time);
    const safeEnd = Math.max(resolvedStartTime, time);
    const lastSegment = this.#segments[this.#segments.length - 1];

    // Fast path: this observation only extends past the chronologically-latest
    // segment's current end - ordinary forward playback ticks, or the next
    // contiguous fragment arriving. Cheap, no need to scan/rebuild the array.
    // The `safeEnd >= lastSegment.endTime` check rules out a correction that
    // lands *inside* the last segment's existing range (e.g. re-validating a
    // fragment already covered, after a VOD backward seek) - that needs real
    // splitting, not a blind append, so it falls through to the general
    // upsert below instead.
    if (
      lastSegment &&
      safeStart >= lastSegment.startTime &&
      safeStart <= lastSegment.endTime + MERGE_EPSILON_SECONDS &&
      safeEnd >= lastSegment.endTime
    ) {
      if (lastSegment.validationState === validationState) {
        lastSegment.endTime = Math.max(lastSegment.endTime, safeEnd);

        if (manifestRef) {
          lastSegment.manifestRef = manifestRef;
        }
      } else {
        this.#segments.push({
          startTime: safeStart,
          endTime: safeEnd,
          validationState,
          manifestRef,
        });
      }
    } else {
      this.#segments = upsertInterval(this.#segments, {
        startTime: safeStart,
        endTime: safeEnd,
        validationState,
        manifestRef,
      });
    }

    this.#lastObservedTime = time;

    if (this.#isLive) {
      this.#pruneStaleSegments();
    }
  }

  snapshot(): ValidationTimelineSegment[] {
    return this.#segments.map((segment) => ({ ...segment }));
  }

  #resetOnBackwardSeek(time: number): void {
    this.#segments = [];
    this.#lastObservedTime = Math.max(0, time);
  }

  /**
   * Evicts segments older than `this.#retentionWindowSeconds`
   * relative to the latest observed time. Only called while `#isLive` is
   * true - a VOD asset's duration is finite and known, so nothing needs to
   * expire, and doing so anyway would reintroduce the exact class of bug this
   * projector exists to avoid.
   */
  #pruneStaleSegments(): void {
    const cutoff = this.#lastObservedTime - this.#retentionWindowSeconds;

    while (this.#segments.length > 1 && this.#segments[0].endTime < cutoff) {
      this.#segments.shift();
    }
  }
}

/**
 * Inserts one interval into the sorted, non-overlapping `segments` array:
 * trims or splits any existing segment(s) that overlap `newSegment`'s range
 * (a segment fully covered by `newSegment` contributes nothing; a segment
 * only partially overlapping keeps its non-overlapping remainder), inserts
 * `newSegment` at its sorted position, then merges the result back down
 * through `mergeSegments` (a same-state re-observation of an already-known
 * range collapses straight back into one run).
 *
 * Not on the per-tick hot path (see the fast path in `observe()`) - this only
 * runs for the first observation, a backward point-insert, or a genuine
 * out-of-order/overlapping correction, none of which happen every frame.
 */
function upsertInterval(
  segments: ValidationTimelineSegment[],
  newSegment: ValidationTimelineSegment
): ValidationTimelineSegment[] {
  const result: ValidationTimelineSegment[] = [];
  let inserted = false;

  segments.forEach((existing) => {
    const entirelyBefore = existing.endTime <= newSegment.startTime;
    const entirelyAfter = existing.startTime >= newSegment.endTime;

    if (entirelyBefore || entirelyAfter) {
      if (!inserted && entirelyAfter) {
        result.push(newSegment);
        inserted = true;
      }

      result.push({ ...existing });
      return;
    }

    // Real overlap: keep only the non-overlapping remainder(s) of `existing`.
    if (existing.startTime < newSegment.startTime) {
      result.push({ ...existing, endTime: newSegment.startTime });
    }

    if (!inserted) {
      result.push(newSegment);
      inserted = true;
    }

    if (existing.endTime > newSegment.endTime) {
      result.push({ ...existing, startTime: newSegment.endTime });
    }
  });

  if (!inserted) {
    // newSegment starts after every existing segment.
    result.push(newSegment);
  }

  return mergeSegments(result);
}

function mergeSegments(segments: ValidationTimelineSegment[]): ValidationTimelineSegment[] {
  // Copied before sorting rather than Array.toSorted, which needs lib es2023
  // while this project emits es2020; the copy is what matters here anyway.
  const sortedSegments = [...segments].sort((left, right) => left.startTime - right.startTime);
  const merged: ValidationTimelineSegment[] = [];

  sortedSegments.forEach((segment) => {
    const previous = merged[merged.length - 1];

    if (!previous) {
      merged.push({ ...segment });
      return;
    }

    const overlaps = segment.startTime <= previous.endTime + MERGE_EPSILON_SECONDS;
    const sameState = segment.validationState === previous.validationState;

    if (overlaps && sameState) {
      previous.endTime = Math.max(previous.endTime, segment.endTime);

      if (segment.manifestRef) {
        previous.manifestRef = segment.manifestRef;
      }

      return;
    }

    merged.push({ ...segment });
  });

  return merged;
}

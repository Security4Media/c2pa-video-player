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
 * Which parts of a live stream's verdicts have settled, and which are still
 * provisional.
 *
 * On VOD the rule is simple and lives in readRegionGate.ts: a verdict is shown
 * only for the stretch playback actually read, because a prefetching player
 * knows the verdict for the whole asset within seconds and painting all of it
 * would claim unwatched content as checked.
 *
 * Live needs a third state. Segments arrive in real time, so showing them as
 * they are validated is the point of a monitoring bar - but until playback
 * reaches one, "validated" is not the same claim as "validated and shown to a
 * viewer". So an unread segment is *provisional*: present, but marked.
 *
 * A provisional segment settles in one of two ways:
 *
 *  - playback reaches it, the ordinary case; or
 *  - it falls out of the DVR window, after which it can never be played. The
 *    distinction it was carrying has nothing left to express, so it settles at
 *    its verdict rather than staying dimmed for the rest of the session.
 *
 * The second rule is what makes a paused or delayed player resolve itself
 * instead of accumulating a permanent band of provisional segments behind the
 * live edge.
 */

import type { TimeInterval } from '../types';
import type { ReadRegion, SegmentVerdict } from './readRegionGate';
import type { WatchedTimeline } from './watchedTimeline';

/** A verdict region, and whether its claim has settled. */
export interface LiveRegion<TSource extends SegmentVerdict = SegmentVerdict>
  extends ReadRegion<TSource> {
  /**
   * False while the segment is validated but not yet played and still
   * playable. The timeline renders these dimmed.
   */
  settled: boolean;
}

/** Sorts, merges and returns disjoint intervals. */
function normalize(intervals: readonly TimeInterval[]): TimeInterval[] {
  const sorted = intervals
    .filter((interval) => interval.endTime > interval.startTime)
    .sort((left, right) => left.startTime - right.startTime);
  const merged: TimeInterval[] = [];

  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1];

    if (previous && interval.startTime <= previous.endTime) {
      previous.endTime = Math.max(previous.endTime, interval.endTime);
      return;
    }

    merged.push({ ...interval });
  });

  return merged;
}

/**
 * Severity order, for deciding which verdict shows where two overlap.
 *
 * Invalid first, then Unknown: an unverified stretch is a weaker claim than a
 * verified one, so it must not be hidden behind a neighbour's Valid.
 */
const SEVERITY: Record<string, number> = { Invalid: 3, Unknown: 2, Valid: 1, Trusted: 0 };

/**
 * Collapses overlapping provisional regions into disjoint ones, worst verdict
 * winning where they disagree.
 *
 * Needed because two verdicts can cover the same stretch of stream - a live
 * segment re-requested after a retry or a rendition change is validated twice,
 * and both verdicts describe the same time range. Without this the bar stacked
 * two identical dimmed regions on top of each other, measured on the live feed
 * as pairs at 93.6-99.4% and 99.9-100%.
 *
 * The settled path needs no equivalent: those regions go through the
 * projector, whose upsert already resolves overlap.
 */
function collapse<TSource extends SegmentVerdict>(
  regions: readonly LiveRegion<TSource>[],
): LiveRegion<TSource>[] {
  if (regions.length < 2) {
    return [...regions];
  }

  // Sweep the boundaries, and for each span between two of them keep the worst
  // verdict covering it. Adjacent spans with the same verdict then merge.
  const edges = [...new Set(regions.flatMap((r) => [r.startTime, r.endTime]))].sort((a, b) => a - b);
  const spans: LiveRegion<TSource>[] = [];

  for (let i = 0; i < edges.length - 1; i += 1) {
    const startTime = edges[i];
    const endTime = edges[i + 1];
    const covering = regions.filter((r) => r.startTime < endTime && r.endTime > startTime);

    if (covering.length === 0) {
      continue;
    }

    const worst = covering.reduce((chosen, candidate) =>
      (SEVERITY[candidate.validationState] ?? 0) > (SEVERITY[chosen.validationState] ?? 0)
        ? candidate
        : chosen,
    );
    const previous = spans[spans.length - 1];

    if (
      previous &&
      previous.endTime === startTime &&
      previous.validationState === worst.validationState
    ) {
      previous.endTime = endTime;
      continue;
    }

    spans.push({ ...worst, startTime, endTime });
  }

  return spans;
}

/** `whole` minus every part of `covered`, as disjoint intervals. */
function subtract(whole: TimeInterval, covered: readonly TimeInterval[]): TimeInterval[] {
  const gaps: TimeInterval[] = [];
  let cursor = whole.startTime;

  normalize(covered).forEach((interval) => {
    if (interval.startTime > cursor) {
      gaps.push({ startTime: cursor, endTime: Math.min(interval.startTime, whole.endTime) });
    }

    cursor = Math.max(cursor, interval.endTime);
  });

  if (cursor < whole.endTime) {
    gaps.push({ startTime: cursor, endTime: whole.endTime });
  }

  return gaps.filter((gap) => gap.endTime > gap.startTime);
}

/**
 * Splits each verdict into settled and provisional regions.
 *
 * @param verdicts - every segment validated so far, played or not
 * @param watched - the record of what playback actually read
 * @param settledBefore - the time before which content can no longer be
 *   played, so anything earlier settles whether it was read or not. Pass
 *   `-Infinity` to settle nothing on age alone.
 */
export function selectLiveRegions<TSource extends SegmentVerdict>(
  verdicts: readonly TSource[],
  watched: WatchedTimeline,
  settledBefore: number,
): LiveRegion<TSource>[] {
  const regions: LiveRegion<TSource>[] = [];
  const provisional: LiveRegion<TSource>[] = [];

  verdicts.forEach((verdict) => {
    const { startTime, endTime } = verdict;

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
      return;
    }

    // Read, plus anything now beyond reach - the two ways a claim settles.
    const agedEnd = Math.min(endTime, settledBefore);
    const settled = normalize([
      ...watched.intersect(startTime, endTime),
      ...(agedEnd > startTime ? [{ startTime, endTime: agedEnd }] : []),
    ]);

    settled.forEach((interval) => {
      regions.push({
        startTime: interval.startTime,
        endTime: interval.endTime,
        validationState: verdict.validationState,
        source: verdict,
        settled: true,
      });
    });

    subtract({ startTime, endTime }, settled).forEach((interval) => {
      provisional.push({
        startTime: interval.startTime,
        endTime: interval.endTime,
        validationState: verdict.validationState,
        source: verdict,
        settled: false,
      });
    });
  });

  return [...regions, ...collapse(provisional)];
}

/**
 * The time before which a live stream can no longer be played.
 *
 * Deliberately not `videoElement.seekable.start`: measured on a paused live
 * stream, dash.js stops refreshing the manifest entirely and the whole seekable
 * range freezes - so the one signal that has to keep advancing for a paused
 * player to resolve itself is the one that stops. The live edge is taken from
 * the newest verdict instead, and only the *width* of the seekable range is
 * read from the element, which is stable.
 *
 * Returns `-Infinity` when there is nothing to go on, which settles nothing on
 * age and leaves the read record as the only rule.
 */
export function resolveSettledBefore(liveEdge: number, dvrDepthSeconds: number): number {
  if (!Number.isFinite(liveEdge) || !Number.isFinite(dvrDepthSeconds) || dvrDepthSeconds <= 0) {
    return Number.NEGATIVE_INFINITY;
  }

  return liveEdge - dvrDepthSeconds;
}

/** The width of the element's seekable range, or null when it has none yet. */
export function readDvrDepthSeconds(videoElement: {
  seekable?: { length: number; start(index: number): number; end(index: number): number };
}): number | null {
  const seekable = videoElement.seekable;

  if (!seekable || seekable.length === 0) {
    return null;
  }

  const depth = seekable.end(seekable.length - 1) - seekable.start(0);

  return Number.isFinite(depth) && depth > 0 ? depth : null;
}

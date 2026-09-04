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

import type { PlayerValidationState } from '../types';
import type { WatchedTimeline } from './watchedTimeline';

/**
 * A verdict a validator has produced for one segment of the asset, independent
 * of whether playback has reached it yet.
 */
export interface SegmentVerdict {
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
}

/** A verdict narrowed to a stretch of its segment that was actually read. */
export interface ReadRegion<TSource extends SegmentVerdict = SegmentVerdict> {
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
  /**
   * The verdict this region came from. Carried through rather than left to the
   * caller to match up by index: one verdict can yield several regions (or
   * none), so output positions do not correspond to input positions.
   */
  source: TSource;
}

/**
 * Narrows validator output to what playback has actually read.
 *
 * Both fragmented adapters learn a segment's verdict well before the viewer
 * watches it: hls.js prefetches aggressively (a small VOD asset is often fully
 * downloaded and validated within seconds), and the DASH plugin validates each
 * segment as it downloads. Projecting those verdicts as they arrive paints the
 * whole bar almost immediately, which misrepresents unwatched content as
 * verified.
 *
 * The verdict is therefore intersected with the watched record rather than
 * compared against the playhead. A playhead alone cannot express this: after
 * seeking from 5s to 60s it sits past every earlier segment, though almost
 * none of that was played. Intersecting also means a segment watched only in
 * part is coloured only in part, and a segment watched in two separate sittings
 * yields two coloured pieces with grey between them.
 */
export function selectReadRegions<TSource extends SegmentVerdict>(
  verdicts: TSource[],
  watched: WatchedTimeline,
): ReadRegion<TSource>[] {
  return verdicts
    .filter(
      (verdict) =>
        Number.isFinite(verdict.startTime) &&
        Number.isFinite(verdict.endTime) &&
        verdict.endTime > verdict.startTime,
    )
    .flatMap((verdict) =>
      watched.intersect(verdict.startTime, verdict.endTime).map((piece) => ({
        startTime: piece.startTime,
        endTime: piece.endTime,
        validationState: verdict.validationState,
        source: verdict,
      })),
    );
}

/**
 * Stable identity for a read region, used to skip re-projecting work that
 * hasn't changed. Includes the bounds and the verdict, so a fully-read segment
 * settles on one key and stops being re-observed, the region currently growing
 * refreshes as playback extends it, and any segment whose verdict is later
 * revised is re-observed.
 */
export function readRegionKey(region: ReadRegion<SegmentVerdict>): string {
  return `${region.startTime}-${region.endTime}-${region.validationState}`;
}

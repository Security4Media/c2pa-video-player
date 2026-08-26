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

/**
 * A verdict a validator has produced for one segment of the asset, independent
 * of whether playback has reached it yet.
 */
export interface SegmentVerdict {
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
}

/** A verdict narrowed to the part of its segment that has actually been read. */
export interface ReadRegion<TSource extends SegmentVerdict = SegmentVerdict>
  extends SegmentVerdict {
  /** The verdict's own, unclipped end - used to tell "fully read" from "in progress". */
  segmentEndTime: number;
  /**
   * The verdict this region came from. Carried through rather than left to the
   * caller to match up by index: the gate filters, so output positions do not
   * correspond to input positions.
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
 * So a verdict is only surfaced once the playhead has entered its segment, and
 * its end is clipped to the playhead: the segment currently being watched
 * colours progressively, and nothing is ever coloured ahead of the playhead.
 * A verdict is dropped entirely (rather than clipped to nothing) until playback
 * actually reaches it.
 */
export function selectReadRegions<TSource extends SegmentVerdict>(
  verdicts: TSource[],
  playhead: number,
): ReadRegion<TSource>[] {
  if (!Number.isFinite(playhead) || playhead <= 0) {
    return [];
  }

  return verdicts
    .filter(
      (verdict) =>
        Number.isFinite(verdict.startTime) &&
        Number.isFinite(verdict.endTime) &&
        verdict.endTime > verdict.startTime &&
        // Strictly greater: a segment the playhead has not entered yet has
        // been validated but not read, and must stay grey.
        playhead > verdict.startTime,
    )
    .map((verdict) => ({
      startTime: verdict.startTime,
      endTime: Math.min(verdict.endTime, playhead),
      segmentEndTime: verdict.endTime,
      validationState: verdict.validationState,
      source: verdict,
    }));
}

/**
 * Stable identity for a read region, used to skip re-projecting work that
 * hasn't changed. Includes the clipped end and the verdict, so a fully-read
 * segment settles on one key and stops being re-observed, while the
 * in-progress one refreshes as the playhead advances and any segment whose
 * verdict is later revised is re-observed.
 */
export function readRegionKey(region: ReadRegion<SegmentVerdict>): string {
  return `${region.startTime}-${region.endTime}-${region.validationState}`;
}

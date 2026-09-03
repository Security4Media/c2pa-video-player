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
 * The verdict for the moment being played right now.
 *
 * Nothing answered this before. `snapshot.result.validationState` looks like it
 * does and does not: HLS keeps the previous result when a lookup misses
 * (hlsSession.ts) and DASH reports the newest verdict for any time past its
 * last known segment (dashBridgeRuntime.ts). Both are reasonable answers to
 * "the nearest verdict we have", and both are wrong for "what is on screen",
 * which is what a label over the picture has to say. So this reads the timeline
 * segments directly, the same values the bar is painted from, and reports
 * nothing rather than guessing.
 *
 * Two things about the data shape drive the whole implementation.
 *
 * **Read regions are clipped at the playhead.** For HLS, `selectReadRegions`
 * intersects verdicts with the watched record, which extends only as far as the
 * last *playing* sample. So the newest region's `endTime` sits at or just
 * behind `currentTime`, and a strict `time >= start && time < end` test finds
 * nothing at the playhead - permanently, while paused. Hence the tolerance
 * below. Without it there would simply never be a label on HLS.
 *
 * **An invalid stretch is one segment on HLS and several on DASH.** The
 * projector merges contiguous same-verdict regions; the DASH session
 * deliberately does not, so that each fragment keeps its own metadata. The
 * start of a run therefore cannot be read off the covering segment; it has to
 * be walked back through its neighbours.
 */

import type { PlayerValidationState, ValidationTimelineSegment } from '@/lib/validation';
import { worstValidationState } from '@/lib/validation/timeline';

/**
 * How far behind the playhead a segment may end and still count as covering it.
 *
 * The clipping described above puts the newest region's end at the playhead, so
 * without slack the answer at the playhead is always "nothing". Half a second
 * matches the tolerance `validatedPlaybackGate.ts` uses, and for the same
 * underlying reason: position is sampled a few times a second against float
 * bounds, so exact comparisons at a boundary are a coin toss.
 */
const VERDICT_TOLERANCE_SECONDS = 0.5;

/**
 * How large a gap between two invalid segments still counts as one run.
 *
 * On DASH an invalid stretch is a row of separate segments, and their bounds
 * come from fragment timing, so a sub-second gap between two of them is a
 * rounding artefact rather than a return to good content. Treating it as a
 * return would end the run and, with the consent gate on, ask the viewer twice
 * about one episode of tampering.
 */
const RUN_CONTIGUITY_TOLERANCE_SECONDS = 0.5;

export interface PlayheadVerdictInputs {
  segments: readonly ValidationTimelineSegment[] | undefined;
  time: number;
  /**
   * Whether the adapter reports per-fragment segments at all. A monolithic MP4
   * does not: it has one verdict for the whole asset, so the answer comes from
   * `fallbackState` instead.
   */
  ownsTimeline: boolean;
  /** The source's own credentials failed, which condemns every moment of it. */
  wholeAssetInvalid: boolean;
  /** The whole-asset verdict, for sources with no timeline of their own. */
  fallbackState: PlayerValidationState | null;
}

export interface PlayheadVerdict {
  /**
   * `null` means no verdict covers this moment: show nothing, ask nothing.
   * Distinct from `'Unknown'`, which means something looked and found nothing.
   */
  state: PlayerValidationState | null;
  /** The segment the verdict came from, for opening the menu on it. */
  segment: ValidationTimelineSegment | null;
  /**
   * Start of the contiguous invalid stretch containing this moment, or null
   * when it is not invalid. This is the identity of a "run", which is what the
   * consent gate asks about once.
   *
   * `-Infinity` for a condemned asset, whose single run has no start.
   */
  invalidRunStart: number | null;
  reason:
    | 'whole-asset-invalid'
    | 'no-timeline'
    | 'covering'
    | 'at-boundary'
    | 'segment-pending'
    | 'no-segment'
    | 'unusable-time';
}

const usable = (segment: ValidationTimelineSegment) =>
  Number.isFinite(segment.startTime) &&
  Number.isFinite(segment.endTime) &&
  segment.endTime >= segment.startTime;

/**
 * Walks back over contiguous invalid neighbours to find where the run began.
 *
 * `sorted` is ascending by start time, and `index` is the covering segment.
 */
function invalidRunStart(
  sorted: readonly ValidationTimelineSegment[],
  index: number,
): number {
  let start = sorted[index].startTime;

  for (let position = index - 1; position >= 0; position -= 1) {
    const candidate = sorted[position];

    if (candidate.validationState !== 'Invalid') {
      break;
    }

    if (candidate.endTime < start - RUN_CONTIGUITY_TOLERANCE_SECONDS) {
      break;
    }

    start = Math.min(start, candidate.startTime);
  }

  return start;
}

export function selectPlayheadVerdict(inputs: PlayheadVerdictInputs): PlayheadVerdict {
  const { segments, time, ownsTimeline, wholeAssetInvalid, fallbackState } = inputs;

  // A broken manifest condemns every moment, and it is knowable before any
  // segment arrives, so it answers first.
  if (wholeAssetInvalid) {
    return {
      state: 'Invalid',
      segment: null,
      invalidRunStart: Number.NEGATIVE_INFINITY,
      reason: 'whole-asset-invalid',
    };
  }

  if (!ownsTimeline) {
    return {
      state: fallbackState,
      segment: null,
      invalidRunStart:
        fallbackState === 'Invalid' ? Number.NEGATIVE_INFINITY : null,
      reason: 'no-timeline',
    };
  }

  if (!Number.isFinite(time)) {
    return { state: null, segment: null, invalidRunStart: null, reason: 'unusable-time' };
  }

  const sorted = (segments ?? [])
    .filter(usable)
    .slice()
    .sort((left, right) => left.startTime - right.startTime);

  const coveringIndices: number[] = [];

  sorted.forEach((segment, index) => {
    if (
      time >= segment.startTime - VERDICT_TOLERANCE_SECONDS &&
      time < segment.endTime + VERDICT_TOLERANCE_SECONDS
    ) {
      coveringIndices.push(index);
    }
  });

  if (coveringIndices.length === 0) {
    // Deliberately not the newest verdict, which is what the DASH runtime's own
    // lookup would return. A stale red left over from before a forward seek
    // would accuse content nothing has examined.
    return { state: null, segment: null, invalidRunStart: null, reason: 'no-segment' };
  }

  const decided = coveringIndices.filter((index) => sorted[index].pending !== true);

  if (decided.length === 0) {
    return {
      state: null,
      segment: null,
      invalidRunStart: null,
      reason: 'segment-pending',
    };
  }

  // Worst verdict wins where two cover the same moment, using the same ordering
  // the bar's own overlap collapse uses, so the label can never read greener
  // than the stretch of bar underneath it. Among equally bad ones the latest
  // start wins, which is the most recent correction.
  const worst = worstValidationState(
    decided.map((index) => sorted[index].validationState),
  );
  const winner = decided
    .filter((index) => sorted[index].validationState === worst)
    .reduce((latest, index) => (sorted[index].startTime >= sorted[latest].startTime ? index : latest));
  const segment = sorted[winner];
  const strictlyInside = time >= segment.startTime && time < segment.endTime;

  return {
    state: segment.validationState,
    segment,
    invalidRunStart:
      segment.validationState === 'Invalid' ? invalidRunStart(sorted, winner) : null,
    reason: strictlyInside ? 'covering' : 'at-boundary',
  };
}

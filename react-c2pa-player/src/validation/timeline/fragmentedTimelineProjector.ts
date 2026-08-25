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
  PlayerValidationState,
  TimeInterval,
  TimelineSegmentDiagnostic,
  ValidationTimelineSegment,
} from '../types';

export class FragmentedTimelineProjector {
  #segments: ValidationTimelineSegment[] = [];
  #lastObservedTime = 0;

  observe(
    time: number,
    validationState: PlayerValidationState,
    diagnostics?: TimelineSegmentDiagnostic[],
    startTime?: number
  ): void {
    if (!Number.isFinite(time)) {
      return;
    }

    if (time < this.#lastObservedTime) {
      this.resetOnBackwardSeek(time);
    }

    const lastSegment = this.#segments[this.#segments.length - 1];
    // Callers with real segment boundaries (DASH) pass their own startTime so
    // joining mid-broadcast and genuine gaps between segments are represented
    // accurately. Callers that only sample a playhead (HLS) omit it, falling
    // back to the old contiguous-from-last-observation assumption.
    const resolvedStartTime =
      typeof startTime === 'number' && Number.isFinite(startTime)
        ? startTime
        : this.#segments.length === 0
          ? 0
          : this.#lastObservedTime;

    if (!lastSegment || lastSegment.validationState !== validationState) {
      this.#segments.push({
        startTime: resolvedStartTime,
        endTime: time,
        validationState,
        diagnostics,
      });
    } else {
      lastSegment.endTime = Math.max(lastSegment.endTime, time);

      if (diagnostics?.length) {
        lastSegment.diagnostics = [...(lastSegment.diagnostics ?? []), ...diagnostics];
      }
    }

    this.#lastObservedTime = time;
  }

  mergeInvalidIntervals(intervals: TimeInterval[]): void {
    intervals.forEach((interval) => {
      this.#segments.push({
        startTime: interval.startTime,
        endTime: interval.endTime,
        validationState: 'Invalid',
        sourceSegmentId: 'tampered',
      });
    });

    this.#segments = mergeSegments(this.#segments);
  }

  resetOnBackwardSeek(time: number): void {
    this.#segments = [];
    this.#lastObservedTime = Math.max(0, time);
  }

  snapshot(): ValidationTimelineSegment[] {
    return this.#segments.map((segment) => ({ ...segment }));
  }
}

function mergeSegments(segments: ValidationTimelineSegment[]): ValidationTimelineSegment[] {
  const sortedSegments = [...segments].sort((left, right) => left.startTime - right.startTime);
  const merged: ValidationTimelineSegment[] = [];

  sortedSegments.forEach((segment) => {
    const previous = merged[merged.length - 1];

    if (!previous) {
      merged.push({ ...segment });
      return;
    }

    const overlaps = segment.startTime <= previous.endTime + 0.001;
    const sameState = segment.validationState === previous.validationState;
    const sameSource = segment.sourceSegmentId === previous.sourceSegmentId;

    if (overlaps && sameState && sameSource) {
      previous.endTime = Math.max(previous.endTime, segment.endTime);
      return;
    }

    merged.push({ ...segment });
  });

  return merged;
}

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

import { Emitter } from './emitter';
import { createUnknownResult } from './normalization';
import { DEFAULT_LIVE_RETENTION_SECONDS } from './policy/liveRetention';
import type { DashValidationRuntime } from './runtimes/contracts';
import type { DashSegmentEntry } from './runtimes/dashBridgeRuntime';
import {
  isActuallyPlaying,
  resolveSettledBefore,
  selectLiveRegions,
  WatchedTimeline,
} from './timeline';
import type {
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
  ValidationTimelineSegment,
} from './types';



export class DashFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'dash-fragmented-fmp4' as const;

  readonly #runtime: DashValidationRuntime;
  readonly #emitter = new Emitter<ValidationStatusSnapshot>();
  #unsubscribeRuntime: (() => void) | null = null;
  #drainedSegmentCount = 0;
  #lastPlaybackTime = 0;
  // Every segment verdict the plugin has produced, whether or not playback has
  // reached it. The plugin validates each segment as it downloads, so this runs
  // ahead of the playhead; #observeReadRegions decides what may be shown.
  readonly #knownSegments: DashSegmentEntry[] = [];
  readonly #watched = new WatchedTimeline();
  readonly #videoElement: HTMLVideoElement;
  readonly #retentionSeconds: number;
  readonly #enforceValidatedPlayback: boolean;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'Live DASH C2PA validation pending',
  };

  constructor(
    runtime: DashValidationRuntime,
    videoElement: HTMLVideoElement,
    retentionSeconds: number = DEFAULT_LIVE_RETENTION_SECONDS,
    enforceValidatedPlayback = true,
  ) {
    this.#runtime = runtime;
    this.#videoElement = videoElement;
    this.#retentionSeconds = retentionSeconds;
    this.#enforceValidatedPlayback = enforceValidatedPlayback;
  }

  async load(): Promise<void> {
    this.#unsubscribeRuntime = this.#runtime.subscribe(() => {
      this.#drainNewSegments();
      this.#rebuildSnapshot(this.#lastPlaybackTime, true);
    });

    await this.#runtime.load();
    this.#drainNewSegments();
    this.#rebuildSnapshot(0, true);
  }

  dispose(): void {
    this.#unsubscribeRuntime?.();
    this.#unsubscribeRuntime = null;
    this.#runtime.dispose();
    this.#emitter.clear();
  }

  getStatusAt(time: number): ValidationStatusSnapshot {
    this.#rebuildSnapshot(time, false);
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    const unsubscribe = this.#emitter.subscribe(listener);
    listener(this.#snapshot);

    return unsubscribe;
  }

  // Segments arrive as discrete events with their own known [startTime,
  // endTime), but they arrive when the segment *downloads*, which for VOD runs
  // well ahead of playback. So they are only accumulated here; what actually
  // reaches the timeline is decided against the playhead in #observeReadRegions.
  #drainNewSegments(): void {
    const newSegments = this.#runtime.getSegmentsSince(this.#drainedSegmentCount);
    this.#drainedSegmentCount = this.#runtime.getSegmentCount();
    this.#knownSegments.push(...newSegments);
    this.#forgetSegmentsBeforeWindow();
  }

  /**
   * Drops segments that have fallen out of the retained window.
   *
   * Only when live, and matching the runtime's own eviction so the two stay in
   * step. Without it a stream running for hours keeps every segment it ever
   * validated, and #observeReadRegions walks the whole list on every rebuild -
   * so both memory and the per-tick cost grow without limit on exactly the
   * sources that run longest.
   */
  #forgetSegmentsBeforeWindow(): void {
    if (this.#runtime.isLive() !== true || this.#knownSegments.length === 0) {
      return;
    }

    const edge = this.#knownSegments[this.#knownSegments.length - 1].endTime;
    const cutoff = edge - this.#retentionSeconds;
    const firstKept = this.#knownSegments.findIndex((segment) => segment.endTime >= cutoff);

    if (firstKept > 0) {
      this.#knownSegments.splice(0, firstKept);
    }
  }

  /**
   * Rebuilds the whole timeline from what is known, every tick.
   *
   * Nothing is accumulated. The runtime retains every verdict inside the
   * retention window and the watched record is complete, so the full picture is
   * derivable from first principles each time - and a derived picture cannot
   * drift from reality, which an accumulated one demonstrably could.
   *
   * It could, twice over. Verdicts do not only arrive ahead of the playhead: a
   * segment behind it that nobody watched settles the moment it falls out of the
   * DVR, and that is an observation at an *earlier* time than anything seen so
   * far. The projector read that as a backward seek and wiped the live timeline;
   * the skip-what-we-have-already-projected set then made the loss permanent,
   * because the regions it destroyed were still marked as projected. Ten seconds
   * of watched, settled history disappeared and the bar reset to grey.
   *
   * Deriving instead removes the whole class: there is no accumulated state to
   * disagree with, no ordering to respect, and no bookkeeping to go stale.
   *
   * Segments are also left unmerged, one region each, rather than collapsed by
   * verdict as the projector did. On DASH every segment carries its own CAWG
   * metadata, and merging kept only the last one's - so the hover preview showed
   * a whole run's worth of segments under one segment's title.
   */
  #buildTimeline(): ValidationTimelineSegment[] {
    const regions = selectLiveRegions(
      this.#knownSegments.map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        validationState: segment.result.validationState,
        segment,
      })),
      this.#watched,
      this.#settledBefore(),
    );

    return regions
      .sort((left, right) => left.startTime - right.startTime)
      .map((region) => ({
        startTime: region.startTime,
        endTime: region.endTime,
        validationState: region.validationState,
        manifestRef: region.source.segment.result.manifestSource,
        ...(region.settled ? {} : { provisional: true }),
        ...(region.settled && !region.played ? { unplayed: true } : {}),
      }));
  }

  /**
   * The time before which content can no longer be played, so a verdict for it
   * settles whether or not it was read.
   *
   * Only for confirmed-live sources: on VOD nothing ages out of reach, and the
   * read record stays the only rule.
   */
  #settledBefore(): number {
    if (this.#runtime.isLive() !== true) {
      return Number.NEGATIVE_INFINITY;
    }

    const depth = this.#runtime.getDvrWindowSeconds();

    if (depth === null) {
      return Number.NEGATIVE_INFINITY;
    }

    // The newest verdict, not the element's seekable end: while paused dash.js
    // freezes the whole seekable range, and this boundary has to keep moving
    // for a paused player to resolve itself. The depth above is the manifest's
    // declared value for the same reason - the seekable width grows toward it.
    const liveEdge = this.#knownSegments.reduce(
      (latest, segment) => Math.max(latest, segment.endTime),
      Number.NEGATIVE_INFINITY,
    );

    return resolveSettledBefore(liveEdge, depth);
  }

  #rebuildSnapshot(time: number, shouldEmit: boolean): void {
    const liveSignal = this.#runtime.isLive();

    if (Number.isFinite(time)) {
      this.#lastPlaybackTime = time;
    }

    this.#watched.observePlayhead(this.#lastPlaybackTime, isActuallyPlaying(this.#videoElement));

    const lookedUp = this.#runtime.lookup(this.#lastPlaybackTime);
    const result = lookedUp
      ? lookedUp.result
      : this.#runtime.getErrorReason()
        ? createUnknownResult()
        : this.#snapshot.result;

    this.#snapshot = {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: this.#buildTimeline(),
      message: this.#runtime.getMessage(),
      // Init-segment C2PA processing failed, so the asset's credentials are
      // broken as a whole rather than one segment being bad.
      wholeAssetInvalid: this.#runtime.isInitInvalid(),
      // Drives the timeline's window: a live stream has no end to scale
      // against, and its times may be epoch-based.
      isLive: liveSignal ?? undefined,
      liveRetentionSeconds: this.#retentionSeconds,
      // What the origin actually lets anyone seek back to, so the bar can span
      // exactly that rather than a figure of our own choosing.
      dvrWindowSeconds: this.#runtime.getDvrWindowSeconds() ?? undefined,
      enforceValidatedPlayback: this.#enforceValidatedPlayback,
    };

    if (shouldEmit) {
      this.#emit();
    }
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

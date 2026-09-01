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
import type { DashValidationRuntime } from './runtimes/contracts';
import type { DashSegmentEntry } from './runtimes/dashBridgeRuntime';
import {
  FragmentedTimelineProjector,
  isActuallyPlaying,
  readRegionKey,
  selectReadRegions,
  WatchedTimeline,
} from './timeline';
import type {
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

/**
 * How much validated history a live session keeps.
 *
 * Matches the runtime's own retention and the timeline's window cap, so the
 * three agree on what "recent" means rather than each trimming to its own idea
 * of it.
 */
const SEGMENT_HISTORY_WINDOW_SECONDS = 15 * 60;

export class DashFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'dash-fragmented-fmp4' as const;

  readonly #runtime: DashValidationRuntime;
  readonly #timelineProjector = new FragmentedTimelineProjector();
  readonly #emitter = new Emitter<ValidationStatusSnapshot>();
  #unsubscribeRuntime: (() => void) | null = null;
  #drainedSegmentCount = 0;
  #lastPlaybackTime = 0;
  // Every segment verdict the plugin has produced, whether or not playback has
  // reached it. The plugin validates each segment as it downloads, so this runs
  // ahead of the playhead; #observeReadRegions decides what may be shown.
  readonly #knownSegments: DashSegmentEntry[] = [];
  #observedRegionKeys = new Set<string>();
  readonly #watched = new WatchedTimeline();
  readonly #videoElement: HTMLVideoElement;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'Live DASH C2PA validation pending',
  };

  constructor(runtime: DashValidationRuntime, videoElement: HTMLVideoElement) {
    this.#runtime = runtime;
    this.#videoElement = videoElement;
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
    const cutoff = edge - SEGMENT_HISTORY_WINDOW_SECONDS;
    const firstKept = this.#knownSegments.findIndex((segment) => segment.endTime >= cutoff);

    if (firstKept > 0) {
      this.#knownSegments.splice(0, firstKept);
    }
  }

  /**
   * Projects the parts of validated segments that playback has actually read,
   * clipped at the playhead (see selectReadRegions). Skips regions already
   * projected, so a fully-read segment is observed once while the segment being
   * watched refreshes as its clipped end advances.
   */
  #observeReadRegions(): void {
    const regions = selectReadRegions(
      this.#knownSegments.map((segment) => ({
        startTime: segment.startTime,
        endTime: segment.endTime,
        validationState: segment.result.validationState,
        segment,
      })),
      this.#watched,
    );
    const seen = new Set<string>();

    regions.forEach((region) => {
      const key = readRegionKey(region);
      seen.add(key);

      if (this.#observedRegionKeys.has(key)) {
        return;
      }

      const { segment } = region.source;

      this.#timelineProjector.observe(
        region.endTime,
        region.validationState,
        region.startTime,
        segment.result.manifestSource,
      );
    });

    this.#observedRegionKeys = seen;
  }

  #rebuildSnapshot(time: number, shouldEmit: boolean): void {
    const liveSignal = this.#runtime.isLive();

    if (liveSignal !== null) {
      this.#timelineProjector.setLiveMode(liveSignal);
    }

    if (Number.isFinite(time)) {
      this.#lastPlaybackTime = time;
    }

    this.#watched.observePlayhead(this.#lastPlaybackTime, isActuallyPlaying(this.#videoElement));
    this.#observeReadRegions();

    const lookedUp = this.#runtime.lookup(this.#lastPlaybackTime);
    const result = lookedUp
      ? lookedUp.result
      : this.#runtime.getErrorReason()
        ? createUnknownResult()
        : this.#snapshot.result;

    this.#snapshot = {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: this.#timelineProjector.snapshot(),
      message: this.#runtime.getMessage(),
      // Init-segment C2PA processing failed, so the asset's credentials are
      // broken as a whole rather than one segment being bad.
      wholeAssetInvalid: this.#runtime.isInitInvalid(),
      // Drives the timeline's window: a live stream has no end to scale
      // against, and its times may be epoch-based.
      isLive: liveSignal ?? undefined,
    };

    if (shouldEmit) {
      this.#emit();
    }
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

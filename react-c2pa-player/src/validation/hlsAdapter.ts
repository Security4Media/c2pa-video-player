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
import { createUnknownResult, normalizeHlsManifestHelper } from './normalization';
import { HlsBridgeRuntime } from './runtimes';
import { detectAdapterKind } from './sourceDetection';
import { FragmentedTimelineProjector } from './timeline';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

// A jump larger than this between consecutive #rebuildSnapshot calls is
// treated as a seek rather than ordinary playback progression (timeupdate
// ticks are much smaller and continuous). Used only to decide whether a
// missing reader means "seeked into not-yet-validated territory" (show
// unknown/pending) vs. "briefly between fragments during normal playback"
// (keep showing the last known result to avoid flicker).
const SEEK_JUMP_THRESHOLD_SECONDS = 2;

const HLS_CAPABILITIES = {
  ownsPlayback: true,
  providesTimelineSegments: true,
  supportsLookupByTime: true,
  supportsLive: false,
  requiresPlayerOwnership: true,
} as const;

export class HlsFragmentedFmp4Adapter implements MediaValidationAdapter {
  readonly kind = 'hls-fragmented-fmp4' as const;
  readonly capabilities = HLS_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new HlsFragmentedFmp4Session(context);
  }
}

class HlsFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'hls-fragmented-fmp4' as const;

  readonly #runtime: HlsBridgeRuntime;
  readonly #timelineProjector = new FragmentedTimelineProjector();
  readonly #emitter = new Emitter<ValidationStatusSnapshot>();
  #unsubscribeRuntime: (() => void) | null = null;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'HLS C2PA fragment validation pending',
  };
  #lastPlaybackTime = 0;

  constructor(context: ValidationAdapterContext) {
    this.#runtime = new HlsBridgeRuntime(context);
  }

  async load(): Promise<void> {
    this.#unsubscribeRuntime = this.#runtime.subscribe(() => {
      this.#rebuildSnapshot(this.#lastPlaybackTime, true);
    });

    await this.#runtime.load();
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

  #rebuildSnapshot(time: number, shouldEmit: boolean): void {
    const isBackwardSeek = Number.isFinite(time) && time < this.#lastPlaybackTime;
    const isForwardSeek =
      Number.isFinite(time) && time > this.#lastPlaybackTime + SEEK_JUMP_THRESHOLD_SECONDS;

    if (isBackwardSeek) {
      this.#timelineProjector.resetOnBackwardSeek(time);
    }

    if (Number.isFinite(time)) {
      this.#lastPlaybackTime = time;
    }

    const reader = this.#runtime.lookup(this.#lastPlaybackTime);
    const result = reader
      ? normalizeHlsManifestHelper(reader)
      : this.#runtime.getErrorReason() || isBackwardSeek || isForwardSeek
        ? createUnknownResult()
        // Not a seek and no error — likely a brief gap between fragments
        // during normal forward playback; keep the last known result
        // instead of flickering to "unknown".
        : this.#snapshot.result;

    if (reader && result) {
      // No discrete segment boundary to pass (see the FragmentedTimelineProjector
      // comment on `startTime`) - HLS samples the playhead rather than observing
      // bridge-reported segment events - but `result.manifestSource` is still the
      // real manifest active at this exact lookup, so it's still meaningful to
      // attach: a merged run just ends up carrying whichever sample was most
      // recent, same as it does for `endTime`.
      this.#timelineProjector.observe(
        this.#lastPlaybackTime,
        result.validationState,
        undefined,
        undefined,
        result.manifestSource,
      );
      this.#timelineProjector.mergeInvalidIntervals(this.#runtime.getTamperedIntervals());
    }

    this.#snapshot = {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: this.#timelineProjector.snapshot(),
      message: this.#runtime.getMessage(),
    };

    if (shouldEmit) {
      this.#emit();
    }
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

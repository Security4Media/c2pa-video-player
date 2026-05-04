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

const HLS_CAPABILITIES = {
  ownsPlayback: true,
  providesTimelineSegments: true,
  supportsLookupByTime: true,
  supportsTrustVerification: true,
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
  readonly #listeners = new Set<ValidationSessionListener>();
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
    this.#listeners.clear();
  }

  getStatusAt(time: number): ValidationStatusSnapshot {
    this.#rebuildSnapshot(time, false);
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  #rebuildSnapshot(time: number, shouldEmit: boolean): void {
    if (Number.isFinite(time) && time < this.#lastPlaybackTime) {
      this.#timelineProjector.resetOnBackwardSeek(time);
    }

    if (Number.isFinite(time)) {
      this.#lastPlaybackTime = time;
    }

    const reader = this.#runtime.lookup(this.#lastPlaybackTime);
    const result = reader
      ? normalizeHlsManifestHelper(reader)
      : this.#runtime.getErrorReason()
        ? createUnknownResult()
        : this.#snapshot.result;

    if (reader && result) {
      this.#timelineProjector.observe(this.#lastPlaybackTime, result.validationState);
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
    this.#listeners.forEach((listener) => listener(this.#snapshot));
  }
}

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

import { createUnknownResult } from './normalization';
import { DashBridgeRuntime } from './runtimes';
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

const DASH_CAPABILITIES = {
  ownsPlayback: true,
  providesTimelineSegments: true,
  supportsLookupByTime: true,
  // @svta/cml-c2pa (behind the plugin) only performs cryptographic/structural
  // validation — it does not check the signing certificate against a trust
  // anchor list, so this adapter cannot honor enableTrustVerification the way
  // monolithic/HLS do.
  supportsTrustVerification: false,
} as const;

export class DashFragmentedFmp4Adapter implements MediaValidationAdapter {
  readonly kind = 'dash-fragmented-fmp4' as const;
  readonly capabilities = DASH_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new DashFragmentedFmp4Session(context);
  }
}

class DashFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'dash-fragmented-fmp4' as const;

  readonly #runtime: DashBridgeRuntime;
  readonly #timelineProjector = new FragmentedTimelineProjector();
  readonly #listeners = new Set<ValidationSessionListener>();
  #unsubscribeRuntime: (() => void) | null = null;
  #drainedSegmentCount = 0;
  #lastPlaybackTime = 0;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'Live DASH C2PA validation pending',
  };

  constructor(context: ValidationAdapterContext) {
    this.#runtime = new DashBridgeRuntime(context);
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

  // Unlike HLS, new segments arrive as discrete events with their own known
  // [startTime, endTime) rather than being discovered by polling the
  // playhead, so the timeline is built here (as segments close) instead of
  // from #rebuildSnapshot's playback-time argument.
  #drainNewSegments(): void {
    const newSegments = this.#runtime.getSegmentsSince(this.#drainedSegmentCount);
    this.#drainedSegmentCount = this.#runtime.getSegmentCount();

    newSegments.forEach((segment) => {
      this.#timelineProjector.observe(segment.endTime, segment.result.validationState, [
        segment.diagnostic,
      ]);
    });
  }

  #rebuildSnapshot(time: number, shouldEmit: boolean): void {
    if (Number.isFinite(time)) {
      this.#lastPlaybackTime = time;
    }

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
    };

    if (shouldEmit) {
      this.#emit();
    }
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener(this.#snapshot));
  }
}

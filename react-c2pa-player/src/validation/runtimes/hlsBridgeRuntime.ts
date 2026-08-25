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

import {
  C2paHlsBridge,
  type C2paManifestHelper,
} from '@nettrek/c2pa-hls-bridge';
import Hls from 'hls.js';
import type { TimeInterval, ValidationAdapterContext } from '../types';

type RuntimeListener = () => void;

export class HlsBridgeRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #listeners = new Set<RuntimeListener>();
  #hls: Hls | null = null;
  #bridge: C2paHlsBridge | null = null;
  #message = 'HLS C2PA fragment validation pending';
  #errorReason: string | null = null;
  #disposed = false;

  constructor(context: ValidationAdapterContext) {
    this.#context = context;
  }

  async load(): Promise<void> {
    if (!Hls.isSupported()) {
      this.#errorReason = 'HLS.js is not supported in this browser';
      this.#message = 'HLS.js is required for fragmented C2PA validation';
      this.#emit();
      return;
    }

    const trustMaterial = await this.#context.policy.trustMaterialProvider.load();

    // dispose() may have run while the trust material was loading. Bail out
    // without creating an Hls/bridge instance that dispose() would never see
    // and therefore never clean up.
    if (this.#disposed) {
      return;
    }

    const hls = new Hls({ enableWorker: true });
    const bridge = new C2paHlsBridge(
      {
        enableTrustListVerification: this.#context.policy.enableTrustVerification,
        wasmSrc: trustMaterial.wasmSrc,
        trust: this.#context.policy.enableTrustVerification ? trustMaterial.trust : undefined,
        cawgTrust: this.#context.policy.enableTrustVerification ? trustMaterial.cawgTrust : undefined,
      },
      hls as never,
    );

    this.#hls = hls;
    this.#bridge = bridge;
    this.#message = 'HLS C2PA fragment validation active';
    this.#errorReason = null;

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(this.#context.source.url);
      this.#emit();
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.warn('[HLS C2PA] HLS.js error', data);

      if (data?.fatal) {
        this.#errorReason = `HLS playback error: ${data.details}`;
        this.#message = this.#errorReason;
        this.#emit();
      }
    });

    hls.attachMedia(this.#context.videoElement);
    this.#emit();
  }

  dispose(): void {
    this.#disposed = true;
    this.#bridge?.dispose();
    this.#hls?.destroy();
    this.#bridge = null;
    this.#hls = null;
    this.#listeners.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  lookup(time: number): C2paManifestHelper | null {
    return this.#bridge?.getC2PAMetaByTimeCode(time) ?? null;
  }

  getTamperedIntervals(): TimeInterval[] {
    return (this.#bridge?.getTamperedWithIntervals() ?? [])
      .map(readInterval)
      .filter((interval): interval is TimeInterval => interval !== null);
  }

  getMessage(): string {
    return this.#message;
  }

  getErrorReason(): string | null {
    return this.#errorReason;
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

function readInterval(interval: unknown): TimeInterval | null {
  if (!interval || typeof interval !== 'object') {
    return null;
  }

  const maybeInterval = interval as {
    low?: unknown;
    high?: unknown;
    output?: () => unknown;
  };
  const output = maybeInterval.output?.();

  if (Array.isArray(output) && output.length >= 2) {
    return createIntervalRange(output[0], output[1]);
  }

  return createIntervalRange(maybeInterval.low, maybeInterval.high);
}

function createIntervalRange(start: unknown, end: unknown): TimeInterval | null {
  if (typeof start !== 'number' || typeof end !== 'number') {
    return null;
  }

  return {
    startTime: Math.min(start, end),
    endTime: Math.max(start, end),
  };
}

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
import { normalizeMonolithicManifestStore } from './normalization';
import { MonolithicBridgeRuntime } from './runtimes';
import { detectAdapterKind } from './sourceDetection';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

const MONOLITHIC_CAPABILITIES = {
  ownsPlayback: false,
  providesTimelineSegments: false,
  supportsLookupByTime: false,
  supportsLive: false,
  requiresPlayerOwnership: false,
} as const;

export class MonolithicC2PAAdapter implements MediaValidationAdapter {
  readonly kind = 'monolithic' as const;
  readonly capabilities = MONOLITHIC_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new MonolithicC2PASession(context);
  }
}

class MonolithicC2PASession implements ValidationSession {
  readonly adapterKind = 'monolithic' as const;

  readonly #runtime: MonolithicBridgeRuntime;
  readonly #emitter = new Emitter<ValidationStatusSnapshot>();
  #unsubscribeRuntime: (() => void) | null = null;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'Monolithic C2PA validation pending',
  };

  constructor(context: ValidationAdapterContext) {
    this.#runtime = new MonolithicBridgeRuntime(context);
  }

  async load(): Promise<void> {
    this.#unsubscribeRuntime = this.#runtime.subscribe(() => {
      this.#snapshot = this.#buildSnapshot();
      this.#emit();
    });

    await this.#runtime.load();
    this.#snapshot = this.#buildSnapshot();
    this.#emit();
  }

  dispose(): void {
    this.#unsubscribeRuntime?.();
    this.#unsubscribeRuntime = null;
    this.#runtime.dispose();
    this.#emitter.clear();
  }

  getStatusAt(): ValidationStatusSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    const unsubscribe = this.#emitter.subscribe(listener);
    listener(this.#snapshot);

    return unsubscribe;
  }

  #buildSnapshot(): ValidationStatusSnapshot {
    return {
      adapterKind: this.adapterKind,
      result: normalizeMonolithicManifestStore(this.#runtime.getManifestStore()),
      timelineSegments: [],
      message: this.#runtime.getMessage(),
    };
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

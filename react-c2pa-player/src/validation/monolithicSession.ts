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
import type { MonolithicValidationRuntime } from './runtimes/contracts';
import type {
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

export class MonolithicC2PASession implements ValidationSession {
  readonly adapterKind = 'monolithic' as const;

  readonly #runtime: MonolithicValidationRuntime;
  readonly #emitter = new Emitter<ValidationStatusSnapshot>();
  #unsubscribeRuntime: (() => void) | null = null;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'Monolithic C2PA validation pending',
  };

  constructor(runtime: MonolithicValidationRuntime) {
    this.#runtime = runtime;
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
    const result = normalizeMonolithicManifestStore(this.#runtime.getManifestStore());

    return {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: [],
      message: this.#runtime.getMessage(),
      // A whole-file asset has exactly one verdict covering all of it, so an
      // invalid one condemns the entire timeline from the moment it is known -
      // it must not depend on how far playback has progressed.
      wholeAssetInvalid: result.validationState === 'Invalid',
    };
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

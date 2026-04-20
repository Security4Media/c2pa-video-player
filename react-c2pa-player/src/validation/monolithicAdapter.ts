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

import type { C2PAStatus } from '@/types/c2pa.types';
import { c2pa_init, type C2PACleanup } from '@/services/c2pa-v2-monolithic';
import { detectAdapterKind } from './sourceDetection';
import { normalizeManifestStore } from './c2paResult';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

export class MonolithicC2PAAdapter implements MediaValidationAdapter {
  readonly kind = 'monolithic' as const;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new MonolithicC2PASession(context.videoElement);
  }
}

class MonolithicC2PASession implements ValidationSession {
  readonly adapterKind = 'monolithic' as const;

  readonly #videoElement: HTMLVideoElement;
  readonly #listeners = new Set<ValidationSessionListener>();
  #cleanup: C2PACleanup | null = null;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'Monolithic C2PA validation pending',
  };

  constructor(videoElement: HTMLVideoElement) {
    this.#videoElement = videoElement;
  }

  async load(): Promise<void> {
    this.#cleanup = await c2pa_init(this.#videoElement, (event: { c2pa_status?: C2PAStatus }) => {
      const manifestStore = event.c2pa_status?.manifestStore ?? null;
      this.#snapshot = {
        adapterKind: this.adapterKind,
        result: normalizeManifestStore(manifestStore),
        timelineSegments: [],
        message: 'Monolithic C2PA validation active',
      };
      this.#emit();
    });
  }

  dispose(): void {
    this.#cleanup?.();
    this.#cleanup = null;
    this.#listeners.clear();
  }

  getStatusAt(): ValidationStatusSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener(this.#snapshot));
  }
}


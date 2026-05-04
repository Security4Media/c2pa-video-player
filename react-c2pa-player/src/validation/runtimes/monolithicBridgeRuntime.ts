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

import { createC2pa, type ManifestStore, type Settings } from '@contentauth/c2pa-web';
import type { ValidationAdapterContext } from '../types';

type RuntimeListener = () => void;

type C2paSdk = Awaited<ReturnType<typeof createC2pa>>;

export class MonolithicBridgeRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #listeners = new Set<RuntimeListener>();
  #sdk: C2paSdk | null = null;
  #manifestStore: ManifestStore | null = null;
  #message = 'Monolithic C2PA validation pending';
  #errorReason: string | null = null;

  constructor(context: ValidationAdapterContext) {
    this.#context = context;
  }

  async load(): Promise<void> {
    try {
      const trustMaterial = await this.#context.policy.trustMaterialProvider.load();
      const settings: Settings | undefined = this.#context.policy.enableTrustVerification
        ? {
            verify: {
              verifyTrust: true,
              verifyAfterReading: true,
            },
            trust: trustMaterial.trust,
            cawgTrust: trustMaterial.cawgTrust,
          }
        : undefined;

      this.#sdk = await createC2pa({
        wasmSrc: trustMaterial.wasmSrc,
        settings,
      });

      const response = await fetch(this.#context.source.url);
      const blob = await response.blob();
      const reader = await this.#sdk.reader.fromBlob(
        blob.type || this.#context.source.mimeType || 'video/mp4',
        blob,
      );

      this.#manifestStore = (await reader?.manifestStore()) ?? null;
      this.#message = 'Monolithic C2PA validation active';
      this.#errorReason = null;
      this.#emit();
    } catch (error) {
      console.error('[Monolithic C2PA] Initialization error:', error);
      this.#manifestStore = null;
      this.#errorReason = error instanceof Error ? error.message : 'Monolithic validation failed';
      this.#message = this.#errorReason;
      this.#emit();
    }
  }

  dispose(): void {
    this.#sdk?.dispose?.();
    this.#sdk = null;
    this.#listeners.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  getManifestStore(): ManifestStore | null {
    return this.#manifestStore;
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

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

import type { ManifestStore } from '@contentauth/c2pa-web';
// WebCrypto-based reader, not the @contentauth/c2pa-web WASM core: its own
// createC2pa()/reader.fromBlob() fetch a bundled c2pa_bg.wasm whose SRI
// integrity attribute doesn't match what gets served through this repo's
// dependency tree (@nettrek/c2pa-hls-bridge pulls in a different
// @contentauth/c2pa-web version than the one pinned at the workspace root),
// so the browser blocks the resource. This package implements the same
// `{ reader: { fromBlob, fromBlobFragment }, dispose }` surface with no WASM.
import { createC2pa, type Settings } from '@nettrek/c2pa-web-crypto';
import { Emitter, type EmitterListener } from '../emitter';
import type { ValidationAdapterContext } from '../types';

type RuntimeListener = EmitterListener<void>;

type C2paSdk = Awaited<ReturnType<typeof createC2pa>>;

export class MonolithicBridgeRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #emitter = new Emitter();
  #sdk: C2paSdk | null = null;
  #manifestStore: ManifestStore | null = null;
  #message = 'Monolithic C2PA validation pending';
  #errorReason: string | null = null;
  #disposed = false;

  constructor(context: ValidationAdapterContext) {
    this.#context = context;
  }

  async load(): Promise<void> {
    try {
      const trustMaterial = await this.#context.policy.trustMaterialProvider.load();

      if (this.#disposed) {
        return;
      }

      // Cast at this boundary: TrustMaterial's `trust`/`cawgTrust` are typed
      // against @contentauth/c2pa-web's TrustSettings, which has no index
      // signature, while this package's Settings/TrustSettings require one -
      // a TS strictness mismatch between two independently-typed packages,
      // not an actual shape mismatch (both are plain { trustAnchors,
      // allowedList, trustConfig } string records).
      const settings: Settings | undefined = this.#context.policy.enableTrustVerification
        ? ({
            verify: {
              verifyTrust: true,
              verifyAfterReading: true,
            },
            trust: trustMaterial.trust,
            cawgTrust: trustMaterial.cawgTrust,
          } as Settings)
        : undefined;

      // wasmSrc is a @contentauth/c2pa-web-only config option; this reader
      // has no WASM to point it at, so it's intentionally not passed here.
      const sdk = await createC2pa({ settings });

      if (this.#disposed) {
        // dispose() ran while createC2pa() was in flight and never saw this
        // instance — clean it up ourselves instead of leaking it.
        sdk.dispose?.();
        return;
      }

      this.#sdk = sdk;

      const response = await fetch(this.#context.source.url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch media source (HTTP ${response.status} ${response.statusText})`,
        );
      }

      const blob = await response.blob();
      const reader = await this.#sdk.reader.fromBlob(
        blob.type || this.#context.source.mimeType || 'video/mp4',
        blob,
      );

      const manifestStore = (await reader?.manifestStore()) ?? null;

      if (this.#disposed) {
        return;
      }

      // Same cross-package structural cast as above: this reader's
      // ManifestStore is a separately-declared, data-compatible re-statement
      // of the c2pa-types shape, not identical field-for-field in TS's eyes.
      this.#manifestStore = manifestStore as ManifestStore | null;
      this.#message = 'Monolithic C2PA validation active';
      this.#errorReason = null;
      this.#emit();
    } catch (error) {
      if (this.#disposed) {
        return;
      }

      console.error('[Monolithic C2PA] Initialization error:', error);
      this.#manifestStore = null;
      this.#errorReason = error instanceof Error ? error.message : 'Monolithic validation failed';
      this.#message = this.#errorReason;
      this.#emit();
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#sdk?.dispose?.();
    this.#sdk = null;
    this.#emitter.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    return this.#emitter.subscribe(listener);
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
    this.#emitter.emit();
  }
}

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

import { createC2pa, type C2paSdk, type ManifestStore, type Reader } from '@contentauth/c2pa-web';
import { Emitter, type EmitterListener } from '../emitter';
import type { ValidationAdapterContext } from '../types';

type RuntimeListener = EmitterListener<void>;

/**
 * Validates a monolithic MP4 by calling this repo's own root-pinned
 * `@contentauth/c2pa-web` directly, rather than through
 * `@nettrek/c2pa-hls-bridge` the way `MonolithicBridgeRuntime` does.
 *
 * It never touches the bridge's own *nested* copy of `@contentauth/c2pa-web`,
 * so it isn't subject to the SRI mismatch that forces the bridge onto its
 * WebCrypto engine (see `monolithicBridgeRuntime.ts`). Trust material is
 * passed straight through unconverted: `TrustMaterial.trust`/`cawgTrust` are
 * already this package's own `TrustSettings`/`CawgTrustSettings` shape, not
 * the base64-digest shape `@nettrek/c2pa-web-crypto`'s allow-list wants.
 *
 * Fetches the whole asset into a `Blob` itself, independent of video.js's own
 * streaming of the same URL - the same independence the bridge-based
 * runtimes already have, just done with this package's own `reader.fromBlob`
 * instead of handing the bridge a URL to fetch on its own.
 *
 * Can disagree with `MonolithicBridgeRuntime` on the same asset and the same
 * trust material: measured against `PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`
 * with `?trust=full-dev`, the bridge's WebCrypto engine reaches 'Trusted' but
 * this runtime stays at 'Valid', even though the trust anchors fed to both
 * are confirmed identical in content. That is a property of how the two
 * engines each build a certificate chain, not a wiring bug here - this
 * runtime exists partly to make exactly that kind of difference visible.
 */
export class MonolithicC2paWebRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #emitter = new Emitter();
  #sdk: C2paSdk | null = null;
  #reader: Reader | null = null;
  #manifestStore: ManifestStore | null = null;
  #message = 'Monolithic C2PA validation pending (c2pa-web)';
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

      const sdk = await createC2pa({
        wasmSrc: trustMaterial.wasmSrc,
        settings: {
          trust: trustMaterial.trust,
          // `verifyTrustList` deliberately dropped, not just carried over from
          // `trustMaterial.cawgTrust`: this package's own trust-settings
          // resolver calls `.startsWith()` on every truthy setting value
          // without checking it's a string first, so a boolean `true` here
          // throws ("Failed to resolve trust settings.") before validation
          // ever runs. Its own docs say the default is already `true`, so
          // omitting it keeps the same behaviour without hitting that bug.
          cawgTrust: {
            trustAnchors: trustMaterial.cawgTrust.trustAnchors,
            allowedList: trustMaterial.cawgTrust.allowedList,
            trustConfig: trustMaterial.cawgTrust.trustConfig,
          },
          verify: { verifyTrust: this.#context.policy.enableTrustVerification },
        },
      });

      if (this.#disposed) {
        sdk.dispose();
        return;
      }

      this.#sdk = sdk;

      const response = await fetch(this.#context.source.url);
      const blob = await response.blob();

      if (this.#disposed) {
        return;
      }

      const reader = await sdk.reader.fromBlob(this.#context.source.mimeType ?? 'video/mp4', blob);

      if (this.#disposed) {
        return;
      }

      this.#reader = reader;
      this.#manifestStore = reader ? await reader.manifestStore() : null;
      this.#message = this.#manifestStore
        ? 'Monolithic C2PA validation active (c2pa-web)'
        : 'No C2PA manifest found in this asset';
      this.#emit();
    } catch (error) {
      if (this.#disposed) {
        return;
      }

      console.error('[Monolithic C2PA / c2pa-web] Initialization error:', error);
      this.#reader = null;
      this.#manifestStore = null;
      this.#message = error instanceof Error ? error.message : 'Monolithic validation failed';
      this.#emit();
    }
  }

  dispose(): void {
    this.#disposed = true;
    // Fire-and-forget: both are async, but a session only calls dispose() to
    // move on, never to wait for cleanup to finish.
    this.#reader?.free().catch(() => {});
    this.#sdk?.dispose();
    this.#sdk = null;
    this.#reader = null;
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

  #emit(): void {
    this.#emitter.emit();
  }
}

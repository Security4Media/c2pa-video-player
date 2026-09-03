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
import { C2paMp4Bridge, type C2paManifestHelper } from '@nettrek/c2pa-hls-bridge';
import { Emitter, type EmitterListener } from '../emitter';
import { toWebCryptoTrustSettings } from '../policy/webCryptoAllowedList';
import type { ValidationAdapterContext } from '../types';

type RuntimeListener = EmitterListener<void>;

// The bridge exposes no readiness event, only `libReady()` - and that reports
// the *library* being usable, not the asset being parsed, so a large file can
// clear it while `getC2PAMetaByTimeCode` still returns null. Both are
// therefore polled: the library first, then the asset's own reader.
const READY_POLL_INTERVAL_MS = 100;
const READY_TIMEOUT_MS = 30_000;

export class MonolithicBridgeRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #emitter = new Emitter();
  #bridge: C2paMp4Bridge | null = null;
  #reader: C2paManifestHelper | null = null;
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

      // Digests rather than the PEM the trust material holds: this bridge runs
      // the WebCrypto engine below, whose allow-list parser matches leaves
      // against base64 SHA-256 lines (see policy/webCryptoAllowedList.ts).
      const [trust, cawgTrust] = this.#context.policy.enableTrustVerification
        ? await Promise.all([
            toWebCryptoTrustSettings(trustMaterial.trust),
            toWebCryptoTrustSettings(trustMaterial.cawgTrust),
          ])
        : [undefined, undefined];

      if (this.#disposed) {
        return;
      }

      const bridge = new C2paMp4Bridge(
        {
          enableTrustListVerification: this.#context.policy.enableTrustVerification,
          // Same engine choice as the HLS bridge, for the same reason: the WASM
          // engine's internal wasm fetch carries an SRI integrity attribute
          // that does not match what this repo's dependency tree serves (the
          // bridge nests its own @contentauth/c2pa-web version alongside the
          // one pinned at the workspace root), so the browser blocks it.
          // `wasmSrc` remains the documented fallback where `crypto.subtle` is
          // unavailable.
          enableExperimentalWebCrypto: true,
          wasmSrc: trustMaterial.wasmSrc,
          trust,
          cawgTrust,
          // Without this the CAWG identity is checked against its own
          // effectively-empty policy, so a signer trusted for the claim still
          // reports untrusted and the asset can never reach 'Trusted'.
          enableCawgIdentityTrustVerification: this.#context.policy.enableTrustVerification,
        },
        this.#context.source.url,
      );

      this.#bridge = bridge;

      const reader = await this.#waitForReader(bridge);

      if (this.#disposed) {
        return;
      }

      this.#reader = reader;
      this.#manifestStore = (reader?.getManifestStore() as ManifestStore | null) ?? null;
      this.#message = this.#manifestStore
        ? 'Monolithic C2PA validation active'
        : 'No C2PA manifest found in this asset';
      this.#errorReason = null;
      this.#emit();
    } catch (error) {
      if (this.#disposed) {
        return;
      }

      console.error('[Monolithic C2PA] Initialization error:', error);
      this.#reader = null;
      this.#manifestStore = null;
      this.#errorReason = error instanceof Error ? error.message : 'Monolithic validation failed';
      this.#message = this.#errorReason;
      this.#emit();
    }
  }

  dispose(): void {
    this.#disposed = true;
    this.#bridge?.dispose();
    this.#bridge = null;
    this.#reader = null;
    this.#emitter.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    return this.#emitter.subscribe(listener);
  }

  getManifestStore(): ManifestStore | null {
    return this.#manifestStore;
  }

  /**
   * The bridge's reader for the asset, which states the verdict directly
   * (`getManifestStoreValidationState`) rather than leaving it to be inferred
   * from the store.
   */
  getReader(): C2paManifestHelper | null {
    return this.#reader;
  }

  getMessage(): string {
    return this.#message;
  }

  getErrorReason(): string | null {
    return this.#errorReason;
  }

  /**
   * Waits for the asset's reader to appear.
   *
   * A monolithic asset carries one manifest store covering the whole file, so
   * any timecode resolves to it; 0 is simply the one always in range.
   *
   * Returning null is not an error: an asset with no C2PA data never produces
   * a reader, and is reported as unsigned rather than as a failure. That is
   * also why the wait runs to the timeout instead of giving up early - there
   * is no signal distinguishing "not parsed yet" from "nothing to parse", and
   * a 13MB asset really does clear `libReady()` well before its own manifest
   * is available.
   */
  async #waitForReader(bridge: C2paMp4Bridge): Promise<C2paManifestHelper | null> {
    const deadline = Date.now() + READY_TIMEOUT_MS;

    while (Date.now() <= deadline) {
      if (this.#disposed) {
        return null;
      }

      if (bridge.libReady()) {
        const reader = bridge.getC2PAMetaByTimeCode(0);

        if (reader) {
          return reader;
        }
      }

      await new Promise((resolve) => {
        setTimeout(resolve, READY_POLL_INTERVAL_MS);
      });
    }

    return null;
  }

  #emit(): void {
    this.#emitter.emit();
  }
}

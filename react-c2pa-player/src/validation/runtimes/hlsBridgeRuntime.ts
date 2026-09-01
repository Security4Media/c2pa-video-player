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
import { Emitter, type EmitterListener } from '../emitter';
import { toWebCryptoTrustSettings } from '../policy/webCryptoAllowedList';
import { type FailureScope, readReaderEvidence, worstScope } from '../evidence';
import { getHlsValidationState } from '../rules';
import type { PlayerValidationState, TimeInterval, ValidationAdapterContext } from '../types';

type RuntimeListener = EmitterListener<void>;

/**
 * How far a fragment's validation failure reaches.
 *
 * A BMFF hash assertion covers one fragment's media data, so a mismatch there
 * condemns that fragment alone. Every other failure - claim signature, an
 * assertion's hashed URI, the signing credential - is a property of the
 * manifest itself and is therefore reported identically by every fragment,
 * condemning the whole asset.
 *
 * Confirmed against tampered fixtures of the WDR test stream: altering an
 * assertion in the init manifest store yields assertion.hashedURI.mismatch on
 * all 16 fragments, while corrupting (or removing) individual fragments'
 * Merkle proofs yields assertion.bmffHash.mismatch on exactly those fragments,
 * the untouched ones staying Trusted with no errors at all.
 */
export interface FragmentVerdict {
  /** 1-based position in playback order, for display. */
  index: number;
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
  /** `null` when the fragment did not fail validation. */
  failureScope: FailureScope | null;
}

export class HlsBridgeRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #emitter = new Emitter();
  #hls: Hls | null = null;
  #bridge: C2paHlsBridge | null = null;
  #message = 'HLS C2PA fragment validation pending';
  #errorReason: string | null = null;
  #disposed = false;
  // null until the first media playlist ("level") loads - that's the
  // earliest point HLS itself knows whether the stream is live or VOD (the
  // master-playlist-level MANIFEST_LOADED/MANIFEST_PARSED events don't carry
  // this; see Hls.Events.LEVEL_LOADED's LevelLoadedData.details.live).
  #isLive: boolean | null = null;

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

    // This bridge runs the WebCrypto engine (enableExperimentalWebCrypto
    // below), whose allow-list parser wants base64 SHA-256 digests rather than
    // the PEM the trust material holds - see policy/webCryptoAllowedList.ts.
    const [trustSettings, cawgTrustSettings] = this.#context.policy.enableTrustVerification
      ? await Promise.all([
          toWebCryptoTrustSettings(trustMaterial.trust),
          toWebCryptoTrustSettings(trustMaterial.cawgTrust),
        ])
      : [undefined, undefined];

    const hls = new Hls({ enableWorker: true });
    const bridge = new C2paHlsBridge(
      {
        enableTrustListVerification: this.#context.policy.enableTrustVerification,
        // Opt into the bridge's WebCrypto engine (@nettrek/c2pa-web-crypto)
        // instead of its default WASM engine (@contentauth/c2pa-web): the
        // WASM engine's own internal wasm fetch has an SRI integrity
        // mismatch under this repo's dependency tree (root pins a different
        // @contentauth/c2pa-web version than this bridge's own nested one),
        // which gets the resource blocked by the browser. `wasmSrc` is kept
        // below as the bridge's documented WASM fallback for browsers
        // without `crypto.subtle`. See rules.ts#isCawgIdentityUntrustedFailure
        // for the one behavioral difference this engine switch requires
        // handling: WebCrypto reports untrusted CAWG identities under a
        // different, more specific status code than WASM does.
        enableExperimentalWebCrypto: true,
        wasmSrc: trustMaterial.wasmSrc,
        trust: trustSettings,
        // Supplied explicitly rather than relying on
        // enableCawgIdentityTrustVerification alone: that flag reuses the
        // resolved C2PA resources for the identity only when no cawgTrust is
        // given (dist/C2paBridge.d.ts:38-47), whereas this list is the C2PA
        // one unioned with the CAWG-only entries, and it carries
        // `verifyTrustList`. Without either, per c2pa-rs the CAWG identity is
        // checked against its own effectively-empty policy, so a signer we do
        // trust for the claim still reports untrusted and the asset can never
        // reach 'Trusted'.
        cawgTrust: cawgTrustSettings,
        enableCawgIdentityTrustVerification: this.#context.policy.enableTrustVerification,
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
    hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
      const isLive = Boolean(data?.details?.live);

      if (this.#isLive !== isLive) {
        this.#isLive = isLive;
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
    this.#emitter.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    return this.#emitter.subscribe(listener);
  }

  lookup(time: number): C2paManifestHelper | null {
    return this.#bridge?.getC2PAMetaByTimeCode(time) ?? null;
  }

  /**
   * Every fragment the bridge has validated so far, with its real
   * presentation bounds and its own verdict.
   *
   * `getTamperedWithIntervals()` is used purely as an *enumeration* of known
   * fragments, not as a list of tampered ones. Its filter is
   * `!item.value.manifestReader.valid`, but `C2paManifestHelper` exposes only
   * an `isValid()` method and no `valid` property, so `!undefined` is always
   * true and the bridge returns every validated fragment regardless of
   * verdict (@nettrek/c2pa-hls-bridge 0.5.0, dist/index.js:5615 vs.
   * dist/C2paManifestHelper.d.ts:132; the MP4 bridge does it correctly at
   * :5795). The *bounds* are trustworthy - they come from `frag.start` and
   * `frag.start + frag.duration`, captured once at fragment load - so we keep
   * the bounds and determine each fragment's verdict ourselves via the same
   * time-code lookup and the same `getHlsValidationState` rule used
   * everywhere else.
   *
   * If the vendor ever fixes that typo, this list narrows to genuinely
   * invalid fragments: the verdicts stay correct, and valid fragments simply
   * stay unreported here until the playhead reaches them (the caller keeps a
   * per-playhead observation as a floor). That's a graceful degradation, not
   * a break.
   *
   * Note the list is keyed on `hls.currentLevel`, so it is empty until ABR
   * settles on a level and starts over on a level switch - another reason
   * the caller must not treat this as the complete picture.
   */
  getFragmentVerdicts(): FragmentVerdict[] {
    const bridge = this.#bridge;

    if (!bridge) {
      return [];
    }

    return (bridge.getTamperedWithIntervals() ?? [])
      .map(readInterval)
      .filter((interval): interval is TimeInterval => interval !== null)
      .filter((interval) => interval.endTime > interval.startTime)
      // Sorted so the display index below follows playback order rather than
      // whatever order the bridge happens to enumerate in.
      .sort((left, right) => left.startTime - right.startTime)
      .map((interval, position) => {
        // Sample the middle of the fragment: the bounds are half-open, so an
        // endpoint can resolve to the neighbouring fragment.
        const midpoint = (interval.startTime + interval.endTime) / 2;
        const reader = bridge.getC2PAMetaByTimeCode(midpoint);

        return {
          index: position + 1,
          startTime: interval.startTime,
          endTime: interval.endTime,
          validationState: reader
            ? getHlsValidationState(reader, reader.containsSignature())
            : ('Unknown' as PlayerValidationState),
          failureScope: worstScope(readReaderEvidence(reader).failures),
        };
      });
  }

  getMessage(): string {
    return this.#message;
  }

  getErrorReason(): string | null {
    return this.#errorReason;
  }

  /** `null` until the first level loads and reveals whether this is live or VOD. */
  isLive(): boolean | null {
    return this.#isLive;
  }

  #emit(): void {
    this.#emitter.emit();
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

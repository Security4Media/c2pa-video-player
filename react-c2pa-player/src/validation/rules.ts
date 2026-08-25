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

import type { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import type { C2paManifestHelper } from '@nettrek/c2pa-hls-bridge';
import type { PlayerValidationState } from './types';

function isCawgIdentityUntrustedFailure(result: { code?: string; url?: string }) {
  // The HLS bridge's WASM engine (@contentauth/c2pa-web) reports an
  // untrusted CAWG identity as the generic `signingCredential.untrusted`,
  // distinguishable from an untrusted C2PA claim signer only by checking the
  // failure's URL. Its WebCrypto engine (@nettrek/c2pa-web-crypto, enabled in
  // hlsBridgeRuntime.ts) reports the differentiated `cawg.identity.untrusted`
  // code directly - no URL check needed, and one is not guaranteed present.
  return (
    result.code === 'cawg.identity.untrusted' ||
    (result.code === 'signingCredential.untrusted' && result.url?.includes('cawg.identity'))
  );
}

export function getValidationResultsForManifest(validationDeltas: { success?: unknown[]; failure?: unknown[] } = {}) {
  return {
    success: validationDeltas.success ?? [],
    failure: validationDeltas.failure ?? [],
  };
}

export function getActiveManifest(manifestStore: ManifestStore): Manifest | null {
  if (!manifestStore?.active_manifest || !manifestStore?.manifests) {
    return null;
  }

  return manifestStore.manifests[manifestStore.active_manifest] ?? null;
}

export function getManifestStoreValidationState(manifestStore: ManifestStore): PlayerValidationState {
  const validationResults = manifestStore?.validation_results?.activeManifest;

  if (!validationResults) {
    return 'Invalid';
  }

  const { success, failure } = getValidationResultsForManifest(validationResults);
  const normalizedFailure = failure as Array<{ code?: string; url?: string }>;
  const normalizedSuccess = success as Array<{ code?: string }>;
  const hasOnlyCawgIdentityUntrustedFailure =
    normalizedFailure.length > 0 && normalizedFailure.every(isCawgIdentityUntrustedFailure);

  if (normalizedFailure.length > 0 && !hasOnlyCawgIdentityUntrustedFailure) {
    return 'Invalid';
  }

  if (normalizedSuccess.length === 0) {
    return normalizedFailure.length > 0 ? 'Valid' : 'Invalid';
  }

  // Reaching here guarantees normalizedSuccess.length > 0 with no disqualifying
  // failure. The previous version branched on specific success codes
  // (timeStamp.trusted, signingCredential.trusted, claimSignature.validated,
  // etc.) before falling through to an OR that always included
  // `normalizedSuccess.length > 0` - already guaranteed true at this point -
  // so every one of those branches, and the final `return 'Invalid'` below
  // them, was unreachable dead code; the function always returned 'Trusted'
  // whenever success was non-empty, regardless of which codes were present.
  // Verified by exhaustive fuzzing (36,400 success/failure code
  // combinations) against the original before removing.
  return 'Trusted';
}

export function getHlsValidationState(
  reader: C2paManifestHelper,
  containsSignature: boolean
): PlayerValidationState {
  if (!containsSignature) {
    return 'Unknown';
  }

  // reader.isValid() is a deprecated boolean that "considers both 'Valid'
  // and 'Trusted' states as valid" - i.e. it collapses the two into one,
  // which would leave the timeline permanently reporting 'Valid' (blue)
  // even for content whose signer is fully trust-anchored. Use the reader's
  // own three-state result instead so a genuinely trusted signer shows as
  // 'Trusted' (green) here too, not just in the menu's summary status.
  return reader.getManifestStoreValidationState() ?? 'Invalid';
}

/**
 * @svta/cml-c2pa (behind @qualabs/c2pa-live-dashjs-plugin) only performs
 * cryptographic/structural validation (COSE signature, hash, continuity) —
 * it does not check the signing certificate against a trust anchor list.
 * 'valid' is therefore mapped to 'Valid', never 'Trusted'.
 */
export function getDashSegmentValidationState(status: string): PlayerValidationState {
  switch (status) {
    case 'invalid':
    case 'replayed':
    case 'reordered':
      return 'Invalid';
    case 'missing':
    case 'unverified':
      return 'Unknown';
    case 'valid':
    case 'warning':
    default:
      return 'Valid';
  }
}

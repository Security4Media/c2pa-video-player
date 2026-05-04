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
  return result.code === 'signingCredential.untrusted' && result.url?.includes('cawg.identity');
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

  const hasTimeStampTrusted = normalizedSuccess.some((result) => result.code === 'timeStamp.trusted');
  const hasSigningCredentialTrusted = normalizedSuccess.some(
    (result) => result.code === 'signingCredential.trusted'
  );
  const hasClaimSignatureValidated = normalizedSuccess.some((result) =>
    ['claimSignature.validated', 'assertion.hashedURI.match', 'c2pa.hash.data.match'].includes(
      result.code ?? ''
    )
  );

  if (hasTimeStampTrusted && hasSigningCredentialTrusted) {
    return 'Trusted';
  }

  if (hasClaimSignatureValidated || hasOnlyCawgIdentityUntrustedFailure || normalizedSuccess.length > 0) {
    return 'Trusted';
  }

  return 'Invalid';
}

export function getHlsValidationState(
  reader: C2paManifestHelper,
  containsSignature: boolean
): PlayerValidationState {
  if (!containsSignature) {
    return 'Unknown';
  }

  return reader.isValid() ? 'Valid' : 'Invalid';
}

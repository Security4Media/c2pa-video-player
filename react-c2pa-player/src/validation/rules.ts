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
import { readReaderEvidence } from './evidence';
import type { AdapterKind, PlayerValidationState } from './types';

export function getActiveManifest(manifestStore: ManifestStore): Manifest | null {
  if (!manifestStore?.active_manifest || !manifestStore?.manifests) {
    return null;
  }

  return manifestStore.manifests[manifestStore.active_manifest] ?? null;
}

export function getHlsValidationState(
  reader: C2paManifestHelper,
  containsSignature: boolean
): PlayerValidationState {
  if (!containsSignature) {
    return 'Unknown';
  }

  // Deliberately not reader.isValid(): that deprecated boolean "considers both
  // 'Valid' and 'Trusted' states as valid", collapsing the two, which would
  // leave the timeline permanently blue even for a fully trust-anchored signer.
  return readReaderEvidence(reader).state;
}

/**
 * Whether this adapter's engine actually verifies the CAWG identity it reports.
 *
 * The DASH path runs @svta/cml-c2pa, which performs no identity or trust check
 * whatsoever (see `getDashSegmentValidationState`), so a `cawg.identity`
 * assertion there means only "an identity was claimed". Anything presenting
 * that identity, or the Dublin Core metadata it vouches for, has to say so
 * instead of implying it was checked.
 *
 * `unsupported` gets `false` for the same reason: nothing ran at all.
 */
export function verifiesCawgIdentity(adapterKind: AdapterKind): boolean {
  return adapterKind === 'monolithic' || adapterKind === 'hls-fragmented-fmp4';
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

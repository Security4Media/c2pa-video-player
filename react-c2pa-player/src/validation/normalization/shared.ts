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
import type { NormalizedValidationResult, PlayerValidationState } from '../types';

export function createUnknownResult(): NormalizedValidationResult {
  return {
    manifestStore: null,
    validationState: 'Unknown',
    activeManifest: null,
    manifestSource: { kind: 'none' },
  };
}

export function createCompatibilityManifestStore(
  activeManifest: Manifest | null,
  manifests: Record<string, Manifest>,
  validationState: PlayerValidationState,
  validationErrors: unknown[]
): ManifestStore | null {
  const activeManifestId = findActiveManifestId(activeManifest, manifests);

  if (!activeManifest || !activeManifestId) {
    return null;
  }

  return {
    active_manifest: activeManifestId,
    manifests,
    validation_state: validationState,
    validation_results: {
      activeManifest: {
        // Only a genuinely 'Valid' result may be promoted to a success entry
        // (which getManifestStoreValidationState reads as grounds for
        // 'Trusted'). 'Unknown' (no signature at all) must never fabricate a
        // success here, or unsigned content displays a false "Trusted" badge.
        success: validationState === 'Valid' ? [{ code: 'c2pa.fragment.validated' }] : [],
        failure: validationState === 'Invalid' ? validationErrors : [],
      },
    },
  } as ManifestStore;
}

function findActiveManifestId(
  activeManifest: Manifest | null,
  manifests: Record<string, Manifest>
): string | null {
  if (!activeManifest) {
    return null;
  }

  if (typeof activeManifest.id === 'string') {
    return activeManifest.id;
  }

  const activeEntry = Object.entries(manifests).find(([, manifest]) => manifest === activeManifest);
  return activeEntry?.[0] ?? null;
}

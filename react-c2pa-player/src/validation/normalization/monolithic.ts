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
import { getActiveManifest, getManifestStoreValidationState } from '../rules';
import type { NormalizedValidationResult } from '../types';
import { createUnknownResult } from './shared';

export function normalizeMonolithicManifestStore(
  manifestStore: ManifestStore | null,
  reason?: string
): NormalizedValidationResult {
  if (!manifestStore) {
    return createUnknownResult(reason ?? 'No C2PA manifest available');
  }

  const activeManifest = getActiveManifest(manifestStore);
  const manifests = manifestStore.manifests ?? {};
  const validationState = getManifestStoreValidationState(manifestStore);
  const validationErrors = manifestStore.validation_results?.activeManifest?.failure ?? [];

  return {
    manifestStore,
    validationState,
    containsSignature: activeManifest !== null,
    containsAIGeneratedContent: false,
    validationErrors,
    activeManifest,
    manifests,
    reason,
  };
}

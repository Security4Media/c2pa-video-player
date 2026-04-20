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
import type { C2PAStatus } from '@/types/c2pa.types';
import { getActiveManifest, getActiveManifestValidationStatus } from '@/services/c2pa_functions';
import type { NormalizedC2PAResult, ValidationStatusSnapshot } from './types';

export function createC2PAStatusFromResult(
  result: NormalizedC2PAResult,
  metadata: Pick<C2PAStatus, 'adapterKind' | 'timelineSegments' | 'message'> = {}
): C2PAStatus {
  return {
    manifestStore: result.manifestStore,
    verificationStatus: result.validationState,
    validationState: result.validationState,
    normalizedResult: result,
    ...metadata,
  };
}

export function createC2PAStatusFromSnapshot(
  snapshot: ValidationStatusSnapshot
): C2PAStatus | null {
  if (!snapshot.result) {
    return null;
  }

  return createC2PAStatusFromResult(snapshot.result, {
    adapterKind: snapshot.adapterKind,
    timelineSegments: snapshot.timelineSegments,
    message: snapshot.message,
  });
}

export function normalizeManifestStore(
  manifestStore: ManifestStore | null,
  reason?: string
): NormalizedC2PAResult {
  const activeManifest = manifestStore ? getActiveManifest(manifestStore) : null;
  const manifests = manifestStore?.manifests ?? {};
  const validationState = manifestStore
    ? getActiveManifestValidationStatus(manifestStore)
    : 'Unknown';
  const validationResults = manifestStore?.validation_results?.activeManifest;

  return {
    manifestStore,
    validationState,
    containsSignature: activeManifest !== null,
    containsAIGeneratedContent: false,
    validationErrors: validationResults?.failure ?? [],
    activeManifest,
    manifests,
    reason,
  };
}

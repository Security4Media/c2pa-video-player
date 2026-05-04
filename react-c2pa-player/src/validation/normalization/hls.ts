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

import type { Manifest } from '@contentauth/c2pa-web';
import type { C2paManifestHelper } from '@nettrek/c2pa-hls-bridge';
import { getHlsValidationState } from '../rules';
import type { NormalizedValidationResult } from '../types';
import { createCompatibilityManifestStore } from './shared';

export function normalizeHlsManifestHelper(reader: C2paManifestHelper): NormalizedValidationResult {
  const containsSignature = reader.containsSignature();
  const validationErrors = reader.getValidationErrors();
  const validationState = getHlsValidationState(reader, containsSignature);
  const manifests = reader.getManifestMap() as Record<string, Manifest>;
  const activeManifest = reader.getActiveManifest() as Manifest | null;
  const manifestStore = createCompatibilityManifestStore(
    activeManifest,
    manifests,
    validationState,
    validationErrors,
  );

  return {
    manifestStore,
    validationState,
    containsSignature,
    containsAIGeneratedContent: reader.containsAIGeneratedContent(),
    validationErrors,
    activeManifest,
    manifests,
  };
}

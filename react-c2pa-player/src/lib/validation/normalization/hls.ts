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
import type { ManifestSource, NormalizedValidationResult } from '../types';

export function normalizeHlsManifestHelper(reader: C2paManifestHelper): NormalizedValidationResult {
  const containsSignature = reader.containsSignature();
  const validationErrors = reader.getValidationErrors();
  const validationState = getHlsValidationState(reader, containsSignature);
  const manifests = reader.getManifestMap() as Record<string, Manifest>;
  const activeManifest = withResolvedId(reader.getActiveManifest() as Manifest | null, manifests);
  const manifestSource: ManifestSource = activeManifest
    ? {
        kind: 'single-manifest',
        manifest: activeManifest,
        manifests,
        validationState,
        validationErrors,
      }
    : { kind: 'none' };

  return {
    // Deliberately left null, like DASH's normalizeDashSegmentRecord: now that
    // getHlsValidationState returns the reader's own three-state result
    // directly, fabricating a ManifestStore-shaped compatibility object here
    // would have to fake a success/failure list that reproduces that same
    // Valid/Trusted distinction anyway - simpler and safer to let
    // menuViewModel.ts's existing manifestStore-less fallback path use
    // `validationState` as-is (it already does this for DASH).
    manifestStore: null,
    validationState,
    activeManifest,
    manifestSource,
  };
}

/**
 * `id` isn't part of the formal `Manifest` schema, and the real
 * @contentauth/c2pa-web/@nettrek/c2pa-web-crypto readers don't reliably set
 * it - but menuViewModel.ts's manifestStore-less fallback path
 * (`getManifestId`) reads `activeManifest.id` to key menu re-renders and to
 * resolve a manifest ID for `resolveManifestStoreFromSource` (needed for the
 * Organization/Work/History sections). Resolve it by reverse-lookup in the
 * manifest map (keyed by ID) when the reader didn't set it directly, mirroring
 * what DASH's own compatibility manifest already does by setting `id` to a
 * known-good value up front.
 */
function withResolvedId(manifest: Manifest | null, manifests: Record<string, Manifest>): Manifest | null {
  if (!manifest) {
    return null;
  }

  if (typeof (manifest as { id?: unknown }).id === 'string') {
    return manifest;
  }

  const resolvedId = Object.entries(manifests).find(([, candidate]) => candidate === manifest)?.[0];

  return resolvedId ? ({ ...manifest, id: resolvedId } as Manifest) : manifest;
}

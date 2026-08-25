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

import type { Manifest, ManifestAssertion } from '@contentauth/c2pa-web';
import type { C2paManifest, SegmentRecord } from '@qualabs/c2pa-live-dashjs-plugin';
import { getDashSegmentValidationState } from '../rules';
import type { ManifestSource, NormalizedValidationResult, TimelineSegmentDiagnostic } from '../types';

function toCompatibilityAssertions(assertions: C2paManifest['assertions']): ManifestAssertion[] {
  if (!assertions) {
    return [];
  }

  return assertions.map((assertion) => ({ label: assertion.label, data: assertion.data }));
}

function toCompatibilityManifest(manifest: C2paManifest | null | undefined): Manifest | null {
  if (!manifest) {
    return null;
  }

  return {
    // `id` isn't part of the formal Manifest schema, but menuViewModel.ts's
    // manifestStore-less fallback path (`getManifestId`) reads it to key
    // menu re-renders when the active manifest changes.
    id: manifest.label,
    label: manifest.label,
    instance_id: manifest.instanceId ?? undefined,
    claim_generator_info: manifest.claimGenerator
      ? [{ name: manifest.claimGenerator, version: null }]
      : null,
    // certNotBefore is the certificate's validity start, not the claim's
    // signing time — leave `time` unset rather than show a misleading date.
    signature_info: { issuer: manifest.signatureInfo?.issuer ?? null, time: null },
    assertions: toCompatibilityAssertions(manifest.assertions),
  };
}

function toDiagnostic(record: SegmentRecord): TimelineSegmentDiagnostic {
  return {
    segmentNumber: record.segmentNumber,
    mediaType: record.mediaType,
    status: record.status,
    sequenceReason: record.sequenceReason,
    errorCodes: record.errorCodes ? [...record.errorCodes] : undefined,
    quality: record.quality,
    timestamp: record.timestamp,
  };
}

/**
 * Normalizes one plugin `SegmentRecord` into the shared validation result
 * shape. `manifestStore` is deliberately left `null` (same as HLS's
 * normalizeHlsManifestHelper): leaving it unset makes the menu fall back to
 * `validationState` as-is (see `menuViewModel.ts`'s `buildMenuRenderState`),
 * preserving the Valid/Invalid/Unknown distinction from
 * `getDashSegmentValidationState` - @svta/cml-c2pa never checks a trust
 * anchor list, so this adapter's result is never 'Trusted' anyway.
 *
 * `record.manifest` is only populated when the manifest is new or changed
 * (see `record.previousManifestId`); `latestManifest` carries the last known
 * manifest forward so the menu doesn't flicker to "no manifest" on every
 * segment that merely repeats the current one.
 */
export function normalizeDashSegmentRecord(
  record: SegmentRecord,
  latestManifest: C2paManifest | null
): {
  result: NormalizedValidationResult;
  diagnostic: TimelineSegmentDiagnostic;
} {
  const validationState = getDashSegmentValidationState(record.status);
  const activeManifest = toCompatibilityManifest(record.manifest ?? latestManifest);
  // No `validationErrors` array exists in this adapter (unlike HLS) - DASH
  // reports failures as a status string, not a list of failure objects - so
  // this is always empty, matching createAdapterManifestStore's old
  // DASH-specific behavior of never populating `failure`.
  const manifestSource: ManifestSource = activeManifest
    ? {
        kind: 'single-manifest',
        manifest: activeManifest,
        // `label` (properly typed) rather than `id` (an ad hoc, `unknown`-typed
        // index-signature field - see toCompatibilityManifest) since this
        // function always sets id to exactly the same value as label.
        manifests: { [activeManifest.label ?? '']: activeManifest },
        validationState,
        validationErrors: [],
      }
    : { kind: 'integrity-only', integrityStatus: record.status, sequenceReason: record.sequenceReason, errorCodes: record.errorCodes ? [...record.errorCodes] : undefined };

  return {
    result: { manifestStore: null, validationState, activeManifest, manifestSource },
    diagnostic: toDiagnostic(record),
  };
}

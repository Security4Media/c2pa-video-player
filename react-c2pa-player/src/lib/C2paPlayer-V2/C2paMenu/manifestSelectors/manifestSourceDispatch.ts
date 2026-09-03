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
import type { ManifestSource, PlayerValidationState } from '@/lib/validation';
import { getActiveManifest } from '@/lib/validation/rules';

/**
 * Resolves an adapter-agnostic `ManifestSource` into the `ManifestStore`
 * shape the existing section selectors (selectOrganizationSection,
 * selectWorkSection, selectHistorySection) expect, or `null` when there's
 * nothing store-shaped to give them (no manifest at all, or integrity-only
 * data with no manifest attached).
 *
 * Mirrors what the old adapter-specific `createAdapterManifestStore` built
 * for its one reachable case (DASH, whose `NormalizedValidationResult.
 * manifestStore` is always null) - HLS and monolithic already carry a real
 * `ManifestStore` by the time menuViewModel.ts would fall back to this, so
 * `manifest-store` below is presently unexercised but kept for adapters that
 * only have a `ManifestSource` and never populate the legacy field.
 */
export function resolveManifestStoreFromSource(
    source: ManifestSource | undefined,
    manifestId: string,
    validationStatus: PlayerValidationState,
): ManifestStore | null {
    if (!source) {
        return null;
    }

    switch (source.kind) {
        case 'manifest-store':
            return source.manifestStore;
        case 'single-manifest':
            return {
                active_manifest: manifestId,
                manifests: source.manifests,
                validation_state: validationStatus,
                // The adapter's own failure list, carried verbatim rather than
                // only when the asset is Invalid. A CAWG identity that failed
                // its trust check does not by itself make the asset Invalid,
                // so gating on that dropped exactly the evidence the identity
                // status is read from.
                validation_status: source.validationErrors ?? [],
                validation_results: {
                    activeManifest: {
                        // `[{}]` is a placeholder standing for "something
                        // succeeded", not a coded result: adapters that arrive
                        // here (HLS) report a verdict plus a failure list, not
                        // the per-code success entries the WASM engine emits.
                        // Readers must therefore not infer the absence of a
                        // specific success code from this list.
                        success: validationStatus === 'Invalid' ? [] : [{}],
                        failure: validationStatus === 'Invalid' ? source.validationErrors : [],
                    },
                },
            } as ManifestStore;
        case 'integrity-only':
        case 'none':
            return null;
    }
}

/**
 * Resolves an adapter-agnostic `ManifestSource` to the concrete `Manifest`
 * it carries (if any) - used for the per-fragment "click a segment, inspect
 * it" detail view, which needs the manifest itself (issuer, actions, CAWG
 * identity, ...) rather than the `ManifestStore` shape the section selectors
 * take as their *trust-context* argument.
 */
export function resolveManifestFromSource(source: ManifestSource | undefined): Manifest | null {
    if (!source) {
        return null;
    }

    switch (source.kind) {
        case 'manifest-store':
            return getActiveManifest(source.manifestStore);
        case 'single-manifest':
            return source.manifest;
        case 'integrity-only':
        case 'none':
            return null;
    }
}

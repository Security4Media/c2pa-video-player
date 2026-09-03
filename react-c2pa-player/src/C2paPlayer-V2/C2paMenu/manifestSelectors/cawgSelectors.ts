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

import { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import { readStoreEvidence } from '@/validation/evidence';
import { verifiesCawgIdentity } from '@/validation/rules';
import type { AdapterKind } from '@/validation';
import type { ValidationState } from '@/types/c2pa.types';
import { CawgOrganizationItem, ManifestCawgAssertion } from '../models';
import { selectCreativeWorkContent } from './creativeWorkSelectors';
import { selectDublinCoreMetadata } from './dublinCoreSelectors';
import {
    CAWG_ASSERTION_LABEL,
    CAWG_METADATA_ASSERTION_LABEL,
    CREATIVE_WORK_ASSERTION_LABEL,
    getReferencedAssertionLabels,
} from './shared';

/**
 * Build the CAWG organization identity view model for the active manifest.
 * The selector combines CAWG identity information with CreativeWork data
 * when the CreativeWork assertion is referenced by `cawg.identity`.
 *
 * If the CreativeWork assertion is not referenced, missing, or malformed,
 * the function returns the CAWG fields that are available and leaves the
 * CreativeWork-derived properties empty.
 *
 * @param {Manifest} manifest - The manifest containing CAWG and CreativeWork assertions
 * @param {ManifestStore} [manifestStore] - Optional manifest store used to compute CAWG validation status
 * @returns {CawgOrganizationItem | null} Structured organization identity data, or null if no CAWG assertion exists
 */
/**
 * What may honestly be claimed about the identity behind this manifest.
 *
 * The engine that produced the verdict decides, and for DASH the answer is
 * nothing. `@svta/cml-c2pa` performs no identity or trust check at all, so a
 * `cawg.identity` assertion there means "an identity was claimed" and no more -
 * yet the evidence reader had no way to say that. Given a verdict and an empty
 * failure list, which is exactly what a DASH store reduces to, it returned
 * 'Valid': the absence of an identity failure read as the identity having
 * passed, when nothing had run to fail. The menu then showed a tick and
 * "the organization identity is valid".
 *
 * 'Unknown' is the honest answer, and it is the same word the timeline's grey
 * means everywhere else in this player: nobody checked.
 */
function readIdentityStatus(
    manifestStore: ManifestStore | undefined,
    adapterKind: AdapterKind | null | undefined,
): ValidationState {
    if (adapterKind && !verifiesCawgIdentity(adapterKind)) {
        return 'Unknown';
    }

    if (!manifestStore) {
        // Nothing to read a verdict from. Also 'Unknown' rather than the
        // 'Invalid' this used to fall through to: no evidence is not evidence
        // of a failure, and rendering a red cross over a declared identity is
        // an accusation the player cannot support.
        return 'Unknown';
    }

    const identity = readStoreEvidence(manifestStore).identity;

    // 'Absent' means the store's active manifest declares no identity. Reaching
    // here means this manifest does declare one, so the two disagree and the
    // claim cannot be shown as verified.
    return identity === 'Absent' ? 'Invalid' : identity;
}

export function selectOrganizationIdentity(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
) {
    const cawgAssertion = manifest.assertions?.find(
        assertion => assertion.label === CAWG_ASSERTION_LABEL
    ) as ManifestCawgAssertion | undefined;

    if (!cawgAssertion || !cawgAssertion.data) {
        console.warn(`[C2PA] No CAWG assertion with label '${CAWG_ASSERTION_LABEL}' found in manifest`);
        return null;
    }

    const cawgItemBuilder: Partial<CawgOrganizationItem> = {};

    // signature_info is only present when the reader has parsed the
    // embedded certificate out of the COSE signature (monolithic, HLS).
    // Live DASH manifests (@svta/cml-c2pa) don't do that extraction, so
    // this is routinely absent there — not an error.
    cawgItemBuilder.issuer = cawgAssertion.data.signature_info?.issuer ?? null;
    cawgItemBuilder.role = cawgAssertion.data.role ?? null;
    cawgItemBuilder.validationStatus = readIdentityStatus(manifestStore, adapterKind);
    cawgItemBuilder.creativeWork = null;
    cawgItemBuilder.dublinCore = null;

    const referencedAssertionLabels = getReferencedAssertionLabels(cawgAssertion);

    if (referencedAssertionLabels.includes(CREATIVE_WORK_ASSERTION_LABEL)) {
        cawgItemBuilder.creativeWork = selectCreativeWorkContent(manifest);
    }

    // Live streams (C2PA Live Video spec) commonly reference the simpler
    // Dublin Core `cawg.metadata` assertion instead of CreativeWork.
    if (referencedAssertionLabels.includes(CAWG_METADATA_ASSERTION_LABEL)) {
        cawgItemBuilder.dublinCore = selectDublinCoreMetadata(manifest);
    }

    if (!cawgItemBuilder.creativeWork && !cawgItemBuilder.dublinCore) {
        console.warn(
            `[C2PA] CAWG assertion references neither '${CREATIVE_WORK_ASSERTION_LABEL}' nor '${CAWG_METADATA_ASSERTION_LABEL}', returning CAWG-only organization identity`
        );
    }

    return cawgItemBuilder as CawgOrganizationItem;
}

import { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import { getCAWGValidationStatus } from '../../../services/c2pa_functions';
import { CawgOrganizationItem, ManifestCawgAssertion } from '../models';
import { selectCreativeWorkContent } from './creativeWorkSelectors';
import {
    CAWG_ASSERTION_LABEL,
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
export function selectOrganizationIdentity(manifest: Manifest, manifestStore?: ManifestStore) {
    const cawgAssertion = manifest.assertions?.find(
        assertion => assertion.label === CAWG_ASSERTION_LABEL
    ) as ManifestCawgAssertion | undefined;

    if (!cawgAssertion || !cawgAssertion.data) {
        console.warn(`[C2PA] No CAWG assertion with label '${CAWG_ASSERTION_LABEL}' found in manifest`);
        return null;
    }

    const cawgItemBuilder: Partial<CawgOrganizationItem> = {};

    cawgItemBuilder.issuer = cawgAssertion.data.signature_info.issuer;
    cawgItemBuilder.role = cawgAssertion.data.role ?? null;
    cawgItemBuilder.validationStatus = manifestStore
        ? getCAWGValidationStatus(manifestStore)
        : 'Unknown';
    cawgItemBuilder.creativeWork = null;

    const referencedAssertionLabels = getReferencedAssertionLabels(cawgAssertion);
    if (!referencedAssertionLabels.includes(CREATIVE_WORK_ASSERTION_LABEL)) {
        console.warn(
            `[C2PA] CAWG assertion does not reference '${CREATIVE_WORK_ASSERTION_LABEL}', returning CAWG-only organization identity`
        );
        return cawgItemBuilder as CawgOrganizationItem;
    }

    const creativeWorkContent = selectCreativeWorkContent(manifest);
    if (!creativeWorkContent) {
        console.warn(
            `[C2PA] Referenced CreativeWork assertion '${CREATIVE_WORK_ASSERTION_LABEL}' is missing or malformed`
        );
        return cawgItemBuilder as CawgOrganizationItem;
    }

    cawgItemBuilder.creativeWork = creativeWorkContent;

    return cawgItemBuilder as CawgOrganizationItem;
}

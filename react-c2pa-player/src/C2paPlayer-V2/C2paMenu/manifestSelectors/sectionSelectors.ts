import { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import {
    ClaimGeneratorSectionItem,
    HistorySectionItem,
    OrganizationSectionItem,
    WorkSectionItem,
} from '../models';
import { selectOrganizationIdentity } from './cawgSelectors';
import { selectClaimGenerator } from './claimGeneratorSelectors';
import {
    selectCreativeWorkAuthors,
    selectCreativeWorkOrganization,
} from './creativeWorkSelectors';
import { selectIngredients } from './ingredientSelectors';

/**
 * Select the claim-generator section model for the menu.
 *
 * @param manifest - The manifest containing claim generator info
 * @returns Structured claim-generator section data, or null when absent
 */
export function selectClaimGeneratorSection(
    manifest: Manifest,
): ClaimGeneratorSectionItem | null {
    const products = selectClaimGenerator(manifest);
    if (!products || products.length === 0) {
        return null;
    }

    return { products };
}

/**
 * Select the provenance history section model for the menu.
 *
 * @param manifest - The manifest that may contain ingredients
 * @param manifestStore - Manifest store used to resolve ingredient manifests
 * @returns Structured history section data, or null when absent
 */
export function selectHistorySection(
    manifest: Manifest,
    manifestStore: ManifestStore,
): HistorySectionItem | null {
    const ingredients = selectIngredients(manifest, manifestStore);
    if (!ingredients || ingredients.length === 0) {
        return null;
    }

    return { ingredients };
}

/**
 * Select the organization section model, combining CreativeWork organization
 * details with CAWG organization identity information when available.
 *
 * @param manifest - The manifest containing organization-related assertions
 * @param manifestStore - Optional manifest store used for CAWG validation status
 * @returns Structured organization section data, or null when both sources are absent
 */
export function selectOrganizationSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
): OrganizationSectionItem | null {
    const organization = selectCreativeWorkOrganization(manifest);
    const cawg = selectOrganizationIdentity(manifest, manifestStore);

    if (!organization && !cawg) {
        return null;
    }

    return {
        organization,
        cawg,
    };
}

/**
 * Select the work/authors section model from CreativeWork data and the
 * optional CAWG role.
 *
 * @param manifest - The manifest containing CreativeWork and CAWG assertions
 * @param manifestStore - Optional manifest store used to compute CAWG status
 * @returns Structured work section data, or null when no author or role data exists
 */
export function selectWorkSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
): WorkSectionItem | null {
    const authors = selectCreativeWorkAuthors(manifest);
    const cawg = selectOrganizationIdentity(manifest, manifestStore);
    const role = cawg?.role ?? null;

    if (authors.length === 0 && !role) {
        return null;
    }

    return {
        authors,
        role,
    };
}

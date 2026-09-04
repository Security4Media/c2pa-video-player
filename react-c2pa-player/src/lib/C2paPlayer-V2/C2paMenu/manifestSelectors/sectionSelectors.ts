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
import type { AdapterKind } from '@/lib/validation';
import {
    ClaimGeneratorSectionItem,
    CopyrightSectionItem,
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
    adapterKind?: AdapterKind | null,
): OrganizationSectionItem | null {
    const organization = selectCreativeWorkOrganization(manifest);
    const cawg = selectOrganizationIdentity(manifest, manifestStore, adapterKind);

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
/**
 * Select the copyright/credit section model, derived from the schema.org
 * shape of `cawg.metadata` (copyrightHolder, publisher, creditText,
 * copyrightNotice). `selectOrganizationIdentity` only populates this field
 * when the referencing `cawg.identity` is Trusted, so this section is null
 * (and hidden) for any lesser verdict.
 *
 * @param manifest - The manifest containing CAWG assertions
 * @param manifestStore - Optional manifest store used to compute CAWG validation status
 * @returns Structured copyright section data, or null when absent or not Trusted
 */
export function selectCopyrightSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
): CopyrightSectionItem | null {
    const cawg = selectOrganizationIdentity(manifest, manifestStore, adapterKind);

    if (!cawg?.copyright) {
        return null;
    }

    return { copyright: cawg.copyright };
}

export function selectWorkSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
): WorkSectionItem | null {
    const authors = selectCreativeWorkAuthors(manifest);
    const organization = selectCreativeWorkOrganization(manifest);
    // Only the role is read from here, which no engine verifies either way -
    // but the argument is passed so the two selectors cannot answer the same
    // question differently.
    const cawg = selectOrganizationIdentity(manifest, manifestStore, adapterKind);
    const role = cawg?.role ?? null;

    if (authors.length === 0 && !role && !organization?.name) {
        return null;
    }

    return {
        authors,
        role,
        organizationName: organization?.name ?? null,
    };
}

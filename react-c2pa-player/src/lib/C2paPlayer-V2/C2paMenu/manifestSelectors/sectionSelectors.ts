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
    ManifestCawgAssertion,
    OrganizationSectionItem,
    WorkSectionItem,
} from '../models';
import { hasPublishedAction, selectActionsAssertion } from './actionsSelectors';
import { selectOrganizationIdentity } from './cawgSelectors';
import { selectClaimGenerator } from './claimGeneratorSelectors';
import {
    selectCreativeWorkAuthors,
    selectCreativeWorkOrganization,
} from './creativeWorkSelectors';
import { selectIngredients } from './ingredientSelectors';
import { getReferencedAssertionLabels, selectX509CawgAssertion } from './shared';

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
 * What to call the Organization Identity section, and whether to flag it as
 * ambiguous.
 *
 * A `c2pa.published` action alone does not make this identity the publisher
 * - only its own `referenced_assertions` covering the actions assertion does
 * that. Absent a publish action at all, there is nothing publisher-related
 * to say either way, so the title stays generic and no hint is shown.
 */
function resolveOrganizationTitle(
    manifest: Manifest,
    x509Assertion: ManifestCawgAssertion,
): { title: string; titleHint: string | null } {
    if (!hasPublishedAction(manifest)) {
        return { title: 'Organization Identity', titleHint: null };
    }

    const actionsAssertion = selectActionsAssertion(manifest);
    const isReferenced = actionsAssertion
        ? getReferencedAssertionLabels(x509Assertion).includes(actionsAssertion.label)
        : false;

    if (isReferenced) {
        return { title: 'Publisher Identity', titleHint: null };
    }

    return {
        title: 'Organization Identity',
        titleHint: 'This content was published, but this identity does not cryptographically reference the actions that published it, so it cannot be confirmed as the publisher.',
    };
}

/**
 * Select the organization section model, combining CreativeWork organization
 * details with CAWG organization identity information.
 *
 * Gated on two things, both required:
 *  - the active manifest carries an X.509-shaped `cawg.identity` specifically
 *    (see `selectX509CawgAssertion`) - every field this section shows
 *    (`signature_info`, referenced CreativeWork/Dublin Core content) only
 *    ever comes from that shape, not a CAWG Identity Claims Aggregation
 *    credential or a bare CreativeWork organization with no identity at all;
 *  - that identity's verdict is `Trusted`. Valid/Unknown/Invalid are not
 *    enough: unlike the badge-and-caveat treatment this section used to give
 *    those states, an unresolved or failed identity has no organization or
 *    publisher worth naming at all, so the section - title, badge and all -
 *    does not appear rather than showing a claim this app cannot vouch for.
 *
 * @param manifest - The manifest containing organization-related assertions
 * @param manifestStore - Optional manifest store used for CAWG validation status
 * @returns Structured organization section data, or null unless a Trusted X.509 cawg.identity is present
 */
export function selectOrganizationSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
): OrganizationSectionItem | null {
    const x509Assertion = selectX509CawgAssertion(manifest);

    if (!x509Assertion) {
        return null;
    }

    const cawg = selectOrganizationIdentity(manifest, manifestStore, adapterKind);

    if (cawg?.validationStatus !== 'Trusted') {
        return null;
    }

    const organization = selectCreativeWorkOrganization(manifest);
    const { title, titleHint } = resolveOrganizationTitle(manifest, x509Assertion);

    return {
        organization,
        cawg,
        title,
        titleHint,
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

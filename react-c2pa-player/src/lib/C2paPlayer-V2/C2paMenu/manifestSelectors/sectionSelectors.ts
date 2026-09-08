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
import type { AdapterKind, IdentityTrustMode } from '@/lib/validation';
import { meetsIdentityTrustThreshold } from '@/lib/validation/rules';
import {
    AiOptOutSectionItem,
    ClaimGeneratorSectionItem,
    CopyrightSectionItem,
    HistorySectionItem,
    ManifestCawgAssertion,
    OrganizationSectionItem,
    WorkSectionItem,
} from '../models';
import { hasPublishedAction, selectActionsAssertion } from './actionsSelectors';
import { selectAiOptOutSection } from './aiOptOutSelectors';
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
 *  - that identity's verdict clears `identityTrustMode`'s bar (default
 *    `'relaxed'`: `Trusted` or `Valid`; `'strict'`: `Trusted` only). Below
 *    that bar, this section - title, badge and all - does not appear rather
 *    than showing a claim this app cannot vouch for to the configured degree.
 *
 * `showCreativeWork` (default on) additionally gates the unguarded
 * `organization` field (Organization Details: website/identifier/LEI/ISO
 * 6523) - unrelated to the trust threshold above.
 *
 * @param manifest - The manifest containing organization-related assertions
 * @param manifestStore - Optional manifest store used for CAWG validation status
 * @param adapterKind - Which adapter produced this result
 * @param identityTrustMode - How strict the identity verdict must be (see `meetsIdentityTrustThreshold`)
 * @param showCreativeWork - Whether to include CreativeWork-derived organization details
 * @param showUnverifiedIdentity - Whether an `'Unknown'` verdict also clears the bar (see `resolveShowUnverifiedIdentity`)
 * @returns Structured organization section data, or null unless a sufficiently-trusted X.509 cawg.identity is present
 */
export function selectOrganizationSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
    identityTrustMode: IdentityTrustMode = 'relaxed',
    showCreativeWork: boolean = true,
    showUnverifiedIdentity: boolean = false,
): OrganizationSectionItem | null {
    const x509Assertion = selectX509CawgAssertion(manifest);

    if (!x509Assertion) {
        return null;
    }

    const cawg = selectOrganizationIdentity(
        manifest,
        manifestStore,
        adapterKind,
        identityTrustMode,
        showCreativeWork,
        showUnverifiedIdentity,
    );

    if (!cawg || !meetsIdentityTrustThreshold(cawg.validationStatus, identityTrustMode, showUnverifiedIdentity)) {
        return null;
    }

    const organization = showCreativeWork ? selectCreativeWorkOrganization(manifest) : null;
    const { title, titleHint } = resolveOrganizationTitle(manifest, x509Assertion);

    return {
        organization,
        cawg,
        title,
        titleHint,
    };
}

/**
 * Select the copyright/credit section model, derived from the schema.org
 * shape of `cawg.metadata` (copyrightHolder, publisher, creditText,
 * copyrightNotice). `selectOrganizationIdentity` only populates this field
 * when the referencing `cawg.identity` clears `identityTrustMode`'s bar, so
 * this section is null (and hidden) for any lesser verdict. Unaffected by
 * `showCreativeWork`: `cawg.metadata` is not CreativeWork-derived.
 *
 * @param manifest - The manifest containing CAWG assertions
 * @param manifestStore - Optional manifest store used to compute CAWG validation status
 * @param adapterKind - Which adapter produced this result
 * @param identityTrustMode - How strict the identity verdict must be (see `meetsIdentityTrustThreshold`)
 * @param showUnverifiedIdentity - Whether an `'Unknown'` verdict also clears the bar (see `resolveShowUnverifiedIdentity`)
 * @returns Structured copyright section data, or null when absent or below the trust threshold
 */
export function selectCopyrightSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
    identityTrustMode: IdentityTrustMode = 'relaxed',
    showUnverifiedIdentity: boolean = false,
): CopyrightSectionItem | null {
    const cawg = selectOrganizationIdentity(
        manifest,
        manifestStore,
        adapterKind,
        identityTrustMode,
        true,
        showUnverifiedIdentity,
    );

    if (!cawg?.copyright) {
        return null;
    }

    return { copyright: cawg.copyright, validationStatus: cawg.validationStatus };
}

/**
 * Select the work/authors section model from CreativeWork data and the
 * optional CAWG role.
 *
 * `showCreativeWork` (default on) gates the CreativeWork-derived fields
 * (authors, organization name) - not `role`, which comes from the identity
 * assertion itself, not CreativeWork, and is shown regardless.
 *
 * @param manifest - The manifest containing CreativeWork and CAWG assertions
 * @param manifestStore - Optional manifest store used to compute CAWG status
 * @param adapterKind - Which adapter produced this result
 * @param showCreativeWork - Whether to include CreativeWork-derived authors/organization name
 * @returns Structured work section data, or null when no author or role data exists
 */
export function selectWorkSection(
    manifest: Manifest,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
    showCreativeWork: boolean = true,
): WorkSectionItem | null {
    const authors = showCreativeWork ? selectCreativeWorkAuthors(manifest) : [];
    const organization = showCreativeWork ? selectCreativeWorkOrganization(manifest) : null;
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

/**
 * Whether Organization Identity, Copyright or AI opt-out have real content
 * sitting behind an `'Unknown'` `cawg.identity` verdict that the current
 * `showUnverifiedIdentity` setting is keeping off screen - so the menu can
 * say *something* is being withheld without saying what.
 *
 * Asks the same three selectors that build those sections, rather than
 * keeping a second, hand-rolled copy of when they apply: `organizationSection`/
 * `copyrightSection`/`aiOptOutSection` are what the caller already computed
 * under the real settings (so passed in rather than recomputed here), and if
 * all three came back null, this calls the same selectors once more with
 * `showUnverifiedIdentity` forced to `true`. Whatever that second pass would
 * show is exactly what the first pass is withholding, and it can never
 * disagree with what those selectors actually gate on - there is no separate
 * rule to fall out of sync with theirs if any one of them changes later.
 *
 * @param manifest - The manifest containing CAWG assertions
 * @param organizationSection - What `selectOrganizationSection` already returned under the real settings
 * @param copyrightSection - What `selectCopyrightSection` already returned under the real settings
 * @param aiOptOutSection - What `selectAiOptOutSection` already returned under the real settings
 * @param manifestStore - Optional manifest store used to compute the CAWG verdict
 * @param adapterKind - Which adapter produced this result
 * @param identityTrustMode - How strict the identity verdict must be (see `meetsIdentityTrustThreshold`)
 * @param showCreativeWork - Whether to include CreativeWork-derived organization details (see `selectOrganizationSection`)
 * @param showUnverifiedIdentity - The current setting; the hint only appears while this is `false`
 * @returns Whether to show the "unverified info exists" hint
 */
export function selectWithheldIdentityHint(
    manifest: Manifest,
    organizationSection: OrganizationSectionItem | null,
    copyrightSection: CopyrightSectionItem | null,
    aiOptOutSection: AiOptOutSectionItem | null,
    manifestStore?: ManifestStore,
    adapterKind?: AdapterKind | null,
    identityTrustMode: IdentityTrustMode = 'relaxed',
    showCreativeWork: boolean = true,
    showUnverifiedIdentity: boolean = false,
): boolean {
    // Already showing under the real settings, or the flag is already on -
    // either way there is nothing left to withhold.
    if (showUnverifiedIdentity || organizationSection || copyrightSection || aiOptOutSection) {
        return false;
    }

    return (
        selectOrganizationSection(
            manifest,
            manifestStore,
            adapterKind,
            identityTrustMode,
            showCreativeWork,
            true,
        ) !== null ||
        selectCopyrightSection(manifest, manifestStore, adapterKind, identityTrustMode, true) !== null ||
        selectAiOptOutSection(manifest, manifestStore, adapterKind, identityTrustMode, true) !== null
    );
}

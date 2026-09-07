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

import { ValidationState } from "@/lib/types/c2pa.types";
import { Manifest, ManifestAssertion } from "@contentauth/c2pa-web";

type CawgRole = 'cawg.producer' | 'cawg.publisher' | 'cawg.editor';
type SigType = 'cawg.x509.cose';

export type ReferencedAssertion = {
    url: string;
    hash: number[];
};

export interface ManifestCawgAssertion extends ManifestAssertion {
    label: string;
    data: {
        signer_payload: {
            referenced_assertions: ReferencedAssertion[];
            sig_type: SigType;
        };
        role?: CawgRole | null;
        // Populated by @contentauth/c2pa-web's deeper COSE/certificate
        // parsing (monolithic, HLS). Live DASH sources (@svta/cml-c2pa)
        // only expose the raw signer_payload/signature bytes, with no
        // certificate-derived signer info — this field is absent there.
        signature_info?: {
            alg: string;
            issuer: string;
            cert_serial_number: string;
            revocation_status: boolean;
        } | null;
    } | null;
}

export interface OrganizationIdentityItem {
    name: string | null;
    website: string | null;
    identifier: string | null;
    leiCode: string | null;
    iso6523Code: string | null;
}

export interface PersonAuthorItem {
    name: string | null;
    skill: string | null;
    email: string | null;
    department: string | null;
    identifier: string | null;
}

export interface CreativeWorkContentItem {
    dateCreated: string | null;
    datePublished: string | null;
    license: string | null;
    organization: OrganizationIdentityItem | null;
}

export interface DublinCoreMetadataItem {
    title: string | null;
    publisher: string | null;
    rights: string | null;
    creator: string | null;
    description: string | null;
}

export interface CawgCopyrightHolderItem {
    name: string | null;
    sameAs: string[] | null;
}

export interface CawgCopyrightPublisherItem {
    name: string | null;
    legalName: string | null;
    alternateName: string | null;
    website: string | null;
}

/**
 * The schema.org-flavored shape `cawg.metadata` can take (as opposed to the
 * Dublin Core `dc:*` shape covered by `DublinCoreMetadataItem`). Either shape
 * can appear under the same assertion label.
 */
export interface CawgMetadataCopyrightItem {
    copyrightNotice: string | null;
    copyrightHolder: CawgCopyrightHolderItem | null;
    copyrightYear: number | null;
    creditText: string | null;
    publisher: CawgCopyrightPublisherItem | null;
}

export interface ClaimGeneratorItem {
    name: string;
    version: string | null;
}

export interface ClaimGeneratorSectionItem {
    products: ClaimGeneratorItem[];
}

export interface IngredientDisplayItem {
    index: number;
    title: string;
    issuer: string | null;
    date: string | null;
    claimGenerator: string | null;
    validationStatus: ValidationState | null;
    manifest?: Manifest;
    manifestRef?: string;
    ingredients?: IngredientDisplayItem[];
    ingredientCount?: number;
}

export interface HistorySectionItem {
    ingredients: IngredientDisplayItem[];
}

export interface CawgOrganizationItem {
    issuer: string | null;
    role?: CawgRole | null;
    creativeWork: CreativeWorkContentItem | null;
    dublinCore: DublinCoreMetadataItem | null;
    copyright: CawgMetadataCopyrightItem | null;
    validationStatus: ValidationState;
}

export interface OrganizationSectionItem {
    organization: OrganizationIdentityItem | null;
    cawg: CawgOrganizationItem | null;
    /** "Organization Identity", or "Publisher Identity" when this identity references a published c2pa.actions. */
    title: string;
    /** Explains an ambiguous case (published, but not referenced) as a tooltip; null otherwise. */
    titleHint: string | null;
}

export interface CopyrightSectionItem {
    copyright: CawgMetadataCopyrightItem;
    /** The referencing identity's verdict - never below the threshold that let this section render (see selectCopyrightSection), so only 'Trusted' or 'Valid' in practice. */
    validationStatus: ValidationState;
}

export interface WorkSectionItem {
    authors: PersonAuthorItem[];
    role: CawgRole | null;
    organizationName: string | null;
}

export interface AiOptOutEntryItem {
    key: string;
    label: string;
    use: 'allowed' | 'notAllowed' | 'constrained';
    description: string;
}

export interface AiOptOutAssertionItem {
    label: string;
    entries: AiOptOutEntryItem[];
}

export interface AiOptOutSectionItem {
    assertion: AiOptOutAssertionItem;
}

/**
 * One CAWG Identity Claims Aggregation (ICA) verified-identity claim
 * (`cawg.identity`'s `verifiedIdentities` entries, e.g. a social media
 * profile or a document-verification result).
 *
 * `type` is left as an open string rather than a union: the ICA spec defines
 * a fixed set today, but a manifest can declare a type this app has never
 * seen, and dropping it silently would be worse than rendering it plainly.
 * `displayName` is `username` (social media) or `name` (document
 * verification) normalized to one field, since only one is ever present.
 */
export interface VerifiedIdentityClaim {
    type: string;
    displayName: string | null;
    uri: string | null;
    verifiedAt: string | null;
    providerName: string | null;
}

/**
 * Verified-identity claims found on one manifest node (the active manifest,
 * or one ingredient, however deeply nested), labeled by where they came from
 * so claims from different signers in a provenance chain are never shown as
 * if they were one person.
 *
 * `validationStatus` is never `'Invalid'` here - a confirmed-broken
 * credential is withheld entirely rather than turned into a group. `Unknown`
 * (nothing checked this credential's signature) and `Valid` (checked, just
 * not on this app's trusted-issuer list) are both shown, each carrying its
 * own verdict, so a viewer isn't left unable to tell "no identity was
 * declared" from "one was declared but withheld".
 */
export interface CreatorIdentityGroup {
    source: string;
    claims: VerifiedIdentityClaim[];
    validationStatus: ValidationState;
}

export interface CreatorSectionItem {
    groups: CreatorIdentityGroup[];
}


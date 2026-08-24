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

import { ValidationState } from "@/types/c2pa.types";
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
    validationStatus: ValidationState;
}

export interface OrganizationSectionItem {
    organization: OrganizationIdentityItem | null;
    cawg: CawgOrganizationItem | null;
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

export interface LiveSegmentDiagnosticEntry {
    segmentNumber: number;
    mediaType: string;
    status: string;
    sequenceReason?: string;
    errorCodes?: string[];
    quality?: string;
}

export interface LiveSegmentDiagnosticsSectionItem {
    entries: LiveSegmentDiagnosticEntry[];
    truncatedCount: number;
}

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
        signature_info: {
            alg: string;
            issuer: string;
            cert_serial_number: string;
            revocation_status: boolean;
        };
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
    issuer: string;
    role?: CawgRole | null;
    creativeWork: CreativeWorkContentItem | null;
    authors: PersonAuthorItem[];
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

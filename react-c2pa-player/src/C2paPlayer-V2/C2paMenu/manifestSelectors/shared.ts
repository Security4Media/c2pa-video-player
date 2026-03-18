import { Manifest, ManifestAssertion } from '@contentauth/c2pa-web';
import { ManifestCawgAssertion } from '../models';

export const CAWG_ASSERTION_LABEL = 'cawg.identity';
export const CREATIVE_WORK_ASSERTION_LABEL = 'stds.schema-org.CreativeWork';

export interface SchemaDateTimeValue {
    value?: string | null;
}

export interface SchemaOccupation {
    skills?: string | null;
}

export interface SchemaAffiliation {
    value?: string | null;
    name?: string | null;
}

export interface SchemaPersonAuthor {
    '@type'?: 'Person';
    name?: string | null;
    hasOccupation?: SchemaOccupation | null;
    email?: string | null;
    affiliation?: SchemaAffiliation | null;
    identifier?: string | null;
}

export interface SchemaOrganizationAuthor {
    '@type'?: 'Organization';
    name?: string | null;
    url?: string | null;
    identifier?: string | null;
    leiCode?: string | null;
    iso6523Code?: string | null;
}

export interface ManifestCreativeWorkAssertion extends ManifestAssertion {
    label: typeof CREATIVE_WORK_ASSERTION_LABEL;
    data: {
        author?: Array<SchemaPersonAuthor | SchemaOrganizationAuthor> | null;
        dateCreated?: SchemaDateTimeValue | string | null;
        datePublished?: SchemaDateTimeValue | string | null;
        license?: string | null;
    } | null;
}

export function getReferencedAssertionLabels(cawgAssertion: ManifestCawgAssertion): string[] {
    return cawgAssertion.data?.signer_payload.referenced_assertions
        .filter(assertion => !assertion.url.includes('hash'))
        .map(assertion => assertion.url.split('/').pop()?.split('#')[0])
        .filter((label): label is string => Boolean(label)) ?? [];
}

export function selectCreativeWorkAssertion(manifest: Manifest): ManifestCreativeWorkAssertion | null {
    const creativeWorkAssertion = manifest.assertions?.find(
        assertion => assertion.label === CREATIVE_WORK_ASSERTION_LABEL
    ) as ManifestCreativeWorkAssertion | undefined;

    if (!creativeWorkAssertion?.data) {
        return null;
    }

    return creativeWorkAssertion;
}

export function extractDateValue(dateValue?: SchemaDateTimeValue | string | null): string | null {
    if (!dateValue) {
        return null;
    }

    if (typeof dateValue === 'string') {
        return dateValue;
    }

    return dateValue.value ?? null;
}

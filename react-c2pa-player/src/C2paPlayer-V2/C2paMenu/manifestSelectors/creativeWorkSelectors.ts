import { Manifest } from '@contentauth/c2pa-web';
import {
    CreativeWorkContentItem,
    OrganizationIdentityItem,
    PersonAuthorItem,
} from '../models';
import {
    extractDateValue,
    SchemaOrganizationAuthor,
    SchemaPersonAuthor,
    selectCreativeWorkAssertion,
} from './shared';

/**
 * Extract the organization entry from the CreativeWork assertion.
 * This maps the schema.org organization author to the dedicated
 * organization identity model used by the menu layer.
 *
 * @param {Manifest} manifest - The manifest that may contain a CreativeWork assertion
 * @returns {OrganizationIdentityItem | null} Organization metadata, or null when no organization author is present
 */
export function selectCreativeWorkOrganization(manifest: Manifest): OrganizationIdentityItem | null {
    const creativeWorkAssertion = selectCreativeWorkAssertion(manifest);
    const organization = creativeWorkAssertion?.data?.author?.find(
        author => author?.['@type'] === 'Organization'
    ) as SchemaOrganizationAuthor | undefined;

    if (!organization) {
        return null;
    }

    return {
        name: organization.name ?? null,
        website: organization.url ?? null,
        identifier: organization.identifier ?? null,
        leiCode: organization.leiCode ?? null,
        iso6523Code: organization.iso6523Code ?? null,
    };
}

/**
 * Extract person authors from the CreativeWork assertion.
 * Maps schema.org person entries to the menu author model, including
 * skill, email, department, and optional identifier fields.
 *
 * @param {Manifest} manifest - The manifest that may contain a CreativeWork assertion
 * @returns {PersonAuthorItem[]} Array of person authors, or an empty array when none are found
 */
export function selectCreativeWorkAuthors(manifest: Manifest): PersonAuthorItem[] {
    const creativeWorkAssertion = selectCreativeWorkAssertion(manifest);
    const authors = creativeWorkAssertion?.data?.author ?? [];

    return authors
        .filter((author): author is SchemaPersonAuthor => author?.['@type'] === 'Person')
        .map(author => ({
            name: author.name ?? null,
            skill: author.hasOccupation?.skills ?? null,
            email: author.email ?? null,
            department: author.affiliation?.value ?? author.affiliation?.name ?? null,
            identifier: author.identifier ?? null,
        }));
}

/**
 * Extract content-level metadata from the CreativeWork assertion.
 * This includes publication/creation dates, license, and the nested
 * organization model that represents the publishing organization.
 *
 * @param {Manifest} manifest - The manifest that may contain a CreativeWork assertion
 * @returns {CreativeWorkContentItem | null} Structured content metadata, or null if no CreativeWork assertion exists
 */
export function selectCreativeWorkContent(manifest: Manifest): CreativeWorkContentItem | null {
    const creativeWorkAssertion = selectCreativeWorkAssertion(manifest);

    if (!creativeWorkAssertion?.data) {
        return null;
    }

    return {
        dateCreated: extractDateValue(creativeWorkAssertion.data.dateCreated),
        datePublished: extractDateValue(creativeWorkAssertion.data.datePublished),
        license: creativeWorkAssertion.data.license ?? null,
        organization: selectCreativeWorkOrganization(manifest),
    };
}

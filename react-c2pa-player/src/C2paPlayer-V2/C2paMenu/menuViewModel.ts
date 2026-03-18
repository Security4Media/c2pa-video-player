import { C2PAStatus } from '@/types/c2pa.types';
import { getActiveManifest, getActiveManifestValidationStatus } from '../../services/c2pa_functions';
import {
    selectClaimGenerator,
    selectCreativeWorkAuthors,
    selectCreativeWorkContent,
    selectIngredients,
    selectOrganizationIdentity,
    selectSignatureIssuer,
    selectSignatureTime,
} from './C2paManifestFunctions';
import {
    CawgOrganizationItem,
    ClaimGeneratorItem,
    IngredientDisplayItem,
    OrganizationIdentityItem,
} from './models';

export const c2paMenuItems = {
    SIG_ISSUER: 'Issued by',
    DATE: 'Issued on',
    CLAIM_GENERATOR: 'App or device used',
    ORGANIZATION: 'Organization',
    NAME: 'Producer',
    CAWG_IDENTITY: 'Publisher Identity (CAWG)',
    TRAINING_OPTOUT: 'About AI training opt-out',
    INGREDIENTS: 'History of provenance',
    C2PA_VALIDATION_STATUS: 'Validation Status',
    ALERT: 'Alert',
} as const;

export type C2paMenuItemKey = keyof typeof c2paMenuItems;
export type C2paMenuMode = 'ready' | 'loading' | 'no-manifest' | 'invalid';

export interface C2paMenuValueMap {
    SIG_ISSUER: string | null;
    DATE: string | null;
    CLAIM_GENERATOR: string | null;
    ORGANIZATION: OrganizationIdentityItem | null;
    NAME: string | null;
    CAWG_IDENTITY: CawgOrganizationItem | null;
    TRAINING_OPTOUT: string | null;
    INGREDIENTS: IngredientDisplayItem[] | null;
    C2PA_VALIDATION_STATUS: string | null;
    ALERT: string | null;
}

export interface C2paMenuRenderState {
    mode: C2paMenuMode;
    manifestId: string | null;
    items: Partial<C2paMenuValueMap>;
    isInvalid: boolean;
}

function buildAlertMessage(compromisedRegions: string[]) {
    if (compromisedRegions.length > 0) {
        return `The segment between ${compromisedRegions.join(', ')} may have been tampered with`;
    }

    return null;
}

function formatSignatureDate(timeValue: string | null) {
    const date = timeValue ? new Date(timeValue) : null;

    return date
        ? new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        }).format(date)
        : null;
}

function formatClaimGenerators(claimGenerators: ClaimGeneratorItem[] | null) {
    return claimGenerators?.map(gen => (gen.version ? `${gen.name} ${gen.version}` : gen.name)).join(', ') ?? null;
}

function formatProducerNames(authors: Array<{ name: string | null }>) {
    return authors.length > 0 ? authors.map(author => author.name).filter(Boolean).join(', ') : null;
}

/**
 * Build the normalized render state consumed by the React menu tree.
 * The bridge passes raw player status into React, and this helper keeps
 * the mapping from manifest data to UI-facing values in one typed place.
 *
 * @param c2paStatus - Current C2PA player status payload
 * @param compromisedRegions - Human-readable compromised regions from the timeline
 * @returns Render state describing menu mode, manifest identity, and item values
 */
export function buildMenuRenderState(
    c2paStatus: C2PAStatus | null,
    compromisedRegions: string[],
): C2paMenuRenderState {
    const manifestStore = c2paStatus?.manifestStore ?? null;
    const hasDefinitiveNoManifest =
        (c2paStatus && !manifestStore) ||
        (manifestStore?.manifests && Object.keys(manifestStore.manifests).length === 0);

    if (hasDefinitiveNoManifest) {
        return {
            mode: 'no-manifest',
            manifestId: 'no-manifest',
            items: {},
            isInvalid: false,
        };
    }

    const activeManifest = manifestStore ? getActiveManifest(manifestStore) : null;
    if (!manifestStore || !activeManifest) {
        return {
            mode: 'loading',
            manifestId: manifestStore?.active_manifest ?? 'loading',
            items: {},
            isInvalid: false,
        };
    }

    const validationStatus = getActiveManifestValidationStatus(manifestStore);
    if (validationStatus === 'Invalid') {
        return {
            mode: 'invalid',
            manifestId: manifestStore.active_manifest ?? null,
            items: {},
            isInvalid: true,
        };
    }

    const claimGenerators = selectClaimGenerator(activeManifest);
    const authors = selectCreativeWorkAuthors(activeManifest);
    const creativeWorkContent = selectCreativeWorkContent(activeManifest);

    return {
        mode: 'ready',
        manifestId: manifestStore.active_manifest ?? null,
        items: {
            SIG_ISSUER: selectSignatureIssuer(activeManifest),
            DATE: formatSignatureDate(selectSignatureTime(activeManifest)),
            CLAIM_GENERATOR: formatClaimGenerators(claimGenerators),
            ORGANIZATION: creativeWorkContent?.organization ?? null,
            NAME: formatProducerNames(authors),
            CAWG_IDENTITY: selectOrganizationIdentity(activeManifest, manifestStore),
            TRAINING_OPTOUT: null,
            INGREDIENTS: selectIngredients(activeManifest, manifestStore),
            C2PA_VALIDATION_STATUS: validationStatus ?? 'Unknown',
            ALERT: buildAlertMessage(compromisedRegions),
        },
        isInvalid: false,
    };
}

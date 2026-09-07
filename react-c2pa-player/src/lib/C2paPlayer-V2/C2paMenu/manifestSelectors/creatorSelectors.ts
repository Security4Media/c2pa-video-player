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

import { Manifest, ManifestAssertion, ManifestStore } from '@contentauth/c2pa-web';
import { readIcaCredentialEvidence } from '@/lib/validation/evidence';
import type { ValidationState } from '@/lib/types/c2pa.types';
import { CreatorIdentityGroup, CreatorSectionItem, VerifiedIdentityClaim } from '../models';
import { CAWG_ASSERTION_LABEL, selectCawgAssertion } from './shared';

interface RawVerifiedIdentity {
    type?: string | null;
    username?: string | null;
    name?: string | null;
    uri?: string | null;
    verifiedAt?: string | null;
    provider?: { id?: string | null; name?: string | null } | null;
}

interface ManifestIcaAssertion extends ManifestAssertion {
    label: typeof CAWG_ASSERTION_LABEL;
    data: {
        type?: string[] | null;
        issuer?: string | null;
        verifiedIdentities?: RawVerifiedIdentity[] | null;
    } | null;
}

/**
 * `cawg.identity` can be an X.509/COSE hard-binding assertion (see
 * `ManifestCawgAssertion`, `signer_payload.referenced_assertions`) or a CAWG
 * Identity Claims Aggregation (ICA) Verifiable Credential - a different
 * shape entirely, with no `signer_payload` at all. `verifiedIdentities` is
 * the actual content this app cares about, so its presence is what
 * distinguishes the shape, not the declared `type` array (which a future ICA
 * spec revision could add entries to without changing this data).
 */
function selectIcaAssertion(manifest: Manifest): ManifestIcaAssertion | null {
    const assertion = selectCawgAssertion(manifest) as unknown as ManifestIcaAssertion | null;

    if (!assertion?.data || !Array.isArray(assertion.data.verifiedIdentities)) {
        return null;
    }

    return assertion;
}

function toVerifiedIdentityClaim(raw: RawVerifiedIdentity): VerifiedIdentityClaim | null {
    if (!raw?.type) {
        return null;
    }

    return {
        type: raw.type,
        displayName: raw.username ?? raw.name ?? null,
        uri: raw.uri ?? null,
        verifiedAt: raw.verifiedAt ?? null,
        providerName: raw.provider?.name ?? null,
    };
}

interface NodeEvaluation {
    claims: VerifiedIdentityClaim[];
    validationStatus: ValidationState;
}

/**
 * What this manifest node's ICA credential is worth claiming, and to whom.
 *
 * Deliberately evidence-driven rather than adapter-capability-gated: whether
 * an engine even attempts to verify an ICA credential varies by *engine*, not
 * by `AdapterKind` (nettrek's WebCrypto engine - used by both the monolithic
 * default and HLS - explicitly defers cryptographic verification of the ICA
 * form and "surfaces it unverified", per @nettrek/c2pa-web-crypto's own
 * README; only the standalone c2pa-web/WASM engine actually checks it and
 * emits `cawg.ica.credential_valid`). Reading the evidence itself - rather
 * than trying to keep a second, adapter-keyed capability table in sync with
 * that - naturally reports 'Unknown' wherever nothing was checked, without
 * this file needing to know which engine is in play.
 *
 * `manifestId` scopes the well-formedness check to this exact node: the same
 * code could otherwise match a different manifest's identity assertion
 * elsewhere in the store.
 */
function evaluateNode(
    manifest: Manifest,
    manifestId: string | undefined,
    manifestStore: ManifestStore,
    trustedIcaIssuers: ReadonlySet<string>,
): NodeEvaluation | null {
    const assertion = selectIcaAssertion(manifest);

    if (!assertion?.data) {
        return null;
    }

    const claims = (assertion.data.verifiedIdentities ?? [])
        .map(toVerifiedIdentityClaim)
        .filter((claim): claim is VerifiedIdentityClaim => claim !== null);

    if (claims.length === 0) {
        return null;
    }

    const issuerDid = assertion.data.issuer ?? null;
    const evidence = manifestId
        ? readIcaCredentialEvidence(manifestStore, manifestId)
        : { wellFormed: false, failed: false };

    const validationStatus: ValidationState = evidence.failed
        ? 'Invalid'
        : !evidence.wellFormed
            ? 'Unknown'
            : issuerDid !== null && trustedIcaIssuers.has(issuerDid)
                ? 'Trusted'
                : 'Valid';

    return { claims, validationStatus };
}

/**
 * A human-readable description of where an ingredient's claims came from.
 *
 * Deliberately does not fall back to the ingredient assertion's own `label`
 * (e.g. `"c2pa.ingredient.v3"`) the way `ingredientSelectors.ts`'s identical
 * title fallback does for the History section - that string is the
 * assertion's technical instance identifier, not a human-facing name, and
 * showing it read as if it were one ("Ingredient: c2pa.ingredient.v3").
 */
function describeIngredientSource(
    ingredientData: { title?: string | null; document_id?: string | null },
    index: number,
): string {
    const name = ingredientData.title || ingredientData.document_id || `Ingredient ${index}`;

    return `This content includes source content from ${name}`;
}

/**
 * Walks the active manifest and, recursively, every reachable ingredient
 * manifest (same resolve-by-`active_manifest`-id recursion as
 * `ingredientSelectors.ts`'s `selectIngredients`, applied here to collect
 * verified-identity claims instead of provenance-history summaries), adding
 * one group per node whose ICA credential has claims worth showing.
 *
 * Unlike Copyright/AI opt-out, a node is withheld only when its credential
 * is confirmed broken (`Invalid`) - `Unknown` (nothing checked this
 * credential's signature, e.g. today's default engine) and `Valid`
 * (checked, just not on this app's trusted-issuer list) are both shown,
 * each marked with its own verdict, rather than silently disappearing. A
 * viewer who sees no Creator section at all has no way to tell "nobody
 * claimed an identity" from "someone did, but I hid it" - showing the claim
 * with an honest badge is the same choice this app already makes for a
 * declared-but-unverified organization identity.
 */
function walkForCreatorGroups(
    manifest: Manifest,
    manifestId: string | undefined,
    manifestStore: ManifestStore,
    trustedIcaIssuers: ReadonlySet<string>,
    source: string,
    groups: CreatorIdentityGroup[],
): void {
    const evaluation = evaluateNode(manifest, manifestId, manifestStore, trustedIcaIssuers);

    if (evaluation && evaluation.validationStatus !== 'Invalid') {
        groups.push({ source, claims: evaluation.claims, validationStatus: evaluation.validationStatus });
    }

    manifest.ingredients?.forEach((ingredientData, index) => {
        const ref = ingredientData?.active_manifest;
        const ingredientManifest = ref ? manifestStore.manifests?.[ref] : null;

        if (!ingredientManifest) {
            return;
        }

        walkForCreatorGroups(
            ingredientManifest,
            ref ?? undefined,
            manifestStore,
            trustedIcaIssuers,
            describeIngredientSource(ingredientData, index + 1),
            groups,
        );
    });
}

/**
 * Select the Creator section: every CAWG ICA verified-identity claim found
 * on the active manifest or any of its ingredients, each labeled by source
 * and marked Trusted/Valid/Unknown per this app's own trusted-ICA-issuer
 * list (see `selectedIcaIssuerProvider`/`useTrustedIcaIssuers`) - the C2PA
 * engine has no DID trust-anchor concept, so that comparison happens here.
 *
 * @param manifest - The active manifest to start the walk from
 * @param manifestStore - Required: resolving ingredient manifests and reading well-formedness evidence both need it
 * @param trustedIcaIssuers - This app's own trusted issuer DIDs
 * @returns Structured creator section data, or null when nothing but confirmed-invalid credentials were found anywhere in the tree
 */
export function selectCreatorSection(
    manifest: Manifest,
    manifestStore: ManifestStore,
    trustedIcaIssuers: ReadonlySet<string>,
): CreatorSectionItem | null {
    const groups: CreatorIdentityGroup[] = [];

    walkForCreatorGroups(
        manifest,
        manifestStore.active_manifest ?? undefined,
        manifestStore,
        trustedIcaIssuers,
        'Active manifest',
        groups,
    );

    return groups.length > 0 ? { groups } : null;
}

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

import { Manifest, ManifestStore, ValidationState } from '@contentauth/c2pa-web';
import {
    getActiveManifest as getValidationActiveManifest,
    getManifestStoreValidationState,
    getValidationResultsForManifest,
} from '@/validation/rules';

function isUntrustedSigningCredentialFailure(result: { code?: string }) {
    return result.code === 'signingCredential.untrusted';
}

export { getValidationResultsForManifest };

export function getActiveManifestValidationStatus(manifestStore: ManifestStore): ValidationState {
    return getManifestStoreValidationState(manifestStore) as ValidationState;
}

const CAWG_IDENTITY_LABEL = 'cawg.identity';

function isCawgIdentityFailure(result: { code?: string; url?: string | null }) {
    return Boolean(result.code?.startsWith('cawg.identity.') || result.url?.includes(CAWG_IDENTITY_LABEL));
}

function isCawgIdentityUntrusted(result: { code?: string; url?: string | null }) {
    // Two spellings for one condition, because the two engines disagree. The
    // WASM engine reports the generic `signingCredential.untrusted` and only
    // the URL says it was the identity; the WebCrypto engine reports the
    // differentiated code directly (mirrors validation/rules.ts).
    return (
        result.code === 'cawg.identity.untrusted' ||
        (isUntrustedSigningCredentialFailure(result) && Boolean(result.url?.includes(CAWG_IDENTITY_LABEL)))
    );
}

/**
 * Status of the CAWG identity assertion's signer.
 *
 * Two manifest-store shapes have to be read, because the engines produce
 * different ones. The WASM engine (@contentauth/c2pa-web, monolithic) fills
 * `validation_results.activeManifest` with per-code success and failure lists,
 * including a positive `signingCredential.trusted`. The WebCrypto engine
 * (@nettrek/c2pa-web-crypto, HLS) leaves `validation_results` unset entirely
 * and reports only `validation_status`, a flat list of *failures*, alongside
 * the overall `validation_state`.
 *
 * Reading only the first shape meant every HLS stream fell through the
 * `if (!validationResults) return 'Invalid'` guard and displayed the identity
 * as invalid however it had actually validated - including streams whose
 * identity was checked against the trust list and passed.
 *
 * On the flat shape, absence is the signal: the identity is checked
 * independently of the media, so a stream whose fragments fail their BMFF hash
 * still reports `cawg.identity.untrusted` when the identity is not trusted.
 * No identity failure therefore means the identity passed every check the
 * engine ran, which is what 'Trusted' says here - a tampered fragment is the
 * asset's problem, reported separately, not the identity's.
 */
export function getCAWGValidationStatus(manifestStore: ManifestStore): ValidationState {
    const activeManifest = getActiveManifest(manifestStore);
    const cawgAssertion = activeManifest?.assertions?.find(
        assertion => assertion.label === CAWG_IDENTITY_LABEL
    );

    if (!cawgAssertion) {
        return 'Invalid';
    }

    const activeManifestResults = manifestStore.validation_results?.activeManifest;
    // Only the WASM engine fills these with coded entries. A store assembled
    // from an adapter's verdict (see manifestSourceDispatch.ts) carries a
    // code-less placeholder instead, and reading that as "no trusted code
    // present" reported every such identity as invalid.
    const hasCodedResults = [
        ...(activeManifestResults?.success ?? []),
        ...(activeManifestResults?.failure ?? []),
    ].some(result => Boolean(result?.code));

    if (activeManifestResults && hasCodedResults) {
        const successResults = activeManifestResults.success ?? [];
        const isWellFormed = successResults.some(
            result => result.code === 'cawg.identity.well-formed'
                && result.url?.includes(CAWG_IDENTITY_LABEL)
        );
        const isTrusted = successResults.some(
            result => result.code === 'signingCredential.trusted'
                && result.url?.includes(CAWG_IDENTITY_LABEL)
        );

        if (isWellFormed && isTrusted) {
            return 'Trusted';
        }

        if (isWellFormed && (activeManifestResults.failure ?? []).some(isCawgIdentityUntrusted)) {
            return 'Valid';
        }

        return 'Invalid';
    }

    const identityFailures = (manifestStore.validation_status ?? []).filter(isCawgIdentityFailure);

    if (identityFailures.length > 0) {
        // Well-formed but signed by someone not on the list is 'Valid': the
        // claim is readable and intact, just not vouched for. Anything else
        // wrong with the assertion makes it unusable.
        return identityFailures.every(isCawgIdentityUntrusted) ? 'Valid' : 'Invalid';
    }

    // Nothing was reported against the identity, so it passed every check that
    // ran. How far that goes is the store's own verdict to state: reaching
    // 'Trusted' requires the identity signer to be trusted too (an untrusted
    // one demotes the store to 'Valid'), so mirroring it never claims more
    // trust than was established.
    return manifestStore.validation_state === 'Trusted' ? 'Trusted' : 'Valid';
}

export function getIngredientValidationStatus(parentManifest: Manifest, ingredientManifestRef: string): ValidationState {
    const ingredient = parentManifest.ingredients?.filter(
        (candidate) => candidate.active_manifest === ingredientManifestRef
    );

    if (!ingredient || ingredient.length === 0) {
        console.warn(`[C2PA] No ingredient found in parent manifest ${parentManifest.id} for ingredient manifest reference ${ingredientManifestRef}`);
        return 'Invalid';
    }

    const validationResults = ingredient[0].validation_results;

    if (!validationResults || !validationResults.activeManifest) {
        console.warn(`[C2PA] No validation results found for ingredient manifest reference ${ingredientManifestRef}`);
        return 'Invalid';
    }

    const { success, failure } = getValidationResultsForManifest(validationResults.activeManifest);

    console.log(`[C2PA] Ingredient ${ingredientManifestRef} validation:`, {
        successCount: success.length,
        failureCount: failure.length,
        successCodes: (success as Array<{ code?: string }>).map((result) => result.code)
    });

    const typedFailure = failure as Array<{ code?: string }>;
    const typedSuccess = success as Array<{ code?: string }>;
    const hasOnlyUntrustedSigningCredentialFailures =
        typedFailure.length > 0 && typedFailure.every(isUntrustedSigningCredentialFailure);

    if (typedFailure.length > 0) {
        return hasOnlyUntrustedSigningCredentialFailures ? 'Valid' : 'Invalid';
    }

    if (typedSuccess.length > 0) {
        const hasSigningCredentialTrusted = typedSuccess.some(result => result.code === 'signingCredential.trusted');
        const hasIngredientManifestValidated = typedSuccess.some(result => result.code === 'ingredient.manifest.validated');

        if (hasSigningCredentialTrusted) {
            return 'Trusted';
        }

        if (!hasSigningCredentialTrusted && hasIngredientManifestValidated) {
            return 'Valid';
        }

        return 'Valid';
    }

    return 'Invalid';
}

export function getActiveManifest(manifestStore: ManifestStore): Manifest | null {
    return getValidationActiveManifest(manifestStore);
}

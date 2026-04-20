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

function isCawgIdentityUntrustedFailure(result: { code?: string; url?: string }) {
    return result.code === 'signingCredential.untrusted' && result.url?.includes('cawg.identity');
}

function isUntrustedSigningCredentialFailure(result: { code?: string }) {
    return result.code === 'signingCredential.untrusted';
}


export function getValidationResultsForManifest(validationDeltas: { success?: any[]; failure?: any[] } = {}) {
    return {
        success: validationDeltas.success || [],
        failure: validationDeltas.failure || [],
    };
}


/**
 * Compute the validation state for the active manifest directly from the
 * manifest store validation results.
 *
 * The logic mirrors ingredient validation, with one CAWG-specific exception:
 * a manifest is still considered valid when the only failure is an untrusted
 * signing credential on a `cawg.identity` assertion.
 *
 * @param {ManifestStore} manifestStore - The manifest store containing the active manifest and validation results
 * @returns {ValidationState} Validation status: 'Trusted', 'Valid', 'Invalid', or 'Unknown'
 */
export function getActiveManifestValidationStatus(manifestStore: ManifestStore): ValidationState {
    const validationResults = manifestStore?.validation_results?.activeManifest;

    if (!validationResults) {
        return 'Invalid';
    }

    const { success, failure } = getValidationResultsForManifest(validationResults);
    const hasOnlyCawgIdentityUntrustedFailure =
        failure.length > 0 && failure.every(isCawgIdentityUntrustedFailure);

    if (failure.length > 0 && !hasOnlyCawgIdentityUntrustedFailure) {
        return 'Invalid';
    }

    if (success.length === 0) {
        return failure.length > 0 ? 'Valid' : 'Invalid';
    }

    const hasTimeStampTrusted = success.some(result => result.code === 'timeStamp.trusted');
    const hasSigningCredentialTrusted = success.some(result => result.code === 'signingCredential.trusted');
    const hasClaimSignatureValidated = success.some(result =>
        ['claimSignature.validated', 'assertion.hashedURI.match', 'c2pa.hash.data.match'].includes(result.code)
    );

    if (hasTimeStampTrusted && hasSigningCredentialTrusted) {
        return 'Trusted';
    }

    if (hasClaimSignatureValidated || hasOnlyCawgIdentityUntrustedFailure || success.length > 0) {
        return 'Trusted';
    }

    return 'Invalid';
}



export function getCAWGValidationStatus(manifestStore: ManifestStore): ValidationState {
    const activeManifest = getActiveManifest(manifestStore);
    const cawgAssertion = activeManifest?.assertions?.find(
        assertion => assertion.label === 'cawg.identity'
    );

    if (!cawgAssertion) {
        return 'Invalid';
    }

    // Evaluate validation results for CAWG identity
    const validationResults = manifestStore.validation_results;
    if (!validationResults) {
        return 'Invalid';
    }

    //Check that the CAWG is Trusted : well fomed + trusted credentials  
    const activeManifestResults = validationResults.activeManifest;
    if (!activeManifestResults) {
        return 'Invalid';
    }

    const successResults = activeManifestResults.success;
    let isWellFormed, isTrusted = false;

    if (successResults && successResults.length > 0) {
        isTrusted = successResults.some(result =>
            result.code === 'signingCredential.trusted' && result.url?.includes('cawg.identity')
        );
        isWellFormed = successResults.some(result =>
            result.code === 'cawg.identity.well-formed' && result.url?.includes('cawg.identity')
        );
        if (isWellFormed && isTrusted) {
            return 'Trusted';
        }
    }

    //Check that the CAWG is Valid =  well formed + trusted credentials  
    if (isWellFormed) {
        const failureResults = activeManifestResults.failure;
        if (failureResults && failureResults.length > 0) {
            const isUntrusted = failureResults.some(result =>
                result.code === 'signingCredential.untrusted' && result.url?.includes('cawg.identity')
            );
            if (isUntrusted) {
                return 'Valid';
            }
        }
    }

    return 'Invalid';
}

/**
 * Get validation status for a specific ingredient manifest
 * @param {Manifest} parentManifest - The parent manifest containing the ingredient reference
 * @param {string} ingredientManifestRef - The manifest reference ID (e.g., 'urn:c2pa:0513dfb9-a76d-4ae1-aa1c-95f016dd58d7')
 * @param {ManifestStore} manifestStore - The manifest store containing validation results
 * @returns {ValidationState} Validation status: 'Trusted', 'Valid' or 'Invalid'
 */
export function getIngredientValidationStatus(parentManifest: Manifest, ingredientManifestRef: string): ValidationState {

    let ingredient = parentManifest.ingredients?.filter(ingredient => ingredient.active_manifest === ingredientManifestRef);
    
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
        successCodes: success.map(s => s.code)
    });

    const hasOnlyUntrustedSigningCredentialFailures =
        failure.length > 0 && failure.every(isUntrustedSigningCredentialFailure);

    // If failure is not empty and every failure is signingCredential.untrusted → Valid
    // Otherwise, any other failure combination is Invalid
    if (failure.length > 0) {
        return hasOnlyUntrustedSigningCredentialFailures ? 'Valid' : 'Invalid';
    }

    // If success is not empty AND failure is empty
    if (success.length > 0) {
        // const hasTimeStampTrusted = success.some(result => result.code === 'timeStamp.trusted');
        const hasSigningCredentialTrusted = success.some(result => result.code === 'signingCredential.trusted');
        const hasIngredientManifestValidated = success.some(result => result.code === 'ingredient.manifest.validated');

        // If success has signingCredential.trusted
        if (hasSigningCredentialTrusted) {
            return 'Trusted';
        }

        // If success does NOT have signingCredential.trusted
        // BUT has ingredient.manifest.validated → Valid
        if (!hasSigningCredentialTrusted && hasIngredientManifestValidated) {
            return 'Valid';
        }

        // Has some success but doesn't match Trusted or Valid criteria
        // This could be partial success, treat as Valid
        return 'Valid';
    }

    return 'Invalid';
}


export function getActiveManifest(manifestStore: ManifestStore): Manifest | null {
    if (!manifestStore?.active_manifest || !manifestStore?.manifests) {
        return null;
    }

    return manifestStore.manifests[manifestStore.active_manifest] ?? null;
}

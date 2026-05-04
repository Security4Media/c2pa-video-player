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

export function getCAWGValidationStatus(manifestStore: ManifestStore): ValidationState {
    const activeManifest = getActiveManifest(manifestStore);
    const cawgAssertion = activeManifest?.assertions?.find(
        assertion => assertion.label === 'cawg.identity'
    );

    if (!cawgAssertion) {
        return 'Invalid';
    }

    const validationResults = manifestStore.validation_results;
    if (!validationResults) {
        return 'Invalid';
    }

    const activeManifestResults = validationResults.activeManifest;
    if (!activeManifestResults) {
        return 'Invalid';
    }

    const successResults = activeManifestResults.success;
    let isWellFormed;
    let isTrusted = false;

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

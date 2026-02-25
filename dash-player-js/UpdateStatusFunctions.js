/**
 * This function tries to upgrade the C2PA validation status from "Valid" to "Trusted"
 * it tries also to upgrade the C2PA validation status from "Inalid" to "Trusted" in case invalidation comes from Non active manifests
 * The C2PA SDK v0.5.6 returns "Valid" for the validation_satate even when the signature is
 * trusted if CAWG signing credentials is untrusted. We want to distinguish between Cawg and C2PA
 * Trust states
 * @param manifestStore Manifest store object as returned by C2PA SDK
 * @returns 
 */

export function tryUpgradeToTrustedC2PAValidationStatus(manifestStore) {

    const validationResults = manifestStore.validation_results;
    if (!validationResults) {
        return 'Unknown';
    }

    if (manifestStore.validation_state === 'Invalid') { 
        return 'Invalid';
    }

    //Check that if C2PA is trusted
    const successResults = validationResults.activeManifest.success;

    if (successResults && successResults.length > 0) {
        const isTrusted = successResults.some(result => (result.code === 'signingCredential.trusted') && result.url.includes('c2pa.signature'));
        const isWellFormed = successResults.some(result => (result.code === 'claimSignature.validated') && result.url.includes('c2pa.signature'));
        let insideValidity = successResults.some(result => (result.code === 'claimSignature.insideValidity') && result.url.includes('c2pa.signature'));
        if (isWellFormed && isTrusted && insideValidity) {
            return 'Trusted';
        }
    }

    return manifestStore.validation_state;
}


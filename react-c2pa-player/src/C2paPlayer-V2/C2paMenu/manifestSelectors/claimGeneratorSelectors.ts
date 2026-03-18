import { Manifest } from '@contentauth/c2pa-web';
import { ClaimGeneratorItem } from '../models';

/**
 * Extract claim generator entries from the manifest without applying
 * any presentation formatting. The view layer is responsible for
 * deciding how to render names and versions.
 *
 * @param {Manifest} manifest - The manifest that may contain claim generator info
 * @returns {ClaimGeneratorItem[] | null} Array of claim generator models, or null when none are present
 */
export function selectClaimGenerator(manifest: Manifest): ClaimGeneratorItem[] | null {
    const claimGenerators = manifest.claim_generator_info;
    if (!Array.isArray(claimGenerators) || claimGenerators.length === 0) {
        return null;
    }

    return claimGenerators.map(generator => ({
        name: generator.name,
        version: generator.version ?? null,
    }));
}

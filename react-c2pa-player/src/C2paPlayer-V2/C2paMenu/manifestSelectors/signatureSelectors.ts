import { Manifest } from '@contentauth/c2pa-web';

/**
 * Extract the signature issuer from the manifest.
 *
 * @param {Manifest} manifest - The manifest that may contain signature info
 * @returns {string | null} Signature issuer, or null when unavailable
 */
export function selectSignatureIssuer(manifest: Manifest): string | null {
    return manifest.signature_info?.issuer ?? null;
}

/**
 * Extract the raw signature timestamp from the manifest.
 * The selector returns the original value so the view layer can decide
 * how to format or localize the date.
 *
 * @param {Manifest} manifest - The manifest that may contain signature info
 * @returns {string | null} Signature timestamp, or null when unavailable
 */
export function selectSignatureTime(manifest: Manifest): string | null {
    return manifest.signature_info?.time ?? null;
}

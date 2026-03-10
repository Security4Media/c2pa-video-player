import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import type { ManifestStore } from '@contentauth/c2pa-web';

// C2PA Web SDK is now imported as a module
// This service module provides functionality for C2PA validation in monolithic video files

const C2paSupportedMediaTypes = ['video'];

/**
 * This function tries to upgrade the C2PA validation status from "Valid" to "Trusted"
 * it tries also to upgrade the C2PA validation status from "Invalid" to "Trusted" in case invalidation comes from Non active manifests
 * The C2PA SDK v0.5.6 returns "Valid" for the validation_state even when the signature is
 * trusted if CAWG signing credentials is untrusted. We want to distinguish between Cawg and C2PA
 * Trust states
 * @param manifestStore Manifest store object as returned by C2PA SDK
 * @returns
 */
export function tryUpgradeToTrustedC2PAValidationStatus(manifestStore: ManifestStore) {
  const validationResults = manifestStore.validation_results;
  if (!validationResults) {
    return 'Unknown';
  }

  if (manifestStore.validation_state === 'Invalid') {
    return 'Invalid';
  }

  // Check that if C2PA is trusted
  const activeManifestResults = validationResults.activeManifest;
  if (!activeManifestResults) {
    return manifestStore.validation_state || 'Unknown';
  }
  
  const successResults = activeManifestResults.success;

  if (successResults && successResults.length > 0) {
    const isTrusted = successResults.some(
      (result: any) => result.code === 'signingCredential.trusted' && result.url.includes('c2pa.signature')
    );
    const isWellFormed = successResults.some(
      (result: any) => result.code === 'claimSignature.validated' && result.url.includes('c2pa.signature')
    );
    let insideValidity = successResults.some(
      (result: any) => result.code === 'claimSignature.insideValidity' && result.url.includes('c2pa.signature')
    );
    if (isWellFormed && isTrusted && insideValidity) {
      return 'Trusted';
    }
  }

  return manifestStore.validation_state;
}

/**
 * Initialize C2PA validation for monolithic video files
 * @param player Video element
 * @param onPlaybackTimeUpdated Callback for playback status updates
 */
export async function initializeC2PA(player: HTMLVideoElement, onPlaybackTimeUpdated: (e: any) => void) {
  try {
    // Fetch trust configuration files
    const [cawg_anchors, cawg_store, cawg_allowed] = await Promise.all([
      fetch('/trust/cawg_anchors.pem').then((res) => res.text()),
      fetch('/trust/cawg_store.cfg').then((res) => res.text()),
      fetch('/trust/cawg_allowed_extended.pem').then((res) => res.text()),
    ]);

    // Create C2PA instance with trust configuration using the imported createC2pa
    const c2pa = await createC2pa({
      wasmSrc,
      settings: {
        cawgTrust: {
          trustAnchors: cawg_anchors,
          trustConfig: cawg_store,
          allowedList: cawg_allowed
        },
        trust: {
          trustAnchors: [
            '/trust/c2pa_anchors.pem',
            'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem',
          ],
          allowedList: 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem',
          trustConfig: '/trust/c2pa_store.cfg',
        },
      },
    });

    // Extract manifest from video (monolithic file, extract once)
    let manifestStore = null;
    try {
      console.log(`[C2PA] Extracting manifest from video: ${player.src}`);
      const response = await fetch(player.src);
      const blob = await response.blob();
      const reader = await c2pa.reader.fromBlob(blob.type, blob);
      if (reader) {
        manifestStore = await reader.manifestStore();
      }
      console.log('[C2PA] Extracted manifest: ', manifestStore);
    } catch (err) {
      console.error('[C2PA] Error, manifest could not be extracted:', err);
    }

    // Create update event based on manifest content
    const createUpdateEvent = () => {
      let ret: any = {
        verified: true,
        details: {},
      };

      let detail: any = {
        manifestStore: null,
        error: null,
      };

      if (manifestStore == null) {
        detail['error'] = 'null validation_report';
      }

      detail['manifestStore'] = manifestStore;

      console.log('[C2PA] Store', manifestStore);

      if (manifestStore && (manifestStore.validation_state === 'Valid' || manifestStore.validation_state === 'Trusted')) {
        detail['valid'] = true;
      } else {
        detail['valid'] = false;
        if (manifestStore?.validation_status) {
          detail['error'] = manifestStore.validation_status
            .map((status: any) => `${status.code}: ${status.explanation}`)
            .join('; ');
        }
      }

      ret['details'][C2paSupportedMediaTypes as any] = detail;
      ret['validation_state'] = manifestStore?.validation_state || 'Unknown';

      console.log('[C2PA] Created c2pa update event:', ret);
      return ret;
    };

    const updateEvent = createUpdateEvent();

    // Update C2PA UI during timeupdate events
    player.addEventListener('timeupdate', function (e: any) {
      e['c2pa_status'] = updateEvent;
      onPlaybackTimeUpdated(e);
    });

    return { manifestStore, updateEvent };
  } catch (error) {
    console.error('[C2PA] Initialization error:', error);
    throw error;
  }
}

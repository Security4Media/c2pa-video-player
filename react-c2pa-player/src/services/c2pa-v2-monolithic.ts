/**
 * C2PA V2 Monolithic Plugin (TypeScript version)
 * Based on dash-player-js/monolithic-v2/c2pa-v2-monolithic-plugin.js
 * 
 * This module handles C2PA validation for monolithic video files.
 * It extracts the manifest once and validates it against trust anchors.
 */

import { createC2pa } from '@contentauth/c2pa-web';
import wasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import type { ManifestStore } from '@contentauth/c2pa-web';

import cawg_anchors from '/trust/cawg_anchors.pem?url';
import cawg_store   from '/trust/cawg_store.cfg?url';
import cawg_allowed from '/trust/cawg_allowed_extended.pem?url';
import c2pa_anchors from '/trust/c2pa_anchors_extended.pem?url';
import c2pa_store   from '/trust/c2pa_store.cfg?url';
import { getActiveManifestValidationStatus } from './c2pa_functions';


/**
 * Initialize C2PA validation for a video element
 * This matches the c2pa_init function from the HTML implementation
 * 
 * @param player - The HTML video element
 * @param onPlaybackTimeUpdated - Callback function that receives c2pa_status updates
 */
export async function c2pa_init(player: HTMLVideoElement, onPlaybackTimeUpdated: (e: any) => void) {
  try {
    
    // Fetch trust configuration files
    console.log('[C2PA Init] Trust configuration loaded');
    console.log('CAWG Anchors:', cawg_anchors);
    console.log('CAWG Store:', cawg_store);
    console.log('CAWG Allowed List:', cawg_allowed);
    

    // Create C2PA instance with trust configuration
    const c2pa = await createC2pa({
      wasmSrc,
      settings: {
        cawgTrust: {
          trustAnchors: [c2pa_anchors],
          allowedList: [cawg_allowed, 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem'],
          trustConfig: c2pa_store,
        },
        trust: {
          trustAnchors: [
            c2pa_anchors,
            'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem',
          ],
          allowedList: 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem',
          trustConfig: c2pa_store
        },
      },
    });

    console.log('[C2PA Init] C2PA instance created');

    // Extract manifest from video (monolithic file - extract once)
    let manifestStore: ManifestStore | null = null;
    try {
      console.log(`[C2PA Init] Extracting manifest from video: ${player.src}`);
      
      // Create blob from video src
      const response = await fetch(player.src);
      const blob = await response.blob();
      const reader = await c2pa.reader.fromBlob(blob.type, blob);
      
        if (reader) {
          manifestStore = await reader.manifestStore();
          if (manifestStore) {
          // HACK the validation state due to CAWG trust validation error.
          // Keep the SDK field untouched when our local status is Unknown,
          // because the SDK type does not accept that value.
          manifestStore.validation_state =  getActiveManifestValidationStatus(manifestStore);
        }
        console.log('[C2PA Init] Extracted manifest:', manifestStore);
      }
    } catch (err) {
      console.error('[C2PA Init] Error, manifest could not be extracted:', err);
    }

    // Create update event based on manifest content
    const createUpdateEvent = () => {
      return {
        manifestStore: manifestStore,
        validationState: manifestStore?.validation_state || 'Unknown',
      };

    };

    const updateEvent = createUpdateEvent();

    // Update C2PA UI during timeupdate events
    // This is the key integration point - attaching c2pa_status to the event
    player.addEventListener('timeupdate', function (e: any) {
      e['c2pa_status'] = updateEvent;
      onPlaybackTimeUpdated(e);
    });

    console.log('[C2PA Init] Initialization complete, timeupdate listener added');
  } catch (error) {
    console.error('[C2PA Init] Initialization error:', error);
    throw error;
  }
}

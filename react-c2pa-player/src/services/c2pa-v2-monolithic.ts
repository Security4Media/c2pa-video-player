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

import cawg_anchors from '../assets/trust/cawg_anchors.pem?raw';
import cawg_store from '../assets/trust/cawg_store.cfg?raw';
import cawg_allowed from '../assets/trust/cawg_allowed_extended.pem?raw';

import c2pa_anchors from '../assets/trust/c2pa_anchors.pem?url';
import c2pa_store from '../assets/trust/c2pa_store.cfg?url';

const C2paSupportedMediaTypes = ['video'];

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

    // Create C2PA instance with trust configuration
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
        console.log('[C2PA Init] Extracted manifest:', manifestStore);
      }
    } catch (err) {
      console.error('[C2PA Init] Error, manifest could not be extracted:', err);
    }

    // Create update event based on manifest content
    const createUpdateEvent = () => {
      const ret: any = {
        verified: true,
        details: {},
      };

      const detail: any = {
        manifestStore: null,
        error: null,
      };

      if (manifestStore == null) {
        detail['error'] = 'null validation_report';
      }

      detail['manifestStore'] = manifestStore;

      console.log('[C2PA Init] Manifest Store:', manifestStore);

      if (manifestStore && 
          (manifestStore.validation_state === 'Valid' || 
           manifestStore.validation_state === 'Trusted')) {
        detail['valid'] = true;
      } else {
        detail['valid'] = false;
        if (manifestStore?.validation_status) {
          detail['error'] = manifestStore.validation_status
            .map((status: any) => `${status.code}: ${status.explanation}`)
            .join('; ');
        }
      }

      ret['details'][C2paSupportedMediaTypes[0]] = detail;
      ret['validation_state'] = manifestStore?.validation_state || 'Unknown';

      console.log('[C2PA Init] Created c2pa update event:', ret);
      return ret;
    };

    const updateEvent = createUpdateEvent();

    // Update C2PA UI during timeupdate events
    // This is the key integration point - attaching c2pa_status to the event
    player.addEventListener('timeupdate', function (e: any) {
      e['c2pa_status'] = updateEvent;
      onPlaybackTimeUpdated(e);
    });

    console.log('[C2PA Init] Initialization complete, timeupdate listener added');

    return { manifestStore, updateEvent };
  } catch (error) {
    console.error('[C2PA Init] Initialization error:', error);
    throw error;
  }
}

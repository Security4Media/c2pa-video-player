import { createC2pa } from 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.5.6/+esm';

async function c2pa_init(player, onPlaybackTimeUpdated) {

    const C2paSupportedMediaTypes = ['video'];

    let [cawg_anchors, cawg_store] = await Promise.all([
        fetch('../../trust/cawg_anchors.pem').then(res => res.text()),
        fetch('../../trust/cawg_store.cfg').then(res => res.text())
    ]);


    /* Create C2PA instance */
    const c2pa = await createC2pa({
        wasmSrc: 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.5.6/dist/resources/c2pa_bg.wasm',
        settings: {
            cawgTrust: {
                trustAnchors: cawg_anchors,
                trustConfig: cawg_store,
            },
            trust: {
                trustAnchors: ['/trust/c2pa_anchors.pem', 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem'],
                allowedList: 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem',
                trustConfig: '/trust/c2pa_store.cfg',
            },

        }
    });

    /* Extract manifest from video. Since this is a monolithic file,
    we can extract manifest once */
    let manifestStore = null;
    try {
        console.log(`[C2PA] Extracting manifest from video: ${player.src}`);
        // create bolb from video src
        const response = await fetch(player.src);
        const blob = await response.blob();
        const reader = await c2pa.reader.fromBlob(blob.type, blob);
        manifestStore = await reader.manifestStore();
        console.log('[C2PA] Extracted manifest: ', manifestStore);
    } catch (err) {
        console.error('[C2PA] Error, manifest could not be extracted:', err);
    }

    /* Create update event based on manifest content, 
    to be passed to c2pa player UI */
    let createUpdateEvent = function () {
        let ret = {
            'verified': true,
            'details': {}
        };

        let detail = {
            'validation_state': "unknown",
            'manifestStore': null,
            'error': null,
        }

        if (manifestStore == null) {
            detail['error'] = 'null validation_report';
        }

        detail['manifestStore'] = manifestStore;

        console.log('[C2PA] Store', manifestStore);

        if (manifestStore.validation_state === 'Valid' || manifestStore.validation_state === 'Trusted') {
            detail['valid'] = true;
        } else {
            detail['valid'] = false;
            detail['error'] = manifestStore.validation_status.map(status => `${status.code}: ${status.explanation}`).join('; ')
        }

        ret['details'][C2paSupportedMediaTypes] = detail;
        ret['validation_state'] = manifestStore.validation_state;

        console.log('[C2PA] Created c2pa update event:', ret);
        return ret;
    };

    let updateEvent = createUpdateEvent();

    /* Update c2pa UI during timeupdate events */
    player.addEventListener('timeupdate', function (e) {
        e['c2pa_status'] = updateEvent;
        onPlaybackTimeUpdated(e);
    });


}

export { c2pa_init };

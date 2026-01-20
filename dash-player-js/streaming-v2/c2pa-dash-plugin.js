import IntervalTree from 'https://cdn.jsdelivr.net/npm/@flatten-js/interval-tree@1.0.20/dist/main.esm.js';
import { createC2pa } from 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.5.6/+esm';


async function c2pa_init(player, onPlaybackTimeUpdated) {
    const C2paSupportedMediaTypes = ['video', 'audio'];

    let tree = {};
    let initFragment = {};

    let currentQuality = {};
    for (const type of C2paSupportedMediaTypes) {
        currentQuality[type] = null;
    }

    let [cawg_anchors, cawg_store ] = await Promise.all([
        fetch('../../trust/cawg_anchors.pem').then(res => res.text()),
        fetch('../../trust/cawg_store.cfg').then(res => res.text())
    ]);

    //We delay the segment verification by 1 frame to keep into account video quality swtiches,
    //which are notified with 1 frame delay compared to playback
    let verificationTime = 0.0; 

    const c2pa = await createC2pa({
        wasmSrc: 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@0.5.6/dist/resources/c2pa_bg.wasm',
        settings: {
            cawgTrust: {
                trustAnchors: cawg_anchors,
                trustConfig:  cawg_store,
            },
            trust: {
                trustAnchors: ['/trust/c2pa_anchors.pem', 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem'],
                allowedList: 'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem',
                trustConfig: '/trust/c2pa_store.cfg',
            },

        }
    });

    player.extend('SegmentResponseModifier', function () {
        return {
            modifyResponseAsync: async function (chunk) {
                if (!C2paSupportedMediaTypes.includes(chunk.mediaInfo.type)) {
                    console.log('[C2PA] Unsupported C2PA media type ' + chunk.mediaInfo.type);
                    return Promise.resolve(chunk);
                }

                let tag = chunk.streamId + '-' + chunk.mediaInfo.type + '-' + chunk.representationId;

                console.log('[C2PA] Processing verification for ' + tag, chunk.start, chunk.end , c2pa);

                if (chunk.segmentType == 'InitializationSegment') {
                    //TODO: mimetype should change based on actual type from chunk
                    initFragment[tag] = new Blob([chunk.bytes], {type: 'video/mp4'});
                    console.log('[C2PA] Got init seg for ' + tag);
                    // deep copy init segment to new variable
                } else if (!(tag in initFragment)) {
                    console.error('[C2PA] initFragment is null for ' + tag);
                } else {

                    const reader = await c2pa.reader.fromBlobFragment('video/mp4', initFragment[tag], chunk.bytes);
                    var manifest = await reader.manifestStore();
                    console.log('[C2PA/CAWG] Retrieved manifest for ', manifest);
                    
                    if (!(tag in tree))
                        tree[tag] = new IntervalTree();

                    const interval = [chunk.start, chunk.end];
                    const c2paInfo = { 'type': chunk.segmentType, 
                        'manifest': manifest,
                        'interval': [chunk.start, chunk.end],
                    };

                    tree[tag].search(interval).forEach((seg) => {
                        if (seg.interval[0] == interval[0] && seg.interval[1] == interval[1]) {
                            console.info('[C2PA] Segment already exists in tree, removing', interval);
                            tree[tag].remove(interval, seg);
                        }
                    });

                    tree[tag].insert(interval, c2paInfo);

                    if (currentQuality[chunk.mediaInfo.type] === null) {
                        currentQuality[chunk.mediaInfo.type] = chunk.representationId;
                    }

                    console.log('[C2PA] Completed verification for ' + tag, chunk.start, chunk.end, manifest);
                }

                return Promise.resolve(chunk);
            }
        };
    });

    player.on(dashjs.MediaPlayer.events['QUALITY_CHANGE_RENDERED'], function (e) {
        console.log('[C2PA] Video quality changed for type ' + e.mediaType, player.getCurrentTrackFor(e.mediaType).bitrateList[e.newQuality].id);
        currentQuality[e.mediaType] = player.getCurrentTrackFor(e.mediaType).bitrateList[e.newQuality].id;
    });

    player.on(dashjs.MediaPlayer.events['PLAYBACK_ENDED'], function (e) {
        console.log('[C2PA] Playback ended');
        verificationTime = 0.0;
    });

    player.on(dashjs.MediaPlayer.events['PLAYBACK_TIME_UPDATED'], function (e) {
        let ret = {
            'validation_state': undefined,
            'details': {}
        };

        let isUndefined = false;
        for (const type of C2paSupportedMediaTypes) {
            if (currentQuality[type] === null || verificationTime === null)
                continue;

            let representationId = currentQuality[type];
            let tag = e.streamId + '-' + type + '-' + representationId;

            console.log('[C2PA] Searching verification for ' + tag + ' at time ' + verificationTime);

            if (!(tag in tree)) {
                console.error('[C2PA] Cannot find ' + tag);
                continue
            }

            let detail = {
                'valid': undefined,
                'manifestStore': null,
                'error': null,
            };

            let segs = tree[tag].search([verificationTime, verificationTime + 0.01]);

            if (segs.length > 1) {
                const interval = segs[0].interval;
                for (let i = 1; i < segs.length; i++) {
                    if (segs[i].interval == interval) {
                        isUndefined = true;
                        break;
                    }
                }
                if (isUndefined) {
                    console.info('[C2PA] Retrieved unexpected number of segments: ' + segs.length + ' for media type ' + type);
                    detail['error'] = 'Retrieved unexpected number of segments: ' + segs.length + ' for media type ' + type;
                    ret['details'][type] = detail;
                    continue;
                }
            }
            
            if (segs.length == 0) {
                console.info('[C2PA] No segment found for media type ' + type);
                detail['error'] = 'No segment found for media type ' + type;
                ret['details'][type] = detail;
                isUndefined = true;
                continue;
            }

            let manifestStore = segs[0].manifest;

            
            if (manifestStore == null)
                detail['error'] = 'null manifestStore';
            
            detail['manifestStore'] = manifestStore;
            
            if (manifestStore.validation_state === 'Valid' || manifestStore.validation_state === 'Trusted') {
                detail['valid'] = true;
            } else {
                detail['valid'] = false;
                detail['error'] = manifestStore.validation_status.map(status => `${status.code}: ${status.explanation}`).join('; ')
            }

            ret['details'][type] = detail;
            ret['validation_state'] = manifestStore.validation_state;
        }

        if (isUndefined) {
            ret['validation_state'] = undefined;
        }

        console.log('[C2PA] Verification result: ', ret);

        e['c2pa_status'] = ret;
        onPlaybackTimeUpdated(e);
        verificationTime = e.time;
    });
}

export { c2pa_init };

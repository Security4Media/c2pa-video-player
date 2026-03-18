/**
 * @module c2pa-player
 * @param {object=} videoJsPlayer - videojs reference
 * @param {object=} videoHtml - video html element
 */

import { initializeC2PAControlBar } from './C2paControlBar/C2paControlBarFunctions.js';
import { displayFrictionOverlay, initializeFrictionOverlay } from './C2paFrictionModal/C2paFrictionModalFunctions.js';
import { adjustC2PAMenu, disposeC2PAMenu, initializeC2PAMenu, updateC2PAMenu } from './C2paMenu/C2paMenuFunctions.js';
import { getTimelineFunctions } from './C2paTimeline/C2paTimelineFunctions.js';

export var C2PAPlayer = function (
    videoJsPlayer,
    videoHtml,
    isMonolithic = false
) {
    //Video.js player instance
    let videoPlayer = videoJsPlayer;
    const videoElement = videoHtml;

    //c2pa menu and control bar elements
    let c2paMenu;
    let c2paControlBar;
    let { getCompromisedRegions, handleC2PAValidation, handleOnSeeked, handleOnSeeking, updateC2PATimeline } = getTimelineFunctions();

    //An overlay to be shown to the user in case the initial manifest validation fails
    //Used to warn the user the content cannot be trusted
    let frictionOverlay;
    let isManifestInvalid = false; //TODO: placeholder, this should be set based on info from the c2pa validation

    let seeking = false;
    let playbackStarted = false;
    let lastPlaybackTime = 0.0;

    //A playback update above this threshold is considered a seek
    const minSeekTime = 0.5;

    //Adjust height of c2pa menu with respect to the whole player
    const c2paMenuHeightOffset = 30;

    // Store interval ID for cleanup
    let menuAdjustInterval = null;

    let setPlaybackStarted = function () {
        playbackStarted = true;
    }

    //Public API
    return {
        initialize: function () {
            console.log('[C2PA] Initializing C2PAPlayer', videoPlayer, videoElement);
            console.log('[C2PA] videoPlayer.controlBar:', videoPlayer.controlBar);

            //Initialize c2pa timeline and menu
            console.log('[C2PA] Calling initializeC2PAControlBar...');
            initializeC2PAControlBar(videoPlayer);
            console.log('[C2PA] Calling initializeC2PAMenu...');
            initializeC2PAMenu(videoPlayer);
            //Initialize friction overlay to be displayed if initial manifest validation fails
            frictionOverlay = initializeFrictionOverlay(videoPlayer, setPlaybackStarted);

            //Get c2pa menu and control bar elements from html
            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar =
                videoPlayer.controlBar.progressControl.seekBar.getChild(
                    'C2PALoadProgressBar'
                );

            console.log('[C2PA] Components retrieved - c2paMenu:', c2paMenu, 'c2paControlBar:', c2paControlBar);

            videoPlayer.on('play', function () {
                if (isManifestInvalid && !playbackStarted) {
                    console.log(
                        '[C2PA] Manifest invalid, displaying friction overlay'
                    );
                    displayFrictionOverlay(playbackStarted, videoPlayer, frictionOverlay);
                } else {
                    setPlaybackStarted();
                }
            });

            videoPlayer.on('seeked', function () {
                seeking = handleOnSeeked(videoPlayer.currentTime());
            });

            videoPlayer.on('seeking', function () {
                let seekResults = handleOnSeeking(videoPlayer.currentTime(), playbackStarted, lastPlaybackTime, isMonolithic, c2paControlBar, videoPlayer);
                seeking = seekResults[0];
                lastPlaybackTime = seekResults[1];
            });

            //Resize the c2pa menu
            //TODO: This is a workaround to resize the menu, as the menu is not resized when the player is resized
            menuAdjustInterval = setInterval(function () {
                adjustC2PAMenu(c2paMenu, videoElement, c2paMenuHeightOffset);
            }, 500);
            adjustC2PAMenu(c2paMenu, videoElement, c2paMenuHeightOffset);

            console.log('[C2PA] Initialization complete');
        },

        dispose: function () {
            console.log('[C2PA] Disposing C2PAPlayer');

            // Clear the menu adjustment interval
            if (menuAdjustInterval) {
                clearInterval(menuAdjustInterval);
                menuAdjustInterval = null;
            }

            disposeC2PAMenu();

            // Remove C2PA UI components from Video.js player
            try {
                if (c2paMenu && videoPlayer && videoPlayer.controlBar) {
                    videoPlayer.controlBar.removeChild('C2PAMenuButton');
                }
                if (c2paControlBar && videoPlayer && videoPlayer.controlBar && videoPlayer.controlBar.progressControl) {
                    videoPlayer.controlBar.progressControl.seekBar.removeChild('C2PALoadProgressBar');
                }
            } catch (error) {
                console.warn('[C2PA] Error removing UI components:', error);
            }

            // Reset state
            c2paMenu = null;
            c2paControlBar = null;
            seeking = false;
            playbackStarted = false;
            lastPlaybackTime = 0.0;
            isManifestInvalid = false;

            console.log('[C2PA] Disposal complete');
        },

        //Playback update with updates on c2pa manifest and validation
        playbackUpdate: function (c2paStatus) {
            const currentTime = videoPlayer.currentTime();

            //We only update the c2pa timeline if the playback is not seeking and the playback time has increased
            if (
                !seeking &&
                currentTime >= lastPlaybackTime &&
                currentTime - lastPlaybackTime < minSeekTime
            ) {
                console.log(
                    '[C2PA] Validation update: ',
                    lastPlaybackTime,
                    currentTime
                );
                //Creates new c2pa progress segment to be added to the progress bar
                handleC2PAValidation(c2paStatus.verificationStatus, currentTime, c2paControlBar);
                //Update c2pa progress timeline
                updateC2PATimeline(currentTime, videoPlayer, c2paControlBar);
                //Update c2pa menu based on manifest
                updateC2PAMenu(c2paStatus, c2paMenu, isMonolithic, videoPlayer, getCompromisedRegions,);
            }

            lastPlaybackTime = currentTime;
        },
    };
};



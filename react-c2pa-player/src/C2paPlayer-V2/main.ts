/**
 * @module c2pa-player
 */

import type { C2PAPlayerProps, C2PAStatus } from '../types/c2pa.types';
import type {
    GetCompromisedRegions,
    VideoJsPlayerLike,
} from './C2paMenu/C2paMenu.types';
import { initializeC2PAControlBar } from './C2paControlBar/C2paControlBarFunctions.js';
import {
    displayFrictionOverlay,
    initializeFrictionOverlay,
} from './C2paFrictionModal/C2paFrictionModalFunctions.js';
import {
    adjustC2PAMenu,
    disposeC2PAMenu,
    initializeC2PAMenu,
    updateC2PAMenu,
} from './C2paMenu/C2paMenuFunctions.js';
import { getTimelineFunctions } from './C2paTimeline/C2paTimelineFunctions.js';

interface TimelineComponentLike {
    el(): HTMLElement;
}

interface SeekBarLike {
    addChild(name: string): void;
    getChild(name: string): TimelineComponentLike | null;
    removeChild(name: string): void;
}

interface ProgressControlLike {
    seekBar: SeekBarLike;
}

interface ControlBarLike {
    addChild(name: string, options?: Record<string, unknown>, index?: number): unknown;
    children(): unknown[];
    getChild(name: string): TimelineComponentLike | null;
    progressControl: ProgressControlLike;
    removeChild(name: string): void;
}

interface C2PAVideoJsPlayer extends VideoJsPlayerLike {
    controlBar: ControlBarLike;
    currentTime(): number;
    duration(): number;
    on(eventName: string, handler: () => void): void;
    pause(): void;
    play(): void;
}

interface TimelineFunctions {
    getCompromisedRegions: GetCompromisedRegions;
    handleC2PAValidation: (
        verificationStatus: string,
        currentTime: number,
        c2paControlBar: TimelineComponentLike,
    ) => void;
    handleOnSeeked: (time: number) => boolean;
    handleOnSeeking: (
        time: number,
        playbackStarted: boolean,
        lastPlaybackTime: number,
        isMonolithic: boolean,
        c2paControlBar: TimelineComponentLike,
        videoPlayer: C2PAVideoJsPlayer,
    ) => [boolean, number];
    updateC2PATimeline: (
        currentTime: number,
        videoPlayer: C2PAVideoJsPlayer,
        c2paControlBar: TimelineComponentLike,
    ) => void;
}

export interface C2PAPlayerInstance {
    initialize: () => void;
    dispose: () => void;
    playbackUpdate: (status: C2PAStatus | null) => void;
}

/**
 * Create the C2PA player V2 runtime that wires Video.js events, the menu,
 * the validation timeline, and the friction overlay together.
 *
 * @param videoJsPlayer - Video.js player instance
 * @param videoHtml - Video element hosted by the player
 * @param isMonolithic - Whether the content uses monolithic C2PA validation
 * @returns Player lifecycle and playback update API
 */
export const C2PAPlayer = function (
    videoJsPlayer: C2PAVideoJsPlayer,
    videoHtml: C2PAPlayerProps['videoElement'],
    isMonolithic = false,
): C2PAPlayerInstance {
    const videoPlayer = videoJsPlayer;
    const videoElement = videoHtml;

    let c2paMenu: TimelineComponentLike | null = null;
    let c2paControlBar: TimelineComponentLike | null = null;
    const {
        getCompromisedRegions,
        handleC2PAValidation,
        handleOnSeeked,
        handleOnSeeking,
        updateC2PATimeline,
    } = getTimelineFunctions() as TimelineFunctions;

    let frictionOverlay: HTMLElement | null = null;
    let isManifestInvalid = false;

    let seeking = false;
    let playbackStarted = false;
    let lastPlaybackTime = 0.0;

    const minSeekTime = 0.5;
    const c2paMenuHeightOffset = 30;

    let menuAdjustInterval: ReturnType<typeof setInterval> | null = null;

    const setPlaybackStarted = function () {
        playbackStarted = true;
    };

    return {
        initialize: function () {
            console.log('[C2PA] Initializing C2PAPlayer', videoPlayer, videoElement);
            console.log('[C2PA] videoPlayer.controlBar:', videoPlayer.controlBar);

            initializeC2PAControlBar(videoPlayer);
            initializeC2PAMenu(videoPlayer);
            frictionOverlay = initializeFrictionOverlay(videoPlayer, setPlaybackStarted);

            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');

            console.log('[C2PA] Components retrieved - c2paMenu:', c2paMenu, 'c2paControlBar:', c2paControlBar);

            videoPlayer.on('play', function () {
                if (isManifestInvalid && !playbackStarted && frictionOverlay) {
                    console.log('[C2PA] Manifest invalid, displaying friction overlay');
                    displayFrictionOverlay(playbackStarted, videoPlayer, frictionOverlay);
                } else {
                    setPlaybackStarted();
                }
            });

            videoPlayer.on('seeked', function () {
                seeking = handleOnSeeked(videoPlayer.currentTime());
            });

            videoPlayer.on('seeking', function () {
                if (!c2paControlBar) {
                    return;
                }

                const [nextSeeking, nextPlaybackTime] = handleOnSeeking(
                    videoPlayer.currentTime(),
                    playbackStarted,
                    lastPlaybackTime,
                    isMonolithic,
                    c2paControlBar,
                    videoPlayer,
                );
                seeking = nextSeeking;
                lastPlaybackTime = nextPlaybackTime;
            });

            menuAdjustInterval = setInterval(function () {
                adjustC2PAMenu(c2paMenu, videoElement, c2paMenuHeightOffset);
            }, 500);
            adjustC2PAMenu(c2paMenu, videoElement, c2paMenuHeightOffset);

            console.log('[C2PA] Initialization complete');
        },

        dispose: function () {
            console.log('[C2PA] Disposing C2PAPlayer');

            if (menuAdjustInterval) {
                clearInterval(menuAdjustInterval);
                menuAdjustInterval = null;
            }

            disposeC2PAMenu();

            try {
                if (c2paMenu && videoPlayer && videoPlayer.controlBar) {
                    videoPlayer.controlBar.removeChild('C2PAMenuButton');
                }
                if (c2paControlBar && videoPlayer?.controlBar?.progressControl) {
                    videoPlayer.controlBar.progressControl.seekBar.removeChild('C2PALoadProgressBar');
                }
            } catch (error) {
                console.warn('[C2PA] Error removing UI components:', error);
            }

            c2paMenu = null;
            c2paControlBar = null;
            frictionOverlay = null;
            seeking = false;
            playbackStarted = false;
            lastPlaybackTime = 0.0;
            isManifestInvalid = false;

            console.log('[C2PA] Disposal complete');
        },

        playbackUpdate: function (c2paStatus) {
            const currentTime = videoPlayer.currentTime();

            if (
                !seeking &&
                currentTime >= lastPlaybackTime &&
                currentTime - lastPlaybackTime < minSeekTime &&
                c2paControlBar
            ) {
                console.log('[C2PA] Validation update: ', lastPlaybackTime, currentTime);
                handleC2PAValidation(
                    c2paStatus?.manifestStore?.validation_state ?? 'Unknown',
                    currentTime,
                    c2paControlBar,
                );
                updateC2PATimeline(currentTime, videoPlayer, c2paControlBar);
                updateC2PAMenu(
                    c2paStatus,
                    c2paMenu,
                    isMonolithic,
                    videoPlayer,
                    getCompromisedRegions,
                );
            }

            lastPlaybackTime = currentTime;
        },
    };
};

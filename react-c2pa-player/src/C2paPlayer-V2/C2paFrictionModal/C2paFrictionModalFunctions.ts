import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';
import { C2paFrictionOverlay } from './C2paFrictionOverlay';

interface FrictionOverlayPlayer extends VideoJsPlayerLike {
    play(): void;
    pause(): void;
}

export interface FrictionOverlayController {
    container: HTMLDivElement;
    root: Root;
    isVisible: boolean;
    onWatchAnyway: () => void;
}

function renderFrictionOverlay(
    frictionOverlay: FrictionOverlayController,
    onWatchAnyway: () => void,
) {
    frictionOverlay.root.render(createElement(C2paFrictionOverlay, {
        isVisible: frictionOverlay.isVisible,
        onWatchAnyway,
    }));
}

/**
 * Create and attach the friction overlay shown when the initial manifest
 * validation fails and playback should require explicit user confirmation.
 *
 * @param videoPlayer - Video.js player instance
 * @param setPlaybackStarted - Callback invoked when the user accepts playback
 * @returns Controller for the mounted React overlay
 */
export const initializeFrictionOverlay = function (
    videoPlayer: FrictionOverlayPlayer,
    setPlaybackStarted: () => void,
): FrictionOverlayController {
    const frictionOverlayContainer = document.createElement('div');
    const handleWatchAnyway = function () {
        frictionOverlay.isVisible = false;
        renderFrictionOverlay(frictionOverlay, frictionOverlay.onWatchAnyway);
        setPlaybackStarted();
        videoPlayer.play();
    };
    const frictionOverlay: FrictionOverlayController = {
        container: frictionOverlayContainer,
        root: createRoot(frictionOverlayContainer),
        isVisible: false,
        onWatchAnyway: handleWatchAnyway,
    };

    const playerContainer = videoPlayer.el();
    playerContainer?.appendChild(frictionOverlay.container);

    renderFrictionOverlay(frictionOverlay, handleWatchAnyway);

    return frictionOverlay;
};

/**
 * Display the friction overlay when the user has not yet accepted
 * playback for invalid content.
 *
 * @param playbackStarted - Whether playback has already been accepted
 * @param videoPlayer - Video.js player instance
 * @param frictionOverlay - Overlay controller created during initialization
 */
export const displayFrictionOverlay = function (
    playbackStarted: boolean,
    videoPlayer: FrictionOverlayPlayer,
    frictionOverlay: FrictionOverlayController,
): void {
    if (!playbackStarted) {
        videoPlayer.pause();
        frictionOverlay.isVisible = true;
        renderFrictionOverlay(frictionOverlay, frictionOverlay.onWatchAnyway);
    }
};

/**
 * Unmount and remove the React friction overlay from the player container.
 *
 * @param frictionOverlay - Overlay controller created during initialization
 */
export const disposeFrictionOverlay = function (
    frictionOverlay: FrictionOverlayController | null,
): void {
    if (!frictionOverlay) {
        return;
    }

    frictionOverlay.root.unmount();
    frictionOverlay.container.remove();
};

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';
import { C2PAPlayerRoot } from '../C2PAPlayerRoot';

interface FrictionOverlayPlayer extends VideoJsPlayerLike {
    play(): void;
    pause(): void;
}

export interface C2PAPlayerRootController {
    container: HTMLDivElement;
    root: Root;
    isFrictionOverlayVisible: boolean;
    onWatchAnyway: () => void;
}

function renderPlayerRoot(
    playerRoot: C2PAPlayerRootController,
    onWatchAnyway: () => void,
) {
    playerRoot.root.render(createElement(C2PAPlayerRoot, {
        isFrictionOverlayVisible: playerRoot.isFrictionOverlayVisible,
        onWatchAnyway,
    }));
}

function schedulePlayerRootUnmount(playerRoot: C2PAPlayerRootController) {
    setTimeout(() => {
        playerRoot.root.unmount();
        playerRoot.container.remove();
    }, 0);
}

/**
 * Create and attach the friction overlay shown when the initial manifest
 * validation fails and playback should require explicit user confirmation.
 *
 * @param videoPlayer - Video.js player instance
 * @param setPlaybackStarted - Callback invoked when the user accepts playback
 * @returns Controller for the mounted player-level React overlay root
 */
export const initializeFrictionOverlay = function (
    videoPlayer: FrictionOverlayPlayer,
    setPlaybackStarted: () => void,
): C2PAPlayerRootController {
    const playerRootContainer = document.createElement('div');
    const handleWatchAnyway = function () {
        playerRoot.isFrictionOverlayVisible = false;
        renderPlayerRoot(playerRoot, playerRoot.onWatchAnyway);
        setPlaybackStarted();
        videoPlayer.play();
    };
    const playerRoot: C2PAPlayerRootController = {
        container: playerRootContainer,
        root: createRoot(playerRootContainer),
        isFrictionOverlayVisible: false,
        onWatchAnyway: handleWatchAnyway,
    };

    const playerContainer = videoPlayer.el();
    playerContainer?.appendChild(playerRoot.container);

    renderPlayerRoot(playerRoot, handleWatchAnyway);

    return playerRoot;
};

/**
 * Display the friction overlay when the user has not yet accepted
 * playback for invalid content.
 *
 * @param playbackStarted - Whether playback has already been accepted
 * @param videoPlayer - Video.js player instance
 * @param playerRoot - Player overlay controller created during initialization
 */
export const displayFrictionOverlay = function (
    playbackStarted: boolean,
    videoPlayer: FrictionOverlayPlayer,
    playerRoot: C2PAPlayerRootController,
): void {
    if (!playbackStarted) {
        videoPlayer.pause();
        playerRoot.isFrictionOverlayVisible = true;
        renderPlayerRoot(playerRoot, playerRoot.onWatchAnyway);
    }
};

/**
 * Unmount and remove the React friction overlay from the player container.
 *
 * @param playerRoot - Player overlay controller created during initialization
 */
export const disposeFrictionOverlay = function (
    playerRoot: C2PAPlayerRootController | null,
): void {
    if (!playerRoot) {
        return;
    }

    schedulePlayerRootUnmount(playerRoot);
};

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';
import { C2PAPlayerRoot } from '../C2PAPlayerRoot';
import type {
    C2PAPlayerRootController,
    C2PAPlayerRootState,
} from '../C2PAPlayerRoot.types';

interface FrictionOverlayPlayer extends VideoJsPlayerLike {
    play(): void;
    pause(): void;
}

function schedulePlayerRootUnmount(playerRoot: C2PAPlayerRootController) {
    setTimeout(() => {
        playerRoot.root.unmount();
        playerRoot.container.remove();
    }, 0);
}

function createInitialPlayerRootState(): C2PAPlayerRootState {
    return {
        isFrictionOverlayVisible: false,
        isMenuOpen: false,
        c2paStatus: null,
        compromisedRegions: [],
        menuResetKey: 'initial',
        menuContentTarget: null,
    };
}

function createPlayerRootController(
    container: HTMLDivElement,
    root: Root,
    onWatchAnyway: () => void,
): C2PAPlayerRootController {
    let state = createInitialPlayerRootState();
    const listeners = new Set<() => void>();

    return {
        container,
        root,
        onWatchAnyway,
        getState: () => state,
        setState: (partialState) => {
            state = {
                ...state,
                ...partialState,
            };
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
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
    const root = createRoot(playerRootContainer);
    const handleWatchAnyway = function () {
        playerRoot.setState({
            isFrictionOverlayVisible: false,
        });
        setPlaybackStarted();
        videoPlayer.play();
    };
    const playerRoot = createPlayerRootController(
        playerRootContainer,
        root,
        handleWatchAnyway,
    );

    const playerContainer = videoPlayer.el();
    playerContainer?.appendChild(playerRoot.container);

    playerRoot.root.render(createElement(C2PAPlayerRoot, {
        controller: playerRoot,
        onWatchAnyway: handleWatchAnyway,
    }));

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
        playerRoot.setState({
            isFrictionOverlayVisible: true,
        });
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

/**
 * Publish the latest validation payload and timeline-derived compromised
 * regions into the shared player-root controller.
 *
 * @param playerRoot - Player overlay controller created during initialization
 * @param c2paStatus - Latest C2PA validation payload
 * @param compromisedRegions - Timeline-derived compromised regions
 */
export const updatePlayerRootValidationState = function (
    playerRoot: C2PAPlayerRootController | null,
    c2paStatus: C2PAPlayerRootState['c2paStatus'],
    compromisedRegions: C2PAPlayerRootState['compromisedRegions'],
): void {
    if (!playerRoot) {
        return;
    }

    playerRoot.setState({
        c2paStatus,
        compromisedRegions,
    });
};

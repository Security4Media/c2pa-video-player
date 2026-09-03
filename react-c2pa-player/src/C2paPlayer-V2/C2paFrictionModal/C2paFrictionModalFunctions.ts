/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

interface FrictionOverlayHandlers {
    /** Told when the viewer accepts, so the gate can record the run. */
    onConsentAccepted?: () => void;
    /** Pauses and opens the panel; the player layer owns both. */
    onAuthenticityLabelClick?: () => void;
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
        consentScope: 'whole-asset',
        consentCountdownSeconds: null,
        authenticityLabel: null,
        isMenuOpen: false,
        isDebugOpen: false,
        c2paStatus: null,
        timeline: {
            currentTime: 0,
            compromisedRegions: [],
            hasInvalidSegments: false,
            segments: [],
        },
        menuResetKey: 'initial',
        selectedSegment: null,
    };
}

function createPlayerRootController(
    container: HTMLDivElement,
    root: Root,
    onWatchAnyway: () => void,
    onAuthenticityLabelClick: () => void,
): C2PAPlayerRootController {
    let state = createInitialPlayerRootState();
    const listeners = new Set<() => void>();

    return {
        container,
        root,
        onWatchAnyway,
        onAuthenticityLabelClick,
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
 * @param handlers - Callbacks into the player layer, which owns pausing and the menu
 * @returns Controller for the mounted player-level React overlay root
 */
export const initializeFrictionOverlay = function (
    videoPlayer: FrictionOverlayPlayer,
    setPlaybackStarted: () => void,
    handlers: FrictionOverlayHandlers = {},
): C2PAPlayerRootController {
    const playerRootContainer = document.createElement('div');
    const root = createRoot(playerRootContainer);
    const handleWatchAnyway = function () {
        // Only the whole-asset question latches the legacy gate. Neither of
        // the mid-playback questions may: `playbackStarted` is a once-per-source
        // latch, so latching it on the first invalid stretch would shut the
        // legacy gate for good. The per-stream mode has its own latch inside
        // the gate, which is where a decision about consent belongs.
        const isMidPlayback = playerRoot.getState().consentScope !== 'whole-asset';

        playerRoot.setState({
            isFrictionOverlayVisible: false,
            consentCountdownSeconds: null,
        });

        if (!isMidPlayback) {
            setPlaybackStarted();
        }

        handlers.onConsentAccepted?.();
        videoPlayer.play();
    };
    const playerRoot = createPlayerRootController(
        playerRootContainer,
        root,
        handleWatchAnyway,
        handlers.onAuthenticityLabelClick ?? (() => {}),
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
 * Raise the consent question for a stretch of invalid content.
 *
 * Beside `displayFrictionOverlay` rather than inside it: that one is guarded by
 * `playbackStarted`, which is a once-per-source latch and therefore cannot ask
 * twice. This one has no such guard, because asking again for a different
 * stretch is the whole point.
 *
 * State only, no pause. The player layer holds playback, so that pausing and
 * resuming has exactly one writer - two of them on the same element is the
 * class of defect that put the validated-playback gate and this question in a
 * fight over the play button.
 *
 * Safe to call on every tick: it is a level, not an edge.
 *
 * @param playerRoot - Player overlay controller created during initialization
 * @param scope - Which claim to make, and whether to say it is the last warning
 * @param countdownSeconds - Seconds until withdrawal, or null when it will not
 */
export const requestConsent = function (
    playerRoot: C2PAPlayerRootController | null,
    scope: 'invalid-run' | 'invalid-stream',
    countdownSeconds: number | null,
): void {
    playerRoot?.setState({
        isFrictionOverlayVisible: true,
        consentScope: scope,
        consentCountdownSeconds: countdownSeconds,
    });
};

/**
 * Take the question down without an answer, because its budget ran out.
 *
 * Distinct from accepting: nothing is consented to, and `playbackStarted` is
 * untouched. The player layer resumes, and the gate remembers not to ask about
 * this stretch again - otherwise the same question would be raised and
 * withdrawn forever at a live edge that never leaves the bad content.
 *
 * @param playerRoot - Player overlay controller created during initialization
 */
export const withdrawConsent = function (
    playerRoot: C2PAPlayerRootController | null,
): void {
    playerRoot?.setState({
        isFrictionOverlayVisible: false,
        consentCountdownSeconds: null,
    });
};

/**
 * Publish what the authenticity label should say.
 *
 * @param playerRoot - Player overlay controller created during initialization
 * @param authenticityLabel - The label view, or null for no label
 */
export const updateAuthenticityLabel = function (
    playerRoot: C2PAPlayerRootController | null,
    authenticityLabel: C2PAPlayerRootState['authenticityLabel'],
): void {
    if (!playerRoot) {
        return;
    }

    // Field by field, not by identity: the gate builds a fresh view object on
    // every tick, so an identity check never matches and every tick would
    // re-render the whole overlay root - four times a second on a live source,
    // for a label that has usually not changed.
    const current = playerRoot.getState().authenticityLabel;
    const unchanged =
        current === authenticityLabel ||
        (current !== null &&
            authenticityLabel !== null &&
            current.state === authenticityLabel.state &&
            current.text === authenticityLabel.text &&
            current.expanded === authenticityLabel.expanded &&
            current.glowing === authenticityLabel.glowing);

    if (unchanged) {
        return;
    }

    playerRoot.setState({ authenticityLabel });
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
 * Publish the latest validation payload and timeline snapshot into the
 * shared player-root controller.
 *
 * @param playerRoot - Player overlay controller created during initialization
 * @param c2paStatus - Latest C2PA validation payload
 * @param timeline - Timeline snapshot derived from the imperative timeline
 */
export const updatePlayerRootValidationState = function (
    playerRoot: C2PAPlayerRootController | null,
    c2paStatus: C2PAPlayerRootState['c2paStatus'],
    timeline: C2PAPlayerRootState['timeline'],
): void {
    if (!playerRoot) {
        return;
    }

    playerRoot.setState({
        c2paStatus,
        timeline,
    });
};

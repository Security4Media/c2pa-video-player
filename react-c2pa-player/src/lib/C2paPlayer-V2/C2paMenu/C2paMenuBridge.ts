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

import type { C2PAStatus } from '@/lib/types/c2pa.types';
import type { C2PAPlayerRootController } from '../C2PAPlayerRoot.types';
import type {
    C2paMenuBridgeState,
    VideoJsMenuButtonComponentLike,
    VideoJsPlayerLike,
} from './C2paMenu.types';

function createInitialMenuState(): C2paMenuBridgeState {
    return {
        lastManifestId: null,
        isMenuOpen: false,
        isInvalid: false,
        resetVersion: 0,
        menuReference: null,
    };
}

const menuState: C2paMenuBridgeState = createInitialMenuState();
let playerRootController: C2PAPlayerRootController | null = null;

function createEmptyTimelineState() {
    return {
        currentTime: 0,
        compromisedRegions: [],
        hasInvalidSegments: false,
        segments: [],
    };
}

function resetMenuState() {
    menuState.lastManifestId = null;
    menuState.isMenuOpen = false;
    menuState.isInvalid = false;
    menuState.resetVersion = 0;
    menuState.menuReference = null;
}

function updateButtonValidationState(videoPlayer: VideoJsPlayerLike, isInvalid: boolean) {
    const c2paButton = videoPlayer.el()?.querySelector('.c2pa-menu-button button');
    if (!c2paButton) {
        return;
    }

    if (isInvalid) {
        c2paButton.classList.add('c2pa-menu-button-invalid');
    } else {
        c2paButton.classList.remove('c2pa-menu-button-invalid');
    }
}

function syncMenuStateToPlayerRoot(
    c2paStatus: C2PAStatus | null,
) {
    if (!playerRootController) {
        return;
    }

    playerRootController.setState({
        isMenuOpen: menuState.isMenuOpen,
        c2paStatus,
        menuResetKey: `${menuState.resetVersion}:${menuState.lastManifestId ?? 'none'}`,
    });
}

function getStatusManifestId(c2paStatus: C2PAStatus | null) {
    const manifestId =
        c2paStatus?.manifestStore?.active_manifest ??
        c2paStatus?.normalizedResult?.activeManifest?.id ??
        null;

    return typeof manifestId === 'string' ? manifestId : null;
}

function getStatusValidationState(c2paStatus: C2PAStatus | null) {
    return (
        c2paStatus?.validationState ??
        c2paStatus?.manifestStore?.validation_state ??
        c2paStatus?.normalizedResult?.validationState ??
        'Unknown'
    );
}

/**
 * Store the Video.js menu component reference used by the menu shell/bridge.
 *
 * @param c2paMenu - Video.js C2PA menu component instance
 */
export function setMenuReference(c2paMenu: VideoJsMenuButtonComponentLike | null) {
    if (!c2paMenu) {
        return;
    }

    menuState.menuReference = c2paMenu;
    syncMenuStateToPlayerRoot(
        playerRootController?.getState().c2paStatus ?? null,
    );
}

/**
 * Register the shared player root controller so the menu bridge can update
 * the single React state store instead of managing its own render root.
 *
 * @param controller - Player root controller mounted in the player container
 */
export function setPlayerRootController(controller: C2PAPlayerRootController | null) {
    playerRootController = controller;
    if (!playerRootController) {
        return;
    }

    syncMenuStateToPlayerRoot(
        playerRootController.getState().c2paStatus,
    );
}

/**
 * Mark the menu as open so bridge updates may render into the visible
 * popup while playback is progressing.
 */
export function handleMenuOpened() {
    menuState.isMenuOpen = true;
    playerRootController?.setState({
        isMenuOpen: true,
    });
}

/**
 * Closes the menu from outside video.js, but through video.js.
 *
 * Routed through `unpressButton` rather than writing `isMenuOpen: false`
 * directly, because video.js owns `buttonPressed_` and the button's
 * `aria-expanded`. Setting only the React half is exactly how the button would
 * come to report an open panel that is no longer on screen. The shell's
 * override notifies React on the way back, so this is the whole close.
 *
 * Idempotent: the override's `wasPressed` guard means calling it on an already
 * closed menu does nothing, which is what lets both video.js's own Escape
 * handling and the overlay's fire without fighting.
 *
 * This is also what `menuState.menuReference` is for. It was previously stored
 * and read only to guard a redundant call to the function that stored it.
 */
export function closeC2PAMenu() {
    menuState.menuReference?.unpressButton?.();
}

/**
 * Show or hide the validation log.
 *
 * Lives here rather than in the button because this is where the player
 * root's controller reference is held; the button is a video.js component and
 * knows nothing about React.
 */
export function toggleDebugConsole() {
    const isOpen = playerRootController?.getState().isDebugOpen ?? false;

    playerRootController?.setState({ isDebugOpen: !isOpen });
}

export function closeDebugConsole() {
    playerRootController?.setState({ isDebugOpen: false });
}

/**
 * Mark the menu as closed and bump the reset token so React-only UI
 * state is reset the next time the popup opens.
 */
export function handleMenuClosed() {
    menuState.isMenuOpen = false;
    menuState.resetVersion += 1;
    playerRootController?.setState({
        isMenuOpen: false,
        menuResetKey: `${menuState.resetVersion}:${menuState.lastManifestId ?? 'none'}`,
        selectedSegment: null,
    });
}

/**
 * Update the mounted React menu using the latest shared player-root state.
 * The bridge keeps the invalid button styling synchronized with validation
 * while the menu content itself is rendered from the shared React root.
 *
 * @param c2paMenu - Video.js C2PA menu component instance
 * @param videoPlayer - Video.js player instance
 */
export function updateC2PAMenu(
    c2paMenu: VideoJsMenuButtonComponentLike | null,
    videoPlayer: VideoJsPlayerLike,
    hasInvalidSegments = false,
) {
    if (!menuState.menuReference && c2paMenu) {
        setMenuReference(c2paMenu);
    }

    const c2paStatus = playerRootController?.getState().c2paStatus ?? null;
    const currentManifestId = getStatusManifestId(c2paStatus);
    const manifestChanged = currentManifestId !== menuState.lastManifestId;

    if (manifestChanged) {
        menuState.lastManifestId = currentManifestId;
        menuState.resetVersion += 1;
        // A selected fragment belongs to the manifest that was live when it
        // was clicked; once the live manifest moves on, that selection is
        // stale - drop it rather than showing an old fragment against new
        // live playback context.
        playerRootController?.setState({ selectedSegment: null });
    }

    // Latched, not sampled. `hasInvalidSegments` covers anything invalid found
    // anywhere in the timeline, not just under the playhead, and once a bad
    // fragment has been seen the warning stays for the rest of the source:
    // moving the playhead into a clean fragment doesn't un-tamper the ones
    // already detected. Previously this was reassigned from the instantaneous
    // playhead verdict on every tick, so the badge cleared itself as soon as
    // playback moved past the problem.
    menuState.isInvalid =
        menuState.isInvalid ||
        hasInvalidSegments ||
        getStatusValidationState(c2paStatus) === 'Invalid';
    updateButtonValidationState(videoPlayer, menuState.isInvalid);
    syncMenuStateToPlayerRoot(c2paStatus);
}

/**
 * Unmount the React menu root and release all state associated with the
 * current Video.js menu instance.
 */
export function disposeC2PAMenu() {
    playerRootController?.setState({
        isMenuOpen: false,
        c2paStatus: null,
        timeline: createEmptyTimelineState(),
        menuResetKey: `${menuState.resetVersion}:none`,
        selectedSegment: null,
    });
    playerRootController = null;
    resetMenuState();
}

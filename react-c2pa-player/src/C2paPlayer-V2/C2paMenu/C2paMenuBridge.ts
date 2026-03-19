import type { C2PAStatus } from '@/types/c2pa.types';
import type { C2PAPlayerRootController } from '../C2PAPlayerRoot.types';
import type {
    C2paMenuBridgeState,
    VideoJsMenuComponentLike,
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

function resetMenuState() {
    menuState.lastManifestId = null;
    menuState.isMenuOpen = false;
    menuState.isInvalid = false;
    menuState.resetVersion = 0;
}

/**
 * Legacy compatibility hook for the pre-React menu renderer API.
 * Custom item renderers are no longer consumed by the menu module,
 * so this function only emits a deprecation warning.
 *
 * @param itemKey - Legacy menu item identifier
 * @param renderer - Legacy renderer callback
 */
export function registerMenuItemRenderer(itemKey: string, renderer: (...args: unknown[]) => unknown) {
    console.warn('[C2PA] registerMenuItemRenderer is deprecated during the React menu migration', itemKey, renderer);
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

/**
 * Store the Video.js menu component reference used by the React bridge.
 * The bridge mounts the React tree into the menu popup content owned by
 * this component.
 *
 * @param c2paMenu - Video.js C2PA menu component instance
 */
export function setMenuReference(c2paMenu: VideoJsMenuComponentLike | null) {
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
 * Mark the menu as closed and bump the reset token so React-only UI
 * state is reset the next time the popup opens.
 */
export function handleMenuClosed() {
    menuState.isMenuOpen = false;
    menuState.resetVersion += 1;
    playerRootController?.setState({
        isMenuOpen: false,
        menuResetKey: `${menuState.resetVersion}:${menuState.lastManifestId ?? 'none'}`,
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
    c2paMenu: VideoJsMenuComponentLike | null,
    videoPlayer: VideoJsPlayerLike,
) {
    if (!menuState.menuReference && c2paMenu) {
        setMenuReference(c2paMenu);
    }

    const c2paStatus = playerRootController?.getState().c2paStatus ?? null;
    const currentManifestId = c2paStatus?.manifestStore?.active_manifest ?? null;
    const manifestChanged = currentManifestId !== menuState.lastManifestId;

    if (menuState.isInvalid) {
        console.log('[C2PA] Maintaining invalid button state (persists across all video states)');
        updateButtonValidationState(videoPlayer, true);
    }

    console.log('[C2PA] Rendering menu', {
        manifestId: currentManifestId,
        previousManifestId: menuState.lastManifestId,
        manifestChanged,
        menuOpen: menuState.isMenuOpen,
    });

    if (manifestChanged) {
        menuState.lastManifestId = currentManifestId;
        menuState.resetVersion += 1;
    }

    menuState.isInvalid = c2paStatus?.manifestStore?.validation_state === 'Invalid';
    updateButtonValidationState(videoPlayer, menuState.isInvalid);
    syncMenuStateToPlayerRoot(c2paStatus);
}

/**
 * Clear cached bridge state so the next menu update behaves like a fresh
 * session.
 */
export function resetC2PAMenuCache() {
    console.log('[C2PA] Manually resetting menu state');
    resetMenuState();
    menuState.resetVersion += 1;
    playerRootController?.setState({
        isMenuOpen: false,
        c2paStatus: null,
        timeline: {
            currentTime: 0,
            compromisedRegions: [],
            hasInvalidSegments: false,
            segments: [],
        },
        menuResetKey: `${menuState.resetVersion}:none`,
    });
}

/**
 * Unmount the React menu root and release all state associated with the
 * current Video.js menu instance.
 */
export function disposeC2PAMenu() {
    playerRootController?.setState({
        isMenuOpen: false,
        c2paStatus: null,
        timeline: {
            currentTime: 0,
            compromisedRegions: [],
            hasInvalidSegments: false,
            segments: [],
        },
        menuResetKey: `${menuState.resetVersion}:none`,
    });
    menuState.menuReference = null;
    playerRootController = null;
    resetMenuState();
}

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { C2paMenuRoot } from './C2paMenuRoot';

const menuState = {
  lastManifestId: null,
  isMenuOpen: false,
  lastUpdateTime: 0,
  isInvalid: false,
  resetVersion: 0,
  menuReference: null,
  reactRoot: null,
  reactTarget: null,
};

function resetMenuState() {
  menuState.lastManifestId = null;
  menuState.isMenuOpen = false;
  menuState.lastUpdateTime = 0;
  menuState.isInvalid = false;
  menuState.resetVersion = 0;
}

/**
 * Legacy compatibility hook for the pre-React menu renderer API.
 * Custom item renderers are no longer consumed by the menu module,
 * so this function only emits a deprecation warning.
 *
 * @param {string} itemKey - Legacy menu item identifier
 * @param {Function} renderer - Legacy renderer callback
 */
export function registerMenuItemRenderer(itemKey, renderer) {
  console.warn('[C2PA] registerMenuItemRenderer is deprecated during the React menu migration', itemKey, renderer);
}

function updateButtonValidationState(videoPlayer, isInvalid) {
  const c2paButton = videoPlayer.el().querySelector('.c2pa-menu-button button');
  if (!c2paButton) return;

  if (isInvalid) {
    c2paButton.classList.add('c2pa-menu-button-invalid');
  } else {
    c2paButton.classList.remove('c2pa-menu-button-invalid');
  }
}

function getMenuContentTarget(c2paMenu) {
  return c2paMenu?.el()?.querySelector('.vjs-menu-button-popup .vjs-menu .vjs-menu-content') ?? null;
}

function scheduleRootUnmount(root) {
  if (!root) {
    return;
  }

  setTimeout(() => {
    root.unmount();
  }, 0);
}

function ensureMenuReactRoot() {
  const target = getMenuContentTarget(menuState.menuReference);
  if (!target) {
    return null;
  }

  if (menuState.reactRoot && menuState.reactTarget === target) {
    return menuState.reactRoot;
  }

  if (menuState.reactRoot) {
    scheduleRootUnmount(menuState.reactRoot);
  }

  menuState.reactTarget = target;
  menuState.reactRoot = createRoot(target);
  return menuState.reactRoot;
}

function renderReactMenu(payload) {
  const reactRoot = ensureMenuReactRoot();
  if (!reactRoot) {
    console.warn('[C2PA] React menu root could not be created');
    return;
  }

  reactRoot.render(createElement(C2paMenuRoot, {
    c2paStatus: payload.c2paStatus,
    compromisedRegions: payload.compromisedRegions,
    resetKey: `${menuState.resetVersion}:${menuState.lastManifestId ?? 'none'}`,
  }));
}

/**
 * Store the Video.js menu component reference used by the React bridge.
 * The bridge mounts the React tree into the menu popup content owned by
 * this component.
 *
 * @param {Object} c2paMenu - Video.js C2PA menu component instance
 */
export function setMenuReference(c2paMenu) {
  if (!c2paMenu) {
    return;
  }

  menuState.menuReference = c2paMenu;
  ensureMenuReactRoot();
}

/**
 * Mark the menu as open so bridge updates may render into the visible
 * popup while playback is progressing.
 */
export function handleMenuOpened() {
  menuState.isMenuOpen = true;
}

/**
 * Mark the menu as closed and bump the reset token so React-only UI
 * state is reset the next time the popup opens.
 */
export function handleMenuClosed() {
  menuState.isMenuOpen = false;
  menuState.resetVersion += 1;
}

/**
 * Update the mounted React menu using the latest C2PA status and player
 * timeline state. The bridge throttles updates while the menu is closed
 * and keeps the invalid button styling synchronized with validation.
 *
 * @param {Object|null} c2paStatus - Current C2PA status payload
 * @param {Object} c2paMenu - Video.js C2PA menu component instance
 * @param {boolean} isMonolithic - Whether playback is monolithic or streaming
 * @param {Object} videoPlayer - Video.js player instance
 * @param {Function} getCompromisedRegions - Returns compromised timeline ranges
 */
export function updateC2PAMenu(
  c2paStatus,
  c2paMenu,
  isMonolithic,
  videoPlayer,
  getCompromisedRegions,
) {
  if (!menuState.menuReference && c2paMenu) {
    setMenuReference(c2paMenu);
  }

  const compromisedRegions = getCompromisedRegions(isMonolithic, videoPlayer);
  const currentManifestId = c2paStatus?.manifestStore?.active_manifest ?? null;
  const manifestChanged = currentManifestId !== menuState.lastManifestId;

  const now = Date.now();
  const timeSinceLastUpdate = now - menuState.lastUpdateTime;
  const shouldForceUpdate = menuState.isMenuOpen && timeSinceLastUpdate > 2000;

  if (menuState.isInvalid) {
    console.log('[C2PA] Maintaining invalid button state (persists across all video states)');
    updateButtonValidationState(videoPlayer, true);
    if (menuState.isMenuOpen) {
      renderReactMenu({ c2paStatus, compromisedRegions });
    }
  }

  if (!menuState.isMenuOpen && !manifestChanged) {
    return;
  }

  if (!shouldForceUpdate && !manifestChanged && menuState.lastManifestId !== null) {
    return;
  }

  menuState.lastUpdateTime = now;

  console.log('[C2PA] Rendering menu', {
    manifestId: currentManifestId,
    previousManifestId: menuState.lastManifestId,
    manifestChanged,
    forcedUpdate: shouldForceUpdate,
  });

  if (manifestChanged) {
    menuState.lastManifestId = currentManifestId;
    menuState.resetVersion += 1;
  }

  menuState.isInvalid = c2paStatus?.manifestStore?.validation_state === 'Invalid';
  updateButtonValidationState(videoPlayer, menuState.isInvalid);
  renderReactMenu({ c2paStatus, compromisedRegions });
}

/**
 * Clear cached bridge state so the next menu update behaves like a fresh
 * session.
 */
export function resetC2PAMenuCache() {
  console.log('[C2PA] Manually resetting menu state');
  resetMenuState();
  menuState.resetVersion += 1;
}

/**
 * Unmount the React menu root and release all state associated with the
 * current Video.js menu instance.
 */
export function disposeC2PAMenu() {
  if (menuState.reactRoot) {
    scheduleRootUnmount(menuState.reactRoot);
  }

  menuState.reactRoot = null;
  menuState.reactTarget = null;
  menuState.menuReference = null;
  resetMenuState();
}

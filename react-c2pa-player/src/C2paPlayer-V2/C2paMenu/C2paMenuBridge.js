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

export function setMenuReference(c2paMenu) {
  if (!c2paMenu) {
    return;
  }

  menuState.menuReference = c2paMenu;
  ensureMenuReactRoot();
}

export function handleMenuOpened() {
  menuState.isMenuOpen = true;
}

export function handleMenuClosed() {
  menuState.isMenuOpen = false;
  menuState.resetVersion += 1;
}

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

export function resetC2PAMenuCache() {
  console.log('[C2PA] Manually resetting menu state');
  menuState.lastManifestId = null;
  menuState.isMenuOpen = false;
  menuState.lastUpdateTime = 0;
  menuState.isInvalid = false;
  menuState.resetVersion += 1;
}

export function disposeC2PAMenu() {
  if (menuState.reactRoot) {
    scheduleRootUnmount(menuState.reactRoot);
  }

  menuState.reactRoot = null;
  menuState.reactTarget = null;
  menuState.menuReference = null;
  menuState.lastManifestId = null;
  menuState.isMenuOpen = false;
  menuState.lastUpdateTime = 0;
  menuState.isInvalid = false;
  menuState.resetVersion = 0;
}

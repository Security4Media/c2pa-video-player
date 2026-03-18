import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { buildC2PAMenuViewModel, C2PAMenu } from './C2paMenu.js';
import { C2paMenuContent } from './C2paMenuContent';

//C2PA menu instance
const c2paMenuInstance = new C2PAMenu();

// Simplified state object for menu management
const menuState = {
  // Simple tracking - just track what manifest we're currently showing
  lastManifestId: null,
  isMenuOpen: false, // Track if menu is currently visible
  lastUpdateTime: 0, // Track last update time for periodic refresh
  isInvalid: false, // Track if current credentials are invalid (persists across video state changes)
  resetVersion: 0,

  // Reference to menu component
  menuReference: null,
  reactRoot: null,
  reactTarget: null,
  reactPayload: null,
};

// ============================================
// MENU ITEM RENDERERS
// ============================================

export function registerMenuItemRenderer(itemKey, renderer) {
  console.warn('[C2PA] registerMenuItemRenderer is deprecated during the React menu migration', itemKey, renderer);
}

// ============================================
// VALIDATION STATE MANAGEMENT
// ============================================

/**
 * Update button validation state
 */
function updateButtonValidationState(videoPlayer, isInvalid) {
  const c2paButton = videoPlayer.el().querySelector('.c2pa-menu-button button');
  if (!c2paButton) return;

  if (isInvalid) {
    c2paButton.classList.add('c2pa-menu-button-invalid');
  } else {
    c2paButton.classList.remove('c2pa-menu-button-invalid');
  }
}

function setMenuModeInvalid(videoPlayer) {
  // Mark as invalid in persistent state
  menuState.isInvalid = true;
  updateButtonValidationState(videoPlayer, true);
}

function setMenuModeLoading(videoPlayer) {
  console.log('[C2PA] Showing loading state');
  if (!menuState.isInvalid) {
    updateButtonValidationState(videoPlayer, false);
  }
}

function setMenuModeNoManifest(videoPlayer) {
  console.log('[C2PA] Showing no manifest message');
  if (!menuState.isInvalid) {
    updateButtonValidationState(videoPlayer, false);
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

function ensureMenuReactRoot(c2paMenu) {
  const target = getMenuContentTarget(c2paMenu);
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
  const menuComponent = menuState.menuReference;
  const reactRoot = ensureMenuReactRoot(menuComponent);
  if (!reactRoot) {
    console.warn('[C2PA] React menu root could not be created');
    return;
  }

  menuState.reactPayload = payload;

  reactRoot.render(createElement(C2paMenuContent, {
    menuItems: c2paMenuInstance.c2paMenuItems(),
    items: payload.items,
    mode: payload.mode,
    resetKey: `${menuState.resetVersion}:${payload.mode}:${menuState.lastManifestId ?? 'none'}`,
  }));
}

// ============================================
// PUBLIC API
// ============================================

export let initializeC2PAMenu = function (videoPlayer) {
  console.log('[C2PAMenu] Initializing C2PA menu, videoPlayer:', videoPlayer);
  console.log('[C2PAMenu] videojs available:', typeof videojs !== 'undefined', window.videojs);

  const MenuButton = videojs.getComponent('MenuButton');
  const MenuItem = videojs.getComponent('MenuItem');

  class C2PAMenuButton extends MenuButton {
    constructor(player, options) {
      super(player, options);
      this.closeC2paMenu = false;
    }

    createItems() {
      // Must return an array of `MenuItem`s
      // Options passed in `addChild` are available at `this.options_`
      return this.options_.myItems.map((i) => {
        let item = new MenuItem(this.player_, { label: i.name, id: i.id });
        item.handleClick = function () {
          //No click behavior implemented for now

          return;
        };
        return item;
      });
    }

    handleClick() {
      if (this.buttonPressed_) {
        this.closeC2paMenu = true;
        this.unpressButton();
      } else {
        console.log('[C2PA] Menu opened - marking as open and triggering update');
        menuState.isMenuOpen = true;
        this.pressButton();
        // Note: updateC2PAMenu will now process because isMenuOpen = true
      }
    }

    // Override to disable hover behavior
    handleMouseOver() {
      // Do nothing - completely disable hover
    }

    // Override to disable hover out behavior
    handleMouseOut() {
      // Do nothing
    }

    unpressButton() {
      if (this.closeC2paMenu) {
        this.closeC2paMenu = false;
        console.log('[C2PA] Menu closed - marking as closed');
        menuState.isMenuOpen = false;
        menuState.resetVersion += 1;
        // Keep lastManifestId so we can check if manifest changed when reopened
        super.unpressButton();
      }
    }

    buildCSSClass() {
      return `vjs-chapters-button c2pa-menu-button ${super.buildCSSClass()}`; // Add both classes for proper styling
    }
  }

  // Register as a component, so it can be added
  videojs.registerComponent('C2PAMenuButton', C2PAMenuButton);

  //Add items to c2pa menu
  let myC2PAItems = [];
  const menuItems = c2paMenuInstance.c2paMenuItems();
  Object.keys(menuItems).forEach((key) => {
    const value = menuItems[key];
    myC2PAItems.push({
      name: value,
      id: key,
    });
  });

  // Use `addChild` to add an instance of the new component, with options
  videoPlayer.controlBar.addChild(
    'C2PAMenuButton',
    {
      controlText: 'Content Credentials',
      title: 'Content Credentials',
      myItems: myC2PAItems,
      className: 'c2pa-menu-button',
    },
    0,
  ); //0 indicates that the menu button will be the first item in the control bar

  // Store global reference for immediate access
  menuState.menuReference = videoPlayer.controlBar.getChild('C2PAMenuButton');
  ensureMenuReactRoot(menuState.menuReference);

  console.log('[C2PAMenu] C2PA menu button added to control bar');
  console.log('[C2PAMenu] Control bar children:', videoPlayer.controlBar.children());
};

//Adjust c2pa menu size with respect to the player size
export let adjustC2PAMenu = function (
  c2paMenu,
  videoElement,
  c2paMenuHeightOffset,
) {
  if (!c2paMenu || !c2paMenu.el()) {
    console.warn('[C2PA] Menu not available for adjustment');
    return;
  }

  const menuEl = c2paMenu.el().querySelector('.vjs-menu-button-popup .vjs-menu');
  const menuContent = c2paMenu.el().querySelector('.vjs-menu-button-popup .vjs-menu .vjs-menu-content');

  if (!menuEl || !menuContent) {
    console.warn('[C2PA] Menu elements not found');
    return;
  }

  const playerWidth = videoElement.offsetWidth;
  const playerHeight = videoElement.offsetHeight - c2paMenuHeightOffset;

  // Set menu to cover the video area (excluding control bar)
  menuEl.style.width = `${playerWidth}px`;
  menuEl.style.height = `${playerHeight}px`;
  menuEl.style.top = '0';
  menuEl.style.left = '0';

  // Set content dimensions to match
  menuContent.style.width = `${playerWidth}px`;
  menuContent.style.maxWidth = `${playerWidth}px`;
  menuContent.style.height = `${playerHeight}px`;
  menuContent.style.maxHeight = `${playerHeight}px`;

};

/**
 * Update the c2pa menu items with the values from the c2pa manifest
 * @param {Object} c2paStatus - C2PA validation status and manifest data
 * @param {Object} c2paMenu - Video.js menu component
 * @param {boolean} isMonolithic - Whether the video is monolithic or streaming
 * @param {Object} videoPlayer - Video.js player instance
 * @param {Function} getCompromisedRegions - Function to get compromised time regions
 */
export let updateC2PAMenu = function (
  c2paStatus,
  c2paMenu,
  isMonolithic,
  videoPlayer,
  getCompromisedRegions,
) {
  // Store reference if not already stored
  if (!menuState.menuReference && c2paMenu) {
    menuState.menuReference = c2paMenu;
  }

  const compromisedRegions = getCompromisedRegions(isMonolithic, videoPlayer);

  // Check timing for periodic updates when menu is open
  const now = Date.now();
  const timeSinceLastUpdate = now - menuState.lastUpdateTime;
  const shouldForceUpdate = menuState.isMenuOpen && timeSinceLastUpdate > 2000; // Force update every 2 seconds when menu is open


  // Check if we have a definitive "no manifest" state
  const hasDefinitiveNoManifest =
    (c2paStatus && !c2paStatus.manifestStore) ||
    (c2paStatus?.manifestStore?.manifests && Object.keys(c2paStatus.manifestStore.manifests).length === 0);

  // Handle definitive "no manifest" case
  if (hasDefinitiveNoManifest) {
    if (menuState.lastManifestId !== 'no-manifest') {
      console.log('[C2PA] No C2PA manifest found - showing no manifest message');
      setMenuModeNoManifest(videoPlayer);
      renderReactMenu({ mode: 'no-manifest', items: {} });
      menuState.lastManifestId = 'no-manifest';
    }
    return;
  }

  let manifestStore = c2paStatus?.manifestStore;
  // Check if manifest exists and has complete content
  console.log('[C2PA-MENU] Manifest store:', manifestStore);
  const hasValidManifestStore = manifestStore != null &&
    manifestStore.manifests != null &&
    Object.keys(manifestStore.manifests).length > 0 &&
    manifestStore.active_manifest != null;


  // Only update menu if it's actually open, unless manifest changed, or forced by timer
  const currentManifestId = manifestStore?.active_manifest;
  const manifestChanged = currentManifestId !== menuState.lastManifestId;

  // CRITICAL: Maintain invalid button state even when menu is closed or video ends
  if (menuState.isInvalid) {
    console.log('[C2PA] Maintaining invalid button state (persists across all video states)');
    updateButtonValidationState(videoPlayer, true);
    // If menu is open, also update the menu content
    if (menuState.isMenuOpen) {
      renderReactMenu({ mode: 'invalid', items: {} });
    }
    // Don't return - allow manifest change check below
  }

  if (!menuState.isMenuOpen && !manifestChanged) {
    // Menu is closed and manifest hasn't changed - skip update (but invalid state already maintained above)
    return;
  }

  if (!shouldForceUpdate && !manifestChanged && menuState.lastManifestId !== null) {
    // No forced update needed, no manifest change, and we already have content - skip
    return;
  }

  // Update the timestamp
  menuState.lastUpdateTime = now;

  // If we don't have valid manifest yet, show loading
  if (!hasValidManifestStore) {
    console.log('[C2PA] Manifest not available yet - showing loading');
    setMenuModeLoading(videoPlayer);
    renderReactMenu({ mode: 'loading', items: {} });
    return;
  }

  // Get current manifest data
  const validationStatus = manifestStore?.validation_state ?? 'Unknown';

  console.log('[C2PA] Rendering menu', {
    manifestId: currentManifestId,
    validationStatus,
    previousManifestId: menuState.lastManifestId,
    manifestChanged,
    forcedUpdate: shouldForceUpdate
  });

  // Update manifest ID
  if (manifestChanged) {
    menuState.lastManifestId = currentManifestId;
    menuState.resetVersion += 1;
    // Only reset invalid state if we have a new valid manifest (not null/undefined)
    if (currentManifestId != null) {
      menuState.isInvalid = false;
    }
  }

  // Handle invalid validation state
  const isInvalid = validationStatus === 'Invalid';
  if (isInvalid) {
    setMenuModeInvalid(videoPlayer);
    renderReactMenu({ mode: 'invalid', items: {} });
    console.log('[C2PA] Invalid validation message displayed');
    return;
  }

  // Update button state for valid content
  updateButtonValidationState(videoPlayer, false);

  const menuViewModel = buildC2PAMenuViewModel(c2paStatus, compromisedRegions);

  const hasAnyContent = Object.values(menuViewModel.items).some(value => value != null);
  renderReactMenu({ mode: 'ready', items: menuViewModel.items });

  if (hasAnyContent) {
    console.log('[C2PA] Menu rendering complete with content');
  } else {
    console.log('[C2PA] Warning: No menu items could be rendered');
  }
};

/**
 * Reset the C2PA menu state
 * Forces the menu to be recomputed on the next update
 */
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
  menuState.reactPayload = null;
  menuState.menuReference = null;
  menuState.resetVersion = 0;
}

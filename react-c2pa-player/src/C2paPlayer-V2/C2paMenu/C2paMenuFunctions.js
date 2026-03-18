import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { c2paMenuItems, C2paMenuRoot } from './C2paMenuRoot';

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
};

// ============================================
// MENU ITEM RENDERERS
// ============================================

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

  reactRoot.render(createElement(C2paMenuRoot, {
    c2paStatus: payload.c2paStatus,
    compromisedRegions: payload.compromisedRegions,
    resetKey: `${menuState.resetVersion}:${menuState.lastManifestId ?? 'none'}`,
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
  Object.keys(c2paMenuItems).forEach((key) => {
    const value = c2paMenuItems[key];
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
  if (!menuState.menuReference && c2paMenu) {
    menuState.menuReference = c2paMenu;
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
    forcedUpdate: shouldForceUpdate
  });

  if (manifestChanged) {
    menuState.lastManifestId = currentManifestId;
    menuState.resetVersion += 1;
  }

  menuState.isInvalid = c2paStatus?.manifestStore?.validation_state === 'Invalid';
  updateButtonValidationState(videoPlayer, menuState.isInvalid);
  renderReactMenu({ c2paStatus, compromisedRegions });
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
  menuState.menuReference = null;
  menuState.resetVersion = 0;
}

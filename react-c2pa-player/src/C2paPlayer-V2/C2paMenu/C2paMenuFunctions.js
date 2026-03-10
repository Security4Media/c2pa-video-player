/**
 * C2PA Menu Functions - Extensible menu rendering system
 * 
 * This module provides a flexible, extensible system for rendering C2PA metadata in a Video.js menu.
 * 
 * EXTENDING THE MENU:
 * 
 * 1. Add new menu item in C2paMenu.js:
 *    const c2paMenuItems = {
 *      ...existing items,
 *      MY_NEW_ITEM: 'My Custom Field'
 *    };
 * 
 * 2. Register a custom renderer:
 *    import { registerMenuItemRenderer } from './C2paMenuFunctions.js';
 * 
 *    registerMenuItemRenderer('MY_NEW_ITEM', ({ itemName, itemValue, delimiter }) => {
 *      return `<div class="custom-item">${itemName}: ${itemValue}</div>`;
 *    });
 * 
 * 3. For interactive items, return { html, postRender }:
 *    registerMenuItemRenderer('COLLAPSIBLE_ITEM', ({ itemName, itemValue, menuItem }) => {
 *      return {
 *        html: `<div class="header" id="toggle">${itemName}</div><div class="content">${itemValue}</div>`,
 *        postRender: () => {
 *          const toggle = menuItem.el().querySelector('#toggle');
 *          toggle.onclick = () => { // add interactivity };
 *        }
 *      };
 *    });
 * 
 * 4. Add data extraction in C2paMenu.js c2paItem() method:
 *    if (itemName == 'MY_NEW_ITEM') {
 *      return extractMyDataFromManifest(activeManifest);
 *    }
 */

import { C2PAMenu } from './C2paMenu.js';
import { providerInfoFromSocialId } from './Providers.js';

//C2PA menu instance
const c2paMenuInstance = new C2PAMenu();

// Simplified state object for menu management
const menuState = {
  // UI state - controls what's expanded/visible (persists across renders)
  ui: {
    cawgIdentityExpanded: false,
    ingredientsExpanded: {}, // Store expanded state for each ingredient by index
  },

  // Simple tracking - just track what manifest we're currently showing
  lastManifestId: null,
  isMenuOpen: false, // Track if menu is currently visible
  lastUpdateTime: 0, // Track last update time for periodic refresh
  isInvalid: false, // Track if current credentials are invalid (persists across video state changes)

  // Reference to menu component
  menuReference: null,
};

// ============================================
// MENU ITEM RENDERERS
// ============================================

/**
 * Registry of menu item renderers by item key
 * Each renderer receives: { itemName, itemKey, itemValue, delimiter, menuItem }
 * 
 * Renderers can return:
 * - HTML string (simple render)
 * - { html: string, postRender: function } (for interactive items)
 * - null (to use default renderer)
 */
const menuItemRenderers = {
  SOCIAL: renderSocialMediaItem,
  CAWG_IDENTITY: renderCawgIdentityItem,
  INGREDIENTS: renderIngredientsItem,
  WEBSITE: renderWebsiteItem,
  ALERT: renderAlertItem,
  C2PA_VALIDATION_STATUS: renderValidationStatusItem,
};

/**
 * Register a custom renderer for a menu item type
 * @param {string} itemKey - The menu item key (e.g., 'SOCIAL', 'WEBSITE')
 * @param {function} renderer - The renderer function
 * @example
 * registerMenuItemRenderer('CUSTOM_FIELD', ({ itemName, itemValue }) => {
 *   return `<span class="custom">${itemName}: ${itemValue}</span>`;
 * });
 */
export function registerMenuItemRenderer(itemKey, renderer) {
  menuItemRenderers[itemKey] = renderer;
}

/**
 * Render social media links
 */
function renderSocialMediaItem({ itemName, itemValue, delimiter }) {
  const socialArray = itemValue.map(function (account) {
    const formattedWebsite = providerInfoFromSocialId(account).name;
    return `<span><a class="url" href="${account}" onclick="window.open('${account}')">${formattedWebsite}</a></span>`;
  });
  return `<span class="itemName"> ${itemName} </span> ${delimiter} ${socialArray.join('\n')}`;
}

/**
 * Render CAWG identity with collapsible content
 */
function renderCawgIdentityItem({ itemName, itemValue, menuItem }) {
  if (itemValue && typeof itemValue === 'object') {
    // Check if there's an existing state before rebuilding
    const existingContent = menuItem.el().querySelector('.cawg-identity');
    if (existingContent) {
      menuState.ui.cawgIdentityExpanded = existingContent.style.display === 'flex';
    }

    let cawgHtml = `<div class="cawg-identity" style="display: ${menuState.ui.cawgIdentityExpanded ? 'flex' : 'none'};">`;

    // Display issuer
    if (itemValue.issuer) {
      cawgHtml += `<div><span class="itemName">Issuer:</span> ${itemValue.issuer}</div>`;
    }

    // Display referenced assertions
    if (itemValue.referenced_assertions) {
      cawgHtml += `<div><span class="itemName">Referenced Assertions:</span> ${itemValue.referenced_assertions}</div>`;
    }

    // Display validation status
    if (itemValue.validation_status) {
      const statusClass = itemValue.validation_status.toLowerCase();
      cawgHtml += `<div><span class="itemName">Validation Status:</span> <span class="validation-${statusClass}">${itemValue.validation_status}</span></div>`;
    }
    cawgHtml += '</div>';

    const html = `<div class="cawg-header"><span class="itemName">${itemName}</span><span class="cawg-toggle ${menuState.ui.cawgIdentityExpanded ? 'expanded' : ''}">›</span></div>${cawgHtml}`;

    // Return HTML and post-render callback for interactivity
    return {
      html,
      postRender: () => {
        const header = menuItem.el().querySelector('.cawg-header');
        const toggle = menuItem.el().querySelector('.cawg-toggle');
        const content = menuItem.el().querySelector('.cawg-identity');

        header.style.cursor = 'pointer';
        header.onclick = function (e) {
          e.stopPropagation();
          if (content.style.display === 'none') {
            content.style.display = 'flex';
            toggle.classList.add('expanded');
            menuState.ui.cawgIdentityExpanded = true;
          } else {
            content.style.display = 'none';
            toggle.classList.remove('expanded');
            menuState.ui.cawgIdentityExpanded = false;
          }
        };
      }
    };
  } else {
    return `<span class="itemName"> ${itemName}</span> ${itemValue}`;
  }
}

/**
 * Render ingredients with collapsible content for each ingredient
 */
function renderIngredientsItem({ itemName, itemValue, menuItem }) {
  if (!itemValue || !Array.isArray(itemValue) || itemValue.length === 0) {
    return `<span class="itemName">${itemName}</span>: None`;
  }

  let html = `<div class="ingredients-container">`;
  html += `<div class="ingredients-main-header"><span class="itemName">${itemName}</span></div>`;

  itemValue.forEach((ingredient) => {
    html += renderSingleIngredient(ingredient, menuItem);
  });

  html += `</div>`;

  // Return HTML and post-render callback for interactivity
  return {
    html,
    postRender: () => {
      attachIngredientHandlers(itemValue, menuItem);
    }
  };
}

/**
 * Render a single ingredient (can be called recursively for nested ingredients)
 */
function renderSingleIngredient(ingredient, menuItem, parentId = '') {
  const ingredientIndex = ingredient.index;
  const ingredientId = parentId ? `${parentId}-ingredient-${ingredientIndex}` : `ingredient-${ingredientIndex}`;
  const stateKey = ingredientId;

  // Check if there's an existing state before rebuilding
  const existingContent = menuItem.el().querySelector(`#${ingredientId}`);
  const isExpanded = existingContent
    ? existingContent.style.display === 'flex'
    : menuState.ui.ingredientsExpanded[stateKey] || false;

  let html = '';

  // Build ingredient header with optional ingredient count badge
  html += `<div class="ingredient-item">`;
  html += `<div class="ingredient-header" data-id="${ingredientId}">`;
  html += `<span class="itemName">Ingredient ${ingredientIndex}</span>`;
  if (ingredient.ingredientCount && ingredient.ingredientCount > 0) {
    html += `<span class="ingredient-count">(${ingredient.ingredientCount} ingredient${ingredient.ingredientCount > 1 ? 's' : ''})</span>`;
  }
  html += `<span class="ingredient-toggle ${isExpanded ? 'expanded' : ''}">›</span>`;
  html += `</div>`;

  // Build ingredient content
  html += `<div id="${ingredientId}" class="ingredient-content" style="display: ${isExpanded ? 'flex' : 'none'};">`;

  if (ingredient.title) {
    html += `<div><span class="itemName">Title:</span> ${ingredient.title}</div>`;
  }

  if (ingredient.issuer) {
    html += `<div><span class="itemName">Issued by:</span> ${ingredient.issuer}</div>`;
  }

  if (ingredient.claimGenerator) {
    html += `<div><span class="itemName">App or device:</span> ${ingredient.claimGenerator}</div>`;
  }

  if (ingredient.date) {
    html += `<div><span class="itemName">Issued on:</span> ${ingredient.date}</div>`;
  }

  // Display validation status
  if (ingredient.validationStatus) {
    const statusClass = ingredient.validationStatus.toLowerCase();
    html += `<div><span class="itemName">Validation Status:</span> <span class="validation-${statusClass}">${ingredient.validationStatus}</span></div>`;
  }

  // Render nested ingredients if they exist
  if (ingredient.ingredients && Array.isArray(ingredient.ingredients) && ingredient.ingredients.length > 0) {
    html += `<div class="nested-ingredients">`;
    html += `<div class="nested-ingredients-header"><span class="itemName">Sub-Ingredients:</span></div>`;
    ingredient.ingredients.forEach((nestedIngredient) => {
      html += renderSingleIngredient(nestedIngredient, menuItem, ingredientId);
    });
    html += `</div>`;
  }

  html += '</div>'; // ingredient-content
  html += `</div>`; // ingredient-item

  return html;
}

/**
 * Attach click handlers to all ingredients (including nested ones)
 */
function attachIngredientHandlers(ingredients, menuItem, parentId = '') {
  ingredients.forEach((ingredient) => {
    const ingredientId = parentId ? `${parentId}-ingredient-${ingredient.index}` : `ingredient-${ingredient.index}`;
    const stateKey = ingredientId;

    const header = menuItem.el().querySelector(`.ingredient-header[data-id="${ingredientId}"]`);
    const toggle = header?.querySelector('.ingredient-toggle');
    const content = menuItem.el().querySelector(`#${ingredientId}`);

    if (header && toggle && content) {
      // Check if handler is already attached
      if (header.hasAttribute('data-handler-attached')) {
        // Handler already attached, skip
        console.log(`[C2PA] Handler already attached for ${ingredientId}, skipping`);
      } else {
        // Mark as handler attached
        header.setAttribute('data-handler-attached', 'true');

        header.style.cursor = 'pointer';
        header.onclick = function (e) {
          e.stopPropagation();
          if (content.style.display === 'none') {
            content.style.display = 'flex';
            toggle.classList.add('expanded');
            menuState.ui.ingredientsExpanded[stateKey] = true;
          } else {
            content.style.display = 'none';
            toggle.classList.remove('expanded');
            menuState.ui.ingredientsExpanded[stateKey] = false;
          }
        };
      }
    }

    // Recursively attach handlers for nested ingredients
    if (ingredient.ingredients && Array.isArray(ingredient.ingredients)) {
      attachIngredientHandlers(ingredient.ingredients, menuItem, ingredientId);
    }
  });
}

/**
 * Render website link
 */
function renderWebsiteItem({ itemName, itemValue, delimiter }) {
  return `<div class="itemName">${itemName}</div>${delimiter}<a class="url" href="${itemValue}" onclick="window.open('${itemValue}')">${itemValue}</a>`;
}

/**
 * Render alert message
 */
function renderAlertItem({ itemValue }) {
  return `<div class="alert-div"><img class="alert-icon"></img><div>${itemValue}</div></div>`;
}

/**
 * Render validation status (special handling for "Failed")
 */
function renderValidationStatusItem({ itemName, itemValue, delimiter, menuItem }) {
  if (itemValue === 'Failed') {
    menuItem.el().classList.add('validation-padding');
    return `<span class="itemName nextLine">${itemName}</span>`;
  }
  // Apply color styling for all validation statuses
  const statusClass = itemValue.toLowerCase();
  return `<span class="itemName">${itemName}</span>${delimiter}<span class="validation-${statusClass}">${itemValue}</span>`;
}

/**
 * Default renderer for simple text items
 */
function renderDefaultItem({ itemName, itemValue, delimiter }) {
  if (itemValue.length >= 23) {
    return `<div class="itemName">${itemName}</div>${delimiter}${itemValue}`;
  } else {
    return `<span class="itemName">${itemName}</span>${delimiter}${itemValue}`;
  }
}

/**
 * Render invalid validation error message
 */
function renderInvalidValidationError() {
  return `<div class="alert-div"><div><strong>❌ Content Credentials are Invalid</strong><br/>The content credentials for this video could not be verified </br>and may have been tampered with.</div></div>`;
}

/**
 * Render loading message
 */
function renderLoadingMessage() {
  return `<div class="alert-div" style="background-color: rgba(14, 65, 148, 0.2); border-color: rgba(255, 255, 255, 0.3);">
    <div style="display: flex; align-items: center; gap: 15px;">
      <div style="width: 30px; height: 30px; border: 3px solid rgba(255, 255, 255, 0.3); border-top-color: rgba(125, 180, 255, 1); border-radius: 50%; animation: spin 1s linear infinite;"></div>
      <div><strong>Loading Content Credentials...</strong><br/>Please wait while we fetch the manifest information.</div>
    </div>
  </div>`;
}

/**
 * Render no manifest information message
 */
function renderNoManifestMessage() {
  return `<div class="alert-div" style="background-color: rgba(14, 65, 148, 0.2); border-color: rgba(255, 255, 255, 0.3);"><div><strong>⚠️ No Content Credentials Found</strong><br/>This video does not contain Content Credentials information.</div></div>`;
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

/**
 * Handle invalid validation state - show only error message
 */
function handleInvalidValidation(c2paMenuItems, videoPlayer) {
  // Mark as invalid in persistent state
  menuState.isInvalid = true;
  updateButtonValidationState(videoPlayer, true);

  for (let i = 0; i < c2paMenuItems.length; i++) {
    const c2paItem = c2paMenuItems[i];
    const c2paItemKey = c2paItem.options_.id;

    if (c2paItemKey === 'C2PA_VALIDATION_STATUS') {
      c2paItem.el().innerHTML = renderInvalidValidationError();
      c2paItem.el().style.display = 'block';
    } else {
      c2paItem.el().style.display = 'none';
    }
  }
}

/**
 * Handle loading state - show loading message and hide all other items
 */
function handleLoading(c2paMenuItems, videoPlayer) {
  console.log('[C2PA] Showing loading state');
  // Don't change button state if we're in invalid state (preserve across video end)
  if (!menuState.isInvalid) {
    updateButtonValidationState(videoPlayer, false);
  }

  for (let i = 0; i < c2paMenuItems.length; i++) {
    const c2paItem = c2paMenuItems[i];

    // Show loading message in the first item slot
    if (i === 0) {
      c2paItem.el().innerHTML = renderLoadingMessage();
      c2paItem.el().style.display = 'block';
    } else {
      // Hide all other items completely
      c2paItem.el().innerHTML = '';
      c2paItem.el().style.display = 'none';
    }
  }
}

/**
 * Handle missing manifest - show informational message
 */
function handleNoManifest(c2paMenuItems, videoPlayer) {
  console.log('[C2PA] Showing no manifest message');
  // Don't change button state if we're in invalid state (preserve across video end)
  if (!menuState.isInvalid) {
    updateButtonValidationState(videoPlayer, false);
  }

  for (let i = 0; i < c2paMenuItems.length; i++) {
    const c2paItem = c2paMenuItems[i];

    // Show message in the first item slot
    if (i === 0) {
      c2paItem.el().innerHTML = renderNoManifestMessage();
      c2paItem.el().style.display = 'block';
    } else {
      // Clear and hide all other items
      c2paItem.el().innerHTML = '';
      c2paItem.el().style.display = 'none';
    }
  }
}

/**
 * Render a single menu item using appropriate renderer
 */
function renderMenuItem(menuItem, itemName, itemKey, itemValue) {
  const delimiter = c2paMenuInstance.c2paMenuDelimiter();
  const renderer = menuItemRenderers[itemKey];

  let result;
  if (renderer) {
    result = renderer({ itemName, itemKey, itemValue, delimiter, menuItem });
  } else {
    result = renderDefaultItem({ itemName, itemKey, itemValue, delimiter });
  }

  // Handle renderer returning null (use default)
  if (result === null) {
    result = renderDefaultItem({ itemName, itemKey, itemValue, delimiter });
  }

  // Handle renderer returning object with html and postRender callback
  if (typeof result === 'object' && result.html) {
    // Check if this is a cached result (html matches current innerHTML)
    const currentHTML = menuItem.el().innerHTML;
    if (result.skipRender || currentHTML === result.html) {
      // Skip DOM update if content hasn't changed
      console.log(`[C2PA] Skipping DOM update for ${itemKey} - content unchanged`);
      if (result.postRender) {
        result.postRender();
      }
    } else {
      // Update DOM only if content has changed
      menuItem.el().innerHTML = result.html;
      if (result.postRender) {
        result.postRender();
      }
    }
  } else {
    // Simple string result - check before updating
    const currentHTML = menuItem.el().innerHTML;
    if (currentHTML !== result) {
      menuItem.el().innerHTML = result;
    }
  }
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
        // Reset expanded states for fresh display on next open
        menuState.ui.ingredientsExpanded = {};
        menuState.ui.cawgIdentityExpanded = false;
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

  const c2paMenuItems = c2paMenu.items;
  const compromisedRegions = getCompromisedRegions(isMonolithic, videoPlayer);

  // Check timing for periodic updates when menu is open
  const now = Date.now();
  const timeSinceLastUpdate = now - menuState.lastUpdateTime;
  const shouldForceUpdate = menuState.isMenuOpen && timeSinceLastUpdate > 2000; // Force update every 2 seconds when menu is open

  // Only update menu if it's actually open, unless manifest changed, or forced by timer
  const manifestStore = c2paStatus?.details?.video?.manifestStore;
  const currentManifestId = manifestStore?.active_manifest;
  const manifestChanged = currentManifestId !== menuState.lastManifestId;

  // CRITICAL: Maintain invalid button state even when menu is closed or video ends
  if (menuState.isInvalid) {
    console.log('[C2PA] Maintaining invalid button state (persists across all video states)');
    updateButtonValidationState(videoPlayer, true);
    // If menu is open, also update the menu content
    if (menuState.isMenuOpen) {
      handleInvalidValidation(c2paMenuItems, videoPlayer);
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

  // Check if manifest exists and has complete content
  console.log('[C2PA-MENU] Manifest store:', manifestStore);
  const hasValidManifestStore = manifestStore != null &&
    manifestStore.manifests != null &&
    Object.keys(manifestStore.manifests).length > 0 &&
    manifestStore.active_manifest != null;

  // Check if we have a definitive "no manifest" state
  const hasDefinitiveNoManifest = c2paStatus != null && c2paStatus.details != null &&
    (manifestStore === null ||
      (manifestStore != null &&
        manifestStore.manifests != null &&
        Object.keys(manifestStore.manifests).length === 0));

  // Handle definitive "no manifest" case
  if (hasDefinitiveNoManifest) {
    if (menuState.lastManifestId !== 'no-manifest') {
      console.log('[C2PA] No C2PA manifest found - showing no manifest message');
      handleNoManifest(c2paMenuItems, videoPlayer);
      menuState.lastManifestId = 'no-manifest';
    }
    return;
  }

  // If we don't have valid manifest yet, show loading
  if (!hasValidManifestStore) {
    console.log('[C2PA] Manifest not available yet - showing loading');
    handleLoading(c2paMenuItems, videoPlayer);
    return;
  }

  // Get current manifest data
  const validationStatus = c2paStatus?.validation_state;

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
    // Reset expanded states on manifest change
    menuState.ui.ingredientsExpanded = {};
    menuState.ui.cawgIdentityExpanded = false;
    // Only reset invalid state if we have a new valid manifest (not null/undefined)
    if (currentManifestId != null) {
      menuState.isInvalid = false;
    }
  }

  // Handle invalid validation state
  const isInvalid = validationStatus === 'Invalid';
  if (isInvalid) {
    handleInvalidValidation(c2paMenuItems, videoPlayer);
    console.log('[C2PA] Invalid validation message displayed');
    return;
  }

  // Update button state for valid content
  updateButtonValidationState(videoPlayer, false);

  // Render all menu items
  let hasAnyContent = false;

  for (let i = 0; i < c2paMenuItems.length; i++) {
    const c2paItem = c2paMenuItems[i];
    const c2paItemName = c2paItem.options_.label;
    const c2paItemKey = c2paItem.options_.id;

    // Get item value from C2PA manifest
    const c2paItemValue = c2paMenuInstance.c2paItem(
      c2paItemKey,
      c2paStatus,
      compromisedRegions,
    );

    console.log('[C2PA] Menu item: ', c2paItemName, c2paItemKey, c2paItemValue);

    if (c2paItemValue != null) {
      renderMenuItem(c2paItem, c2paItemName, c2paItemKey, c2paItemValue);
      c2paItem.el().style.display = 'block';
      hasAnyContent = true;
    } else {
      // Hide menu items with no value
      c2paItem.el().style.display = 'none';
    }
  }

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
  menuState.ui.ingredientsExpanded = {};
  menuState.ui.cawgIdentityExpanded = false;
}

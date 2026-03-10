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
let c2paMenuInstance = new C2PAMenu();
// Store the state of collapsible sections
let cawgIdentityExpanded = false;

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
      cawgIdentityExpanded = existingContent.style.display === 'flex';
    }

    let cawgHtml = `<div class="cawg-identity" style="display: ${cawgIdentityExpanded ? 'flex' : 'none'};">`;

    // Display issuer
    if (itemValue.issuer) {
      cawgHtml += `<div><span class="itemName">Issuer:</span> ${itemValue.issuer}</div>`;
    }

    // Display referenced assertions
    if (itemValue.referenced_assertions) {
      cawgHtml += `<div><span class="itemName">Referenced Assertions:</span> ${itemValue.referenced_assertions}</div>`;
    }
    cawgHtml += '</div>';

    const html = `<div class="cawg-header"><span class="itemName">${itemName}</span><span class="cawg-toggle ${cawgIdentityExpanded ? 'expanded' : ''}">›</span></div>${cawgHtml}`;

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
            cawgIdentityExpanded = true;
          } else {
            content.style.display = 'none';
            toggle.classList.remove('expanded');
            cawgIdentityExpanded = false;
          }
        };
      }
    };
  } else {
    return `<span class="itemName"> ${itemName}</span> ${itemValue}`;
  }
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
function renderValidationStatusItem({ itemName, itemValue, menuItem }) {
  if (itemValue === 'Failed') {
    menuItem.el().classList.add('validation-padding');
    return `<span class="itemName nextLine">${itemName}</span>`;
  }
  // Use default renderer for other validation statuses
  return null;
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
  return `<div class="alert-div"><img class="alert-icon"></img><div><strong>Content Credentials are Invalid</strong><br/>The content credentials for this video could not be verified and may have been tampered with.</div></div>`;
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
 * Handle missing manifest - show informational message
 */
function handleNoManifest(c2paMenuItems, videoPlayer) {
  // Keep button in normal state (no invalid styling)
  updateButtonValidationState(videoPlayer, false);

  for (let i = 0; i < c2paMenuItems.length; i++) {
    const c2paItem = c2paMenuItems[i];
    const c2paItemKey = c2paItem.options_.id;

    // Show message in the first item slot
    if (i === 0) {
      c2paItem.el().innerHTML = renderNoManifestMessage();
      c2paItem.el().style.display = 'block';
    } else {
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
    menuItem.el().innerHTML = result.html;
    if (result.postRender) {
      result.postRender();
    }
  } else {
    menuItem.el().innerHTML = result;
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
        this.pressButton();
      }
    }

    unpressButton() {
      if (this.closeC2paMenu) {
        this.closeC2paMenu = false;
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

  console.log('[C2PA] Menu adjusted to cover video area:', { playerWidth, playerHeight });
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
  const c2paMenuItems = c2paMenu.items;
  const compromisedRegions = getCompromisedRegions(isMonolithic, videoPlayer);

  // Check if manifest exists
  const hasManifest = c2paStatus?.details?.video?.manifestStore != null;

  console.log('[C2PA] Manifest exists:', hasManifest);

  if (!hasManifest) {
    console.log('[C2PA] No manifest found, displaying info message');
    handleNoManifest(c2paMenuItems, videoPlayer);
    return;
  }

  // Check validation status
  const validationStatus = c2paStatus?.validation_state;
  const isInvalid = validationStatus === 'Invalid';

  console.log('[C2PA] Validation status:', validationStatus, 'Is Invalid:', isInvalid);

  // Handle invalid validation state
  if (isInvalid) {
    handleInvalidValidation(c2paMenuItems, videoPlayer);
    return;
  }

  // Update button state for valid content
  updateButtonValidationState(videoPlayer, false);

  // Render all menu items
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
    } else {
      // Hide menu items with no value
      c2paItem.el().style.display = 'none';
    }
  }
};
//Hide the c2pa menu
let hideC2PAMenu = function () {
  c2paMenu.hide();
};

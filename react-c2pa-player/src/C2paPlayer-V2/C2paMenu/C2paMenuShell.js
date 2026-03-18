import { c2paMenuItems } from './menuViewModel';
import { handleMenuClosed, handleMenuOpened, setMenuReference } from './C2paMenuBridge.js';

/** @typedef {import('./C2paMenu.types').MenuShellItem} MenuShellItem */
/** @typedef {import('./C2paMenu.types').VideoJsMenuComponentLike} VideoJsMenuComponentLike */
/** @typedef {import('./C2paMenu.types').VideoJsPlayerLike} VideoJsPlayerLike */

/**
 * Register the Video.js C2PA menu button and attach it to the control
 * bar. The popup shell remains managed by Video.js while the popup
 * content is rendered through the React bridge.
 *
 * @param {VideoJsPlayerLike} videoPlayer - Video.js player instance
 */
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
      return this.options_.myItems.map((i) => {
        const item = new MenuItem(this.player_, { label: i.name, id: i.id });
        item.handleClick = function () {
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
        handleMenuOpened();
        this.pressButton();
      }
    }

    handleMouseOver() {
      // Do nothing
    }

    handleMouseOut() {
      // Do nothing
    }

    unpressButton() {
      if (this.closeC2paMenu) {
        this.closeC2paMenu = false;
        console.log('[C2PA] Menu closed - marking as closed');
        handleMenuClosed();
        super.unpressButton();
      }
    }

    buildCSSClass() {
      return `vjs-chapters-button c2pa-menu-button ${super.buildCSSClass()}`;
    }
  }

  videojs.registerComponent('C2PAMenuButton', C2PAMenuButton);

  /** @type {MenuShellItem[]} */
  const myC2PAItems = Object.keys(c2paMenuItems).map((key) => ({
    name: c2paMenuItems[key],
    id: key,
  }));

  videoPlayer.controlBar.addChild(
    'C2PAMenuButton',
    {
      controlText: 'Content Credentials',
      title: 'Content Credentials',
      myItems: myC2PAItems,
      className: 'c2pa-menu-button',
    },
    0,
  );

  setMenuReference(videoPlayer.controlBar.getChild('C2PAMenuButton'));

  console.log('[C2PAMenu] C2PA menu button added to control bar');
  console.log('[C2PAMenu] Control bar children:', videoPlayer.controlBar.children());
};

/**
 * Resize the Video.js popup so it matches the video viewport, leaving
 * space for the control bar at the bottom.
 *
 * @param {VideoJsMenuComponentLike | null} c2paMenu - Video.js C2PA menu component instance
 * @param {HTMLElement} videoElement - Root video player element
 * @param {number} c2paMenuHeightOffset - Height reserved for the control bar
 */
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

  menuEl.style.width = `${playerWidth}px`;
  menuEl.style.height = `${playerHeight}px`;
  menuEl.style.top = '0';
  menuEl.style.left = '0';

  menuContent.style.width = `${playerWidth}px`;
  menuContent.style.maxWidth = `${playerWidth}px`;
  menuContent.style.height = `${playerHeight}px`;
  menuContent.style.maxHeight = `${playerHeight}px`;
};

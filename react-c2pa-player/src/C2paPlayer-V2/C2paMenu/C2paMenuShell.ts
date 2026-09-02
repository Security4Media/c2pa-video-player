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

import videojs from 'video.js';
import { handleMenuClosed, handleMenuOpened, setMenuReference } from './C2paMenuBridge';
import type {
    VideoJsMenuButtonComponentLike,
    VideoJsPlayerLike,
} from './C2paMenu.types';

interface MenuItemConstructor {
    new (player: unknown, options: { label: string; id: string }): {
        addClass?: (className: string) => void;
        el?: () => HTMLElement | null;
        handleClick: () => void;
    };
}

interface MenuButtonComponentClass {
    new (player: unknown, options?: Record<string, unknown>): VideoJsMenuButtonComponentLike;
}

function createHiddenPlaceholderItem(
    MenuItem: MenuItemConstructor,
    player: unknown,
) {
    const placeholderItem = new MenuItem(player, {
        label: '',
        id: 'c2pa-menu-placeholder',
    });
    placeholderItem.addClass?.('vjs-hidden');
    placeholderItem.addClass?.('c2pa-menu-placeholder-item');
    const placeholderElement = placeholderItem.el?.();
    if (placeholderElement) {
        placeholderElement.setAttribute('aria-hidden', 'true');
        placeholderElement.style.display = 'none';
    }
    placeholderItem.handleClick = function () {
        return;
    };

    return placeholderItem;
}

// Video.js types every component as `Component`, whose `el()` is declared to
// return `Element`. The two local interfaces say `HTMLElement` and name only
// the members this file uses, which is the more accurate description of what a
// MenuButton is - so the cast goes through `unknown` rather than widening those
// interfaces back to `Element` and pushing the same narrowing out to every call
// site.
const MenuButton = videojs.getComponent('MenuButton') as unknown as MenuButtonComponentClass;
const MenuItem = videojs.getComponent('MenuItem') as unknown as MenuItemConstructor;

/**
 * The Content Credentials button.
 *
 * Video.js keeps managing the popup shell - press state, focus, the menu
 * element itself - while the panel's content is rendered through the React
 * bridge, which is what `handleMenuOpened` and `handleMenuClosed` notify.
 * Hover is deliberately inert: this menu opens on click only, unlike video.js's
 * other menu buttons.
 */
class C2PAMenuButton extends MenuButton {
    closeC2paMenu = false;

    createItems() {
        return [createHiddenPlaceholderItem(MenuItem, this.player_)];
    }

    handleClick() {
        if (this.buttonPressed_) {
            this.closeC2paMenu = true;
            this.unpressButton?.();
        } else {
            handleMenuOpened();
            this.pressButton?.();
        }
    }

    handleMouseOver() {
        return;
    }

    handleMouseOut() {
        return;
    }

    unpressButton() {
        if (this.closeC2paMenu) {
            this.closeC2paMenu = false;
            handleMenuClosed();
            super.unpressButton?.();
        }
    }

    buildCSSClass() {
        return `vjs-chapters-button c2pa-menu-button ${super.buildCSSClass?.() ?? ''}`.trim();
    }
}

// Registered at module scope: the registry is global, while a player is not.
// Doing this per player defined a fresh class each time and re-registered it
// under the same name.
//
// Cast for the same reason as above - the class descends from a component
// narrowed to a local interface, so it no longer carries `Component`'s static
// side.
videojs.registerComponent(
    'C2PAMenuButton',
    C2PAMenuButton as unknown as Parameters<typeof videojs.registerComponent>[1],
);

/**
 * Add the Content Credentials button to a player's control bar, at the far
 * left, and hand the component to the React bridge that fills its panel.
 *
 * @param videoPlayer - Video.js player instance
 */
export const initializeC2PAMenu = function (videoPlayer: VideoJsPlayerLike) {
    videoPlayer.controlBar.addChild(
        'C2PAMenuButton',
        {
            controlText: 'Content Credentials',
            title: 'Content Credentials',
            className: 'c2pa-menu-button',
        },
        0,
    );

    setMenuReference(videoPlayer.controlBar.getChild('C2PAMenuButton'));
};

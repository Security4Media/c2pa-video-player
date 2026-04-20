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

import { handleMenuClosed, handleMenuOpened, setMenuReference } from './C2paMenuBridge';
import type {
    VideoJsMenuButtonComponentLike,
    VideoJsPlayerLike,
} from './C2paMenu.types';

declare const videojs: {
    getComponent(name: string): new (...args: unknown[]) => VideoJsMenuButtonComponentLike;
    registerComponent(name: string, component: unknown): void;
};

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

/**
 * Register the Video.js C2PA menu button and attach it to the control
 * bar. The popup shell remains managed by Video.js while the popup
 * content is rendered through the React bridge.
 *
 * @param videoPlayer - Video.js player instance
 */
export const initializeC2PAMenu = function (videoPlayer: VideoJsPlayerLike) {
    console.log('[C2PAMenu] Initializing C2PA menu, videoPlayer:', videoPlayer);
    console.log('[C2PAMenu] videojs available:', typeof videojs !== 'undefined', (window as Window & { videojs?: unknown }).videojs);

    const MenuButton = videojs.getComponent('MenuButton') as MenuButtonComponentClass;
    const MenuItem = videojs.getComponent('MenuItem') as unknown as MenuItemConstructor;

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
                console.log('[C2PA] Menu opened - marking as open and triggering update');
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
                console.log('[C2PA] Menu closed - marking as closed');
                handleMenuClosed();
                super.unpressButton?.();
            }
        }

        buildCSSClass() {
            return `vjs-chapters-button c2pa-menu-button ${super.buildCSSClass?.() ?? ''}`.trim();
        }
    }

    videojs.registerComponent('C2PAMenuButton', C2PAMenuButton);

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

    console.log('[C2PAMenu] C2PA menu button added to control bar');
    console.log('[C2PAMenu] Control bar children:', videoPlayer.controlBar.children());
};

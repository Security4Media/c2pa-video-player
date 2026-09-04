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

/**
 * The control-bar button that opens the validation log.
 *
 * A plain video.js Button rather than a MenuButton: the panel is a React
 * overlay in the player root, not a popup video.js manages, so none of the
 * press/focus machinery a MenuButton brings applies here.
 */

import videojs from 'video.js';
import { toggleDebugConsole } from '../C2paMenu/C2paMenuBridge';

interface ButtonComponentLike {
    el(): HTMLElement;
    // Declared as methods rather than function-valued properties: a subclass
    // overriding one as a method is an error against a property signature
    // (TS2425), and every video.js override below is a method.
    buildCSSClass?(): string;
    addClass?(className: string): void;
    removeClass?(className: string): void;
}

type ButtonComponentClass = new (...args: unknown[]) => ButtonComponentLike;

interface DebugButtonPlayer {
    controlBar: {
        addChild(name: string, options?: Record<string, unknown>, index?: number): unknown;
        getChild(name: string): ButtonComponentLike | null;
        removeChild(name: string): void;
    };
}

// Narrowed for the same reason as the menu button's cast: video.js's own types
// describe `el()` as returning `Element`, while everything here needs the
// HTMLElement members.
const Button = videojs.getComponent('Button') as unknown as ButtonComponentClass;

class C2PADebugButton extends Button {
    handleClick() {
        toggleDebugConsole();
    }

    buildCSSClass() {
        return `c2pa-debug-button ${super.buildCSSClass?.() ?? ''}`.trim();
    }
}

// Registered at module scope: the registry is global while a player is not, so
// doing this per player would define a fresh class each time and re-register it
// under one name.
videojs.registerComponent(
    'C2PADebugButton',
    C2PADebugButton as unknown as Parameters<typeof videojs.registerComponent>[1],
);

const HIDDEN_CLASS = 'vjs-hidden';

/**
 * Adds the button, hidden.
 *
 * Hidden to begin with because whether there is anything to log is not known
 * until the adapter reports itself: a monolithic MP4 has one verdict for the
 * whole asset and no per-segment record, so a log button there would open an
 * empty panel. `setDebugButtonAvailable` reveals it once a fragmented source
 * is confirmed.
 */
export const initializeC2PADebugButton = function (videoPlayer: DebugButtonPlayer) {
    videoPlayer.controlBar.addChild(
        'C2PADebugButton',
        {
            controlText: 'Validation log',
            title: 'Validation log',
        },
        1,
    );

    videoPlayer.controlBar.getChild('C2PADebugButton')?.addClass?.(HIDDEN_CLASS);
};

export const setDebugButtonAvailable = function (
    videoPlayer: DebugButtonPlayer,
    available: boolean,
) {
    const button = videoPlayer.controlBar.getChild('C2PADebugButton');

    if (!button) {
        return;
    }

    if (available) {
        button.removeClass?.(HIDDEN_CLASS);
    } else {
        button.addClass?.(HIDDEN_CLASS);
    }
};

export const removeC2PADebugButton = function (videoPlayer: DebugButtonPlayer) {
    videoPlayer.controlBar.removeChild('C2PADebugButton');
};

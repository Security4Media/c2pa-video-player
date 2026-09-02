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

export interface VideoJsComponentLike {
    el(): HTMLElement | null;
}

export interface VideoJsMenuComponentLike extends VideoJsComponentLike {}

export interface VideoJsControlBarLike {
    addChild(name: string, options?: Record<string, unknown>, index?: number): unknown;
    getChild(name: string): VideoJsMenuComponentLike | null;
    children(): unknown[];
    removeChild?(name: string): void;
}

export interface VideoJsPlayerLike extends VideoJsComponentLike {
    controlBar: VideoJsControlBarLike;
    duration(): number;
}

export interface VideoJsMenuButtonComponentLike extends VideoJsMenuComponentLike {
    /**
     * Video.js's own record of whether the popup is open. Read rather than
     * mirrored: it is the single source of truth for press state, and keeping a
     * second copy is what let the two disagree.
     */
    buttonPressed_?: boolean;
    player_?: unknown;
    pressButton?(): void;
    unpressButton?(): void;
    buildCSSClass?(): string;
}

export interface C2paMenuBridgeState {
    lastManifestId: string | null;
    isMenuOpen: boolean;
    isInvalid: boolean;
    resetVersion: number;
    /**
     * The button component, so anything outside video.js can close the menu
     * through video.js rather than around it. Typed as the button rather than
     * the bare component because `unpressButton` is the whole point of holding
     * it.
     */
    menuReference: VideoJsMenuButtonComponentLike | null;
}

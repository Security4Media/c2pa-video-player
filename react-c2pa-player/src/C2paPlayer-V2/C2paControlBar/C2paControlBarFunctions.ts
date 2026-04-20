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

import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';

declare const videojs: {
    getComponent(name: string): new (...args: unknown[]) => { update(event: unknown): void };
    registerComponent(name: string, component: unknown): void;
};

interface TimelineComponentLike {
    el(): HTMLElement;
}

interface SeekBarLike {
    addChild(name: string): void;
    getChild(name: string): TimelineComponentLike | null;
}

interface ControlBarPlayer extends VideoJsPlayerLike {
    controlBar: VideoJsPlayerLike['controlBar'] & {
        progressControl: {
            seekBar: SeekBarLike;
        };
    };
}

/**
 * Register the custom Video.js load-progress component used as the host
 * for C2PA validation timeline segments.
 *
 * @param videoPlayer - Video.js player instance
 */
export const initializeC2PAControlBar = function (videoPlayer: ControlBarPlayer): void {
    console.log('[C2PAControlBar] Initializing C2PA control bar');
    console.log('[C2PAControlBar] videojs available:', typeof videojs !== 'undefined');

    const LoadProgressBar = videojs.getComponent('LoadProgressBar');

    class C2PALoadProgressBar extends LoadProgressBar {
        update(_event: unknown) { }
    }

    videojs.registerComponent('C2PALoadProgressBar', C2PALoadProgressBar);
    console.log('[C2PAControlBar] Registered C2PALoadProgressBar component');

    videoPlayer.controlBar.progressControl.seekBar.addChild('C2PALoadProgressBar');
    console.log('[C2PAControlBar] Added C2PALoadProgressBar to seekBar');

    const c2paTimeline = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');

    console.log('[C2PAControlBar] Retrieved c2paTimeline:', c2paTimeline);

    if (!c2paTimeline) {
        console.warn('[C2PAControlBar] Failed to retrieve C2PA timeline component');
        return;
    }

    c2paTimeline.el().style.width = '100%';
    c2paTimeline.el().style.backgroundColor = 'transparent';
};

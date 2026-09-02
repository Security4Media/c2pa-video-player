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
import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';

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
 * Host for the C2PA validation timeline segments.
 *
 * Extends video.js's own load-progress bar to inherit its geometry inside the
 * seek bar, with `update` overridden to a no-op: the buffered ranges it would
 * otherwise draw are not what this bar reports.
 */
const LoadProgressBar = videojs.getComponent('LoadProgressBar');

class C2PALoadProgressBar extends LoadProgressBar {
    update(_event: unknown) { }
}

// Registered at module scope, because the registry is global while a player is
// not. Doing this inside the initializer defined a fresh class on every player
// and re-registered it under the same name, so two players would have held
// instances of two different classes that video.js believed were one.
videojs.registerComponent('C2PALoadProgressBar', C2PALoadProgressBar);

/**
 * Attach the timeline host to a player's seek bar.
 *
 * @param videoPlayer - Video.js player instance
 */
export const initializeC2PAControlBar = function (videoPlayer: ControlBarPlayer): void {
    videoPlayer.controlBar.progressControl.seekBar.addChild('C2PALoadProgressBar');

    const c2paTimeline = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');

    if (!c2paTimeline) {
        console.warn('[C2PAControlBar] Failed to retrieve C2PA timeline component');
        return;
    }

    c2paTimeline.el().style.width = '100%';
    c2paTimeline.el().style.backgroundColor = 'transparent';
    // Distinguishes our segment host from video.js's own `.vjs-load-progress`
    // (both carry that class, since this component extends LoadProgressBar).
    // The stylesheet uses it to contain the segments' z-index range in their
    // own stacking context, so the playhead handle can sit above the whole
    // stack no matter how many segments there are.
    c2paTimeline.el().classList.add('c2pa-timeline-host');
};

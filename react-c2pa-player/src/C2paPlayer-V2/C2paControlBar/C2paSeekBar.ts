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
 * Makes the live progress bar a monitor rather than a scrubber.
 *
 * On a live source the bar is a rolling record of what has been validated. It
 * is deliberately not a seek control: the two wanted different spans - five
 * minutes of provenance against the thirty seconds the origin still holds -
 * and every attempt to serve both put the cursor and the segments on different
 * scales, or shaded off nine tenths of the bar as unreachable. So seeking is
 * off here, and getting back to the edge is the LIVE button's job.
 *
 * Three overrides, all of which fall through to video.js when there is no live
 * window, so VOD and any live source without a C2PA timeline keep working
 * exactly as before:
 *
 *   - `getPercent` pins the handle to the right, where the live edge is;
 *   - `handleMouseDown` and `handleKeyDown` decline to seek.
 *
 * Hover is untouched. The preview reads `mousemove` from a listener on the
 * progress control element rather than through video.js, so suppressing the
 * seek gestures here does not take the preview with them.
 */

import videojs from 'video.js';
import { getLiveTimelineWindow } from '../C2paTimeline/liveWindowState';

/** The parts of video.js's SeekBar and LiveTracker this file touches. */
interface SeekBarInternals {
  player_: { currentTime(): number };
}

const SeekBar = videojs.getComponent('SeekBar') as unknown as {
  new (...args: unknown[]): SeekBarInternals & {
    getPercent(): number;
    handleMouseDown(event: Event): void;
    handleKeyDown(event: Event): void;
  };
};

class C2PASeekBar extends SeekBar {
  /**
   * Where the playhead is drawn: pinned to the right on a live source.
   *
   * The bar's right edge is the live edge, so the handle sitting there reads
   * as "now" and stops moving about - it no longer drifts left while paused,
   * and no longer disagrees with the segments beside it.
   *
   * It also stops carrying any information, which is the deliberate trade.
   * Whether playback is at the edge or behind it is said by the LIVE button
   * instead, whose dot video.js colours grey when behind and red when at the
   * edge; and how much has been watched is said by the settled/provisional
   * boundary in the segments themselves. A handle that is always in the same
   * place cannot contradict either of them.
   */
  getPercent(): number {
    const window = getLiveTimelineWindow();

    if (!window || !(window.size > 0)) {
      return super.getPercent();
    }

    return 1;
  }

  /**
   * Swallows the gesture that would start a seek or a scrub.
   *
   * Declining here rather than with `pointer-events: none` on the element:
   * the hover preview needs the pointer events, and video.js's own
   * ProgressControl delegates its mousedown to this method, so one refusal
   * covers clicking, dragging and touch.
   */
  handleMouseDown(event: Event): void {
    if (this.#seekingDisabled()) {
      event.stopPropagation();
      return;
    }

    super.handleMouseDown(event);
  }

  /** The same for the arrow keys, which seek a focused slider. */
  handleKeyDown(event: Event): void {
    if (this.#seekingDisabled()) {
      return;
    }

    super.handleKeyDown(event);
  }

  #seekingDisabled(): boolean {
    const window = getLiveTimelineWindow();

    return window !== null && window.size > 0;
  }
}

// Replaces video.js's own SeekBar for every player in the page. Registered at
// module scope, because the registry is global while a player is not - and
// safe to replace wholesale because both overrides fall through to `super`
// unless a live C2PA window is set.
videojs.registerComponent(
  'SeekBar',
  C2PASeekBar as unknown as Parameters<typeof videojs.registerComponent>[1],
);

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
 * Puts the live playhead on the same scale as the validation segments.
 *
 * Video.js measures a live seek bar against its own DVR window:
 *
 *     percent = (currentTime - liveTracker.seekableStart()) / liveTracker.liveWindow()
 *
 * which was a different span from the validation bar's, so the two were drawn
 * to different scales on the same strip of pixels: measured on the live feed,
 * the cursor sat at 0% while the segments it was supposed to be moving through
 * sat at 93-100%. Pausing made it worse, the cursor drifting 100% -> 62% -> 49%
 * while the segments did not move at all.
 *
 * The bar is now sized to the DVR window too, so the two agree by construction
 * and this class mostly re-derives the same answer. It stays because the bar's
 * span is capped by the configured retention, so on a stream retaining more
 * than that the two part company again - and because the arithmetic then lives
 * in one place either way.
 *
 * Only two methods need replacing, because video.js derives everything else
 * from them: `getPercent` decides where the playhead is drawn - pinned to the
 * right on live, see below - and `calculateDistance` is the sole input into
 * where a click seeks to. Both defer to video.js whenever there is no live
 * window, so VOD and any live source without a C2PA timeline behave exactly as
 * before.
 */

import videojs from 'video.js';
import { getLiveTimelineWindow } from '../C2paTimeline/liveWindowState';

/** The parts of video.js's SeekBar and LiveTracker this file touches. */
interface SeekBarInternals {
  player_: {
    currentTime(): number;
    liveTracker?: {
      isLive(): boolean;
      liveWindow(): number;
      seekableStart(): number;
    };
  };
}

const clampFraction = (value: number) => Math.min(1, Math.max(0, value));

const SeekBar = videojs.getComponent('SeekBar') as unknown as {
  new (...args: unknown[]): SeekBarInternals & {
    getPercent(): number;
    calculateDistance(event: Event): number;
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
   * Where a click seeks to, expressed as video.js wants it.
   *
   * Video.js turns this into a time with
   * `seekableStart + distance * liveWindow`, so rather than reimplement its
   * mouse handling, the fraction it is given is the one that lands at the time
   * *our* scale points to, clamped into what is actually seekable.
   *
   * Video.js also treats a distance of 0.99 or more as "go to the live edge",
   * which is the right reading of a click at the right-hand end of our bar too.
   */
  calculateDistance(event: Event): number {
    const raw = super.calculateDistance(event);
    const window = getLiveTimelineWindow();
    const tracker = this.player_.liveTracker;

    if (!window || !(window.size > 0) || !tracker?.isLive()) {
      return raw;
    }

    const liveWindow = tracker.liveWindow();

    if (!(liveWindow > 0)) {
      return raw;
    }

    const wanted = window.start + clampFraction(raw) * window.size;

    return clampFraction((wanted - tracker.seekableStart()) / liveWindow);
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

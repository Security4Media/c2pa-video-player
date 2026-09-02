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
 * The stretch of live stream the bar currently represents, shared between the
 * two things that have to agree about it.
 *
 * The timeline positions its segments against this window. The seek bar has to
 * use the same one, or the cursor and the segments are drawn to different
 * scales on the same bar - measured on the live feed, video.js placed the
 * cursor at 0% (its own 30-second DVR window) while the segments sat at
 * 93-100% (a five-minute window). That is the inconsistency this exists to
 * remove.
 *
 * Module state rather than a parameter because the two are on opposite sides of
 * video.js: the seek bar is a component video.js constructs and calls, and
 * there is no seam to hand it a value through. It is written once per timeline
 * render and read on the same tick.
 */

export interface LiveTimelineWindow {
  /** Stream time at the bar's left edge. */
  start: number;
  /** Seconds the bar spans. */
  size: number;
  /**
   * How much of the window is still seekable, as a fraction from the right
   * edge. The origin retains far less than the bar shows - 30 seconds of five
   * minutes on the streams tested - and clicking outside that range cannot go
   * where it points, so the bar has to say where seeking works.
   */
  seekableFraction: number;
}

let current: LiveTimelineWindow | null = null;

/** Called by the timeline each render. `null` on VOD, and on any non-live source. */
export function setLiveTimelineWindow(window: LiveTimelineWindow | null): void {
  current = window;
}

export function getLiveTimelineWindow(): LiveTimelineWindow | null {
  return current;
}

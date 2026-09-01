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
 * How much of a live stream the player remembers.
 *
 * One value, because these are one question wearing several hats: how far back
 * the bar reaches, how much validated history the session keeps, how long the
 * runtime holds segments for point lookups, and how many per-segment manifests
 * are cached. They were four separate constants at three different values (600s
 * in two places, 900s in two others, and a count of 300), so the bar could show
 * a stretch whose verdicts had already been evicted.
 */
export const DEFAULT_LIVE_RETENTION_SECONDS = 15 * 60;

/**
 * The narrowest the live window is allowed to get.
 *
 * The window grows with the history behind it, so without a floor the very
 * first segment would be the entire window and fill the bar end to end,
 * implying the whole stream had been checked when about four seconds of it had.
 */
export const MIN_LIVE_WINDOW_SECONDS = 60;

/**
 * Shortest segment worth planning for, used to turn a retention time into a
 * cache size. Deliberately pessimistic: a stream of unusually short segments
 * should still keep a full window of them rather than silently forget the
 * older half.
 */
const SHORTEST_EXPECTED_SEGMENT_SECONDS = 2;

/** How many segments a retention window could hold at worst. */
export function retainedSegmentCount(retentionSeconds: number): number {
  return Math.ceil(retentionSeconds / SHORTEST_EXPECTED_SEGMENT_SECONDS);
}

/**
 * Reads `?window=<seconds>`, for demonstrating and testing retention without a
 * rebuild, in the same spirit as `?trust=`. Out-of-range or unparseable values
 * fall back to the default rather than failing, since this is a diagnostic.
 */
export function resolveLiveRetentionSeconds(
  search: string | undefined = typeof window === 'undefined' ? undefined : window.location.search,
): number {
  if (!search) {
    return DEFAULT_LIVE_RETENTION_SECONDS;
  }

  const requested = Number(new URLSearchParams(search).get('window'));

  if (!Number.isFinite(requested) || requested < MIN_LIVE_WINDOW_SECONDS) {
    return DEFAULT_LIVE_RETENTION_SECONDS;
  }

  return requested;
}

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
 * Keeps the playhead from overtaking validation.
 *
 * On a live DASH source the plugin validates a segment *after* handing its
 * bytes to dash.js:
 *
 *     if (!sessionKeyStore.hasKeys()) {
 *       await this.handleManifestBoxSegment(...);   // blocks the response
 *       return;
 *     }
 *     queueMicrotask(() => { void this.handleVsiSegment(...); });
 *
 * Our streams' init segments carry `c2pa.session-keys`, so they take the second
 * path - deferred and `void`-ed. Nothing waits for it, so the picture can reach
 * a viewer before any verdict for it exists. On the ManifestBox path the
 * opposite is true and this gate never has anything to do.
 *
 * So the rule is imposed here instead: playback may not pass the newest
 * verdict. Since verdicts arrive on download and downloading normally runs
 * ahead of playback, a healthy stream never touches this.
 *
 * It can deadlock, and that is deliberate. If validation stops for good, the
 * picture stops with it - for a provenance player, showing unchecked content is
 * the worse failure. What must not happen is stopping *silently*, so the caller
 * surfaces the reason, and the switch below turns the whole thing off.
 */

export interface ValidatedPlaybackDecision {
  /** Whether playback must be held here until a verdict arrives. */
  hold: boolean;
  reason:
    | 'not-live'
    | 'disabled'
    | 'no-verdicts-yet'
    | 'ahead-of-validation'
    | 'validated';
}

export interface ValidatedPlaybackInputs {
  isLive: boolean;
  /** The policy switch. False lets playback run ahead, as it did before. */
  enforce: boolean;
  currentTime: number;
  /** End of the furthest segment that has a verdict, or null if there are none. */
  newestVerdictEnd: number | null;
}

/**
 * Tolerance for treating the playhead as still inside validated content.
 *
 * Position is sampled a few times a second and a segment's end is a float, so
 * without a little slack the gate would fire on rounding at every segment
 * boundary and stutter the picture on a perfectly healthy stream.
 */
const TOLERANCE_SECONDS = 0.5;

export function decideValidatedPlayback(
  inputs: ValidatedPlaybackInputs,
): ValidatedPlaybackDecision {
  const { isLive, enforce, currentTime, newestVerdictEnd } = inputs;

  if (!enforce) {
    return { hold: false, reason: 'disabled' };
  }

  // VOD validates on download too, but its verdicts arrive far ahead of
  // playback and its seeking is free, so gating there would only ever get in
  // the way.
  if (!isLive) {
    return { hold: false, reason: 'not-live' };
  }

  if (newestVerdictEnd === null || !Number.isFinite(newestVerdictEnd)) {
    // Nothing has been validated yet. Holding here would stop a stream from
    // ever starting, and there is a difference between "not checked" and "not
    // checked yet" - the bar shows the first as grey either way.
    return { hold: false, reason: 'no-verdicts-yet' };
  }

  if (!Number.isFinite(currentTime)) {
    return { hold: false, reason: 'validated' };
  }

  return currentTime > newestVerdictEnd + TOLERANCE_SECONDS
    ? { hold: true, reason: 'ahead-of-validation' }
    : { hold: false, reason: 'validated' };
}

/** The furthest point any verdict covers, or null when there are none. */
export function newestVerdictEnd(
  segments: readonly { endTime: number }[] | undefined,
): number | null {
  if (!segments || segments.length === 0) {
    return null;
  }

  const furthest = segments.reduce(
    (max, segment) => (Number.isFinite(segment.endTime) ? Math.max(max, segment.endTime) : max),
    Number.NEGATIVE_INFINITY,
  );

  return Number.isFinite(furthest) ? furthest : null;
}

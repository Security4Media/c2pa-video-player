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
 * What the player tells the viewer about the provenance of the moment on
 * screen, and whether it interrupts them over it.
 *
 * Two switches rather than one. A deployment may want to state provenance
 * continuously without ever stopping the picture (a monitoring wall, an
 * editorial review station), or to interrupt on bad content without leaving a
 * permanent badge over live output. Those are different editorial decisions and
 * neither implies the other, so they are read independently.
 *
 * The label defaults on; consent mode defaults to `whole-asset`, unchanged
 * from before either switch existed. Query string only, following `?trust=`,
 * `?window=` and `?gate=`: there is no UI surface for any of those, and
 * adding one for these would be the first.
 *
 * Like `?gate=off`, `?label=off` fails *closed* on a typo: only the exact
 * value `off` disables the label, so a mistyped value leaves it showing
 * rather than silently hiding it.
 */

import type { ConsentMode } from '../types';

const currentSearch = () =>
  typeof window === 'undefined' ? undefined : window.location.search;

/**
 * Reads `?label=off`.
 *
 * On by default. Only the exact value `off` disables it, since a mistyped
 * value should leave the label showing rather than silently hide it.
 */
export function resolveShowAuthenticityLabel(
  search: string | undefined = currentSearch(),
): boolean {
  if (!search) {
    return true;
  }

  return new URLSearchParams(search).get('label') !== 'off';
}

/**
 * Reads `?consent=per-stream` and `?consent=per-run`.
 *
 * `whole-asset` is the default and is what the player has always done: the
 * question is raised at most once per source, and only when the source's own
 * credentials are already known bad. Either new value is needed for it to
 * appear mid-playback on a fragmented source at all.
 *
 * Listed rather than pattern-matched, so a typo leaves the player as it is
 * today rather than falling into whichever mode happens to match loosely.
 */
const CONSENT_MODES: readonly ConsentMode[] = ['whole-asset', 'per-stream', 'per-run'];

export function resolveConsentMode(
  search: string | undefined = currentSearch(),
): ConsentMode {
  if (!search) {
    return 'whole-asset';
  }

  const requested = new URLSearchParams(search).get('consent');

  return CONSENT_MODES.includes(requested as ConsentMode)
    ? (requested as ConsentMode)
    : 'whole-asset';
}

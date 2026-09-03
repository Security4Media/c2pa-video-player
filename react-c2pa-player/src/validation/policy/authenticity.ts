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
 * Both default off, so no existing deployment changes behaviour by upgrading.
 * Query string only, following `?trust=`, `?window=` and `?gate=`: there is no
 * UI surface for any of those, and adding one for these would be the first.
 *
 * Unlike `?gate=off`, which fails *closed* on a typo because it disables a
 * protection, these fail closed by defaulting off: a mistyped value leaves the
 * player as it is today rather than putting something unexpected over the
 * picture.
 */

import type { ConsentMode } from '../types';

const currentSearch = () =>
  typeof window === 'undefined' ? undefined : window.location.search;

/**
 * Reads `?label=on`.
 *
 * Only `on` enables it. Anything else, including a typo, leaves the picture
 * clear.
 */
export function resolveShowAuthenticityLabel(
  search: string | undefined = currentSearch(),
): boolean {
  if (!search) {
    return false;
  }

  return new URLSearchParams(search).get('label') === 'on';
}

/**
 * Reads `?consent=per-run`.
 *
 * `whole-asset` is today's behaviour and the default: the question is raised at
 * most once per source, and only when the source's own credentials are already
 * known bad. `per-run` raises it once per contiguous stretch of invalid
 * content, which is the only setting under which it can appear mid-playback on
 * a fragmented source at all.
 */
export function resolveConsentMode(
  search: string | undefined = currentSearch(),
): ConsentMode {
  if (!search) {
    return 'whole-asset';
  }

  return new URLSearchParams(search).get('consent') === 'per-run'
    ? 'per-run'
    : 'whole-asset';
}

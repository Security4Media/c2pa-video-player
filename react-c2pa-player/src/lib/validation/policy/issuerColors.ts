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
 * Whether the timeline (and the authenticity label, when it is showing)
 * paints a valid segment by which issuer signed it, instead of the shared
 * "Valid"/"Trusted" verdict colour.
 *
 * Live only: a VOD asset has one signer for its whole duration, so there is
 * nothing to distinguish - on by default is harmless there. Query string
 * only, following `?window=` and `?gate=`, which this sits alongside in the
 * demo panel's live-only settings.
 */

const currentSearch = () => (typeof window === 'undefined' ? undefined : window.location.search);

/**
 * Reads `?issuerColors=off`.
 *
 * On by default. Only the exact value `off` disables it, since a mistyped
 * value should leave issuers distinguishable rather than silently flatten
 * them back to the shared verdict colour.
 */
export function resolveColorizeTimelineByIssuer(
  search: string | undefined = currentSearch(),
): boolean {
  if (!search) {
    return true;
  }

  return new URLSearchParams(search).get('issuerColors') !== 'off';
}

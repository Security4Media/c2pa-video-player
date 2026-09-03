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

import emptyListUrl from '/trust/fixtures/empty.pem?url';
import unrelatedAnchorUrl from '/trust/fixtures/unrelated-anchor.pem?url';
import { defaultTrustResourceUrls, type TrustResourceUrls } from './localTrustMaterialProvider';

/**
 * Trust policies that make each validation outcome reachable by configuration.
 *
 * Otherwise reaching 'Trusted' rather than 'Valid' depends on finding an asset
 * whose signing certificate happens to be in the right state, which is exactly
 * what stopped being true as the bundled test assets' certificates expired.
 * Selecting a policy instead keeps the outcome stable over time, and lets the
 * same asset demonstrate all three.
 *
 * These compose the real lists rather than copying them, so a fixture cannot
 * drift from what the player actually ships. Only two files are their own:
 * an empty list, and an anchor belonging to no one.
 */
export type TrustFixtureName =
  /** Everything the player normally trusts. */
  | 'full'
  /** Anchors only, so trust must come from chaining rather than the allow-list. */
  | 'anchors-only'
  /** Nothing trusted: a correctly signed asset should still validate, untrusted. */
  | 'empty'
  /** C2PA trusted, CAWG identity not: proves the identity is checked separately. */
  | 'cawg-missing'
  /** An anchor belonging to no one, as a negative control. */
  | 'wrong-anchor';

export const trustFixtures: Record<TrustFixtureName, TrustResourceUrls> = {
  full: { ...defaultTrustResourceUrls },
  'anchors-only': {
    ...defaultTrustResourceUrls,
    c2paAllowed: emptyListUrl,
    cawgAllowed: emptyListUrl,
    // Without this the community allow-list refills the list this fixture
    // exists to empty, and it silently stops testing chaining at all.
    includeRemote: false,
  },
  empty: {
    ...defaultTrustResourceUrls,
    anchors: emptyListUrl,
    c2paAllowed: emptyListUrl,
    cawgAllowed: emptyListUrl,
    // The community lists would put the anchors back.
    includeRemote: false,
  },
  // Emptying the CAWG list alone would change nothing, since the identity
  // policy is the C2PA one widened by it; the policy is stated outright.
  'cawg-missing': {
    ...defaultTrustResourceUrls,
    cawgOverride: { anchors: emptyListUrl, allowed: emptyListUrl },
  },
  'wrong-anchor': {
    ...defaultTrustResourceUrls,
    anchors: unrelatedAnchorUrl,
    c2paAllowed: emptyListUrl,
    cawgAllowed: emptyListUrl,
    includeRemote: false,
  },
};

export function isTrustFixtureName(value: string): value is TrustFixtureName {
  return value in trustFixtures;
}

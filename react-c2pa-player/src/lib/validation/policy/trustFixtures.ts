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
import {
  defaultTrustResourceUrls,
  devTrustResourceUrls,
  type TrustResourceUrls,
} from './localTrustMaterialProvider';

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
  /** The shipped policy: trust/prod/ only. Same as passing nothing. */
  | 'full-prod'
  /** trust/prod/ plus trust/dev/, so the bundled test assets can reach Trusted. */
  | 'full-dev'
  /** Anchors only, so trust must come from chaining rather than the allow-list. */
  | 'anchors-only'
  /** Nothing trusted: a correctly signed asset should still validate, untrusted. */
  | 'empty'
  /** C2PA trusted, CAWG identity not: proves the identity is checked separately. */
  | 'cawg-missing'
  /** An anchor belonging to no one, as a negative control. */
  | 'wrong-anchor';

// The four narrowing fixtures start from the development material rather than
// the shipped policy. They exist to demonstrate a mechanism against the
// bundled test assets, and several of those assets are signed by test roots
// that only trust/dev/ carries: started from prod, 'anchors-only' would find
// nothing to chain to and would stop distinguishing "this signer is
// allow-listed, not chainable" from "there are no anchors at all".
const base = devTrustResourceUrls;

export const trustFixtures: Record<TrustFixtureName, TrustResourceUrls> = {
  'full-prod': { ...defaultTrustResourceUrls },
  'full-dev': { ...devTrustResourceUrls },
  'anchors-only': {
    ...base,
    c2paAllowed: [emptyListUrl],
    cawgAllowed: [emptyListUrl],
    // Without this the community allow-list refills the list this fixture
    // exists to empty, and it silently stops testing chaining at all.
    includeRemote: false,
  },
  empty: {
    ...base,
    anchors: [emptyListUrl],
    c2paAllowed: [emptyListUrl],
    cawgAllowed: [emptyListUrl],
    // The community lists would put the anchors back.
    includeRemote: false,
    // So would the timestamp anchors: they land in the same pool, and "nothing
    // trusted" has to mean nothing. Both cleared, the file and the fetch.
    tsaAnchors: [],
    tsaRemoteUrl: undefined,
  },
  // Emptying the CAWG list alone would change nothing, since the identity
  // policy is the C2PA one widened by it; the policy is stated outright.
  'cawg-missing': {
    ...base,
    cawgOverride: { anchors: [emptyListUrl], allowed: [emptyListUrl] },
  },
  'wrong-anchor': {
    ...base,
    anchors: [unrelatedAnchorUrl],
    c2paAllowed: [emptyListUrl],
    cawgAllowed: [emptyListUrl],
    includeRemote: false,
    // One anchor belonging to no one means one, not one plus the TSA pool.
    tsaAnchors: [],
    tsaRemoteUrl: undefined,
  },
};

/**
 * Own keys only, not `in`.
 *
 * `'toString' in trustFixtures` is true, and so is `'__proto__'`, so an `in`
 * check let `?trust=toString` past the guard and then handed
 * `Object.prototype.toString` to the provider as if it were a set of URLs. The
 * fallback for an unrecognised value has to be the shipped policy, not a
 * failed trust load.
 */
export function isTrustFixtureName(value: string): value is TrustFixtureName {
  return Object.prototype.hasOwnProperty.call(trustFixtures, value);
}

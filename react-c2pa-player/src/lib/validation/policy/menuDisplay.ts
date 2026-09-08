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
 * Menu display switches - pure query-string reads with no engine involvement
 * at all (unlike `?trust=`, these never reach the C2PA SDK's own `Settings`),
 * following `?label=`/`?consent=`'s pattern in `./authenticity.ts`.
 *
 * Both default to today's more-permissive behaviour, so no existing
 * deployment loses on-screen content by upgrading.
 */

import type { IdentityTrustMode } from '../types';

export type { IdentityTrustMode };

const currentSearch = () =>
  typeof window === 'undefined' ? undefined : window.location.search;

/** Reads `?identityTrust=strict`. Anything else, including a typo, stays relaxed. */
export function resolveIdentityTrustMode(
  search: string | undefined = currentSearch(),
): IdentityTrustMode {
  if (!search) {
    return 'relaxed';
  }

  return new URLSearchParams(search).get('identityTrust') === 'strict' ? 'strict' : 'relaxed';
}

/**
 * Reads `?showCreativeWork=off`.
 *
 * Gates everything derived from the `stds.schema-org.CreativeWork` assertion
 * (Organization Details, About the Producer, Organization Identity's
 * Published-on/License lines) - not Copyright, which is `cawg.metadata`-derived
 * and unaffected by this switch, and not the identity-trust threshold above,
 * which is fully orthogonal.
 */
export function resolveShowCreativeWork(
  search: string | undefined = currentSearch(),
): boolean {
  if (!search) {
    return true;
  }

  return new URLSearchParams(search).get('showCreativeWork') !== 'off';
}

/**
 * Reads `?showUnverifiedIdentity=on`/`=off`.
 *
 * Controls whether Organization/Publisher Identity, Copyright and AI opt-out
 * may render for a `cawg.identity` verdict of `'Unknown'` - declared but never
 * checked, which is every verdict live DASH produces (`@qualabs/c2pa-live-dashjs-plugin`
 * performs no identity/trust check at all - see `verifiesCawgIdentity`) and is
 * otherwise a transient pre-verdict state elsewhere. Passed as `allowUnknown` to
 * `meetsIdentityTrustThreshold`.
 *
 * Unlike this file's other switches, absence isn't one fixed default: whether a
 * viewer should see an unverified claim by default depends on whether there was
 * ever going to be a better one. A live stream's identity will never firm up
 * beyond `Unknown` under this engine, so withholding it by default would hide
 * real content forever; a VOD asset's engine does check trust, so an `Unknown`
 * there is exactly the passing state a stricter verdict should be trusted over,
 * and showing it by default would undersell what verification is actually
 * available. Hence `isLive` decides the default, and the query string - explicit
 * `on`/`off` - always overrides it either way.
 */
export function resolveShowUnverifiedIdentity(
  isLive: boolean,
  search: string | undefined = currentSearch(),
): boolean {
  if (!search) {
    return isLive;
  }

  const raw = new URLSearchParams(search).get('showUnverifiedIdentity');

  if (raw === 'on') {
    return true;
  }

  if (raw === 'off') {
    return false;
  }

  return isLive;
}

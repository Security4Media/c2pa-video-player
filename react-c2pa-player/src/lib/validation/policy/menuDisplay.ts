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

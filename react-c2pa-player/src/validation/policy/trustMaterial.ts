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

import type { TrustMaterial } from '../types';

/**
 * The texts a trust policy is assembled from, already fetched.
 *
 * Kept separate from the loading so the assembly rules (what unions with what,
 * which list the CAWG identity is checked against) can be exercised without a
 * network, and so a test or a fixture can supply its own texts.
 */
export interface TrustMaterialSources {
  /** Trust anchors, PEM. */
  anchors: string;
  /** C2PA claim-signer end-entity certificates, PEM. */
  c2paAllowed: string;
  /** CAWG-only end-entity certificates, PEM. */
  cawgAllowed: string;
  /** Trust store configuration, `.cfg`. */
  trustConfig: string;
  /** Community anchors, when reachable. */
  remoteAnchors?: string | null;
  /** Community end-entity certificates, when reachable. */
  remoteAllowed?: string | null;
  /**
   * Replaces the derived CAWG identity policy outright.
   *
   * The default policy is deliberately the C2PA one widened by the CAWG-only
   * entries, so weakening the identity cannot be expressed by emptying the
   * CAWG list: it would still inherit every C2PA anchor and certificate. A
   * fixture proving the identity is checked separately therefore has to state
   * its policy rather than subtract from one.
   */
  cawgOverride?: { anchors: string; allowedList: string };
  wasmSrc: string;
}

/**
 * Assembles trust settings from their source texts.
 *
 * Everything stays in the format `TrustSettings` documents: PEM bundles for
 * `trustAnchors` and `allowedList` (the latter being end-entity certificates),
 * and a `.cfg` for `trustConfig`. Consumers needing another shape convert at
 * their own boundary; see policy/webCryptoAllowedList.ts for the one engine
 * that does.
 */
export function buildTrustMaterial(sources: TrustMaterialSources): TrustMaterial {
  const anchors = unionPem(sources.anchors, sources.remoteAnchors);
  const c2paAllowed = unionPem(sources.c2paAllowed, sources.remoteAllowed);

  return {
    wasmSrc: sources.wasmSrc,
    cawgTrust: {
      trustAnchors: sources.cawgOverride?.anchors ?? anchors,
      // A CAWG identity signer is trusted if it is trusted as a C2PA claim
      // signer, plus any CAWG-only entries. Checking the identity against the
      // CAWG list alone let a signer trusted for the claim fail as an identity
      // and block 'Trusted', and the two lists had already drifted apart (the
      // WDR signing certificate is in the C2PA list but not the CAWG one).
      allowedList: sources.cawgOverride?.allowedList ?? unionPem(c2paAllowed, sources.cawgAllowed),
      trustConfig: sources.trustConfig,
      // Documented default is true, but stated outright because it is the
      // whole point of supplying cawgTrust: left off, an identity signed by a
      // signer we do trust for the claim still reports untrusted and the asset
      // cannot reach 'Trusted'.
      verifyTrustList: true,
    },
    trust: {
      trustAnchors: anchors,
      allowedList: c2paAllowed,
      trustConfig: sources.trustConfig,
    },
  };
}

function unionPem(local: string, remote: string | null | undefined): string {
  return remote ? `${local}\n${remote}` : local;
}

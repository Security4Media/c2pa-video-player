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

import c2paWasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import cawgAllowedListUrl from '/trust/cawg_allowed_extended.pem?url';
import c2paAllowedListUrl from '/trust/c2pa_allowed_extended.pem?url';
import c2paTrustAnchorsUrl from '/trust/c2pa_anchors_extended.pem?url';
import c2paTrustConfigUrl from '/trust/c2pa_store.cfg?url';
import type { TrustMaterial, TrustMaterialProvider } from '../types';

// Pre-adapter code (removed in commit b01ef3f) merged this community list on
// top of the bundled local files. It's explicitly marked "frozen" by
// contentauth (superseded by the official C2PA trust list), but content
// signed against certs chaining back to it is still valid, so dropping it
// silently downgrades that content from "Trusted" with no error. Restored
// here, unioned with the local files, failing open to local-only if
// unreachable (e.g. offline/air-gapped use).
const REMOTE_TRUST_ANCHORS_URL =
  'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem';
const REMOTE_ALLOWED_LIST_URL =
  'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem';

// Everything here is kept in the format TrustSettings documents: `.pem`
// bundles for `trustAnchors` and `allowedList` (the latter being end-entity
// certificates), and a `.cfg` for `trustConfig`. Consumers that need something
// else convert at their own boundary - see policy/webCryptoAllowedList.ts for
// the one engine that does.
let trustMaterialPromise: Promise<TrustMaterial> | null = null;

export class LocalTrustMaterialProvider implements TrustMaterialProvider {
  load(): Promise<TrustMaterial> {
    trustMaterialPromise ??= Promise.all([
      fetchText(c2paTrustAnchorsUrl),
      fetchText(cawgAllowedListUrl),
      fetchText(c2paAllowedListUrl),
      fetchText(c2paTrustConfigUrl),
      fetchTextOrNull(REMOTE_TRUST_ANCHORS_URL),
      fetchTextOrNull(REMOTE_ALLOWED_LIST_URL),
    ]).then(([trustAnchors, cawgAllowed, c2paAllowed, trustConfig, remoteAnchors, remoteAllowed]) => {
      // A CAWG identity signer is trusted if it is trusted as a C2PA claim
      // signer, plus any CAWG-only entries. Previously `cawgTrust` saw only
      // `cawg_allowed_extended.pem` and only the local anchors, so a signer
      // trusted for the claim could still fail as an identity and block
      // 'Trusted' - and the two lists had already drifted (the current WDR
      // signing cert is in the C2PA list but not the CAWG one).
      const allAnchors = unionPem(trustAnchors, remoteAnchors);
      const c2paAllowedList = unionPem(c2paAllowed, remoteAllowed);

      return {
        wasmSrc: c2paWasmSrc,
        cawgTrust: {
          trustAnchors: allAnchors,
          allowedList: unionPem(c2paAllowedList, cawgAllowed),
          trustConfig,
          // Evaluate the cawg.identity assertion's signer against this list.
          // Documented default is true, but stated outright because it is the
          // whole point of supplying cawgTrust: left off, an identity signed
          // by a signer we do trust for the claim still reports untrusted and
          // the asset cannot reach 'Trusted'.
          verifyTrustList: true,
        },
        trust: {
          trustAnchors: allAnchors,
          allowedList: c2paAllowedList,
          trustConfig,
        },
      };
    });

    return trustMaterialPromise;
  }
}

function unionPem(local: string, remote: string | null): string {
  return remote ? `${local}\n${remote}` : local;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load local trust resource ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchTextOrNull(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[LocalTrustMaterialProvider] Remote trust resource ${url} returned ${response.status}; continuing with local trust material only.`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.warn(`[LocalTrustMaterialProvider] Failed to fetch remote trust resource ${url}; continuing with local trust material only.`, error);
    return null;
  }
}

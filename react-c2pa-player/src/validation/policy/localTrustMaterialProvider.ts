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
    ]).then(([trustAnchors, cawgAllowed, c2paAllowed, trustConfig, remoteAnchors, remoteAllowed]) => ({
      wasmSrc: c2paWasmSrc,
      // Matches the pre-adapter code's own asymmetry: the community allow-list
      // is unioned into both trust and cawgTrust, but the community anchors
      // list was only ever unioned into the main trust list, not cawgTrust.
      cawgTrust: {
        trustAnchors,
        allowedList: unionPem(cawgAllowed, remoteAllowed),
        trustConfig,
      },
      trust: {
        trustAnchors: unionPem(trustAnchors, remoteAnchors),
        allowedList: unionPem(c2paAllowed, remoteAllowed),
        trustConfig,
      },
    }));

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

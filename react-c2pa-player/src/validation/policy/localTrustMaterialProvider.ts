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

let trustMaterialPromise: Promise<TrustMaterial> | null = null;

export class LocalTrustMaterialProvider implements TrustMaterialProvider {
  load(): Promise<TrustMaterial> {
    trustMaterialPromise ??= Promise.all([
      fetchText(c2paTrustAnchorsUrl),
      fetchText(cawgAllowedListUrl),
      fetchText(c2paAllowedListUrl),
      fetchText(c2paTrustConfigUrl),
    ]).then(([trustAnchors, cawgAllowed, c2paAllowed, trustConfig]) => ({
      wasmSrc: c2paWasmSrc,
      cawgTrust: {
        trustAnchors,
        allowedList: cawgAllowed,
        trustConfig,
      },
      trust: {
        trustAnchors,
        allowedList: c2paAllowed,
        trustConfig,
      },
    }));

    return trustMaterialPromise;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load local trust resource ${url}: ${response.status}`);
  }

  return response.text();
}

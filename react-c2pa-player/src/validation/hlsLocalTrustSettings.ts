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

import type { TrustSettings } from '@nettrek/c2pa-hls-bridge';
import cawgAllowedList from '/trust/cawg_allowed_extended.pem?url';
import c2paAllowedList from '/trust/c2pa_allowed_extended.pem?url';
import c2paTrustAnchors from '/trust/c2pa_anchors_extended.pem?url';
import c2paTrustConfig from '/trust/c2pa_store.cfg?url';

export interface HlsBridgeTrustConfiguration {
  cawgTrust: TrustSettings;
  trust: TrustSettings;
}

let localTrustSettingsPromise: Promise<HlsBridgeTrustConfiguration> | null = null;

export function loadHlsLocalTrustConfiguration(): Promise<HlsBridgeTrustConfiguration> {
  localTrustSettingsPromise ??= Promise.all([
    fetchText(c2paTrustAnchors),
    fetchText(cawgAllowedList),
    fetchText(c2paAllowedList),
    fetchText(c2paTrustConfig),
  ]).then(([trustAnchors, cawgAllowed, c2paAllowed, trustConfig]) => ({
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

  return localTrustSettingsPromise;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load local trust resource ${url}: ${response.status}`);
  }

  return response.text();
}

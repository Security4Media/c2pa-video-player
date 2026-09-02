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

import type { ValidationPolicy } from '../types';
import { LocalTrustMaterialProvider } from './localTrustMaterialProvider';
import {
  resolveEnforceValidatedPlayback,
  resolveLiveRetentionSeconds,
} from './liveRetention';
import { isTrustFixtureName, trustFixtures } from './trustFixtures';

const defaultTrustMaterialProvider = new LocalTrustMaterialProvider();

// Providers are cached per fixture so repeated loads reuse one fetch, and so a
// fixture's material can never be served to a differently configured provider.
const fixtureProviders = new Map<string, LocalTrustMaterialProvider>();

/**
 * `?trust=<fixture>` selects a trust policy other than the shipped one.
 *
 * Present so the trusted / valid / untrusted outcomes can be demonstrated and
 * tested against the same asset, rather than by hunting for content whose
 * certificate happens to be in the right state. Unrecognised values fall back
 * to the shipped policy rather than failing, since this is a diagnostic.
 */
function selectedTrustProvider(): LocalTrustMaterialProvider {
  if (typeof window === 'undefined') {
    return defaultTrustMaterialProvider;
  }

  const requested = new URLSearchParams(window.location.search).get('trust');

  if (!requested || !isTrustFixtureName(requested) || requested === 'full') {
    return defaultTrustMaterialProvider;
  }

  let provider = fixtureProviders.get(requested);

  if (!provider) {
    provider = new LocalTrustMaterialProvider(trustFixtures[requested]);
    fixtureProviders.set(requested, provider);
    console.warn(`[C2PA] Using the '${requested}' trust fixture, not the shipped trust policy.`);
  }

  return provider;
}

export function createDefaultValidationPolicy(): ValidationPolicy {
  return {
    enableTrustVerification: true,
    trustMaterialProvider: selectedTrustProvider(),
    liveRetentionSeconds: resolveLiveRetentionSeconds(),
    enforceValidatedPlayback: resolveEnforceValidatedPlayback(),
  };
}

export { LocalTrustMaterialProvider };
export {
  DEFAULT_LIVE_RETENTION_SECONDS,
  MIN_LIVE_WINDOW_SECONDS,
  resolveEnforceValidatedPlayback,
  resolveLiveRetentionSeconds,
} from './liveRetention';

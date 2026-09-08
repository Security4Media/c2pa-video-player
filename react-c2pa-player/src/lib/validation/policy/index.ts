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

import type { CarriedSessionPolicy, MonolithicEngine, ValidationPolicy } from '../types';
import { resolveConsentMode, resolveShowAuthenticityLabel } from './authenticity';
import { LocalIcaIssuerProvider } from './icaIssuerProvider';
import { icaTrustFixtures, isIcaTrustFixtureName, type IcaTrustFixtureName } from './icaTrustFixtures';
import { resolveColorizeTimelineByIssuer } from './issuerColors';
import { LocalTrustMaterialProvider } from './localTrustMaterialProvider';
import {
  resolveEnforceValidatedPlayback,
  resolveLiveRetentionSeconds,
} from './liveRetention';
import { isTrustFixtureName, trustFixtures, type TrustFixtureName } from './trustFixtures';

const defaultTrustMaterialProvider = new LocalTrustMaterialProvider();

// Providers are cached per fixture so repeated loads reuse one fetch, and so a
// fixture's material can never be served to a differently configured provider.
const fixtureProviders = new Map<string, LocalTrustMaterialProvider>();

const defaultIcaIssuerProvider = new LocalIcaIssuerProvider();
const icaFixtureProviders = new Map<string, LocalIcaIssuerProvider>();

const currentSearch = () => (typeof window === 'undefined' ? undefined : window.location.search);

/**
 * What `?trust=` currently resolves to, or `null` for the shipped policy
 * (either because it's absent, unrecognised, or explicitly `full-prod`).
 *
 * Split out of `selectedTrustProvider` below so a caller that only wants to
 * know *which* fixture is selected - e.g. to reflect it in a UI control -
 * doesn't have to construct a `LocalTrustMaterialProvider` to find out.
 */
export function resolveTrustFixtureName(
  search: string | undefined = currentSearch(),
): TrustFixtureName | null {
  if (!search) {
    return null;
  }

  const requested = new URLSearchParams(search).get('trust');

  return requested && isTrustFixtureName(requested) && requested !== 'full-prod'
    ? requested
    : null;
}

/**
 * `?trust=<fixture>` selects a trust policy other than the shipped one.
 *
 * Present so the trusted / valid / untrusted outcomes can be demonstrated and
 * tested against the same asset, rather than by hunting for content whose
 * certificate happens to be in the right state. Unrecognised values fall back
 * to the shipped policy rather than failing, since this is a diagnostic. That
 * fallback direction is the safe one and is why it has not been changed: a
 * typo loses the diagnostic, never the trust policy.
 */
function selectedTrustProvider(): LocalTrustMaterialProvider {
  const requested = resolveTrustFixtureName();

  if (!requested) {
    return defaultTrustMaterialProvider;
  }

  let provider = fixtureProviders.get(requested);

  if (!provider) {
    provider = new LocalTrustMaterialProvider(trustFixtures[requested]);
    fixtureProviders.set(requested, provider);
    // Stated as a warning rather than a log because every one of these
    // profiles reports a different verdict from the deployed player, and
    // full-dev in particular trusts test certificates. Anyone reading a
    // verdict off a screen with one of these on should be able to tell.
    console.warn(`[C2PA] Using the '${requested}' trust profile, not the shipped trust policy.`);
  }

  return provider;
}

/**
 * What `?icaTrust=` currently resolves to, or `null` for the shipped policy.
 * See `resolveTrustFixtureName` - same split and same reasoning, for the
 * independent ICA-issuer trust dimension.
 */
export function resolveIcaTrustFixtureName(
  search: string | undefined = currentSearch(),
): IcaTrustFixtureName | null {
  if (!search) {
    return null;
  }

  const requested = new URLSearchParams(search).get('icaTrust');

  return requested && isIcaTrustFixtureName(requested) && requested !== 'full-prod'
    ? requested
    : null;
}

/**
 * `?icaTrust=<fixture>` selects an ICA-issuer trust policy other than the
 * shipped one.
 *
 * Exported (unlike `selectedTrustProvider`) because, unlike X.509 trust
 * material, the resolved issuer set never reaches the C2PA engine's own
 * `Settings` - it's read directly by the menu layer (see
 * `C2paMenu/useTrustedIcaIssuers.ts`), which has no other path to it.
 */
export function selectedIcaIssuerProvider(): LocalIcaIssuerProvider {
  const requested = resolveIcaTrustFixtureName();

  if (!requested) {
    return defaultIcaIssuerProvider;
  }

  let provider = icaFixtureProviders.get(requested);

  if (!provider) {
    provider = new LocalIcaIssuerProvider(icaTrustFixtures[requested]);
    icaFixtureProviders.set(requested, provider);
    console.warn(`[C2PA] Using the '${requested}' ICA-issuer trust profile, not the shipped one.`);
  }

  return provider;
}

/**
 * `?monolithicEngine=c2pa-web` swaps the monolithic MP4 validation runtime
 * from the shipped one (`nettrek`) to an independent one that calls
 * `@contentauth/c2pa-web` directly - see `MonolithicEngine` in `../types`.
 *
 * Only the exact value `c2pa-web` selects it; anything else, including a
 * typo, keeps the shipped runtime, the same fallback direction `?trust=` uses.
 */
export function resolveMonolithicEngine(
  search: string | undefined = currentSearch(),
): MonolithicEngine {
  if (!search) {
    return 'nettrek';
  }

  return new URLSearchParams(search).get('monolithicEngine') === 'c2pa-web'
    ? 'c2pa-web'
    : 'nettrek';
}

export function createDefaultValidationPolicy(): ValidationPolicy {
  return {
    enableTrustVerification: true,
    trustMaterialProvider: selectedTrustProvider(),
    monolithicEngine: resolveMonolithicEngine(),
    liveRetentionSeconds: resolveLiveRetentionSeconds(),
    enforceValidatedPlayback: resolveEnforceValidatedPlayback(),
    showAuthenticityLabel: resolveShowAuthenticityLabel(),
    consentMode: resolveConsentMode(),
    colorizeTimelineByIssuer: resolveColorizeTimelineByIssuer(),
  };
}

/**
 * The subset of the policy every session hands to the player layer.
 *
 * One function so a new carried setting is one edit here rather than an edit in
 * each of three sessions, three snapshots and three adapters - which is the
 * shape that lost `enforceValidatedPlayback` on HLS.
 */
export function carriedSessionPolicy(policy: ValidationPolicy): CarriedSessionPolicy {
  return {
    enforceValidatedPlayback: policy.enforceValidatedPlayback,
    showAuthenticityLabel: policy.showAuthenticityLabel,
    consentMode: policy.consentMode,
    colorizeTimelineByIssuer: policy.colorizeTimelineByIssuer,
  };
}

export { LocalTrustMaterialProvider };
export type { IcaIssuerProvider } from './icaIssuerProvider';
export { icaTrustFixtures, isIcaTrustFixtureName, type IcaTrustFixtureName } from './icaTrustFixtures';
export { resolveConsentMode, resolveShowAuthenticityLabel } from './authenticity';
export { resolveColorizeTimelineByIssuer } from './issuerColors';
export {
  resolveIdentityTrustMode,
  resolveShowCreativeWork,
  resolveShowUnverifiedIdentity,
  type IdentityTrustMode,
} from './menuDisplay';
export {
  DEFAULT_LIVE_RETENTION_SECONDS,
  MIN_LIVE_WINDOW_SECONDS,
  resolveEnforceValidatedPlayback,
  resolveLiveRetentionSeconds,
} from './liveRetention';
export { isTrustFixtureName, trustFixtures, type TrustFixtureName } from './trustFixtures';

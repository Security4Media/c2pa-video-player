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
 * The one place that reads a validation engine's output.
 *
 * Two engines are in play and they report differently. The WASM engine behind
 * `@contentauth/c2pa-web` fills `validation_results.activeManifest` with per-code
 * success and failure lists, including a positive `signingCredential.trusted`.
 * The WebCrypto engine (`@nettrek/c2pa-web-crypto`) leaves `validation_results`
 * unset, states the verdict in `validation_state`, and lists only failures in
 * `validation_status` - so there is no positive signal, and absence of a failure
 * is what "it passed" looks like. They also spell an untrusted CAWG identity
 * differently: the generic `signingCredential.untrusted` plus a URL, versus the
 * differentiated `cawg.identity.untrusted`.
 *
 * Every consumer used to re-derive its own answer from those raw shapes, and the
 * same bug (assuming the WASM layout, so reporting everything invalid under
 * WebCrypto) was found and fixed independently five times. Consumers now read
 * `ValidationEvidence` and never touch the payloads.
 */

import type { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import type { PlayerValidationState } from './types';

const CAWG_IDENTITY_LABEL = 'cawg.identity';

/**
 * How far a failure reaches.
 *
 * A BMFF hash assertion covers one fragment's media data, so a mismatch there
 * condemns that fragment alone. An identity failure is confined to the CAWG
 * assertion. Anything else is a property of the manifest, reported identically
 * by every fragment, and condemns the asset.
 */
export type FailureScope = 'manifest' | 'fragment' | 'identity';

/** `Absent` means the manifest declares no CAWG identity, not that one failed. */
export type IdentityVerdict = 'Trusted' | 'Valid' | 'Invalid' | 'Absent';

export interface ValidationFailure {
  code: string;
  scope: FailureScope;
  url?: string;
}

export interface ValidationEvidence {
  state: PlayerValidationState;
  failures: ValidationFailure[];
  identity: IdentityVerdict;
}

/** The shape both engines' failure entries share. */
interface RawStatus {
  code?: string;
  url?: string | null;
}

/** A reader exposing its own verdict, as the bridge's C2paManifestHelper does. */
interface VerdictReader {
  getManifestStoreValidationState(): string | null;
  getValidationErrors(): RawStatus[] | null | undefined;
}

export function classifyFailureScope(code: string, url?: string | null): FailureScope {
  if (code.startsWith('cawg.identity.') || url?.includes(CAWG_IDENTITY_LABEL)) {
    return 'identity';
  }

  // The BMFF hash assertion is the only per-fragment integrity check.
  return code.includes('bmffHash') ? 'fragment' : 'manifest';
}

function toFailure(status: RawStatus): ValidationFailure | null {
  const { code } = status;

  if (!code) {
    return null;
  }

  return {
    code,
    scope: classifyFailureScope(code, status.url),
    ...(status.url ? { url: status.url } : {}),
  };
}

function toFailures(statuses: readonly RawStatus[] | null | undefined): ValidationFailure[] {
  return (statuses ?? []).flatMap((status) => toFailure(status) ?? []);
}

function isUntrustedIdentity(failure: ValidationFailure): boolean {
  return (
    failure.scope === 'identity' &&
    (failure.code === 'cawg.identity.untrusted' || failure.code === 'signingCredential.untrusted')
  );
}

function declaredState(value: unknown): PlayerValidationState | null {
  return value === 'Trusted' || value === 'Valid' || value === 'Invalid' ? value : null;
}

function hasIdentityAssertion(manifest: Manifest | null | undefined): boolean {
  return Boolean(manifest?.assertions?.some((assertion) => assertion.label === CAWG_IDENTITY_LABEL));
}

/**
 * Identity verdict where no positive "trusted" code exists (the WebCrypto shape,
 * and any store reduced to a verdict plus failures).
 *
 * Absence is the signal. The identity is checked independently of the media, so
 * an asset whose fragments fail their BMFF hash still reports
 * `cawg.identity.untrusted` when the identity is not trusted; no identity
 * failure therefore means it passed everything that ran. How far that goes is
 * the store's own verdict to state, so reaching 'Trusted' is required before
 * claiming it - an untrusted identity demotes the store to 'Valid' anyway.
 */
function identityFromFailures(
  failures: readonly ValidationFailure[],
  state: PlayerValidationState,
): IdentityVerdict {
  const identityFailures = failures.filter((failure) => failure.scope === 'identity');

  if (identityFailures.length > 0) {
    // Well-formed but signed by someone not on the list is 'Valid': readable and
    // intact, just not vouched for. Anything else makes the assertion unusable.
    return identityFailures.every(isUntrustedIdentity) ? 'Valid' : 'Invalid';
  }

  return state === 'Trusted' ? 'Trusted' : 'Valid';
}

/**
 * Evidence from the WASM engine's per-code lists.
 *
 * `declaredOverallState` is the store's own top-level `validation_state`,
 * when it declared one alongside the coded lists. Preferred over re-deriving
 * from `success`/`failure` when present: this engine's `signingCredential.trusted`
 * fires for a signer found on the allow-list alone, not only for one that
 * chains to an anchor, so "no failures and at least one success" is not
 * enough to tell 'Trusted' (anchored) from 'Valid' (merely allow-listed) -
 * the store's own verdict already makes that distinction correctly. Only
 * falls back to the old success/failure-based guess when the store declares
 * nothing, which is what every synthetic/mocked store below still exercises.
 */
function fromCodedResults(
  success: readonly RawStatus[],
  failure: readonly RawStatus[],
  manifest: Manifest | null,
  declaredOverallState: PlayerValidationState | null = null,
): ValidationEvidence {
  const failures = toFailures(failure);
  const nonIdentityFailures = failures.filter((entry) => entry.scope !== 'identity');

  const state: PlayerValidationState = nonIdentityFailures.length > 0
    ? 'Invalid'
    : declaredOverallState
      ?? (success.length > 0
        ? 'Trusted'
        : failures.length > 0
          ? 'Valid'
          : 'Invalid');

  if (!hasIdentityAssertion(manifest)) {
    return { state, failures, identity: 'Absent' };
  }

  const isWellFormed = success.some(
    (entry) => entry.code === 'cawg.identity.well-formed' && entry.url?.includes(CAWG_IDENTITY_LABEL),
  );
  const isTrusted = success.some(
    (entry) => entry.code === 'signingCredential.trusted' && entry.url?.includes(CAWG_IDENTITY_LABEL),
  );

  if (isWellFormed && isTrusted) {
    return { state, failures, identity: 'Trusted' };
  }

  if (isWellFormed && failures.some(isUntrustedIdentity)) {
    return { state, failures, identity: 'Valid' };
  }

  return { state, failures, identity: 'Invalid' };
}

/** Evidence from a declared verdict plus a flat failure list (WebCrypto). */
function fromDeclaredVerdict(
  state: PlayerValidationState,
  statuses: readonly RawStatus[] | null | undefined,
  manifest: Manifest | null,
): ValidationEvidence {
  const failures = toFailures(statuses);

  return {
    state,
    failures,
    identity: hasIdentityAssertion(manifest) ? identityFromFailures(failures, state) : 'Absent',
  };
}

/**
 * Whether coded results are real rather than a placeholder.
 *
 * A store assembled from an adapter's verdict (see the menu's
 * manifestSourceDispatch) carries a code-less `success: [{}]` standing for
 * "something succeeded". Reading that as "no trusted code present" reported
 * every such identity as invalid.
 */
function hasCodedResults(success: readonly RawStatus[], failure: readonly RawStatus[]): boolean {
  return [...success, ...failure].some((entry) => Boolean(entry?.code));
}

export function readStoreEvidence(manifestStore: ManifestStore | null | undefined): ValidationEvidence {
  if (!manifestStore) {
    return { state: 'Unknown', failures: [], identity: 'Absent' };
  }

  const activeManifest = manifestStore.active_manifest
    ? manifestStore.manifests?.[manifestStore.active_manifest] ?? null
    : null;
  const coded = manifestStore.validation_results?.activeManifest;
  const success = (coded?.success ?? []) as RawStatus[];
  const failure = (coded?.failure ?? []) as RawStatus[];

  if (coded && hasCodedResults(success, failure)) {
    return fromCodedResults(success, failure, activeManifest, declaredState(manifestStore.validation_state));
  }

  const statuses = (manifestStore.validation_status ?? []) as RawStatus[];
  // A placeholder-only store still carries the adapter's own verdict; falling
  // back to 'Invalid' would condemn assets the engine passed.
  const state = declaredState(manifestStore.validation_state)
    ?? (statuses.length > 0 ? 'Invalid' : 'Unknown');

  return fromDeclaredVerdict(state, statuses, activeManifest);
}

/**
 * Evidence for one ingredient.
 *
 * Ingredients are judged more leniently than the active manifest, deliberately.
 * An ingredient signed by someone outside the trust list is still intact
 * provenance worth showing, so it reports 'Valid'; only the active manifest's
 * own signer decides whether the asset as a whole is trusted. For the same
 * reason 'Trusted' requires the positive `signingCredential.trusted` code,
 * while a validated-but-untrusted ingredient stops at 'Valid'.
 *
 * An ingredient carrying no evidence at all yields 'Unknown' rather than
 * 'Invalid': under WebCrypto nothing populates per-ingredient results, and
 * reporting absence as failure mislabelled every ingredient in the provenance
 * history.
 */
export function readIngredientEvidence(ingredient: {
  validation_results?: {
    activeManifest?: { success?: unknown[]; failure?: unknown[] } | null;
  } | null;
  validation_status?: unknown[] | null;
} | null | undefined): ValidationEvidence {
  if (!ingredient) {
    return { state: 'Unknown', failures: [], identity: 'Absent' };
  }

  const coded = ingredient.validation_results?.activeManifest;
  const success = (coded?.success ?? []) as RawStatus[];
  const failure = (coded?.failure ?? []) as RawStatus[];

  if (coded && hasCodedResults(success, failure)) {
    const failures = toFailures(failure);
    const state: PlayerValidationState = failures.length > 0
      ? ingredientStateFromFailures(failures)
      : success.some((entry) => entry.code === 'signingCredential.trusted')
        ? 'Trusted'
        : 'Valid';

    return { state, failures, identity: 'Absent' };
  }

  const failures = toFailures(ingredient.validation_status as RawStatus[] | null | undefined);

  return {
    state: failures.length > 0 ? ingredientStateFromFailures(failures) : 'Unknown',
    failures,
    identity: 'Absent',
  };
}

/** Untrusted is survivable for an ingredient; anything else is not. */
function ingredientStateFromFailures(
  failures: readonly ValidationFailure[],
): PlayerValidationState {
  return failures.every((failure) => failure.code.endsWith('.untrusted')) ? 'Valid' : 'Invalid';
}

/**
 * How far a set of failures reaches, taken together.
 *
 * Used to decide whether one fragment's failure condemns only that fragment or
 * the whole asset. Identity failures are excluded: an untrusted CAWG identity
 * does not make a fragment's media any less intact, and the store's own verdict
 * already accounts for it. Counting them would have painted the timeline red
 * for content that is merely valid-but-untrusted.
 */
export function worstScope(failures: readonly ValidationFailure[]): FailureScope | null {
  const relevant = failures.filter((failure) => failure.scope !== 'identity');

  if (relevant.length === 0) {
    return null;
  }

  return relevant.every((failure) => failure.scope === 'fragment') ? 'fragment' : 'manifest';
}

/**
 * Whether any fragment's failure condemns the whole asset.
 *
 * Both halves are needed. Scope alone is not enough, because an untrusted claim
 * signer is reported against the manifest while the engine still returns
 * 'Valid': the content is intact and merely unvouched for, so filling the
 * timeline red would misstate it. An invalid verdict alone is not enough
 * either, because a tampered fragment is invalid too, and condemning the asset
 * for it would hide which parts were actually altered.
 */
export function condemnsWholeAsset(
  verdicts: readonly { validationState: PlayerValidationState; failureScope: FailureScope | null }[],
): boolean {
  return verdicts.some(
    (verdict) => verdict.validationState === 'Invalid' && verdict.failureScope === 'manifest',
  );
}

/**
 * Evidence from a bridge reader, which states its verdict directly instead of
 * leaving it to be inferred.
 */
export function readReaderEvidence(reader: VerdictReader | null | undefined): ValidationEvidence {
  if (!reader) {
    return { state: 'Unknown', failures: [], identity: 'Absent' };
  }

  const state = declaredState(reader.getManifestStoreValidationState()) ?? 'Invalid';

  return { state, failures: toFailures(reader.getValidationErrors()), identity: 'Absent' };
}

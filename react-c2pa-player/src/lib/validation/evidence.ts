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
 * Success code for a CAWG Identity Claims Aggregation (ICA) Verifiable
 * Credential - a different `cawg.identity` shape from the X.509/COSE one the
 * rest of this file was written for (`verifiedIdentities` instead of
 * `signer_payload.referenced_assertions`). Confirmed against real Adobe- and
 * WDR-signed assets via c2patool: the engine emits this to say the
 * credential's own signature is internally valid - it does not evaluate
 * whether the credential's issuer (a DID) should be trusted, since neither
 * engine has any DID trust-anchor concept. No paired failure code has been
 * observed yet.
 */
const CAWG_ICA_CREDENTIAL_VALID_CODE = 'cawg.ica.credential_valid';

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

/**
 * Whether a coded/flat status list contains an entry with this code, scoped
 * by URL. `urlIncludes` accepts several substrings that must *all* appear -
 * e.g. a manifest id and an assertion label together, so a code emitted for
 * the right assertion on the wrong manifest (or vice versa) is not mistaken
 * for a match. The first reusable version of a check every reader here used
 * to hand-roll separately (see `isWellFormed`/`isTrusted` below).
 */
/**
 * Whether `part` appears as a whole path segment of `url` - bounded by `/`,
 * or by the start/end of the string - rather than as a bare substring.
 *
 * Real jumbf URLs are shaped like
 * `self#jumbf=/c2pa/<manifestId>/c2pa.assertions/<label>`, always delimited
 * by `/`. A bare substring check would let a short manifest id or label that
 * happens to be a substring of a different one - more likely with short
 * fixture ids than with real UUIDs - be mistaken for a match.
 */
function urlContainsSegment(url: string | null | undefined, part: string): boolean {
  if (!url) {
    return false;
  }

  const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return new RegExp(`(^|/)${escaped}($|/)`).test(url);
}

function hasStatusCode(
  statuses: readonly RawStatus[],
  code: string,
  urlIncludes?: string | readonly string[],
): boolean {
  const required = urlIncludes ? (Array.isArray(urlIncludes) ? urlIncludes : [urlIncludes]) : [];

  return statuses.some(
    (entry) => entry.code === code && required.every((part) => urlContainsSegment(entry.url, part)),
  );
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

  // The ICA credential shape reports its own well-formedness under a
  // different code (see CAWG_ICA_CREDENTIAL_VALID_CODE); accepting either
  // here is what keeps a manifest whose only identity is an ICA credential
  // (no `cawg.identity.well-formed` will ever fire for it) from being read as
  // 'Invalid' - it is well-formed, just not evaluated for DID trust here.
  const isWellFormed = hasStatusCode(success, 'cawg.identity.well-formed', CAWG_IDENTITY_LABEL)
    || hasStatusCode(success, CAWG_ICA_CREDENTIAL_VALID_CODE, CAWG_IDENTITY_LABEL);
  const isTrusted = hasStatusCode(success, 'signingCredential.trusted', CAWG_IDENTITY_LABEL);

  if (isWellFormed && isTrusted) {
    return { state, failures, identity: 'Trusted' };
  }

  // Well-formed but not positively trusted is 'Valid' whether or not the
  // engine also bothered to emit an explicit untrusted-identity failure
  // alongside it. The X.509 shape always does (measured against the WDR
  // asset); the ICA shape never does, since neither engine evaluates DID
  // trust at all - it only ever emits the positive well-formed signal. Both
  // are the same claim: readable and intact, just not vouched for here.
  //
  // But "well-formed" only ever speaks to the assertion's own structure, not
  // to any *other* identity-scoped failure the engine reported alongside it
  // (there is none known today, but nothing rules one out in a future engine
  // version) - same rule `identityFromFailures` below already enforces for
  // the WebCrypto shape, kept in sync here rather than letting the two
  // readers disagree on the same input.
  const identityFailures = failures.filter((entry) => entry.scope === 'identity');

  if (isWellFormed && identityFailures.every(isUntrustedIdentity)) {
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

export interface IcaCredentialEvidence {
  /** `cawg.ica.credential_valid` was reported for this exact assertion. */
  wellFormed: boolean;
  /**
   * Some other coded entry was reported for this exact assertion. No such
   * code has been observed from any engine yet - both known engines either
   * report the well-formed success code or say nothing about this
   * credential at all - but a future engine version failing it outright is
   * not ruled out, and treating "some failure landed on this exact
   * assertion" as Invalid costs nothing today while it does.
   */
  failed: boolean;
}

/**
 * Evidence for a CAWG Identity Claims Aggregation (ICA) credential on the
 * given manifest - regardless of whether that manifest is the active one or
 * an ingredient any number of levels deep. Confirmed empirically (c2patool
 * against a real Adobe-signed asset re-wrapped by a second manifest): the
 * engine reports `cawg.ica.credential_valid` in the store's own top-level
 * `validation_results.activeManifest`/`validation_status` regardless of
 * nesting - nothing in this app reads `ingredientDeltas`, and this evidence
 * never lands there either, so no ingredient-tree walk is needed here, only
 * the manifest id to scope the match to the right assertion.
 *
 * `wellFormed` only says the credential's own signature is internally
 * consistent - checked by the standalone c2pa-web/WASM engine. Confirmed
 * separately (via @nettrek/c2pa-web-crypto's own README and type
 * declarations) that the WebCrypto engine behind both the monolithic
 * default and the HLS bridge explicitly defers cryptographic verification of
 * this credential form and "surfaces it unverified" - so under that engine
 * neither `wellFormed` nor `failed` is ever true, and the honest answer is
 * that nothing here was checked, not that it failed.
 *
 * Neither engine has a DID trust-anchor concept, so whether the credential's
 * issuer should be trusted is the caller's own responsibility (see
 * manifestSelectors/creatorSelectors.ts, which checks the issuer against
 * this app's own trusted-ICA-issuer list).
 */
export function readIcaCredentialEvidence(
  manifestStore: ManifestStore | null | undefined,
  manifestId: string,
): IcaCredentialEvidence {
  if (!manifestStore) {
    return { wellFormed: false, failed: false };
  }

  const coded = manifestStore.validation_results?.activeManifest;
  const success = (coded?.success ?? []) as RawStatus[];
  const failure = (coded?.failure ?? []) as RawStatus[];
  const statuses = (manifestStore.validation_status ?? []) as RawStatus[];
  const scope = [manifestId, CAWG_IDENTITY_LABEL];

  // The flat `validation_status` array is only ever the *sole* channel this
  // credential's evidence bubbles up through in every case observed so far
  // (see the "bubbled-up ingredient evidence" test below): it never
  // co-occurs with coded results for the same store. Only consulting it
  // when there is no coded channel to prefer instead means the two sources
  // are never asked to agree on the same assertion - so a second, different
  // code that ever lands in that flat array *alongside* coded results
  // (e.g. some other pipeline stage's unrelated entry) cannot be
  // misidentified as a failure for this credential.
  const hasCoded = hasCodedResults(success, failure);

  const wellFormed = hasStatusCode(success, CAWG_ICA_CREDENTIAL_VALID_CODE, scope)
    || (!hasCoded && hasStatusCode(statuses, CAWG_ICA_CREDENTIAL_VALID_CODE, scope));

  const isOtherCodeForThisAssertion = (entry: RawStatus) =>
    Boolean(entry.code) && entry.code !== CAWG_ICA_CREDENTIAL_VALID_CODE
      && scope.every((part) => entry.url?.includes(part));
  const failed = failure.some(isOtherCodeForThisAssertion)
    || (!hasCoded && statuses.some(isOtherCodeForThisAssertion));

  return { wellFormed, failed };
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

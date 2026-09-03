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
// The dev files carry a redundant-looking prefix because this project builds
// with `assetFileNames: 'assets/[name].[ext]'`, no content hash. Two assets
// with the same basename do not overwrite each other - measured, Rollup
// de-duplicates by appending a digit - but the digit goes by emit order, so
// same-named files produced `assets/trust_anchors.pem` for the 14 kB dev
// overlay and `assets/trust_anchors2.pem` for the 76 kB production list.
// Nothing was lost; it was just unreadable in a deployed build.
import prodAllowedListUrl from '/trust/prod/allowed_list.pem?url';
import prodTrustAnchorsUrl from '/trust/prod/trust_anchors.pem?url';
import prodTrustConfigUrl from '/trust/prod/c2pa_store.cfg?url';
import devAllowedListUrl from '/trust/dev/dev_allowed_list.pem?url';
import devTrustAnchorsUrl from '/trust/dev/dev_trust_anchors.pem?url';
import tsaTrustAnchorsUrl from '/trust/tsa/tsa_trust_anchors.pem?url';
import type { TrustMaterial, TrustMaterialProvider } from '../types';
import { buildTrustMaterial } from './trustMaterial';

// The frozen contentauth community lists, kept as a runtime fetch for the
// development profile only.
//
// trust/prod/ already contains a pinned merge of these (see its README), so the
// shipped policy does not need them and is better off deterministic: a trust
// decision that depends on whether GitHub answered is not one anybody can
// reproduce. The development profile keeps fetching them because it is the only
// place a newly published signer would appear without regenerating a bundle.
// Either way the fetch fails open to the local files, for offline use.
const REMOTE_TRUST_ANCHORS_URL =
  'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem';
const REMOTE_ALLOWED_LIST_URL =
  'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem';

/**
 * The C2PA conformance programme's timestamp-authority trust list.
 *
 * Fetched rather than vendored, deliberately: a TSA list is the one piece of
 * trust material where being current matters more than being reproducible,
 * because a timestamp that cannot be trusted silently downgrades every
 * signature made with an since-expired certificate. Unlike the two community
 * lists above it is fetched by **both** profiles, including `full-prod`, and
 * so is the one runtime dependency the shipped policy has.
 *
 * It fails open, like the others: no TSA list means timestamps are validated
 * but not trusted, so certificate validity is judged against `now` instead of
 * the timestamp's genTime. That is a degradation (old content stops reading
 * as Trusted), never a widening.
 */
const REMOTE_TSA_TRUST_LIST_URL =
  'https://raw.githubusercontent.com/c2pa-org/conformance-public/refs/heads/main/trust-list/C2PA-TSA-TRUST-LIST.pem';

/**
 * Where each list is read from.
 *
 * The three certificate slots are lists of files, unioned in order, so a
 * profile can be expressed as a base plus an overlay rather than as a second
 * copy of the base. That is what keeps `full-dev` from drifting away from
 * `full-prod` when the production bundle is regenerated: it names the same
 * file and adds one.
 *
 * Overridable so a test can point the player at a trust fixture and drive the
 * trusted / valid / untrusted outcomes by configuration. Otherwise reaching a
 * given outcome depends on finding an asset whose certificate happens to be in
 * the right state, which does not survive those certificates expiring.
 */
export interface TrustResourceUrls {
  anchors: readonly string[];
  c2paAllowed: readonly string[];
  cawgAllowed: readonly string[];
  /** Trust store configuration, `.cfg`. One file, used for both policies. */
  trustConfig: string;
  /**
   * Timestamp-authority anchors. Held apart from `anchors` so a profile can
   * say whether it wants TSA trust, and so the negative controls can drop it,
   * but unioned into the same pool at the end because the engine has only one.
   */
  tsaAnchors?: readonly string[];
  /** The C2PA TSA trust list, fetched at runtime. Omit to skip the fetch. */
  tsaRemoteUrl?: string;
  /** Community lists are skipped when false, e.g. to keep a test offline. */
  includeRemote?: boolean;
  /**
   * States the CAWG identity policy outright instead of deriving it from the
   * C2PA one. See TrustMaterialSources.cawgOverride.
   */
  cawgOverride?: { anchors: readonly string[]; allowed: readonly string[] };
}

/**
 * The shipped policy: the pinned production bundle and nothing else.
 *
 * Deliberately does not include trust/dev/, which carries test roots (an EBU
 * test CA, the C2PA test signer, broadcaster test identities). A deployment
 * that trusted those would report test-signed content as authentic, which is
 * the one mistake a provenance player must not make. The development material
 * is reachable only through `?trust=full-dev`.
 */
export const defaultTrustResourceUrls: TrustResourceUrls = {
  anchors: [prodTrustAnchorsUrl],
  c2paAllowed: [prodAllowedListUrl],
  // prod/ is a single list used for both sections, as its README states.
  cawgAllowed: [prodAllowedListUrl],
  trustConfig: prodTrustConfigUrl,
  // Timestamp trust is not a development affordance, so it is in both
  // profiles: without it a signature made before its certificate expired
  // reads as untrusted, which is a wrong answer rather than a cautious one.
  tsaAnchors: [tsaTrustAnchorsUrl],
  tsaRemoteUrl: REMOTE_TSA_TRUST_LIST_URL,
  includeRemote: false,
};

/** The production bundle plus the development overlay. See trust/dev/README.md. */
export const devTrustResourceUrls: TrustResourceUrls = {
  anchors: [prodTrustAnchorsUrl, devTrustAnchorsUrl],
  c2paAllowed: [prodAllowedListUrl, devAllowedListUrl],
  cawgAllowed: [prodAllowedListUrl, devAllowedListUrl],
  trustConfig: prodTrustConfigUrl,
  tsaAnchors: [tsaTrustAnchorsUrl],
  tsaRemoteUrl: REMOTE_TSA_TRUST_LIST_URL,
  includeRemote: true,
};

export class LocalTrustMaterialProvider implements TrustMaterialProvider {
  readonly #urls: TrustResourceUrls;
  // Per instance, not per module: a module-level cache is shared mutable state
  // that outlives whichever provider populated it, so a second provider
  // configured differently would silently receive the first one's material.
  #cached: Promise<TrustMaterial> | null = null;

  constructor(urls: TrustResourceUrls = defaultTrustResourceUrls) {
    this.#urls = urls;
  }

  load(): Promise<TrustMaterial> {
    this.#cached ??= this.#load();

    return this.#cached;
  }

  async #load(): Promise<TrustMaterial> {
    const includeRemote = this.#urls.includeRemote ?? true;
    const override = this.#urls.cawgOverride;
    const tsaUrls = this.#urls.tsaAnchors ?? [];
    const [
      anchors,
      cawgAllowed,
      c2paAllowed,
      trustConfig,
      tsaAnchors,
      remoteTsaAnchors,
      remoteAnchors,
      remoteAllowed,
      cawgOverrideAnchors,
      cawgOverrideAllowed,
    ] = await Promise.all([
      fetchJoined(this.#urls.anchors),
      fetchJoined(this.#urls.cawgAllowed),
      fetchJoined(this.#urls.c2paAllowed),
      fetchText(this.#urls.trustConfig),
      tsaUrls.length > 0 ? fetchJoined(tsaUrls) : null,
      this.#urls.tsaRemoteUrl ? fetchTextOrNull(this.#urls.tsaRemoteUrl) : null,
      includeRemote ? fetchTextOrNull(REMOTE_TRUST_ANCHORS_URL) : null,
      includeRemote ? fetchTextOrNull(REMOTE_ALLOWED_LIST_URL) : null,
      override ? fetchJoined(override.anchors) : null,
      override ? fetchJoined(override.allowed) : null,
    ]);

    return buildTrustMaterial({
      anchors,
      c2paAllowed,
      cawgAllowed,
      trustConfig,
      tsaAnchors,
      remoteTsaAnchors,
      remoteAnchors,
      remoteAllowed,
      ...(cawgOverrideAnchors !== null && cawgOverrideAllowed !== null
        ? { cawgOverride: { anchors: cawgOverrideAnchors, allowedList: cawgOverrideAllowed } }
        : {}),
      wasmSrc: c2paWasmSrc,
    });
  }
}

/**
 * Concatenates several PEM files into the one bundle `TrustSettings` expects.
 *
 * A newline between them rather than a bare join: a file with no trailing
 * newline would otherwise run its last base64 line into the next file's
 * `-----BEGIN CERTIFICATE-----` and lose both certificates. Duplicates across
 * files are left in, since every consumer either de-duplicates (see
 * policy/webCryptoAllowedList.ts) or is indifferent to a repeated entry.
 */
async function fetchJoined(urls: readonly string[]): Promise<string> {
  const texts = await Promise.all(urls.map(fetchText));

  return texts.join('\n');
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
      console.warn(
        `[LocalTrustMaterialProvider] Remote trust resource ${url} returned ${response.status}; continuing with local trust material only.`,
      );
      return null;
    }

    return await response.text();
  } catch (error) {
    console.warn(
      `[LocalTrustMaterialProvider] Failed to fetch remote trust resource ${url}; continuing with local trust material only.`,
      error,
    );
    return null;
  }
}

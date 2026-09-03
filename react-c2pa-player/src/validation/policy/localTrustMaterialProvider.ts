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
import { buildTrustMaterial } from './trustMaterial';

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

/**
 * Where each list is read from.
 *
 * Overridable so a test can point the player at a trust fixture and drive the
 * trusted / valid / untrusted outcomes by configuration. Otherwise reaching a
 * given outcome depends on finding an asset whose certificate happens to be in
 * the right state, which does not survive those certificates expiring.
 */
export interface TrustResourceUrls {
  anchors: string;
  c2paAllowed: string;
  cawgAllowed: string;
  trustConfig: string;
  /** Community lists are skipped when false, e.g. to keep a test offline. */
  includeRemote?: boolean;
  /**
   * States the CAWG identity policy outright instead of deriving it from the
   * C2PA one. See TrustMaterialSources.cawgOverride.
   */
  cawgOverride?: { anchors: string; allowed: string };
}

export const defaultTrustResourceUrls: TrustResourceUrls = {
  anchors: c2paTrustAnchorsUrl,
  c2paAllowed: c2paAllowedListUrl,
  cawgAllowed: cawgAllowedListUrl,
  trustConfig: c2paTrustConfigUrl,
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
    const [
      anchors,
      cawgAllowed,
      c2paAllowed,
      trustConfig,
      remoteAnchors,
      remoteAllowed,
      cawgOverrideAnchors,
      cawgOverrideAllowed,
    ] = await Promise.all([
      fetchText(this.#urls.anchors),
      fetchText(this.#urls.cawgAllowed),
      fetchText(this.#urls.c2paAllowed),
      fetchText(this.#urls.trustConfig),
      includeRemote ? fetchTextOrNull(REMOTE_TRUST_ANCHORS_URL) : null,
      includeRemote ? fetchTextOrNull(REMOTE_ALLOWED_LIST_URL) : null,
      override ? fetchText(override.anchors) : null,
      override ? fetchText(override.allowed) : null,
    ]);

    return buildTrustMaterial({
      anchors,
      c2paAllowed,
      cawgAllowed,
      trustConfig,
      remoteAnchors,
      remoteAllowed,
      ...(cawgOverrideAnchors !== null && cawgOverrideAllowed !== null
        ? { cawgOverride: { anchors: cawgOverrideAnchors, allowedList: cawgOverrideAllowed } }
        : {}),
      wasmSrc: c2paWasmSrc,
    });
  }
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

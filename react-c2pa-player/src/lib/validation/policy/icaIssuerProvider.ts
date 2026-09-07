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

import prodIcaIssuersUrl from '/trust/prod/cawg_ica_issuers.txt?url';
import devIcaIssuersUrl from '/trust/dev/dev_cawg_ica_issuers.txt?url';

/**
 * Trusted issuer DIDs for CAWG Identity Claims Aggregation (ICA) Verifiable
 * Credentials.
 *
 * A parallel trust path, not an extension of `LocalTrustMaterialProvider`:
 * everything in that provider ends up inside `TrustSettings`/`CawgTrustSettings`
 * and is consumed by the C2PA engine. This list is consumed entirely by app
 * code (see manifestSelectors/creatorSelectors.ts) - the engine has no DID
 * trust-anchor concept at all, so this never touches `Settings`.
 */
export interface IcaIssuerProvider {
  load(): Promise<ReadonlySet<string>>;
}

/** Where the trusted-issuer list is read from. See TrustResourceUrls for the X.509 equivalent. */
export interface IcaIssuerResourceUrls {
  urls: readonly string[];
}

/** The shipped policy: trust/prod/ only. Same as passing nothing. */
export const defaultIcaIssuerResourceUrls: IcaIssuerResourceUrls = {
  urls: [prodIcaIssuersUrl],
};

/** The production list plus the development overlay. */
export const devIcaIssuerResourceUrls: IcaIssuerResourceUrls = {
  urls: [prodIcaIssuersUrl, devIcaIssuersUrl],
};

/** One DID per line; blank lines and `#`-comments are ignored. */
function parseIcaIssuers(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export class LocalIcaIssuerProvider implements IcaIssuerProvider {
  readonly #urls: IcaIssuerResourceUrls;
  // Per instance, not per module - same reasoning as LocalTrustMaterialProvider:
  // a module-level cache would let a fixture-configured instance leak its
  // material to a differently-configured one.
  #cached: Promise<ReadonlySet<string>> | null = null;

  constructor(urls: IcaIssuerResourceUrls = defaultIcaIssuerResourceUrls) {
    this.#urls = urls;
  }

  load(): Promise<ReadonlySet<string>> {
    this.#cached ??= this.#load();

    return this.#cached;
  }

  async #load(): Promise<ReadonlySet<string>> {
    const texts = await Promise.all(this.#urls.urls.map(fetchText));
    const issuers = texts.flatMap(parseIcaIssuers);

    return new Set(issuers);
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ICA issuer list ${url}: ${response.status}`);
  }

  return response.text();
}

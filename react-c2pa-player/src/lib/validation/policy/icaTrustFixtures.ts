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

import emptyIcaIssuersUrl from '/trust/fixtures/empty-ica-issuers.txt?url';
import wrongIcaIssuerUrl from '/trust/fixtures/wrong-ica-issuer.txt?url';
import {
  defaultIcaIssuerResourceUrls,
  devIcaIssuerResourceUrls,
  type IcaIssuerResourceUrls,
} from './icaIssuerProvider';

/**
 * ICA issuer trust policies that make each outcome reachable by
 * configuration, mirroring `TrustFixtureName` - but this is a genuinely
 * independent dimension from the X.509 `?trust=` profile, since the two
 * trust models don't derive from or widen one another. Selected separately,
 * via `?icaTrust=`.
 */
export type IcaTrustFixtureName =
  /** The shipped policy: trust/prod/ only. Same as passing nothing. */
  | 'full-prod'
  /** trust/prod/ plus trust/dev/. */
  | 'full-dev'
  /** No issuer trusted: a well-formed ICA credential should still resolve to 'Valid', not 'Trusted'. */
  | 'empty'
  /** An issuer DID belonging to no one, as a negative control. */
  | 'wrong-issuer';

export const icaTrustFixtures: Record<IcaTrustFixtureName, IcaIssuerResourceUrls> = {
  'full-prod': { ...defaultIcaIssuerResourceUrls },
  'full-dev': { ...devIcaIssuerResourceUrls },
  empty: { urls: [emptyIcaIssuersUrl] },
  'wrong-issuer': { urls: [wrongIcaIssuerUrl] },
};

/** Own keys only, not `in` - see `isTrustFixtureName`'s identical reasoning. */
export function isIcaTrustFixtureName(value: string): value is IcaTrustFixtureName {
  return Object.prototype.hasOwnProperty.call(icaTrustFixtures, value);
}

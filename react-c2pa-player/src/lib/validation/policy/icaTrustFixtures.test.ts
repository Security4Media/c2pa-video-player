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

import { describe, expect, it } from 'vitest';
import { defaultIcaIssuerResourceUrls } from './icaIssuerProvider';
import { icaTrustFixtures, isIcaTrustFixtureName } from './icaTrustFixtures';

describe('the shipped ICA-issuer trust policy', () => {
  it('does not name any development-only issuer list', () => {
    expect(defaultIcaIssuerResourceUrls.urls.every((url) => !url.includes('dev_'))).toBe(true);
  });

  it('is what full-prod selects, so the two cannot disagree', () => {
    expect(icaTrustFixtures['full-prod']).toStrictEqual({ ...defaultIcaIssuerResourceUrls });
  });
});

describe('the development ICA-issuer trust profile', () => {
  it('adds the development overlay to the shipped list rather than replacing it', () => {
    expect(icaTrustFixtures['full-dev'].urls).toEqual([
      ...defaultIcaIssuerResourceUrls.urls,
      expect.stringContaining('dev_cawg_ica_issuers'),
    ]);
  });
});

describe('the negative controls', () => {
  it('empty names no issuer at all, not even the shipped one', () => {
    expect(icaTrustFixtures.empty.urls).toEqual([expect.stringContaining('empty-ica-issuers')]);
  });

  it('wrong-issuer names a DID belonging to no one this app trusts', () => {
    expect(icaTrustFixtures['wrong-issuer'].urls).toEqual([expect.stringContaining('wrong-ica-issuer')]);
  });
});

describe('isIcaTrustFixtureName', () => {
  it('accepts every profile that exists', () => {
    for (const name of Object.keys(icaTrustFixtures)) {
      expect(isIcaTrustFixtureName(name)).toBe(true);
    }
  });

  it('rejects anything else, including inherited property names', () => {
    expect(isIcaTrustFixtureName('')).toBe(false);
    expect(isIcaTrustFixtureName('prod')).toBe(false);
    expect(isIcaTrustFixtureName('toString')).toBe(false);
    expect(isIcaTrustFixtureName('__proto__')).toBe(false);
  });
});

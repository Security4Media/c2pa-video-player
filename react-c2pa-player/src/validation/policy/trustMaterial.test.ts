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
import { buildTrustMaterial, type TrustMaterialSources } from './trustMaterial';

const sources = (overrides: Partial<TrustMaterialSources> = {}): TrustMaterialSources => ({
  anchors: 'ANCHORS',
  c2paAllowed: 'C2PA_ALLOWED',
  cawgAllowed: 'CAWG_ALLOWED',
  trustConfig: 'STORE_CFG',
  wasmSrc: 'wasm',
  ...overrides,
});

const contains = (value: string | string[] | undefined, needle: string) =>
  typeof value === 'string' && value.includes(needle);

describe('buildTrustMaterial', () => {
  it('gives the C2PA policy its own list, without the CAWG-only entries', () => {
    const { trust } = buildTrustMaterial(sources());

    expect(contains(trust.allowedList, 'C2PA_ALLOWED')).toBe(true);
    expect(contains(trust.allowedList, 'CAWG_ALLOWED')).toBe(false);
  });

  it('widens the CAWG identity policy with the C2PA list', () => {
    // A signer trusted for the claim must not fail as an identity: the two
    // lists had drifted, and the WDR signing certificate is only in the C2PA one.
    const { cawgTrust } = buildTrustMaterial(sources());

    expect(contains(cawgTrust.allowedList, 'C2PA_ALLOWED')).toBe(true);
    expect(contains(cawgTrust.allowedList, 'CAWG_ALLOWED')).toBe(true);
  });

  it('turns CAWG trust validation on, which is the point of supplying the policy', () => {
    expect(buildTrustMaterial(sources()).cawgTrust.verifyTrustList).toBe(true);
  });

  it('shares anchors between the two policies by default', () => {
    const material = buildTrustMaterial(sources());

    expect(material.cawgTrust.trustAnchors).toBe(material.trust.trustAnchors);
  });

  it('unions the community lists in when they were reachable', () => {
    const material = buildTrustMaterial(
      sources({ remoteAnchors: 'REMOTE_ANCHORS', remoteAllowed: 'REMOTE_ALLOWED' }),
    );

    expect(contains(material.trust.trustAnchors, 'ANCHORS')).toBe(true);
    expect(contains(material.trust.trustAnchors, 'REMOTE_ANCHORS')).toBe(true);
    expect(contains(material.trust.allowedList, 'REMOTE_ALLOWED')).toBe(true);
  });

  it('falls back to the local lists alone when they were not', () => {
    // Offline or air-gapped use must not fail, only trust less.
    const material = buildTrustMaterial(sources({ remoteAnchors: null, remoteAllowed: null }));

    expect(material.trust.trustAnchors).toBe('ANCHORS');
    expect(material.trust.allowedList).toBe('C2PA_ALLOWED');
  });

  describe('CAWG override', () => {
    const overridden = buildTrustMaterial(
      sources({ cawgOverride: { anchors: '', allowedList: '' } }),
    );

    it('replaces the identity policy rather than subtracting from it', () => {
      // Emptying `cawgAllowed` alone would leave the identity trusting every
      // C2PA anchor and certificate, so a fixture has to state the policy.
      expect(overridden.cawgTrust.trustAnchors).toBe('');
      expect(overridden.cawgTrust.allowedList).toBe('');
    });

    it('leaves the C2PA policy untouched, which is what makes the two separable', () => {
      expect(overridden.trust.trustAnchors).toBe('ANCHORS');
      expect(overridden.trust.allowedList).toBe('C2PA_ALLOWED');
    });
  });
});

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
import { defaultTrustResourceUrls } from './localTrustMaterialProvider';
import { isTrustFixtureName, trustFixtures, type TrustFixtureName } from './trustFixtures';

const every = (name: TrustFixtureName): readonly string[] => {
  const fixture = trustFixtures[name];

  return [
    ...fixture.anchors,
    ...fixture.c2paAllowed,
    ...fixture.cawgAllowed,
    ...(fixture.cawgOverride?.anchors ?? []),
    ...(fixture.cawgOverride?.allowed ?? []),
  ];
};

const mentionsDevMaterial = (name: TrustFixtureName): boolean =>
  every(name).some((url) => url.includes('dev_'));

describe('the shipped trust policy', () => {
  // The one thing a provenance player must not do is report test-signed
  // content as authentic. trust/dev/ carries an EBU test root, the C2PA test
  // signer and several broadcaster test identities, so it has to stay
  // unreachable unless it is asked for by name.
  it('does not name any development trust material', () => {
    const urls = [
      ...defaultTrustResourceUrls.anchors,
      ...defaultTrustResourceUrls.c2paAllowed,
      ...defaultTrustResourceUrls.cawgAllowed,
    ];

    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => !url.includes('dev_'))).toBe(true);
  });

  it('is what full-prod selects, so the two cannot disagree', () => {
    expect(trustFixtures['full-prod']).toStrictEqual({ ...defaultTrustResourceUrls });
  });

  // prod/ is a pinned merge that already contains the community lists, so
  // fetching them again would only make the verdict depend on whether GitHub
  // answered. Asserted because it is a one-word edit away from being wrong.
  it('does not fetch the community lists at runtime', () => {
    expect(defaultTrustResourceUrls.includeRemote).toBe(false);
  });
});

describe('the development trust profile', () => {
  it('adds the development material to the shipped lists rather than replacing them', () => {
    const devFixture = trustFixtures['full-dev'];

    // Layered, not copied: the production file has to still be named, or the
    // profile becomes a second bundle that drifts when prod/ is regenerated.
    expect(devFixture.anchors).toEqual([
      ...defaultTrustResourceUrls.anchors,
      expect.stringContaining('dev_trust_anchors'),
    ]);
    expect(devFixture.c2paAllowed).toEqual([
      ...defaultTrustResourceUrls.c2paAllowed,
      expect.stringContaining('dev_allowed_list'),
    ]);
    expect(devFixture.cawgAllowed).toEqual([
      ...defaultTrustResourceUrls.cawgAllowed,
      expect.stringContaining('dev_allowed_list'),
    ]);
  });

  it('is the base the narrowing profiles start from', () => {
    // Started from prod, 'anchors-only' would have nothing to chain to and
    // would stop telling "allow-listed, not chainable" apart from "no anchors".
    expect(mentionsDevMaterial('anchors-only')).toBe(true);
    expect(mentionsDevMaterial('cawg-missing')).toBe(true);
  });
});

describe('isTrustFixtureName', () => {
  it('accepts every profile that exists', () => {
    for (const name of Object.keys(trustFixtures)) {
      expect(isTrustFixtureName(name)).toBe(true);
    }
  });

  it('rejects the profile name this replaced, so it falls back rather than half-resolving', () => {
    expect(isTrustFixtureName('full')).toBe(false);
  });

  it('rejects anything else', () => {
    expect(isTrustFixtureName('prod')).toBe(false);
    expect(isTrustFixtureName('')).toBe(false);
    expect(isTrustFixtureName('full')).toBe(false);
  });

  // Was a real defect: the guard used `in`, so these passed it and the
  // resolver then handed Object.prototype.toString to the provider as a set of
  // URLs. An unrecognised value has to fall back to the shipped policy, and
  // "unrecognised" cannot mean "not inherited from Object.prototype".
  it('rejects inherited property names', () => {
    expect(isTrustFixtureName('toString')).toBe(false);
    expect(isTrustFixtureName('constructor')).toBe(false);
    expect(isTrustFixtureName('hasOwnProperty')).toBe(false);
    expect(isTrustFixtureName('__proto__')).toBe(false);
  });
});

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
 * What the menu is willing to claim about who signed something.
 *
 * The engine that produced the verdict decides, and for DASH the answer is
 * nothing at all - which the evidence reader had no way to express, so it said
 * 'Valid'.
 */

import { describe, expect, it } from 'vitest';
import type { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import { selectOrganizationIdentity } from './cawgSelectors';

/** A manifest declaring a CAWG identity that references Dublin Core. */
const manifest = {
  assertions: [
    {
      label: 'cawg.identity',
      data: {
        signer_payload: {
          referenced_assertions: [{ url: 'self#jumbf=c2pa.assertions/cawg.metadata' }],
        },
      },
    },
    {
      label: 'cawg.metadata',
      data: { '@context': {}, 'dc:title': 'WDR C2PA Live Demo IBC 2026' },
    },
  ],
} as unknown as Manifest;

/** The shape a fragmented adapter's verdict is reduced to for the selectors. */
const store = (validationState: string): ManifestStore =>
  ({
    active_manifest: 'urn:test',
    manifests: { 'urn:test': manifest },
    validation_state: validationState,
    validation_status: [],
  }) as unknown as ManifestStore;

const statusFor = (
  adapterKind: Parameters<typeof selectOrganizationIdentity>[2],
  manifestStore: ManifestStore | undefined = store('Valid'),
) => selectOrganizationIdentity(manifest, manifestStore, adapterKind)?.validationStatus;

describe('an engine that verifies nothing about the identity', () => {
  it('reports the identity as Unknown, not Valid', () => {
    // The defect. `@svta/cml-c2pa` behind the DASH plugin runs no identity or
    // trust check whatsoever, so a `cawg.identity` assertion there means only
    // that an identity was claimed. Given a verdict and an empty failure list
    // - exactly what a DASH store reduces to - the evidence reader read the
    // absence of an identity failure as the identity having passed, and the
    // menu showed a tick reading "the organization identity is valid".
    expect(statusFor('dash-fragmented-fmp4')).toBe('Unknown');
  });

  it('says the same of an adapter that ran nothing at all', () => {
    expect(statusFor('unsupported')).toBe('Unknown');
  });

  it('does not depend on what the store happens to declare', () => {
    // Nothing the store says about identity can be right here, because nothing
    // examined it.
    expect(statusFor('dash-fragmented-fmp4', store('Trusted'))).toBe('Unknown');
    expect(statusFor('dash-fragmented-fmp4', store('Unknown'))).toBe('Unknown');
  });

  it('withholds the metadata rather than showing it marked', () => {
    // Showing a declared title or publisher next to a caveat still reads as
    // "here is who made this" - the player cannot say that unless the
    // identity vouching for it is actually trusted, so referenced content is
    // withheld entirely below Trusted rather than shown-with-a-caveat.
    const identity = selectOrganizationIdentity(manifest, store('Valid'), 'dash-fragmented-fmp4');

    expect(identity?.dublinCore).toBeNull();
  });
});

describe('an engine that does verify it', () => {
  it('reports what the store found', () => {
    expect(statusFor('hls-fragmented-fmp4', store('Trusted'))).toBe('Trusted');
    expect(statusFor('monolithic', store('Valid'))).toBe('Valid');
  });

  it('shows the referenced metadata once the identity is Trusted', () => {
    const identity = selectOrganizationIdentity(manifest, store('Trusted'), 'hls-fragmented-fmp4');

    expect(identity?.dublinCore?.title).toBe('WDR C2PA Live Demo IBC 2026');
  });

  it('withholds it when Valid but not Trusted', () => {
    const identity = selectOrganizationIdentity(manifest, store('Valid'), 'monolithic');

    expect(identity?.dublinCore).toBeNull();
  });
});

/** A manifest declaring a CAWG identity that references the schema.org
 * copyright shape of `cawg.metadata` (as opposed to the Dublin Core shape
 * above) - the shape seen in the WDR IBC 2026 sample. */
const schemaOrgManifest = {
  assertions: [
    {
      label: 'cawg.identity',
      data: {
        signer_payload: {
          referenced_assertions: [{ url: 'self#jumbf=c2pa.assertions/cawg.metadata' }],
        },
      },
    },
    {
      label: 'cawg.metadata',
      data: {
        '@context': { '@vocab': 'https://schema.org/' },
        '@type': 'VideoObject',
        copyrightHolder: {
          '@id': 'https://www.wdr.de/#organization',
          name: 'Westdeutscher Rundfunk',
          '@type': 'Organization',
          sameAs: ['https://www.wikidata.org/entity/Q203453'],
        },
        creditText: 'Westdeutscher Rundfunk',
        copyrightYear: 2026,
        publisher: {
          '@id': 'https://www.wdr.de/#organization',
          url: 'https://www.wdr.de/',
          name: 'Westdeutscher Rundfunk',
          '@type': 'NewsMediaOrganization',
          sameAs: [
            'https://www.wikidata.org/entity/Q203453',
            'https://de.wikipedia.org/wiki/Westdeutscher_Rundfunk_K%C3%B6ln',
          ],
          legalName: 'Westdeutscher Rundfunk Köln',
          alternateName: 'WDR',
        },
        copyrightNotice: '© Westdeutscher Rundfunk 2026',
      },
    },
  ],
} as unknown as Manifest;

const schemaOrgStore = (validationState: string): ManifestStore =>
  ({
    active_manifest: 'urn:test',
    manifests: { 'urn:test': schemaOrgManifest },
    validation_state: validationState,
    validation_status: [],
  }) as unknown as ManifestStore;

describe('a cawg.metadata assertion in the schema.org copyright shape', () => {
  it('is shown once the identity is Trusted', () => {
    const identity = selectOrganizationIdentity(
      schemaOrgManifest,
      schemaOrgStore('Trusted'),
      'monolithic',
    );

    expect(identity?.copyright?.copyrightNotice).toBe('© Westdeutscher Rundfunk 2026');
    expect(identity?.copyright?.copyrightHolder?.name).toBe('Westdeutscher Rundfunk');
    expect(identity?.copyright?.creditText).toBe('Westdeutscher Rundfunk');
    expect(identity?.copyright?.copyrightYear).toBe(2026);
    expect(identity?.copyright?.publisher?.name).toBe('Westdeutscher Rundfunk');
    expect(identity?.copyright?.publisher?.legalName).toBe('Westdeutscher Rundfunk Köln');
    expect(identity?.copyright?.publisher?.alternateName).toBe('WDR');
    expect(identity?.copyright?.publisher?.website).toBe('https://www.wdr.de/');
    // Only one shape of cawg.metadata is present here; the other shape's
    // selector must not cross-match it.
    expect(identity?.dublinCore).toBeNull();
  });

  it('is withheld when the identity is only Valid', () => {
    const identity = selectOrganizationIdentity(
      schemaOrgManifest,
      schemaOrgStore('Valid'),
      'monolithic',
    );

    expect(identity?.copyright).toBeNull();
  });
});

describe('with nothing to read a verdict from', () => {
  it('is Unknown rather than Invalid', () => {
    // This used to fall through to a red cross reading "the organization
    // identity could not be verified", which is an accusation. No evidence is
    // not evidence of a failure.
    // Called directly rather than through the helper: its default argument
    // would supply a store, so passing `undefined` there tested nothing.
    expect(
      selectOrganizationIdentity(manifest, undefined, 'hls-fragmented-fmp4')?.validationStatus,
    ).toBe('Unknown');
    expect(selectOrganizationIdentity(manifest)?.validationStatus).toBe('Unknown');
  });
});

describe('when the manifest and the store disagree', () => {
  it('still refuses to present the identity as verified', () => {
    // The store's active manifest declares no identity while this manifest
    // does, so one of the two is not describing the other.
    const bare = {
      active_manifest: 'urn:test',
      manifests: { 'urn:test': { assertions: [] } },
      validation_state: 'Valid',
      validation_status: [],
    } as unknown as ManifestStore;

    expect(statusFor('hls-fragmented-fmp4', bare)).toBe('Invalid');
  });
});

describe('without an identity assertion at all', () => {
  it('reports no organization identity rather than an unverified one', () => {
    const noIdentity = { assertions: [] } as unknown as Manifest;

    expect(selectOrganizationIdentity(noIdentity, store('Valid'), 'dash-fragmented-fmp4')).toBeNull();
  });
});

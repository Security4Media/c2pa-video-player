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
import type { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import {
  selectCopyrightSection,
  selectOrganizationSection,
  selectWithheldIdentityHint,
  selectWorkSection,
} from './sectionSelectors';

function x509Identity(referencedUrls: string[]) {
  return {
    label: 'cawg.identity',
    data: {
      signer_payload: {
        referenced_assertions: referencedUrls.map((url) => ({ url })),
        sig_type: 'cawg.x509.cose',
      },
    },
  };
}

const icaIdentity = {
  label: 'cawg.identity',
  data: {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://cawg.io/identity/1.1/ica/context/'],
    type: ['VerifiableCredential', 'IdentityClaimsAggregationCredential'],
    issuer: 'did:web:connected-identities.identity.adobe.com',
    verifiedIdentities: [{ type: 'cawg.social_media', username: 'x', provider: { name: 'x' } }],
  },
};

function actionsAssertion(actions: string[], label = 'c2pa.actions.v2') {
  return { label, data: { actions: actions.map((action) => ({ action })) } };
}

/** A WebCrypto-shaped store declaring the given verdict for `manifest`. */
function storeWithState(manifest: Manifest, validationState: string): ManifestStore {
  return {
    active_manifest: 'urn:test',
    manifests: { 'urn:test': manifest },
    validation_state: validationState,
    validation_status: [],
  } as unknown as ManifestStore;
}

const trustedStore = (manifest: Manifest) => storeWithState(manifest, 'Trusted');

describe('selectOrganizationSection gating', () => {
  it('is null when there is no cawg.identity at all, even with a CreativeWork organization', () => {
    const manifest = {
      assertions: [
        {
          label: 'stds.schema-org.CreativeWork',
          data: { author: [{ '@type': 'Organization', name: 'Acme' }] },
        },
      ],
    } as unknown as Manifest;

    expect(selectOrganizationSection(manifest)).toBeNull();
  });

  it('is null when the active manifest\'s cawg.identity is ICA-shaped, not X.509', () => {
    // Reproduces adobe-27.1.mp4: the active manifest's only identity is an
    // ICA credential, which carries no signature_info/referenced CreativeWork
    // content - nothing this section can show.
    const manifest = { assertions: [icaIdentity] } as unknown as Manifest;

    expect(selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic')).toBeNull();
  });

  it('is present when an X.509 cawg.identity exists and is Trusted', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    expect(selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic')).not.toBeNull();
  });

  it('is shown by default (relaxed) when the X.509 identity exists and its verdict is Valid, not Trusted', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    expect(
      selectOrganizationSection(manifest, storeWithState(manifest, 'Valid'), 'monolithic'),
    ).not.toBeNull();
  });

  it('is withheld under identityTrust=strict when the X.509 identity exists but its verdict is Valid, not Trusted', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    expect(
      selectOrganizationSection(manifest, storeWithState(manifest, 'Valid'), 'monolithic', 'strict'),
    ).toBeNull();
  });

  it('is null in both modes when the X.509 identity exists but its verdict is Invalid', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;
    // A bare declared 'Invalid' with no failure entry doesn't actually read as
    // an Invalid identity verdict (see identityFromFailures in evidence.ts:
    // absence of an identity-scoped failure means "passed"), so this needs a
    // real identity-scoped failure code to reach it.
    const invalidStore = {
      active_manifest: 'urn:test',
      manifests: { 'urn:test': manifest },
      validation_state: 'Invalid',
      validation_status: [
        { code: 'cawg.identity.malformed', url: 'self#jumbf=c2pa.assertions/cawg.identity' },
      ],
    } as unknown as ManifestStore;

    expect(selectOrganizationSection(manifest, invalidStore, 'monolithic')).toBeNull();
    expect(selectOrganizationSection(manifest, invalidStore, 'monolithic', 'strict')).toBeNull();
  });

  it('is null when nothing verified the identity at all (Unknown - e.g. no manifest store, or an adapter that never checks)', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    expect(selectOrganizationSection(manifest)).toBeNull();
    expect(
      selectOrganizationSection(manifest, trustedStore(manifest), 'dash-fragmented-fmp4'),
    ).toBeNull();
  });
});

describe('selectOrganizationSection title resolution', () => {
  it('titles it "Organization Identity" with no hint when there is no publish action at all', () => {
    // Reproduces test-5.mp4's active (WDR) manifest: only c2pa.opened.
    const manifest = {
      assertions: [x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata']), actionsAssertion(['c2pa.opened'])],
    } as unknown as Manifest;

    const section = selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic');

    expect(section?.title).toBe('Organization Identity');
    expect(section?.titleHint).toBeNull();
  });

  it('titles it "Publisher Identity" when a publish action exists and the identity references the actions assertion', () => {
    const manifest = {
      assertions: [
        x509Identity(['self#jumbf=c2pa.assertions/c2pa.actions.v2']),
        actionsAssertion(['c2pa.opened', 'c2pa.published']),
      ],
    } as unknown as Manifest;

    const section = selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic');

    expect(section?.title).toBe('Publisher Identity');
    expect(section?.titleHint).toBeNull();
  });

  it('keeps "Organization Identity" with a "?" hint when a publish action exists but is not referenced', () => {
    const manifest = {
      assertions: [
        // References cawg.metadata, but not the actions assertion.
        x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata']),
        actionsAssertion(['c2pa.opened', 'c2pa.published']),
      ],
    } as unknown as Manifest;

    const section = selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic');

    expect(section?.title).toBe('Organization Identity');
    expect(section?.titleHint).toContain('does not cryptographically reference');
  });

  it('does not require an exact assertion-count match: an unversioned c2pa.actions label is matched too', () => {
    const manifest = {
      assertions: [
        x509Identity(['self#jumbf=c2pa.assertions/c2pa.actions']),
        actionsAssertion(['c2pa.published'], 'c2pa.actions'),
      ],
    } as unknown as Manifest;

    expect(selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic')?.title).toBe(
      'Publisher Identity',
    );
  });
});

function creativeWorkAssertion(role: 'cawg.producer' | 'cawg.publisher' | 'cawg.editor' = 'cawg.producer') {
  return {
    x509: {
      label: 'cawg.identity',
      data: {
        role,
        signer_payload: {
          referenced_assertions: [{ url: 'self#jumbf=c2pa.assertions/stds.schema-org.CreativeWork' }],
          sig_type: 'cawg.x509.cose',
        },
      },
    },
    creativeWork: {
      label: 'stds.schema-org.CreativeWork',
      data: {
        author: [
          { '@type': 'Organization', name: 'Acme', url: 'https://acme.example' },
          { '@type': 'Person', name: 'Jane Doe' },
        ],
      },
    },
  };
}

describe('showCreativeWork gating', () => {
  it('selectOrganizationSection shows Organization Details by default', () => {
    const { x509, creativeWork } = creativeWorkAssertion();
    const manifest = { assertions: [x509, creativeWork] } as unknown as Manifest;

    const section = selectOrganizationSection(manifest, trustedStore(manifest), 'monolithic');

    expect(section?.organization?.name).toBe('Acme');
    expect(section?.organization?.website).toBe('https://acme.example');
  });

  it('selectOrganizationSection suppresses Organization Details under showCreativeWork=false, without hiding the section itself', () => {
    const { x509, creativeWork } = creativeWorkAssertion();
    const manifest = { assertions: [x509, creativeWork] } as unknown as Manifest;

    const section = selectOrganizationSection(
      manifest,
      trustedStore(manifest),
      'monolithic',
      'relaxed',
      false,
    );

    expect(section).not.toBeNull();
    expect(section?.organization).toBeNull();
  });

  it('selectWorkSection includes CreativeWork-derived authors/organization by default, keeping role regardless', () => {
    const { x509, creativeWork } = creativeWorkAssertion('cawg.publisher');
    const manifest = { assertions: [x509, creativeWork] } as unknown as Manifest;

    const section = selectWorkSection(manifest, trustedStore(manifest), 'monolithic');

    expect(section?.authors).toHaveLength(1);
    expect(section?.authors[0].name).toBe('Jane Doe');
    expect(section?.organizationName).toBe('Acme');
    expect(section?.role).toBe('cawg.publisher');
  });

  it('selectWorkSection drops CreativeWork-derived authors/organization under showCreativeWork=false, keeping role', () => {
    const { x509, creativeWork } = creativeWorkAssertion('cawg.publisher');
    const manifest = { assertions: [x509, creativeWork] } as unknown as Manifest;

    const section = selectWorkSection(manifest, trustedStore(manifest), 'monolithic', false);

    expect(section?.authors).toHaveLength(0);
    expect(section?.organizationName).toBeNull();
    expect(section?.role).toBe('cawg.publisher');
  });

  it('selectCopyrightSection is unaffected by showCreativeWork - it is cawg.metadata-derived, not CreativeWork-derived', () => {
    const manifest = {
      assertions: [
        x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata']),
        {
          label: 'cawg.metadata',
          data: {
            '@context': { '@vocab': 'https://schema.org/' },
            '@type': 'VideoObject',
            copyrightNotice: '© Acme 2026',
          },
        },
      ],
    } as unknown as Manifest;

    // selectCopyrightSection takes no showCreativeWork parameter at all -
    // what it renders is cawg.metadata-derived, not CreativeWork-derived.
    const section = selectCopyrightSection(manifest, trustedStore(manifest), 'monolithic');

    expect(section?.copyright.copyrightNotice).toBe('© Acme 2026');
    expect(section?.validationStatus).toBe('Trusted');
  });
});

describe('showUnverifiedIdentity gating', () => {
  it('selectOrganizationSection is withheld by default for an Unknown identity, shown when the flag is on', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    expect(
      selectOrganizationSection(manifest, trustedStore(manifest), 'dash-fragmented-fmp4'),
    ).toBeNull();

    const section = selectOrganizationSection(
      manifest,
      trustedStore(manifest),
      'dash-fragmented-fmp4',
      'relaxed',
      true,
      true,
    );

    expect(section).not.toBeNull();
    expect(section?.cawg?.validationStatus).toBe('Unknown');
  });

  it('selectOrganizationSection stays withheld under identityTrust=strict even with the flag on', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    expect(
      selectOrganizationSection(manifest, trustedStore(manifest), 'dash-fragmented-fmp4', 'strict', true, true),
    ).toBeNull();
  });

  it('selectCopyrightSection is withheld by default for an Unknown identity, shown when the flag is on', () => {
    const manifest = {
      assertions: [
        x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata']),
        {
          label: 'cawg.metadata',
          data: {
            '@context': { '@vocab': 'https://schema.org/' },
            '@type': 'VideoObject',
            copyrightNotice: '© Acme 2026',
          },
        },
      ],
    } as unknown as Manifest;

    expect(
      selectCopyrightSection(manifest, trustedStore(manifest), 'dash-fragmented-fmp4'),
    ).toBeNull();

    const section = selectCopyrightSection(
      manifest,
      trustedStore(manifest),
      'dash-fragmented-fmp4',
      'relaxed',
      true,
    );

    expect(section?.copyright.copyrightNotice).toBe('© Acme 2026');
    expect(section?.validationStatus).toBe('Unknown');
  });
});

describe('selectWithheldIdentityHint', () => {
  it('is true when an Unknown identity references known content and the flag is off', () => {
    const manifest = {
      assertions: [x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata'])],
    } as unknown as Manifest;

    // Under the real (flag-off) settings none of the three sections show -
    // matching what a caller like menuViewModel would actually pass in.
    expect(
      selectWithheldIdentityHint(manifest, null, null, null, trustedStore(manifest), 'dash-fragmented-fmp4'),
    ).toBe(true);
  });

  it('is false once the flag is on', () => {
    const manifest = {
      assertions: [x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata'])],
    } as unknown as Manifest;

    expect(
      selectWithheldIdentityHint(
        manifest,
        null,
        null,
        null,
        trustedStore(manifest),
        'dash-fragmented-fmp4',
        'relaxed',
        true,
        true,
      ),
    ).toBe(false);
  });

  it('is true even when the identity references no known content, since forcing the flag on would still surface the bare identity Organization Identity normally hides', () => {
    const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

    // selectOrganizationSection itself is gated only on "X.509 identity
    // present + trust threshold cleared", not on any referenced content (an
    // HLS Trusted identity with no CreativeWork/metadata still shows issuer
    // info) - so asking it directly, rather than re-deriving a separate
    // "does it reference known content" rule, means a content-free Unknown
    // identity is honestly reported as something the flag would reveal too.
    expect(
      selectWithheldIdentityHint(manifest, null, null, null, trustedStore(manifest), 'dash-fragmented-fmp4'),
    ).toBe(true);
  });

  it('is false when there is no cawg.identity at all', () => {
    const manifest = { assertions: [] } as unknown as Manifest;

    expect(
      selectWithheldIdentityHint(manifest, null, null, null, trustedStore(manifest), 'dash-fragmented-fmp4'),
    ).toBe(false);
  });

  it('is false when the identity is already Trusted - nothing is being withheld', () => {
    const manifest = {
      assertions: [x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata'])],
    } as unknown as Manifest;
    const store = trustedStore(manifest);
    // 'monolithic' verifies identity for real, so this store's 'Trusted'
    // verdict clears the bar without the flag - selectOrganizationSection
    // already shows under the real settings, exactly as menuViewModel would
    // compute and pass in.
    const organizationSection = selectOrganizationSection(manifest, store, 'monolithic');

    expect(
      selectWithheldIdentityHint(manifest, organizationSection, null, null, store, 'monolithic'),
    ).toBe(false);
  });

  it('is false under identityTrust=strict, which never admits Unknown either way', () => {
    const manifest = {
      assertions: [x509Identity(['self#jumbf=c2pa.assertions/cawg.metadata'])],
    } as unknown as Manifest;

    expect(
      selectWithheldIdentityHint(
        manifest,
        null,
        null,
        null,
        trustedStore(manifest),
        'dash-fragmented-fmp4',
        'strict',
      ),
    ).toBe(false);
  });
});

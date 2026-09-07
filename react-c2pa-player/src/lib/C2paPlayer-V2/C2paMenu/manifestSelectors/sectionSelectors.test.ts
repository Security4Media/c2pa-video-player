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
import { selectOrganizationSection } from './sectionSelectors';

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

  it.each(['Valid', 'Invalid'] as const)(
    'is null when the X.509 identity exists but its verdict is %s, not Trusted',
    (state) => {
      const manifest = { assertions: [x509Identity([])] } as unknown as Manifest;

      expect(selectOrganizationSection(manifest, storeWithState(manifest, state), 'monolithic')).toBeNull();
    },
  );

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

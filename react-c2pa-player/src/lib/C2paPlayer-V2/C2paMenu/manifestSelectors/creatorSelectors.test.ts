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
import { selectCreatorSection } from './creatorSelectors';

// Real shapes, captured via c2patool and the app's own runtimes against
// adobe-27.1.mp4 (the ICA credential as an active manifest's own identity)
// and test-5.mp4 (the same credential re-wrapped one manifest deep as a
// direct ingredient).
const ADOBE_ISSUER = 'did:web:connected-identities.identity.adobe.com';
const ADOBE_MANIFEST_ID = 'urn:c2pa:7b5b4bc6-5dd4-4b20-97c4-c834b7f5bbc1';
const ADOBE_IDENTITY_URL = `self#jumbf=/c2pa/${ADOBE_MANIFEST_ID}/c2pa.assertions/cawg.identity`;

const icaIdentityAssertion = {
  label: 'cawg.identity',
  data: {
    '@context': ['https://www.w3.org/ns/credentials/v2', 'https://cawg.io/identity/1.1/ica/context/'],
    type: ['VerifiableCredential', 'IdentityClaimsAggregationCredential'],
    issuer: ADOBE_ISSUER,
    validFrom: '2026-09-06T19:12:25Z',
    verifiedIdentities: [
      {
        type: 'cawg.social_media',
        username: 'Martin Grohme',
        uri: 'https://www.linkedin.com/in/example',
        verifiedAt: '2025-05-04T19:15:25Z',
        provider: { id: 'https://linkedin.com', name: 'linkedin' },
      },
      {
        type: 'cawg.document_verification',
        name: 'Martin Grohme',
        uri: 'https://www.linkedin.com/in/example',
        verifiedAt: '2025-05-04T19:14:46Z',
        provider: { id: 'https://linkedin.com', name: 'LINKEDIN' },
      },
    ],
    credentialSchema: [{ id: 'https://cawg.io/identity/1.1/ica/schema/', type: 'JSONSchema' }],
  },
} as const;

/** adobe-27.1.mp4: the ICA credential is the active manifest's own identity. */
const adobeManifest = {
  id: ADOBE_MANIFEST_ID,
  assertions: [icaIdentityAssertion],
  ingredients: [],
} as unknown as Manifest;

/** The WASM/c2pa-web engine's coded shape: it verifies the ICA credential and reports the code. */
function storeWithIcaEvidence(manifest: Manifest, manifestId: string): ManifestStore {
  return {
    active_manifest: manifestId,
    manifests: { [manifestId]: manifest },
    validation_results: {
      activeManifest: {
        success: [{ code: 'cawg.ica.credential_valid', url: ADOBE_IDENTITY_URL }],
        failure: [],
      },
    },
  } as unknown as ManifestStore;
}

/**
 * The default nettrek/WebCrypto engine's shape for this credential form:
 * @nettrek/c2pa-web-crypto's own README states it "surfaces [the ICA
 * credential] unverified" - no coded results, no failure, nothing.
 */
function storeWithNoIcaEvidence(manifest: Manifest, manifestId: string): ManifestStore {
  return {
    active_manifest: manifestId,
    manifests: { [manifestId]: manifest },
    validation_state: 'Trusted',
    validation_status: [],
  } as unknown as ManifestStore;
}

describe('selectCreatorSection, ICA credential on the active manifest', () => {
  it('is Trusted when the issuer is on the trusted list and the engine verified it', () => {
    const store = storeWithIcaEvidence(adobeManifest, ADOBE_MANIFEST_ID);
    const section = selectCreatorSection(adobeManifest, store, new Set([ADOBE_ISSUER]));

    expect(section?.groups).toHaveLength(1);
    expect(section?.groups[0].source).toBe('Active manifest');
    expect(section?.groups[0].validationStatus).toBe('Trusted');
    expect(section?.groups[0].claims).toEqual([
      {
        type: 'cawg.social_media',
        displayName: 'Martin Grohme',
        uri: 'https://www.linkedin.com/in/example',
        verifiedAt: '2025-05-04T19:15:25Z',
        providerName: 'linkedin',
      },
      {
        type: 'cawg.document_verification',
        displayName: 'Martin Grohme',
        uri: 'https://www.linkedin.com/in/example',
        verifiedAt: '2025-05-04T19:14:46Z',
        providerName: 'LINKEDIN',
      },
    ]);
  });

  it('is Valid, not hidden, when verified but the issuer is not on the trusted list', () => {
    const store = storeWithIcaEvidence(adobeManifest, ADOBE_MANIFEST_ID);
    const section = selectCreatorSection(adobeManifest, store, new Set());

    expect(section?.groups).toHaveLength(1);
    expect(section?.groups[0].validationStatus).toBe('Valid');
    expect(section?.groups[0].claims).toHaveLength(2);
  });

  it('is Unknown, not hidden, under an engine that never checks this credential form (the default engine today)', () => {
    // @nettrek/c2pa-web-crypto (behind both the monolithic default and HLS)
    // explicitly defers cryptographic verification of the ICA form - showing
    // nothing here would be indistinguishable from "no identity declared",
    // which is worse than an honest "not verified" caveat.
    const store = storeWithNoIcaEvidence(adobeManifest, ADOBE_MANIFEST_ID);
    const section = selectCreatorSection(adobeManifest, store, new Set([ADOBE_ISSUER]));

    expect(section?.groups).toHaveLength(1);
    expect(section?.groups[0].validationStatus).toBe('Unknown');
    expect(section?.groups[0].claims).toHaveLength(2);
  });

  it('under identityTrust=strict, still shows a Trusted credential', () => {
    const store = storeWithIcaEvidence(adobeManifest, ADOBE_MANIFEST_ID);
    const section = selectCreatorSection(adobeManifest, store, new Set([ADOBE_ISSUER]), 'strict');

    expect(section?.groups).toHaveLength(1);
    expect(section?.groups[0].validationStatus).toBe('Trusted');
  });

  it('under identityTrust=strict, withholds a Valid (untrusted-issuer) credential unlike the relaxed default', () => {
    const store = storeWithIcaEvidence(adobeManifest, ADOBE_MANIFEST_ID);

    expect(selectCreatorSection(adobeManifest, store, new Set(), 'strict')).toBeNull();
  });

  it('under identityTrust=strict, withholds an Unknown (unverified-by-this-engine) credential unlike the relaxed default', () => {
    const store = storeWithNoIcaEvidence(adobeManifest, ADOBE_MANIFEST_ID);

    expect(selectCreatorSection(adobeManifest, store, new Set([ADOBE_ISSUER]), 'strict')).toBeNull();
  });

  it('is withheld entirely when the credential is confirmed broken (Invalid)', () => {
    const store = {
      active_manifest: ADOBE_MANIFEST_ID,
      manifests: { [ADOBE_MANIFEST_ID]: adobeManifest },
      validation_results: {
        activeManifest: {
          success: [],
          failure: [{ code: 'cawg.identity.malformed', url: ADOBE_IDENTITY_URL }],
        },
      },
    } as unknown as ManifestStore;

    expect(selectCreatorSection(adobeManifest, store, new Set([ADOBE_ISSUER]))).toBeNull();
  });

  it('is null for a manifest with no cawg.identity assertion at all', () => {
    const noIdentity = { id: 'urn:c2pa:none', assertions: [], ingredients: [] } as unknown as Manifest;
    const store = storeWithNoIcaEvidence(noIdentity, 'urn:c2pa:none');

    expect(selectCreatorSection(noIdentity, store, new Set([ADOBE_ISSUER]))).toBeNull();
  });

  it('is null for the X.509/COSE cawg.identity shape (no verifiedIdentities)', () => {
    const x509Manifest = {
      id: 'urn:c2pa:x509',
      assertions: [
        {
          label: 'cawg.identity',
          data: {
            signer_payload: {
              referenced_assertions: [{ url: 'self#jumbf=c2pa.assertions/cawg.metadata' }],
              sig_type: 'cawg.x509.cose',
            },
          },
        },
      ],
      ingredients: [],
    } as unknown as Manifest;
    const store = storeWithNoIcaEvidence(x509Manifest, 'urn:c2pa:x509');

    expect(selectCreatorSection(x509Manifest, store, new Set([ADOBE_ISSUER]))).toBeNull();
  });
});

describe('selectCreatorSection, ICA credential on an ingredient', () => {
  // Reproduces test-5.mp4: the active (WDR) manifest has its own, unrelated
  // X.509 identity; the ICA credential lives one level down, on a direct
  // ingredient.
  const wdrManifestId = 'urn:c2pa:08bc6b6b-c043-43f6-97c5-5d64be878b77';
  const activeManifest = {
    id: wdrManifestId,
    assertions: [
      {
        label: 'cawg.identity',
        data: {
          signer_payload: {
            referenced_assertions: [{ url: 'self#jumbf=c2pa.assertions/cawg.metadata' }],
            sig_type: 'cawg.x509.cose',
          },
        },
      },
    ],
    ingredients: [
      {
        title: 'Original camera clip',
        relationship: 'parentOf',
        active_manifest: ADOBE_MANIFEST_ID,
      },
    ],
  } as unknown as Manifest;

  function fullStore(): ManifestStore {
    return {
      active_manifest: wdrManifestId,
      manifests: {
        [wdrManifestId]: activeManifest,
        [ADOBE_MANIFEST_ID]: adobeManifest,
      },
      // The engine bubbles the ingredient's ICA evidence up into the active
      // manifest's own top-level validation_results, not nested under
      // ingredientDeltas - confirmed empirically against test-5.mp4.
      validation_results: {
        activeManifest: {
          success: [{ code: 'cawg.ica.credential_valid', url: ADOBE_IDENTITY_URL }],
          failure: [],
        },
      },
    } as unknown as ManifestStore;
  }

  it('surfaces the ingredient claims, labeled by the ingredient title', () => {
    const section = selectCreatorSection(activeManifest, fullStore(), new Set([ADOBE_ISSUER]));

    expect(section?.groups).toHaveLength(1);
    expect(section?.groups[0].source).toBe('This content includes source content from Original camera clip');
    expect(section?.groups[0].validationStatus).toBe('Trusted');
    expect(section?.groups[0].claims).toHaveLength(2);
  });

  it('does not surface the active manifest\'s own unrelated X.509 identity as a group', () => {
    const section = selectCreatorSection(activeManifest, fullStore(), new Set([ADOBE_ISSUER]));

    expect(section?.groups.some((group) => group.source === 'Active manifest')).toBe(false);
  });

  it('recurses through an ingredient with no title, falling back to a numbered default', () => {
    const untitledParent = {
      ...activeManifest,
      ingredients: [{ relationship: 'parentOf', active_manifest: ADOBE_MANIFEST_ID }],
    } as unknown as Manifest;
    const store = {
      ...fullStore(),
      manifests: { [wdrManifestId]: untitledParent, [ADOBE_MANIFEST_ID]: adobeManifest },
    } as unknown as ManifestStore;

    const section = selectCreatorSection(untitledParent, store, new Set([ADOBE_ISSUER]));

    expect(section?.groups[0].source).toBe('This content includes source content from Ingredient 1');
  });

  it('does not leak the ingredient assertion\'s own technical label as if it were a name', () => {
    // Reproduces test-5.mp4: the real ingredient entry carries no
    // title/document_id, only its own assertion label ("c2pa.ingredient.v3")
    // - which is a technical instance identifier, not a human-facing name,
    // and must not be shown as one.
    const untitledParent = {
      ...activeManifest,
      ingredients: [
        { relationship: 'parentOf', active_manifest: ADOBE_MANIFEST_ID, label: 'c2pa.ingredient.v3' },
      ],
    } as unknown as Manifest;
    const store = {
      ...fullStore(),
      manifests: { [wdrManifestId]: untitledParent, [ADOBE_MANIFEST_ID]: adobeManifest },
    } as unknown as ManifestStore;

    const section = selectCreatorSection(untitledParent, store, new Set([ADOBE_ISSUER]));

    expect(section?.groups[0].source).not.toContain('c2pa.ingredient.v3');
    expect(section?.groups[0].source).toBe('This content includes source content from Ingredient 1');
  });

  it('does not infinitely recurse when an ingredient chain cycles back to an already-visited manifest', () => {
    // Manifest content is untrusted input by design - an ingredient whose
    // own ingredient list points back to the active manifest must not hang
    // or overflow the stack, just stop walking that cycle.
    const cyclicAdobeManifest = {
      ...adobeManifest,
      ingredients: [{ relationship: 'parentOf', active_manifest: wdrManifestId }],
    } as unknown as Manifest;
    const store = {
      ...fullStore(),
      manifests: { [wdrManifestId]: activeManifest, [ADOBE_MANIFEST_ID]: cyclicAdobeManifest },
    } as unknown as ManifestStore;

    const section = selectCreatorSection(activeManifest, store, new Set([ADOBE_ISSUER]));

    expect(section?.groups).toHaveLength(1);
    expect(section?.groups[0].source).toBe('This content includes source content from Original camera clip');
  });
});

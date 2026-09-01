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

import type { ManifestStore } from '@contentauth/c2pa-web';
import { describe, expect, it } from 'vitest';
import {
  classifyFailureScope,
  readIngredientEvidence,
  readReaderEvidence,
  readStoreEvidence,
} from './evidence';

// Codes and URLs below are the ones the engines actually emitted against the
// WDR test stream and its tampered fixtures, not invented examples.
const IDENTITY_URL = 'self#jumbf=/c2pa/urn:c2pa:x/c2pa.assertions/cawg.identity';
const BMFF_URL = 'self#jumbf=/c2pa/urn:c2pa:x/c2pa.assertions/c2pa.hash.bmff.v3';

const withIdentity = { assertions: [{ label: 'cawg.identity' }] };
const withoutIdentity = { assertions: [{ label: 'c2pa.actions.v2' }] };

/** The WebCrypto engine's shape: a declared verdict plus failures only. */
function webCryptoStore(
  state: string,
  statuses: { code: string; url?: string }[] = [],
  manifest: unknown = withIdentity,
): ManifestStore {
  return {
    active_manifest: 'm',
    manifests: { m: manifest },
    validation_state: state,
    validation_status: statuses,
  } as unknown as ManifestStore;
}

/** The WASM engine's shape: per-code success and failure lists. */
function wasmStore(
  success: { code: string; url?: string }[],
  failure: { code: string; url?: string }[] = [],
  manifest: unknown = withIdentity,
): ManifestStore {
  return {
    active_manifest: 'm',
    manifests: { m: manifest },
    validation_results: { activeManifest: { success, failure } },
  } as unknown as ManifestStore;
}

describe('classifyFailureScope', () => {
  it('treats a BMFF hash mismatch as reaching one fragment', () => {
    expect(classifyFailureScope('assertion.bmffHash.mismatch', BMFF_URL)).toBe('fragment');
  });

  it.each([
    'assertion.hashedURI.mismatch',
    'claimSignature.mismatch',
    'signingCredential.untrusted',
    'signingCredential.expired',
  ])('treats %s as reaching the whole manifest', (code) => {
    expect(classifyFailureScope(code)).toBe('manifest');
  });

  it('recognises the identity by its differentiated code (WebCrypto)', () => {
    expect(classifyFailureScope('cawg.identity.untrusted')).toBe('identity');
  });

  it('recognises the identity by URL when the code is generic (WASM)', () => {
    expect(classifyFailureScope('signingCredential.untrusted', IDENTITY_URL)).toBe('identity');
  });
});

describe('readStoreEvidence, WebCrypto shape', () => {
  it('reports a trusted asset with a trusted identity', () => {
    const evidence = readStoreEvidence(webCryptoStore('Trusted'));

    expect(evidence.state).toBe('Trusted');
    expect(evidence.identity).toBe('Trusted');
    expect(evidence.failures).toHaveLength(0);
  });

  it('reports a signed but untrusted asset as valid, not invalid', () => {
    const evidence = readStoreEvidence(webCryptoStore('Valid'));

    expect(evidence.state).toBe('Valid');
    expect(evidence.identity).toBe('Valid');
  });

  it('keeps the identity separate from the media, so a tampered fragment does not condemn it', () => {
    const evidence = readStoreEvidence(
      webCryptoStore('Invalid', [{ code: 'assertion.bmffHash.mismatch', url: BMFF_URL }]),
    );

    expect(evidence.state).toBe('Invalid');
    expect(evidence.failures[0].scope).toBe('fragment');
    // No identity failure was reported, so the identity itself passed.
    expect(evidence.identity).not.toBe('Invalid');
  });

  it('reports an untrusted identity as valid while the asset stays valid', () => {
    const evidence = readStoreEvidence(
      webCryptoStore('Valid', [{ code: 'cawg.identity.untrusted', url: IDENTITY_URL }]),
    );

    expect(evidence.state).toBe('Valid');
    expect(evidence.identity).toBe('Valid');
    expect(evidence.failures[0].scope).toBe('identity');
  });

  it('reports a malformed identity as invalid, unlike a merely untrusted one', () => {
    const evidence = readStoreEvidence(
      webCryptoStore('Valid', [{ code: 'cawg.identity.malformed', url: IDENTITY_URL }]),
    );

    expect(evidence.identity).toBe('Invalid');
  });

  it('says absent when the manifest declares no identity at all', () => {
    expect(readStoreEvidence(webCryptoStore('Trusted', [], withoutIdentity)).identity).toBe('Absent');
  });
});

describe('readStoreEvidence, WASM shape', () => {
  it('needs a positive trusted code for the identity, which this engine emits', () => {
    const evidence = readStoreEvidence(
      wasmStore([
        { code: 'cawg.identity.well-formed', url: IDENTITY_URL },
        { code: 'signingCredential.trusted', url: IDENTITY_URL },
      ]),
    );

    expect(evidence.state).toBe('Trusted');
    expect(evidence.identity).toBe('Trusted');
  });

  it('reports a well-formed but untrusted identity as valid', () => {
    const evidence = readStoreEvidence(
      wasmStore(
        [{ code: 'cawg.identity.well-formed', url: IDENTITY_URL }],
        [{ code: 'signingCredential.untrusted', url: IDENTITY_URL }],
      ),
    );

    expect(evidence.identity).toBe('Valid');
  });

  it('does not let an untrusted identity alone condemn the asset', () => {
    const evidence = readStoreEvidence(
      wasmStore(
        [{ code: 'cawg.identity.well-formed', url: IDENTITY_URL }],
        [{ code: 'signingCredential.untrusted', url: IDENTITY_URL }],
      ),
    );

    expect(evidence.state).not.toBe('Invalid');
  });

  it('condemns the asset on a non-identity failure', () => {
    const evidence = readStoreEvidence(
      wasmStore([{ code: 'claimSignature.validated' }], [{ code: 'assertion.hashedURI.mismatch' }]),
    );

    expect(evidence.state).toBe('Invalid');
  });
});

describe('stores assembled from an adapter verdict', () => {
  // The menu builds one of these when an adapter reports a verdict rather than
  // an engine payload; its `success: [{}]` is a placeholder, not a coded result.
  const placeholderStore = (state: string) =>
    ({
      active_manifest: 'm',
      manifests: { m: withIdentity },
      validation_state: state,
      validation_status: [],
      validation_results: { activeManifest: { success: [{}], failure: [] } },
    }) as unknown as ManifestStore;

  it('is not read as "no trusted code present"', () => {
    const evidence = readStoreEvidence(placeholderStore('Trusted'));

    expect(evidence.state).toBe('Trusted');
    expect(evidence.identity).toBe('Trusted');
  });

  it('still distinguishes an untrusted verdict', () => {
    expect(readStoreEvidence(placeholderStore('Valid')).identity).toBe('Valid');
  });
});

describe('readIngredientEvidence', () => {
  const coded = (success: { code: string }[], failure: { code: string }[] = []) => ({
    validation_results: { activeManifest: { success, failure } },
  });

  it('says unknown when the ingredient carries no evidence, rather than invalid', () => {
    expect(readIngredientEvidence({}).state).toBe('Unknown');
    expect(readIngredientEvidence(null).state).toBe('Unknown');
  });

  it('needs a trusted signer to call an ingredient trusted', () => {
    expect(readIngredientEvidence(coded([{ code: 'signingCredential.trusted' }])).state).toBe('Trusted');
  });

  it('stops at valid when the ingredient validated but its signer is not trusted', () => {
    expect(readIngredientEvidence(coded([{ code: 'ingredient.manifest.validated' }])).state).toBe('Valid');
  });

  it('keeps an untrusted signer at valid: intact provenance, just not vouched for', () => {
    expect(readIngredientEvidence(coded([], [{ code: 'signingCredential.untrusted' }])).state).toBe('Valid');
  });

  it('reports a genuinely broken ingredient as invalid', () => {
    expect(readIngredientEvidence(coded([], [{ code: 'assertion.hashedURI.mismatch' }])).state).toBe('Invalid');
  });

  it('applies the same leniency to a flat failure list', () => {
    expect(readIngredientEvidence({ validation_status: [{ code: 'signingCredential.untrusted' }] }).state)
      .toBe('Valid');
    expect(readIngredientEvidence({ validation_status: [{ code: 'claimSignature.mismatch' }] }).state)
      .toBe('Invalid');
  });
});

describe('readReaderEvidence', () => {
  const reader = (state: string | null, errors: { code: string; url?: string }[] = []) => ({
    getManifestStoreValidationState: () => state,
    getValidationErrors: () => errors,
  });

  it('takes the verdict the reader states', () => {
    expect(readReaderEvidence(reader('Trusted')).state).toBe('Trusted');
  });

  it('falls back to invalid when the reader states nothing usable', () => {
    expect(readReaderEvidence(reader(null)).state).toBe('Invalid');
  });

  it('scopes the reader\'s failures, which is how a fragment is told from the asset', () => {
    const evidence = readReaderEvidence(
      reader('Invalid', [{ code: 'assertion.bmffHash.mismatch', url: BMFF_URL }]),
    );

    expect(evidence.failures).toEqual([
      { code: 'assertion.bmffHash.mismatch', scope: 'fragment', url: BMFF_URL },
    ]);
  });

  it('reports unknown for a missing reader instead of guessing', () => {
    expect(readReaderEvidence(null).state).toBe('Unknown');
  });
});

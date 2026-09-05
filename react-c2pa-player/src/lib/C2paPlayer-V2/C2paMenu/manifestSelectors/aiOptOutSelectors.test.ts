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
import { selectAiOptOutSection } from './aiOptOutSelectors';

/** A manifest declaring a CAWG identity that references cawg.training-mining. */
const manifest = {
  assertions: [
    {
      label: 'cawg.identity',
      data: {
        signer_payload: {
          referenced_assertions: [{ url: 'self#jumbf=c2pa.assertions/cawg.training-mining' }],
        },
      },
    },
    {
      label: 'cawg.training-mining',
      data: {
        entries: {
          'cawg.ai_training': { use: 'notAllowed' },
          'cawg.data_mining': { use: 'allowed' },
        },
      },
    },
  ],
} as unknown as Manifest;

function buildStore(forManifest: Manifest, validationState: string): ManifestStore {
  return {
    active_manifest: 'urn:test',
    manifests: { 'urn:test': forManifest },
    validation_state: validationState,
    validation_status: [],
  } as unknown as ManifestStore;
}

describe('selectAiOptOutSection', () => {
  it('is shown once the referencing identity is Trusted', () => {
    const section = selectAiOptOutSection(manifest, buildStore(manifest, 'Trusted'), 'monolithic');

    expect(section?.assertion.label).toBe('cawg.training-mining');
    expect(section?.assertion.entries).toHaveLength(2);
  });

  it('is withheld when the identity is only Valid', () => {
    expect(
      selectAiOptOutSection(manifest, buildStore(manifest, 'Valid'), 'monolithic'),
    ).toBeNull();
  });

  it('is withheld when nothing verified the identity (Unknown)', () => {
    // Same fixture, same declared 'Valid' store - but this adapter never
    // checks CAWG identity, so nothing here has actually been verified.
    expect(
      selectAiOptOutSection(manifest, buildStore(manifest, 'Valid'), 'dash-fragmented-fmp4'),
    ).toBeNull();
  });

  it('is withheld when there is no manifest store to read a verdict from', () => {
    expect(selectAiOptOutSection(manifest, undefined, 'monolithic')).toBeNull();
  });

  it('is withheld when the identity does not reference the training-mining assertion', () => {
    const unreferenced = {
      assertions: [
        { label: 'cawg.identity', data: { signer_payload: { referenced_assertions: [] } } },
        {
          label: 'cawg.training-mining',
          data: { entries: { 'cawg.ai_training': { use: 'notAllowed' } } },
        },
      ],
    } as unknown as Manifest;

    expect(
      selectAiOptOutSection(unreferenced, buildStore(unreferenced, 'Trusted'), 'monolithic'),
    ).toBeNull();
  });

  it('is withheld when there is no cawg.identity assertion at all', () => {
    const noIdentity = {
      assertions: [
        {
          label: 'cawg.training-mining',
          data: { entries: { 'cawg.ai_training': { use: 'notAllowed' } } },
        },
      ],
    } as unknown as Manifest;

    expect(
      selectAiOptOutSection(noIdentity, buildStore(noIdentity, 'Trusted'), 'monolithic'),
    ).toBeNull();
  });
});

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
import type { Manifest } from '@contentauth/c2pa-web';
import { selectCawgMetadataCopyright } from './cawgMetadataCopyrightSelectors';

function manifestWithCawgMetadata(data: unknown): Manifest {
  return {
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
        data,
      },
    ],
  } as unknown as Manifest;
}

describe('selectCawgMetadataCopyright', () => {
  it('parses the full WDR-style schema.org shape', () => {
    const manifest = manifestWithCawgMetadata({
      '@context': { '@vocab': 'https://schema.org/' },
      '@type': 'VideoObject',
      copyrightHolder: {
        name: 'Westdeutscher Rundfunk',
        '@type': 'Organization',
        sameAs: ['https://www.wikidata.org/entity/Q203453'],
      },
      creditText: 'Westdeutscher Rundfunk',
      copyrightYear: 2026,
      publisher: {
        url: 'https://www.wdr.de/',
        name: 'Westdeutscher Rundfunk',
        '@type': 'NewsMediaOrganization',
        legalName: 'Westdeutscher Rundfunk Köln',
        alternateName: 'WDR',
      },
      copyrightNotice: '© Westdeutscher Rundfunk 2026',
    });

    const result = selectCawgMetadataCopyright(manifest);

    expect(result).toEqual({
      copyrightNotice: '© Westdeutscher Rundfunk 2026',
      copyrightHolder: {
        name: 'Westdeutscher Rundfunk',
        sameAs: ['https://www.wikidata.org/entity/Q203453'],
      },
      copyrightYear: 2026,
      creditText: 'Westdeutscher Rundfunk',
      publisher: {
        name: 'Westdeutscher Rundfunk',
        legalName: 'Westdeutscher Rundfunk Köln',
        alternateName: 'WDR',
        website: 'https://www.wdr.de/',
      },
    });
  });

  it('leaves absent optional fields null rather than guessing at them', () => {
    const manifest = manifestWithCawgMetadata({
      copyrightNotice: '© Test Broadcaster 2026',
    });

    const result = selectCawgMetadataCopyright(manifest);

    expect(result).toEqual({
      copyrightNotice: '© Test Broadcaster 2026',
      copyrightHolder: null,
      copyrightYear: null,
      creditText: null,
      publisher: null,
    });
  });

  it('does not synthesize a notice from holder and year when none is declared', () => {
    const manifest = manifestWithCawgMetadata({
      copyrightHolder: { name: 'Test Broadcaster' },
      copyrightYear: 2026,
    });

    const result = selectCawgMetadataCopyright(manifest);

    expect(result?.copyrightNotice).toBeNull();
    expect(result?.copyrightHolder?.name).toBe('Test Broadcaster');
    expect(result?.copyrightYear).toBe(2026);
  });

  it('ignores malformed copyrightHolder/publisher rather than throwing', () => {
    const manifest = manifestWithCawgMetadata({
      copyrightHolder: 'Test Broadcaster',
      publisher: 42,
      creditText: 'Test Broadcaster',
    });

    const result = selectCawgMetadataCopyright(manifest);

    expect(result?.copyrightHolder).toBeNull();
    expect(result?.publisher).toBeNull();
    expect(result?.creditText).toBe('Test Broadcaster');
  });

  it('returns null for a Dublin Core-shaped cawg.metadata assertion', () => {
    const manifest = manifestWithCawgMetadata({
      'dc:title': 'WDR C2PA Live Demo IBC 2026',
      'dc:publisher': 'Westdeutscher Rundfunk',
    });

    expect(selectCawgMetadataCopyright(manifest)).toBeNull();
  });

  it('returns null when cawg.metadata is not referenced by cawg.identity', () => {
    const manifest = {
      assertions: [
        {
          label: 'cawg.identity',
          data: { signer_payload: { referenced_assertions: [] } },
        },
        {
          label: 'cawg.metadata',
          data: { copyrightNotice: '© Test Broadcaster 2026' },
        },
      ],
    } as unknown as Manifest;

    expect(selectCawgMetadataCopyright(manifest)).toBeNull();
  });

  it('returns null when there is no cawg.identity assertion at all', () => {
    const manifest = { assertions: [] } as unknown as Manifest;

    expect(selectCawgMetadataCopyright(manifest)).toBeNull();
  });
});

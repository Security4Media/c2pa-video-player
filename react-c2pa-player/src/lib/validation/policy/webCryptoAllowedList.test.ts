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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { pemToAllowedListDigests, toWebCryptoTrustSettings } from './webCryptoAllowedList';

const CERTIFICATE = readFileSync(
  fileURLToPath(new URL('../../../../trust/fixtures/unrelated-anchor.pem', import.meta.url)),
  'utf8',
);

// Computed independently, so this checks the conversion rather than restating
// it: openssl x509 -outform DER | openssl dgst -sha256 -binary | base64
const CERTIFICATE_DIGEST = 'jFCEe5gm1T0wKSvGoUMxWspjK6rP2EQwP2aHOgnjV4s=';

describe('pemToAllowedListDigests', () => {
  it('produces the digest the engine matches a leaf against', async () => {
    expect(await pemToAllowedListDigests(CERTIFICATE)).toBe(CERTIFICATE_DIGEST);
  });

  it('emits one line per certificate', async () => {
    const digests = await pemToAllowedListDigests(`${CERTIFICATE}\n${CERTIFICATE}`);

    // The local and community bundles overlap heavily, and a repeated line
    // would only be a redundant Set entry for the engine.
    expect(digests.split('\n')).toEqual([CERTIFICATE_DIGEST]);
  });

  it('yields nothing for a bundle with no certificates', async () => {
    expect(await pemToAllowedListDigests('')).toBe('');
    expect(await pemToAllowedListDigests('# a comment, no PEM blocks\n')).toBe('');
  });

  it('skips a malformed block rather than failing the whole bundle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const malformed = '-----BEGIN CERTIFICATE-----\nnot base64 !!!\n-----END CERTIFICATE-----';

    const digests = await pemToAllowedListDigests(`${malformed}\n${CERTIFICATE}`);

    expect(digests).toBe(CERTIFICATE_DIGEST);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('toWebCryptoTrustSettings', () => {
  it('converts the allow-list and leaves everything else alone', async () => {
    const converted = await toWebCryptoTrustSettings({
      trustAnchors: CERTIFICATE,
      allowedList: CERTIFICATE,
      trustConfig: 'cfg',
      verifyTrustList: true,
    });

    expect(converted.allowedList).toBe(CERTIFICATE_DIGEST);
    // Both engines parse anchors as PEM, so those must not be digested.
    expect(converted.trustAnchors).toBe(CERTIFICATE);
    expect(converted.trustConfig).toBe('cfg');
    expect(converted.verifyTrustList).toBe(true);
  });

  it('passes settings through untouched when there is no list to convert', async () => {
    const settings: { trustAnchors: string; allowedList?: string } = { trustAnchors: CERTIFICATE };

    expect(await toWebCryptoTrustSettings(settings)).toBe(settings);
  });
});

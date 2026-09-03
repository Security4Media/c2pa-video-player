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

const PEM_CERTIFICATE_PATTERN =
  /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;

/**
 * Converts an `allowedList` PEM bundle into the base64 SHA-256 digest lines
 * that @nettrek/c2pa-web-crypto expects.
 *
 * Trust material is held in the format `TrustSettings` documents: `allowedList`
 * is "end-entity certificates", i.e. PEM, and that is what the WASM engine
 * behind @contentauth/c2pa-web parses. The WebCrypto engine does not agree. Its
 * `parseAllowedList` adds every non-comment *line* to a Set verbatim and later
 * tests `sha256Base64(leafDer)` for membership (dist/index.js:1293-1300,
 * :1421-1424), and its own contract names the `allowed.sha256.txt` format
 * (dist/x509/trust.d.ts:25-26). Handed PEM it stores
 * `-----BEGIN CERTIFICATE-----` and each base64 body line as a pseudo-digest
 * that can never match, leaving allow-list trust silently inert and
 * chain-to-anchor as the only route to `Trusted`.
 *
 * So the conversion lives here, applied only by the runtime that opts into that
 * engine, rather than deforming the shared trust material for every consumer.
 *
 * `trustAnchors` needs no such treatment: both engines parse it as PEM.
 */
export async function pemToAllowedListDigests(pem: string): Promise<string> {
  const certificates = [...pem.matchAll(PEM_CERTIFICATE_PATTERN)].flatMap((match) => {
    try {
      return [base64ToBytes(match[1].replace(/\s+/g, ''))];
    } catch (error) {
      console.warn('[trust] Skipping malformed PEM certificate block.', error);
      return [];
    }
  });

  const digests = await Promise.all(certificates.map(sha256Base64));

  // De-duplicated: the local and remote bundles overlap heavily, and a repeated
  // line would only be a redundant Set entry.
  return [...new Set(digests)].join('\n');
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function sha256Base64(der: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der));
  let binary = '';

  // Built one char at a time rather than String.fromCharCode(...digest): a
  // spread would be fine for 32 bytes, but this keeps the helper safe if it is
  // ever reused for larger inputs (argument-count limits).
  digest.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

/**
 * Restates trust settings in the shape the WebCrypto engine parses: the
 * `allowedList` PEM becomes the digest lines it matches leaves against, while
 * everything else (anchors, store config, `verifyTrustList`) passes through
 * untouched.
 *
 * Every runtime that sets `enableExperimentalWebCrypto` needs this.
 */
export async function toWebCryptoTrustSettings<
  TSettings extends { allowedList?: string | string[] },
>(settings: TSettings): Promise<TSettings> {
  const { allowedList } = settings;

  if (typeof allowedList !== 'string') {
    return settings;
  }

  return { ...settings, allowedList: await pemToAllowedListDigests(allowedList) };
}

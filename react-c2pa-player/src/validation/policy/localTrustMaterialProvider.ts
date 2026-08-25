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

import c2paWasmSrc from '@contentauth/c2pa-web/resources/c2pa.wasm?url';
import cawgAllowedListUrl from '/trust/cawg_allowed_extended.pem?url';
import c2paAllowedListUrl from '/trust/c2pa_allowed_extended.pem?url';
import c2paTrustAnchorsUrl from '/trust/c2pa_anchors_extended.pem?url';
import c2paTrustConfigUrl from '/trust/c2pa_store.cfg?url';
import type { TrustMaterial, TrustMaterialProvider } from '../types';

// Pre-adapter code (removed in commit b01ef3f) merged this community list on
// top of the bundled local files. It's explicitly marked "frozen" by
// contentauth (superseded by the official C2PA trust list), but content
// signed against certs chaining back to it is still valid, so dropping it
// silently downgrades that content from "Trusted" with no error. Restored
// here, unioned with the local files, failing open to local-only if
// unreachable (e.g. offline/air-gapped use).
const REMOTE_TRUST_ANCHORS_URL =
  'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/anchors.pem';
const REMOTE_ALLOWED_LIST_URL =
  'https://raw.githubusercontent.com/contentauth/verify-site/refs/heads/main/static/trust/allowed.pem';

let trustMaterialPromise: Promise<TrustMaterial> | null = null;

export class LocalTrustMaterialProvider implements TrustMaterialProvider {
  load(): Promise<TrustMaterial> {
    trustMaterialPromise ??= Promise.all([
      fetchText(c2paTrustAnchorsUrl),
      fetchText(cawgAllowedListUrl),
      fetchText(c2paAllowedListUrl),
      fetchText(c2paTrustConfigUrl),
      fetchTextOrNull(REMOTE_TRUST_ANCHORS_URL),
      fetchTextOrNull(REMOTE_ALLOWED_LIST_URL),
    ]).then(async ([trustAnchors, cawgAllowed, c2paAllowed, trustConfig, remoteAnchors, remoteAllowed]) => {
      // A CAWG identity signer is trusted if it is trusted as a C2PA claim
      // signer, plus any CAWG-only entries. Previously `cawgTrust` saw only
      // `cawg_allowed_extended.pem` and only the local anchors, so a signer
      // trusted for the claim could still fail as an identity and block
      // 'Trusted' - and the two lists had already drifted (the current WDR
      // signing cert is in the C2PA list but not the CAWG one). Unifying is
      // the same choice `enableCawgIdentityTrustVerification` makes for the
      // HLS bridge (see runtimes/hlsBridgeRuntime.ts); applying it here keeps
      // the monolithic runtime, which has no such flag, consistent with it.
      const allAnchors = unionPem(trustAnchors, remoteAnchors);
      // The allow-lists are stored as PEM (reviewable, greppable, and what
      // upstream publishes) but the engine wants hashes - convert at load time.
      const [c2paAllowedHashes, cawgAllowedHashes] = await Promise.all([
        pemToAllowedListHashes(unionPem(c2paAllowed, remoteAllowed)),
        pemToAllowedListHashes(
          unionPem(unionPem(c2paAllowed, remoteAllowed), cawgAllowed),
        ),
      ]);

      return {
        wasmSrc: c2paWasmSrc,
        cawgTrust: {
          trustAnchors: allAnchors,
          allowedList: cawgAllowedHashes,
          trustConfig,
        },
        trust: {
          trustAnchors: allAnchors,
          allowedList: c2paAllowedHashes,
          trustConfig,
        },
      };
    });

    return trustMaterialPromise;
  }
}

function unionPem(local: string, remote: string | null): string {
  return remote ? `${local}\n${remote}` : local;
}

/**
 * Converts a PEM certificate bundle into the newline-delimited list of
 * base64-encoded SHA-256 digests that `allowedList` is actually parsed as.
 *
 * This is not cosmetic. `allowedList` is fed to the engine's
 * `parseAllowedList`, which adds every non-comment *line* verbatim to a Set
 * and later tests `sha256Base64(leafDer)` for membership
 * (@nettrek/c2pa-web-crypto, dist/index.js:1293-1300 and :1421-1424; its own
 * contract in dist/x509/trust.d.ts:25-26 names the `allowed.sha256.txt`
 * format, and the HLS bridge's default remote loader downloads exactly that
 * file). Handing it PEM turned every `-----BEGIN CERTIFICATE-----` and every
 * base64 body line into a pseudo-hash that could never match, so allow-list
 * trust was silently inert for every signer in the bundle - leaving
 * chain-to-anchor as the only path to `Trusted` and reporting otherwise
 * allow-listed signers as `signingCredential.untrusted`.
 *
 * `trustAnchors` is deliberately left as PEM: that one really is parsed as
 * certificates (`parsePemCertificates`).
 */
async function pemToAllowedListHashes(pem: string): Promise<string> {
  const derList = [...pem.matchAll(PEM_CERTIFICATE_PATTERN)].flatMap((match) => {
    const base64Body = match[1].replace(/\s+/g, '');

    try {
      return [base64ToBytes(base64Body)];
    } catch (error) {
      console.warn('[LocalTrustMaterialProvider] Skipping malformed PEM certificate block.', error);
      return [];
    }
  });

  const hashes = await Promise.all(derList.map(sha256Base64));

  // De-duplicated: the local and remote bundles overlap heavily, and a
  // repeated line would just be a redundant Set entry.
  return [...new Set(hashes)].join('\n');
}

const PEM_CERTIFICATE_PATTERN =
  /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;

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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load local trust resource ${url}: ${response.status}`);
  }

  return response.text();
}

async function fetchTextOrNull(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`[LocalTrustMaterialProvider] Remote trust resource ${url} returned ${response.status}; continuing with local trust material only.`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.warn(`[LocalTrustMaterialProvider] Failed to fetch remote trust resource ${url}; continuing with local trust material only.`, error);
    return null;
  }
}

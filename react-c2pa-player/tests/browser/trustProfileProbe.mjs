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
 * What each trust profile actually assembles.
 *
 * Drives LocalTrustMaterialProvider through the dev server rather than
 * inferring from the files, because the assembly rules (which list widens
 * which, what the WebCrypto engine is handed) are where the surprises have
 * been. Prints the counts and whether a named signing certificate is reachable
 * by allow-list and by chain, per profile.
 *
 *   npm run dev -- --port 5199
 *   node tests/browser/trustProfileProbe.mjs
 */

import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';

// The EBU signing certificate of PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4, and
// the two certificates above it in that file's own chain.
const LEAF = 'B6A06C7FCE3AEDF793CBE708894830CC70B8246A3C6C16A7E12D319882CF0E76';
const CHAIN = {
  'Sectigo Public Email Protection CA R36':
    '118783706A481641898904DC4C322B4A322C37ABA3ECB9C6E90E408616DC3456',
  'Sectigo Public Email Protection Root R46':
    'BC386A5C664B6B0B5E385FAC151AA3911606178359DED68AE5017DE985E78B94',
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (message) => {
  if (message.type() === 'error') console.log('  [page error]', message.text());
});
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(
  async ({ leaf, chain }) => {
    const { LocalTrustMaterialProvider, defaultTrustResourceUrls, devTrustResourceUrls } =
      await import('/server/src/validation/policy/localTrustMaterialProvider.ts');
    const { pemToAllowedListDigests } = await import(
      '/server/src/validation/policy/webCryptoAllowedList.ts'
    );

    const digest = async (hex) => {
      const bytes = new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
      // The engine keys on base64(sha256(DER)); we hold hex(sha256(DER)), so
      // convert rather than recompute, to compare the same thing it compares.
      return btoa(String.fromCharCode(...bytes));
    };

    const countPem = (text) => (text.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;

    const out = {};
    for (const [name, urls] of [
      ['full-prod', defaultTrustResourceUrls],
      ['full-dev', devTrustResourceUrls],
    ]) {
      const material = await new LocalTrustMaterialProvider(urls).load();
      const allowedDigests = (await pemToAllowedListDigests(material.trust.allowedList)).split(
        '\n',
      );
      const cawgDigests = (await pemToAllowedListDigests(material.cawgTrust.allowedList)).split(
        '\n',
      );
      const anchorDigests = (await pemToAllowedListDigests(material.trust.trustAnchors)).split(
        '\n',
      );

      const leafDigest = await digest(leaf);
      const chainPresence = {};
      for (const [label, hex] of Object.entries(chain)) {
        const d = await digest(hex);
        chainPresence[label] = {
          anchor: anchorDigests.includes(d),
          allowed: allowedDigests.includes(d),
        };
      }

      // The timestamp anchors land in the same pool as everything else, so
      // the only way to see whether a profile actually got them is to look
      // for a known one. This is the DigiCert Trusted Root G4 that
      // timestamp.digicert.com chains to, self-signed copy.
      const G4_ROOT = await digest(
        '552F7BDCF1A7AF9E6CE672017F4F12ABF77240C78E761AC203D1D9D20AC89988',
      );

      out[name] = {
        tsaRootPresent: anchorDigests.includes(G4_ROOT),
        anchors: countPem(material.trust.trustAnchors),
        c2paAllowed: countPem(material.trust.allowedList),
        cawgAllowed: countPem(material.cawgTrust.allowedList),
        anchorDigests: anchorDigests.length,
        allowedDigests: allowedDigests.length,
        leafOnAllowList: allowedDigests.includes(leafDigest),
        leafOnCawgAllowList: cawgDigests.includes(leafDigest),
        leafIsAnchor: anchorDigests.includes(leafDigest),
        chain: chainPresence,
        trustConfigOids: (material.trust.trustConfig.match(/^\d[\d.]+$/gm) ?? []).length,
        cawgVerifyTrustList: material.cawgTrust.verifyTrustList,
        sameTrustConfig: material.trust.trustConfig === material.cawgTrust.trustConfig,
      };
    }
    return out;
  },
  { leaf: LEAF, chain: CHAIN },
);

for (const [name, data] of Object.entries(result)) {
  console.log(`\n${name}`);
  console.log(
    `  certificates      anchors ${data.anchors}, c2pa allowed ${data.c2paAllowed}, cawg allowed ${data.cawgAllowed}`,
  );
  console.log(
    `  digests handed to the engine   anchors ${data.anchorDigests}, allowed ${data.allowedDigests}`,
  );
  console.log(`  EBU leaf on the C2PA allow-list  ${data.leafOnAllowList}`);
  console.log(`  EBU leaf on the CAWG allow-list  ${data.leafOnCawgAllowList}`);
  console.log(`  EBU leaf used as an anchor       ${data.leafIsAnchor}`);
  for (const [label, where] of Object.entries(data.chain)) {
    console.log(`  ${label}: anchor=${where.anchor} allowed=${where.allowed}`);
  }
  console.log(
    `  trust config      ${data.trustConfigOids} OIDs, shared with CAWG: ${data.sameTrustConfig}, verifyTrustList: ${data.cawgVerifyTrustList}`,
  );
  console.log(`  DigiCert Trusted Root G4 in the anchor pool  ${data.tsaRootPresent}`);
}

await browser.close();

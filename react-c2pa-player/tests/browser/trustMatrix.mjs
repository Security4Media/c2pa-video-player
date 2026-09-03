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
 * Trust matrix against the real engines.
 *
 * Deliberately small. The verdict rules themselves are covered by the unit
 * suite in milliseconds; what only a browser can show is that the wiring is
 * real - that the engine, the trust policy, the timeline and the menu agree.
 * Each case here costs 20 to 30 seconds, so this stays a smoke test.
 *
 * Trust outcomes are driven by `?trust=<fixture>` rather than by hunting for an
 * asset whose certificate happens to be in the right state, so the expectations
 * below do not rot as certificates expire.
 *
 * Not part of `npm test`: it needs a dev server, a Playwright browser, and (for
 * the HLS cases) the WDR test stream.
 *
 *   npm run dev -- --port 5199
 *   npm run test:browser
 */

import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';
const WDR_STREAM =
  process.env.C2PA_TEST_STREAM ?? 'https://wdr-c2pa.ard-mcdn-dev.de/test_big_6/master.m3u8';
const FIXTURES = `${BASE}hls-fixtures`;
const MP4S = `${BASE}mp4s`;

const PLAY_MS = Number(process.env.C2PA_TEST_PLAY_MS ?? 20000);
const PLAYBACK_RATE = 8;

/**
 * `expect` describes what the viewer should be told.
 *
 * `overall` and `identity` are read from data-validation-state, not from the
 * label or the icon, so wording and styling can change without touching this.
 *
 * The timeline is asserted as colours that must and must not appear, rather
 * than an exact set: how far playback reaches in the time allowed varies, and
 * an exact set would fail on that instead of on the thing being tested. What
 * matters is that the right colours are reachable and the wrong ones never are.
 */
const CASES = [
  {
    name: 'HLS, fully trusted',
    url: WDR_STREAM,
    trust: 'full',
    expect: { overall: 'Trusted', identity: 'Trusted', shows: ['GREEN'], never: ['RED', 'BLUE'] },
  },
  {
    name: 'HLS, C2PA trusted but the identity is not',
    url: WDR_STREAM,
    trust: 'cawg-missing',
    // The discriminator: only a separately evaluated identity can differ here.
    expect: { overall: 'Valid', identity: 'Valid', shows: ['BLUE'], never: ['RED', 'GREEN'] },
  },
  {
    name: 'HLS, nothing trusted',
    url: WDR_STREAM,
    trust: 'empty',
    expect: { overall: 'Valid', identity: 'Valid', shows: ['BLUE'], never: ['RED', 'GREEN'] },
  },
  {
    name: 'HLS, trust only by chaining to an anchor',
    url: WDR_STREAM,
    trust: 'anchors-only',
    // This signer is allow-listed rather than chainable, so it stops at Valid.
    expect: { overall: 'Valid', identity: 'Valid', shows: ['BLUE'], never: ['RED', 'GREEN'] },
  },
  {
    name: 'HLS, fragments tampered with',
    url: `${FIXTURES}/tampered-segs-corrupt/master.m3u8`,
    trust: 'full',
    // Both colours together are the point: the altered fragments go red while
    // the untouched one keeps its own verdict, which is what per-fragment
    // reporting means. Playback ends inside a tampered fragment, so the menu
    // is in its invalid state and provenance is withheld.
    expect: { invalid: true, identity: null, shows: ['GREEN', 'RED'] },
  },
  {
    name: 'HLS, fragments stripped of their C2PA data',
    url: `${FIXTURES}/tampered-segs-stripped/master.m3u8`,
    trust: 'full',
    expect: { invalid: true, identity: null, shows: ['GREEN', 'RED'] },
  },
  {
    name: 'HLS, manifest tampered with',
    url: `${FIXTURES}/tampered-init/master.m3u8`,
    trust: 'full',
    // Nothing validates, so no fragment is ever shown as good.
    expect: { invalid: true, identity: null, shows: ['RED'], never: ['GREEN', 'BLUE'] },
  },
  {
    name: 'MP4, signed',
    url: `${MP4S}/PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`,
    trust: 'full',
    // One verdict covers the whole file, so the bar carries it throughout.
    expect: { overall: 'Trusted', identity: 'Trusted', shows: ['GREEN'], never: ['RED'] },
  },
  {
    name: 'MP4, signed but nothing trusted',
    url: `${MP4S}/PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`,
    trust: 'empty',
    expect: { overall: 'Valid', identity: 'Valid', shows: ['BLUE'], never: ['RED', 'GREEN'] },
  },
  {
    name: 'MP4, manifest tampered with',
    url: `${MP4S}/TAMPERED_PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`,
    trust: 'full',
    expect: { invalid: true, identity: null, shows: ['RED'], never: ['GREEN', 'BLUE'] },
  },
];

const COLOURS = {
  'rgb(42, 243, 122)': 'GREEN',
  'rgb(42, 122, 243)': 'BLUE',
  'rgb(211, 21, 16)': 'RED',
  'rgb(172, 172, 172)': 'GREY',
};

async function observe(page, { url, trust }) {
  await page.goto(`${BASE}?trust=${trust}`, { waitUntil: 'domcontentloaded' });
  await page.fill('#mp4Url', url);
  await page.click('button:has-text("Load Video")');
  await page.waitForSelector('video', { timeout: 20000 });
  await page.evaluate((rate) => {
    const video = document.querySelector('video');
    video.muted = true;
    video.playbackRate = rate;
    video.play().catch(() => {});
  }, PLAYBACK_RATE);
  await page.waitForTimeout(PLAY_MS);

  const timeline = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.seekbar-play-c2pa')).map((el) => el.style.backgroundColor),
  );

  await page.click('.c2pa-menu-button button').catch(() => {});
  await page.waitForTimeout(1500);

  return page.evaluate(
    ({ colours, bar }) => ({
      overall: document.querySelector('[data-testid="c2pa-validation-status"]')
        ?.getAttribute('data-validation-state') ?? null,
      identity: document.querySelector('[data-testid="c2pa-identity-status"]')
        ?.getAttribute('data-validation-state') ?? null,
      invalid: Boolean(document.querySelector('[data-testid="c2pa-invalid-state"]')),
      timeline: [...new Set(bar.map((c) => colours[c] ?? c))].sort(),
    }),
    { colours: COLOURS, bar: timeline },
  );
}

function compare(expected, actual) {
  const problems = [];

  for (const key of ['overall', 'identity', 'invalid']) {
    if (key in expected && String(expected[key]) !== String(actual[key])) {
      problems.push(`${key}: wanted ${expected[key]}, got ${actual[key]}`);
    }
  }

  for (const colour of expected.shows ?? []) {
    if (!actual.timeline.includes(colour)) {
      problems.push(`timeline: no ${colour}, only ${actual.timeline.join() || 'nothing'}`);
    }
  }

  for (const colour of expected.never ?? []) {
    if (actual.timeline.includes(colour)) {
      problems.push(`timeline: ${colour} should never appear here`);
    }
  }

  return problems;
}

const browser = await chromium.launch({ headless: true });
let failed = 0;

console.log(`\nTrust matrix against ${BASE}\n`);

for (const testCase of CASES) {
  // A fresh context per case. Sharing one across ten multi-megabyte loads
  // starved the later pages until the app stopped rendering at all.
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  try {
    const actual = await observe(page, testCase);
    const problems = compare(testCase.expect, actual);

    if (errors.length > 0) problems.push(`page errors: ${errors.slice(0, 2).join('; ')}`);

    console.log(`  ${problems.length === 0 ? 'ok  ' : 'FAIL'}  ${testCase.name}  [${testCase.trust}]`);
    for (const problem of problems) console.log(`          ${problem}`);
    if (problems.length > 0) failed += 1;
  } catch (error) {
    console.log(`  FAIL  ${testCase.name}  [${testCase.trust}]`);
    console.log(`          ${error.message.split('\n')[0]}`);
    failed += 1;
  }

  await context.close();
}

await browser.close();
console.log(`\n${failed === 0 ? `all ${CASES.length} cases passed` : `${failed} of ${CASES.length} failed`}\n`);
process.exit(failed === 0 ? 0 : 1);

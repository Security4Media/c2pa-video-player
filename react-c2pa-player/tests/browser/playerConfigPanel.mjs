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
 * The Player Config panel: control visibility/enablement, and that switching
 * the monolithic validation engine actually reaches a verdict.
 *
 *   npm run dev -- --port 5199
 *   npm run test:config-panel
 *
 * The fourth phase is the one this exists for: it caught a real bug where the
 * `c2pa-web` engine's coded results were mis-read as 'Trusted' by
 * `evidence.ts` for a signer that was merely allow-listed, not anchored - see
 * the `declaredOverallState` handling in `fromCodedResults`.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';
const MP4 = `${BASE}mp4s/PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`;
const HLS =
  process.env.C2PA_TEST_TAMPERED_HLS ?? `${BASE}hls-fixtures/tampered-init/master.m3u8`;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('   [console.error]', msg.text());
});

async function loadUrl(url) {
  await page.fill('#mp4Url', url);
  await page.click('button:has-text("Load Video")');
  await page.waitForSelector('video', { timeout: 30000 });
}

const readControls = () =>
  page.evaluate(() => {
    const byLabel = (text) =>
      [...document.querySelectorAll('.player-config-control')].find((el) =>
        el.textContent.includes(text)
      );
    const windowControl = byLabel('Live retention window');
    const gateControl = byLabel('Validated-playback gate');
    const engineControl = byLabel('Monolithic engine');
    return {
      panelPresent: Boolean(document.querySelector('.player-config-panel')),
      controlCount: document.querySelectorAll('.player-config-control').length,
      windowDisabled: windowControl?.querySelector('input')?.disabled,
      windowTitle: windowControl?.title ?? null,
      gateDisabled: gateControl?.querySelector('input')?.disabled,
      engineDisabled: engineControl?.querySelector('select')?.disabled,
    };
  });

const clickMenuButton = () =>
  page.evaluate(() => document.querySelector('button.c2pa-menu-button')?.click());

/** Opens the Content Credentials panel, reads its verdict word, closes it. */
async function readVerdict() {
  await clickMenuButton();
  await page.waitForTimeout(500);
  const panelText = await page.evaluate(
    () => document.querySelector('.c2pa-menu-panel')?.textContent ?? ''
  );
  await clickMenuButton();
  await page.waitForTimeout(200);
  // Anchored to "Validation Status" rather than a bare word match: "Valid"
  // is a substring of "Validation", which a loose match would misread as
  // the verdict itself.
  return /Validation Status\s*(Trusted|Valid|Invalid|Unknown)/i.exec(panelText)?.[1] ?? null;
}

async function selectEngine(value) {
  const handles = await page.$$('.player-config-control select');
  for (const handle of handles) {
    const labelText = await handle.evaluate((el) => el.closest('label')?.textContent ?? '');
    if (labelText.includes('Monolithic engine')) {
      await handle.selectOption(value);
      return;
    }
  }
  throw new Error('Monolithic engine control not found');
}

// ---------------------------------------------------------------------------
console.log('=== 1. panel renders with all 6 controls ===');
// ---------------------------------------------------------------------------
{
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const state = await readControls();
  console.log(`   ${JSON.stringify(state)}`);
  check('panel is present', state.panelPresent);
  check('all 6 controls render', state.controlCount === 6, String(state.controlCount));
  check('window tooltip mentions the seconds grammar', /window=/.test(state.windowTitle ?? ''));
}

// ---------------------------------------------------------------------------
console.log('=== 2. loading a monolithic MP4: window/gate disabled, engine enabled ===');
// ---------------------------------------------------------------------------
{
  await loadUrl(MP4);
  await page.waitForTimeout(1500);
  const state = await readControls();
  console.log(`   ${JSON.stringify(state)}`);
  check('window disabled for MP4', state.windowDisabled === true);
  check('gate disabled for MP4', state.gateDisabled === true);
  check('engine dropdown enabled for MP4', state.engineDisabled === false);
}

// ---------------------------------------------------------------------------
console.log('=== 3. loading an HLS fixture: window/gate enabled, engine disabled ===');
// ---------------------------------------------------------------------------
{
  await loadUrl(HLS);
  await page.waitForTimeout(1500);
  const state = await readControls();
  console.log(`   ${JSON.stringify(state)}`);
  check('window enabled for HLS', state.windowDisabled === false);
  check('gate enabled for HLS', state.gateDisabled === false);
  check('engine dropdown disabled for HLS', state.engineDisabled === true);
}

// ---------------------------------------------------------------------------
console.log('=== 4. switching monolithic engine to c2pa-web reloads and re-validates ===');
// ---------------------------------------------------------------------------
{
  await loadUrl(MP4);
  await page.waitForTimeout(2500);

  const beforeUrl = await page.evaluate(() => window.location.search);
  const beforeVerdict = await readVerdict();

  await selectEngine('c2pa-web');
  await page.waitForTimeout(4000);

  const afterUrl = await page.evaluate(() => window.location.search);
  const afterVerdict = await readVerdict();
  console.log(`   nettrek (default): url=${JSON.stringify(beforeUrl)} verdict=${beforeVerdict}`);
  console.log(`   c2pa-web:          url=${JSON.stringify(afterUrl)} verdict=${afterVerdict}`);

  check('the URL now carries ?monolithicEngine=c2pa-web', /monolithicEngine=c2pa-web/.test(afterUrl));
  check('the c2pa-web engine reaches a definite verdict, not stuck pending/error', Boolean(afterVerdict));
  // Both engines read this asset's production trust material; the signer
  // chains via the allow-list only, not an anchor, so both must agree it
  // stops at 'Valid' rather than 'Trusted'. This is the exact case
  // evidence.ts's fromCodedResults got wrong before declaredOverallState.
  check(
    "both engines agree on this asset's verdict under the default trust profile",
    beforeVerdict === afterVerdict,
    `${beforeVerdict} vs ${afterVerdict}`
  );
}

await browser.close();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

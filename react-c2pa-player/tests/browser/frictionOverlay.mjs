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
 * The consent gate: legible, clear of the control bar, and announced.
 *
 *   npm run dev -- --port 5199
 *   npm run test:friction
 *
 * Measured before this change, on the same page: the whole block rendered at
 * 10px, it had no z-index while the control bar sits at 100, and its lower 14px
 * (including part of the accept button) was behind that bar.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';
// A source whose own manifest failed, which is what raises the gate.
// A monolithic source, deliberately. The gate is raised from video.js's `play`
// handler and only when the manifest is *already* known bad, and a fragmented
// source cannot know that before playback: its verdict needs fragments, which
// need playback, and the first play marks playback as started. So the gate is
// reachable on a file that validates on load, and effectively unreachable on
// HLS and DASH. Worth its own look; not this check's subject.
const INVALID =
  process.env.C2PA_TEST_INVALID_MP4 ??
  `${BASE}mp4s/TAMPERED_PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => console.log('   [pageerror]', e.message));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.fill('#mp4Url', INVALID);
await page.click('button:has-text("Load Video")');
await page.waitForSelector('video', { timeout: 30000 });
// Deliberately not autoplaying yet. The gate is raised from video.js's `play`
// handler and only when the manifest is already known bad, so playing before
// validation finishes marks playback as started and the gate never appears.
await page.evaluate(() => {
  document.querySelector('video').muted = true;
});

// Give validation time to reach a verdict while playback is still untouched.
await page.waitForTimeout(12000);
const state = await page.evaluate(() => ({
  buttonInvalid: Boolean(document.querySelector('.c2pa-menu-button-invalid')),
  redSegments: [...document.querySelectorAll('.seekbar-play-c2pa')].filter(
    (el) => el.dataset.verificationStatus === 'Invalid',
  ).length,
  segments: document.querySelectorAll('.seekbar-play-c2pa').length,
  paused: document.querySelector('video').paused,
}));
console.log(`=== before play: ${JSON.stringify(state)} ===`);

// A real gesture through video.js, which is what fires the `play` handler the
// gate hangs off.
await page.evaluate(() => {
  const p = document.querySelector('.video-js');
  p?.classList.remove('vjs-user-inactive');
  p?.classList.add('vjs-user-active');
});
await page.waitForTimeout(300);
// Before playback starts video.js hides the control bar and shows the big play
// button, so that is the only real gesture available.
const bigPlay = await page.$('.vjs-big-play-button');
try {
  if (bigPlay) {
    await bigPlay.click({ timeout: 5000 });
  } else {
    await page.click('.vjs-play-control', { timeout: 5000 });
  }
} catch {
  await page.evaluate(() => void document.querySelector('video').play().catch(() => {}));
}

let visible = false;
for (let i = 0; i < 60; i += 1) {
  visible = await page.evaluate(() => {
    const el = document.querySelector('.friction-overlay');
    return Boolean(el) && getComputedStyle(el).display !== 'none';
  });
  if (visible) break;
  await page.waitForTimeout(500);
}
console.log(`=== gate raised: ${visible} ===`);

if (!visible) {
  console.log('   could not raise the gate on this source; nothing measured');
  await browser.close();
  process.exit(1);
}

await page.evaluate(() => {
  const p = document.querySelector('.video-js');
  p?.classList.remove('vjs-user-inactive');
  p?.classList.add('vjs-user-active');
  p?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(500);

const m = await page.evaluate(() => {
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const overlay = document.querySelector('.friction-overlay');
  const button = overlay.querySelector('.friction-button');
  const bar = document.querySelector('.vjs-control-bar');
  const o = overlay.getBoundingClientRect();
  const b = button.getBoundingClientRect();
  const barRect = bar.getBoundingClientRect();
  const style = getComputedStyle(overlay);

  // What is actually on top at each corner of the accept button.
  const hitAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? `${el.tagName}.${(el.className || '').toString().split(' ')[0]}` : null;
  };

  return {
    fontSize: px(style.fontSize),
    buttonFontSize: px(getComputedStyle(button).fontSize),
    zIndex: style.zIndex,
    barZIndex: getComputedStyle(bar).zIndex,
    barHeight: px(barRect.height),
    barTop: px(barRect.top),
    overlayBottom: px(o.bottom),
    overlapPx: px(Math.max(0, o.bottom - barRect.top)),
    buttonRect: { w: px(b.width), h: px(b.height) },
    buttonHiddenPx: px(Math.max(0, b.bottom - barRect.top)),
    // Edge midpoints, not corners: the button is rounded, so its corner pixels
    // are outside its shape by design and hit-testing them proves nothing.
    hitCentre: hitAt(b.left + b.width / 2, b.top + b.height / 2),
    hitTopEdge: hitAt(b.left + b.width / 2, b.top + 2),
    hitBottomEdge: hitAt(b.left + b.width / 2, b.bottom - 2),
    hitLeftEdge: hitAt(b.left + 2, b.top + b.height / 2),
    hitRightEdge: hitAt(b.right - 2, b.top + b.height / 2),
    role: overlay.getAttribute('role'),
    labelledBy: overlay.getAttribute('aria-labelledby'),
    labelText: (() => {
      const id = overlay.getAttribute('aria-labelledby');
      return id ? (document.getElementById(id)?.textContent ?? '').slice(0, 48) : null;
    })(),
    focusOnButton: document.activeElement === button,
    controlBarToken: getComputedStyle(document.querySelector('.video-js')).getPropertyValue(
      '--c2pa-control-bar-height',
    ).trim(),
    background: style.backgroundImage.slice(0, 40),
    buttonBackground: getComputedStyle(button).backgroundColor,
    fontFamily: style.fontFamily.split(',')[0],
  };
});

console.log(`   ${JSON.stringify(m, null, 0).replace(/,"/g, ', "')}`);

check('the text is readable, not 10px', m.fontSize >= 13, `${m.fontSize}px`);
check('so is the button label', m.buttonFontSize >= 13, `${m.buttonFontSize}px`);
check('it has a stacking position', m.zIndex !== 'auto', String(m.zIndex));
check('and sits above the other overlays', Number(m.zIndex) > 10, String(m.zIndex));
check(
  'the control bar height is published',
  m.controlBarToken === '54px',
  m.controlBarToken,
);
check('nothing of it is behind the control bar', m.overlapPx === 0, `${m.overlapPx}px overlap`);
check('none of the accept button is', m.buttonHiddenPx === 0, `${m.buttonHiddenPx}px`);
const hits = [m.hitCentre, m.hitTopEdge, m.hitBottomEdge, m.hitLeftEdge, m.hitRightEdge];
check(
  'the button receives clicks across its whole face',
  hits.every((h) => h?.includes('friction-button')),
  hits.join(' / '),
);
check(
  'the button meets the 24px minimum target',
  m.buttonRect.w >= 24 && m.buttonRect.h >= 24,
  JSON.stringify(m.buttonRect),
);
check('it announces itself as a gate', m.role === 'alertdialog', String(m.role));
check('with an accessible name from its own text', Boolean(m.labelText), String(m.labelText));
check('focus is on the accept button', m.focusOnButton);
check('it uses the player palette, not bootstrap blue', m.buttonBackground !== 'rgb(0, 123, 255)', m.buttonBackground);
check('and the player font, not Verdana', !/Verdana/i.test(m.fontFamily), m.fontFamily);


// Escape must not dismiss a consent gate; only the button may.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
check(
  'Escape does not dismiss it, since consent is the point',
  await page.evaluate(
    () => getComputedStyle(document.querySelector('.friction-overlay')).display !== 'none',
  ),
);

// And the button works from the keyboard.
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
const after = await page.evaluate(() => ({
  hidden: getComputedStyle(document.querySelector('.friction-overlay')).display === 'none',
  playing: !document.querySelector('video').paused,
}));
check('Enter on the button accepts and resumes', after.hidden && after.playing, JSON.stringify(after));


await browser.close();
console.log(failures === 0 ? '\nALL FRICTION OVERLAY CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

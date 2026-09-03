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
 * The authenticity label and the per-invalid-run consent question.
 *
 *   npm run dev -- --port 5199
 *   npm run test:authenticity
 *
 * Driven from `hls-fixtures/tampered-segs-corrupt`, which is the shape the
 * feature exists for: a sound manifest with three runs of four bad fragments
 * each. At 8s per fragment (`#EXT-X-TARGETDURATION:8`, sixteen fragments) the
 * runs are 8-40s, 56-88s and 96-128s, with clean stretches between them, so a
 * seek can put the playhead inside or outside a run on purpose.
 *
 * Six phases, and the fourth is the one that matters most: with neither
 * parameter set the player must behave exactly as it does today.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';
const FIXTURE =
  process.env.C2PA_TEST_TAMPERED_HLS ??
  `${BASE}hls-fixtures/tampered-segs-corrupt/master.m3u8`;

/** Inside the first tampered run, and inside a clean stretch. */
const INSIDE_RUN_1 = 20;
const CLEAN_BETWEEN = 46;
const INSIDE_RUN_2 = 68;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });

/** Loads the fixture with the given query string and starts muted playback. */
async function open(query, { reducedMotion } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion,
  });
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));

  await page.goto(`${BASE}${query}`, { waitUntil: 'domcontentloaded' });
  await page.fill('#mp4Url', FIXTURE);
  await page.click('button:has-text("Load Video")');
  await page.waitForSelector('video', { timeout: 30000 });
  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.muted = true;
  });

  return page;
}

/**
 * Puts the playhead at `time` and lets playback read enough of it for a verdict.
 *
 * Playing rather than seeking alone: on HLS a region is only readable once
 * playback has actually passed through it (`WatchedTimeline`), so a seek with
 * no play leaves the playhead over content with no verdict.
 */
async function playAt(page, time, forMs = 3500) {
  await page.evaluate((t) => {
    const video = document.querySelector('video');
    video.currentTime = t;
    return video.play().catch(() => {});
  }, time);
  await page.waitForTimeout(forMs);
}

const readLabel = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.c2pa-authenticity-label');

    if (!el) {
      return { present: false };
    }

    const px = (v) => Math.round(parseFloat(v) * 10) / 10;
    const style = getComputedStyle(el);
    const text = el.querySelector('.c2pa-authenticity-label__text');
    const mark = el.querySelector('.c2pa-authenticity-label__mark');
    const player = document.querySelector('.video-js');
    const rect = el.getBoundingClientRect();
    const playerRect = player.getBoundingClientRect();

    return {
      present: true,
      tag: el.tagName,
      classes: el.className,
      text: (text?.textContent ?? '').trim(),
      textWidth: px(text.getBoundingClientRect().width),
      ariaLabel: el.getAttribute('aria-label'),
      borderColour: style.borderTopColor,
      borderWidth: px(style.borderTopWidth),
      background: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      display: style.display,
      transitionDuration: style.transitionDuration,
      markColour: getComputedStyle(mark).backgroundColor,
      markImage: getComputedStyle(mark).backgroundImage.replace(/.*\/([^/"]+)".*/, '$1'),
      fontSize: px(style.fontSize),
      zIndex: style.zIndex,
      animationDuration: style.animationDuration,
      insetTop: px(rect.top - playerRect.top),
      insetRight: px(playerRect.right - rect.right),
      withinPlayer:
        rect.top >= playerRect.top - 0.5 && rect.right <= playerRect.right + 0.5,
      // Whatever is actually on top at the label's centre.
      hitCentre: (() => {
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return hit ? `${hit.tagName}.${(hit.className || '').toString().split(' ')[0]}` : null;
      })(),
      liveRegion: (document.querySelector('.c2pa-authenticity-live')?.textContent ?? '').trim(),
    };
  });

const readConsent = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.friction-overlay');
    const shown = Boolean(el) && getComputedStyle(el).display !== 'none';
    const countdown = el?.querySelector('.friction-countdown');

    return {
      shown,
      message: shown ? (el.querySelector('p')?.textContent ?? '').trim() : '',
      countdown: countdown ? countdown.textContent.replace(/\s+/g, ' ').trim() : null,
      paused: document.querySelector('video').paused,
      currentTime: Math.round(document.querySelector('video').currentTime * 10) / 10,
    };
  });

/** Waits for the consent question, returning whether it appeared. */
async function waitForConsent(page, timeoutMs = 12000) {
  for (let waited = 0; waited < timeoutMs; waited += 400) {
    if ((await readConsent(page)).shown) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

// ---------------------------------------------------------------------------
console.log('=== 1. ?label=on: the label states the verdict on screen ===');
// ---------------------------------------------------------------------------
{
  const page = await open('?label=on');

  await playAt(page, 0, 4000);
  const clean = await readLabel(page);
  console.log(`   clean: ${JSON.stringify(clean)}`);

  check('a label appears once a verdict covers the playhead', clean.present);
  check('it is a real button, so it is operable', clean.tag === 'BUTTON', clean.tag);
  check(
    'a sound fragment reads green or blue',
    /--(trusted|valid)\b/.test(clean.classes ?? ''),
    clean.classes,
  );
  check(
    'it says so in words, not only in colour',
    /Authenticity established|Valid/.test(clean.text ?? ''),
    clean.text,
  );
  check(
    'the accessible name carries the verdict too',
    /Authenticity established|Valid/.test(clean.ariaLabel ?? ''),
    clean.ariaLabel,
  );
  check('it is not rendered at 10px', clean.fontSize >= 12, `${clean.fontSize}px`);
  // The four declarations `.video-js button` was discarding. Measured and
  // printed on the first run of this check, and not asserted on, which is why
  // they shipped broken for a version.
  check(
    'it has the panel background, not the button reset’s none',
    clean.background !== 'rgba(0, 0, 0, 0)',
    clean.background,
  );
  check(
    'it has a coloured border in its verdict colour',
    clean.borderWidth >= 1 && clean.borderColour === 'rgb(42, 243, 122)',
    `${clean.borderWidth}px ${clean.borderColour}`,
  );
  check('it lays out as a flex row', clean.display === 'flex', clean.display);
  check(
    'and where the browser can blur, it takes the translucent background',
    clean.backdropFilter === 'none' || clean.background === 'rgba(20, 20, 22, 0.62)',
    `${clean.backdropFilter} / ${clean.background}`,
  );
  check(
    'and its morph transitions survive',
    !/^0s(, 0s)*$/.test(clean.transitionDuration ?? ''),
    clean.transitionDuration,
  );
  check('it stacks above the menu overlay', Number(clean.zIndex) === 15, clean.zIndex);
  check(
    'it sits inside the picture, top-right',
    clean.withinPlayer && clean.insetTop > 0 && clean.insetRight > 0,
    `top ${clean.insetTop} / right ${clean.insetRight}`,
  );
  check(
    'a reassuring label does not pulse',
    !/--glowing/.test(clean.classes ?? ''),
    clean.classes,
  );

  // Paused inside the clean first fragment. Playing on would carry the
  // playhead into the tampered run at 8s and the label would turn red before
  // the collapse was due - which is what the first run of this check did.
  //
  // Pausing also exercises the gate's own timer: nothing else ticks while
  // paused, so if the collapse still happens here it happens because of that
  // timer and nothing else.
  await page.evaluate(() => {
    document.querySelector('video').pause();
  });
  await page.waitForTimeout(6000);
  const collapsed = await readLabel(page);
  console.log(`   after 6s: ${JSON.stringify({ classes: collapsed.classes, textWidth: collapsed.textWidth })}`);
  check(
    'it collapses to a dot after five seconds',
    /--collapsed/.test(collapsed.classes ?? '') && collapsed.textWidth < 1,
    `${collapsed.classes} / text ${collapsed.textWidth}px`,
  );
  check(
    'and the dot is still hit-testable',
    collapsed.hitCentre?.includes('c2pa-authenticity-label'),
    collapsed.hitCentre,
  );
  check(
    'the verdict is still in the accessible name while collapsed',
    /Authenticity established|Valid/.test(collapsed.ariaLabel ?? ''),
    collapsed.ariaLabel,
  );

  // Into the tampered run.
  await playAt(page, INSIDE_RUN_1, 5000);
  const bad = await readLabel(page);
  console.log(`   invalid: ${JSON.stringify(bad)}`);

  check('a tampered fragment turns the label red', /--invalid/.test(bad.classes ?? ''), bad.classes);
  check('with the wording asked for', bad.text === 'Invalid Authenticity', bad.text);
  check('it stays expanded', /--expanded/.test(bad.classes ?? ''), bad.classes);
  check('and pulses', /--glowing/.test(bad.classes ?? ''), bad.classes);
  check(
    'the mark carries the invalid Content Credentials icon',
    bad.markImage === 'cr-invalid.svg',
    bad.markImage,
  );
  check(
    'a warning is announced to a screen reader',
    bad.liveRegion === 'Invalid Authenticity',
    bad.liveRegion,
  );

  // It must not collapse, however long it is left.
  await page.waitForTimeout(6500);
  const stillBad = await readLabel(page);
  check(
    'a warning never collapses itself',
    /--expanded/.test(stillBad.classes ?? ''),
    stillBad.classes,
  );

  // Reachable with the menu open, which the overlay at z-index 10 would
  // otherwise swallow.
  await page.evaluate(() => {
    document.querySelector('.c2pa-menu-button')?.click();
  });
  await page.waitForTimeout(600);
  const withMenu = await readLabel(page);
  check(
    'it is still clickable with the panel open',
    withMenu.hitCentre?.includes('c2pa-authenticity-label'),
    withMenu.hitCentre,
  );

  // ---------------------------------------------------------------------
  console.log('=== 2. clicking it pauses and opens the panel on that moment ===');
  // ---------------------------------------------------------------------
  await page.evaluate(() => {
    document.querySelector('.c2pa-menu-button')?.click();
  });
  await page.waitForTimeout(500);
  await playAt(page, INSIDE_RUN_1, 3000);
  await page.click('.c2pa-authenticity-label', { timeout: 5000 });
  await page.waitForTimeout(800);

  const afterClick = await page.evaluate(() => ({
    paused: document.querySelector('video').paused,
    menuOpen: Boolean(document.querySelector('.c2pa-menu-panel')),
    panelText: (document.querySelector('.c2pa-menu-panel')?.textContent ?? '').slice(0, 160),
  }));
  console.log(`   ${JSON.stringify(afterClick)}`);

  check('the click pauses playback', afterClick.paused);
  check('and opens the Content Credentials panel', afterClick.menuOpen);
  check(
    'on the offending moment, not the general status',
    /invalid|tampered/i.test(afterClick.panelText),
    afterClick.panelText.slice(0, 80),
  );

  await page.close();
}

// ---------------------------------------------------------------------------
console.log('=== 3. ?consent=per-run: one question per invalid stretch ===');
// ---------------------------------------------------------------------------
{
  // Label deliberately off. This is the combination nobody tests by hand, and
  // the two switches have to work independently.
  const page = await open('?consent=per-run');

  await playAt(page, INSIDE_RUN_1, 2000);
  const raised = await waitForConsent(page);
  const first = await readConsent(page);
  console.log(`   first: ${JSON.stringify(first)}`);

  check('the question is raised on entering the stretch', raised);
  check('with no label alongside it, since the label is off', !(await readLabel(page)).present);
  check('playback is held', first.paused);
  check(
    'it says what is wrong with this part, not with the file',
    /part now playing|part of the stream/i.test(first.message),
    first.message.slice(0, 90),
  );
  check(
    'no countdown on demand, where a position does not expire',
    first.countdown === null,
    String(first.countdown),
  );

  if (raised) {
    const pausedAt = first.currentTime;
    await page.click('.friction-button', { timeout: 5000 });
    await page.waitForTimeout(1500);
    const accepted = await readConsent(page);
    console.log(`   accepted at ${pausedAt}s -> ${JSON.stringify(accepted)}`);

    check('accepting takes the question down', !accepted.shown);
    check('and resumes playback', !accepted.paused);
    check(
      'from where it paused, not from the start',
      Math.abs(accepted.currentTime - pausedAt) < 4,
      `${pausedAt}s -> ${accepted.currentTime}s`,
    );

    // The rest of the same stretch must play without asking again.
    await page.waitForTimeout(4000);
    check(
      'the rest of the stretch plays unasked',
      !(await readConsent(page)).shown,
      'asked again inside one run',
    );

    // Leave the stretch, then enter a different one.
    await playAt(page, CLEAN_BETWEEN, 4000);
    check('a sound stretch raises nothing', !(await readConsent(page)).shown);

    await playAt(page, INSIDE_RUN_2, 2000);
    const second = await waitForConsent(page);
    check('a second stretch raises the question again', second);

    if (second) {
      await page.click('.friction-button', { timeout: 5000 });
      await page.waitForTimeout(1200);
    }

    // Re-entering a stretch already consented to asks again, which is what
    // "prompt again every time it is entered" means.
    await playAt(page, CLEAN_BETWEEN, 3500);
    await playAt(page, INSIDE_RUN_1, 2000);
    check('re-entering a consented stretch asks again', await waitForConsent(page));
  }

  await page.close();
}

// ---------------------------------------------------------------------------
console.log('=== 4. neither parameter: today’s behaviour, unchanged ===');
// ---------------------------------------------------------------------------
{
  const page = await open('');

  await playAt(page, INSIDE_RUN_1, 6000);
  const label = await readLabel(page);
  const consent = await readConsent(page);
  const bar = await page.evaluate(() => ({
    segments: document.querySelectorAll('.seekbar-play-c2pa').length,
    invalid: [...document.querySelectorAll('.seekbar-play-c2pa')].filter(
      (el) => el.dataset.verificationStatus === 'Invalid',
    ).length,
    buttonFlagged: Boolean(document.querySelector('.c2pa-menu-button-invalid')),
  }));
  console.log(`   ${JSON.stringify({ label: label.present, consent: consent.shown, ...bar })}`);

  check('no label over the picture', !label.present);
  check('no consent question', !consent.shown);
  check('playback is not held', !consent.paused);
  check('the timeline still paints its verdicts', bar.segments > 0, `${bar.segments} segments`);
  check('including the tampered ones', bar.invalid > 0, `${bar.invalid} invalid`);
  check('and the menu button is still flagged', bar.buttonFlagged);

  await page.close();
}

// ---------------------------------------------------------------------------
console.log('=== 5. reduced motion: shown, but not animated ===');
// ---------------------------------------------------------------------------
{
  const page = await open('?label=on', { reducedMotion: 'reduce' });

  await playAt(page, INSIDE_RUN_1, 5000);
  const label = await readLabel(page);
  console.log(`   ${JSON.stringify({ present: label.present, animationDuration: label.animationDuration })}`);

  check('the label still appears', label.present);
  check('it still says what is wrong', label.text === 'Invalid Authenticity', label.text);
  // The global rule sets `animation-duration: 0.01ms !important`, which
  // computes to `1e-05s` rather than `0s`. Asserting on "effectively nothing"
  // rather than on the literal, so the check states the property instead of
  // the implementation.
  const longest = Math.max(
    ...(label.animationDuration ?? '0s').split(',').map((v) => parseFloat(v) || 0),
  );
  check(
    'and the global rule neutralises its animation',
    longest < 0.01,
    `${label.animationDuration} (longest ${longest}s)`,
  );

  await page.close();
}

// ---------------------------------------------------------------------------
console.log('=== 6. the live countdown, driven directly ===');
// ---------------------------------------------------------------------------
{
  // On demand the budget is null by design, so this is the one behaviour a VOD
  // fixture cannot produce. Driven through the dev server the way
  // sourceSwitch.mjs drives its modules.
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  const result = await page.evaluate(async () => {
    const gate = await import('/server/src/C2paPlayer-V2/C2paAuthenticity/authenticityGate.ts');
    const verdict = {
      state: 'Invalid',
      segment: { startTime: 8, endTime: 12, validationState: 'Invalid' },
      invalidRunStart: 8,
      reason: 'covering',
    };
    const base = {
      event: 'tick',
      verdict,
      labelEnabled: true,
      consentPerRun: true,
      isLive: true,
      dvrDepthSeconds: 30,
      alreadyPausedSeconds: 0,
    };

    const raised = gate.advanceAuthenticityGate(
      gate.initialAuthenticityGateState(0),
      { ...base, nowMs: 0 },
    );
    const midway = gate.advanceAuthenticityGate(raised.state, { ...base, nowMs: 12_000 });
    const expired = gate.advanceAuthenticityGate(midway.state, { ...base, nowMs: 24_000 });
    const after = gate.advanceAuthenticityGate(expired.state, { ...base, nowMs: 24_500 });

    return {
      raised: raised.consentSecondsRemaining,
      deadline: raised.nextDeadlineMs,
      midway: midway.consentSecondsRemaining,
      expiredShown: expired.showConsent,
      expiredReason: expired.reason,
      afterReason: after.reason,
      afterShown: after.showConsent,
    };
  });
  console.log(`   ${JSON.stringify(result)}`);

  check('the countdown starts at the pause budget', result.raised === 24, String(result.raised));
  check('it asks to be woken at the deadline', result.deadline === 24_000, String(result.deadline));
  check('and counts down', result.midway === 12, String(result.midway));
  check('the question withdraws when it runs out', result.expiredShown === false, result.expiredReason);
  check(
    'and is never raised for that stretch again',
    result.afterShown === false && result.afterReason === 'run-withdrawn',
    result.afterReason,
  );

  await page.close();
}

await browser.close();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

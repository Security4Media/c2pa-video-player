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
 * Can the Content Credentials panel and the validation log be used without a
 * mouse?
 *
 * This cannot be a unit test. The open and close behaviour is a negotiation
 * between our React overlay and video.js's own MenuButton, and the whole defect
 * this guards against was our override silently discarding video.js's close
 * paths. Only a real player exercises that.
 *
 * Measured before the fix, on this exact page: Enter opened the panel, Escape
 * and Tab both left it open with `aria-expanded="true"`, and the panel held
 * zero focusable elements.
 *
 *   npm run dev -- --port 5199
 *   npm run test:keyboard
 */

import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';
const SOURCE = process.env.C2PA_TEST_MP4 ?? `${BASE}mp4s/PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`;
/** A fragmented source, so the validation log button is available at all. */
const FRAGMENTED =
  process.env.C2PA_TEST_HLS ?? `${BASE}hls-fixtures/tampered-segs-corrupt/master.m3u8`;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

console.log(`Keyboard access against ${BASE}\n`);

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.fill('#mp4Url', SOURCE);
await page.click('button:has-text("Load Video")');
await page.waitForSelector('video', { timeout: 30000 });
await page.evaluate(() => {
  const video = document.querySelector('video');
  video.muted = true;
  void video.play().catch(() => {});
});
await page.waitForTimeout(6000);
// The control bar hides itself after a few idle seconds, which would make every
// control unfocusable for reasons that have nothing to do with this test.
await page.evaluate(() => {
  const player = document.querySelector('.video-js');
  player?.classList.remove('vjs-user-inactive');
  player?.classList.add('vjs-user-active');
  player?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(400);

const MENU_BUTTON = '.c2pa-menu-button button';

const state = () =>
  page.evaluate(
    (selector) => {
      const button = document.querySelector(selector);
      const panel = document.querySelector('.c2pa-menu-panel');
      const active = document.activeElement;

      return {
        panelOpen: panel !== null,
        ariaExpanded: button?.getAttribute('aria-expanded') ?? null,
        focusInPanel: Boolean(panel && active && panel.contains(active)),
        focusIsPanel: panel !== null && active === panel,
        focusOnButton: active === button,
      };
    },
    MENU_BUTTON,
  );

const focusButton = () =>
  page.evaluate((selector) => document.querySelector(selector)?.focus(), MENU_BUTTON);

const openMenu = async () => {
  await focusButton();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
};

console.log('Opening and dismissing');
{
  await openMenu();
  const opened = await state();
  check('Enter opens the panel', opened.panelOpen, `aria-expanded=${opened.ariaExpanded}`);
  check('and focus moves into it', opened.focusInPanel);

  // Criterion 1a: Escape with focus inside the panel, which is where the
  // previous implementation could never be reached from at all.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const afterEscape = await state();
  check('Escape from inside the panel closes it', !afterEscape.panelOpen);
  check('aria-expanded returns to false', afterEscape.ariaExpanded === 'false', String(afterEscape.ariaExpanded));
  check('and focus returns to the button', afterEscape.focusOnButton);

  // Criterion 1b: Escape with focus on the button, which is video.js's own
  // path through our override.
  await openMenu();
  await focusButton();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Escape from the button closes it', !(await state()).panelOpen);

  // Criterion 2.
  await openMenu();
  await focusButton();
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  const afterTab = await state();
  check('Tab away from the button closes it', !afterTab.panelOpen, `aria-expanded=${afterTab.ariaExpanded}`);
}

console.log('\nOperating the panel');
{
  await openMenu();

  const controls = await page.evaluate(() => {
    const panel = document.querySelector('.c2pa-menu-panel');
    if (!panel) return null;

    const focusable = [
      ...panel.querySelectorAll(
        'button, [href], input, select, summary, [tabindex]:not([tabindex="-1"])',
      ),
    ];

    return {
      focusableCount: focusable.length,
      // Anything with a click handler that is not focusable is mouse-only.
      collapsibles: [
        ...panel.querySelectorAll('.c2pa-menu-section__header--collapsible'),
      ].map((el) => ({
        tag: el.tagName,
        ariaExpanded: el.getAttribute('aria-expanded'),
        text: el.textContent?.trim().replace(/\s+/g, ' ').slice(0, 28) ?? null,
      })),
      listRole: panel.querySelector('.c2pa-menu-content-list')?.getAttribute('role') ?? null,
      panelRole: panel.getAttribute('role'),
      panelName: panel.getAttribute('aria-labelledby')
        ? (document.getElementById(panel.getAttribute('aria-labelledby'))?.textContent ?? '').trim()
        : panel.getAttribute('aria-label'),
    };
  });

  // Moving focus into the panel is what made this necessary. Video.js erases
  // the background of anything focused-but-not-focus-visible inside a
  // `.vjs-menu` (video-js.css:801), to stop a script-focused menu item looking
  // selected - and this panel is inside a `.vjs-menu`. The first version of
  // the focus change therefore made the whole panel transparent, and every
  // keyboard check here still passed, because none of them looked at whether
  // the thing being focused was still visible.
  const paint = await page.evaluate(() => {
    const panel = document.querySelector('.c2pa-menu-panel');
    const style = panel ? getComputedStyle(panel) : null;
    return {
      focused: document.activeElement === panel,
      backgroundImage: style?.backgroundImage ?? null,
      backgroundColor: style?.backgroundColor ?? null,
    };
  });

  check(
    'the panel is still painted while focused',
    paint.backgroundImage !== 'none' || paint.backgroundColor !== 'rgba(0, 0, 0, 0)',
    `focused=${paint.focused} background-image=${String(paint.backgroundImage).slice(0, 32)}`,
  );

  check('the panel exposes at least one focusable control', controls.focusableCount > 0, `${controls.focusableCount}`);
  check(
    'every collapsible is a real button',
    controls.collapsibles.length > 0 && controls.collapsibles.every((c) => c.tag === 'BUTTON'),
    controls.collapsibles.map((c) => `${c.tag}:${c.text}`).join(', ') || 'none found',
  );

  // Criterion 6.
  check('the content list no longer claims to be a menu', controls.listRole === null, String(controls.listRole));
  check('the panel has a role', controls.panelRole !== null, String(controls.panelRole));
  check('and an accessible name', Boolean(controls.panelName), String(controls.panelName));

  // Criterion 4: reachable by Tab from the panel, and operable by keyboard.
  const reached = await page.evaluate(async () => {
    const panel = document.querySelector('.c2pa-menu-panel');
    panel?.focus();
    return document.activeElement === panel;
  });
  check('the panel itself holds focus so Tab starts inside it', reached);

  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const firstStop = await page.evaluate(() => {
    const panel = document.querySelector('.c2pa-menu-panel');
    const active = document.activeElement;
    return {
      insidePanel: Boolean(panel && active && panel.contains(active)),
      tag: active?.tagName ?? null,
      text: active?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 30) ?? null,
    };
  });
  check(
    'the first Tab lands on a control inside the panel',
    firstStop.insidePanel,
    `${firstStop.tag} "${firstStop.text}"`,
  );

  // Criterion 7: state is announced and collapsed content leaves the tree.
  const beforeToggle = await page.evaluate(() => {
    const button = document.querySelector('.c2pa-menu-section__header--collapsible[aria-expanded]');
    if (!button) return null;
    const panelId = button.getAttribute('aria-controls');
    const target = panelId ? document.getElementById(panelId) : null;
    return {
      ariaExpanded: button.getAttribute('aria-expanded'),
      visibility: target ? getComputedStyle(target).visibility : null,
    };
  });

  if (beforeToggle === null) {
    console.log('  --    no in-place disclosure on this source; checked on the navigation button only');
  } else {
    check(
      'a collapsed section is hidden from assistive technology',
      beforeToggle.ariaExpanded === 'false' && beforeToggle.visibility === 'hidden',
      `aria-expanded=${beforeToggle.ariaExpanded} visibility=${beforeToggle.visibility}`,
    );

    const afterToggle = await page.evaluate(async () => {
      const button = document.querySelector('.c2pa-menu-section__header--collapsible[aria-expanded]');
      button.focus();
      button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const panelId = button.getAttribute('aria-controls');
      const target = panelId ? document.getElementById(panelId) : null;
      return {
        ariaExpanded: button.getAttribute('aria-expanded'),
        visibility: target ? getComputedStyle(target).visibility : null,
      };
    });
    check(
      'expanding it updates aria-expanded and reveals it to assistive technology',
      afterToggle.ariaExpanded === 'true' && afterToggle.visibility === 'visible',
      `aria-expanded=${afterToggle.ariaExpanded} visibility=${afterToggle.visibility}`,
    );
  }

  // Criterion 3.
  const holder = await page.evaluate(() => {
    const rect = document.querySelector('video').getBoundingClientRect();
    return { x: rect.x + rect.width - 12, y: rect.y + 12 };
  });
  await page.mouse.click(holder.x, holder.y);
  await page.waitForTimeout(500);
  check('clicking outside the panel closes it', !(await state()).panelOpen);
}

console.log('\nThe validation log');
{
  // Hidden on a monolithic source by design, so this needs a fragmented one.
  const logPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  logPage.on('pageerror', (error) => pageErrors.push(error.message));
  await logPage.goto(BASE, { waitUntil: 'domcontentloaded' });
  await logPage.fill('#mp4Url', FRAGMENTED);
  await logPage.click('button:has-text("Load Video")');
  await logPage.waitForSelector('video', { timeout: 30000 });
  await logPage.evaluate(() => {
    const video = document.querySelector('video');
    video.muted = true;
    video.playbackRate = 8;
    void video.play().catch(() => {});
  });
  await logPage.waitForTimeout(9000);
  await logPage.evaluate(() => {
    const player = document.querySelector('.video-js');
    player?.classList.remove('vjs-user-inactive');
    player?.classList.add('vjs-user-active');
    player?.scrollIntoView({ block: 'center' });
  });
  await logPage.waitForTimeout(400);

  const available = await logPage.evaluate(() => {
    const button = document.querySelector('.c2pa-debug-button');
    return Boolean(button) && !button.classList.contains('vjs-hidden');
  });
  check('the log button is available on a fragmented source', available);
  check(
    'and is a real button element',
    (await logPage.evaluate(() => document.querySelector('.c2pa-debug-button')?.tagName ?? null)) ===
      'BUTTON',
  );

  if (available) {
    // Video.js's `Button` renders the <button> as its own element, unlike
    // `MenuButton`, which wraps an inner one. Both shapes are handled so the
    // check cannot quietly focus nothing, which is exactly what it did first.
    await logPage.evaluate(() => {
      const host = document.querySelector('.c2pa-debug-button');
      const button = host?.matches('button') ? host : host?.querySelector('button');
      button?.focus();
    });
    await logPage.keyboard.press('Enter');
    await logPage.waitForTimeout(500);
    const opened = await logPage.evaluate(() => {
      const panel = document.querySelector('.c2pa-debug-console');
      return {
        open: panel !== null,
        focused: panel !== null && document.activeElement === panel,
        role: panel?.getAttribute('role') ?? null,
        background: getComputedStyle(panel ?? document.body).backgroundColor,
        closeSize: (() => {
          const close = panel?.querySelector('.c2pa-debug-console__close');
          if (!close) return null;
          const rect = close.getBoundingClientRect();
          return { w: Math.round(rect.width), h: Math.round(rect.height) };
        })(),
      };
    });
    check('Enter opens the log', opened.open);
    check('and focus moves into it', opened.focused);
    // The log sits outside `.vjs-menu`, so video.js's focus-highlight rule
    // cannot reach it. Asserted rather than assumed, since it is the same
    // hazard that made the menu panel transparent.
    check(
      'and is still painted while focused',
      opened.background !== 'rgba(0, 0, 0, 0)',
      String(opened.background),
    );
    check('it does not claim to be a modal dialog', opened.role !== 'dialog', String(opened.role));
    check(
      'its close button meets the 24px minimum target',
      Boolean(opened.closeSize) && opened.closeSize.w >= 24 && opened.closeSize.h >= 24,
      JSON.stringify(opened.closeSize),
    );

    // Tab from the panel should reach its own controls.
    await logPage.keyboard.press('Tab');
    await logPage.waitForTimeout(200);
    check(
      'Tab reaches a control inside the log',
      await logPage.evaluate(() => {
        const panel = document.querySelector('.c2pa-debug-console');
        return Boolean(panel && document.activeElement && panel.contains(document.activeElement));
      }),
    );

    await logPage.keyboard.press('Escape');
    await logPage.waitForTimeout(400);
    check(
      'Escape closes the log',
      (await logPage.evaluate(() => document.querySelector('.c2pa-debug-console') === null)) === true,
    );
  }

  await logPage.close();
}

console.log('\nIn-place disclosure semantics');
{
  // Driven against a mounted section rather than hunting for an asset whose
  // manifest happens to carry authors or an AI opt-out assertion. The wiring
  // under test is `aria-expanded` and whether collapsed content leaves the
  // accessibility tree, neither of which depends on the source.
  const sectionPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  sectionPage.on('pageerror', (error) => pageErrors.push(error.message));
  await sectionPage.goto(BASE, { waitUntil: 'domcontentloaded' });

  const result = await sectionPage.evaluate(async (base) => {
    const prefix = new URL(base).pathname.replace(/\/$/, '');
    const [reactMod, domMod, { WorkSection }] = await Promise.all([
      import(`${prefix}/@id/react`),
      import(`${prefix}/@id/react-dom/client`),
      import(`${prefix}/src/C2paPlayer-V2/C2paMenu/components/WorkSection.tsx`),
    ]);
    const createElement = reactMod.createElement ?? reactMod.default?.createElement;
    const createRoot = domMod.createRoot ?? domMod.default?.createRoot;

    if (typeof createElement !== 'function' || typeof createRoot !== 'function') {
      return { error: 'could not load react through the dev server' };
    }

    // The selector chain the stylesheet expects.
    const host = document.createElement('div');
    host.className = 'video-js';
    host.innerHTML = '<div class="vjs-menu"><ul class="vjs-menu-content"></ul></div>';
    document.body.appendChild(host);

    const section = { authors: [{ name: 'A Reporter' }], role: null, organizationName: 'WDR' };
    const root = createRoot(host.querySelector('ul'));

    const read = () => {
      const button = host.querySelector('.c2pa-menu-section__header--collapsible');
      const panel = document.getElementById(button?.getAttribute('aria-controls') ?? '');
      return {
        tag: button?.tagName ?? null,
        ariaExpanded: button?.getAttribute('aria-expanded') ?? null,
        controls: Boolean(button?.getAttribute('aria-controls')),
        panelFound: panel !== null,
        visibility: panel ? getComputedStyle(panel).visibility : null,
      };
    };

    root.render(
      createElement(WorkSection, { section, title: 'Work', isExpanded: false, onToggle: () => {} }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const collapsed = read();

    root.render(
      createElement(WorkSection, { section, title: 'Work', isExpanded: true, onToggle: () => {} }),
    );
    // Longer than the 0.24s visibility delay on the collapse transition.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const expanded = read();

    root.unmount();
    host.remove();
    return { collapsed, expanded };
  }, BASE);

  if (result.error) {
    check(`disclosure scaffold: ${result.error}`, false);
  } else {
    check('the toggle is a button', result.collapsed.tag === 'BUTTON', String(result.collapsed.tag));
    check('it points at the panel it controls', result.collapsed.controls && result.collapsed.panelFound);
    check(
      'collapsed reports aria-expanded=false and is hidden from assistive technology',
      result.collapsed.ariaExpanded === 'false' && result.collapsed.visibility === 'hidden',
      `aria-expanded=${result.collapsed.ariaExpanded} visibility=${result.collapsed.visibility}`,
    );
    check(
      'expanded reports aria-expanded=true and is exposed',
      result.expanded.ariaExpanded === 'true' && result.expanded.visibility === 'visible',
      `aria-expanded=${result.expanded.ariaExpanded} visibility=${result.expanded.visibility}`,
    );
  }

  await sectionPage.close();
}

check('no page errors', pageErrors.length === 0, pageErrors.join('; '));

await browser.close();
console.log(failures === 0 ? '\nall keyboard checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

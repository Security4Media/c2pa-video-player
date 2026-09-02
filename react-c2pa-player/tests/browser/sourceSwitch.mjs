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
 * Does one source leave state behind for the next?
 *
 * Several things in this player are module singletons, because they are read
 * across a boundary video.js gives no seam through. That is a reasonable
 * trade-off and a documented one, but it means disposal has to be complete: a
 * value that outlives the player that wrote it is read by the next player as
 * though it were its own.
 *
 * The live timeline window is the case that prompted this. `C2paSeekBar` keys
 * both of its overrides on it being non-null, so a stale one makes an
 * unrelated bar report fully played and refuse to seek.
 *
 * Driven against the modules directly rather than by switching sources in the
 * app: the app path needs the live feed, which is intermittent here, and it
 * only ever exposed the leak for a few hundred milliseconds during which the
 * seek bar had no width. What matters is the contract, and the contract is
 * testable exactly.
 *
 *   npm run dev -- --port 5199
 *   npm run test:source-switch
 */

import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5199/server/';

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

console.log(`Source-switch state against ${BASE}\n`);
await page.goto(BASE, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (base) => {
  const prefix = new URL(base).pathname.replace(/\/$/, '');
  const [{ getTimelineFunctions }, liveWindow] = await Promise.all([
    import(`${prefix}/src/C2paPlayer-V2/C2paTimeline/C2paTimelineFunctions.ts`),
    import(`${prefix}/src/C2paPlayer-V2/C2paTimeline/liveWindowState.ts`),
  ]);

  const host = document.createElement('div');
  host.className = 'c2pa-timeline-host';
  document.body.appendChild(host);

  const ORIGIN = 1_788_374_000;
  const WINDOW = 300;
  const controlBar = { el: () => host };
  const videoPlayer = {
    currentTime: () => ORIGIN,
    duration: () => Number.POSITIVE_INFINITY,
  };

  const timeline = getTimelineFunctions();

  // A live render, which is what publishes the window.
  timeline.replaceC2PATimelineSegments(
    [
      {
        startTime: ORIGIN - 8,
        endTime: ORIGIN - 4,
        validationState: 'Valid',
      },
    ],
    videoPlayer,
    controlBar,
    true,
    WINDOW,
  );

  const afterLiveRender = liveWindow.getLiveTimelineWindow();

  // What the player does when a source goes away.
  timeline.disposeTimeline();
  const afterDispose = liveWindow.getLiveTimelineWindow();

  host.remove();

  return {
    published: afterLiveRender ? { size: Math.round(afterLiveRender.size) } : null,
    leftBehind: afterDispose ? { size: Math.round(afterDispose.size) } : null,
  };
}, BASE);

console.log(`  live render published: ${JSON.stringify(result.published)}`);
console.log(`  after disposeTimeline: ${JSON.stringify(result.leftBehind)}`);

check(
  'a live render publishes a window at all',
  result.published !== null && result.published.size === 300,
  JSON.stringify(result.published),
);
check(
  'disposing the timeline clears it, so the next source starts clean',
  result.leftBehind === null,
  JSON.stringify(result.leftBehind),
);

// And the consequence, stated directly: with no window, the seek bar falls
// through to video.js rather than pinning the cursor and refusing to seek.
const seekBar = await page.evaluate(async (base) => {
  const prefix = new URL(base).pathname.replace(/\/$/, '');
  const liveWindow = await import(`${prefix}/src/C2paPlayer-V2/C2paTimeline/liveWindowState.ts`);
  const before = liveWindow.getLiveTimelineWindow();
  liveWindow.setLiveTimelineWindow({ start: 0, size: 300 });
  const withWindow = liveWindow.getLiveTimelineWindow() !== null;
  liveWindow.setLiveTimelineWindow(null);
  const withoutWindow = liveWindow.getLiveTimelineWindow() === null;
  liveWindow.setLiveTimelineWindow(before);
  return { withWindow, withoutWindow };
}, BASE);

check(
  'the window is what the seek bar keys on, and it is settable both ways',
  seekBar.withWindow && seekBar.withoutWindow,
);

check('no page errors', pageErrors.length === 0, pageErrors.join('; '));

await browser.close();
console.log(failures === 0 ? '\nall source-switch checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

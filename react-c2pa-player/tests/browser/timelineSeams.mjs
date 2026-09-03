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
 * Whether a run of same-verdict segments reads as one stretch or as segments.
 *
 *   npm run dev
 *   npm run test:seams
 *
 * From pixels, because this is not visible in geometry. Adjacent segments abut
 * exactly in percentage terms, so every earlier check of this bar passed while
 * a light line sat on all 39 interior boundaries. The bar is screenshotted and
 * the PNG handed back to the page, so the browser decodes it - there is no
 * decoder in node_modules and this needs none.
 *
 * The run is injected rather than played, using positionTimelineSegment's own
 * arithmetic. Live DASH is where this shows, because dashSession leaves every
 * fragment as its own segment; the HLS fixtures merge contiguous same-verdict
 * regions and so cannot produce the case at all.
 *
 * Two findings this pins down, both of which contradicted a plausible guess:
 *
 *  - Settled segments have no seam. Chromium snaps a positioned element's
 *    background paint rect to whole device pixels, so the grey track does not
 *    bleed through a shared fractional edge. The first theory was that it did.
 *  - Provisional segments did, entirely because of their hatch: a gradient is
 *    positioned against its own element, so every segment restarted the
 *    pattern and put a crest on every boundary.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.C2PA_TEST_URL ?? 'http://localhost:5175/server/';
const FIXTURE =
  process.env.C2PA_TEST_TAMPERED_HLS ??
  `${BASE}hls-fixtures/tampered-segs-corrupt/master.m3u8`;

/** Contiguous fragments to lay across the bar. 39 interior boundaries. */
const FRAGMENTS = 40;
/** A full five-minute window at ~3.84s fragments, for the frame-cost check. */
const FULL_WINDOW = 78;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  // One screenshot pixel per CSS pixel, so the numbers below mean what they say.
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.log('   [pageerror]', e.message));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.fill('#mp4Url', FIXTURE);
await page.click('button:has-text("Load Video")');
await page.waitForSelector('video', { timeout: 30000 });
await page.evaluate(() => {
  document.querySelector('video').muted = true;
  return document.querySelector('video').play().catch(() => {});
});
await page.waitForTimeout(6000);

// Paused at zero, and scrolled into view. The white playhead handle reads as
// off-colour pixels wherever it sits, and a clip outside the viewport fails.
await page.evaluate(() => {
  const video = document.querySelector('video');
  video.pause();
  video.currentTime = 0;
  const player = document.querySelector('.video-js');
  player?.classList.remove('vjs-user-inactive');
  player?.classList.add('vjs-user-active');
  player?.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(600);

const layOut = (count, provisional) =>
  page.evaluate(
    ({ count, provisional }) => {
      const host = document.querySelector('.c2pa-timeline-host');
      const holder = document.querySelector('.vjs-progress-holder');

      if (!host || !holder) return null;

      host.querySelectorAll('.seekbar-play-c2pa').forEach((el) => el.remove());

      const colour = getComputedStyle(document.documentElement)
        .getPropertyValue('--c2pa-trusted')
        .trim();
      // positionTimelineSegment's arithmetic, over a window of exactly the run.
      const windowSize = count * 3.84;
      const toPercent = (time) => (time / windowSize) * 100;
      const holderRect = holder.getBoundingClientRect();
      const edges = [];

      for (let i = 0; i < count; i += 1) {
        const el = document.createElement('div');
        el.className = 'seekbar-play-c2pa';
        if (provisional) el.classList.add('seekbar-play-c2pa--provisional');
        el.dataset.startTime = String(i * 3.84);
        el.dataset.endTime = String((i + 1) * 3.84);
        el.dataset.verificationStatus = 'Trusted';
        el.style.backgroundColor = colour;
        el.style.left = `${toPercent(i * 3.84)}%`;
        el.style.width = `${toPercent(3.84)}%`;
        host.appendChild(el);
        edges.push(Math.round((el.getBoundingClientRect().left - holderRect.left) * 100) / 100);
      }

      return {
        colour,
        segmentWidth: Math.round((holderRect.width / count) * 100) / 100,
        attachment: getComputedStyle(host.querySelector('.seekbar-play-c2pa'))
          .backgroundAttachment,
        edges,
        clip: {
          x: Math.ceil(holderRect.left),
          y: Math.round(holderRect.top + holderRect.height / 2) - 1,
          width: Math.floor(holderRect.width) - 2,
          height: 3,
        },
      };
    },
    { count, provisional },
  );

async function readBar(setup) {
  const shot = await page.screenshot({ clip: setup.clip });

  return page.evaluate(
    async ({ dataUrl, width, height, edges }) => {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = dataUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const row = context.getImageData(0, Math.floor(height / 2), width, 1).data;
      const luma = [];

      for (let x = 0; x < width; x += 1) {
        luma.push(0.299 * row[x * 4] + 0.587 * row[x * 4 + 1] + 0.114 * row[x * 4 + 2]);
      }

      const boundary = [];
      const interior = [];

      for (let x = 2; x < width - 2; x += 1) {
        if (edges.some((e) => Math.abs(e - x) < 1.5)) boundary.push(luma[x]);
        else if (!edges.some((e) => Math.abs(e - x) < 3)) interior.push(luma[x]);
      }

      const stats = (list) => {
        const mean = list.reduce((a, b) => a + b, 0) / list.length;
        return {
          n: list.length,
          mean: Math.round(mean * 10) / 10,
          sd: Math.round(Math.sqrt(list.reduce((a, b) => a + (b - mean) ** 2, 0) / list.length) * 10) / 10,
        };
      };

      // The hatch's phase at each segment's left edge. One value repeated means
      // the pattern restarts per element; a spread means it runs through.
      const phases = {};
      for (const edge of edges) {
        const from = Math.ceil(edge);
        for (let x = from; x < Math.min(from + 8, width - 1); x += 1) {
          if (luma[x] >= luma[x - 1] && luma[x] > luma[x + 1] && luma[x] > 150) {
            phases[x - from] = (phases[x - from] ?? 0) + 1;
            break;
          }
        }
      }

      return {
        boundary: stats(boundary),
        interior: stats(interior),
        phases,
        distinctPhases: Object.keys(phases).length,
      };
    },
    {
      dataUrl: `data:image/png;base64,${shot.toString('base64')}`,
      width: setup.clip.width,
      height: setup.clip.height,
      edges: setup.edges,
    },
  );
}

console.log(`\nSegment seams against ${BASE}\n`);

// --- settled -------------------------------------------------------------
const settled = await layOut(FRAGMENTS, false);

if (!settled) {
  console.log('  could not find the timeline bar');
  await browser.close();
  process.exit(1);
}

const settledPixels = await readBar(settled);
console.log(
  `A run of ${FRAGMENTS} settled fragments, ${settled.segmentWidth}px each, in ${settled.colour}`,
);
console.log(`   boundary ${JSON.stringify(settledPixels.boundary)}`);
console.log(`   interior ${JSON.stringify(settledPixels.interior)}`);

check(
  'settled boundaries are a uniform colour, with no track bleeding through',
  settledPixels.boundary.sd < 1,
  `sd ${settledPixels.boundary.sd}`,
);
check(
  'and they match the segment interiors',
  Math.abs(settledPixels.boundary.mean - settledPixels.interior.mean) < 3,
  `${settledPixels.boundary.mean} vs ${settledPixels.interior.mean} luma`,
);

// --- provisional ---------------------------------------------------------
const provisional = await layOut(FRAGMENTS, true);
const provisionalPixels = await readBar(provisional);
console.log(`\nThe same run, provisional (hatched), attachment: ${provisional.attachment}`);
console.log(`   boundary ${JSON.stringify(provisionalPixels.boundary)}`);
console.log(`   interior ${JSON.stringify(provisionalPixels.interior)}`);
console.log(`   hatch phase per segment edge ${JSON.stringify(provisionalPixels.phases)}`);

check(
  'the hatch is anchored so it can run through a whole stretch',
  provisional.attachment === 'fixed',
  provisional.attachment,
);
check(
  'its pattern runs through the segments rather than restarting in each',
  provisionalPixels.distinctPhases >= 4,
  `${provisionalPixels.distinctPhases} distinct phases across ${FRAGMENTS} edges`,
);
check(
  'so no crest lands on every boundary',
  // Was 161.9 against an interior 156.2 before the fix: a light line every
  // 16px, which is what "you can see the edges" meant.
  Math.abs(provisionalPixels.boundary.mean - provisionalPixels.interior.mean) < 3,
  `${provisionalPixels.boundary.mean} vs ${provisionalPixels.interior.mean} luma`,
);

// --- the cost of that anchoring -----------------------------------------
const cost = await page.evaluate(
  async ({ count }) => {
    const host = document.querySelector('.c2pa-timeline-host');
    host.querySelectorAll('.seekbar-play-c2pa').forEach((el) => el.remove());

    const colour = getComputedStyle(document.documentElement)
      .getPropertyValue('--c2pa-trusted')
      .trim();
    const els = [];

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('div');
      el.className = 'seekbar-play-c2pa seekbar-play-c2pa--provisional';
      el.style.backgroundColor = colour;
      host.appendChild(el);
      els.push(el);
    }

    // What rollLiveWindow does: every segment's geometry, every frame.
    const frames = [];
    const started = performance.now();
    let last = started;

    await new Promise((resolve) => {
      const step = (now) => {
        frames.push(now - last);
        last = now;
        const origin = ((now - started) / 1000) * 0.05;

        els.forEach((el, i) => {
          el.style.left = `${Math.max(0, (i / count) * 100 - origin)}%`;
          el.style.width = `${(1 / count) * 100}%`;
        });

        if (now - started < 2000) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    const timings = frames.slice(2).sort((a, b) => a - b);

    return {
      fps: Math.round((timings.length / ((last - started) / 1000)) * 10) / 10,
      median: Math.round(timings[Math.floor(timings.length / 2)] * 100) / 100,
      worst: Math.round(timings[timings.length - 1] * 100) / 100,
      over20ms: timings.filter((t) => t > 20).length,
    };
  },
  { count: FULL_WINDOW },
);

console.log(`\nRolling a full ${FULL_WINDOW}-segment window with the hatch`);
console.log(`   ${JSON.stringify(cost)}`);

check('the roll still holds its frame rate', cost.fps >= 55, `${cost.fps}fps`);
check('with no long frames', cost.over20ms === 0, `${cost.over20ms} over 20ms`);

await browser.close();
console.log(failures === 0 ? '\nall seam checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);

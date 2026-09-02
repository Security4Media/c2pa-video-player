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

import { describe, expect, it } from 'vitest';
import { resolveSettledBefore, selectLiveRegions } from './liveReadState';
import type { SegmentVerdict } from './readRegionGate';
import { WatchedTimeline } from './watchedTimeline';

const verdict = (startTime: number, endTime: number): SegmentVerdict => ({
  startTime,
  endTime,
  validationState: 'Valid',
});

/** Plays from `from` to `to` in small steps, as the session samples it. */
function play(watched: WatchedTimeline, from: number, to: number, step = 0.25) {
  for (let t = from; t <= to + 1e-9; t += step) watched.observePlayhead(t, true);
}

const NOTHING_AGES = Number.NEGATIVE_INFINITY;

const describeRegions = (regions: ReturnType<typeof selectLiveRegions>) =>
  regions
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((r) => `${r.startTime}-${r.endTime}:${r.settled ? 'settled' : 'provisional'}`)
    .join(', ');

describe('selectLiveRegions', () => {
  it('marks a validated but unplayed segment provisional, not absent', () => {
    const watched = new WatchedTimeline();
    const regions = selectLiveRegions([verdict(0, 4)], watched, NOTHING_AGES);

    expect(describeRegions(regions)).toBe('0-4:provisional');
  });

  it('settles the part playback read and leaves the rest provisional', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 2);

    const regions = selectLiveRegions([verdict(0, 4)], watched, NOTHING_AGES);

    expect(describeRegions(regions)).toBe('0-2:settled, 2-4:provisional');
  });

  it('settles a segment that has fallen out of reach, though nobody watched it', () => {
    const watched = new WatchedTimeline();
    // The live edge is at 100 with a 30s DVR, so anything before 70 can never
    // be played and its provisional marking has nothing left to express.
    const settledBefore = resolveSettledBefore(100, 30);

    const regions = selectLiveRegions([verdict(40, 44), verdict(80, 84)], watched, settledBefore);

    expect(describeRegions(regions)).toBe('40-44:settled, 80-84:provisional');
  });

  it('splits a segment straddling the point where content falls out of reach', () => {
    const watched = new WatchedTimeline();
    const regions = selectLiveRegions([verdict(68, 72)], watched, resolveSettledBefore(100, 30));

    expect(describeRegions(regions)).toBe('68-70:settled, 70-72:provisional');
  });

  it('does not double-count a segment both read and aged out', () => {
    const watched = new WatchedTimeline();
    play(watched, 40, 44);

    const regions = selectLiveRegions([verdict(40, 44)], watched, resolveSettledBefore(100, 30));

    expect(describeRegions(regions)).toBe('40-44:settled');
  });

  it('keeps a mid-segment gap in the watched record visible', () => {
    const watched = new WatchedTimeline();
    play(watched, 0, 1);
    // A seek: the playhead jumps without playing, so 1-3 is never read.
    watched.observePlayhead(3, false);
    play(watched, 3, 4);

    const regions = selectLiveRegions([verdict(0, 4)], watched, NOTHING_AGES);

    expect(describeRegions(regions)).toBe('0-1:settled, 1-3:provisional, 3-4:settled');
  });

  it('collapses two verdicts covering the same stretch into one region', () => {
    // A live segment re-requested after a retry or a rendition change is
    // validated twice, and both verdicts describe the same range. Measured on
    // the live feed as two identical dimmed regions stacked on the bar.
    const regions = selectLiveRegions(
      [verdict(80, 84), verdict(80, 84)],
      new WatchedTimeline(),
      NOTHING_AGES,
    );

    expect(describeRegions(regions)).toBe('80-84:provisional');
  });

  it('shows the worse verdict where two overlapping ones disagree', () => {
    const good: SegmentVerdict = { startTime: 80, endTime: 88, validationState: 'Valid' };
    const bad: SegmentVerdict = { startTime: 84, endTime: 92, validationState: 'Invalid' };

    const regions = selectLiveRegions([good, bad], new WatchedTimeline(), NOTHING_AGES);
    const states = regions
      .slice()
      .sort((a, b) => a.startTime - b.startTime)
      .map((r) => `${r.startTime}-${r.endTime}:${r.validationState}`);

    // The disputed 84-88 must not be painted Valid: an Invalid verdict for a
    // stretch is not cancelled by a second verdict that liked it.
    expect(states).toEqual(['80-84:Valid', '84-92:Invalid']);
  });

  it('does not merge across a verdict change', () => {
    const regions = selectLiveRegions(
      [
        { startTime: 0, endTime: 4, validationState: 'Valid' },
        { startTime: 4, endTime: 8, validationState: 'Invalid' },
      ],
      new WatchedTimeline(),
      NOTHING_AGES,
    );

    expect(regions).toHaveLength(2);
  });

  it('carries the source verdict through, so its manifest can be read', () => {
    const source = verdict(0, 4);
    const regions = selectLiveRegions([source], new WatchedTimeline(), NOTHING_AGES);

    expect(regions).toHaveLength(1);
    expect(regions[0].source).toBe(source);
  });

  it('ignores verdicts with no usable bounds', () => {
    const watched = new WatchedTimeline();
    const regions = selectLiveRegions(
      [verdict(4, 4), verdict(Number.NaN, 4), verdict(0, Number.POSITIVE_INFINITY)],
      watched,
      NOTHING_AGES,
    );

    expect(regions).toHaveLength(0);
  });
});

describe('resolveSettledBefore', () => {
  it('is the live edge less the depth that can still be seeked', () => {
    expect(resolveSettledBefore(1_788_009_252, 30)).toBe(1_788_009_222);
  });

  it('settles nothing on age when there is nothing to go on', () => {
    // Better to leave the read record as the only rule than to settle a whole
    // stream because a number was missing.
    expect(resolveSettledBefore(Number.NEGATIVE_INFINITY, 30)).toBe(Number.NEGATIVE_INFINITY);
    expect(resolveSettledBefore(100, 0)).toBe(Number.NEGATIVE_INFINITY);
    expect(resolveSettledBefore(100, Number.NaN)).toBe(Number.NEGATIVE_INFINITY);
  });
});

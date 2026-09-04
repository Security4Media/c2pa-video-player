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
import type { Manifest } from '@contentauth/c2pa-web';
import type { C2PATimelineSegmentUpdate } from '@/lib/types/c2pa.types';
import { MIN_LIVE_WINDOW_SECONDS } from '@/lib/validation/policy/liveRetention';
import {
  getSegmentColor,
  getTimelineFunctions,
  getTimelineWindow,
  LIVE_WINDOW_SECONDS,
} from './C2paTimelineFunctions';

const COLORS = {
  trusted: 'GREEN',
  passed: 'BLUE',
  failed: 'RED',
  unknown: 'GREY',
};

/** What positionTimelineSegment does with a window, as a percentage of the bar. */
const place = (
  window: { start: number; size: number },
  startTime: number,
  endTime: number,
) => {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const toPercent = (time: number) => ((time - window.start) / window.size) * 100;
  const left = clamp(toPercent(startTime));

  return { left, width: clamp(toPercent(endTime)) - left };
};

describe('getTimelineWindow', () => {
  describe('on-demand', () => {
    it('spans the whole asset, which is what scaling from zero already did', () => {
      expect(getTimelineWindow(120, 30, 40, false)).toEqual({ start: 0, size: 120 });
    });

    it('falls back to the furthest point known when the duration is indefinite', () => {
      // Not flagged live, so behaviour is unchanged from before the window existed.
      expect(getTimelineWindow(Number.NaN, 30, 48, false)).toEqual({ start: 0, size: 48 });
      expect(getTimelineWindow(Number.POSITIVE_INFINITY, 30, 10, false)).toEqual({ start: 0, size: 30 });
    });

    it('never divides by zero on an empty asset', () => {
      expect(getTimelineWindow(0, 0, 0, false)).toEqual({ start: 0, size: 1 });
    });
  });

  describe('live', () => {
    const INF = Number.POSITIVE_INFINITY;

    it('is a fixed span, whatever history exists behind it', () => {
      // The scale must not depend on the data, or it changes under the viewer.
      const justJoined = getTimelineWindow(INF, 1_000_000, 1_000_004, true);
      const hoursIn = getTimelineWindow(INF, 1_009_000, 1_009_004, true);

      expect(justJoined.size).toBe(LIVE_WINDOW_SECONDS);
      expect(hoursIn.size).toBe(LIVE_WINDOW_SECONDS);
    });

    it('does not rescale across a gap in what is known', () => {
      // The reported bug. A 28s pause used to stretch the window from 60s to
      // 104s to span the gap, squashing the history that had been in the
      // right-hand 6% of the bar into the left-hand 3.7%. It read as a reset.
      const edge = 1_000_000;
      const beforePause = getTimelineWindow(INF, edge, edge, true);
      const afterRejoin = getTimelineWindow(INF, edge + 100, edge + 100, true);

      expect(afterRejoin.size).toBe(beforePause.size);
      // The history scrolls left by exactly the time that passed, no more.
      expect(afterRejoin.start - beforePause.start).toBe(100);
    });

    it('honours a configured retention', () => {
      const edge = 1_000_000;

      expect(getTimelineWindow(INF, edge, edge, true, 120)).toEqual({
        start: edge - 120,
        size: 120,
      });
    });

    it('spans the configured retention, not what the origin still holds', () => {
      // The bar is a record of what was validated, not of what can be seeked -
      // it stopped being the seek control. Five minutes of history is the point
      // of it, whatever the origin's 30-second DVR allows.
      const edge = 1_000_000;

      expect(getTimelineWindow(INF, edge, edge, true, 300).size).toBe(300);
    });

    it('always ends at the live edge, whichever side is further ahead', () => {
      expect(getTimelineWindow(Number.NaN, 500, 900, true).start).toBe(900 - LIVE_WINDOW_SECONDS);
      expect(getTimelineWindow(Number.NaN, 900, 500, true).start).toBe(900 - LIVE_WINDOW_SECONDS);
    });

    it('keeps the minimum window as the floor for the configurable value', () => {
      // Still meaningful: resolveLiveRetentionSeconds rejects anything narrower.
      expect(MIN_LIVE_WINDOW_SECONDS).toBeLessThan(LIVE_WINDOW_SECONDS);
    });
  });
});

describe('placing segments in the window', () => {
  // The regression this fixes. This origin's availabilityStartTime is 1970, so
  // currentTime arrives near 1.79e9; scaling that from zero put every segment
  // at left 100% with a width around 5e-8%, an invisible sliver.
  const EPOCH_EDGE = 1_788_292_531.15;
  const INF = Number.POSITIVE_INFINITY;

  it('gives the first epoch-timed live segment a real width', () => {
    const window = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true);
    const { left, width } = place(window, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    // 3.84s of the five-minute window: small, but thousands of times the
    // 5e-8% it used to be, and it sits at the live edge where it belongs.
    expect(width).toBeCloseTo((3.84 / LIVE_WINDOW_SECONDS) * 100, 4);
    expect(width).toBeGreaterThan(1);
    expect(left + width).toBeCloseTo(100, 5);
  });

  it('would have been invisible without the window', () => {
    // The old maths, kept as the thing being guarded against.
    const asBefore = place({ start: 0, size: EPOCH_EDGE }, EPOCH_EDGE - 3.84, EPOCH_EDGE);

    expect(asBefore.width).toBeLessThan(0.001);
  });

  it('keeps a segment the same width however long the session runs', () => {
    // A segment's width is a property of its duration, not of when it was
    // watched. It used to shrink as history accumulated, which meant the bar
    // never looked the same way twice.
    const early = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true);
    const later = getTimelineWindow(INF, EPOCH_EDGE + 3600, EPOCH_EDGE + 3600, true);

    expect(place(early, EPOCH_EDGE - 3.84, EPOCH_EDGE).width).toBeCloseTo(
      place(later, EPOCH_EDGE + 3596.16, EPOCH_EDGE + 3600).width,
      6,
    );
  });

  it('fills the bar when the whole window has been validated', () => {
    const window = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true);
    const whole = place(window, EPOCH_EDGE - LIVE_WINDOW_SECONDS, EPOCH_EDGE);

    expect(whole.left).toBeCloseTo(0, 5);
    expect(whole.width).toBeCloseTo(100, 5);
  });

  it('moves history left by the elapsed time, not by rescaling it', () => {
    // The reported bug, at the level the viewer sees it. Measured before the
    // fix: three regions sitting at 93.6-100% of a 60s window reappeared at
    // 0.0-3.7% of a 104s window after a 28s pause and rejoin - same content,
    // same times, squashed into a corner. It reads as a reset.
    const historyStart = EPOCH_EDGE - 3;
    const before = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true);
    const placedBefore = place(before, historyStart, EPOCH_EDGE);

    // Paused 28s, then rejoined the live edge - the playhead jumps 100s.
    const jumped = EPOCH_EDGE + 100;
    const after = getTimelineWindow(INF, jumped, jumped, true);
    const placedAfter = place(after, historyStart, EPOCH_EDGE);

    // Same width: the segment did not change duration.
    expect(placedAfter.width).toBeCloseTo(placedBefore.width, 6);
    // Moved left by exactly the time that passed, as a share of the window.
    expect(placedBefore.left - placedAfter.left).toBeCloseTo((100 / LIVE_WINDOW_SECONDS) * 100, 4);
    // And still on the bar, rather than crushed against its left edge.
    expect(placedAfter.left).toBeGreaterThan(50);
  });

  it('drops a segment that has fallen out of the back of the window', () => {
    const window = getTimelineWindow(INF, EPOCH_EDGE, EPOCH_EDGE, true);
    const stale = place(window, window.start - 120, window.start - 116);

    expect(stale.width).toBe(0);
  });

  it('places on-demand segments exactly as before', () => {
    const window = getTimelineWindow(100, 50, 60, false);

    expect(place(window, 0, 25)).toEqual({ left: 0, width: 25 });
    expect(place(window, 25, 50)).toEqual({ left: 25, width: 25 });
    expect(place(window, 75, 100)).toEqual({ left: 75, width: 25 });
  });
});

describe('getSegmentColor', () => {
  it('is red for Invalid regardless of an issuer colour', () => {
    expect(getSegmentColor('Invalid', false, COLORS, 'ISSUER')).toBe(COLORS.failed);
    expect(getSegmentColor('false', false, COLORS, 'ISSUER')).toBe(COLORS.failed);
    expect(getSegmentColor('Valid', true, COLORS, 'ISSUER')).toBe(COLORS.failed);
  });

  it('is grey for Unknown regardless of an issuer colour', () => {
    expect(getSegmentColor('unknown', false, COLORS, 'ISSUER')).toBe(COLORS.unknown);
  });

  it('falls back to the shared verdict colour when no issuer colour applies', () => {
    expect(getSegmentColor('Trusted', false, COLORS, null)).toBe(COLORS.trusted);
    expect(getSegmentColor('Valid', false, COLORS, null)).toBe(COLORS.passed);
  });

  it('uses the issuer colour for a Trusted or Valid segment when one is given', () => {
    expect(getSegmentColor('Trusted', false, COLORS, 'ISSUER')).toBe('ISSUER');
    expect(getSegmentColor('Valid', false, COLORS, 'ISSUER')).toBe('ISSUER');
  });
});

describe('getIssuerAccentColor (via getTimelineFunctions)', () => {
  const PALETTE = ['blue-1', 'blue-2'] as const;

  function manifestWithIssuer(issuer: string): Manifest {
    return { label: 'urn:test', signature_info: { issuer } } as unknown as Manifest;
  }

  function segment(overrides: Partial<C2PATimelineSegmentUpdate> = {}): C2PATimelineSegmentUpdate {
    return {
      startTime: 0,
      endTime: 4,
      validationState: 'Valid',
      ...overrides,
    } as C2PATimelineSegmentUpdate;
  }

  it('is null with no segment', () => {
    const { getIssuerAccentColor } = getTimelineFunctions();

    expect(getIssuerAccentColor(null, PALETTE)).toBeNull();
  });

  it('is null for Invalid and Unknown, even when an issuer is resolvable', () => {
    const { getIssuerAccentColor } = getTimelineFunctions();
    const withIssuer = {
      kind: 'single-manifest' as const,
      manifest: manifestWithIssuer('Westdeutscher Rundfunk Intermediate'),
      manifests: {},
      validationState: 'Valid' as const,
      validationErrors: [],
    };

    expect(
      getIssuerAccentColor(segment({ validationState: 'Invalid', manifestRef: withIssuer }), PALETTE),
    ).toBeNull();
    expect(
      getIssuerAccentColor(segment({ validationState: 'Unknown', manifestRef: withIssuer }), PALETTE),
    ).toBeNull();
  });

  it('is null for a Valid segment with no resolvable issuer', () => {
    const { getIssuerAccentColor } = getTimelineFunctions();

    expect(getIssuerAccentColor(segment(), PALETTE)).toBeNull();
    expect(getIssuerAccentColor(segment({ manifestRef: { kind: 'none' } }), PALETTE)).toBeNull();
  });

  it('assigns issuers a colour in first-seen order and stays stable for repeats', () => {
    const { getIssuerAccentColor } = getTimelineFunctions();
    const ref = (issuer: string) => ({
      kind: 'single-manifest' as const,
      manifest: manifestWithIssuer(issuer),
      manifests: {},
      validationState: 'Valid' as const,
      validationErrors: [],
    });

    const wdr = segment({ manifestRef: ref('Westdeutscher Rundfunk Intermediate') });
    const unified = segment({ manifestRef: ref('Unified Tutorial Intermediate') });

    expect(getIssuerAccentColor(wdr, PALETTE)).toBe('blue-1');
    expect(getIssuerAccentColor(unified, PALETTE)).toBe('blue-2');
    // Same issuer again, even though it was not the most recently seen one.
    expect(getIssuerAccentColor(wdr, PALETTE)).toBe('blue-1');
  });

  it('agrees on a colour whether asked from the timeline or the label', () => {
    // Both the per-segment render path and main.ts's label logic call this
    // same exposed function against the same assigner - this is the reason
    // it is exposed at all, rather than each caller keeping its own map.
    const { getIssuerAccentColor } = getTimelineFunctions();
    const ref = {
      kind: 'single-manifest' as const,
      manifest: manifestWithIssuer('Unified Tutorial Intermediate'),
      manifests: {},
      validationState: 'Trusted' as const,
      validationErrors: [],
    };
    const trusted = segment({ validationState: 'Trusted', manifestRef: ref });

    const fromTimeline = getIssuerAccentColor(trusted, PALETTE);
    const fromLabel = getIssuerAccentColor(trusted, PALETTE);

    expect(fromTimeline).toBe(fromLabel);
    expect(fromTimeline).toBe('blue-1');
  });
});

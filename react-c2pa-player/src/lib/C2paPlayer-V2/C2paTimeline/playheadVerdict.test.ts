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
 * Generalises the predicate that until now only existed inside a test:
 * `dashSession.test.ts` wrote `(t) => segments.filter((x) => t >= x.startTime &&
 * t < x.endTime)` inline. The two things it has to add over that are a
 * tolerance at the playhead and the extent of an invalid run.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerValidationState, ValidationTimelineSegment } from '@/lib/validation';
import { selectPlayheadVerdict } from './playheadVerdict';

const segment = (
  startTime: number,
  endTime: number,
  validationState: PlayerValidationState = 'Valid',
  extra: Partial<ValidationTimelineSegment> = {},
): ValidationTimelineSegment => ({ startTime, endTime, validationState, ...extra });

/** The ordinary fragmented case: a timeline of its own, manifest intact. */
const at = (
  segments: readonly ValidationTimelineSegment[],
  time: number,
  overrides: Partial<Parameters<typeof selectPlayheadVerdict>[0]> = {},
) =>
  selectPlayheadVerdict({
    segments,
    time,
    ownsTimeline: true,
    wholeAssetInvalid: false,
    fallbackState: null,
    ...overrides,
  });

describe('finding the verdict at the playhead', () => {
  it('reports the segment covering it', () => {
    const result = at([segment(0, 4, 'Trusted'), segment(4, 8, 'Invalid')], 5);

    expect(result.state).toBe('Invalid');
    expect(result.segment).toMatchObject({ startTime: 4, endTime: 8 });
    expect(result.reason).toBe('covering');
  });

  it('still answers when the newest region ends exactly at the playhead', () => {
    // The case the tolerance exists for, and the one that would otherwise make
    // the label impossible on HLS. `selectReadRegions` clips verdicts against
    // the watched record, which extends only as far as the last playing sample,
    // so at the playhead the newest region's end *is* the playhead.
    const result = at([segment(0, 10, 'Trusted')], 10);

    expect(result.state).toBe('Trusted');
    expect(result.reason).toBe('at-boundary');
  });

  it('holds that answer while paused just past the end', () => {
    expect(at([segment(0, 10, 'Trusted')], 10.4).state).toBe('Trusted');
  });

  it('lets go once the playhead is genuinely past it', () => {
    expect(at([segment(0, 10, 'Trusted')], 10.6).state).toBeNull();
  });

  it('does not fall back to the newest verdict past the end of the timeline', () => {
    // Which is exactly what the DASH runtime's own lookup does
    // (dashBridgeRuntime returns the last result for any later time). Copying
    // it would leave a red label accusing content nothing had examined after a
    // forward seek.
    const result = at([segment(0, 4, 'Invalid')], 400);

    expect(result.state).toBeNull();
    expect(result.reason).toBe('no-segment');
  });

  it('reports nothing rather than Unknown when no segment covers the moment', () => {
    // The distinction the label turns on: null is "not checked yet" and shows
    // nothing; 'Unknown' is "checked, nothing found" and shows a grey label.
    expect(at([], 5).state).toBeNull();
    expect(at([segment(0, 4, 'Unknown')], 2).state).toBe('Unknown');
  });

  it('treats a segment awaiting its verdict as no verdict', () => {
    const result = at([segment(0, 4, 'Unknown', { pending: true })], 2);

    expect(result.state).toBeNull();
    expect(result.reason).toBe('segment-pending');
  });

  it('prefers a decided segment over a pending one covering the same moment', () => {
    expect(at([segment(0, 4, 'Unknown', { pending: true }), segment(0, 4, 'Trusted')], 2).state).toBe(
      'Trusted',
    );
  });

  it('ignores segments with unusable bounds', () => {
    expect(at([segment(Number.NaN, 4), segment(8, 4)], 2).state).toBeNull();
  });

  it('reports nothing for a playhead it cannot read', () => {
    expect(at([segment(0, 4, 'Trusted')], Number.NaN).reason).toBe('unusable-time');
  });
});

describe('where two verdicts cover one moment', () => {
  it('shows the worse of them, so the label is never greener than the bar', () => {
    expect(at([segment(0, 8, 'Trusted'), segment(4, 12, 'Invalid')], 5).state).toBe('Invalid');
    expect(at([segment(0, 8, 'Invalid'), segment(4, 12, 'Trusted')], 5).state).toBe('Invalid');
  });

  it('prefers the later start among equally bad ones, as the most recent', () => {
    const result = at([segment(0, 8, 'Valid'), segment(4, 12, 'Valid')], 5);

    expect(result.segment).toMatchObject({ startTime: 4 });
  });
});

describe('the extent of an invalid run', () => {
  it('is the segment itself when the engine merged the run', () => {
    // HLS shape: the projector merges contiguous same-verdict regions, so one
    // stretch of tampering is one segment.
    expect(at([segment(0, 4, 'Trusted'), segment(4, 36, 'Invalid')], 20).invalidRunStart).toBe(4);
  });

  it('walks back across neighbours when the engine did not merge', () => {
    // DASH shape: the session leaves segments unmerged so each fragment keeps
    // its own metadata, so one stretch of tampering is a row of segments. The
    // run's identity is its start, and it has to be found, not read.
    const segments = [
      segment(0, 4, 'Trusted'),
      segment(4, 8, 'Invalid'),
      segment(8, 12, 'Invalid'),
      segment(12, 16, 'Invalid'),
      segment(16, 20, 'Invalid'),
    ];

    expect(at(segments, 18).invalidRunStart).toBe(4);
    expect(at(segments, 6).invalidRunStart).toBe(4);
  });

  it('is not split by a sub-second gap between two invalid segments', () => {
    // Fragment bounds come from media timing, so a fraction of a second between
    // two of them is a rounding artefact, not a return to good content. Reading
    // it as a return would ask the viewer twice about one episode.
    const segments = [segment(4, 8, 'Invalid'), segment(8.2, 12, 'Invalid')];

    expect(at(segments, 10).invalidRunStart).toBe(4);
  });

  it('is split by good content between two invalid stretches', () => {
    const segments = [
      segment(0, 4, 'Invalid'),
      segment(4, 8, 'Trusted'),
      segment(8, 12, 'Invalid'),
    ];

    expect(at(segments, 2).invalidRunStart).toBe(0);
    expect(at(segments, 10).invalidRunStart).toBe(8);
  });

  it('is null when the moment is not invalid', () => {
    expect(at([segment(0, 4, 'Trusted')], 2).invalidRunStart).toBeNull();
    expect(at([segment(0, 4, 'Unknown')], 2).invalidRunStart).toBeNull();
  });
});

describe('sources with no timeline of their own', () => {
  it('answers a condemned asset before any segment exists', () => {
    const result = at([], 0, { wholeAssetInvalid: true });

    expect(result.state).toBe('Invalid');
    expect(result.invalidRunStart).toBe(Number.NEGATIVE_INFINITY);
    expect(result.reason).toBe('whole-asset-invalid');
  });

  it('condemns every moment of it, not just the start', () => {
    // One run with no beginning, which is what makes the monolithic case
    // collapse to "ask once" with no special branch in the gate.
    expect(at([], 900, { wholeAssetInvalid: true }).invalidRunStart).toBe(
      Number.NEGATIVE_INFINITY,
    );
  });

  it('uses the whole-asset verdict for a monolithic file', () => {
    const result = at([], 12, { ownsTimeline: false, fallbackState: 'Trusted' });

    expect(result.state).toBe('Trusted');
    expect(result.reason).toBe('no-timeline');
    expect(result.invalidRunStart).toBeNull();
  });

  it('gives a monolithic invalid verdict the same single run', () => {
    expect(
      at([], 12, { ownsTimeline: false, fallbackState: 'Invalid' }).invalidRunStart,
    ).toBe(Number.NEGATIVE_INFINITY);
  });

  it('reports nothing when a monolithic source has no verdict yet', () => {
    expect(at([], 0, { ownsTimeline: false, fallbackState: null }).state).toBeNull();
  });
});

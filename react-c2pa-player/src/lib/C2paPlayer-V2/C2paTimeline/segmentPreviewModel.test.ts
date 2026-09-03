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
import { findGapAtFraction, findSegmentAtFraction } from './C2paTimelinePreview';
import {
  buildSegmentPreview,
  buildUnverifiedPreview,
  describeFailureCode,
  formatSegmentRange,
} from './segmentPreviewModel';

/**
 * A manifest carrying `cawg.metadata` *referenced by* `cawg.identity`, which is
 * the shape the shared selector requires and the shape the real live streams
 * were observed to have (`signer_payload.referenced_assertions` pointing at
 * `self#jumbf=c2pa.assertions/cawg.metadata`).
 */
function manifestWithDublinCore(fields: Record<string, string>): Manifest {
  return {
    label: 'urn:test',
    assertions: [
      {
        label: 'cawg.identity',
        data: {
          signer_payload: {
            sig_type: 'cawg.x509.cose',
            referenced_assertions: [
              { url: 'self#jumbf=c2pa.assertions/c2pa.hash.bmff.v3' },
              { url: 'self#jumbf=c2pa.assertions/cawg.metadata' },
            ],
          },
        },
      },
      {
        label: 'cawg.metadata',
        data: { '@context': { dc: 'http://purl.org/dc/elements/1.1/' }, ...fields },
      },
    ],
  } as unknown as Manifest;
}

function segment(overrides: Partial<C2PATimelineSegmentUpdate> = {}): C2PATimelineSegmentUpdate {
  return {
    startTime: 12,
    endTime: 16,
    validationState: 'Valid',
    ...overrides,
  } as C2PATimelineSegmentUpdate;
}

describe('formatSegmentRange', () => {
  it('writes a VOD segment as an offset from the start', () => {
    expect(formatSegmentRange(12, 16)).toBe('00:12 – 00:16');
    expect(formatSegmentRange(605, 613)).toBe('10:05 – 10:13');
  });

  it('writes an epoch-based live segment as a time of day', () => {
    // A live DASH period with availabilityStartTime=1970 puts segment times in
    // the 1.79e9 range; as an offset that reads "29800154:12".
    const range = formatSegmentRange(1_788_009_252, 1_788_009_256);

    // Not pinned to a locale's exact wording (node's default may add AM/PM);
    // what matters is that it reads as a clock and not as an offset.
    expect(range).not.toContain('29800');
    expect(range).toMatch(/\d{1,2}:\d{2}:\d{2}.* – .*\d{1,2}:\d{2}:\d{2}/);
  });

  it('does not mistake a long asset for an epoch', () => {
    // Six hours in - the longest thing anyone would plausibly open.
    expect(formatSegmentRange(21_600, 21_604)).toBe('360:00 – 360:04');
  });

  it('says so rather than inventing a range when times are not finite', () => {
    expect(formatSegmentRange(Number.NaN, 4)).toBe('unknown');
    expect(formatSegmentRange(0, Number.POSITIVE_INFINITY)).toBe('unknown');
  });
});

describe('describeFailureCode', () => {
  it('reads the codes these engines actually emit', () => {
    expect(describeFailureCode('assertion.bmffHash.mismatch')).toContain('does not match');
    expect(describeFailureCode('signingCredential.untrusted')).toContain('trust list');
  });

  it('returns null for an unknown code rather than guessing', () => {
    expect(describeFailureCode('some.future.code')).toBeNull();
  });
});

describe('buildSegmentPreview', () => {
  it('shows Dublin Core from the segment’s own manifest', () => {
    const preview = buildSegmentPreview(
      segment({
        manifestRef: {
          kind: 'single-manifest',
          manifest: manifestWithDublinCore({
            'dc:title': 'WDR C2PA Live Demo IBC 2026',
            'dc:publisher': 'Westdeutscher Rundfunk (c) 2026',
            'dc:rights': 'Demo content, WDR Live Feed',
          }),
          manifests: {},
          validationState: 'Valid',
          validationErrors: [],
        },
      }),
      'hls-fragmented-fmp4',
    );

    expect(preview.metadata).toEqual({
      title: 'WDR C2PA Live Demo IBC 2026',
      publisher: 'Westdeutscher Rundfunk (c) 2026',
      rights: 'Demo content, WDR Live Feed',
    });
    expect(preview.reason).toBeNull();
  });

  it('marks DASH metadata unverified, because nothing checked who signed it', () => {
    const ref = {
      kind: 'single-manifest' as const,
      manifest: manifestWithDublinCore({ 'dc:title': 'CBC News Network (CMAF)' }),
      manifests: {},
      validationState: 'Valid' as const,
      validationErrors: [],
    };

    expect(buildSegmentPreview(segment({ manifestRef: ref }), 'dash-fragmented-fmp4').metadataVerified).toBe(
      false,
    );
    // Same manifest, an engine that does check: verified.
    expect(buildSegmentPreview(segment({ manifestRef: ref }), 'hls-fragmented-fmp4').metadataVerified).toBe(
      true,
    );
  });

  it('never claims verified when there is no metadata to verify', () => {
    expect(buildSegmentPreview(segment(), 'hls-fragmented-fmp4').metadataVerified).toBe(false);
  });

  it('explains a failed fragment in a sentence, and shows nothing else', () => {
    const preview = buildSegmentPreview(
      segment({
        validationState: 'Invalid',
        manifestRef: {
          kind: 'single-manifest',
          manifest: manifestWithDublinCore({ 'dc:title': 'Tampered' }),
          manifests: {},
          validationState: 'Invalid',
          validationErrors: [{ code: 'assertion.bmffHash.mismatch' }],
        },
      }),
      'hls-fragmented-fmp4',
    );

    expect(preview.reason).toContain('does not match the hash');
    // The declared title of a fragment that failed its own integrity check is
    // exactly the claim that cannot be relied on, so it is not shown beside
    // the failure.
    expect(preview.metadata).toBeNull();
    expect(preview.metadataVerified).toBe(false);
  });

  it('falls back to the integrity status when there is no code to read', () => {
    const preview = buildSegmentPreview(
      segment({
        validationState: 'Invalid',
        manifestRef: { kind: 'integrity-only', integrityStatus: 'replayed' },
      }),
      'dash-fragmented-fmp4',
    );

    expect(preview.reason).toContain('repeats one already seen');
  });

  it('still states that a fragment failed when its code has no reading', () => {
    // The raw code is no longer shown, so silence here would leave a red block
    // with a time range and no statement of what happened.
    const preview = buildSegmentPreview(
      segment({
        validationState: 'Invalid',
        manifestRef: {
          kind: 'integrity-only',
          integrityStatus: 'warning',
          errorCodes: ['livevideo.something.new'],
        },
      }),
      'dash-fragmented-fmp4',
    );

    expect(preview.reason).toBe('This fragment failed its integrity check.');
  });

  it('does not report a neighbour’s failure on a segment that passed', () => {
    // HLS shares one manifest across every fragment, so a Trusted region is
    // handed the same reference as the fragment that failed. Its own verdict is
    // what decides whether there is anything to report.
    const shared = {
      kind: 'single-manifest' as const,
      manifest: manifestWithDublinCore({ 'dc:title': 'Shared across fragments' }),
      manifests: {},
      validationState: 'Invalid' as const,
      validationErrors: [{ code: 'assertion.bmffHash.mismatch' }],
    };

    const trusted = buildSegmentPreview(
      segment({ validationState: 'Trusted', manifestRef: shared }),
      'hls-fragmented-fmp4',
    );
    expect(trusted.reason).toBeNull();
    // The metadata is genuinely shared, so it still shows.
    expect(trusted.metadata?.title).toBe('Shared across fragments');

    // The fragment that actually failed still says so.
    const invalid = buildSegmentPreview(
      segment({ validationState: 'Invalid', manifestRef: shared }),
      'hls-fragmented-fmp4',
    );
    expect(invalid.reason).toContain('does not match the hash');
  });
});

describe('an unverified segment', () => {
  // Grey is the one colour on the bar that carries no self-evident meaning, so
  // every one of these has to come back with a sentence.
  it('reads as Unknown, the same word the bar’s grey means elsewhere', () => {
    expect(buildSegmentPreview(segment({ validationState: 'Unknown' }), 'dash-fragmented-fmp4'))
      .toMatchObject({ validationState: 'Unknown' });
  });

  it('reads as Unknown while still awaiting a verdict, not as a third state', () => {
    // It is grey on the bar either way, and two words for one colour is one
    // more than a viewer can act on.
    const preview = buildSegmentPreview(segment({ pending: true }), 'dash-fragmented-fmp4');

    expect(preview.validationState).toBe('Unknown');
    expect(preview.reason).toBe('No verdict has arrived for this fragment yet.');
  });

  it('says so when it was never played and has gone out of reach', () => {
    const preview = buildSegmentPreview(
      segment({ validationState: 'Unknown', unplayed: true }),
      'dash-fragmented-fmp4',
    );

    expect(preview.reason).toBe(
      'This fragment was never played, so this player did not verify it, and it is now too far in the past to reach.',
    );
  });

  it('keeps what the engine found alongside the never-played fact', () => {
    // Both are true and they are different claims: credentials that were
    // missing is a stronger statement than content nobody watched.
    const preview = buildSegmentPreview(
      segment({
        validationState: 'Unknown',
        unplayed: true,
        manifestRef: { kind: 'integrity-only', integrityStatus: 'missing' },
      }),
      'dash-fragmented-fmp4',
    );

    expect(preview.reason).toContain('No C2PA data was found');
    expect(preview.reason).toContain('never played');
  });

  it('falls back to a general sentence rather than none', () => {
    expect(
      buildSegmentPreview(segment({ validationState: 'Unknown' }), 'dash-fragmented-fmp4').reason,
    ).toBe('No verified content credentials were found for this fragment.');
  });

  it('still shows the metadata it has, marked unverified', () => {
    // Credentials present but unchecked is worth showing, and the caveat is
    // what keeps it honest.
    const preview = buildSegmentPreview(
      segment({
        validationState: 'Unknown',
        manifestRef: {
          kind: 'single-manifest',
          manifest: manifestWithDublinCore({ 'dc:title': 'Unchecked but declared' }),
          manifests: {},
          validationState: 'Unknown',
          validationErrors: [],
        },
      }),
      'dash-fragmented-fmp4',
    );

    expect(preview.metadata?.title).toBe('Unchecked but declared');
    expect(preview.metadataVerified).toBe(false);
  });
});

describe('an uncovered stretch of the bar', () => {
  // Grey is the track's own colour, so there is no element to hover. This used
  // to report nothing at all, which on a live bar is most of the width.
  const EPOCH = 1_788_374_000;

  it('says nothing was verified there', () => {
    const preview = buildUnverifiedPreview(EPOCH, EPOCH + 60, false);

    expect(preview.validationState).toBe('Unknown');
    expect(preview.reason).toBe('No content credentials were verified for this moment.');
    expect(preview.metadata).toBeNull();
  });

  it('says which moment it means', () => {
    // The whole point of showing it: a viewer needs to know what part of the
    // broadcast has no provenance, not merely that some part does not.
    expect(buildUnverifiedPreview(EPOCH, EPOCH + 60, false).timeRange).toContain('–');
    expect(buildUnverifiedPreview(12, 20, false).timeRange).toBe('00:12 – 00:20');
  });

  it('says "not yet" for the sliver at the live edge', () => {
    // The right-hand end of the bar is normally uncovered by a second or two,
    // because the window's edge advances on a clock and coasts slightly past
    // the newest verdict so the bar can roll. Telling someone content one
    // second old was never verified would be wrong.
    expect(buildUnverifiedPreview(EPOCH, EPOCH + 2, true).reason).toContain('yet');
  });

  it('does not say "not yet" of a wide gap at the edge', () => {
    // Validation has actually stopped, which is a different statement.
    expect(buildUnverifiedPreview(EPOCH, EPOCH + 120, true).reason).toBe(
      'No content credentials were verified for this moment.',
    );
  });
});

describe('findGapAtFraction', () => {
  const build = (left: number, width: number) =>
    ({ style: { left: `${left}%`, width: `${width}%` } }) as unknown as HTMLElement;

  it('finds a gap between two segments', () => {
    const segments = [build(0, 20), build(60, 40)];

    expect(findGapAtFraction(segments, 0.4)).toEqual({
      leftPercent: 20,
      rightPercent: 60,
      atLeadingEdge: false,
    });
  });

  it('finds the gap before the first segment', () => {
    expect(findGapAtFraction([build(30, 70)], 0.1)).toEqual({
      leftPercent: 0,
      rightPercent: 30,
      atLeadingEdge: false,
    });
  });

  it('marks the trailing gap as the live edge', () => {
    expect(findGapAtFraction([build(0, 95)], 0.98)).toEqual({
      leftPercent: 95,
      rightPercent: 100,
      atLeadingEdge: true,
    });
  });

  it('does not call an empty bar the live edge', () => {
    // Before the first verdict the whole width is one gap. Calling five
    // minutes of history "still arriving" would be wrong.
    expect(findGapAtFraction([], 0.5)).toEqual({
      leftPercent: 0,
      rightPercent: 100,
      atLeadingEdge: false,
    });
  });

  it('returns nothing when a segment covers the pointer', () => {
    // The caller's cue that this is a segment hover, not a gap hover.
    expect(findGapAtFraction([build(0, 100)], 0.5)).toBeNull();
    expect(findGapAtFraction([build(0, 40), build(40, 60)], 0.5)).toBeNull();
  });

  it('ignores zero-width segments, which cover nothing', () => {
    expect(findGapAtFraction([build(50, 0)], 0.5)).toMatchObject({ leftPercent: 0 });
  });

  it('handles overlapping segments without reporting a gap inside them', () => {
    expect(findGapAtFraction([build(0, 60), build(30, 40)], 0.5)).toBeNull();
    expect(findGapAtFraction([build(0, 60), build(30, 40)], 0.8)).toMatchObject({
      leftPercent: 70,
      atLeadingEdge: true,
    });
  });

  it('rejects a pointer outside the bar', () => {
    expect(findGapAtFraction([], -0.1)).toBeNull();
    expect(findGapAtFraction([], 1.2)).toBeNull();
  });
});

describe('findSegmentAtFraction', () => {
  // The unit suite runs in node, and the function reads nothing but the two
  // inline percentages - so a stub of exactly that is both sufficient and a
  // more honest statement of the dependency than a real element would be.
  const build = (left: number, width: number) =>
    ({ style: { left: `${left}%`, width: `${width}%` } }) as unknown as HTMLElement;

  it('finds the segment covering the pointer', () => {
    const a = build(0, 25);
    const b = build(25, 25);
    const c = build(50, 50);

    expect(findSegmentAtFraction([a, b, c], 0.1)).toBe(a);
    expect(findSegmentAtFraction([a, b, c], 0.3)).toBe(b);
    expect(findSegmentAtFraction([a, b, c], 0.99)).toBe(c);
  });

  it('resolves both ends of the bar', () => {
    const only = build(0, 100);

    expect(findSegmentAtFraction([only], 0)).toBe(only);
    expect(findSegmentAtFraction([only], 1)).toBe(only);
  });

  it('returns nothing over a grey gap, so the preview hides instead of lying', () => {
    const before = build(0, 20);
    const after = build(60, 40);

    expect(findSegmentAtFraction([before, after], 0.4)).toBeNull();
  });

  it('ignores a pointer outside the bar', () => {
    const only = build(0, 100);

    expect(findSegmentAtFraction([only], -0.2)).toBeNull();
    expect(findSegmentAtFraction([only], 1.4)).toBeNull();
    expect(findSegmentAtFraction([only], Number.NaN)).toBeNull();
  });

  it('prefers the narrower segment where two overlap on a rounded edge', () => {
    // Percentages are computed per segment and rounded, so neighbours can
    // overlap by a hair. Picking the wider one would show the pointer's
    // neighbour rather than the segment it is actually over.
    const wide = build(0, 50.0001);
    const narrow = build(50, 4);

    expect(findSegmentAtFraction([wide, narrow], 0.5)).toBe(narrow);
  });

  it('skips zero-width segments, which cover no pixel to hover', () => {
    const empty = build(30, 0);
    const real = build(0, 100);

    expect(findSegmentAtFraction([empty, real], 0.3)).toBe(real);
  });
});

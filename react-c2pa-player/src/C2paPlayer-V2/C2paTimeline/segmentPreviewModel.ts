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
 * What the timeline's hover preview says about one segment.
 *
 * Kept apart from the DOM so the decisions - which failure a viewer is told
 * about, whether metadata may be presented as verified, how a live segment's
 * time is written - are testable without a browser. The rendering half is
 * C2paTimelinePreview.ts.
 */

import { readStoreEvidence } from '@/validation/evidence';
import { getActiveManifest, verifiesCawgIdentity } from '@/validation/rules';
import type { AdapterKind, ManifestSource } from '@/validation';
import { selectDublinCoreMetadata } from '../C2paMenu/manifestSelectors/dublinCoreSelectors';
import type { C2PATimelineSegmentUpdate } from '@/types/c2pa.types';

export interface SegmentPreviewMetadata {
  title: string | null;
  publisher: string | null;
  rights: string | null;
}

export interface SegmentPreview {
  /** Already formatted, because how a time reads depends on live-ness. */
  timeRange: string;
  validationState: string;
  /** Dublin Core from the segment's own `cawg.metadata`, when it has one. */
  metadata: SegmentPreviewMetadata | null;
  /**
   * Whether anything actually checked the identity that vouches for
   * `metadata`. False means "shown, but nobody verified it".
   */
  metadataVerified: boolean;
  /** One sentence a viewer can act on, when the segment failed. */
  reason: string | null;
  /** The raw codes behind `reason`, so nothing is hidden behind the wording. */
  codes: string[];
}

/**
 * Times above this are read as a Unix epoch rather than an offset into the
 * asset.
 *
 * Live DASH periods commonly set `availabilityStartTime` to 1970, which puts
 * `currentTime` near 1.79e9 - so a segment's "start time" is a wall-clock
 * instant, and formatting it as an offset gives "29800154:12". Three years of
 * media (about 9.5e7 seconds) is far longer than any asset this player will
 * open and far shorter than any epoch timestamp, so the gap between the two
 * interpretations is not close.
 */
const EPOCH_THRESHOLD_SECONDS = 1e8;

function formatOffset(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function formatWallClock(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Writes a segment's extent the way it will be read.
 *
 * For a live stream that means the time of day it went out, which is what a
 * viewer or an editor actually wants to know about a moment in a broadcast; for
 * VOD, an offset from the start.
 */
export function formatSegmentRange(startTime: number, endTime: number): string {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return 'unknown';
  }

  if (startTime >= EPOCH_THRESHOLD_SECONDS) {
    return `${formatWallClock(startTime)} – ${formatWallClock(endTime)}`;
  }

  return `${formatOffset(startTime)} – ${formatOffset(endTime)}`;
}

/**
 * Plain-language readings of the failure codes these engines actually emit.
 *
 * Deliberately not exhaustive, and `null` for anything unlisted: inventing a
 * confident sentence for a code nobody has seen would be worse than showing the
 * code itself, which the preview does alongside this in every case.
 */
const FAILURE_SENTENCES: Record<string, string> = {
  'assertion.bmffHash.mismatch':
    'This fragment’s content does not match the hash signed in its credentials.',
  'assertion.dataHash.mismatch':
    'The content does not match the hash signed in its credentials.',
  'assertion.hashedURI.mismatch':
    'An assertion in the credentials does not match its own signed hash.',
  'assertion.missing': 'An assertion the claim refers to is missing.',
  'claimSignature.mismatch': 'The claim signature does not verify.',
  'claimSignature.missing': 'The claim carries no signature.',
  'signingCredential.untrusted':
    'The signing certificate is not in the trust list this player was given.',
  'signingCredential.expired': 'The signing certificate had expired when it was used.',
  'signingCredential.revoked': 'The signing certificate has been revoked.',
  'cawg.identity.untrusted':
    'The identity signer is not in the trust list this player was given.',
};

/** Reasons for a per-fragment integrity verdict that is not code-based. */
const INTEGRITY_SENTENCES: Record<string, string> = {
  replayed: 'This fragment repeats one already seen, which can indicate a replayed stream.',
  reordered: 'This fragment arrived out of sequence.',
  missing: 'No C2PA data was found for this fragment.',
  unverified: 'This fragment carried credentials that were not verified.',
  invalid: 'This fragment failed its integrity check.',
};

export function describeFailureCode(code: string): string | null {
  return FAILURE_SENTENCES[code] ?? null;
}

/** Every failure code a manifest source knows about, whatever its shape. */
function readFailureCodes(manifestRef: ManifestSource | undefined): string[] {
  if (!manifestRef) {
    return [];
  }

  switch (manifestRef.kind) {
    case 'single-manifest':
      // The bridge's failures are `{ code, url }`-shaped but typed `unknown[]`.
      return manifestRef.validationErrors.flatMap((error) => {
        const code = (error as { code?: unknown } | null)?.code;
        return typeof code === 'string' ? [code] : [];
      });
    case 'integrity-only':
      return manifestRef.errorCodes ?? [];
    case 'manifest-store':
      return readStoreEvidence(manifestRef.manifestStore).failures.map((failure) => failure.code);
    default:
      return [];
  }
}

function readReason(manifestRef: ManifestSource | undefined, codes: string[]): string | null {
  const described = codes.map(describeFailureCode).find(Boolean);
  if (described) {
    return described;
  }

  if (manifestRef?.kind === 'integrity-only') {
    return (
      INTEGRITY_SENTENCES[manifestRef.integrityStatus] ??
      // `sequenceReason` is the plugin's own wording (e.g. 'gap_detected'), so
      // it is a last resort rather than a first choice.
      manifestRef.sequenceReason ??
      null
    );
  }

  return null;
}

function readMetadata(manifestRef: ManifestSource | undefined): SegmentPreviewMetadata | null {
  const manifest =
    manifestRef?.kind === 'single-manifest'
      ? manifestRef.manifest
      : manifestRef?.kind === 'manifest-store'
        ? getActiveManifest(manifestRef.manifestStore)
        : null;

  if (!manifest) {
    return null;
  }

  const dublinCore = selectDublinCoreMetadata(manifest);

  if (!dublinCore) {
    return null;
  }

  const { title, publisher, rights } = dublinCore;

  // Nothing worth a panel if every field a preview would show is absent.
  return title || publisher || rights ? { title, publisher, rights } : null;
}

/** A segment that passed has, by definition, no failure to report. */
function isHealthy(segment: C2PATimelineSegmentUpdate): boolean {
  return !segment.pending && (segment.validationState === 'Valid' || segment.validationState === 'Trusted');
}

/**
 * Everything the preview needs about one segment.
 *
 * `validationState` is passed through rather than re-derived: the timeline has
 * already decided what colour the segment is, and a preview that disagreed with
 * the bar it is attached to would be worse than no preview.
 *
 * That authority is also why a healthy segment reports no failure even when its
 * `manifestRef` carries codes. For HLS one manifest covers the whole stream, so
 * every region is given the same reference - the metadata on it is shared, but
 * the validation errors belong to whichever fragment failed. Reading them for a
 * neighbour told a viewer that a Trusted stretch had a hash mismatch, which is
 * both wrong and precisely the accusation this player must not make carelessly.
 */
export function buildSegmentPreview(
  segment: C2PATimelineSegmentUpdate,
  adapterKind: AdapterKind | null,
): SegmentPreview {
  const codes = isHealthy(segment) ? [] : readFailureCodes(segment.manifestRef);
  const metadata = readMetadata(segment.manifestRef);

  return {
    timeRange: formatSegmentRange(segment.startTime, segment.endTime),
    validationState: segment.pending ? 'Checking' : segment.validationState,
    metadata,
    // Only claim the metadata is verified when something verified it. For DASH
    // the underlying library performs no identity or trust check at all, so its
    // Dublin Core is shown and marked rather than presented as attested.
    metadataVerified: metadata !== null && adapterKind !== null && verifiesCawgIdentity(adapterKind),
    reason: readReason(segment.manifestRef, codes),
    codes,
  };
}

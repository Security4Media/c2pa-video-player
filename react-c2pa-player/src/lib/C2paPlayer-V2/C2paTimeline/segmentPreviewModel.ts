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

import { readStoreEvidence } from '@/lib/validation/evidence';
import { getActiveManifest, verifiesCawgIdentity } from '@/lib/validation/rules';
import type { AdapterKind, ManifestSource } from '@/lib/validation';
import { selectDublinCoreMetadata } from '../C2paMenu/manifestSelectors/dublinCoreSelectors';
import type { C2PATimelineSegmentUpdate } from '@/lib/types/c2pa.types';

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
  /**
   * One sentence a viewer can act on, when the segment failed or was not
   * verified. Never null for those two cases: an unexplained colour is worse
   * than a general explanation.
   */
  reason: string | null;
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

/**
 * What a failed fragment says when nothing more specific is known.
 *
 * The preview no longer shows raw codes, so this is the floor rather than a
 * nicety: without it a fragment whose code has no plain-language reading would
 * be a red block with a time range and no statement of what happened.
 */
const GENERIC_FAILURE_SENTENCE = 'This fragment failed its integrity check.';

/** The same floor for a grey fragment. */
const GENERIC_UNKNOWN_SENTENCE =
  'No verified content credentials were found for this fragment.';

/**
 * A fragment that settled without ever being played.
 *
 * It sat in the past long enough to fall out of the DVR, so it can no longer
 * be reached, and this player never showed it to anyone - which is why it is
 * grey rather than carrying a colour. Said plainly, because a grey block in
 * the middle of validated history is otherwise unexplained.
 */
const UNPLAYED_SENTENCE =
  'This fragment was never played, so this player did not verify it, and it is now too far in the past to reach.';

/** Nothing has come back for this stretch yet. */
const PENDING_SENTENCE = 'No verdict has arrived for this fragment yet.';

/**
 * An uncovered stretch of the bar - grey track rather than a grey segment.
 *
 * True whatever the cause, which is the point: no verdict for this moment ever
 * reached the player, and why is not something we can tell from here. It might
 * never have been validated, its verdict might have been pruned behind the
 * retention window, or the player might not have been watching yet.
 */
const NOTHING_VERIFIED_SENTENCE = 'No content credentials were verified for this moment.';

/** The same stretch, but at the live edge, where a verdict is still coming. */
const NOT_YET_SENTENCE = 'Nothing has been validated for this moment yet: it is at the live edge.';

/**
 * How wide a gap at the live edge may be before it stops being "yet".
 *
 * The right-hand end of the bar is normally uncovered by a second or two - the
 * window's edge advances on a clock and coasts slightly past the newest verdict
 * so the bar can roll (see liveEdgeClock.ts) - and telling someone that content
 * one second old was never verified would be wrong. A wider gap than a couple
 * of segments is a different thing: validation has actually stopped, and the
 * general sentence is the honest one.
 */
const LEADING_EDGE_SECONDS = 10;

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

/**
 * What the preview says about a stretch of bar no verdict covers.
 *
 * Grey is the track's own colour, so an uncovered stretch has no element to
 * hover and used to report nothing at all - which on a live bar is most of the
 * width, since a five-minute window fills only as verdicts arrive. Silence
 * there is the worst of the three options: a viewer cannot tell whether the
 * player has an opinion about that moment or simply failed to show it.
 *
 * Synthesized rather than rendered as filler segments. Filler would be
 * click-inspectable, would need a manifest it does not have, and would undo
 * the thing that makes the bar readable - that grey is the absence of a
 * verdict rather than a verdict of its own.
 */
export function buildUnverifiedPreview(
  startTime: number,
  endTime: number,
  atLeadingEdge: boolean,
): SegmentPreview {
  const seconds = endTime - startTime;
  const stillArriving =
    atLeadingEdge && Number.isFinite(seconds) && seconds <= LEADING_EDGE_SECONDS;

  return {
    timeRange: formatSegmentRange(startTime, endTime),
    validationState: 'Unknown',
    metadata: null,
    metadataVerified: false,
    reason: stillArriving ? NOT_YET_SENTENCE : NOTHING_VERIFIED_SENTENCE,
  };
}

/**
 * Why a grey segment is grey.
 *
 * Ordered from the most specific thing known to the least, and never empty:
 * grey is the one colour on the bar that carries no self-evident meaning, so
 * leaving it unexplained is what sent people looking for a bug.
 */
function readUnknownReason(segment: C2PATimelineSegmentUpdate): string {
  if (segment.pending) {
    return PENDING_SENTENCE;
  }

  const integrity =
    segment.manifestRef?.kind === 'integrity-only'
      ? INTEGRITY_SENTENCES[segment.manifestRef.integrityStatus] ?? null
      : null;

  if (segment.unplayed) {
    // Both facts, when both apply: what the engine found, and that nobody ever
    // watched it. Saying only the second of a fragment whose credentials were
    // actually missing would be a different, weaker claim than the truth.
    return integrity ? `${integrity} ${UNPLAYED_SENTENCE}` : UNPLAYED_SENTENCE;
  }

  return integrity ?? GENERIC_UNKNOWN_SENTENCE;
}

/**
 * Everything the preview needs about one segment.
 *
 * `validationState` follows the bar rather than being re-derived: the timeline
 * has already decided what colour the segment is, and a preview that disagreed
 * with the bar it is attached to would be worse than no preview. A segment
 * still awaiting its verdict is grey, so it reads as Unknown - the same word
 * the bar's grey means everywhere else.
 *
 * The three branches below differ in what they are willing to say:
 *
 *  - **Invalid** shows the verdict, the time and one sentence. No metadata:
 *    the declared title and rights of a fragment that failed its own integrity
 *    check are exactly the claims that cannot be relied on, and putting them
 *    beside the failure invites reading them as merely unverified rather than
 *    as part of what was tampered with. No raw codes either.
 *  - **Unknown** shows the metadata it has, marked, plus a sentence saying why
 *    nothing was verified.
 *  - **Valid and Trusted** report no failure even when the `manifestRef`
 *    carries codes. For HLS one manifest covers the whole stream, so every
 *    region is given the same reference - the metadata on it is shared, but
 *    the validation errors belong to whichever fragment failed. Reading them
 *    for a neighbour told a viewer that a Trusted stretch had a hash mismatch,
 *    which is both wrong and precisely the accusation this player must not
 *    make carelessly.
 */
export function buildSegmentPreview(
  segment: C2PATimelineSegmentUpdate,
  adapterKind: AdapterKind | null,
): SegmentPreview {
  const timeRange = formatSegmentRange(segment.startTime, segment.endTime);
  const state = segment.pending ? 'Unknown' : segment.validationState;

  if (state === 'Invalid') {
    const codes = readFailureCodes(segment.manifestRef);

    return {
      timeRange,
      validationState: 'Invalid',
      metadata: null,
      metadataVerified: false,
      reason: readReason(segment.manifestRef, codes) ?? GENERIC_FAILURE_SENTENCE,
    };
  }

  const metadata = readMetadata(segment.manifestRef);
  // Only claim the metadata is verified when something verified it. For DASH
  // the underlying library performs no identity or trust check at all, so its
  // Dublin Core is shown and marked rather than presented as attested.
  const metadataVerified =
    metadata !== null && adapterKind !== null && verifiesCawgIdentity(adapterKind);

  if (state === 'Unknown') {
    return {
      timeRange,
      validationState: 'Unknown',
      metadata,
      metadataVerified,
      reason: readUnknownReason(segment),
    };
  }

  return { timeRange, validationState: state, metadata, metadataVerified, reason: null };
}

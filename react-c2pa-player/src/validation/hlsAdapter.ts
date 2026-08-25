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

import { Emitter } from './emitter';
import { createUnknownResult, normalizeHlsManifestHelper } from './normalization';
import { HlsBridgeRuntime } from './runtimes';
import type { FragmentVerdict } from './runtimes/hlsBridgeRuntime';
import { detectAdapterKind } from './sourceDetection';
import { FragmentedTimelineProjector } from './timeline';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  TimelineSegmentDiagnostic,
  ValidationAdapterContext,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

// A jump larger than this between consecutive #rebuildSnapshot calls is
// treated as a seek rather than ordinary playback progression (timeupdate
// ticks are much smaller and continuous). Used only to decide whether a
// missing reader means "seeked into not-yet-validated territory" (show
// unknown/pending) vs. "briefly between fragments during normal playback"
// (keep showing the last known result to avoid flicker).
const SEEK_JUMP_THRESHOLD_SECONDS = 2;

const HLS_CAPABILITIES = {
  ownsPlayback: true,
  providesTimelineSegments: true,
  supportsLookupByTime: true,
  supportsLive: false,
  requiresPlayerOwnership: true,
} as const;

export class HlsFragmentedFmp4Adapter implements MediaValidationAdapter {
  readonly kind = 'hls-fragmented-fmp4' as const;
  readonly capabilities = HLS_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new HlsFragmentedFmp4Session(context);
  }
}

class HlsFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'hls-fragmented-fmp4' as const;

  readonly #runtime: HlsBridgeRuntime;
  readonly #timelineProjector = new FragmentedTimelineProjector();
  readonly #emitter = new Emitter<ValidationStatusSnapshot>();
  #unsubscribeRuntime: (() => void) | null = null;
  #snapshot: ValidationStatusSnapshot = {
    adapterKind: this.adapterKind,
    result: null,
    timelineSegments: [],
    message: 'HLS C2PA fragment validation pending',
  };
  #lastPlaybackTime = 0;
  // Fragments already pushed into the projector, keyed by bounds *and* verdict
  // so a fragment whose verdict later changes is re-observed. Rebuilt from
  // each enumeration (see #observeFragmentVerdicts) rather than only added to,
  // so it can never outgrow the bridge's own fragment list.
  #observedFragmentKeys = new Set<string>();

  constructor(context: ValidationAdapterContext) {
    this.#runtime = new HlsBridgeRuntime(context);
  }

  async load(): Promise<void> {
    this.#unsubscribeRuntime = this.#runtime.subscribe(() => {
      this.#rebuildSnapshot(this.#lastPlaybackTime, true);
    });

    await this.#runtime.load();
    this.#rebuildSnapshot(0, true);
  }

  dispose(): void {
    this.#unsubscribeRuntime?.();
    this.#unsubscribeRuntime = null;
    this.#runtime.dispose();
    this.#emitter.clear();
  }

  getStatusAt(time: number): ValidationStatusSnapshot {
    this.#rebuildSnapshot(time, false);
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    const unsubscribe = this.#emitter.subscribe(listener);
    listener(this.#snapshot);

    return unsubscribe;
  }

  #rebuildSnapshot(time: number, shouldEmit: boolean): void {
    const liveSignal = this.#runtime.isLive();

    if (liveSignal !== null) {
      this.#timelineProjector.setLiveMode(liveSignal);
    }

    const isBackwardSeek = Number.isFinite(time) && time < this.#lastPlaybackTime;
    const isForwardSeek =
      Number.isFinite(time) && time > this.#lastPlaybackTime + SEEK_JUMP_THRESHOLD_SECONDS;

    if (Number.isFinite(time)) {
      this.#lastPlaybackTime = time;
    }

    const reader = this.#runtime.lookup(this.#lastPlaybackTime);
    const result = reader
      ? normalizeHlsManifestHelper(reader)
      : this.#runtime.getErrorReason() || isBackwardSeek || isForwardSeek
        ? createUnknownResult()
        // Not a seek and no error — likely a brief gap between fragments
        // during normal forward playback; keep the last known result
        // instead of flickering to "unknown".
        : this.#snapshot.result;

    // Record every fragment the bridge has already validated, with its real
    // presentation bounds - including fragments buffered ahead of the playhead,
    // which a playhead-only sample would never colour. This is what makes a
    // determined verdict stick to its own fragment instead of being inferred
    // from wherever the playhead happened to be.
    this.#observeFragmentVerdicts();

    if (reader && result) {
      // Playhead-sampled floor, kept because the enumeration above is keyed on
      // hls.currentLevel: it is empty until ABR settles and restarts on a level
      // switch, so without this the current position could go uncoloured. No
      // explicit boundary to pass here (see FragmentedTimelineProjector's
      // `startTime` comment), but `result.manifestSource` is the real manifest
      // active at this exact lookup, so it's still meaningful to attach.
      this.#timelineProjector.observe(
        this.#lastPlaybackTime,
        result.validationState,
        undefined,
        undefined,
        result.manifestSource,
      );
    }

    this.#snapshot = {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: this.#timelineProjector.snapshot(),
      message: this.#runtime.getMessage(),
    };

    if (shouldEmit) {
      this.#emit();
    }
  }

  /**
   * Pushes each newly-known (or newly-changed) fragment verdict into the
   * projector with its real presentation bounds, so every fragment the bridge
   * has validated carries its own colour - not just the ones the playhead has
   * visited.
   *
   * Runs on every rebuild, so it only observes fragments whose (bounds,
   * verdict) pair it hasn't seen: re-upserting the whole list each tick would
   * be quadratic in fragment count for no benefit, since the projector's
   * upsert is idempotent for an unchanged fragment.
   */
  #observeFragmentVerdicts(): void {
    const verdicts = this.#runtime.getFragmentVerdicts();
    const seen = new Set<string>();

    verdicts.forEach((verdict) => {
      const key = `${verdict.startTime}-${verdict.endTime}-${verdict.validationState}`;
      seen.add(key);

      if (this.#observedFragmentKeys.has(key)) {
        return;
      }

      // Only the interesting fragments need a manifest reference (for
      // click-to-inspect) or a diagnostic entry; a plain Valid/Trusted
      // fragment has nothing more to say than its colour.
      const isAnomalous = verdict.validationState !== 'Valid' && verdict.validationState !== 'Trusted';
      const midpoint = (verdict.startTime + verdict.endTime) / 2;
      const reader = isAnomalous ? this.#runtime.lookup(midpoint) : null;

      this.#timelineProjector.observe(
        verdict.endTime,
        verdict.validationState,
        isAnomalous ? [toFragmentDiagnostic(verdict)] : undefined,
        verdict.startTime,
        reader ? normalizeHlsManifestHelper(reader).manifestSource : undefined,
      );
    });

    this.#observedFragmentKeys = seen;
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

/**
 * Describes one non-Valid HLS fragment for the menu's "Segment issues" list.
 *
 * HLS has no per-fragment sequence number in the bridge's public API, so the
 * fragment's start time stands in for both the display number (whole seconds
 * into the stream, which is what a viewer can actually locate) and the
 * ordering key. `timestamp` is only ever used for relative sorting within one
 * adapter's diagnostics (see menuViewModel.ts#selectLiveSegmentsSection), so
 * seconds-into-stream orders correctly even though DASH puts wall-clock ms
 * there; the two never mix, since a session has exactly one adapter.
 */
function toFragmentDiagnostic(verdict: FragmentVerdict): TimelineSegmentDiagnostic {
  return {
    segmentNumber: Math.floor(verdict.startTime),
    mediaType: 'video',
    status: verdict.validationState === 'Invalid' ? 'invalid' : 'unverified',
    timestamp: verdict.startTime,
  };
}

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
import { condemnsWholeAsset } from './evidence';
import { createUnknownResult, normalizeHlsManifestHelper } from './normalization';
import type { HlsValidationRuntime } from './runtimes/contracts';
import {
  FragmentedTimelineProjector,
  isActuallyPlaying,
  readRegionKey,
  selectReadRegions,
  WatchedTimeline,
} from './timeline';
import type {
  ManifestSource,
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

export class HlsFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'hls-fragmented-fmp4' as const;

  readonly #runtime: HlsValidationRuntime;
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
  // Regions already pushed into the projector, keyed by bounds *and* verdict so
  // a region whose verdict later changes is re-observed. Rebuilt on each pass
  // (see #observeReadRegions) rather than only added to, so it can never
  // outgrow the current set of read regions.
  #observedFragmentKeys = new Set<string>();
  readonly #watched = new WatchedTimeline();
  readonly #videoElement: HTMLVideoElement;

  constructor(runtime: HlsValidationRuntime, videoElement: HTMLVideoElement) {
    this.#runtime = runtime;
    this.#videoElement = videoElement;
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

    this.#watched.observePlayhead(this.#lastPlaybackTime, isActuallyPlaying(this.#videoElement));

    const reader = this.#runtime.lookup(this.#lastPlaybackTime);
    const result = reader
      ? normalizeHlsManifestHelper(reader)
      : this.#runtime.getErrorReason() || isBackwardSeek || isForwardSeek
        ? createUnknownResult()
        // Not a seek and no error — likely a brief gap between fragments
        // during normal forward playback; keep the last known result
        // instead of flickering to "unknown".
        : this.#snapshot.result;

    // Project only what playback has actually read (see selectReadRegions).
    // No playhead-sampled "floor" observation alongside this: the fragment the
    // playhead is inside is already covered by the gate, and a bare playhead
    // sample carries no boundary of its own, so it would smear one verdict
    // across the whole visited range.
    this.#observeReadRegions(result?.manifestSource);

    this.#snapshot = {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: this.#timelineProjector.snapshot(),
      message: this.#runtime.getMessage(),
      // Only a manifest-scoped failure condemns the whole asset; a bad
      // fragment colours just its own span (see #wholeAssetInvalid).
      wholeAssetInvalid: this.#wholeAssetInvalid(),
      isLive: liveSignal ?? undefined,
    };

    if (shouldEmit) {
      this.#emit();
    }
  }

  /**
   * Projects the parts of validated fragments that playback has actually read,
   * clipped at the playhead (see selectReadRegions).
   *
   * Runs on every rebuild, so it skips regions whose (bounds, verdict) it has
   * already projected: a fully-read fragment settles on one key and is
   * observed once, while the fragment being watched refreshes each tick as its
   * clipped end advances. Without that, re-upserting every region per tick
   * would be quadratic in fragment count for no benefit, the projector's
   * upsert being idempotent for an unchanged region.
   */
  #observeReadRegions(currentManifestSource: ManifestSource | undefined): void {
    const regions = selectReadRegions(this.#runtime.getFragmentVerdicts(), this.#watched);
    const seen = new Set<string>();

    regions.forEach((region) => {
      const key = readRegionKey(region);
      seen.add(key);

      if (this.#observedFragmentKeys.has(key)) {
        return;
      }

      // Only anomalous regions need a manifest reference (for
      // click-to-inspect); a Valid/Trusted one says everything in its colour.
      // The manifest is shared across fragments here, so the current lookup's
      // source is the right one to attach.
      const isAnomalous =
        region.validationState !== 'Valid' && region.validationState !== 'Trusted';

      this.#timelineProjector.observe(
        region.endTime,
        region.validationState,
        region.startTime,
        isAnomalous ? currentManifestSource : undefined,
      );
    });

    this.#observedFragmentKeys = seen;
  }

  /**
   * True when the manifest itself failed validation, which condemns the whole
   * asset rather than any one region.
   *
   * Deliberately not "any fragment is Invalid": a fragment whose BMFF hash
   * fails is a fragment-scoped problem, and treating it as whole-asset would
   * paint the entire timeline red and hide which parts were actually tampered
   * with - exactly what the per-fragment colouring exists to show. A
   * manifest-scoped failure, by contrast, is reported by every fragment alike,
   * so one is enough to condemn the asset.
   *
   * The verdict has to agree, though. Not every manifest-scoped failure makes
   * an asset invalid: an untrusted claim signer is reported against the
   * manifest, yet the engine still returns 'Valid' because the content is
   * intact and merely unvouched for. Scope alone painted those red.
   */
  #wholeAssetInvalid(): boolean {
    return condemnsWholeAsset(this.#runtime.getFragmentVerdicts());
  }

  #emit(): void {
    this.#emitter.emit(this.#snapshot);
  }
}

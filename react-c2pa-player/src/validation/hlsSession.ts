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

import { clearDiagnostics, recordDiagnostic, setDiagnosticsRetention } from './diagnostics/diagnosticsLog';
import { Emitter } from './emitter';
import { condemnsWholeAsset } from './evidence';
import { DEFAULT_LIVE_RETENTION_SECONDS } from './policy/liveRetention';
import { createUnknownResult, normalizeHlsManifestHelper } from './normalization';
import type { HlsValidationRuntime } from './runtimes/contracts';
import type { FragmentVerdict } from './runtimes/hlsBridgeRuntime';
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
  readonly #retentionSeconds: number;

  constructor(
    runtime: HlsValidationRuntime,
    videoElement: HTMLVideoElement,
    retentionSeconds: number = DEFAULT_LIVE_RETENTION_SECONDS,
  ) {
    this.#runtime = runtime;
    this.#videoElement = videoElement;
    this.#retentionSeconds = retentionSeconds;
  }

  async load(): Promise<void> {
    // One stream's log must never show under another's, and the console keeps
    // what the bar shows rather than a window of its own.
    clearDiagnostics();
    setDiagnosticsRetention(this.#retentionSeconds);

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
      this.#timelineProjector.setLiveMode(liveSignal, this.#retentionSeconds);
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
      liveRetentionSeconds: this.#retentionSeconds,
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
    const verdicts = this.#runtime.getFragmentVerdicts();

    this.#logFragmentVerdicts(verdicts);

    const regions = selectReadRegions(verdicts, this.#watched);
    const seen = new Set<string>();

    regions.forEach((region) => {
      const key = readRegionKey(region);
      seen.add(key);

      if (this.#observedFragmentKeys.has(key)) {
        return;
      }

      // Attached to every region, not just the anomalous ones. This used to be
      // withheld from Valid/Trusted regions on the grounds that such a region
      // "says everything in its colour", which was true while the manifest was
      // only there for click-to-inspect; the timeline's hover preview now reads
      // it to show a segment's Dublin Core metadata, and a trusted fragment is
      // exactly where there is something to show. Costs nothing: one manifest
      // is shared across this stream's fragments, so every region gets the same
      // reference rather than a copy.
      this.#timelineProjector.observe(
        region.endTime,
        region.validationState,
        region.startTime,
        currentManifestSource,
      );
    });

    this.#observedFragmentKeys = seen;
  }

  /**
   * Records each fragment's verdict for the debug console.
   *
   * Logged from every verdict rather than from the read regions below: a
   * fragment that failed matters whether or not anyone watched it, and the
   * console is where an operator goes to find out that something failed at all.
   *
   * The bridge is polled, not pushed - this runs on every rebuild, several
   * times a second, re-reporting every fragment - so each row carries a key.
   * The verdict is part of that key, so a fragment whose verdict is later
   * upgraded logs the change rather than being silently swallowed as a
   * duplicate.
   */
  #logFragmentVerdicts(verdicts: readonly FragmentVerdict[]): void {
    verdicts.forEach((verdict) => {
      recordDiagnostic({
        key: `hls:${verdict.index}:${verdict.startTime.toFixed(3)}:${verdict.validationState}`,
        severity: verdict.validationState === 'Invalid' ? 'failure' : 'info',
        engine: 'hls',
        topic: 'fragment',
        status: verdict.validationState,
        segmentNumber: verdict.index,
        startTime: verdict.startTime,
        endTime: verdict.endTime,
        // The bridge reports no error codes of its own. The scope is what it
        // does know, and it is the difference between one bad fragment and a
        // broken stream.
        scope: verdict.failureScope ?? undefined,
      });
    });
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

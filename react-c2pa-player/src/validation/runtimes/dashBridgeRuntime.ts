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

import type {
  C2paController,
  C2paManifest,
  DashjsPlayer,
  ErrorEvent as C2paErrorEvent,
  InitProcessedEvent,
  MediaType,
  SegmentRecord,
} from '@qualabs/c2pa-live-dashjs-plugin';
import { Emitter, type EmitterListener } from '../emitter';
import { normalizeDashSegmentRecord } from '../normalization/dash';
import type { NormalizedValidationResult, TimelineSegmentDiagnostic, ValidationAdapterContext } from '../types';

type RuntimeListener = EmitterListener<void>;

export interface DashSegmentEntry {
  startTime: number;
  endTime: number;
  result: NormalizedValidationResult;
  diagnostic: TimelineSegmentDiagnostic;
}

interface PendingTiming {
  startTime: number;
  endTime: number;
}

interface FragmentRequestLike {
  type?: string | null;
  mediaType?: string;
  startTime?: number;
  duration?: number;
}

interface FragmentLoadingCompletedEventLike {
  request?: FragmentRequestLike;
}

// dash.js is dynamically imported (see `load()`), so the app carries no
// build-time dependency on its types. This is the minimal surface used here.
interface DashMediaPlayerLike {
  initialize(view: HTMLVideoElement, source: string, autoPlay: boolean): void;
  on(eventName: string, handler: (event: unknown) => void): void;
  off(eventName: string, handler: (event: unknown) => void): void;
  reset(): void;
  isDynamic(): boolean;
}

// Fallback used only when a segment's real timing couldn't be correlated
// (see #onFragmentLoadingCompleted) — keeps the timeline moving forward
// instead of stalling, at the cost of imprecise segment boundaries.
const NOMINAL_SEGMENT_DURATION_SECONDS = 4;

// The plugin is only attached for these media types (see `load()`) — a
// fragment load for any other type (e.g. audio) will never be matched by a
// `segmentValidated` event, so queuing its timing would grow #pendingTiming
// forever on a long-running live stream.
const VALIDATED_MEDIA_TYPES: readonly MediaType[] = ['video'];

// How much segment history to retain for #segments/#lookup. Long-running live
// sessions would otherwise grow this array (and its O(n) lookup scan) without
// bound; anything older than this relative to the live edge is evicted.
const SEGMENT_RETENTION_WINDOW_SECONDS = 600;

/**
 * Owns the dash.js player instance and the @qualabs/c2pa-live-dashjs-plugin
 * controller for one live DASH source. Unlike the HLS bridge, the plugin has
 * no time-indexed lookup API — it only emits discrete `segmentValidated`
 * events keyed by a manifest-derived sequence number. This runtime
 * correlates those events to real playback time by listening to dash.js's
 * own `FRAGMENT_LOADING_COMPLETED` event (which carries the fragment's true
 * presentation `startTime`/`duration`) and pairing them up in arrival order,
 * per media type — both listeners observe the same underlying fragment
 * downloads in the same order, so a plain FIFO pairing is reliable without
 * needing the two identifiers (dash.js's request index vs. the plugin's
 * manifest sequence number) to match numerically.
 */
export class DashBridgeRuntime {
  readonly #context: ValidationAdapterContext;
  readonly #emitter = new Emitter();
  readonly #pendingTiming = new Map<string, PendingTiming[]>();
  readonly #lastDequeuedStartTime = new Map<string, number>();
  readonly #segments: DashSegmentEntry[] = [];
  #evictedSegmentCount = 0;
  #player: DashMediaPlayerLike | null = null;
  #controller: C2paController | null = null;
  #fragmentLoadingEventName: string | null = null;
  #streamInitializedEventName: string | null = null;
  #message = 'Live DASH C2PA validation pending';
  #errorReason: string | null = null;
  #estimatedTimelineEnd = 0;
  #latestManifest: C2paManifest | null = null;
  // null until STREAM_INITIALIZED fires and reveals whether this is a
  // live/dynamic MPD or a static (VOD) one - used to gate the eviction below
  // and the timeline projector's destructive-vs-non-destructive handling of
  // backward observations (see FragmentedTimelineProjector.setLiveMode).
  #isLive: boolean | null = null;

  constructor(context: ValidationAdapterContext) {
    this.#context = context;
  }

  async load(): Promise<void> {
    const [{ MediaPlayer }, { attachC2pa }] = await Promise.all([
      import('dashjs'),
      import('@qualabs/c2pa-live-dashjs-plugin'),
    ]);

    const player = MediaPlayer().create() as unknown as DashMediaPlayerLike;
    this.#player = player;

    this.#fragmentLoadingEventName = MediaPlayer.events.FRAGMENT_LOADING_COMPLETED;
    player.on(this.#fragmentLoadingEventName, this.#onFragmentLoadingCompleted);

    this.#streamInitializedEventName = MediaPlayer.events.STREAM_INITIALIZED;
    player.on(this.#streamInitializedEventName, this.#onStreamInitialized);

    this.#context.videoElement.addEventListener('seeking', this.#onVideoSeeking);

    const controller = attachC2pa(player as unknown as DashjsPlayer, {
      mediaTypes: [...VALIDATED_MEDIA_TYPES],
    });
    this.#controller = controller;
    controller.on('segmentValidated', this.#onSegmentValidated);
    controller.on('initProcessed', this.#onInitProcessed);
    controller.on('error', this.#onError);

    this.#message = 'Live DASH C2PA validation active';
    this.#errorReason = null;
    player.initialize(this.#context.videoElement, this.#context.source.url, false);
    this.#emit();
  }

  dispose(): void {
    if (this.#player && this.#fragmentLoadingEventName) {
      this.#player.off(this.#fragmentLoadingEventName, this.#onFragmentLoadingCompleted);
    }

    if (this.#player && this.#streamInitializedEventName) {
      this.#player.off(this.#streamInitializedEventName, this.#onStreamInitialized);
    }

    this.#context.videoElement.removeEventListener('seeking', this.#onVideoSeeking);

    this.#controller?.off('segmentValidated', this.#onSegmentValidated);
    this.#controller?.off('initProcessed', this.#onInitProcessed);
    this.#controller?.off('error', this.#onError);
    this.#controller?.detach();

    try {
      this.#player?.reset();
    } catch (error) {
      console.warn('[DASH C2PA] Error resetting dash.js player:', error);
    }

    this.#controller = null;
    this.#player = null;
    this.#pendingTiming.clear();
    this.#lastDequeuedStartTime.clear();
    this.#emitter.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    return this.#emitter.subscribe(listener);
  }

  /**
   * Segments closed since the caller last drained, in chronological order.
   * `count` is a total-ever-added index (as returned by `getSegmentCount()`);
   * it's translated against `#evictedSegmentCount` since old entries may have
   * been evicted from the front of `#segments` since the caller last checked.
   * If the caller fell behind eviction, whatever remains is returned rather
   * than throwing — some segment history is an acceptable loss for bounding
   * memory on a long-running live session.
   */
  getSegmentsSince(count: number): DashSegmentEntry[] {
    return this.#segments.slice(Math.max(0, count - this.#evictedSegmentCount));
  }

  getSegmentCount(): number {
    return this.#evictedSegmentCount + this.#segments.length;
  }

  lookup(time: number): { result: NormalizedValidationResult; diagnostic: TimelineSegmentDiagnostic } | null {
    if (this.#segments.length === 0) {
      return null;
    }

    const covering = this.#segments.find(
      (segment) => time >= segment.startTime && time < segment.endTime
    );

    if (covering) {
      return { result: covering.result, diagnostic: covering.diagnostic };
    }

    const last = this.#segments[this.#segments.length - 1];

    // Playback can run slightly ahead of validation completion at the live
    // edge; report the most recently known state rather than "unknown".
    return time >= last.endTime ? { result: last.result, diagnostic: last.diagnostic } : null;
  }

  getMessage(): string {
    return this.#message;
  }

  getErrorReason(): string | null {
    return this.#errorReason;
  }

  /** `null` until STREAM_INITIALIZED fires and reveals live vs. VOD. */
  isLive(): boolean | null {
    return this.#isLive;
  }

  #onStreamInitialized = (): void => {
    const next = this.#player?.isDynamic() ?? null;

    if (next !== null && this.#isLive !== next) {
      this.#isLive = next;
      this.#emit();
    }
  };

  /**
   * Clears the FIFO fragment/validation correlation-tracking maps on a video
   * seek. These are pure event-correlation bookkeeping (matching dash.js's
   * FRAGMENT_LOADING_COMPLETED requests to the plugin's segmentValidated
   * events in arrival order, and checking that order is still increasing) -
   * not validation history, so clearing them doesn't lose anything. Without
   * this, a VOD backward seek that makes dash.js re-fetch an already-seen
   * segment produces a start time earlier than what's already tracked,
   * which #onSegmentValidated would otherwise misreport as the two event
   * streams having desynced (see #flagCorrelationIssue below) even though
   * the re-fetch is entirely expected.
   */
  #onVideoSeeking = (): void => {
    this.#pendingTiming.clear();
    this.#lastDequeuedStartTime.clear();
  };

  #onFragmentLoadingCompleted = (event: unknown): void => {
    const request = (event as FragmentLoadingCompletedEventLike | null)?.request;

    if (!request || request.type !== 'MediaSegment' || !request.mediaType) {
      return;
    }

    // Only media types the plugin actually validates (see VALIDATED_MEDIA_TYPES)
    // will ever be dequeued by #onSegmentValidated below — queuing others
    // (e.g. audio) would grow #pendingTiming forever on a live stream.
    if (!(VALIDATED_MEDIA_TYPES as readonly string[]).includes(request.mediaType)) {
      return;
    }

    if (typeof request.startTime !== 'number' || !Number.isFinite(request.startTime)) {
      return;
    }

    const duration =
      typeof request.duration === 'number' && request.duration > 0
        ? request.duration
        : NOMINAL_SEGMENT_DURATION_SECONDS;
    const queue = this.#pendingTiming.get(request.mediaType) ?? [];
    queue.push({ startTime: request.startTime, endTime: request.startTime + duration });
    this.#pendingTiming.set(request.mediaType, queue);
  };

  #onSegmentValidated = (record: SegmentRecord): void => {
    if (record.manifest) {
      this.#latestManifest = record.manifest;
    }

    const timing = this.#pendingTiming.get(record.mediaType)?.shift() ?? null;
    const { result, diagnostic } = normalizeDashSegmentRecord(record, this.#latestManifest);

    if (!timing) {
      // The two event streams are paired purely by arrival order (see class
      // doc comment); an empty queue here means a segmentValidated event
      // arrived with no corresponding recorded fragment load, which
      // shouldn't happen if the two streams are still in sync.
      this.#flagCorrelationIssue(
        `no matching fragment timing for ${record.mediaType} segment #${record.segmentNumber} — ` +
          'the dash.js fragment-load and C2PA validation event streams may have desynced',
      );
    } else {
      const previousStart = this.#lastDequeuedStartTime.get(record.mediaType);

      if (previousStart !== undefined && timing.startTime <= previousStart) {
        // Real segment start times should be strictly increasing per media
        // type. A non-increasing value means the FIFO pairing likely slipped
        // (e.g. after an ABR quality switch or a retried fragment request).
        this.#flagCorrelationIssue(
          `non-monotonic start time for ${record.mediaType} segment #${record.segmentNumber} ` +
            `(previous ${previousStart}s, this ${timing.startTime}s) — fragment/validation ` +
            'event correlation may be out of sync',
        );
      }

      this.#lastDequeuedStartTime.set(record.mediaType, timing.startTime);
    }

    const startTime = timing?.startTime ?? this.#estimatedTimelineEnd;
    const endTime = timing?.endTime ?? startTime + NOMINAL_SEGMENT_DURATION_SECONDS;
    this.#estimatedTimelineEnd = Math.max(this.#estimatedTimelineEnd, endTime);

    this.#segments.push({ startTime, endTime, result, diagnostic });
    this.#evictStaleSegments();
    this.#emit();
  };

  #onInitProcessed = (event: InitProcessedEvent): void => {
    if (event.manifest) {
      this.#latestManifest = event.manifest;
    }

    if (event.noC2paData) {
      this.#message = 'No Content Credentials found in this live stream';
    } else if (!event.success) {
      this.#errorReason = event.error ?? 'DASH init segment C2PA processing failed';
      this.#message = this.#errorReason;
    }

    this.#emit();
  };

  /**
   * Surfaces a detected fragment/validation correlation problem as the
   * adapter's current error/message state. This only flags the issue for
   * whoever's watching the message — it does not attempt to re-sync the two
   * event streams, which would be a much larger change.
   */
  #flagCorrelationIssue(message: string): void {
    console.warn(`[DASH C2PA] ${message}`);
    this.#errorReason = message;
    this.#message = message;
  }

  /**
   * Bounds #segments (and the getSegmentCount()/getSegmentsSince() index
   * space via #evictedSegmentCount) so a long-running live session doesn't
   * grow this array — and its O(n) lookup() scan — without limit.
   */
  #evictStaleSegments(): void {
    // VOD (or not-yet-known) sources: never evict. A VOD asset's duration is
    // finite and known, so there's nothing to bound memory against, and
    // doing so anyway would drop real history for anything over ~10 minutes.
    if (this.#isLive !== true) {
      return;
    }

    const cutoff = this.#estimatedTimelineEnd - SEGMENT_RETENTION_WINDOW_SECONDS;

    while (this.#segments.length > 1 && this.#segments[0].endTime < cutoff) {
      this.#segments.shift();
      this.#evictedSegmentCount += 1;
    }
  }

  #onError = (event: C2paErrorEvent): void => {
    console.warn('[DASH C2PA] Plugin error', event.source, event.error);

    const detail = event.error instanceof Error ? event.error.message : String(event.error);
    this.#errorReason = `DASH C2PA plugin error (${event.source}): ${detail}`;
    this.#message = this.#errorReason;
    this.#emit();
  };

  #emit(): void {
    this.#emitter.emit();
  }
}

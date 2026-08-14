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
  SegmentRecord,
} from '@qualabs/c2pa-live-dashjs-plugin';
import { normalizeDashSegmentRecord } from '../normalization/dash';
import type { NormalizedValidationResult, TimelineSegmentDiagnostic, ValidationAdapterContext } from '../types';

type RuntimeListener = () => void;

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
}

// Fallback used only when a segment's real timing couldn't be correlated
// (see #onFragmentLoadingCompleted) — keeps the timeline moving forward
// instead of stalling, at the cost of imprecise segment boundaries.
const NOMINAL_SEGMENT_DURATION_SECONDS = 4;

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
  readonly #listeners = new Set<RuntimeListener>();
  readonly #pendingTiming = new Map<string, PendingTiming[]>();
  readonly #segments: DashSegmentEntry[] = [];
  #player: DashMediaPlayerLike | null = null;
  #controller: C2paController | null = null;
  #fragmentLoadingEventName: string | null = null;
  #message = 'Live DASH C2PA validation pending';
  #errorReason: string | null = null;
  #estimatedTimelineEnd = 0;
  #latestManifest: C2paManifest | null = null;

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

    const controller = attachC2pa(player as unknown as DashjsPlayer, { mediaTypes: ['video'] });
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
    this.#listeners.clear();
  }

  subscribe(listener: RuntimeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Segments closed since the caller last drained, in chronological order. */
  getSegmentsSince(count: number): DashSegmentEntry[] {
    return this.#segments.slice(count);
  }

  getSegmentCount(): number {
    return this.#segments.length;
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

  #onFragmentLoadingCompleted = (event: unknown): void => {
    const request = (event as FragmentLoadingCompletedEventLike | null)?.request;

    if (!request || request.type !== 'MediaSegment' || !request.mediaType) {
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

    const startTime = timing?.startTime ?? this.#estimatedTimelineEnd;
    const endTime = timing?.endTime ?? startTime + NOMINAL_SEGMENT_DURATION_SECONDS;
    this.#estimatedTimelineEnd = Math.max(this.#estimatedTimelineEnd, endTime);

    this.#segments.push({ startTime, endTime, result, diagnostic });
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

  #onError = (event: C2paErrorEvent): void => {
    console.warn('[DASH C2PA] Plugin error', event.source, event.error);
  };

  #emit(): void {
    this.#listeners.forEach((listener) => listener());
  }
}

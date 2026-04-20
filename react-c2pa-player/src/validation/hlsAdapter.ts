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

import type { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import {
  C2paHlsBridge,
  type C2paManifestHelper,
} from '@nettrek/c2pa-hls-bridge';
import Hls from 'hls.js';
import { detectAdapterKind } from './sourceDetection';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  NormalizedC2PAResult,
  ValidationAdapterContext,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
  ValidationTimelineSegment,
} from './types';
import type { PlayerValidationState } from '@/types/c2pa.types';

export class HlsFragmentedFmp4Adapter implements MediaValidationAdapter {
  readonly kind = 'hls-fragmented-fmp4' as const;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new HlsFragmentedFmp4Session(context);
  }
}

class HlsFragmentedFmp4Session implements ValidationSession {
  readonly adapterKind = 'hls-fragmented-fmp4' as const;

  readonly #context: ValidationAdapterContext;
  readonly #listeners = new Set<ValidationSessionListener>();
  #hls: Hls | null = null;
  #bridge: C2paHlsBridge | null = null;
  #timelineSegments: ValidationTimelineSegment[] = [];
  #lastObservedTime = 0;
  #disposed = false;
  #snapshot: ValidationStatusSnapshot;

  constructor(context: ValidationAdapterContext) {
    this.#context = context;
    this.#snapshot = {
      adapterKind: this.adapterKind,
      result: null,
      timelineSegments: [],
      message: 'HLS C2PA fragment validation pending',
    };
  }

  async load(): Promise<void> {
    if (!Hls.isSupported()) {
      this.#snapshot = {
        adapterKind: this.adapterKind,
        result: createUnknownResult('HLS.js is not supported in this browser'),
        timelineSegments: [],
        message: 'HLS.js is required for fragmented C2PA validation',
      };
      this.#emit();
      return;
    }

    const hls = new Hls({ enableWorker: true });
    const bridge = new C2paHlsBridge(
      {
        enableTrustListVerification: this.#context.policy.enableTrustVerification,
      },
      hls,
    );

    this.#hls = hls;
    this.#bridge = bridge;

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(this.#context.source.url);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      console.warn('[HLS C2PA] HLS.js error', data);

      if (data?.fatal) {
        this.#snapshot = {
          adapterKind: this.adapterKind,
          result: createUnknownResult(`HLS playback error: ${data.details}`),
          timelineSegments: [...this.#timelineSegments],
          message: `HLS playback error: ${data.details}`,
        };
        this.#emit();
      }
    });

    this.#context.videoElement.addEventListener('timeupdate', this.#handleTimeUpdate);
    hls.attachMedia(this.#context.videoElement);
  }

  dispose(): void {
    this.#disposed = true;
    this.#context.videoElement.removeEventListener('timeupdate', this.#handleTimeUpdate);
    this.#bridge?.dispose();
    this.#hls?.destroy();
    this.#bridge = null;
    this.#hls = null;
    this.#listeners.clear();
  }

  getStatusAt(): ValidationStatusSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    this.#listeners.add(listener);
    listener(this.#snapshot);

    return () => {
      this.#listeners.delete(listener);
    };
  }

  readonly #handleTimeUpdate = () => {
    if (this.#disposed || !this.#bridge) {
      return;
    }

    const currentTime = this.#context.videoElement.currentTime;
    const reader = this.#bridge.getC2PAMetaByTimeCode(currentTime);

    if (!reader) {
      return;
    }

    const result = normalizeHlsReader(reader);
    this.#updateTimeline(currentTime, result.validationState);
    this.#markTamperedIntervals(this.#bridge.getTamperedWithIntervals());

    this.#snapshot = {
      adapterKind: this.adapterKind,
      result,
      timelineSegments: [...this.#timelineSegments],
      message: 'HLS C2PA fragment validation active',
    };
    this.#emit();
  };

  #updateTimeline(currentTime: number, validationState: PlayerValidationState): void {
    if (!Number.isFinite(currentTime)) {
      return;
    }

    if (currentTime < this.#lastObservedTime) {
      this.#timelineSegments = [];
    }

    const lastSegment = this.#timelineSegments[this.#timelineSegments.length - 1];
    const startTime = this.#timelineSegments.length === 0
      ? 0
      : this.#lastObservedTime;

    if (!lastSegment || lastSegment.validationState !== validationState) {
      this.#timelineSegments.push({
        startTime,
        endTime: currentTime,
        validationState,
      });
    } else {
      lastSegment.endTime = Math.max(lastSegment.endTime, currentTime);
    }

    this.#lastObservedTime = currentTime;
  }

  #markTamperedIntervals(intervals: unknown[]): void {
    intervals
      .map(readInterval)
      .filter((interval): interval is { startTime: number; endTime: number } => interval !== null)
      .forEach((interval) => {
        const hasMatchingInvalidSegment = this.#timelineSegments.some((segment) =>
          segment.validationState === 'Invalid' &&
          Math.abs(segment.startTime - interval.startTime) < 0.001 &&
          Math.abs(segment.endTime - interval.endTime) < 0.001
        );

        if (!hasMatchingInvalidSegment) {
          this.#timelineSegments.push({
            startTime: interval.startTime,
            endTime: interval.endTime,
            validationState: 'Invalid',
            sourceSegmentId: 'tampered',
          });
        }
      });

    this.#timelineSegments.sort((a, b) => a.startTime - b.startTime);
  }

  #emit(): void {
    this.#listeners.forEach((listener) => listener(this.#snapshot));
  }
}

function normalizeHlsReader(reader: C2paManifestHelper): NormalizedC2PAResult {
  const containsSignature = reader.containsSignature();
  const validationErrors = reader.getValidationErrors();
  const validationState = getValidationState(reader, containsSignature);
  const manifests = reader.getManifestMap() as Record<string, Manifest>;
  const activeManifest = reader.getActiveManifest() as Manifest | null;
  const manifestStore = createManifestStore(
    activeManifest,
    manifests,
    validationState,
    validationErrors,
  );

  return {
    manifestStore,
    validationState,
    containsSignature,
    containsAIGeneratedContent: reader.containsAIGeneratedContent(),
    validationErrors,
    activeManifest,
    manifests,
  };
}

function getValidationState(
  reader: C2paManifestHelper,
  containsSignature: boolean
): PlayerValidationState {
  if (!containsSignature) {
    return 'Unknown';
  }

  return reader.isValid() ? 'Valid' : 'Invalid';
}

function createManifestStore(
  activeManifest: Manifest | null,
  manifests: Record<string, Manifest>,
  validationState: PlayerValidationState,
  validationErrors: unknown[]
): ManifestStore | null {
  const activeManifestId = findActiveManifestId(activeManifest, manifests);

  if (!activeManifest || !activeManifestId) {
    return null;
  }

  return {
    active_manifest: activeManifestId,
    manifests,
    validation_state: validationState,
    validation_results: {
      activeManifest: {
        success: validationState === 'Invalid' ? [] : [{ code: 'c2pa.hls.fragment.validated' }],
        failure: validationState === 'Invalid' ? validationErrors : [],
      },
    },
  } as ManifestStore;
}

function findActiveManifestId(
  activeManifest: Manifest | null,
  manifests: Record<string, Manifest>
): string | null {
  if (!activeManifest) {
    return null;
  }

  if (typeof activeManifest.id === 'string') {
    return activeManifest.id;
  }

  const activeEntry = Object.entries(manifests).find(([, manifest]) => manifest === activeManifest);
  return activeEntry?.[0] ?? null;
}

function createUnknownResult(reason: string): NormalizedC2PAResult {
  return {
    manifestStore: null,
    validationState: 'Unknown',
    containsSignature: false,
    containsAIGeneratedContent: false,
    validationErrors: [],
    activeManifest: null,
    manifests: {},
    reason,
  };
}

function readInterval(interval: unknown): { startTime: number; endTime: number } | null {
  if (!interval || typeof interval !== 'object') {
    return null;
  }

  const maybeInterval = interval as {
    low?: unknown;
    high?: unknown;
    output?: () => unknown;
  };
  const output = maybeInterval.output?.();

  if (Array.isArray(output) && output.length >= 2) {
    return createIntervalRange(output[0], output[1]);
  }

  return createIntervalRange(maybeInterval.low, maybeInterval.high);
}

function createIntervalRange(start: unknown, end: unknown): { startTime: number; endTime: number } | null {
  if (typeof start !== 'number' || typeof end !== 'number') {
    return null;
  }

  return {
    startTime: Math.min(start, end),
    endTime: Math.max(start, end),
  };
}

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

import type { Manifest, ManifestStore, TrustSettings } from '@contentauth/c2pa-web';

export type PlayerValidationState = 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';

export type AdapterKind =
  | 'monolithic'
  | 'hls-fragmented-fmp4'
  | 'dash-fragmented-fmp4'
  | 'unsupported';

export type MediaSourceOrigin = 'server' | 'local' | 'remote' | 'blob' | 'unknown';

export interface MediaSourceDescriptor {
  url: string;
  displayName: string;
  mimeType: string | null;
  extension: string | null;
  origin: MediaSourceOrigin;
}

export interface AdapterCapabilities {
  ownsPlayback: boolean;
  providesTimelineSegments: boolean;
  supportsLookupByTime: boolean;
  /** Whether this adapter can validate an unbounded/live source, not just a fixed-length VOD asset. */
  supportsLive: boolean;
  /**
   * Whether this adapter's underlying validation library must attach
   * directly to (and drive) the video element itself to work at all -
   * distinct from `ownsPlayback`, which describes whether it currently
   * does so, not whether the format inherently requires it.
   */
  requiresPlayerOwnership: boolean;
}

export interface TrustMaterial {
  wasmSrc: string;
  trust: TrustSettings;
  cawgTrust: TrustSettings;
}

export interface TrustMaterialProvider {
  load(): Promise<TrustMaterial>;
}

export interface ValidationPolicy {
  enableTrustVerification: boolean;
  trustMaterialProvider: TrustMaterialProvider;
}

/**
 * Status of one segment's cryptographic/structural check, as reported by a
 * fragmented-stream validator that may have no manifest to attach a status
 * to (e.g. a DASH segment covered only by continuity/replay checks).
 */
export type SegmentIntegrityStatus =
  | 'valid'
  | 'invalid'
  | 'replayed'
  | 'reordered'
  | 'missing'
  | 'warning'
  | 'unverified';

/**
 * Adapter-agnostic description of where a validation result's manifest data
 * (if any) came from. Lets menu/selector code branch on shape without each
 * adapter having to fabricate a `ManifestStore`-shaped compatibility object:
 * HLS and DASH leave `NormalizedValidationResult.manifestStore` null and let
 * menuViewModel.ts's manifestStore-less fallback path use `validationState`
 * directly; only monolithic populates a real `ManifestStore`, since its
 * reader genuinely produces one.
 */
export type ManifestSource =
  | { kind: 'manifest-store'; manifestStore: ManifestStore }
  | {
      kind: 'single-manifest';
      manifest: Manifest;
      manifests: Record<string, Manifest>;
      validationState: PlayerValidationState;
      validationErrors: unknown[];
    }
  | { kind: 'integrity-only'; integrityStatus: SegmentIntegrityStatus; sequenceReason?: string; errorCodes?: string[] }
  | { kind: 'none' };

export interface NormalizedValidationResult {
  manifestStore: ManifestStore | null;
  validationState: PlayerValidationState;
  activeManifest: Manifest | null;
  manifestSource?: ManifestSource;
}

export type NormalizedC2PAResult = NormalizedValidationResult;

export interface ValidationTimelineSegment {
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
  pending?: boolean;
  manifestRef?: ManifestSource;
}

export interface TimeInterval {
  startTime: number;
  endTime: number;
}

export interface ValidationStatusSnapshot {
  adapterKind: AdapterKind;
  result: NormalizedValidationResult | null;
  timelineSegments: ValidationTimelineSegment[];
  message: string;
  /**
   * The asset's own credentials failed validation, so no part of it is
   * trustworthy - as opposed to a specific region being bad. Distinct from
   * `timelineSegments` because it is knowable up front (from the manifest /
   * init segment) rather than accumulated as playback reads segments, and the
   * timeline renders it as a single whole-bar verdict instead of per-segment.
   *
   * Unsigned content is NOT this: no credentials to fail means Unknown, not
   * invalid.
   */
  wholeAssetInvalid?: boolean;
}

export type ValidationSessionListener = (snapshot: ValidationStatusSnapshot) => void;

export interface ValidationSession {
  readonly adapterKind: AdapterKind;
  load(): Promise<void>;
  dispose(): void;
  getStatusAt(time: number): ValidationStatusSnapshot;
  subscribe(listener: ValidationSessionListener): () => void;
}

export interface ValidationAdapterContext {
  videoElement: HTMLVideoElement;
  source: MediaSourceDescriptor;
  policy: ValidationPolicy;
}

export interface MediaValidationAdapter {
  readonly kind: AdapterKind;
  readonly capabilities: AdapterCapabilities;
  canHandle(source: MediaSourceDescriptor): boolean;
  createSession(context: ValidationAdapterContext): ValidationSession;
}

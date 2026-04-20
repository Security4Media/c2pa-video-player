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
import type { PlayerValidationState } from '@/types/c2pa.types';

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

export interface ValidationPolicy {
  enableTrustVerification: boolean;
}

export interface NormalizedC2PAResult {
  manifestStore: ManifestStore | null;
  validationState: PlayerValidationState;
  containsSignature: boolean;
  containsAIGeneratedContent: boolean;
  validationErrors: unknown[];
  activeManifest: Manifest | null;
  manifests: Record<string, Manifest>;
  reason?: string;
}

export interface ValidationTimelineSegment {
  startTime: number;
  endTime: number;
  validationState: PlayerValidationState;
  sourceSegmentId?: string;
  pending?: boolean;
}

export interface ValidationStatusSnapshot {
  adapterKind: AdapterKind;
  result: NormalizedC2PAResult | null;
  timelineSegments: ValidationTimelineSegment[];
  message: string;
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
  canHandle(source: MediaSourceDescriptor): boolean;
  createSession(context: ValidationAdapterContext): ValidationSession;
}


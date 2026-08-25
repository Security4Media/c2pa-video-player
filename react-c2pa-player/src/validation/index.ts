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

export { ValidationAdapterRegistry } from './registry';
export {
  createC2PAStatusFromResult,
  createC2PAStatusFromSnapshot,
  normalizeManifestStore,
} from './c2paResult';
export { DashFragmentedFmp4Adapter } from './dashAdapter';
export { createDefaultValidationAdapterRegistry } from './defaultRegistry';
export { HlsFragmentedFmp4Adapter } from './hlsAdapter';
export { MonolithicC2PAAdapter } from './monolithicAdapter';
export {
  createCompatibilityManifestStore,
  createUnknownResult,
  normalizeDashSegmentRecord,
  normalizeHlsManifestHelper,
  normalizeMonolithicManifestStore,
} from './normalization';
export { createDefaultValidationPolicy, LocalTrustMaterialProvider } from './policy';
export {
  getActiveManifest,
  getDashSegmentValidationState,
  getHlsValidationState,
  getManifestStoreValidationState,
} from './rules';
export { DashBridgeRuntime, HlsBridgeRuntime, MonolithicBridgeRuntime } from './runtimes';
export {
  createMediaSourceDescriptor,
  detectAdapterKind,
  getMimeTypeForExtension,
  KNOWN_MIME_TYPE_EXTENSIONS,
  type CreateMediaSourceDescriptorInput,
} from './sourceDetection';
export { FragmentedTimelineProjector } from './timeline';
export { UnsupportedValidationAdapter } from './unsupportedAdapter';
export type {
  AdapterCapabilities,
  AdapterKind,
  ManifestSource,
  MediaSourceDescriptor,
  MediaSourceOrigin,
  MediaValidationAdapter,
  NormalizedC2PAResult,
  PlayerValidationState,
  SegmentIntegrityStatus,
  TimeInterval,
  TimelineSegmentDiagnostic,
  TrustMaterial,
  TrustMaterialProvider,
  ValidationAdapterContext,
  ValidationPolicy,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
  ValidationTimelineSegment,
} from './types';

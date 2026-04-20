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
export { createDefaultValidationAdapterRegistry } from './defaultRegistry';
export { HlsFragmentedFmp4Adapter } from './hlsAdapter';
export { MonolithicC2PAAdapter } from './monolithicAdapter';
export {
  createMediaSourceDescriptor,
  detectAdapterKind,
  type CreateMediaSourceDescriptorInput,
} from './sourceDetection';
export { UnsupportedValidationAdapter } from './unsupportedAdapter';
export type {
  AdapterKind,
  MediaSourceDescriptor,
  MediaSourceOrigin,
  MediaValidationAdapter,
  NormalizedC2PAResult,
  ValidationAdapterContext,
  ValidationPolicy,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
  ValidationTimelineSegment,
} from './types';

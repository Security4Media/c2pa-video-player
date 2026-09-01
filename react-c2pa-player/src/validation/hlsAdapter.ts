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

import { HlsFragmentedFmp4Session } from './hlsSession';
// Imported straight from its module rather than through the runtimes barrel,
// which would pull dash.js and the monolithic engine in alongside it.
import { HlsBridgeRuntime } from './runtimes/hlsBridgeRuntime';
import { detectAdapterKind } from './sourceDetection';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
} from './types';

const HLS_CAPABILITIES = {
  ownsPlayback: true,
  providesTimelineSegments: true,
  supportsLookupByTime: true,
  supportsLive: false,
  requiresPlayerOwnership: true,
} as const;

/**
 * Wires the HLS session to the runtime that drives it.
 *
 * Kept apart from the session so the session depends only on
 * HlsValidationRuntime, and can therefore be exercised without hls.js or a
 * C2PA engine present.
 */
export class HlsFragmentedFmp4Adapter implements MediaValidationAdapter {
  readonly kind = 'hls-fragmented-fmp4' as const;
  readonly capabilities = HLS_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new HlsFragmentedFmp4Session(new HlsBridgeRuntime(context), context.videoElement);
  }
}

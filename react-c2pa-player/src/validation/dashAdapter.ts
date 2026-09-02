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

import { DashFragmentedFmp4Session } from './dashSession';
// Imported straight from its module rather than through the runtimes barrel,
// which would pull hls.js and the monolithic engine in alongside dash.js.
import { DashBridgeRuntime } from './runtimes/dashBridgeRuntime';
import { detectAdapterKind } from './sourceDetection';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
} from './types';

const DASH_CAPABILITIES = {
  ownsPlayback: true,
  providesTimelineSegments: true,
  supportsLookupByTime: true,
  supportsLive: true,
  requiresPlayerOwnership: true,
} as const;

/**
 * Wires the DASH session to the runtime that drives it.
 *
 * Kept apart from the session so the session depends only on
 * DashValidationRuntime, and can therefore be exercised without dash.js or the
 * C2PA plugin present.
 */
export class DashFragmentedFmp4Adapter implements MediaValidationAdapter {
  readonly kind = 'dash-fragmented-fmp4' as const;
  readonly capabilities = DASH_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new DashFragmentedFmp4Session(
      new DashBridgeRuntime(context),
      context.videoElement,
      context.policy.liveRetentionSeconds,
      context.policy.enforceValidatedPlayback,
    );
  }
}

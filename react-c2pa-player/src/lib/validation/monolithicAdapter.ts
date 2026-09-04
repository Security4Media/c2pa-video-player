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

import { MonolithicC2PASession } from './monolithicSession';
import { carriedSessionPolicy } from './policy';
// Imported straight from their modules rather than through the runtimes
// barrel, which would pull hls.js and dash.js in alongside them.
import { MonolithicBridgeRuntime } from './runtimes/monolithicBridgeRuntime';
import { MonolithicC2paWebRuntime } from './runtimes/monolithicC2paWebRuntime';
import { detectAdapterKind } from './sourceDetection';
import type {
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
} from './types';

const MONOLITHIC_CAPABILITIES = {
  ownsPlayback: false,
  providesTimelineSegments: false,
  supportsLookupByTime: false,
  supportsLive: false,
  requiresPlayerOwnership: false,
} as const;

/**
 * Wires the monolithic session to the runtime that drives it.
 *
 * Kept apart from the session so the session depends only on
 * MonolithicValidationRuntime, and can therefore be exercised without a C2PA
 * engine present.
 */
export class MonolithicC2PAAdapter implements MediaValidationAdapter {
  readonly kind = 'monolithic' as const;
  readonly capabilities = MONOLITHIC_CAPABILITIES;

  canHandle(source: MediaSourceDescriptor): boolean {
    return detectAdapterKind(source) === this.kind;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    const runtime =
      context.policy.monolithicEngine === 'c2pa-web'
        ? new MonolithicC2paWebRuntime(context)
        : new MonolithicBridgeRuntime(context);

    return new MonolithicC2PASession(runtime, carriedSessionPolicy(context.policy));
  }
}

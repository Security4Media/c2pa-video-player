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
  MediaSourceDescriptor,
  MediaValidationAdapter,
  ValidationAdapterContext,
  ValidationSession,
  ValidationSessionListener,
  ValidationStatusSnapshot,
} from './types';

export class UnsupportedValidationAdapter implements MediaValidationAdapter {
  readonly kind = 'unsupported' as const;
  readonly capabilities = {
    ownsPlayback: false,
    providesTimelineSegments: false,
    supportsLookupByTime: false,
    supportsLive: false,
    requiresPlayerOwnership: false,
  } as const;

  canHandle(): boolean {
    return true;
  }

  createSession(context: ValidationAdapterContext): ValidationSession {
    return new UnsupportedValidationSession(context.source);
  }
}

class UnsupportedValidationSession implements ValidationSession {
  readonly adapterKind = 'unsupported' as const;

  readonly #snapshot: ValidationStatusSnapshot;

  constructor(source: MediaSourceDescriptor) {
    this.#snapshot = {
      adapterKind: this.adapterKind,
      result: {
        manifestStore: null,
        validationState: 'Unknown',
        activeManifest: null,
      },
      timelineSegments: [],
      message: `Unsupported source type for ${source.displayName}`,
    };
  }

  async load(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {
    // Nothing to dispose.
  }

  getStatusAt(): ValidationStatusSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: ValidationSessionListener): () => void {
    listener(this.#snapshot);
    return () => {
      // No live subscription state.
    };
  }
}

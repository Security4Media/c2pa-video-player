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

import { detectAdapterKind } from './sourceDetection';
import type { MediaSourceDescriptor, MediaValidationAdapter } from './types';
import { UnsupportedValidationAdapter } from './unsupportedAdapter';

export class ValidationAdapterRegistry {
  readonly #adapters: MediaValidationAdapter[];
  readonly #fallbackAdapter = new UnsupportedValidationAdapter();

  constructor(adapters: MediaValidationAdapter[] = []) {
    this.#adapters = adapters;
  }

  resolve(source: MediaSourceDescriptor): MediaValidationAdapter {
    const adapterKind = detectAdapterKind(source);
    const adapter = this.#adapters.find(
      (candidate) => candidate.kind === adapterKind && candidate.canHandle(source)
    );

    return adapter ?? this.#fallbackAdapter;
  }
}


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

import type { ManifestStore } from '@contentauth/c2pa-web';
import { beforeEach, describe, expect, it } from 'vitest';
import { MonolithicC2PASession } from './monolithicSession';
import type { MonolithicValidationRuntime, RuntimeChangeListener } from './runtimes/contracts';
import type { ValidationStatusSnapshot } from './types';

class StubRuntime implements MonolithicValidationRuntime {
  store: ManifestStore | null = null;
  message = 'stub';
  #listeners = new Set<RuntimeChangeListener>();

  async load(): Promise<void> {}
  dispose(): void {}
  subscribe(listener: RuntimeChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  getManifestStore(): ManifestStore | null {
    return this.store;
  }
  getMessage(): string {
    return this.message;
  }
  notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * The WebCrypto engine's shape, which is what the monolithic runtime produces:
 * a declared verdict and a flat failure list, no `validation_results`.
 */
const store = (state: string, statuses: { code: string }[] = []): ManifestStore =>
  ({
    active_manifest: 'm',
    manifests: { m: { assertions: [{ label: 'cawg.identity' }] } },
    validation_state: state,
    validation_status: statuses,
  }) as unknown as ManifestStore;

describe('MonolithicC2PASession', () => {
  let runtime: StubRuntime;
  let session: MonolithicC2PASession;

  beforeEach(() => {
    runtime = new StubRuntime();
    session = new MonolithicC2PASession(runtime);
  });

  it('reports the verdict the engine declared', async () => {
    runtime.store = store('Trusted');
    await session.load();

    expect(session.getStatusAt().result?.validationState).toBe('Trusted');
  });

  it('distinguishes a signed but untrusted asset from a broken one', async () => {
    runtime.store = store('Valid', [{ code: 'signingCredential.untrusted' }]);
    await session.load();

    expect(session.getStatusAt().result?.validationState).toBe('Valid');
    expect(session.getStatusAt().wholeAssetInvalid).toBe(false);
  });

  it('condemns the whole asset when the one verdict covering it is invalid', async () => {
    // A whole-file asset has a single verdict, so this cannot wait on playback.
    runtime.store = store('Invalid', [{ code: 'assertion.hashedURI.mismatch' }]);
    await session.load();

    expect(session.getStatusAt().wholeAssetInvalid).toBe(true);
  });

  it('reports an unsigned asset as unknown rather than invalid', async () => {
    runtime.store = null;
    await session.load();

    expect(session.getStatusAt().result?.validationState).toBe('Unknown');
    expect(session.getStatusAt().wholeAssetInvalid).toBe(false);
  });

  it('carries the runtime message through, which is how "no manifest" is told', async () => {
    runtime.message = 'No C2PA manifest found in this asset';
    await session.load();

    expect(session.getStatusAt().message).toBe('No C2PA manifest found in this asset');
  });

  it('never reports timeline segments, having no fragments to report', async () => {
    runtime.store = store('Trusted');
    await session.load();

    expect(session.getStatusAt().timelineSegments).toEqual([]);
  });

  describe('reporting', () => {
    it('gives a subscriber the current snapshot immediately', () => {
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((snapshot) => seen.push(snapshot));

      expect(seen).toHaveLength(1);
      expect(seen[0].adapterKind).toBe('monolithic');
    });

    it('emits again when the runtime finishes reading the asset', async () => {
      await session.load();
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((snapshot) => seen.push(snapshot));

      runtime.store = store('Trusted');
      runtime.notify();

      expect(seen[seen.length - 1].result?.validationState).toBe('Trusted');
    });

    it('stops listening once disposed', async () => {
      await session.load();
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((snapshot) => seen.push(snapshot));
      const before = seen.length;

      session.dispose();
      runtime.notify();

      expect(seen).toHaveLength(before);
    });
  });
});

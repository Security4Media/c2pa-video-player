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

import { beforeEach, describe, expect, it } from 'vitest';
import { HlsFragmentedFmp4Session } from './hlsSession';
import type { FragmentVerdict } from './runtimes/hlsBridgeRuntime';
import type { HlsValidationRuntime, RuntimeChangeListener } from './runtimes/contracts';
import type { ValidationStatusSnapshot } from './types';

/**
 * The engine, reduced to what the session actually reads from it. Standing in
 * for hls.js plus a C2PA engine is what lets the session's own behaviour (what
 * playback has read, which failures condemn the asset) be checked here rather
 * than through a browser at 20 seconds a case.
 */
class StubRuntime implements HlsValidationRuntime {
  verdicts: FragmentVerdict[] = [];
  errorReason: string | null = null;
  #listeners = new Set<RuntimeChangeListener>();

  async load(): Promise<void> {}
  dispose(): void {}
  subscribe(listener: RuntimeChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  isLive(): boolean | null {
    return false;
  }
  lookup(): null {
    // No reader: the session then falls back to its own last known result,
    // which keeps these cases about the timeline rather than the menu.
    return null;
  }
  getFragmentVerdicts(): FragmentVerdict[] {
    return this.verdicts;
  }
  getMessage(): string {
    return 'stub';
  }
  getErrorReason(): string | null {
    return this.errorReason;
  }
  notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * Only the three flags isActuallyPlaying reads, and mutable, which the real
 * element's readonly properties are not: a test needs to put playback into a
 * seek partway through.
 */
interface PlaybackFlags {
  paused: boolean;
  seeking: boolean;
  ended: boolean;
}

function videoElement(state: Partial<PlaybackFlags> = {}): PlaybackFlags {
  return { paused: false, seeking: false, ended: false, ...state };
}

const fragment = (
  index: number,
  validationState: FragmentVerdict['validationState'],
  failureScope: FragmentVerdict['failureScope'] = null,
): FragmentVerdict => ({
  index,
  startTime: (index - 1) * 8,
  endTime: index * 8,
  validationState,
  failureScope,
});

/** Sixteen fragments, all validated ahead of playback as a real prefetch does. */
const allTrusted = Array.from({ length: 16 }, (_, i) => fragment(i + 1, 'Trusted'));

describe('HlsFragmentedFmp4Session', () => {
  let runtime: StubRuntime;
  let element: PlaybackFlags;
  let session: HlsFragmentedFmp4Session;

  beforeEach(() => {
    runtime = new StubRuntime();
    // Held mutable so a test can put the element into a seek partway through,
    // the way the player does.
    element = videoElement();
    session = new HlsFragmentedFmp4Session(runtime, element as unknown as HTMLVideoElement);
  });

  /** Advances playback, as the player's timeupdate ticks would. */
  const play = (from: number, to: number, step = 0.25) => {
    for (let time = from; time <= to + 1e-9; time += step) session.getStatusAt(time);
  };

  const snapshot = () => session.getStatusAt(0) as ValidationStatusSnapshot;
  const coloured = (segments: ValidationStatusSnapshot['timelineSegments'], time: number) =>
    segments.some((segment) => time >= segment.startTime && time < segment.endTime);

  describe('what the timeline may show', () => {
    it('shows nothing before playback, however much has been validated', () => {
      runtime.verdicts = allTrusted;

      expect(snapshot().timelineSegments).toHaveLength(0);
    });

    it('shows only what playback has reached, not everything validated ahead of it', () => {
      runtime.verdicts = allTrusted;
      play(0, 20);

      const { timelineSegments } = session.getStatusAt(20);
      expect(coloured(timelineSegments, 10)).toBe(true);
      expect(coloured(timelineSegments, 100)).toBe(false);
    });

    it('leaves a stretch that was skipped over uncoloured', () => {
      runtime.verdicts = allTrusted;
      play(0, 5);

      // The seek itself: the element reports seeking, so the jump is not
      // playback and must not claim everything it passed over.
      element.seeking = true;
      session.getStatusAt(60);
      element.seeking = false;
      play(60, 64);

      const { timelineSegments } = session.getStatusAt(64);
      expect(coloured(timelineSegments, 2)).toBe(true);
      expect(coloured(timelineSegments, 62)).toBe(true);
      expect(coloured(timelineSegments, 30)).toBe(false);
    });

    it('colours nothing while the viewer only scrubs', () => {
      runtime.verdicts = allTrusted;
      element.paused = true;
      for (let time = 0; time <= 120; time += 0.25) session.getStatusAt(time);

      expect(session.getStatusAt(120).timelineSegments).toHaveLength(0);
    });

    it('keeps a fragment invalid where it is, without spreading', () => {
      runtime.verdicts = [
        fragment(1, 'Trusted'),
        fragment(2, 'Invalid', 'fragment'),
        fragment(3, 'Trusted'),
      ];
      play(0, 24);

      const states = session.getStatusAt(24).timelineSegments.map((s) => s.validationState);
      expect(states).toEqual(['Trusted', 'Invalid', 'Trusted']);
    });
  });

  describe('what condemns the whole asset', () => {
    it('does not, for a tampered fragment', () => {
      // Otherwise the bar fills red and hides which parts were altered.
      runtime.verdicts = [fragment(1, 'Trusted'), fragment(2, 'Invalid', 'fragment')];
      play(0, 16);

      expect(session.getStatusAt(16).wholeAssetInvalid).toBe(false);
    });

    it('does, for a broken manifest, before playback has read anything', () => {
      // Every fragment reports it, and the asset is condemned from the first.
      runtime.verdicts = allTrusted.map((f) => ({
        ...f,
        validationState: 'Invalid' as const,
        failureScope: 'manifest' as const,
      }));

      expect(snapshot().wholeAssetInvalid).toBe(true);
    });

    it('does not, for an untrusted signer, whose content is still intact', () => {
      runtime.verdicts = [fragment(1, 'Valid', 'manifest')];
      play(0, 8);

      expect(session.getStatusAt(8).wholeAssetInvalid).toBe(false);
    });
  });

  describe('reporting', () => {
    it('gives a subscriber the current snapshot immediately', () => {
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((s) => seen.push(s));

      expect(seen).toHaveLength(1);
      expect(seen[0].adapterKind).toBe('hls-fragmented-fmp4');
    });

    it('emits again when the runtime reports new state', async () => {
      await session.load();
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((s) => seen.push(s));

      runtime.verdicts = allTrusted;
      runtime.notify();

      expect(seen.length).toBeGreaterThan(1);
    });

    it('carries the policy the player layer acts on', () => {
      // A regression guard. HLS took a retention and nothing else, so
      // `?gate=off` was silently inert on every HLS source: the field never
      // reached the snapshot `main.ts` reads it from. One carried object now,
      // so a new setting cannot reach one session and miss another.
      const carrying = new HlsFragmentedFmp4Session(
        runtime,
        element as unknown as HTMLVideoElement,
        undefined,
        {
          enforceValidatedPlayback: false,
          showAuthenticityLabel: true,
          consentMode: 'per-run',
        },
      );

      expect(carrying.getStatusAt(0)).toMatchObject({
        enforceValidatedPlayback: false,
        showAuthenticityLabel: true,
        consentMode: 'per-run',
      });
    });

    it('says nothing about policy when it was given none', () => {
      // Absent rather than defaulted, because every reader already treats
      // undefined as its own default.
      const snapshot = session.getStatusAt(0);

      expect(snapshot.enforceValidatedPlayback).toBeUndefined();
      expect(snapshot.showAuthenticityLabel).toBeUndefined();
      expect(snapshot.consentMode).toBeUndefined();
    });

    it('stops listening once disposed', async () => {
      await session.load();
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((s) => seen.push(s));
      const before = seen.length;

      session.dispose();
      runtime.notify();

      expect(seen).toHaveLength(before);
    });
  });
});

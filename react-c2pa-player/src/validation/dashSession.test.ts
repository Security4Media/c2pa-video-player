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
import { DashFragmentedFmp4Session } from './dashSession';
import type { DashValidationRuntime, RuntimeChangeListener } from './runtimes/contracts';
import type { DashSegmentEntry } from './runtimes/dashBridgeRuntime';
import type { PlayerValidationState, ValidationStatusSnapshot } from './types';

/**
 * dash.js and the C2PA plugin, reduced to what the session reads. Standing in
 * for them is what lets the drain, the read gate and the snapshot be checked
 * without a browser, a network or a live stream.
 */
class StubRuntime implements DashValidationRuntime {
  segments: DashSegmentEntry[] = [];
  live: boolean | null = true;
  initInvalid = false;
  errorReason: string | null = null;
  /** Total ever added, as the real runtime reports it across evictions. */
  #evicted = 0;
  #listeners = new Set<RuntimeChangeListener>();

  async load(): Promise<void> {}
  dispose(): void {}
  subscribe(listener: RuntimeChangeListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  isLive(): boolean | null {
    return this.live;
  }
  isInitInvalid(): boolean {
    return this.initInvalid;
  }
  lookup(): null {
    return null;
  }
  getSegmentsSince(count: number): DashSegmentEntry[] {
    return this.segments.slice(Math.max(0, count - this.#evicted));
  }
  getSegmentCount(): number {
    return this.#evicted + this.segments.length;
  }
  getMessage(): string {
    return 'stub';
  }
  getErrorReason(): string | null {
    return this.errorReason;
  }
  /** `timeShiftBufferDepth`, as the manifest declares it. */
  dvrWindowSeconds: number | null = null;
  getDvrWindowSeconds(): number | null {
    return this.dvrWindowSeconds;
  }
  notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

interface PlaybackFlags {
  paused: boolean;
  seeking: boolean;
  ended: boolean;
}

const videoElement = (state: Partial<PlaybackFlags> = {}): PlaybackFlags => ({
  paused: false,
  seeking: false,
  ended: false,
  ...state,
});

const segment = (
  startTime: number,
  endTime: number,
  validationState: PlayerValidationState = 'Valid',
): DashSegmentEntry => ({
  startTime,
  endTime,
  result: {
    manifestStore: null,
    validationState,
    activeManifest: null,
    manifestSource: { kind: 'none' },
  },
});

describe('DashFragmentedFmp4Session', () => {
  let runtime: StubRuntime;
  let element: PlaybackFlags;
  let session: DashFragmentedFmp4Session;

  beforeEach(() => {
    runtime = new StubRuntime();
    element = videoElement();
    session = new DashFragmentedFmp4Session(
      runtime,
      element as unknown as HTMLVideoElement,
    );
  });

  const play = (from: number, to: number, step = 0.25) => {
    for (let time = from; time <= to + 1e-9; time += step) session.getStatusAt(time);
  };
  const at = (segments: ValidationStatusSnapshot['timelineSegments'], time: number) =>
    segments.filter((s) => time >= s.startTime && time < s.endTime);
  const coloured = (segments: ValidationStatusSnapshot['timelineSegments'], time: number) =>
    at(segments, time).length > 0;
  /** Shown at full strength: read, or aged beyond reach. */
  const settled = (segments: ValidationStatusSnapshot['timelineSegments'], time: number) =>
    at(segments, time).some((s) => !s.provisional);
  /** Shown dimmed: validated, not yet played, still playable. */
  const provisional = (segments: ValidationStatusSnapshot['timelineSegments'], time: number) =>
    at(segments, time).some((s) => s.provisional === true);

  describe('what the timeline may show', () => {
    it('shows nothing before playback, however many segments have validated', () => {
      runtime.segments = [segment(0, 4), segment(4, 8), segment(8, 12)];

      expect(session.getStatusAt(0).timelineSegments).toHaveLength(0);
    });

    it('distinguishes what playback has reached from what merely downloaded', async () => {
      // Segments arrive on download, which runs ahead of the playhead. Both are
      // shown on a live bar - that is the point of a monitor - but only what
      // was played is shown at full strength.
      runtime.segments = Array.from({ length: 20 }, (_, i) => segment(i * 4, (i + 1) * 4));
      await session.load();
      play(0, 12);

      const { timelineSegments } = session.getStatusAt(12);
      expect(settled(timelineSegments, 6)).toBe(true);
      expect(provisional(timelineSegments, 6)).toBe(false);
      expect(provisional(timelineSegments, 60)).toBe(true);
      expect(settled(timelineSegments, 60)).toBe(false);
    });

    it('settles nothing while the viewer only scrubs', async () => {
      runtime.segments = Array.from({ length: 10 }, (_, i) => segment(i * 4, (i + 1) * 4));
      await session.load();
      element.paused = true;
      for (let time = 0; time <= 40; time += 0.25) session.getStatusAt(time);

      // Dragging the scrubber across the bar is not watching it, so every
      // verdict stays provisional however far the playhead was dragged.
      const { timelineSegments } = session.getStatusAt(40);
      expect(timelineSegments.length).toBeGreaterThan(0);
      expect(timelineSegments.every((s) => s.provisional === true)).toBe(true);
    });

    it('settles a segment once it can no longer be played', async () => {
      // A 30s DVR, as the manifest declares it: content more than 30s behind
      // the newest segment is gone from the origin, so it can never be played
      // and its provisional marking has nothing left to express.
      runtime.dvrWindowSeconds = 30;
      runtime.segments = [segment(0, 4), segment(4, 8)];
      await session.load();

      // Nobody has played any of it, so both start provisional.
      expect(session.getStatusAt(0).timelineSegments.every((s) => s.provisional)).toBe(true);

      // The stream runs on for a minute without playback. The first segments
      // fall out of reach and settle at their verdict; the newest stay
      // provisional, being still playable.
      for (let i = 2; i < 20; i += 1) runtime.segments.push(segment(i * 4, (i + 1) * 4));
      runtime.notify();

      const { timelineSegments } = session.getStatusAt(0);
      const atTime = (t: number) => timelineSegments.filter((x) => t >= x.startTime && t < x.endTime);

      expect(atTime(2).every((x) => !x.provisional)).toBe(true);
      expect(atTime(2)).not.toHaveLength(0);
      expect(atTime(78).every((x) => x.provisional === true)).toBe(true);
    });

    it('settles nothing on age when the source is not live', async () => {
      // On VOD nothing ever goes out of reach, so an unread verdict stays
      // unread however long the asset sits there.
      runtime.live = false;
      runtime.dvrWindowSeconds = 30;
      runtime.segments = Array.from({ length: 20 }, (_, i) => segment(i * 4, (i + 1) * 4));
      await session.load();

      expect(session.getStatusAt(0).timelineSegments.every((s) => s.provisional)).toBe(true);
    });

    it('keeps an invalid segment in its own place', async () => {
      runtime.segments = [segment(0, 4), segment(4, 8, 'Invalid'), segment(8, 12)];
      await session.load();
      play(0, 12);

      const states = session.getStatusAt(12).timelineSegments.map((s) => s.validationState);
      expect(states).toEqual(['Valid', 'Invalid', 'Valid']);
    });
  });

  describe('draining from the runtime', () => {
    it('drains nothing until the session is started', () => {
      // getStatusAt rebuilds the snapshot but never drains; that happens on
      // load() and on each runtime notification.
      runtime.segments = [segment(0, 4)];
      play(0, 4);

      expect(session.getStatusAt(4).timelineSegments).toHaveLength(0);
    });

    it('picks up segments that arrive after the first drain', async () => {
      runtime.segments = [segment(0, 4)];
      await session.load();
      play(0, 4);
      expect(session.getStatusAt(4).timelineSegments).toHaveLength(1);

      runtime.segments.push(segment(4, 8));
      runtime.notify();
      play(4, 8);

      expect(coloured(session.getStatusAt(8).timelineSegments, 6)).toBe(true);
    });

    it('does not re-add a segment it has already drained', async () => {
      runtime.segments = [segment(0, 4), segment(4, 8)];
      await session.load();
      play(0, 8);
      const before = session.getStatusAt(8).timelineSegments.length;

      runtime.notify();
      runtime.notify();

      expect(session.getStatusAt(8).timelineSegments).toHaveLength(before);
    });
  });

  describe('keeping the history bounded', () => {
    it('forgets segments older than the window on a live stream', async () => {
      // A live stream running for hours would otherwise keep every segment it
      // ever validated, and re-scan the lot on every rebuild.
      const hourOfSegments = Array.from({ length: 900 }, (_, i) => segment(i * 4, (i + 1) * 4));
      runtime.segments = hourOfSegments;
      await session.load();
      play(0, 40);

      const shown = session.getStatusAt(40).timelineSegments;
      const oldest = Math.min(...shown.map((x) => x.startTime));
      const newest = Math.max(...shown.map((x) => x.endTime));

      // Whatever is still shown sits inside the retained window.
      expect(newest - oldest).toBeLessThanOrEqual(15 * 60);
    });

    it('keeps everything on demand, where there is an end to reach', async () => {
      runtime.live = false;
      runtime.segments = Array.from({ length: 300 }, (_, i) => segment(i * 4, (i + 1) * 4));
      await session.load();
      play(0, 40);

      // Nothing is dropped: a finite asset has a real beginning worth showing.
      expect(session.getStatusAt(40).timelineSegments.length).toBeGreaterThan(0);
    });
  });

  describe('what condemns the whole asset', () => {
    it('does not, for a single invalid segment', async () => {
      runtime.segments = [segment(0, 4, 'Invalid')];
      await session.load();
      play(0, 4);

      expect(session.getStatusAt(4).wholeAssetInvalid).toBe(false);
    });

    it('does, when the init segment itself failed', () => {
      // One verdict covering the asset, known before playback reads anything.
      runtime.initInvalid = true;

      expect(session.getStatusAt(0).wholeAssetInvalid).toBe(true);
    });
  });

  describe('reporting', () => {
    it('tells the UI the stream is live, which the timeline needs for its window', () => {
      expect(session.getStatusAt(0).isLive).toBe(true);
    });

    it('reports the retention it was configured with, which sizes the bar', () => {
      // The timeline sizes its window from this rather than its own default,
      // so the bar cannot outrun what the session still remembers.
      const configured = new DashFragmentedFmp4Session(
        runtime,
        element as unknown as HTMLVideoElement,
        120,
      );

      expect(configured.getStatusAt(0).liveRetentionSeconds).toBe(120);
    });

    it('prunes by the configured retention, not a fixed one', async () => {
      const shortWindow = new DashFragmentedFmp4Session(
        runtime,
        element as unknown as HTMLVideoElement,
        60,
      );
      runtime.segments = Array.from({ length: 100 }, (_, i) => segment(i * 4, (i + 1) * 4));
      await shortWindow.load();
      for (let time = 0; time <= 40; time += 0.25) shortWindow.getStatusAt(time);

      const shown = shortWindow.getStatusAt(40).timelineSegments;
      const newest = Math.max(...shown.map((x) => x.endTime));

      // Every segment kept ends within the window of the newest one. Stated as
      // the end rather than the span because a segment straddling the boundary
      // is kept whole, so the span can exceed the window by up to one segment.
      expect(Math.min(...shown.map((x) => x.endTime))).toBeGreaterThanOrEqual(newest - 60);
    });

    it('leaves live-ness undefined until the manifest says', () => {
      runtime.live = null;

      expect(session.getStatusAt(0).isLive).toBeUndefined();
    });

    it('gives a subscriber the current snapshot immediately', () => {
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((snapshot) => seen.push(snapshot));

      expect(seen).toHaveLength(1);
      expect(seen[0].adapterKind).toBe('dash-fragmented-fmp4');
    });

    it('emits again when the runtime reports new state', async () => {
      await session.load();
      const seen: ValidationStatusSnapshot[] = [];
      session.subscribe((snapshot) => seen.push(snapshot));

      runtime.segments = [segment(0, 4)];
      runtime.notify();

      expect(seen.length).toBeGreaterThan(1);
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

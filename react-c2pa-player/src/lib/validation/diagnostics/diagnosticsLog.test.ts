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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDiagnostics,
  readDiagnostics,
  recordDiagnostic,
  resetDiagnosticsForTest,
  setDiagnosticsRetention,
  subscribeDiagnostics,
} from './diagnosticsLog';

const segment = (segmentNumber: number, severity: 'info' | 'failure' = 'info') => ({
  severity,
  engine: 'dash',
  topic: 'segment',
  status: severity === 'failure' ? 'invalid' : 'valid',
  mediaType: 'video',
  segmentNumber,
});

beforeEach(() => {
  resetDiagnosticsForTest();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recording', () => {
  it('keeps entries in the order they happened', () => {
    recordDiagnostic(segment(1));
    recordDiagnostic(segment(2));

    expect(readDiagnostics().map((entry) => entry.segmentNumber)).toEqual([1, 2]);
  });

  it('replaces the snapshot rather than mutating it', () => {
    // useSyncExternalStore compares by reference: a mutated array would look
    // unchanged and the console would never repaint.
    recordDiagnostic(segment(1));
    const before = readDiagnostics();
    recordDiagnostic(segment(2));

    expect(readDiagnostics()).not.toBe(before);
    expect(before).toHaveLength(1);
  });

  it('notifies subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDiagnostics(listener);

    recordDiagnostic(segment(1));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    recordDiagnostic(segment(2));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('numbers entries monotonically, so rows have a stable key', () => {
    recordDiagnostic(segment(1));
    recordDiagnostic(segment(2));

    const [first, second] = readDiagnostics();
    expect(second.id).toBeGreaterThan(first.id);
  });
});

describe('de-duplication', () => {
  it('ignores a repeat of a key already held', () => {
    // HLS is polled, so the session re-reports every fragment on every tick.
    // Without this the log would gain dozens of duplicate rows a second.
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });

    expect(readDiagnostics()).toHaveLength(1);
  });

  it('logs a fragment again when its verdict changes', () => {
    // The verdict is part of the key at the call site, so an upgrade from
    // Unknown to Trusted is a second line rather than a lost transition.
    recordDiagnostic({ ...segment(1), key: 'hls:1:Unknown' });
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });

    expect(readDiagnostics()).toHaveLength(2);
  });

  it('does not de-duplicate entries with no key', () => {
    // DASH pushes once per segment, so identical rows there are real.
    recordDiagnostic(segment(1));
    recordDiagnostic(segment(1));

    expect(readDiagnostics()).toHaveLength(2);
  });

  it('lets a key be used again once its entry has been pruned', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T20:00:00Z'));
    setDiagnosticsRetention(60);
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });

    vi.setSystemTime(new Date('2026-09-02T20:05:00Z'));
    recordDiagnostic({ ...segment(2), key: 'hls:2:Trusted' });

    // The first row aged out, so the fragment reappearing is worth logging.
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });

    expect(readDiagnostics().map((entry) => entry.segmentNumber)).toEqual([2, 1]);
  });
});

describe('retention', () => {
  it('drops entries older than the configured window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T20:00:00Z'));
    setDiagnosticsRetention(60);
    recordDiagnostic(segment(1));

    vi.setSystemTime(new Date('2026-09-02T20:02:00Z'));
    recordDiagnostic(segment(2));

    expect(readDiagnostics().map((entry) => entry.segmentNumber)).toEqual([2]);
  });

  it('re-prunes when the window narrows', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T20:00:00Z'));
    recordDiagnostic(segment(1));
    vi.setSystemTime(new Date('2026-09-02T20:04:00Z'));
    recordDiagnostic(segment(2));
    expect(readDiagnostics()).toHaveLength(2);

    // A stream whose DVR is shallower than the default.
    setDiagnosticsRetention(60);

    expect(readDiagnostics().map((entry) => entry.segmentNumber)).toEqual([2]);
  });

  it('ignores an unusable retention rather than discarding everything', () => {
    recordDiagnostic(segment(1));
    setDiagnosticsRetention(0);
    setDiagnosticsRetention(Number.NaN);
    setDiagnosticsRetention(-30);

    expect(readDiagnostics()).toHaveLength(1);
  });

  it('caps ordinary entries but keeps the newest', () => {
    for (let index = 1; index <= 450; index += 1) {
      recordDiagnostic(segment(index));
    }

    const kept = readDiagnostics();
    expect(kept).toHaveLength(400);
    expect(kept[kept.length - 1].segmentNumber).toBe(450);
  });

  it('keeps failures while ordinary entries are pushed out', () => {
    // The whole point of the console: something failed twenty minutes of
    // segments ago and someone wants to find it.
    recordDiagnostic(segment(1, 'failure'));
    for (let index = 2; index <= 450; index += 1) {
      recordDiagnostic(segment(index));
    }

    expect(readDiagnostics().some((entry) => entry.severity === 'failure')).toBe(true);
    expect(readDiagnostics()[0].segmentNumber).toBe(1);
  });

  it('caps failures too, so a stream failing on every segment is bounded', () => {
    for (let index = 1; index <= 260; index += 1) {
      recordDiagnostic(segment(index, 'failure'));
    }

    expect(readDiagnostics()).toHaveLength(200);
  });
});

describe('clearing', () => {
  it('empties the log when a new source loads', () => {
    recordDiagnostic(segment(1));
    clearDiagnostics();

    expect(readDiagnostics()).toHaveLength(0);
  });

  it('frees the keys too, so the next source logs its own fragment 1', () => {
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });
    clearDiagnostics();
    recordDiagnostic({ ...segment(1), key: 'hls:1:Trusted' });

    expect(readDiagnostics()).toHaveLength(1);
  });
});

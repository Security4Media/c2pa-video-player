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

/**
 * The per-segment record behind the debug console.
 *
 * This is deliberately the *only* place engine-level detail is kept, and the
 * console is the only thing that reads it. Segment numbers, media types,
 * `sequenceReason` strings and `errorCodes` are exactly what a viewer should
 * never be shown: they were in the Content Credentials menu, where someone
 * asking "can I trust this?" got "The segments between 00:08-00:12,
 * 00:16-00:20 may have been tampered with" - a sentence that reads as an
 * inventory and answers a question nobody asked. The menu now says what
 * happened in one sentence; the inventory lives here.
 *
 * A module singleton, following liveWindowState.ts. One player exists at a
 * time, and the log has to be readable from a React tree the runtimes know
 * nothing about; threading it through the status snapshot would mean copying
 * the whole log four times a second. `clearDiagnostics` runs when a source
 * loads, so one stream's log never shows under another's.
 */

import { DEFAULT_LIVE_RETENTION_SECONDS } from '../policy/liveRetention';

/** Whether an entry is a problem, or just a record of work done. */
export type DiagnosticSeverity = 'info' | 'failure';

export interface DiagnosticEntry {
  /** Monotonic, so a view can key rows without relying on timestamps. */
  id: number;
  /** Wall clock in ms, for the console's own column. */
  at: number;
  severity: DiagnosticSeverity;
  /** Which engine produced it: 'dash', 'hls'. */
  engine: string;
  /** What the entry is about: 'segment', 'init', 'stream'. */
  topic: string;
  /** The engine's own status word, unaltered. */
  status?: string;
  mediaType?: string;
  segmentNumber?: number;
  /** Where in the stream, in the stream's own time base. */
  startTime?: number;
  endTime?: number;
  /**
   * A sequence anomaly the engine reported: a gap, a duplicate, a segment out
   * of order. Only ever set when there actually is one - see the note in
   * dashBridgeRuntime about the plugin reporting `sequenceReason: 'valid'` on
   * healthy segments.
   */
  sequenceReason?: string;
  errorCodes?: string[];
  /**
   * How far a failure reaches: one fragment, or the whole asset. The HLS
   * bridge knows this and the DASH plugin does not, which is why it is its own
   * field rather than folded into the status.
   */
  scope?: string;
  /**
   * The rendition the segment came from, where the engine reports one.
   *
   * Worth a column: a quality switch is the first thing anyone suspects when
   * validation starts behaving oddly, and until now there was no way to see
   * whether one had happened.
   */
  quality?: string;
  /** Free text, for anything not about one segment. */
  message?: string;
  /**
   * Identity for de-duplication, kept on the entry so that pruning a row
   * releases its key without any separate bookkeeping.
   *
   * Needed because the two engines report at different rhythms. DASH pushes
   * once per segment and needs none; HLS is polled - the session
   * re-enumerates every fragment on every tick - so without a key the log
   * would gain dozens of duplicate rows a second. Put the verdict in the key
   * at the call site and a fragment whose verdict later changes correctly
   * logs a second line.
   */
  key?: string;
}

export type DiagnosticInput = Omit<DiagnosticEntry, 'id' | 'at'>;

/**
 * How many ordinary entries to keep.
 *
 * A five-minute window at ~3.84s segments is about 78 rows, and more than one
 * media type reports, so a few hundred covers the window with room for a
 * stream whose segments are shorter. Past that the oldest go: this is a live
 * log, and failures - what anyone actually scrolls back for - are kept under
 * their own rule below.
 */
const INFO_CAP = 400;

/**
 * How many failures to keep, whatever their age.
 *
 * Failures are retained for the configured window rather than by count, but a
 * stream failing on every segment would otherwise grow without limit, and this
 * is a browser tab.
 */
const FAILURE_CAP = 200;

let entries: DiagnosticEntry[] = [];
let nextId = 1;
let retentionSeconds = DEFAULT_LIVE_RETENTION_SECONDS;
let listeners = new Set<() => void>();

/**
 * A snapshot replaced rather than mutated.
 *
 * `useSyncExternalStore` compares by reference, so a mutated array would look
 * unchanged and the console would never repaint.
 */
let snapshot: readonly DiagnosticEntry[] = [];
/** Rebuilt from `entries` on every change, so it can never disagree with them. */
let keys = new Set<string>();

function publish() {
  snapshot = entries.slice();
  keys = new Set(
    entries.map((entry) => entry.key).filter((key): key is string => key !== undefined),
  );
  listeners.forEach((listener) => listener());
}

/** Drops what is too old or too plentiful, newest kept. */
function prune(now: number) {
  const cutoff = now - retentionSeconds * 1000;
  let failuresKept = 0;
  let infoKept = 0;
  const kept: DiagnosticEntry[] = [];

  // Newest first, so "keep the most recent N" is just a running count.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry.at < cutoff) {
      continue;
    }

    if (entry.severity === 'failure') {
      if (failuresKept < FAILURE_CAP) {
        failuresKept += 1;
        kept.push(entry);
      }
    } else if (infoKept < INFO_CAP) {
      infoKept += 1;
      kept.push(entry);
    }
  }

  kept.reverse();
  entries = kept;
}

/** Adds one entry, unless an entry with the same key is already held. */
export function recordDiagnostic(input: DiagnosticInput): void {
  if (input.key !== undefined && keys.has(input.key)) {
    return;
  }

  const entry: DiagnosticEntry = { id: nextId, at: Date.now(), ...input };

  nextId += 1;
  entries.push(entry);
  prune(entry.at);
  publish();
}

/** Oldest first, which is how a log reads. */
export function readDiagnostics(): readonly DiagnosticEntry[] {
  return snapshot;
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Called when a source loads, so one stream's log never shows under another. */
export function clearDiagnostics(): void {
  entries = [];
  publish();
}

/** Follows the adapter's retention, so the console keeps what the bar shows. */
export function setDiagnosticsRetention(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds === retentionSeconds) {
    return;
  }

  retentionSeconds = seconds;
  prune(Date.now());
  publish();
}

/** For tests, which must not inherit another case's counter or listeners. */
export function resetDiagnosticsForTest(): void {
  entries = [];
  nextId = 1;
  retentionSeconds = DEFAULT_LIVE_RETENTION_SECONDS;
  listeners = new Set();
  publish();
}

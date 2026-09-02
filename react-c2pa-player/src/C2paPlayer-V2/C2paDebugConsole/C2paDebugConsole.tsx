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
 * The validation log: what the engines actually reported, segment by segment.
 *
 * This is where the technical detail lives now. The Content Credentials menu
 * used to carry it - segment ranges, integrity statuses, `sequenceReason`
 * strings - and that was the wrong place for it twice over: it buried the one
 * sentence a viewer needs under an inventory, and it was never enough detail to
 * diagnose anything anyway. The menu answers "can I trust this?"; this answers
 * "what happened?".
 */

import { useMemo, useState, useSyncExternalStore } from 'react';
import {
    readDiagnostics,
    subscribeDiagnostics,
    type DiagnosticEntry,
} from '@/validation/diagnostics/diagnosticsLog';

/**
 * Times above this are read as a Unix epoch rather than an offset.
 *
 * Same threshold and the same reason as the timeline's hover preview: a live
 * DASH period with `availabilityStartTime` in 1970 puts stream positions near
 * 1.79e9, and formatting one as an offset gives "29800154:12".
 */
const EPOCH_THRESHOLD_SECONDS = 1e8;

function formatWallClock(atMs: number): string {
    return new Date(atMs).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/** Where in the stream, written the way that stream's times read. */
function formatPosition(entry: DiagnosticEntry): string {
    const { startTime, endTime } = entry;

    if (startTime === undefined || !Number.isFinite(startTime)) {
        return '—';
    }

    if (startTime >= EPOCH_THRESHOLD_SECONDS) {
        return formatWallClock(startTime * 1000);
    }

    const duration =
        endTime !== undefined && Number.isFinite(endTime) ? endTime - startTime : null;

    return duration !== null
        ? `${startTime.toFixed(2)}s +${duration.toFixed(2)}s`
        : `${startTime.toFixed(2)}s`;
}

/** The right-hand column: whatever the engine said beyond a bare status. */
function formatDetail(entry: DiagnosticEntry): string {
    const parts = [
        entry.sequenceReason,
        entry.scope ? `scope: ${entry.scope}` : undefined,
        entry.errorCodes?.join(', '),
        entry.quality ? `quality ${entry.quality}` : undefined,
        entry.message,
    ].filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(' · ') : '';
}

export function C2paDebugConsole({ onClose }: { onClose: () => void }) {
    const [failuresOnly, setFailuresOnly] = useState(false);
    const entries = useSyncExternalStore(
        subscribeDiagnostics,
        readDiagnostics,
        readDiagnostics,
    );

    const failureCount = useMemo(
        () => entries.filter((entry) => entry.severity === 'failure').length,
        [entries],
    );
    const rows = useMemo(() => {
        const chosen = failuresOnly
            ? entries.filter((entry) => entry.severity === 'failure')
            : entries;

        // Newest first. A log usually appends at the bottom, but this one grows
        // while the viewer is reading it, and following the tail would mean
        // scrolling the panel under their pointer on every segment - or
        // guessing when they had scrolled away and wanted to be left alone.
        // Newest at the top needs neither.
        return chosen.slice().reverse();
    }, [entries, failuresOnly]);

    // `role="region"`, not `dialog`: nothing here is modal. The control bar
    // stays above and clickable, and focus is moved in but not trapped, so
    // claiming `dialog` without `aria-modal` would promise behaviour the panel
    // does not have. `tabIndex={-1}` so the overlay can move focus here.
    return (
        <div
            className="c2pa-debug-console"
            role="region"
            aria-label="Validation log"
            tabIndex={-1}
        >
            <div className="c2pa-debug-console__head">
                <span className="c2pa-debug-console__title">Validation log</span>
                <span className="c2pa-debug-console__count">
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                    {failureCount > 0 ? `, ${failureCount} failed` : ''}
                </span>
                <label className="c2pa-debug-console__filter">
                    <input
                        type="checkbox"
                        checked={failuresOnly}
                        onChange={(event) => setFailuresOnly(event.target.checked)}
                    />
                    Failures only
                </label>
                <button
                    type="button"
                    className="c2pa-debug-console__close"
                    onClick={onClose}
                    aria-label="Close validation log"
                >
                    ×
                </button>
            </div>

            {/* Headers, because without them the columns are guesswork: a
                lone "fragment" or "gap_detected" in the last column reads as
                noise until you know what the column is for. */}
            <div className="c2pa-debug-console__grid c2pa-debug-console__header">
                <span>Logged</span>
                <span>Source</span>
                <span>Status</span>
                <span>Position</span>
                <span>Detail</span>
            </div>

            {rows.length === 0 ? (
                <p className="c2pa-debug-console__empty">
                    {failuresOnly
                        ? 'Nothing has failed validation.'
                        : 'No segments have been validated yet.'}
                </p>
            ) : (
                <ol className="c2pa-debug-console__rows">
                    {rows.map((entry) => (
                        <li
                            key={entry.id}
                            className={`c2pa-debug-console__grid c2pa-debug-console__row c2pa-debug-console__row--${entry.severity}`}
                        >
                            <span className="c2pa-debug-console__at">{formatWallClock(entry.at)}</span>
                            <span className="c2pa-debug-console__what">
                                {entry.engine} {entry.topic}
                                {entry.segmentNumber !== undefined ? ` #${entry.segmentNumber}` : ''}
                                {entry.mediaType ? ` (${entry.mediaType})` : ''}
                            </span>
                            <span className="c2pa-debug-console__status">{entry.status ?? '—'}</span>
                            <span className="c2pa-debug-console__position">{formatPosition(entry)}</span>
                            <span className="c2pa-debug-console__detail">{formatDetail(entry)}</span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
}

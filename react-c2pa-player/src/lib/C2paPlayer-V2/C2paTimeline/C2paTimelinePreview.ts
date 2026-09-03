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
 * Hover preview for the C2PA timeline.
 *
 * On a fifteen-minute live window a segment is a few pixels wide, so the bar
 * can show *that* a moment was verified but not by whom or, when it failed,
 * why. This puts that within reach without a click.
 *
 * Two things shape the implementation:
 *
 *  - Segments are `pointer-events: none` so a click passes through to video.js
 *    and seeks. They therefore receive no mouse events of their own, and the
 *    segment under the pointer has to be found by geometry. The listener sits
 *    on the progress control rather than the 15px bar, which makes the whole
 *    53px band of the control bar a hover target.
 *
 *  - The preview must never become a hover target itself, or it would sit
 *    between the pointer and the bar it describes and flicker. Hence
 *    `pointer-events: none` on it, and the "pin" gesture being the existing
 *    click-to-open-the-panel rather than anything belonging to this element.
 *
 * Grey is handled here too, and it has no element. Grey is the track's own
 * colour showing through where no verdict covers the bar, which on a live
 * stream is most of the width - a five-minute window fills only as verdicts
 * arrive. So a pointer that matches no segment falls through to the geometry
 * of the *gap* it is in, and the panel says so.
 */

import type { AdapterKind } from '@/lib/validation';
import { UNVERIFIED_IDENTITY_CAVEAT } from '@/lib/validation/rules';
import type { C2PATimelineSegmentUpdate } from '@/lib/types/c2pa.types';
import {
    buildSegmentPreview,
    buildUnverifiedPreview,
    type SegmentPreview,
} from './segmentPreviewModel';
import { getLiveTimelineWindow } from './liveWindowState';

/** A timeline segment element as the timeline builds it. */
interface SegmentElementLike extends HTMLElement {
    __c2paSegment?: C2PATimelineSegmentUpdate;
}

export interface TimelinePreviewController {
    attach(progressControl: HTMLElement): void;
    /** Which engine produced the verdicts, so metadata can be marked honestly. */
    setAdapterKind(adapterKind: AdapterKind | null): void;
    dispose(): void;
}

const PREVIEW_CLASS = 'c2pa-timeline-preview';
const SEGMENT_SELECTOR = '.seekbar-play-c2pa';
/**
 * The bar the segment percentages are relative to.
 *
 * Not the same box as the progress control the listener sits on: video.js
 * insets the holder within the control (measured 700px inside 720px), so a
 * fraction taken from the control's width is wrong by ~1.4% at each edge and
 * negative in its outer 10px. The listener wants the larger box, the
 * arithmetic wants the smaller one.
 */
const HOLDER_SELECTOR = '.vjs-progress-holder';

/**
 * The segment whose rendered stretch of the bar contains `fraction`.
 *
 * Matched against the inline `left`/`width` percentages the timeline sets,
 * rather than against segment times and the current window, so this cannot
 * disagree with what is on screen - the two would otherwise have to be kept in
 * step through every live-window roll.
 *
 * Exported for tests: the mapping is the part most likely to be subtly wrong,
 * and it needs no browser to check.
 */
export function findSegmentAtFraction(
    segments: readonly SegmentElementLike[],
    fraction: number,
): SegmentElementLike | null {
    if (!(fraction >= 0) || fraction > 1) {
        return null;
    }

    const target = fraction * 100;
    let best: SegmentElementLike | null = null;
    let bestWidth = Number.POSITIVE_INFINITY;

    for (const segment of segments) {
        const left = parseFloat(segment.style.left);
        const width = parseFloat(segment.style.width);

        if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
            continue;
        }

        // `<=` on the right edge so the very end of the bar still resolves,
        // and the narrowest match wins where rounding makes two adjacent
        // segments overlap by a fraction of a percent.
        if (target >= left && target <= left + width && width < bestWidth) {
            best = segment;
            bestWidth = width;
        }
    }

    return best;
}

/** An uncovered stretch of the bar, in the same percentages the segments use. */
export interface TimelineGap {
    leftPercent: number;
    rightPercent: number;
    /**
     * The gap runs to the right-hand end of the bar and there is covered
     * ground behind it, so this is the leading edge: content whose verdict may
     * simply not have arrived. Distinct from a gap in the middle or at the far
     * left, where a verdict is not coming.
     */
    atLeadingEdge: boolean;
}

/**
 * The uncovered stretch of the bar containing `fraction`, if any.
 *
 * Derived from the same rendered `left`/`width` percentages as
 * findSegmentAtFraction, and for the same reason: the gaps are exactly what is
 * left over once the segments are placed, so reading them off the segments
 * cannot disagree with what is on screen. Computing them from verdict times
 * and the current window would be a second, independent answer to the same
 * question, and the two would drift apart on every roll.
 *
 * Returns null when the pointer is over a segment, which is the caller's cue
 * that this is not a gap at all.
 */
export function findGapAtFraction(
    segments: readonly SegmentElementLike[],
    fraction: number,
): TimelineGap | null {
    if (!(fraction >= 0) || fraction > 1) {
        return null;
    }

    const target = fraction * 100;
    const covered = segments
        .map((segment) => ({
            from: parseFloat(segment.style.left),
            to: parseFloat(segment.style.left) + parseFloat(segment.style.width),
        }))
        .filter((span) => Number.isFinite(span.from) && Number.isFinite(span.to) && span.to > span.from)
        .sort((left, right) => left.from - right.from);

    let cursor = 0;

    for (const span of covered) {
        if (span.from > cursor && target >= cursor && target <= span.from) {
            return { leftPercent: cursor, rightPercent: span.from, atLeadingEdge: false };
        }

        cursor = Math.max(cursor, span.to);
    }

    if (cursor < 100 && target >= cursor) {
        // `cursor > 0` distinguishes the live edge from a bar with nothing on
        // it at all: before the first verdict the whole width is one gap, and
        // calling five minutes of history "still arriving" would be wrong.
        return { leftPercent: cursor, rightPercent: 100, atLeadingEdge: cursor > 0 };
    }

    return null;
}

/**
 * Escapes before interpolation. Every string below originates in a media file's
 * metadata - `dc:title` and friends are attacker-controlled for any asset the
 * player did not produce - so none of it may reach innerHTML unescaped.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fieldRow(label: string, value: string | null): string {
    if (!value) {
        return '';
    }

    return (
        `<div class="${PREVIEW_CLASS}__row">` +
        `<span class="${PREVIEW_CLASS}__label">${escapeHtml(label)}</span>` +
        `<span class="${PREVIEW_CLASS}__value">${escapeHtml(value)}</span>` +
        '</div>'
    );
}

function renderPreview(preview: SegmentPreview): string {
    const state = escapeHtml(preview.validationState);
    const parts = [
        `<div class="${PREVIEW_CLASS}__head">` +
            `<span class="${PREVIEW_CLASS}__time">${escapeHtml(preview.timeRange)}</span>` +
            `<span class="${PREVIEW_CLASS}__state ${PREVIEW_CLASS}__state--${state.toLowerCase()}">${state}</span>` +
            '</div>',
    ];

    if (preview.reason) {
        parts.push(`<p class="${PREVIEW_CLASS}__reason">${escapeHtml(preview.reason)}</p>`);
    }

    if (preview.metadata) {
        parts.push(
            fieldRow('Title', preview.metadata.title),
            fieldRow('Publisher', preview.metadata.publisher),
            fieldRow('Rights', preview.metadata.rights),
        );

        if (!preview.metadataVerified) {
            // Shared with the menu's organization section, so the bar and the
            // panel cannot word the same fact differently.
            parts.push(
                `<p class="${PREVIEW_CLASS}__caveat">${escapeHtml(UNVERIFIED_IDENTITY_CAVEAT)}</p>`,
            );
        }
    }

    // No raw failure codes here. A hover is a glance, and a viewer being told
    // a moment of a broadcast was tampered with does not need
    // `assertion.bmffHash.mismatch` to act on it - the sentence above is the
    // whole message. The codes belong in the debug console, where someone has
    // chosen to look at engine output; the model no longer carries them.
    if (!preview.reason && !preview.metadata) {
        parts.push(
            `<p class="${PREVIEW_CLASS}__caveat">No per-segment metadata in this stream.</p>`,
        );
    }

    return parts.filter(Boolean).join('');
}

export function createTimelinePreview(): TimelinePreviewController {
    let progressControl: HTMLElement | null = null;
    let element: HTMLDivElement | null = null;
    let adapterKind: AdapterKind | null = null;
    /**
     * What the panel currently says, as markup.
     *
     * Compared against rather than the segment object it came from. The
     * session derives its timeline from scratch on every tick, so the object
     * under the pointer is a different one four times a second even when the
     * segment it describes has not changed at all - an identity check
     * therefore rebuilt the panel on essentially every mousemove. Comparing
     * the output instead makes the guard mean what it says: rebuild when what
     * is displayed would differ.
     */
    let shownHtml: string | null = null;

    const hide = () => {
        if (element) {
            element.classList.remove(`${PREVIEW_CLASS}--visible`);
        }
        shownHtml = null;
    };

    const onMouseMove = (event: MouseEvent) => {
        if (!progressControl || !element) {
            return;
        }

        const bounds = progressControl.getBoundingClientRect();
        const holder = progressControl.querySelector(HOLDER_SELECTOR);
        const holderBounds = holder?.getBoundingClientRect();

        if (bounds.width <= 0 || !holderBounds || holderBounds.width <= 0) {
            return;
        }

        const fraction = (event.clientX - holderBounds.left) / holderBounds.width;
        const segments = Array.from(
            progressControl.querySelectorAll<SegmentElementLike>(SEGMENT_SELECTOR),
        );
        const match = findSegmentAtFraction(segments, fraction);
        const source = match?.__c2paSegment ?? null;
        const html = source
            ? renderPreview(buildSegmentPreview(source, adapterKind))
            : renderGap(segments, fraction);

        if (!html) {
            hide();
            return;
        }

        // Re-rendering identical content on every mousemove would rebuild the
        // panel dozens of times a second while the pointer crosses one segment.
        if (html !== shownHtml) {
            element.innerHTML = html;
            shownHtml = html;
        }

        element.classList.add(`${PREVIEW_CLASS}--visible`);

        // Follows the pointer, then stops at either edge so the panel stays
        // inside the player - `.video-js` is `overflow: hidden`, so a panel
        // running past the edge would be cut off rather than shifted.
        const width = element.offsetWidth;
        const centred = event.clientX - bounds.left - width / 2;
        const maxLeft = bounds.width - width;
        element.style.left = `${Math.max(0, Math.min(maxLeft > 0 ? maxLeft : 0, centred))}px`;
    };

    /**
     * What an uncovered stretch says, or null when there is nothing to say.
     *
     * Live only. The window it needs is published for live sources alone, and
     * that is also the only place the statement would be right: on VOD an
     * uncovered stretch means playback has not read it *yet*, not that no
     * verdict exists - the verdict usually does, withheld until the content is
     * actually shown (see readRegionGate.ts). Reporting "nothing was verified"
     * there would be a different and false claim.
     */
    const renderGap = (segments: readonly SegmentElementLike[], fraction: number) => {
        const window = getLiveTimelineWindow();

        if (!window || !(window.size > 0)) {
            return null;
        }

        const gap = findGapAtFraction(segments, fraction);

        if (!gap) {
            return null;
        }

        const toTime = (percent: number) => window.start + (percent / 100) * window.size;

        return renderPreview(
            buildUnverifiedPreview(
                toTime(gap.leftPercent),
                toTime(gap.rightPercent),
                gap.atLeadingEdge,
            ),
        );
    };

    const onMouseLeave = () => hide();

    return {
        attach(control: HTMLElement) {
            this.dispose();
            progressControl = control;
            element = document.createElement('div');
            element.className = PREVIEW_CLASS;
            // Announced politely rather than assertively: it follows the
            // pointer, and an assertive live region would interrupt a screen
            // reader on every segment crossed.
            element.setAttribute('role', 'status');
            element.setAttribute('aria-live', 'polite');
            control.appendChild(element);
            control.addEventListener('mousemove', onMouseMove);
            control.addEventListener('mouseleave', onMouseLeave);
        },

        setAdapterKind(kind: AdapterKind | null) {
            if (kind === adapterKind) {
                return;
            }

            adapterKind = kind;
            // The next move rebuilds against the new adapter's honesty rules.
            shownHtml = null;
        },

        dispose() {
            progressControl?.removeEventListener('mousemove', onMouseMove);
            progressControl?.removeEventListener('mouseleave', onMouseLeave);
            element?.remove();
            progressControl = null;
            element = null;
            shownHtml = null;
        },
    };
}

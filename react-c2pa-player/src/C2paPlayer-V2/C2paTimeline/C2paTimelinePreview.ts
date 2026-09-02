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
 */

import type { AdapterKind } from '@/validation';
import type { C2PATimelineSegmentUpdate } from '@/types/c2pa.types';
import { buildSegmentPreview, type SegmentPreview } from './segmentPreviewModel';

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
            parts.push(
                `<p class="${PREVIEW_CLASS}__caveat">Declared in the stream; this player did not verify who signed it.</p>`,
            );
        }
    }

    // Always shown when present, even alongside a sentence: the wording above
    // is a reading of these, and the reading is not the evidence.
    if (preview.codes.length > 0) {
        parts.push(`<p class="${PREVIEW_CLASS}__codes">${escapeHtml(preview.codes.join(', '))}</p>`);
    }

    if (!preview.reason && !preview.metadata && preview.codes.length === 0) {
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
    let shownSegment: C2PATimelineSegmentUpdate | null = null;

    const hide = () => {
        if (element) {
            element.classList.remove(`${PREVIEW_CLASS}--visible`);
        }
        shownSegment = null;
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

        if (!source) {
            hide();
            return;
        }

        // Re-rendering identical content on every mousemove would rebuild the
        // panel dozens of times a second while the pointer crosses one segment.
        if (source !== shownSegment) {
            element.innerHTML = renderPreview(buildSegmentPreview(source, adapterKind));
            shownSegment = source;
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
            shownSegment = null;
        },

        dispose() {
            progressControl?.removeEventListener('mousemove', onMouseMove);
            progressControl?.removeEventListener('mouseleave', onMouseLeave);
            element?.remove();
            progressControl = null;
            element = null;
            shownSegment = null;
        },
    };
}

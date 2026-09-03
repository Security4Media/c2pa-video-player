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
 * What the menu tells a viewer when something failed.
 *
 * Worth testing as its own thing: these sentences are the entire product for
 * someone who opens the panel because a bar went red, and the previous
 * versions of them leaked engine vocabulary and segment ranges into a surface
 * meant to answer "can I trust this?".
 */

import { describe, expect, it } from 'vitest';
import type { Manifest } from '@contentauth/c2pa-web';
import type { C2PAStatus } from '@/types/c2pa.types';
import type { ValidationTimelineSegment } from '@/validation';
import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import { buildMenuRenderState } from './menuViewModel';

const manifest = { label: 'urn:test', title: 'Test' } as unknown as Manifest;

const timeline = (overrides: Partial<C2PATimelineState> = {}): C2PATimelineState => ({
    currentTime: 10,
    compromisedRegions: [],
    hasInvalidSegments: false,
    segments: [],
    ...overrides,
});

const status = (overrides: Partial<C2PAStatus> = {}): C2PAStatus => ({
    manifestStore: null,
    verificationStatus: 'Valid',
    validationState: 'Valid',
    adapterKind: 'dash-fragmented-fmp4',
    normalizedResult: {
        manifestStore: null,
        validationState: 'Valid',
        activeManifest: manifest,
    },
    timelineSegments: [],
    ...overrides,
});

const segment = (overrides: Partial<ValidationTimelineSegment> = {}): ValidationTimelineSegment => ({
    startTime: 8,
    endTime: 12,
    validationState: 'Invalid',
    ...overrides,
});

/** Every sentence the render state can put in front of a viewer. */
const messages = (state: ReturnType<typeof buildMenuRenderState>) =>
    [state.sections?.summary.alert].filter((text): text is string => Boolean(text)).join(' | ');

describe('a failure somewhere other than the playhead', () => {
    const invalidElsewhere = status({
        timelineSegments: [
            { startTime: 8, endTime: 12, validationState: 'Invalid' },
            { startTime: 20, endTime: 24, validationState: 'Invalid' },
        ],
    });

    it('names the stream, not the segments', () => {
        // This used to read "The segments between 00:08-00:12, 00:20-00:24 may
        // have been tampered with": an inventory that grows without bound on a
        // live stream, in place of an answer.
        const state = buildMenuRenderState({ ...invalidElsewhere, isLive: true }, timeline());

        expect(messages(state)).toBe(
            'Some earlier parts of this livestream are invalid and may have been tampered with.',
        );
    });

    it('calls a file a video rather than a livestream', () => {
        const state = buildMenuRenderState({ ...invalidElsewhere, isLive: false }, timeline());

        expect(messages(state)).toBe(
            'Some parts of this video are invalid and may have been tampered with.',
        );
    });

    it('mentions no times, ranges or counts at all', () => {
        const state = buildMenuRenderState({ ...invalidElsewhere, isLive: true }, timeline());

        expect(messages(state)).not.toMatch(/\d/);
    });

    it('still speaks for a monolithic source, which reports no segments', () => {
        // Its one verdict covers the whole asset, so the timeline flag is all
        // there is to go on.
        const state = buildMenuRenderState(
            status({ adapterKind: 'monolithic', timelineSegments: [] }),
            timeline({ hasInvalidSegments: true }),
        );

        expect(messages(state)).toContain('may have been tampered with');
    });

    it('says nothing when nothing failed', () => {
        expect(messages(buildMenuRenderState(status(), timeline()))).toBe('');
    });
});

describe('a failure at the playhead', () => {
    const atPlayhead = status({
        verificationStatus: 'Invalid',
        validationState: 'Invalid',
        normalizedResult: {
            manifestStore: null,
            validationState: 'Invalid',
            activeManifest: manifest,
        },
    });

    it('speaks about this moment rather than the whole source', () => {
        const state = buildMenuRenderState({ ...atPlayhead, isLive: true }, timeline());

        expect(state.mode).toBe('invalid');
        expect(messages(state)).toBe(
            'The content credentials of this moment are invalid. The content may have been tampered with.',
        );
    });

    it('condemns the whole source when its own credentials failed', () => {
        // A different claim, and the stronger one: nothing in the source is
        // vouched for, not just the moment on screen.
        const state = buildMenuRenderState(
            { ...atPlayhead, isLive: true, wholeAssetInvalid: true },
            timeline(),
        );

        expect(messages(state)).toBe(
            'The content credentials for this livestream could not be verified. The content may have been tampered with.',
        );
    });

    it('shows nothing the unverified manifest claims', () => {
        // Unchanged behaviour, restated because the message rework runs through
        // the same branch: an invalid manifest's issuer and history are exactly
        // what cannot be relied on.
        const state = buildMenuRenderState(atPlayhead, timeline());

        expect(state.sections?.claimGenerator).toBeNull();
        expect(state.sections?.organization).toBeNull();
        expect(state.sections?.history).toBeNull();
    });
});

describe('a clicked fragment', () => {
    it('speaks about this moment, in words a viewer can act on', () => {
        const state = buildMenuRenderState(status(), timeline(), segment());

        expect(state.isSegmentView).toBe(true);
        expect(messages(state)).toBe(
            'The content credentials of this moment are invalid. The content may have been tampered with.',
        );
    });

    it('does not report the engine’s own vocabulary', () => {
        // It used to read "Segment integrity: replayed - gap_detected". Both
        // words are still recorded, in the validation log.
        const state = buildMenuRenderState(
            status(),
            timeline(),
            segment({
                manifestRef: {
                    kind: 'integrity-only',
                    integrityStatus: 'replayed',
                    sequenceReason: 'gap_detected',
                },
            }),
        );

        expect(messages(state)).not.toContain('replayed');
        expect(messages(state)).not.toContain('gap_detected');
        expect(messages(state)).toContain('may have been tampered with');
    });

    it('says plainly when a fragment carries no credentials at all', () => {
        // Not a failure: absent credentials are Unknown, and the sentence has
        // to say that without sounding like an accusation.
        const state = buildMenuRenderState(
            status(),
            timeline(),
            segment({ validationState: 'Unknown' }),
        );

        expect(messages(state)).toBe('No content credentials are attached to this moment.');
    });
});

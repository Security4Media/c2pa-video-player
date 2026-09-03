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

import type { C2PAStatus, ValidationState } from '@/types/c2pa.types';
import type { ValidationTimelineSegment } from '@/validation';
import type { Root } from 'react-dom/client';
import type { AuthenticityLabelView } from './C2paAuthenticity/authenticityGate';

export interface C2PATimelineSegmentState {
    startTime: number;
    endTime: number;
    verificationStatus: ValidationState | 'unknown' | 'false';
}

export interface C2PATimelineState {
    currentTime: number;
    compromisedRegions: string[];
    hasInvalidSegments: boolean;
    segments: C2PATimelineSegmentState[];
}

export interface C2PAPlayerRootState {
    isFrictionOverlayVisible: boolean;
    /**
     * Which question the consent overlay is asking.
     *
     * The overlay is one component with two sentences, because the two claims
     * differ: a whole-asset failure means the file's own credentials cannot be
     * relied on, and an invalid run means this stretch of an otherwise sound
     * stream cannot. Accepting also means different things - only the
     * whole-asset case latches `playbackStarted`.
     */
    consentScope: 'whole-asset' | 'invalid-run';
    /**
     * Seconds before the question withdraws itself, or null when it will not.
     *
     * Live only. A position in a file does not expire, so there is nothing to
     * count down to and no honest deadline to show.
     */
    consentCountdownSeconds: number | null;
    /**
     * What the authenticity label should say, or null for no label. Decided by
     * C2paAuthenticity/authenticityGate.ts, not here.
     */
    authenticityLabel: AuthenticityLabelView | null;
    isMenuOpen: boolean;
    /**
     * Whether the validation log is showing. Separate from the menu: the two
     * answer different questions and are opened from different buttons, so
     * they are not two views of one panel.
     */
    isDebugOpen: boolean;
    c2paStatus: C2PAStatus | null;
    timeline: C2PATimelineState;
    menuResetKey: string;
    /**
     * A timeline fragment the user clicked to inspect, or null when showing
     * the live/current status. Set by the raw DOM click handler on rendered
     * timeline segments (outside the React tree - see C2paTimelineFunctions.ts)
     * and read by the menu to switch into a per-segment detail view.
     */
    selectedSegment: ValidationTimelineSegment | null;
}

export interface C2PAPlayerRootController {
    container: HTMLDivElement;
    root: Root;
    onWatchAnyway: () => void;
    /** Pauses and opens the panel. Supplied by main.ts, which owns both. */
    onAuthenticityLabelClick: () => void;
    getState: () => C2PAPlayerRootState;
    setState: (partialState: Partial<C2PAPlayerRootState>) => void;
    subscribe: (listener: () => void) => () => void;
}

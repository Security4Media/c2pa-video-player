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
import type { Root } from 'react-dom/client';

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
    isMenuOpen: boolean;
    c2paStatus: C2PAStatus | null;
    timeline: C2PATimelineState;
    menuResetKey: string;
}

export interface C2PAPlayerRootController {
    container: HTMLDivElement;
    root: Root;
    onWatchAnyway: () => void;
    getState: () => C2PAPlayerRootState;
    setState: (partialState: Partial<C2PAPlayerRootState>) => void;
    subscribe: (listener: () => void) => () => void;
}

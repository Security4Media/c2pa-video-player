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

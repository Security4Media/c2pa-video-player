import type { C2PAStatus } from '@/types/c2pa.types';
import type { Root } from 'react-dom/client';

export interface C2PAPlayerRootState {
    isFrictionOverlayVisible: boolean;
    isMenuOpen: boolean;
    menuC2paStatus: C2PAStatus | null;
    menuCompromisedRegions: string[];
    menuResetKey: string;
    menuContentTarget: Element | null;
}

export interface C2PAPlayerRootController {
    container: HTMLDivElement;
    root: Root;
    onWatchAnyway: () => void;
    getState: () => C2PAPlayerRootState;
    setState: (partialState: Partial<C2PAPlayerRootState>) => void;
    subscribe: (listener: () => void) => () => void;
}

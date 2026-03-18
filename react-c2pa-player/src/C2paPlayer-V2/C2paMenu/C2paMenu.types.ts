import type { Root } from 'react-dom/client';
import type { C2PAStatus } from '@/types/c2pa.types';
import type { C2paMenuItemKey } from './menuViewModel';

export interface VideoJsComponentLike {
    el(): HTMLElement | null;
}

export interface VideoJsMenuComponentLike extends VideoJsComponentLike {}

export interface VideoJsControlBarLike {
    addChild(name: string, options?: Record<string, unknown>, index?: number): unknown;
    getChild(name: string): VideoJsMenuComponentLike | null;
    children(): unknown[];
    removeChild?(name: string): void;
}

export interface VideoJsPlayerLike extends VideoJsComponentLike {
    controlBar: VideoJsControlBarLike;
    duration(): number;
}

export interface VideoJsMenuButtonComponentLike extends VideoJsMenuComponentLike {
    buttonPressed_?: boolean;
    options_?: {
        myItems?: MenuShellItem[];
    };
    player_?: unknown;
    closeC2paMenu?: boolean;
    pressButton?(): void;
    unpressButton?(): void;
    buildCSSClass?(): string;
}

export type GetCompromisedRegions = (
    isMonolithic: boolean,
    videoPlayer: VideoJsPlayerLike,
) => string[];

export interface C2paMenuBridgePayload {
    c2paStatus: C2PAStatus | null;
    compromisedRegions: string[];
}

export interface C2paMenuBridgeState {
    lastManifestId: string | null;
    isMenuOpen: boolean;
    lastUpdateTime: number;
    isInvalid: boolean;
    resetVersion: number;
    menuReference: VideoJsMenuComponentLike | null;
    reactRoot: Root | null;
    reactTarget: Element | null;
}

export interface MenuShellItem {
    name: string;
    id: C2paMenuItemKey;
}

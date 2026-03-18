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

export interface C2paMenuBridgeState {
    lastManifestId: string | null;
    isMenuOpen: boolean;
    isInvalid: boolean;
    resetVersion: number;
    menuReference: VideoJsMenuComponentLike | null;
}

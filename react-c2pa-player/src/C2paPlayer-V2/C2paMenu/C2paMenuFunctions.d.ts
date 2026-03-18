export function initializeC2PAMenu(
    videoPlayer: import('./C2paMenu.types').VideoJsPlayerLike,
): void;

export function adjustC2PAMenu(
    c2paMenu: import('./C2paMenu.types').VideoJsMenuComponentLike | null,
    videoElement: HTMLElement,
    c2paMenuHeightOffset: number,
): void;

export function updateC2PAMenu(
    c2paStatus: import('@/types/c2pa.types').C2PAStatus | null,
    c2paMenu: import('./C2paMenu.types').VideoJsMenuComponentLike | null,
    isMonolithic: boolean,
    videoPlayer: import('./C2paMenu.types').VideoJsPlayerLike,
    getCompromisedRegions: import('./C2paMenu.types').GetCompromisedRegions,
): void;

export function disposeC2PAMenu(): void;

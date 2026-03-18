export function initializeFrictionOverlay(
    videoPlayer: import('../C2paMenu/C2paMenu.types').VideoJsPlayerLike & { play(): void },
    setPlaybackStarted: () => void,
): HTMLElement;

export function displayFrictionOverlay(
    playbackStarted: boolean,
    videoPlayer: import('../C2paMenu/C2paMenu.types').VideoJsPlayerLike & { pause(): void },
    frictionOverlay: HTMLElement,
): void;

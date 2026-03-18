import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';

interface FrictionOverlayPlayer extends VideoJsPlayerLike {
    play(): void;
    pause(): void;
}

/**
 * Create and attach the friction overlay shown when the initial manifest
 * validation fails and playback should require explicit user confirmation.
 *
 * @param videoPlayer - Video.js player instance
 * @param setPlaybackStarted - Callback invoked when the user accepts playback
 * @returns The overlay element appended to the player container
 */
export const initializeFrictionOverlay = function (
    videoPlayer: FrictionOverlayPlayer,
    setPlaybackStarted: () => void,
): HTMLElement {
    const frictionOverlay = document.createElement('div');
    frictionOverlay.className = 'friction-overlay';

    const warnMessage = document.createElement('p');
    warnMessage.textContent =
        'The information in this video\'s Content Credentials is no longer trustworthy and the video\'s history cannot be confirmed.';

    const watchAnywayBtn = document.createElement('button');
    watchAnywayBtn.textContent = 'Watch Anyway';
    watchAnywayBtn.classList.add('friction-button');

    frictionOverlay.appendChild(warnMessage);
    frictionOverlay.appendChild(watchAnywayBtn);
    frictionOverlay.style.display = 'none';

    const playerContainer = videoPlayer.el();
    playerContainer?.appendChild(frictionOverlay);

    watchAnywayBtn.addEventListener('click', function () {
        frictionOverlay.style.display = 'none';
        setPlaybackStarted();
        videoPlayer.play();
    });

    return frictionOverlay;
};

/**
 * Display the friction overlay when the user has not yet accepted
 * playback for invalid content.
 *
 * @param playbackStarted - Whether playback has already been accepted
 * @param videoPlayer - Video.js player instance
 * @param frictionOverlay - Overlay element created during initialization
 */
export const displayFrictionOverlay = function (
    playbackStarted: boolean,
    videoPlayer: FrictionOverlayPlayer,
    frictionOverlay: HTMLElement,
): void {
    if (!playbackStarted) {
        videoPlayer.pause();
        frictionOverlay.style.display = 'block';
    }
};

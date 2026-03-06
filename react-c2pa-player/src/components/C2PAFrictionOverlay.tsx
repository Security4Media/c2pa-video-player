import { useEffect, useRef, useCallback } from 'react';

interface C2PAFrictionOverlayProps {
  videoPlayer: any;
  videoElement: HTMLVideoElement;
  isManifestInvalid: boolean;
  playbackStarted: boolean;
  onPlaybackStart: () => void;
}

export function C2PAFrictionOverlay({
  videoPlayer,
  videoElement,
  isManifestInvalid,
  playbackStarted,
  onPlaybackStart,
}: C2PAFrictionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const initializeOverlay = useCallback(() => {
    if (!videoPlayer || overlayRef.current) return;

    const overlay = document.createElement('div');
    overlay.className = 'c2pa-friction-overlay hidden';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: white;
      z-index: 1000;
    `;

    const message = document.createElement('div');
    message.innerHTML = `
      <h2 style="margin-bottom: 1rem; font-size: 1.5rem;">Content Cannot Be Trusted</h2>
      <p style="margin-bottom: 2rem;">The C2PA manifest validation failed. This content may not be authentic.</p>
      <button id="c2pa-continue-btn" style="padding: 0.5rem 2rem; background: #e41e2a; border: none; border-radius: 0.5rem; color: white; cursor: pointer; font-size: 1rem;">
        Continue Anyway
      </button>
    `;

    overlay.appendChild(message);
    videoElement.parentElement?.appendChild(overlay);

    const continueBtn = overlay.querySelector('#c2pa-continue-btn');
    continueBtn?.addEventListener('click', () => {
      overlay.classList.add('hidden');
      onPlaybackStart();
      videoPlayer.play();
    });

    overlayRef.current = overlay;
  }, [videoPlayer, videoElement, onPlaybackStart]);

  const displayOverlay = useCallback(() => {
    if (overlayRef.current && !playbackStarted) {
      overlayRef.current.classList.remove('hidden');
      videoPlayer.pause();
    }
  }, [playbackStarted, videoPlayer]);

  useEffect(() => {
    initializeOverlay();

    const handlePlay = () => {
      if (isManifestInvalid && !playbackStarted) {
        console.log('[C2PA Friction] Manifest invalid, displaying overlay');
        displayOverlay();
      } else {
        onPlaybackStart();
      }
    };

    videoPlayer?.on('play', handlePlay);

    return () => {
      videoPlayer?.off('play', handlePlay);
      if (overlayRef.current) {
        overlayRef.current.remove();
      }
    };
  }, [videoPlayer, isManifestInvalid, playbackStarted, initializeOverlay, displayOverlay, onPlaybackStart]);

  return null;
}

import { useEffect, useRef, useState, useCallback } from 'react';
import type { C2PAStatus } from '../types/c2pa.types';
import { C2PAFrictionOverlay } from './C2PAFrictionOverlay';
import { C2PAStatusBadge } from './C2PAStatusBadge';
import { TimelineSegmentVisualizer } from './TimelineSegmentVisualizer';
import { C2PADataOverlay } from './C2PADataOverlay';
import { useC2PATimeline } from '../hooks/useC2PATimeline';
import { useC2PAValidation } from '../hooks/useC2PAValidation';
import { useC2PASeekHandler } from '../hooks/useC2PASeekHandler';
import { useC2PAManifest } from '../hooks/useC2PAManifest';

interface C2PAPlayerProps {
  videoPlayer: any;
  videoElement: HTMLVideoElement;
  isMonolithic?: boolean;
  showOverlay?: boolean;
  onToggleOverlay?: () => void;
  onValidationStateChange?: (state: 'Unknown' | 'Valid' | 'Trusted' | 'Invalid') => void;
  c2paStatus?: any;
}

export function C2PAPlayer({ videoPlayer, videoElement, isMonolithic = false, showOverlay = false, onToggleOverlay, onValidationStateChange, c2paStatus: externalC2paStatus }: C2PAPlayerProps) {
  const [isManifestInvalid] = useState(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentC2PAStatus, setCurrentC2PAStatus] = useState<C2PAStatus | null>(null);

  // Use external C2PA status if provided (monolithic mode)
  useEffect(() => {
    if (externalC2paStatus) {
      setCurrentC2PAStatus(externalC2paStatus as C2PAStatus);
    }
  }, [externalC2paStatus]);
  
  const c2paMenuRef = useRef<any>(null);
  const c2paMenuHeightOffset = 30;

  // Toggle overlay handler
  const handleToggleOverlay = useCallback(() => {
    if (onToggleOverlay) {
      onToggleOverlay();
    }
  }, [onToggleOverlay]);

  // Use custom hooks for separated concerns
  const timeline = useC2PATimeline({ videoPlayer, isMonolithic });
  
  const validation = useC2PAValidation({
    videoPlayer,
    isManifestInvalid,
    addSegment: timeline.addSegment,
    updateTimeline: timeline.updateTimeline,
  });

  const { seeking } = useC2PASeekHandler({
    videoPlayer,
    playbackStarted,
    handleTimelineSeek: timeline.handleSeek,
    clearSegments: timeline.clearSegments,
    resetValidation: validation.resetValidation,
  });

  const manifest = useC2PAManifest();

  // Notify parent of validation state changes
  useEffect(() => {
    if (onValidationStateChange) {
      onValidationStateChange(manifest.validationState);
    }
  }, [manifest.validationState, onValidationStateChange]);

  // Playback update handler
  const playbackUpdate = useCallback((c2paStatus: C2PAStatus) => {
    validation.handlePlaybackUpdate(c2paStatus, seeking);
    manifest.updateManifest(c2paStatus);
    setCurrentC2PAStatus(c2paStatus);
  }, [validation, manifest, seeking]);

  // Track time updates
  useEffect(() => {
    if (!videoPlayer) return;

    const updateTime = () => {
      setCurrentTime(videoPlayer.currentTime());
      setDuration(videoPlayer.duration());
    };

    videoPlayer.on('timeupdate', updateTime);
    videoPlayer.on('loadedmetadata', updateTime);

    return () => {
      videoPlayer.off('timeupdate', updateTime);
      videoPlayer.off('loadedmetadata', updateTime);
    };
  }, [videoPlayer]);

  // Adjust C2PA menu size
  const adjustC2PAMenu = useCallback(() => {
    if (!c2paMenuRef.current || !videoElement) return;

    const menuContent = c2paMenuRef.current.el()?.querySelector(
      '.vjs-menu-button-popup .vjs-menu .vjs-menu-content'
    );

    if (menuContent) {
      const playerWidth = videoElement.offsetWidth;
      const playerHeight = videoElement.offsetHeight - c2paMenuHeightOffset;

      menuContent.style.width = `${playerWidth}px`;
      menuContent.style.height = `${playerHeight}px`;
    }
  }, [videoElement, c2paMenuHeightOffset]);

  // Initialize player
  useEffect(() => {
    if (!videoPlayer || !videoElement) return;

    // Try to get C2PAMenuButton if it exists (from old implementation)
    try {
      const menuButton = videoPlayer.controlBar.getChild('C2PAMenuButton');
      if (menuButton) {
        c2paMenuRef.current = menuButton;
      }
    } catch (e) {
      // Component doesn't exist, which is fine - we're using our own overlay
      console.log('[C2PA Player] No C2PAMenuButton found (using overlay instead)');
    }

    const interval = setInterval(() => {
      adjustC2PAMenu();
    }, 500);

    adjustC2PAMenu();

    return () => {
      clearInterval(interval);
    };
  }, [videoPlayer, videoElement, adjustC2PAMenu]);

  // Expose API methods via window for external access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).c2paPlayerUpdate = playbackUpdate;
      (window as any).c2paToggleOverlay = handleToggleOverlay;
    }
  }, [playbackUpdate, handleToggleOverlay]);

  return (
    <>
      <C2PAFrictionOverlay
        videoPlayer={videoPlayer}
        videoElement={videoElement}
        isManifestInvalid={isManifestInvalid}
        playbackStarted={playbackStarted}
        onPlaybackStart={() => setPlaybackStarted(true)}
      />
      
      {playbackStarted && (
        <>
          {/* Page-level indicators */}
          <C2PAStatusBadge
            validationState={manifest.validationState}
            isVerified={manifest.isVerified}
            details={manifest.validationDetails}
          />
          
          <TimelineSegmentVisualizer
            validationState={manifest.validationState}
            currentTime={currentTime}
            duration={duration}
          />

          {/* C2PAControlButton removed - now in VideoJSWithC2PA wrapper */}

          <C2PADataOverlay
            c2paStatus={currentC2PAStatus}
            isVisible={showOverlay}
            videoPlayer={videoPlayer}
          />
        </>
      )}
    </>
  );
}

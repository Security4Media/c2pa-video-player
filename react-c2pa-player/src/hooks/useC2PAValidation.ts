import { useState, useCallback, useRef } from 'react';
import type { C2PAStatus, ValidationState } from '../types/c2pa.types';

interface UseC2PAValidationProps {
  videoPlayer: any;
  isManifestInvalid: boolean;
  addSegment: (startTime: number, endTime: number, validationState: ValidationState, isInvalid?: boolean) => void;
  updateTimeline: () => void;
}

export function useC2PAValidation({
  videoPlayer,
  isManifestInvalid,
  addSegment,
  updateTimeline,
}: UseC2PAValidationProps) {
  const [lastPlaybackTime, setLastPlaybackTime] = useState(0.0);
  const minSeekTime = useRef(0.5);

  // Handle C2PA validation during playback
  const handleValidation = useCallback((
    validationState: ValidationState,
    currentTime: number
  ) => {
    console.log('[C2PA Validation] Adding segment:', {
      start: lastPlaybackTime,
      end: currentTime,
      state: validationState,
    });

    addSegment(lastPlaybackTime, currentTime, validationState, isManifestInvalid);
  }, [lastPlaybackTime, isManifestInvalid, addSegment]);

  // Playback update handler
  const handlePlaybackUpdate = useCallback((c2paStatus: C2PAStatus, seeking: boolean) => {
    if (!videoPlayer) return;

    const currentTime = videoPlayer.currentTime();

    if (
      !seeking &&
      currentTime >= lastPlaybackTime &&
      currentTime - lastPlaybackTime < minSeekTime.current
    ) {
      console.log('[C2PA Validation] Update:', lastPlaybackTime, '→', currentTime);
      
      handleValidation(c2paStatus.verificationStatus, currentTime);
      updateTimeline();
    }

    setLastPlaybackTime(currentTime);
  }, [videoPlayer, lastPlaybackTime, handleValidation, updateTimeline]);

  // Reset validation state
  const resetValidation = useCallback(() => {
    console.log('[C2PA Validation] Reset');
    setLastPlaybackTime(0.0);
  }, []);

  return {
    lastPlaybackTime,
    handlePlaybackUpdate,
    resetValidation,
  };
}

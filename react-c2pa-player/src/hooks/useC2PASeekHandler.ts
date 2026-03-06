import { useState, useCallback, useEffect } from 'react';

interface UseC2PASeekHandlerProps {
  videoPlayer: any;
  playbackStarted: boolean;
  handleTimelineSeek: (seekTime: number) => void;
  clearSegments: () => void;
  resetValidation: () => void;
}

export function useC2PASeekHandler({
  videoPlayer,
  playbackStarted,
  handleTimelineSeek,
  clearSegments,
  resetValidation,
}: UseC2PASeekHandlerProps) {
  const [seeking, setSeeking] = useState(false);

  const handleSeeking = useCallback((time: number) => {
    console.log('[C2PA Seek] Seeking to:', time);
    setSeeking(true);

    if (time === 0) {
      console.log('[C2PA Seek] Resetting player');
      clearSegments();
      resetValidation();
      setSeeking(false);
      return;
    }

    if (playbackStarted && time > 0) {
      handleTimelineSeek(time);
    }
  }, [playbackStarted, handleTimelineSeek, clearSegments, resetValidation]);

  const handleSeeked = useCallback((time: number) => {
    console.log('[C2PA Seek] Seeked to:', time);
    setSeeking(false);
  }, []);

  useEffect(() => {
    if (!videoPlayer) return;

    const onSeeking = () => handleSeeking(videoPlayer.currentTime());
    const onSeeked = () => handleSeeked(videoPlayer.currentTime());

    videoPlayer.on('seeking', onSeeking);
    videoPlayer.on('seeked', onSeeked);

    return () => {
      videoPlayer.off('seeking', onSeeking);
      videoPlayer.off('seeked', onSeeked);
    };
  }, [videoPlayer, handleSeeking, handleSeeked]);

  return { seeking };
}

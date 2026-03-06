import { useState, useCallback } from 'react';

export interface VideoPlayerConfig {
  fluid?: boolean;
  controlBar?: {
    children: string[];
  };
}

interface UseVideoPlayerInitializerProps {
  onPlayerCreated?: (player: any, videoElement: HTMLVideoElement) => void;
  onError?: (error: string) => void;
}

export function useVideoPlayerInitializer({ 
  onPlayerCreated,
  onError 
}: UseVideoPlayerInitializerProps = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');

  const initializePlayer = useCallback((url: string, videoElement: HTMLVideoElement) => {
    try {
      if (!url || !videoElement) {
        onError?.('Missing video URL or element');
        return;
      }

      setIsLoading(true);
      setVideoUrl(url);

      // Video.js player options
      const options: VideoPlayerConfig = { 
        fluid: true, 
        controlBar: { 
          children: [
            'playToggle', 
            'progressControl', 
            'currentTimeDisplay', 
            'volumePanel', 
            'pictureInPictureToggle', 
            'fullscreenToggle'
          ] 
        } 
      };

      // Create videojs player
      const videoJsPlayer = (window as any).videojs(videoElement, options);
      const isMonolithic = true;

      // Initialize React C2PA Player
      console.log('[Video Initializer] Checking for React C2PA initialization function...');
      
      if ((window as any).initReactC2PAPlayer) {
        console.log('[Video Initializer] Calling initReactC2PAPlayer');
        (window as any).initReactC2PAPlayer(videoJsPlayer, videoElement, isMonolithic);
        onPlayerCreated?.(videoJsPlayer, videoElement);
      } else {
        console.warn('[Video Initializer] React C2PA Player not ready, retrying...');
        setTimeout(() => {
          if ((window as any).initReactC2PAPlayer) {
            (window as any).initReactC2PAPlayer(videoJsPlayer, videoElement, isMonolithic);
            onPlayerCreated?.(videoJsPlayer, videoElement);
          } else {
            onError?.('React C2PA Player initialization function not found');
          }
        }, 500);
      }

      // Set video source
      videoElement.src = url;

      setIsLoading(false);
    } catch (error) {
      console.error('[Video Initializer] Error:', error);
      onError?.(error instanceof Error ? error.message : 'Unknown error');
      setIsLoading(false);
    }
  }, [onPlayerCreated, onError]);

  return {
    initializePlayer,
    isLoading,
    currentUrl: videoUrl,
  };
}

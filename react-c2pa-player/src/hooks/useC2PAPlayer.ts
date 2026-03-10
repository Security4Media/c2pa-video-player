import { useEffect, useRef, useCallback, useState } from 'react';

// Import the C2PAPlayer from the V2 module
// Note: Requires window.videojs to be available (set in main.tsx)
// @ts-ignore - JavaScript module
import { C2PAPlayer } from '../C2paPlayer-V2/main.js';

// Import C2PA validation from monolithic service (matches HTML plugin pattern)
import { c2pa_init } from '../services/c2pa-v2-monolithic';

interface UseC2PAPlayerOptions {
  isMonolithic?: boolean;
  onError?: (error: string) => void;
}

/**
 * Hook to manage C2PAPlayer V2 integration with Video.js player
 * This handles both the UI (C2PAPlayer V2) and validation (c2pa-monolithic)
 */
export function useC2PAPlayer({ 
  isMonolithic = true,
  onError 
}: UseC2PAPlayerOptions = {}) {
  const c2paPlayerRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [manifestData, setManifestData] = useState<any>(null);

  /**
   * Initialize the C2PAPlayer V2 instance
   */
  const initializePlayer = useCallback(
    async (videoJsPlayer: any, videoElement: HTMLVideoElement) => {
      try {
        if (!videoJsPlayer || !videoElement) {
          onError?.('Missing video player or element');
          return;
        }

        // Guard against multiple initializations
        if (isInitializingRef.current || c2paPlayerRef.current) {
          console.log('[useC2PAPlayer] Already initialized or initializing, skipping');
          return;
        }

        isInitializingRef.current = true;
        console.log('[useC2PAPlayer] Initializing C2PAPlayer V2');

        // Create C2PAPlayer V2 instance
        const c2paPlayer = C2PAPlayer(videoJsPlayer, videoElement, isMonolithic);
        
        // Initialize the player (sets up UI components)
        c2paPlayer.initialize();
        
        c2paPlayerRef.current = c2paPlayer;
        setIsInitialized(true);

        console.log('[useC2PAPlayer] C2PAPlayer V2 initialized successfully');
      } catch (error) {
        console.error('[useC2PAPlayer] Error initializing C2PAPlayer:', error);
        isInitializingRef.current = false;
        onError?.(error instanceof Error ? error.message : 'Unknown error');
      }
    },
    [isMonolithic, onError]
  );

  /**
   * Initialize C2PA validation for the video
   * This is equivalent to c2pa_init in the HTML version
   */
  const initializeValidation = useCallback(
    async (videoElement: HTMLVideoElement) => {
      try {
        console.log('[useC2PAPlayer] Initializing C2PA validation via c2pa_init');

        // Playback update callback - matches the HTML implementation
        const playbackUpdate = (e: any) => {
          console.log('[useC2PAPlayer] Playback update received', e.c2pa_status);
          
          if (c2paPlayerRef.current && e.c2pa_status) {
            // Update the C2PAPlayer V2 UI with validation status
            c2paPlayerRef.current.playbackUpdate(e.c2pa_status);
            setManifestData(e.c2pa_status);
          }
        };

        // Initialize C2PA validation using c2pa_init
        // This extracts manifest, validates, and sets up timeupdate listener
        await c2pa_init(videoElement, playbackUpdate);
        
        console.log('[useC2PAPlayer] C2PA validation initialized successfully');
      } catch (error) {
        console.error('[useC2PAPlayer] Error initializing C2PA validation:', error);
        onError?.(error instanceof Error ? error.message : 'Unknown validation error');
      }
    },
    [onError]
  );

  /**
   * Full initialization - both player and validation
   * Called from VideoPlayerSection on canplay event
   */
  const initialize = useCallback(
    async (videoJsPlayer: any, videoElement: HTMLVideoElement) => {
      // Initialize UI first
      await initializePlayer(videoJsPlayer, videoElement);
      
      // Then initialize validation (don't wait for another canplay event)
      // The canplay event is already handled by VideoPlayerSection
      await initializeValidation(videoElement);
    },
    [initializePlayer, initializeValidation]
  );

  /**
   * Reset initialization state when needed
   * This is called when loading a new video
   */
  const reset = useCallback(() => {
    console.log('[useC2PAPlayer] Resetting C2PA player');
    
    // Clean up existing C2PA player instance if any
    if (c2paPlayerRef.current && typeof c2paPlayerRef.current.dispose === 'function') {
      try {
        c2paPlayerRef.current.dispose();
      } catch (error) {
        console.warn('[useC2PAPlayer] Error disposing C2PA player:', error);
      }
    }
    
    c2paPlayerRef.current = null;
    isInitializingRef.current = false;
    setIsInitialized(false);
    setManifestData(null);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      c2paPlayerRef.current = null;
      isInitializingRef.current = false;
      setIsInitialized(false);
    };
  }, []);

  return {
    initialize,
    reset,
    isInitialized,
    manifestData,
    c2paPlayer: c2paPlayerRef.current,
  };
}

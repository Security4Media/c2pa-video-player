import { useEffect, useRef, useCallback, useState } from 'react';
import type { ManifestStore } from '@contentauth/c2pa-web';
import type { C2PAStatus } from '../types/c2pa.types';

// Import the C2PAPlayer from the V2 module
// @ts-ignore - JavaScript module
import { C2PAPlayer } from '../C2paPlayer-V2/main.js';

// Import C2PA validation from monolithic service (matches HTML plugin pattern)
import { c2pa_init } from '../services/c2pa-v2-monolithic';

interface UseC2PAPlayerOptions {
  isMonolithic?: boolean;
  onError?: (error: string) => void;
}

interface C2PAPlayerInstance {
  initialize: () => void;
  dispose?: () => void;
  playbackUpdate: (status: C2PAStatus) => void;
}


interface UseC2PAPlayerState {
  isInitialized: boolean;
  manifestStore: ManifestStore | null;
}

/**
 * Hook to manage C2PAPlayer V2 integration with Video.js player
 * This handles both the UI (C2PAPlayer V2) and validation (c2pa-monolithic)
 */
export function useC2PAPlayer({
  isMonolithic = true,
  onError
}: UseC2PAPlayerOptions = {}) {
  const c2paPlayerRef = useRef<C2PAPlayerInstance | null>(null);
  const isInitializingRef = useRef(false);
  const [state, setState] = useState<UseC2PAPlayerState>({
    isInitialized: false,
    manifestStore: null,
  });

  const disposePlayer = useCallback(() => {
    if (c2paPlayerRef.current && typeof c2paPlayerRef.current.dispose === 'function') {
      try {
        c2paPlayerRef.current.dispose();
      } catch (error) {
        console.warn('[useC2PAPlayer] Error disposing C2PA player:', error);
      }
    }

    c2paPlayerRef.current = null;
    isInitializingRef.current = false;
  }, []);

  /**
   * Initialize the C2PAPlayer V2 instance
   */
  const initializePlayer = useCallback(
    async (videoJsPlayer: any, videoElement: HTMLVideoElement): Promise<boolean> => {
      try {
        if (!videoJsPlayer || !videoElement) {
          onError?.('Missing video player or element');
          return false;
        }

        // Guard against multiple initializations
        if (isInitializingRef.current || c2paPlayerRef.current) {
          console.log('[useC2PAPlayer] Already initialized or initializing, skipping');
          return true;
        }

        isInitializingRef.current = true;
        console.log('[useC2PAPlayer] Initializing C2PAPlayer V2');

        // Create C2PAPlayer V2 instance
        const c2paPlayer = C2PAPlayer(videoJsPlayer, videoElement, isMonolithic) as C2PAPlayerInstance;

        // Initialize the player (sets up UI components)
        c2paPlayer.initialize();

        c2paPlayerRef.current = c2paPlayer;
        setState((currentState) => ({
          ...currentState,
          isInitialized: true,
        }));

        console.log('[useC2PAPlayer] C2PAPlayer V2 initialized successfully');
        return true;
      } catch (error) {
        console.error('[useC2PAPlayer] Error initializing C2PAPlayer:', error);
        onError?.(error instanceof Error ? error.message : 'Unknown error');
        return false;
      } finally {
        isInitializingRef.current = false;
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
        const playbackUpdate = (event: { c2pa_status?: C2PAStatus }) => {
          const c2paStatus = event.c2pa_status;

          if (!c2paStatus) {
            return;
          }

          console.log('[useC2PAPlayer] Playback update received', c2paStatus);

          if (c2paPlayerRef.current) {
            // Update the C2PAPlayer V2 UI with validation status
            c2paPlayerRef.current.playbackUpdate(c2paStatus);
          }

          setState((currentState) => ({
            ...currentState,
            manifestStore: c2paStatus.manifestStore ?? null,
          }));
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
      const didInitializePlayer = await initializePlayer(videoJsPlayer, videoElement);

      if (!didInitializePlayer) {
        return;
      }

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

    disposePlayer();
    setState({
      isInitialized: false,
      manifestStore: null,
    });
  }, [disposePlayer]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      disposePlayer();
    };
  }, [disposePlayer]);

  return {
    initialize,
    reset,
    isInitialized: state.isInitialized,
    manifestStore: state.manifestStore,
    c2paPlayer: c2paPlayerRef.current,
  };
}

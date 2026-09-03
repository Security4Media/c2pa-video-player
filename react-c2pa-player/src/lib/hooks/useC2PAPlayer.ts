/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ManifestStore } from '@contentauth/c2pa-web';
import type { C2PAPlayerInstance } from '../C2paPlayer-V2/main';
import { C2PAPlayer } from '../C2paPlayer-V2/main';
import {
  createDefaultValidationPolicy,
  type MediaSourceDescriptor,
  type MediaValidationAdapter,
  type ValidationSession,
  type ValidationStatusSnapshot,
} from '../validation';

interface UseC2PAPlayerOptions {
  adapter: MediaValidationAdapter | null;
  source?: MediaSourceDescriptor | null;
  onError?: (error: string) => void;
}

interface UseC2PAPlayerState {
  isInitialized: boolean;
  manifestStore: ManifestStore | null;
}

type PlaybackEventName = 'play' | 'timeupdate' | 'seeking' | 'seeked';

export function useC2PAPlayer({
  adapter,
  source: validationSource = null,
  onError,
}: UseC2PAPlayerOptions) {
  const c2paPlayerRef = useRef<C2PAPlayerInstance | null>(null);
  const validationSessionRef = useRef<ValidationSession | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const validationCleanupRef = useRef<(() => void) | null>(null);
  const isInitializingRef = useRef(false);
  const [state, setState] = useState<UseC2PAPlayerState>({
    isInitialized: false,
    manifestStore: null,
  });

  const removeValidationBindings = useCallback(() => {
    validationCleanupRef.current?.();
    validationCleanupRef.current = null;
  }, []);

  const disposePlayer = useCallback(() => {
    removeValidationBindings();
    validationSessionRef.current?.dispose();
    validationSessionRef.current = null;
    videoElementRef.current = null;

    if (c2paPlayerRef.current && typeof c2paPlayerRef.current.dispose === 'function') {
      try {
        c2paPlayerRef.current.dispose();
      } catch (error) {
        console.warn('[useC2PAPlayer] Error disposing C2PA player:', error);
      }
    }

    c2paPlayerRef.current = null;
    isInitializingRef.current = false;
  }, [removeValidationBindings]);

  const publishSnapshot = useCallback((snapshot: ValidationStatusSnapshot | null) => {
    c2paPlayerRef.current?.playbackUpdate(snapshot);
    setState((currentState) => ({
      ...currentState,
      manifestStore: snapshot?.result?.manifestStore ?? null,
    }));
  }, []);

  const resolveSnapshotAtCurrentTime = useCallback(() => {
    const session = validationSessionRef.current;
    const videoElement = videoElementRef.current;

    if (!session || !videoElement) {
      return;
    }

    publishSnapshot(session.getStatusAt(videoElement.currentTime ?? 0));
  }, [publishSnapshot]);

  const initializePlayer = useCallback(
    async (videoJsPlayer: any, videoElement: HTMLVideoElement): Promise<boolean> => {
      try {
        if (!videoJsPlayer || !videoElement || !adapter) {
          onError?.('Missing video player, element, or validation adapter');
          return false;
        }

        if (isInitializingRef.current || c2paPlayerRef.current) {
          return true;
        }

        isInitializingRef.current = true;
        const c2paPlayer = C2PAPlayer(
          videoJsPlayer,
          videoElement,
          adapter.capabilities,
        ) as C2PAPlayerInstance;

        c2paPlayer.initialize();
        c2paPlayerRef.current = c2paPlayer;
        videoElementRef.current = videoElement;
        setState((currentState) => ({
          ...currentState,
          isInitialized: true,
        }));

        return true;
      } catch (error) {
        console.error('[useC2PAPlayer] Error initializing C2PAPlayer:', error);
        onError?.(error instanceof Error ? error.message : 'Unknown error');
        return false;
      } finally {
        isInitializingRef.current = false;
      }
    },
    [adapter, onError]
  );

  const initializeValidation = useCallback(
    async (videoElement: HTMLVideoElement) => {
      if (!adapter || !validationSource) {
        return;
      }

      try {
        const validationSession = adapter.createSession({
          videoElement,
          source: validationSource,
          policy: createDefaultValidationPolicy(),
        });
        const playbackEvents: PlaybackEventName[] = ['play', 'timeupdate', 'seeking', 'seeked'];
        const handlePlaybackEvent = () => {
          resolveSnapshotAtCurrentTime();
        };
        const unsubscribe = validationSession.subscribe(() => {
          resolveSnapshotAtCurrentTime();
        });

        playbackEvents.forEach((eventName) => {
          videoElement.addEventListener(eventName, handlePlaybackEvent);
        });

        validationCleanupRef.current = () => {
          unsubscribe();
          playbackEvents.forEach((eventName) => {
            videoElement.removeEventListener(eventName, handlePlaybackEvent);
          });
        };

        validationSessionRef.current = validationSession;
        await validationSession.load();
        resolveSnapshotAtCurrentTime();
      } catch (error) {
        console.error('[useC2PAPlayer] Error initializing C2PA validation:', error);
        onError?.(error instanceof Error ? error.message : 'Unknown validation error');
      }
    },
    [adapter, onError, resolveSnapshotAtCurrentTime, validationSource]
  );

  const initialize = useCallback(
    async (videoJsPlayer: any, videoElement: HTMLVideoElement) => {
      const didInitializePlayer = await initializePlayer(videoJsPlayer, videoElement);

      if (!didInitializePlayer) {
        return;
      }

      await initializeValidation(videoElement);
    },
    [initializePlayer, initializeValidation]
  );

  const reset = useCallback(() => {
    disposePlayer();
    setState({
      isInitialized: false,
      manifestStore: null,
    });
  }, [disposePlayer]);

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

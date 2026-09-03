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

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import VideoJS, { type VideoJSOptions } from './VideoJS';
import { useC2PAPlayer } from '../hooks/useC2PAPlayer';
import './VideoPlayerSection.css';
import { PlayerStatus } from '@/types/player.types';
import {
  createDefaultValidationAdapterRegistry,
  type AdapterKind,
  type MediaSourceDescriptor,
} from '@/validation';

// Player-owning adapters (see capabilities.ownsPlayback below) each stream
// their own kind of manifest; this message is shown while videojs is still
// loading that source, before playback starts.
const LOADING_MESSAGE_BY_ADAPTER_KIND: Partial<Record<AdapterKind, string>> = {
  'hls-fragmented-fmp4': 'Loading HLS Playlist',
  'dash-fragmented-fmp4': 'Loading DASH Stream',
};


interface VideoPlayerSectionProps {
  videoJsOptions: VideoJSOptions;
  mediaSource: MediaSourceDescriptor | null;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  onStatusUpdate: (type: PlayerStatus, message: string) => void;
  onStreamInfo: (message: string) => void;
  children?: ReactNode;
}

export const VideoPlayerSection = memo(function VideoPlayerSection({
  videoJsOptions,
  mediaSource,
  onTimeUpdate,
  onDurationChange,
  onStatusUpdate,
  onStreamInfo,
  children,
}: VideoPlayerSectionProps) {
  // Track current video source to detect changes and force remount
  const currentSourceRef = useRef<string>('');
  const playerReadyRef = useRef(false);
  const [videoKey, setVideoKey] = useState(0);
  const adapterRegistry = useMemo(() => createDefaultValidationAdapterRegistry(), []);
  const adapter = useMemo(
    () => (mediaSource ? adapterRegistry.resolve(mediaSource) : null),
    [adapterRegistry, mediaSource]
  );
  const adapterKind = adapter?.kind ?? 'unsupported';
  const capabilities = adapter?.capabilities ?? {
    ownsPlayback: false,
    providesTimelineSegments: false,
    supportsLookupByTime: false,
    supportsLive: false,
    requiresPlayerOwnership: false,
  };
  const currentSource = mediaSource?.url || videoJsOptions.sources?.[0]?.src || '';
  const resolvedVideoJsOptions = useMemo(() => ({
    ...videoJsOptions,
    sources: mediaSource && !capabilities.ownsPlayback ? [
      {
        src: mediaSource.url,
        type: mediaSource.mimeType ?? 'video/mp4',
      },
    ] : [],
  }), [capabilities.ownsPlayback, mediaSource, videoJsOptions]);

  // Initialize C2PA Player V2
  const { initialize: initializeC2PA, reset: resetC2PA, isInitialized: c2paInitialized, manifestStore } = useC2PAPlayer({
    adapter,
    source: mediaSource,
    onError: (error) => {
      console.error('[VideoPlayerSection] C2PA error:', error);
      onStatusUpdate('error', `C2PA Error: ${error}`);
    },
  });
  
  // Detect source changes and update key to force VideoJS remount
  useEffect(() => {
    if (currentSource && currentSource !== currentSourceRef.current) {
      console.log('[VideoPlayerSection] Source changed, will remount player:', currentSourceRef.current, '->', currentSource);
      currentSourceRef.current = currentSource;
      setVideoKey(prev => prev + 1);
      playerReadyRef.current = false;
      
      // Reset C2PA immediately when source changes
      if (c2paInitialized) {
        console.log('[VideoPlayerSection] Resetting C2PA for new video source');
        resetC2PA();
      }
    }
  }, [currentSource, c2paInitialized, resetC2PA]);

  // Store C2PA functions in refs to avoid recreating callback
  const c2paFunctionsRef = useRef({ initializeC2PA, resetC2PA, c2paInitialized });
  c2paFunctionsRef.current = { initializeC2PA, resetC2PA, c2paInitialized };

  // Handle VideoJS player ready
  const handlePlayerReady = useCallback(
    (player: any) => {
      // Get the underlying video element
      const videoEl = player.el().querySelector('video');
      if (videoEl) {
        console.log('[VideoPlayerSection] Setting up event listeners');

        const initializeC2PAForPlayer = (status: PlayerStatus, message: string) => {
          if (playerReadyRef.current) {
            return;
          }

          console.log('[VideoPlayerSection] Initializing C2PA Player V2, isInitialized:', c2paFunctionsRef.current.c2paInitialized);
          playerReadyRef.current = true;
          onStatusUpdate(status, message);

          try {
            c2paFunctionsRef.current.initializeC2PA(player, videoEl);
            onStreamInfo(`C2PA Player V2 initialized (${adapterKind})`);
          } catch (error) {
            console.error('[VideoPlayerSection] Error during C2PA initialization:', error);
            onStatusUpdate('error', `C2PA init failed: ${error}`);
          }
        };
        
        // Setup video event listeners
        player.on('loadstart', () => {
          console.log('[VideoPlayerSection] Video loadstart event');
          onStatusUpdate('loading', 'Loading...');
        });
        
        player.on('canplay', () => {
          initializeC2PAForPlayer('ready', 'Ready to Play');
        });

        if (capabilities.ownsPlayback) {
          initializeC2PAForPlayer('loading', LOADING_MESSAGE_BY_ADAPTER_KIND[adapterKind] ?? 'Loading stream');
        }
        
        player.on('playing', () => onStatusUpdate('ready', 'Playing'));
        player.on('pause', () => onStatusUpdate('ready', 'Paused'));
        player.on('ended', () => onStatusUpdate('ready', 'Ended'));
        player.on('error', (e: any) => {
          console.error('[VideoPlayerSection] Video error event:', e);
          onStatusUpdate('error', 'Video Error');
        });

        onStreamInfo('Player initialized successfully');
      } else {
        console.error('[VideoPlayerSection] Video element not found in player');
      }
    },
    [adapterKind, capabilities.ownsPlayback, onStatusUpdate, onStreamInfo]
  );

  return (
    <div className="player-section">
        <VideoJS
        key={videoKey}
        options={resolvedVideoJsOptions}
        onReady={handlePlayerReady}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
      />
      {children}
      {c2paInitialized && manifestStore && (
        <div className="c2pa-status-indicator" style={{ display: 'none' }}>
          {/* C2PA Player V2 is active - UI components injected via Video.js */}
        </div>
      )}
    </div>
  );
});

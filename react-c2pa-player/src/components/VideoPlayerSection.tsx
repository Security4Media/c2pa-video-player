import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import VideoJS, { type VideoJSOptions } from './VideoJS';
import { useC2PAPlayer } from '../hooks/useC2PAPlayer';
import './VideoPlayerSection.css';

type PlayerStatus = 'ready' | 'loading' | 'error';

interface VideoPlayerSectionProps {
  videoJsOptions: VideoJSOptions;
  onPlayerReady: (player: any) => void;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  onStatusUpdate: (type: PlayerStatus, message: string) => void;
  onStreamInfo: (message: string) => void;
  enableC2PA?: boolean;
  children?: ReactNode;
}

export const VideoPlayerSection = memo(function VideoPlayerSection({
  videoJsOptions,
  onPlayerReady,
  onTimeUpdate,
  onDurationChange,
  onStatusUpdate,
  onStreamInfo,
  enableC2PA = true,
  children,
}: VideoPlayerSectionProps) {
  // Track current video source to detect changes and force remount
  const currentSourceRef = useRef<string>('');
  const playerReadyRef = useRef(false);
  const [videoKey, setVideoKey] = useState(0);
  
  // Get current source for key generation
  const currentSource = videoJsOptions.sources?.[0]?.src || '';
  
  // Initialize C2PA Player V2
  const { initialize: initializeC2PA, reset: resetC2PA, isInitialized: c2paInitialized, manifestData } = useC2PAPlayer({
    isMonolithic: true,
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
      console.log('[VideoJS] Player ready callback');
      onPlayerReady(player);

      // Get the underlying video element
      const videoEl = player.el().querySelector('video');
      if (videoEl) {
        console.log('[VideoPlayerSection] Setting up event listeners');
        
        // Setup video event listeners
        player.on('loadstart', () => {
          console.log('[VideoPlayerSection] Video loadstart event');
          onStatusUpdate('loading', 'Loading...');
        });
        
        player.on('canplay', () => {
          if (!playerReadyRef.current) {
            console.log('[VideoPlayerSection] Video canplay event - first time for this video');
            playerReadyRef.current = true;
            onStatusUpdate('ready', 'Ready to Play');
            
            // Initialize C2PA Player V2 when video is ready
            if (enableC2PA) {
              console.log('[VideoPlayerSection] Initializing C2PA Player V2, isInitialized:', c2paFunctionsRef.current.c2paInitialized);
              try {
                c2paFunctionsRef.current.initializeC2PA(player, videoEl);
                onStreamInfo('C2PA Player V2 initialized');
              } catch (error) {
                console.error('[VideoPlayerSection] Error during C2PA initialization:', error);
                onStatusUpdate('error', `C2PA init failed: ${error}`);
              }
            }
          } else {
            console.log('[VideoPlayerSection] Video canplay event - already processed, skipping C2PA init');
          }
        });
        
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
    [onPlayerReady, onStatusUpdate, onStreamInfo, enableC2PA]
  );

  return (
    <div className="player-section">
      <VideoJS
        key={videoKey}
        options={videoJsOptions}
        onReady={handlePlayerReady}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
      />
      {children}
      {c2paInitialized && manifestData && (
        <div className="c2pa-status-indicator" style={{ display: 'none' }}>
          {/* C2PA Player V2 is active - UI components injected via Video.js */}
        </div>
      )}
    </div>
  );
});

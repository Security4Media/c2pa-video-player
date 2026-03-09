import { memo, useCallback, useRef, type ReactNode } from 'react';
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
  // Track if event listeners have been registered
  const listenersRegisteredRef = useRef(false);
  const currentSourceRef = useRef<string>('');
  
  // Initialize C2PA Player V2
  const { initialize: initializeC2PA, reset: resetC2PA, isInitialized: c2paInitialized, manifestData } = useC2PAPlayer({
    isMonolithic: true,
    onError: (error) => {
      console.error('[VideoPlayerSection] C2PA error:', error);
      onStatusUpdate('error', `C2PA Error: ${error}`);
    },
  });

  // Store C2PA functions in refs to avoid recreating callback
  const c2paFunctionsRef = useRef({ initializeC2PA, resetC2PA, c2paInitialized });
  c2paFunctionsRef.current = { initializeC2PA, resetC2PA, c2paInitialized };

  // Handle VideoJS player ready
  const handlePlayerReady = useCallback(
    async (player: any) => {
      console.log('[VideoJS] Player ready callback');
      onPlayerReady(player);

      // Get the underlying video element
      const videoEl = player.el().querySelector('video');
      if (videoEl && !listenersRegisteredRef.current) {
        console.log('[VideoPlayerSection] Registering event listeners (once)');
        listenersRegisteredRef.current = true;
        
        // Setup video event listeners (only once)
        player.on('loadstart', () => {
          const newSource = videoEl.src || videoEl.currentSrc;
          if (newSource !== currentSourceRef.current) {
            console.log('[VideoPlayerSection] New video source detected:', newSource);
            currentSourceRef.current = newSource;
            onStatusUpdate('loading', 'Loading...');
            
            // Reset C2PA state when loading new video
            if (c2paFunctionsRef.current.c2paInitialized) {
              console.log('[VideoPlayerSection] Resetting C2PA for new video');
              c2paFunctionsRef.current.resetC2PA();
            }
          }
        });
        
        player.on('canplay', () => {
          onStatusUpdate('ready', 'Ready to Play');
          
          // Initialize C2PA Player V2 when video is ready (once per video)
          if (enableC2PA && !c2paFunctionsRef.current.c2paInitialized) {
            console.log('[VideoPlayerSection] Initializing C2PA Player V2');
            c2paFunctionsRef.current.initializeC2PA(player, videoEl);
            onStreamInfo('C2PA Player V2 initialized');
          }
        });
        
        player.on('playing', () => onStatusUpdate('ready', 'Playing'));
        player.on('pause', () => onStatusUpdate('ready', 'Paused'));
        player.on('ended', () => onStatusUpdate('ready', 'Ended'));
        player.on('error', () => {
          onStatusUpdate('error', 'Video Error');
          console.error('Video error');
        });

        onStreamInfo('Player initialized successfully');
      }
    },
    [onPlayerReady, onStatusUpdate, onStreamInfo, enableC2PA]
  );

  return (
    <div className="player-section">
      <VideoJS
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

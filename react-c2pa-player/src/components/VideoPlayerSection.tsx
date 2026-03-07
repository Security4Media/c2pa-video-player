import { memo, useCallback } from 'react';
import VideoJS, { type VideoJSOptions } from './VideoJS';

type PlayerStatus = 'ready' | 'loading' | 'error';

interface VideoPlayerSectionProps {
  videoJsOptions: VideoJSOptions;
  onPlayerReady: (player: any) => void;
  onTimeUpdate: (currentTime: number) => void;
  onDurationChange: (duration: number) => void;
  onStatusUpdate: (type: PlayerStatus, message: string) => void;
  onStreamInfo: (message: string) => void;
}

export const VideoPlayerSection = memo(function VideoPlayerSection({
  videoJsOptions,
  onPlayerReady,
  onTimeUpdate,
  onDurationChange,
  onStatusUpdate,
  onStreamInfo,
}: VideoPlayerSectionProps) {
  // Handle VideoJS player ready
  const handlePlayerReady = useCallback(
    async (player: any) => {
      console.log('[VideoJS] Player ready callback');
      onPlayerReady(player);

      // Get the underlying video element
      const videoEl = player.el().querySelector('video');
      if (videoEl) {
        // Setup video event listeners
        player.on('loadstart', () => onStatusUpdate('loading', 'Loading...'));
        player.on('canplay', () => onStatusUpdate('ready', 'Ready to Play'));
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
    [onPlayerReady, onStatusUpdate, onStreamInfo]
  );

  return (
    <div className="player-section">
      <VideoJS
        options={videoJsOptions}
        onReady={handlePlayerReady}
        onTimeUpdate={onTimeUpdate}
        onDurationChange={onDurationChange}
      />
    </div>
  );
});

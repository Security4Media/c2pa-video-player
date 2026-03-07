import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export interface VideoJSOptions {
  autoplay?: boolean;
  controls?: boolean;
  responsive?: boolean;
  fluid?: boolean;
  sources?: Array<{
    src: string;
    type: string;
  }>;
  controlBar?: {
    children?: string[];
  };
}

interface VideoJSProps {
  options: VideoJSOptions;
  onReady?: (player: any) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  className?: string;
}

export function VideoJS({ options, onReady, onTimeUpdate, onDurationChange, className }: VideoJSProps) {
  const videoRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current) {
      // The Video.js player needs to be _inside_ the component el for React 18 Strict Mode
      const videoElement = document.createElement('video-js');

      videoElement.classList.add('vjs-big-play-centered');
      videoElement.id = 'videoPlayer'; // Keep ID for compatibility
      
      if (videoRef.current) {
        videoRef.current.appendChild(videoElement);
      }

      const player = (playerRef.current = videojs(videoElement, options, () => {
        console.log('[VideoJS] Player is ready');
        onReady && onReady(player);
      }));

      // Add event listeners
      if (onTimeUpdate) {
        player.on('timeupdate', () => {
          const currentTime = player.currentTime();
          if (typeof currentTime === 'number') {
            onTimeUpdate(currentTime);
          }
        });
      }

      if (onDurationChange) {
        player.on('loadedmetadata', () => {
          const duration = player.duration();
          if (typeof duration === 'number') {
            onDurationChange(duration);
          }
        });
        player.on('durationchange', () => {
          const duration = player.duration();
          if (typeof duration === 'number') {
            onDurationChange(duration);
          }
        });
      }

      // You could update an existing player in the `else` block here
      // on prop change, for example:
    } else {
      const player = playerRef.current;

      player.autoplay(options.autoplay);
      if (options.sources) {
        player.src(options.sources);
      }
    }
  }, [options, onReady, onTimeUpdate, onDurationChange]);

  // Dispose the Video.js player when the functional component unmounts
  useEffect(() => {
    const player = playerRef.current;

    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div data-vjs-player className={className}>
      <div ref={videoRef} />
    </div>
  );
}

export default VideoJS;

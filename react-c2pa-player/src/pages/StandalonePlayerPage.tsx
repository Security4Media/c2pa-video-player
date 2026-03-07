import { useCallback, useEffect, useState } from 'react';
import { type VideoJSOptions } from '../components/VideoJS';
import { VideoLoader, type VideoItem } from '../components/VideoLoader';
import { PlayerStats } from '../components/PlayerStats';
import { VideoPlayerSection } from '../components/VideoPlayerSection';
import '../styles/design-tokens.css';
import './StandalonePlayerPage.css';

type PlayerStatus = 'ready' | 'loading' | 'error';

interface StreamInfo {
  timestamp: string;
  message: string;
}

export function StandalonePlayerPage() {
  const [mp4Url, setMp4Url] = useState('');
  const [selectedVideo, setSelectedVideo] = useState('');
  const [availableVideos, setAvailableVideos] = useState<VideoItem[]>([]);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>('ready');
  const [statusMessage, setStatusMessage] = useState('Player Ready');
  const [streamInfos, setStreamInfos] = useState<StreamInfo[]>([]);
  const [playerStats, setPlayerStats] = useState<{
    currentTime: number;
    duration: number;
    buffered: number;
  }>({
    currentTime: 0,
    duration: 0,
    buffered: 0,
  });

  const [videoPlayer, setVideoPlayer] = useState<any>(null);
  const [videoJsOptions, setVideoJsOptions] = useState<VideoJSOptions>({
    autoplay: false,
    controls: true,
    responsive: true,
    fluid: true,
    controlBar: {
      children: [
        'playToggle',
        'progressControl',
        'currentTimeDisplay',
        'volumePanel',
        'pictureInPictureToggle',
        'fullscreenToggle',
      ],
    },
  });

  const updateStatus = useCallback((type: PlayerStatus, message: string) => {
    setPlayerStatus(type);
    setStatusMessage(message);
  }, []);

  const updateStreamInfo = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setStreamInfos((prev) => [{ timestamp, message }, ...prev.slice(0, 9)]);
  }, []);

  /**
   * Loads video from URL and updates player state
   */
  const loadVideo = useCallback(
    (url: string, displayName: string) => {
      updateStatus('loading', 'Loading Stream...');
      updateStreamInfo(`Loading video from: ${displayName}`);

      setMp4Url(displayName);
      setSelectedVideo('');

      setVideoJsOptions((prev) => ({
        ...prev,
        sources: [
          {
            src: url,
            type: 'video/mp4',
          },
        ],
      }));

      updateStreamInfo('Video source updated');
    },
    [updateStatus, updateStreamInfo]
  );

  /**
   * Handles error messages
   */
  const handleError = useCallback(
    (message: string) => {
      updateStatus('error', 'Error');
      updateStreamInfo(message);
    },
    [updateStatus, updateStreamInfo]
  );

  /**
   * Handles video list updates from VideoLoader
   */
  const handleVideoListLoad = useCallback((videos: VideoItem[]) => {
    setAvailableVideos(videos);
    if (videos.length > 0) {
      setSelectedVideo(`${videos[0].name}|${videos[0].source}`);
    }
  }, []);

  // Load video list from local directory using Vite's glob import
  const loadVideoList = useCallback(async () => {
    try {
      // Use Vite's import.meta.glob to get all MP4 files from the public directory
      const videoModules = import.meta.glob('/public/playlists/mp4s/*.mp4', {
        eager: false,
        query: '?url',
        import: 'default',
      });

      // Extract just the filenames from the full paths
      const mp4Files: VideoItem[] = Object.keys(videoModules).map((path) => {
        const filename = path.split('/').pop() || '';
        return { name: filename, source: 'server' as const };
      });

      setAvailableVideos(mp4Files);
      updateStreamInfo(`Loaded ${mp4Files.length} videos from server`);
    } catch (error) {
      console.error('Error loading video list:', error);
      handleError('Error loading video list');
    }
  }, [updateStreamInfo, handleError]);

  /**
   * Clears player and resets state
   */
  const clearPlayer = useCallback(() => {
    setMp4Url('');
    setSelectedVideo('');
    updateStatus('ready', 'Player Ready');
    updateStreamInfo('Player cleared');
    setPlayerStats({ currentTime: 0, duration: 0, buffered: 0 });

    // Clear video source
    setVideoJsOptions((prev) => ({
      ...prev,
      sources: [],
    }));

    // Reload for fresh initialization
    window.location.reload();
  }, [updateStatus, updateStreamInfo]);

  // Load video list on mount
  useEffect(() => {
    loadVideoList();
  }, [loadVideoList]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return;

      if (!videoPlayer) return;

      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (videoPlayer.paused()) {
            videoPlayer.play();
          } else {
            videoPlayer.pause();
          }
          break;
        case 'ArrowLeft':
          videoPlayer.currentTime(Math.max(0, videoPlayer.currentTime() - 10));
          break;
        case 'ArrowRight':
          videoPlayer.currentTime(videoPlayer.currentTime() + 10);
          break;
        case 'm':
          videoPlayer.muted(!videoPlayer.muted());
          break;
      }
    };

    document.addEventListener('keydown', handleKeyboard);

    return () => {
      document.removeEventListener('keydown', handleKeyboard);
    };
  }, [videoPlayer]);


  const handlePlayerReady = useCallback((player: any) => {
    setVideoPlayer(player);
  }, []);

  const handleTimeUpdate = useCallback((currentTime: number) => {
    setPlayerStats((prev) => ({
      ...prev,
      currentTime,
    }));
  }, []);

  const handleDurationChange = useCallback((duration: number) => {
    setPlayerStats((prev) => ({
      ...prev,
      duration,
    }));
  }, []);

  return (
    <div className="standalone-player-page">
      <div className="container">
        <div className="header">
          <div className="ebu-logo">
            <img src="/ebu-logo-blue.png" alt="EBU Logo" />
          </div>
          <h2>EBU C2PA & CAWG Verifier for Monolithic Player</h2>
          <h2>NAB SHOW 2026</h2>
        </div>

        <VideoLoader
          mp4Url={mp4Url}
          selectedVideo={selectedVideo}
          availableVideos={availableVideos}
          onMp4UrlChange={setMp4Url}
          onVideoLoad={loadVideo}
          onError={handleError}
          onStatusUpdate={updateStreamInfo}
          onVideoListLoad={handleVideoListLoad}
          onLoadVideoList={loadVideoList}
          onClearPlayer={clearPlayer}
        />

        <VideoPlayerSection
          videoJsOptions={videoJsOptions}
          onPlayerReady={handlePlayerReady}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onStatusUpdate={updateStatus}
          onStreamInfo={updateStreamInfo}
        />

        <PlayerStats
          playerStatus={playerStatus}
          statusMessage={statusMessage}
          streamInfos={streamInfos}
          playerStats={playerStats}
        />
      </div>
    </div>
  );
}

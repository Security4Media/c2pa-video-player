import { useCallback, useEffect, useMemo, useState } from 'react';
import { type VideoJSOptions } from '../components/VideoJS';
import { VideoLoader, type VideoItem } from '../components/VideoLoader';
import { PlayerStats } from '../components/PlayerStats';
import { VideoPlayerSection } from '../components/VideoPlayerSection';
import { VideoNavigationControls } from '../components/VideoNavigationControls';
import { VideoModeSwitcher } from '../components/VideoModeSwitcher';
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
  const [videoMode, setVideoMode] = useState<'server' | 'local'>('server');
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

  // Store navigation function from VideoLoader
  const [navigateToVideo, setNavigateToVideo] = useState<((videoKey: string) => void) | null>(
    null
  );

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
    (url: string, displayName: string, videoKey?: string) => {
      updateStatus('loading', 'Loading Stream...');
      updateStreamInfo(`Loading video from: ${displayName}`);

      setMp4Url(displayName);
      // Only clear selectedVideo if no videoKey is provided (e.g., manual URL entry)
      // If videoKey is provided (from dropdown selection), update it
      setSelectedVideo(videoKey || '');

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
   * Merges new videos with existing ones instead of replacing
   */
  const handleVideoListLoad = useCallback((videos: VideoItem[]) => {
    if (videos.length === 0) return;

    setAvailableVideos((prev) => {
      // Determine source of incoming videos
      const incomingSource = videos[0]?.source;
      
      if (!incomingSource) return prev;
      
      // Keep videos from other sources, replace videos from same source
      const otherSourceVideos = prev.filter((v) => v.source !== incomingSource);
      const mergedVideos = [...otherSourceVideos, ...videos];
      
      return mergedVideos;
    });

    // Auto-switch to local mode if local videos are loaded
    const hasLocal = videos.some((v) => v.source === 'local');
    if (hasLocal) {
      setVideoMode('local');
      setSelectedVideo(`${videos[0].name}|${videos[0].source}`);
    }
  }, []);

  /**
   * Filter videos based on current mode (server/local)
   */
  const filteredVideos = useMemo(() => {
    return availableVideos.filter((video) => video.source === videoMode);
  }, [availableVideos, videoMode]);

  /**
   * Checks if local videos are available
   */
  const hasLocalVideos = useMemo(() => {
    return availableVideos.some((video) => video.source === 'local');
  }, [availableVideos]);

  /**
   * Checks if server videos are available
   */
  const hasServerVideos = useMemo(() => {
    return availableVideos.some((video) => video.source === 'server');
  }, [availableVideos]);

  /**
   * Toggles between server and local video modes
   */
  const handleToggleMode = useCallback(() => {
    const newMode = videoMode === 'server' ? 'local' : 'server';
    setVideoMode(newMode);
    
    // Update selected video to first video in new mode
    const videosInMode = availableVideos.filter((v) => v.source === newMode);
    if (videosInMode.length > 0) {
      const firstVideo = videosInMode[0];
      const videoKey = `${firstVideo.name}|${firstVideo.source}`;
      setSelectedVideo(videoKey);
      if (navigateToVideo) {
        navigateToVideo(videoKey);
      }
    }
    
    updateStreamInfo(`Switched to ${newMode} video mode`);
  }, [videoMode, availableVideos, navigateToVideo, updateStreamInfo]);

  /**
   * Exposes navigation function from VideoLoader
   */
  const handleExposeNavigate = useCallback((navigateFn: (videoKey: string) => void) => {
    setNavigateToVideo(() => navigateFn);
  }, []);

  /**
   * Handles video navigation from navigation controls
   */
  const handleVideoNavigate = useCallback(
    (videoKey: string) => {
      if (navigateToVideo) {
        navigateToVideo(videoKey);
        setSelectedVideo(videoKey);
      }
    },
    [navigateToVideo]
  );

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
          <div className="logos">
            <img src="/ebu-logo-dark.svg" alt="EBU Logo" className="ebu-logo" />
            <img src="/nab-logo.png" alt="NAB Show Logo" className="nab-logo" />
          </div>
          <h2>C2PA & CAWG validation player</h2>
          <h2>NAB SHOW 2026</h2>
        </div>

        <VideoLoader
          mp4Url={mp4Url}
          selectedVideo={selectedVideo}
          availableVideos={filteredVideos}
          onMp4UrlChange={setMp4Url}
          onVideoLoad={loadVideo}
          onError={handleError}
          onStatusUpdate={updateStreamInfo}
          onVideoListLoad={handleVideoListLoad}
          onLoadVideoList={loadVideoList}
          onClearPlayer={clearPlayer}
          onExposeNavigate={handleExposeNavigate}
        />

        <VideoModeSwitcher
          currentMode={videoMode}
          onToggle={handleToggleMode}
          hasServerVideos={hasServerVideos}
          hasLocalVideos={hasLocalVideos}
        />

        <VideoPlayerSection
          videoJsOptions={videoJsOptions}
          onPlayerReady={handlePlayerReady}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onStatusUpdate={updateStatus}
          onStreamInfo={updateStreamInfo}
        >
          <VideoNavigationControls
            availableVideos={filteredVideos}
            selectedVideo={selectedVideo}
            onNavigate={handleVideoNavigate}
          />
        </VideoPlayerSection>

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

import { useCallback, useEffect, useState } from 'react';
import VideoJSWithC2PA from '../components/VideoJSWithC2PA';
import { type VideoJSOptions } from '../components/VideoJS';
import { C2PAPlayer } from '../components/C2PAPlayer';
import { initializeC2PA } from '../services/c2pa-monolithic';
import '../styles/design-tokens.css';
import './StandalonePlayerPage.css';

type PlayerStatus = 'ready' | 'loading' | 'error';

interface StreamInfo {
  timestamp: string;
  message: string;
}

export function StandalonePlayerPage() {
  const [mp4Url, setMp4Url] = useState('/playlists/mp4s/cawg_robot_wdr_c2pa.mp4');
  const [selectedVideo, setSelectedVideo] = useState('');
  const [availableVideos, setAvailableVideos] = useState<string[]>([]);
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
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('');
  const [showC2PAOverlay, setShowC2PAOverlay] = useState(false);
  const [c2paValidationState, setC2paValidationState] = useState<'Unknown' | 'Valid' | 'Trusted' | 'Invalid'>('Unknown');
  const [c2paStatus, setC2paStatus] = useState<any>(null);
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

  // Load video list from local directory using Vite's glob import
  const loadVideoList = async () => {
    try {
      // Use Vite's import.meta.glob to get all MP4 files from the public directory
      const videoModules = import.meta.glob('/public/playlists/mp4s/*.mp4', { 
        eager: false,
        query: '?url',
        import: 'default'
      });

      // Extract just the filenames from the full paths
      const mp4Files = Object.keys(videoModules).map((path) => {
        const filename = path.split('/').pop() || '';
        return filename;
      });

      console.log('Found video files:', mp4Files);
      setAvailableVideos(mp4Files);
      updateStreamInfo(`Loaded ${mp4Files.length} videos from local directory`);
    } catch (error) {
      console.error('Error loading video list:', error);
      updateStreamInfo('Error loading video list');
    }
  };

  // Load video list on mount
  useEffect(() => {
    loadVideoList();
  }, []);

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

  const handlePlaybackUpdate = useCallback((e: any) => {
    // This will be called by C2PA service during video timeupdate
    if (e.c2pa_status) {
      console.log('[Standalone Page] Playback update:', e.c2pa_status);
      setC2paStatus(e.c2pa_status);
      
      // Update validation state for button
      const state = e.c2pa_status.validation_state || 'Unknown';
      setC2paValidationState(state);
    }
  }, []);

  const updateStatus = useCallback((type: PlayerStatus, message: string) => {
    setPlayerStatus(type);
    setStatusMessage(message);
  }, []);

  const updateStreamInfo = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setStreamInfos((prev) => [{ timestamp, message }, ...prev.slice(0, 9)]);
  }, []);

  // Handle VideoJS player ready
  const handlePlayerReady = useCallback(
    async (player: any) => {
      console.log('[VideoJS] Player ready callback');
      setVideoPlayer(player);

      // Get the underlying video element
      const videoEl = player.el().querySelector('video');
      if (videoEl) {
        setVideoElement(videoEl);

        // Setup video event listeners
        player.on('loadstart', () => updateStatus('loading', 'Loading...'));
        player.on('canplay', () => updateStatus('ready', 'Ready to Play'));
        player.on('playing', () => updateStatus('ready', 'Playing'));
        player.on('pause', () => updateStatus('ready', 'Paused'));
        player.on('ended', () => updateStatus('ready', 'Ended'));
        player.on('error', () => {
          updateStatus('error', 'Video Error');
          console.error('Video error');
        });

        // Initialize C2PA when video can play
        let c2paInitialized = false;
        player.on('canplay', async () => {
          if (!c2paInitialized && videoEl.src) {
            c2paInitialized = true;
            try {
              await initializeC2PA(videoEl, handlePlaybackUpdate);
              console.log('[C2PA] Initialization successful');
            } catch (error) {
              console.error('[C2PA] Initialization failed:', error);
            }
          }
        });

        updateStreamInfo('Player initialized successfully');
      }
    },
    [handlePlaybackUpdate, updateStatus, updateStreamInfo]
  );

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'video/mp4') {
      const URL = window.URL || window.webkitURL;
      const blobUrl = URL.createObjectURL(file);
      setMp4Url(`Local file: ${file.name}`);
      setSelectedVideo('');
      loadStreamFromUrl(blobUrl);
    } else {
      alert('Please select a valid MP4 file.');
    }
  };

  const handleVideoSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedPath = event.target.value;
    if (selectedPath) {
      setMp4Url(selectedPath);
      setSelectedVideo(selectedPath);
      loadStreamFromUrl(selectedPath);
    }
  };

  const loadStream = () => {
    if (!mp4Url.trim()) {
      alert('Please enter an MP4 URL or select a local file.');
      return;
    }

    loadStreamFromUrl(mp4Url);
  };

  const loadStreamFromUrl = (url: string) => {
    try {
      updateStatus('loading', 'Loading Stream...');
      updateStreamInfo('Loading video from: ' + url);

      // Check for CORS issues
      if (window.location.protocol === 'file:' && !url.startsWith('blob:')) {
        updateStatus('error', 'CORS Error');
        updateStreamInfo('CORS Error: Cannot load external URLs from file:// protocol');
        return;
      }

      // Update video source
      setCurrentVideoUrl(url);
      setVideoJsOptions((prev) => ({
        ...prev,
        sources: [
          {
            src: url,
            type: 'video/mp4',
          },
        ],
      }));

      updateStreamInfo('Video source updated: ' + url);
    } catch (error: any) {
      updateStatus('error', 'Load Error');
      updateStreamInfo('Error loading stream: ' + error.message);
      console.error('Load stream error:', error);
    }
  };

  const clearPlayer = () => {
    setMp4Url('');
    setSelectedVideo('');
    setCurrentVideoUrl('');
    updateStatus('ready', 'Player Ready');
    updateStreamInfo('Player cleared');
    setPlayerStats({ currentTime: 0, duration: 0, buffered: 0 });

    // Clear video source
    setVideoJsOptions((prev) => ({
      ...prev,
      sources: [],
    }));

    // Reload for fresh C2PA initialization
    window.location.reload();
  };

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

        <div className="input-section">
          <div className="input-group">
            <select
              id="videoSelect"
              value={selectedVideo}
              onChange={handleVideoSelect}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '2px solid #dee2e6',
                borderRadius: '10px',
                background: 'white',
                color: '#333',
                fontSize: '16px',
                minWidth: '250px',
              }}
            >
              <option value="">-- Select a video from /playlists/mp4s --</option>
              {availableVideos.map((video) => (
                <option key={video} value={`/playlists/mp4s/${video}`}>
                  {video}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={loadVideoList}>
              🔄 Refresh List
            </button>
          </div>

          <div className="input-group">
            <input
              type="text"
              id="mp4Url"
              placeholder="Enter MP4 URL or select local file..."
              value={mp4Url}
              onChange={(e) => setMp4Url(e.target.value)}
            />
            <input type="file" id="mp4File" accept=".mp4" onChange={handleFileSelect} />
          </div>

          <div className="input-group">
            <button className="btn btn-primary" onClick={loadStream}>
              Load Stream
            </button>
            <button className="btn btn-secondary" onClick={clearPlayer}>
              Clear
            </button>
          </div>
        </div>

        <div className="player-section">
          <VideoJSWithC2PA
            options={videoJsOptions}
            onReady={handlePlayerReady}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={handleDurationChange}
            onC2PAButtonClick={() => setShowC2PAOverlay(!showC2PAOverlay)}
            validationState={c2paValidationState}
          />
        </div>

        <div className="info-panel">
          <h3>
            Player Status: <span className={`status ${playerStatus}`}>{statusMessage}</span>
          </h3>
          <div id="streamInfo">
            {streamInfos.map((info, index) => (
              <div key={index}>
                [{info.timestamp}] {info.message}
              </div>
            ))}
          </div>
          <div id="playerStats">
            <div>Current Time: {playerStats.currentTime.toFixed(1)}s</div>
            <div>Duration: {playerStats.duration ? playerStats.duration.toFixed(1) + 's' : 'Unknown'}</div>
            <div>Buffered: {playerStats.buffered.toFixed(1)}s</div>
          </div>
        </div>
      </div>

      {/* C2PA Player Integration */}
      {videoElement && videoPlayer && currentVideoUrl && (
        <C2PAPlayer 
          videoElement={videoElement} 
          videoPlayer={videoPlayer} 
          isMonolithic={true}
          showOverlay={showC2PAOverlay}
          onToggleOverlay={() => setShowC2PAOverlay(!showC2PAOverlay)}
          onValidationStateChange={setC2paValidationState}
          c2paStatus={c2paStatus}
        />
      )}
    </div>
  );
}

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

interface VideoItem {
  name: string;
  source: 'local' | 'server';
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
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string>('');
  const [showC2PAOverlay, setShowC2PAOverlay] = useState(false);
  const [c2paValidationState, setC2paValidationState] = useState<'Unknown' | 'Valid' | 'Trusted' | 'Invalid'>('Unknown');
  const [c2paStatus, setC2paStatus] = useState<any>(null);
  const [localVideoFiles, setLocalVideoFiles] = useState<Map<string, File>>(new Map());
  const [uploadProgress, setUploadProgress] = useState<{
    isLoading: boolean;
    processed: number;
    total: number;
    currentFile: string;
  }>({
    isLoading: false,
    processed: 0,
    total: 0,
    currentFile: '',
  });
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
      const mp4Files: VideoItem[] = Object.keys(videoModules).map((path) => {
        const filename = path.split('/').pop() || '';
        return { name: filename, source: 'server' as const };
      });

      console.log('Found video files:', mp4Files);
      setAvailableVideos(mp4Files);
      setLocalVideoFiles(new Map()); // Clear local files when loading from server
      updateStreamInfo(`Loaded ${mp4Files.length} videos from server`);
    } catch (error) {
      console.error('Error loading video list:', error);
      updateStreamInfo('Error loading video list');
    }
  };

  const urlFromFile = (file: File) => {
    const URL = window.URL || window.webkitURL;
    return URL.createObjectURL(file);
  } 
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
      const blobUrl = urlFromFile(file);
      setMp4Url(`Local: ${file.name}`);
      setSelectedVideo('');
      loadStreamFromUrl(blobUrl);
    } else {
      alert('Please select a valid MP4 file.');
    }
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      updateStreamInfo('No files selected from folder');
      return;
    }

    // Start loading animation
    setUploadProgress({
      isLoading: true,
      processed: 0,
      total: files.length,
      currentFile: '',
    });

    // Process files with simulated progress for better UX
    const mp4Files: { name: string; file: File }[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Update progress
      setUploadProgress({
        isLoading: true,
        processed: i,
        total: files.length,
        currentFile: file.name,
      });

      // Small delay to show progress (can be removed for instant loading)
      await new Promise(resolve => setTimeout(resolve, 50));

      if (file.type === 'video/mp4' || file.name.endsWith('.mp4')) {
        mp4Files.push({ name: file.name, file });
      }
    }

    // Mark as complete
    setUploadProgress({
      isLoading: true,
      processed: files.length,
      total: files.length,
      currentFile: 'Complete!',
    });

    if (mp4Files.length === 0) {
      alert('No MP4 files found in the selected folder.');
      updateStreamInfo('No MP4 files found in selected folder');
      // Hide progress after a short delay
      setTimeout(() => {
        setUploadProgress({ isLoading: false, processed: 0, total: 0, currentFile: '' });
      }, 1500);
      return;
    }

    // Store the file objects in React state
    const fileMap = new Map(mp4Files.map(({ name, file }) => [name, file]));
    console.log('Storing local video files in state:', fileMap);
    setLocalVideoFiles(fileMap);

    // Update available videos list with local file names
    const videoItems: VideoItem[] = mp4Files.map(({ name }) => ({ 
      name, 
      source: 'local' as const 
    }));
    setAvailableVideos(videoItems);
    updateStreamInfo(`Loaded ${mp4Files.length} MP4 files from local folder`);
    console.log('Loaded local MP4 files:', videoItems);

    // Clear current selection and load the first video from the folder
    let firstVideo = mp4Files[0].file;
    setMp4Url(`Local: ${firstVideo.name}`)
    setSelectedVideo(`${firstVideo.name}|local`);
    loadStreamFromUrl(urlFromFile(firstVideo));

    // Hide progress after 2 seconds
    setTimeout(() => {
      setUploadProgress({ isLoading: false, processed: 0, total: 0, currentFile: '' });
    }, 2000);
  };

  const handleVideoSelect = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    console.log('Selected video value:', selectedValue);
    
    if (!selectedValue) return;

    // Parse the selected value (format: "filename|source")
    const [filename, source] = selectedValue.split('|');
    
    setSelectedVideo(selectedValue);

    if (source === 'local') {
      // Load from local file object
      console.log('Loading video from local file:', filename);
      const file = localVideoFiles.get(filename);
      if (file) {
        const blobUrl = urlFromFile(file);
        setMp4Url(`Local: ${filename}`);
        loadStreamFromUrl(blobUrl);
      } else {
        console.error('Local file not found in map:', filename);
      }
    } else {
      // Load from server path
      const serverPath = `/playlists/mp4s/${filename}`;
      console.log('Loading video from server path:', serverPath);
      setMp4Url(serverPath);
      loadStreamFromUrl(serverPath);
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
          {/* Upload Progress Indicator */}
          {uploadProgress.isLoading && (
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '12px',
              marginBottom: '16px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              animation: 'slideDown 0.3s ease-out',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '3px solid rgba(255,255,255,0.3)',
                    borderTop: '3px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}></div>
                  <span style={{ fontWeight: '600', fontSize: '16px' }}>
                    Loading Files...
                  </span>
                </div>
                <span style={{ fontWeight: '700', fontSize: '18px' }}>
                  {uploadProgress.processed} / {uploadProgress.total}
                </span>
              </div>
              
              <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '10px',
                height: '8px',
                overflow: 'hidden',
                marginBottom: '8px',
              }}>
                <div style={{
                  background: 'white',
                  height: '100%',
                  width: `${(uploadProgress.processed / uploadProgress.total) * 100}%`,
                  transition: 'width 0.3s ease',
                  borderRadius: '10px',
                }}></div>
              </div>
              
              <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                {uploadProgress.processed < uploadProgress.total ? (
                  <>Processing: {uploadProgress.currentFile}</>
                ) : (
                  <>✓ {uploadProgress.currentFile}</>
                )}
              </div>
            </div>
          )}

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
              <option value="">Select a video...</option>
              {availableVideos.map((video) => (
                <option key={`${video.name}|${video.source}`} value={`${video.name}|${video.source}`}>
                  {video.source === 'local' ? '📁 ' : '🌐 '}{video.name}
                </option>
              ))}
            </select>
            <button className="btn btn-secondary" onClick={loadVideoList}>
              🔄 Refresh List
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => document.getElementById('folderInput')?.click()}
              disabled={uploadProgress.isLoading}
            >
              📁 Load Folder
            </button>
            <input
              type="file"
              id="folderInput"
              {...({ webkitdirectory: '', directory: '' } as any)}
              multiple
              onChange={handleFolderSelect}
              style={{ display: 'none' }}
            />
          </div>

          <div className="input-group">
            <input
              type="text"
              id="mp4Url"
              placeholder="Select a video or enter MP4 URL..."
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { useVideoPlayerInitializer } from '../hooks/useVideoPlayerInitializer';

interface PlayerPageProps {
  onStatusUpdate?: (status: string) => void;
}

export function PlayerPage({ onStatusUpdate }: PlayerPageProps) {
  const [status, setStatus] = useState('Ready to load video');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoPlayer, setVideoPlayer] = useState<any>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');

  const { initializePlayer, isLoading, currentUrl } = useVideoPlayerInitializer({
    onPlayerCreated: (player, _element) => {
      setVideoPlayer(player);
      setStatus('Player initialized successfully');
    },
    onError: (error) => {
      setStatus(`Error: ${error}`);
    },
  });

  useEffect(() => {
    onStatusUpdate?.(status);
  }, [status, onStatusUpdate]);

  // Handle file upload
  const handleFileUpload = useCallback((event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && file.type === 'video/mp4' && videoRef.current) {
      const URL = window.URL || window.webkitURL;
      const mp4Url = URL.createObjectURL(file);
      setUploadedFileName(file.name);
      setSelectedVideoFile('');
      initializePlayer(mp4Url, videoRef.current);
      setStatus('Loading file: ' + file.name);
    } else if (file) {
      alert('Please select a valid MP4 file.');
    }
  }, [initializePlayer]);

  // Handle video selection from dropdown
  const handleVideoSelect = useCallback((event: Event) => {
    const select = event.target as HTMLSelectElement;
    const selectedPath = select.value;
    if (selectedPath && videoRef.current) {
      setSelectedVideoFile(selectedPath);
      setUploadedFileName('');
      initializePlayer(selectedPath, videoRef.current);
      setStatus('Loading: ' + selectedPath);
    }
  }, [initializePlayer]);

  // Setup event listeners for external HTML controls
  useEffect(() => {
    if (!videoRef.current) return;

    const fileInput = document.getElementById('mp4File');
    const videoSelect = document.getElementById('videoSelect');

    if (fileInput) {
      fileInput.addEventListener('change', handleFileUpload);
    }
    if (videoSelect) {
      videoSelect.addEventListener('change', handleVideoSelect);
    }

    return () => {
      if (fileInput) {
        fileInput.removeEventListener('change', handleFileUpload);
      }
      if (videoSelect) {
        videoSelect.removeEventListener('change', handleVideoSelect);
      }
    };
  }, [handleFileUpload, handleVideoSelect]);

  // Expose global API for external HTML to use
  useEffect(() => {
    (window as any).reactPlayerAPI = {
      loadVideo: (url: string) => {
        if (videoRef.current) {
          initializePlayer(url, videoRef.current);
          setStatus('Loading: ' + url);
        }
      },
      getStatus: () => status,
      getPlayer: () => videoPlayer,
      getCurrentUrl: () => currentUrl || selectedVideoFile || uploadedFileName,
    };

    return () => {
      delete (window as any).reactPlayerAPI;
    };
  }, [initializePlayer, status, videoPlayer, currentUrl, selectedVideoFile, uploadedFileName]);

  return (
    <div style={{ display: 'none' }}>
      {/* Hidden video element - the actual player is managed by Video.js in the HTML */}
      <video ref={videoRef} id="videoPlayer" />
      <div className="player-status">
        {isLoading ? 'Loading...' : status}
        {(currentUrl || selectedVideoFile || uploadedFileName) && (
          <div>Current: {uploadedFileName || selectedVideoFile || currentUrl}</div>
        )}
      </div>
    </div>
  );
}

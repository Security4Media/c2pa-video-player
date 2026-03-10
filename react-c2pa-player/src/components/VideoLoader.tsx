import { memo, useCallback, useEffect } from 'react';
import { useVideoUpload } from '../hooks/useVideoUpload';
import './VideoLoader.css';

export interface VideoItem {
  name: string;
  source: 'local' | 'server';
}

interface VideoLoaderProps {
  // Simple callbacks - parent doesn't need to know implementation details
  onVideoLoad: (url: string, displayName: string, videoKey?: string) => void;
  onError: (message: string) => void;
  onStatusUpdate: (message: string) => void;
  onVideoListLoad: (videos: VideoItem[]) => void;
  onLoadVideoList: () => void;
  onClearPlayer: () => void;
  onExposeNavigate?: (navigateFn: (videoKey: string) => void) => void;
  
  // Display state only (controlled by parent for UI consistency)
  mp4Url: string;
  selectedVideo: string;
  availableVideos: VideoItem[];
  onMp4UrlChange: (url: string) => void;
}

export const VideoLoader = memo(function VideoLoader({
  onVideoLoad,
  onError,
  onStatusUpdate,
  onVideoListLoad,
  onLoadVideoList,
  onClearPlayer,
  onExposeNavigate,
  mp4Url,
  selectedVideo,
  availableVideos,
  onMp4UrlChange,
}: VideoLoaderProps) {
  // VideoLoader now manages its own upload/selection logic
  const {
    uploadProgress,
    handleFileSelect: handleFileSelectRaw,
    handleFolderSelect: handleFolderSelectRaw,
    handleVideoSelect: handleVideoSelectRaw,
    validateAndLoadVideo,
    reprocessLocalFiles,
    selectVideoByKey,
  } = useVideoUpload({
    onVideoLoad,
    onError,
    onStatusUpdate,
  });

  // Expose navigation function to parent on mount
  useEffect(() => {
    if (onExposeNavigate) {
      onExposeNavigate(selectVideoByKey);
    }
  }, [onExposeNavigate, selectVideoByKey]);

  /**
   * Handles single file selection
   */
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFileSelectRaw(event);
      // Clear selection when loading from file
      onMp4UrlChange('Loading...');
    },
    [handleFileSelectRaw, onMp4UrlChange]
  );

  /**
   * Handles folder selection and updates available videos
   */
  const handleFolderSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const videoFiles = await handleFolderSelectRaw(event);

      if (videoFiles && videoFiles.length > 0) {
        // Notify parent of new video list
        const videoItems: VideoItem[] = videoFiles.map((file) => ({
          name: file.name,
          source: 'local' as const,
        }));
        onVideoListLoad(videoItems);
      }
    },
    [handleFolderSelectRaw, onVideoListLoad]
  );

  /**
   * Handles video selection from dropdown
   */
  const handleVideoSelect = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      handleVideoSelectRaw(event);
    },
    [handleVideoSelectRaw]
  );

  /**
   * Handles URL input and loads stream
   */
  const handleLoadStream = useCallback(() => {
    validateAndLoadVideo(mp4Url);
  }, [mp4Url, validateAndLoadVideo]);

  /**
   * Smart refresh handler - refreshes local files or server list based on current mode
   */
  const handleRefreshList = useCallback(async () => {
    // Check if we're in local mode (any video has source === 'local')
    const hasLocalVideos = availableVideos.some((video) => video.source === 'local');

    if (hasLocalVideos) {
      // Local mode: re-process local files with progress animation
      const videoFiles = await reprocessLocalFiles();
      
      if (videoFiles && videoFiles.length > 0) {
        const videoItems: VideoItem[] = videoFiles.map((file) => ({
          name: file.name,
          source: 'local' as const,
        }));
        onVideoListLoad(videoItems);
      }
    } else {
      // Server mode: call parent's load video list function
      onLoadVideoList();
    }
  }, [availableVideos, reprocessLocalFiles, onVideoListLoad, onLoadVideoList]);

  const isUploadComplete = uploadProgress.isLoading && uploadProgress.processed === uploadProgress.total;

  return (
    <div className="input-section">
      {/* Upload Progress Indicator */}
      {uploadProgress.isLoading && (
        <div
          style={{
            background: isUploadComplete 
              ? 'var(--color-primary)' 
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            padding: '16px 20px',
            borderRadius: '12px',
            marginBottom: '16px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            animation: 'slideDown 0.3s ease-out',
            transition: 'background 0.4s ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {isUploadComplete ? (
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    background: '#28a745',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'scaleIn 0.4s ease-out',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M13.5 4L6 11.5L2.5 8"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : (
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '3px solid rgba(255,255,255,0.3)',
                    borderTop: '3px solid white',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}
              <span style={{ fontWeight: '600', fontSize: '16px' }}>
                {isUploadComplete ? 'Upload Complete!' : 'Loading Files...'}
              </span>
            </div>
            <span style={{ fontWeight: '700', fontSize: '18px' }}>
              {uploadProgress.processed} / {uploadProgress.total}
            </span>
          </div>

          <div
            style={{
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '10px',
              height: '8px',
              overflow: 'hidden',
              marginBottom: '8px',
            }}
          >
            <div
              style={{
                background: isUploadComplete ? '#28a745' : 'white',
                height: '100%',
                width: `${(uploadProgress.processed / uploadProgress.total) * 100}%`,
                transition: 'width 0.3s ease, background 0.4s ease',
                borderRadius: '10px',
              }}
            />
          </div>

          <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
            {uploadProgress.processed < uploadProgress.total ? (
              <>Processing: {uploadProgress.currentFile}</>
            ) : (
              <>All files loaded successfully</>
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
              {video.source === 'local' ? '📁 ' : '🌐 '}
              {video.name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary" onClick={handleRefreshList}>
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
          onChange={(e) => onMp4UrlChange(e.target.value)}
        />
        <input type="file" id="mp4File" accept=".mp4" onChange={handleFileSelect} />
      </div>

      <div className="input-group">
        <button className="btn btn-primary" onClick={handleLoadStream}>
          Load Stream
        </button>
        <button className="btn btn-secondary" onClick={onClearPlayer}>
          Clear
        </button>
      </div>
    </div>
  );
});

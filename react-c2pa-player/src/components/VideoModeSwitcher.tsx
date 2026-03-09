import { memo } from 'react';
import './VideoModeSwitcher.css';

interface VideoModeSwitcherProps {
  currentMode: 'server' | 'local';
  onToggle: () => void;
  hasServerVideos: boolean;
  hasLocalVideos: boolean;
}

/**
 * Toggle switch for switching between server and local video modes
 * Only shows when both modes have available videos
 */
export const VideoModeSwitcher = memo(function VideoModeSwitcher({
  currentMode,
  onToggle,
  hasServerVideos,
  hasLocalVideos,
}: VideoModeSwitcherProps) {
  // Only show if both modes have videos
  if (!hasServerVideos || !hasLocalVideos) {
    return null;
  }

  return (
    <div className="video-mode-switcher">
      <button
        className={`mode-btn ${currentMode === 'server' ? 'active' : ''}`}
        onClick={currentMode === 'local' ? onToggle : undefined}
        disabled={currentMode === 'server'}
      >
        🌐 Server Videos
      </button>
      <button
        className={`mode-btn ${currentMode === 'local' ? 'active' : ''}`}
        onClick={currentMode === 'server' ? onToggle : undefined}
        disabled={currentMode === 'local'}
      >
        📁 Local Videos
      </button>
    </div>
  );
});

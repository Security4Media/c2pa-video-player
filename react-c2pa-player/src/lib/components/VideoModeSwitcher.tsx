/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

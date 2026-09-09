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
import type { VideoMode } from '../types/player.types';
import './VideoModeSwitcher.css';

interface VideoModeSwitcherProps {
  currentMode: VideoMode;
  onSelect: (mode: VideoMode) => void;
  hasServerVideos: boolean;
  hasLocalVideos: boolean;
  hasLiveVideos: boolean;
}

const TABS: Array<{ mode: VideoMode; label: string }> = [
  { mode: 'server', label: '🌐 Server' },
  { mode: 'local', label: '📁 Local' },
  { mode: 'live', label: '🔴 Live' },
];

/**
 * Switcher between server, local, and live video modes.
 * A tab is disabled (not hidden) once its mode has no available videos.
 */
export const VideoModeSwitcher = memo(function VideoModeSwitcher({
  currentMode,
  onSelect,
  hasServerVideos,
  hasLocalVideos,
  hasLiveVideos,
}: VideoModeSwitcherProps) {
  const availability: Record<VideoMode, boolean> = {
    server: hasServerVideos,
    local: hasLocalVideos,
    live: hasLiveVideos,
  };

  return (
    <div className="video-mode-switcher">
      {TABS.map(({ mode, label }) => (
        <button
          key={mode}
          className={`mode-btn ${currentMode === mode ? 'active' : ''}`}
          onClick={currentMode === mode ? undefined : () => onSelect(mode)}
          disabled={currentMode === mode || !availability[mode]}
        >
          {label}
        </button>
      ))}
    </div>
  );
});

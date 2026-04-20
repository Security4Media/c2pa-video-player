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

import { memo, useMemo } from 'react';
import type { VideoItem } from './VideoLoader';
import './VideoNavigationControls.css';

interface VideoNavigationControlsProps {
  availableVideos: VideoItem[];
  selectedVideo: string;
  onNavigate: (videoKey: string) => void;
}

/**
 * Navigation controls for browsing through a list of videos
 * Only displays when multiple videos are available in a list
 * Following React best practices: memo, derived state, callbacks
 */
export const VideoNavigationControls = memo(function VideoNavigationControls({
  availableVideos,
  selectedVideo,
  onNavigate,
}: VideoNavigationControlsProps) {
  /**
   * Derive navigation state (rerender-lazy-state-init pattern)
   * Using useMemo to compute navigation info only when dependencies change
   */
  const navigationState = useMemo(() => {
    // Don't show controls if no list or single video
    if (availableVideos.length <= 1) {
      return { canNavigate: false, currentIndex: -1, hasPrevious: false, hasNext: false };
    }

    const currentIndex = availableVideos.findIndex(
      (video) => `${video.name}|${video.source}` === selectedVideo
    );

    // Don't show if no video is selected from the list
    if (currentIndex === -1) {
      return { canNavigate: false, currentIndex: -1, hasPrevious: false, hasNext: false };
    }

    return {
      canNavigate: true,
      currentIndex,
      hasPrevious: currentIndex > 0,
      hasNext: currentIndex < availableVideos.length - 1,
      previousVideo: currentIndex > 0 ? availableVideos[currentIndex - 1] : undefined,
      nextVideo:
        currentIndex < availableVideos.length - 1 ? availableVideos[currentIndex + 1] : undefined,
    };
  }, [availableVideos, selectedVideo]);

  // Don't render if navigation is not available
  if (!navigationState.canNavigate) {
    return null;
  }

  const { hasPrevious, hasNext, previousVideo, nextVideo } = navigationState;

  return (
    <div className="video-navigation-controls">
      <button
        className="btn btn-navigation btn-previous"
        disabled={!hasPrevious}
        onClick={() => previousVideo && onNavigate(`${previousVideo.name}|${previousVideo.source}`)}
        title={previousVideo ? `Previous: ${previousVideo.name}` : 'No previous video'}
      >
        <span className="nav-icon">←</span>
        <div className="nav-content">
          <span className="nav-label">Previous</span>
          {previousVideo && (
            <span className="nav-video-name">
              {previousVideo.source === 'local' ? '📁 ' : '🌐 '}
              {previousVideo.name}
            </span>
          )}
        </div>
      </button>

      <button
        className="btn btn-navigation btn-next"
        disabled={!hasNext}
        onClick={() => nextVideo && onNavigate(`${nextVideo.name}|${nextVideo.source}`)}
        title={nextVideo ? `Next: ${nextVideo.name}` : 'No next video'}
      >
        <div className="nav-content">
          <span className="nav-label">Next</span>
          {nextVideo && (
            <span className="nav-video-name">
              {nextVideo.source === 'local' ? '📁 ' : '🌐 '}
              {nextVideo.name}
            </span>
          )}
        </div>
        <span className="nav-icon">→</span>
      </button>
    </div>
  );
});

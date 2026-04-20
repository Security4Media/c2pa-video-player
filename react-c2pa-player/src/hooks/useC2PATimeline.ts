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

import { useCallback, useRef, useEffect, useState } from 'react';
import type { ProgressSegmentElement, ValidationState } from '../types/c2pa.types';

interface UseC2PATimelineProps {
  videoPlayer: any;
  isMonolithic: boolean;
}

export function useC2PATimeline({ videoPlayer, isMonolithic }: UseC2PATimelineProps) {
  const progressSegmentsRef = useRef<ProgressSegmentElement[]>([]);
  const c2paControlBarRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize C2PA Control Bar
  const initializeControlBar = useCallback(() => {
    if (!videoPlayer || !window.videojs) {
      console.warn('[C2PA Timeline] Player or videojs not ready');
      return false;
    }

    // Check if control bar components exist
    if (!videoPlayer.controlBar || 
        !videoPlayer.controlBar.progressControl || 
        !videoPlayer.controlBar.progressControl.seekBar) {
      console.warn('[C2PA Timeline] Control bar components not ready');
      return false;
    }

    try {
      // Check if child already exists before doing anything
      const existingChild = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');
      if (existingChild) {
        console.log('[C2PA Timeline] Child already exists, reusing');
        c2paControlBarRef.current = existingChild;
        setIsInitialized(true);
        return true;
      }
    } catch (e) {
      // Child doesn't exist, continue
    }

    // Fallback: Use a simple div overlay if component registration fails
    const useFallback = () => {
      console.log('[C2PA Timeline] Using fallback DOM element approach');
      const seekBar = videoPlayer.controlBar.progressControl.seekBar.el();
      if (!seekBar) {
        console.error('[C2PA Timeline] Seekbar element not found');
        return false;
      }

      // Create a container div for our timeline segments
      let container = seekBar.querySelector('.c2pa-timeline-container');
      if (!container) {
        container = document.createElement('div');
        container.className = 'c2pa-timeline-container';
        container.style.position = 'absolute';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.top = '0';
        container.style.left = '0';
        container.style.pointerEvents = 'none';
        container.style.zIndex = '1';
        seekBar.appendChild(container);
      }

      c2paControlBarRef.current = {
        el: () => container
      };
      setIsInitialized(true);
      console.log('[C2PA Timeline] Fallback initialized successfully');
      return true;
    };

    // Try to register and add as Video.js component
    try {
      const videoJsGlobal = window.videojs as any;
      
      // Check if component is already registered
      let C2PALoadProgressBarComponent = null;
      try {
        C2PALoadProgressBarComponent = videoJsGlobal.getComponent('C2PALoadProgressBar');
      } catch (e) {
        // Component not registered yet
      }

      if (!C2PALoadProgressBarComponent) {
        const LoadProgressBar = videoJsGlobal.getComponent('LoadProgressBar');
        if (!LoadProgressBar) {
          console.warn('[C2PA Timeline] LoadProgressBar component not found, using fallback');
          return useFallback();
        }

        // Create the component class using ES6 class syntax
        class C2PALoadProgressBarClass extends LoadProgressBar {
          constructor(player: any, options: any) {
            super(player, options);
          }

          update() {
            // Override update to handle C2PA validation
            // Call parent update if needed
            if (super.update) {
              super.update();
            }
          }
        }

        // Register the component
        videoJsGlobal.registerComponent('C2PALoadProgressBar', C2PALoadProgressBarClass);
        C2PALoadProgressBarComponent = C2PALoadProgressBarClass;
        console.log('[C2PA Timeline] Registered C2PALoadProgressBar component');
      } else {
        console.log('[C2PA Timeline] Component already registered');
      }

      // Now add the child component using the component class directly
      videoPlayer.controlBar.progressControl.seekBar.addChild(C2PALoadProgressBarComponent, {});
      
      // Get reference to the added component
      const c2paTimeline = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');
      
      if (c2paTimeline && c2paTimeline.el()) {
        c2paTimeline.el().style.width = '100%';
        c2paTimeline.el().style.backgroundColor = 'transparent';
        c2paControlBarRef.current = c2paTimeline;
        setIsInitialized(true);
        console.log('[C2PA Timeline] Control bar initialized successfully');
        return true;
      } else {
        console.warn('[C2PA Timeline] Component added but element not found, using fallback');
        return useFallback();
      }
    } catch (error) {
      console.warn('[C2PA Timeline] Error during initialization, using fallback:', error);
      return useFallback();
    }
  }, [videoPlayer]);

  // Create timeline segment
  const createTimelineSegment = useCallback((
    segmentStartTime: number,
    segmentEndTime: number,
    verificationStatus: ValidationState,
    isInvalid = false
  ): ProgressSegmentElement => {
    const segment = document.createElement('div') as ProgressSegmentElement;
    segment.className = 'seekbar-play-c2pa';
    segment.style.width = '0%';
    segment.dataset.startTime = segmentStartTime.toString();
    segment.dataset.endTime = segmentEndTime.toString();
    segment.dataset.verificationStatus = verificationStatus;

    let bgColor = '';
    if (isInvalid) {
      bgColor = 'rgb(220, 53, 69)'; // red for invalid
    } else if (verificationStatus === 'Trusted') {
      bgColor = 'rgb(40, 167, 69)'; // green for trusted
    } else if (verificationStatus === 'Valid') {
      bgColor = 'rgb(23, 162, 184)'; // cyan for valid
    } else if (verificationStatus === 'Invalid') {
      bgColor = 'rgb(220, 53, 69)'; // red for invalid
    } else {
      bgColor = 'rgb(255, 193, 7)'; // yellow for unknown
    }

    segment.style.backgroundColor = bgColor;
    segment.style.position = 'absolute';
    segment.style.height = '100%';

    return segment;
  }, []);

  // Add segment to timeline
  const addSegment = useCallback((
    startTime: number,
    endTime: number,
    validationState: ValidationState,
    isInvalid = false
  ) => {
    if (!c2paControlBarRef.current) return;

    const segment = createTimelineSegment(startTime, endTime, validationState, isInvalid);
    c2paControlBarRef.current.el().appendChild(segment);
    progressSegmentsRef.current.push(segment);
  }, [createTimelineSegment]);

  // Update timeline visualization
  const updateTimeline = useCallback(() => {
    if (!videoPlayer || progressSegmentsRef.current.length === 0) return;

    const videoDuration = videoPlayer.duration();
    progressSegmentsRef.current.forEach((segment) => {
      const startTime = parseFloat(segment.dataset.startTime);
      const endTime = parseFloat(segment.dataset.endTime);
      const startPercent = (startTime / videoDuration) * 100;
      const widthPercent = ((endTime - startTime) / videoDuration) * 100;

      segment.style.left = `${startPercent}%`;
      segment.style.width = `${widthPercent}%`;
    });
  }, [videoPlayer]);

  // Clear all segments
  const clearSegments = useCallback(() => {
    console.log('[C2PA Timeline] Clearing all segments');
    progressSegmentsRef.current.forEach((segment) => {
      segment.remove();
    });
    progressSegmentsRef.current = [];
  }, []);

  // Handle seek in timeline
  const handleSeek = useCallback((seekTime: number) => {
    console.log('[C2PA Timeline] Handle seek to:', seekTime);
    
    progressSegmentsRef.current = progressSegmentsRef.current.filter((segment) => {
      const segmentStartTime = parseFloat(segment.dataset.startTime);
      const segmentEndTime = parseFloat(segment.dataset.endTime);
      const isSegmentActive =
        seekTime >= segmentEndTime ||
        (seekTime < segmentEndTime && seekTime >= segmentStartTime);

      if (!isSegmentActive) {
        segment.remove();
      }

      return isSegmentActive;
    });

    const lastSegment = progressSegmentsRef.current[progressSegmentsRef.current.length - 1];
    if (lastSegment) {
      if (parseFloat(lastSegment.dataset.endTime) > seekTime) {
        lastSegment.dataset.endTime = seekTime.toString();
      } else {
        if (!isMonolithic && 
            lastSegment.dataset.endTime !== seekTime.toString() && 
            lastSegment.dataset.verificationStatus !== 'Unknown') {
          const unknownSegment = createTimelineSegment(
            parseFloat(lastSegment.dataset.endTime),
            seekTime,
            'Unknown'
          );
          c2paControlBarRef.current?.el().appendChild(unknownSegment);
          progressSegmentsRef.current.push(unknownSegment);
        }
      }
    }

    updateTimeline();
  }, [isMonolithic, createTimelineSegment, updateTimeline]);

  useEffect(() => {
    if (!videoPlayer || isInitialized) return;

    // Wait for player to be ready before initializing control bar
    const initWhenReady = () => {
      if (videoPlayer.isReady_) {
        setTimeout(() => {
          initializeControlBar();
        }, 100);
      } else {
        videoPlayer.ready(() => {
          // Give it a small delay to ensure all components are initialized
          setTimeout(() => {
            initializeControlBar();
          }, 200);
        });
      }
    };

    initWhenReady();
  }, [initializeControlBar, videoPlayer, isInitialized]);

  return {
    addSegment,
    updateTimeline,
    clearSegments,
    handleSeek,
    controlBarRef: c2paControlBarRef,
  };
}

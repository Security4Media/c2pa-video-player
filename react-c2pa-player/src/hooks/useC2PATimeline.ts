import { useCallback, useRef, useEffect } from 'react';
import type { ProgressSegmentElement } from '../types/c2pa.types';

interface UseC2PATimelineProps {
  videoPlayer: any;
  isMonolithic: boolean;
}

export function useC2PATimeline({ videoPlayer, isMonolithic }: UseC2PATimelineProps) {
  const progressSegmentsRef = useRef<ProgressSegmentElement[]>([]);
  const c2paControlBarRef = useRef<any>(null);

  // Initialize C2PA Control Bar
  const initializeControlBar = useCallback(() => {
    if (!videoPlayer || !window.videojs) return;

    const LoadProgressBar = (window.videojs as any).getComponent('LoadProgressBar');

    class C2PALoadProgressBar extends LoadProgressBar {
      update() {
        // Override update to handle C2PA validation
      }
    }

    (window.videojs as any).registerComponent('C2PALoadProgressBar', C2PALoadProgressBar);
    videoPlayer.controlBar.progressControl.seekBar.addChild('C2PALoadProgressBar');

    const c2paTimeline = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');
    c2paTimeline.el().style.width = '100%';
    c2paTimeline.el().style.backgroundColor = 'transparent';

    c2paControlBarRef.current = c2paTimeline;
    console.log('[C2PA Timeline] Control bar initialized');
  }, [videoPlayer]);

  // Create timeline segment
  const createTimelineSegment = useCallback((
    segmentStartTime: number,
    segmentEndTime: number,
    verificationStatus: string,
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
    validationState: string,
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
            lastSegment.dataset.verificationStatus !== 'unknown') {
          const unknownSegment = createTimelineSegment(
            parseFloat(lastSegment.dataset.endTime),
            seekTime,
            'unknown'
          );
          c2paControlBarRef.current?.el().appendChild(unknownSegment);
          progressSegmentsRef.current.push(unknownSegment);
        }
      }
    }

    updateTimeline();
  }, [isMonolithic, createTimelineSegment, updateTimeline]);

  useEffect(() => {
    initializeControlBar();
  }, [initializeControlBar]);

  return {
    addSegment,
    updateTimeline,
    clearSegments,
    handleSeek,
    controlBarRef: c2paControlBarRef,
  };
}

import type { ManifestStore } from '@contentauth/c2pa-web';

export interface C2PAStatus {
  verified: boolean;
  validation_state: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
  details: {
    [key: string]: {
      manifestStore: ManifestStore | null;
      error: string | null;
      valid: boolean;
    };
  };
}

export interface C2PAPlayerProps {
  videoPlayer: any; // videojs player instance
  videoElement: HTMLVideoElement;
  isMonolithic?: boolean;
}

export interface TimelineSegment {
  startTime: number;
  endTime: number;
  verificationStatus: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
}

export interface ProgressSegmentElement extends HTMLDivElement {
  dataset: {
    startTime: string;
    endTime: string;
    verificationStatus: string;
  };
}

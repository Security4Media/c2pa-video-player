import type { ManifestStore } from '@contentauth/c2pa-web';
export type { ManifestStore } from '@contentauth/c2pa-web';

export type ValidationState = 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';

export interface C2PAStatus {
  manifestStore: ManifestStore | null;
  verificationStatus: ValidationState;
  validationState?: ValidationState;
}

export interface C2PAPlayerProps {
  videoPlayer: any; // videojs player instance
  videoElement: HTMLVideoElement;
  isMonolithic?: boolean;
}

export interface TimelineSegment {
  startTime: number;
  endTime: number;
  verificationStatus: ValidationState;
}

export interface ProgressSegmentElement extends HTMLDivElement {
  dataset: {
    startTime: string;
    endTime: string;
    verificationStatus: ValidationState;
  };
}

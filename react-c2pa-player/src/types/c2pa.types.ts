import type { ManifestStore } from '@contentauth/c2pa-web';

export type PlayerValidationState = 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
export type ValidationState = PlayerValidationState;


export interface C2PAStatus {
  manifestStore: ManifestStore | null;
  verificationStatus: PlayerValidationState;
  validationState?: PlayerValidationState;
}

export interface C2PAPlayerProps {
  videoPlayer: any; // videojs player instance
  videoElement: HTMLVideoElement;
  isMonolithic?: boolean;
}

export interface TimelineSegment {
  startTime: number;
  endTime: number;
  verificationStatus: PlayerValidationState;
}

export interface ProgressSegmentElement extends HTMLDivElement {
  dataset: {
    startTime: string;
    endTime: string;
    verificationStatus: PlayerValidationState;
  };
}

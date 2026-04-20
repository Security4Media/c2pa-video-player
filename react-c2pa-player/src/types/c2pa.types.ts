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

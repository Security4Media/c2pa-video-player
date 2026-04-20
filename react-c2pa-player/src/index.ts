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

// Export Video Player components
export { PlayerPage } from './components/PlayerPage';
export { VideoPlayerSection } from './components/VideoPlayerSection';

// Export hooks
export { useC2PATimeline } from './hooks/useC2PATimeline';
export { useC2PAValidation } from './hooks/useC2PAValidation';
export { useC2PASeekHandler } from './hooks/useC2PASeekHandler';
export { useC2PAManifest } from './hooks/useC2PAManifest';
export { useVideoPlayerInitializer } from './hooks/useVideoPlayerInitializer';
export { useC2PAPlayer } from './hooks/useC2PAPlayer';

// Export types
export type { C2PAStatus } from './types/c2pa.types';

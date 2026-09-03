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

import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import { C2paMenuContent } from './C2paMenuContent';
import { buildMenuRenderState, c2paMenuSectionTitles } from './menuViewModel';
import { C2PAStatus } from '@/lib/types/c2pa.types';
import type { ValidationTimelineSegment } from '@/lib/validation';

interface C2paMenuRootProps {
  c2paStatus: C2PAStatus | null;
  timeline: C2PATimelineState;
  resetKey: string;
  selectedSegment: ValidationTimelineSegment | null;
  onBackToLive: () => void;
}

/**
 * React menu container that derives display state from the raw C2PA
 * status payload and forwards the normalized result to the presentational
 * content component.
 */
export function C2paMenuRoot({ c2paStatus, timeline, resetKey, selectedSegment, onBackToLive }: C2paMenuRootProps) {
  const renderState = buildMenuRenderState(c2paStatus, timeline, selectedSegment);
  // Two different segments can resolve to the same manifestId (e.g. distinct
  // DASH integrity-only segments always resolve to the literal 'segment', or
  // two segments genuinely covered by the same live manifest) - fold in the
  // segment's own start time so switching between them still resets local
  // menu UI state (e.g. leaves a drilled-into History view) instead of
  // carrying it over from whichever segment was selected before.
  const segmentIdentity = selectedSegment ? `segment:${selectedSegment.startTime}` : 'live';

  return (
    <C2paMenuContent
      sectionTitles={c2paMenuSectionTitles}
      sections={renderState.sections}
      mode={renderState.mode}
      resetKey={`${resetKey}:${renderState.manifestId ?? 'none'}:${segmentIdentity}`}
      isSegmentView={renderState.isSegmentView}
      onBackToLive={onBackToLive}
    />
  );
}

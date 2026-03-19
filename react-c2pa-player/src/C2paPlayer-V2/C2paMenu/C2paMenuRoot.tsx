import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import { C2paMenuContent } from './C2paMenuContent';
import { buildMenuRenderState, c2paMenuSectionTitles } from './menuViewModel';
import { C2PAStatus } from '@/types/c2pa.types';

interface C2paMenuRootProps {
  c2paStatus: C2PAStatus | null;
  timeline: C2PATimelineState;
  resetKey: string;
}

/**
 * React menu container that derives display state from the raw C2PA
 * status payload and forwards the normalized result to the presentational
 * content component.
 */
export function C2paMenuRoot({ c2paStatus, timeline, resetKey }: C2paMenuRootProps) {
  const renderState = buildMenuRenderState(c2paStatus, timeline);

  return (
    <C2paMenuContent
      sectionTitles={c2paMenuSectionTitles}
      sections={renderState.sections}
      mode={renderState.mode}
      resetKey={`${resetKey}:${renderState.manifestId ?? 'none'}`}
    />
  );
}

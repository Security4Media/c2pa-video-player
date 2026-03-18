import { C2paMenuContent } from './C2paMenuContent';
import { c2paMenuItems, buildMenuRenderState } from './menuViewModel';
import { C2PAStatus } from '@/types/c2pa.types';

interface C2paMenuRootProps {
  c2paStatus: C2PAStatus | null;
  compromisedRegions: string[];
  resetKey: string;
}

/**
 * React menu container that derives display state from the raw C2PA
 * status payload and forwards the normalized result to the presentational
 * content component.
 */
export function C2paMenuRoot({ c2paStatus, compromisedRegions, resetKey }: C2paMenuRootProps) {
  const renderState = buildMenuRenderState(c2paStatus, compromisedRegions);

  return (
    <C2paMenuContent
      menuItems={c2paMenuItems}
      items={renderState.items}
      mode={renderState.mode}
      resetKey={`${resetKey}:${renderState.manifestId ?? 'none'}`}
    />
  );
}

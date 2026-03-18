import { C2PAStatus } from '@/types/c2pa.types';
import { getActiveManifest, getActiveManifestValidationStatus } from '../../services/c2pa_functions';
import {
  selectClaimGenerator,
  selectCreativeWorkAuthors,
  selectCreativeWorkContent,
  selectIngredients,
  selectOrganizationIdentity,
  selectSignatureIssuer,
  selectSignatureTime,
} from './C2paManifestFunctions';
import { C2paMenuContent } from './C2paMenuContent';

/**
 * Static menu item registry shared by the Video.js shell and the React
 * menu tree.
 */
export const c2paMenuItems = {
  SIG_ISSUER: 'Issued by',
  DATE: 'Issued on',
  CLAIM_GENERATOR: 'App or device used',
  ORGANIZATION: 'Organization',
  NAME: 'Producer',
  CAWG_IDENTITY: 'Publisher Identity (CAWG)',
  TRAINING_OPTOUT: 'About AI training opt-out',
  INGREDIENTS: 'History of provenance',
  C2PA_VALIDATION_STATUS: 'Validation Status',
  ALERT: 'Alert',
};

type MenuMode = 'ready' | 'loading' | 'no-manifest' | 'invalid';

interface C2paMenuRootProps {
  c2paStatus: C2PAStatus | null;
  compromisedRegions: string[];
  resetKey: string;
}

function buildAlertMessage(compromisedRegions: string[]) {
  if (compromisedRegions.length > 0) {
    return `The segment between ${compromisedRegions.join(', ')} may have been tampered with`;
  }

  return null;
}

function formatSignatureDate(timeValue: string | null) {
  const date = timeValue ? new Date(timeValue) : null;

  return date
    ? new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date)
    : null;
}

function formatClaimGenerators(claimGenerators: Array<{ name: string; version: string | null }> | null) {
  return claimGenerators?.map(gen => gen.version ? `${gen.name} ${gen.version}` : gen.name).join(', ') ?? null;
}

function formatProducerNames(authors: Array<{ name: string | null }>) {
  return authors.length > 0 ? authors.map(author => author.name).filter(Boolean).join(', ') : null;
}

function buildMenuRenderState(c2paStatus: C2PAStatus | null, compromisedRegions: string[]) {
  const manifestStore = c2paStatus?.manifestStore ?? null;
  const hasDefinitiveNoManifest =
    (c2paStatus && !manifestStore) ||
    (manifestStore?.manifests && Object.keys(manifestStore.manifests).length === 0);

  if (hasDefinitiveNoManifest) {
    return {
      mode: 'no-manifest' as MenuMode,
      manifestId: 'no-manifest',
      items: {},
      isInvalid: false,
    };
  }

  const activeManifest = manifestStore ? getActiveManifest(manifestStore) : null;
  if (!manifestStore || !activeManifest) {
    return {
      mode: 'loading' as MenuMode,
      manifestId: manifestStore?.active_manifest ?? 'loading',
      items: {},
      isInvalid: false,
    };
  }

  const validationStatus = getActiveManifestValidationStatus(manifestStore);
  if (validationStatus === 'Invalid') {
    return {
      mode: 'invalid' as MenuMode,
      manifestId: manifestStore.active_manifest ?? null,
      items: {},
      isInvalid: true,
    };
  }

  const claimGenerators = selectClaimGenerator(activeManifest);
  const authors = selectCreativeWorkAuthors(activeManifest);
  const creativeWorkContent = selectCreativeWorkContent(activeManifest);

  return {
    mode: 'ready' as MenuMode,
    manifestId: manifestStore.active_manifest ?? null,
    items: {
      SIG_ISSUER: selectSignatureIssuer(activeManifest),
      DATE: formatSignatureDate(selectSignatureTime(activeManifest)),
      CLAIM_GENERATOR: formatClaimGenerators(claimGenerators),
      ORGANIZATION: creativeWorkContent?.organization ?? null,
      NAME: formatProducerNames(authors),
      CAWG_IDENTITY: selectOrganizationIdentity(activeManifest, manifestStore),
      TRAINING_OPTOUT: null,
      INGREDIENTS: selectIngredients(activeManifest, manifestStore),
      C2PA_VALIDATION_STATUS: validationStatus ?? 'Unknown',
      ALERT: buildAlertMessage(compromisedRegions),
    },
    isInvalid: false,
  };
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

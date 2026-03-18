import {
  selectClaimGenerator,
  selectCreativeWorkAuthors,
  selectCreativeWorkContent,
  selectIngredients,
  selectOrganizationIdentity,
  selectSignatureIssuer,
  selectSignatureTime,
} from './C2paManifestFunctions';

import { getActiveManifest, getActiveManifestValidationStatus } from '../../services/c2pa_functions';

const c2paMenuItems = {
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

const c2paMenuDelimiter = ' ';

const c2paMenuValueToKeyMap = {};
for (const key in c2paMenuItems) {
  c2paMenuValueToKeyMap[c2paMenuItems[key]] = key;
}

const c2paAlertPrefix = 'The segment between ';
const c2paAlertSuffix = ' may have been tampered with';

function buildAlertMessage(compromisedRegions) {
  if (compromisedRegions.length > 0) {
    return c2paAlertPrefix + compromisedRegions.join(', ') + c2paAlertSuffix;
  }

  return null;
}

function formatSignatureDate(timeValue) {
  const date = timeValue ? new Date(timeValue) : null;

  return date
    ? new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date)
    : null;
}

function formatClaimGenerators(claimGenerators) {
  return claimGenerators?.map(gen => gen.version ? `${gen.name} ${gen.version}` : gen.name).join(', ') ?? null;
}

function formatProducerNames(authors) {
  return authors?.length > 0 ? authors.map(author => author.name).join(', ') : null;
}

export function buildC2PAMenuViewModel(c2paStatus, compromisedRegions = []) {
  const manifestStore = c2paStatus?.manifestStore ?? null;
  const activeManifest = manifestStore ? getActiveManifest(manifestStore) : null;

  if (!manifestStore || !activeManifest) {
    return {
      manifestStore,
      activeManifest,
      items: {
        ALERT: buildAlertMessage(compromisedRegions),
      },
    };
  }

  const claimGenerators = selectClaimGenerator(activeManifest);
  const authors = selectCreativeWorkAuthors(activeManifest);
  const creativeWorkContent = selectCreativeWorkContent(activeManifest);

  const validationStatus = getActiveManifestValidationStatus(manifestStore);
  const formattedValidationStatus = validationStatus === 'Invalid'
    ? 'Failed'
    : validationStatus;

  return {
    manifestStore,
    activeManifest,
    items: {
      SIG_ISSUER: selectSignatureIssuer(activeManifest),
      DATE: formatSignatureDate(selectSignatureTime(activeManifest)),
      CLAIM_GENERATOR: formatClaimGenerators(claimGenerators),
      ORGANIZATION: creativeWorkContent?.organization ?? null,
      NAME: formatProducerNames(authors),
      CAWG_IDENTITY: selectOrganizationIdentity(activeManifest, manifestStore),
      TRAINING_OPTOUT: null,
      INGREDIENTS: selectIngredients(activeManifest, manifestStore),
      C2PA_VALIDATION_STATUS: formattedValidationStatus ?? 'Unknown',
      ALERT: buildAlertMessage(compromisedRegions),
    },
  };
}

export function buildC2PAMenuRenderState(c2paStatus, compromisedRegions = []) {

  const hasLoadedManifestStore = c2paStatus && c2paStatus?.manifestStore
    && c2paStatus.manifestStore.active_manifest;

  if (!hasLoadedManifestStore) {
    return {
      mode: 'loading',
      manifestId: 'loading',
      items: {},
      isInvalid: false,
      hasAnyContent: false,
    };
  }

  const manifestStore = c2paStatus?.manifestStore;
  const manifestId = manifestStore?.active_manifest;
  const hasDefinitiveNoManifest =
    (c2paStatus && !manifestStore) ||
    (manifestStore?.manifests && Object.keys(manifestStore.manifests).length === 0);

  if (hasDefinitiveNoManifest) {
    return {
      mode: 'no-manifest',
      manifestId: 'no-manifest',
      items: {},
      isInvalid: false,
      hasAnyContent: false,
    };
  }


  const validationStatus = manifestStore?.validation_state ?? 'Unknown';
  if (validationStatus === 'Invalid') {
    return {
      mode: 'invalid',
      manifestId,
      items: {},
      isInvalid: true,
      hasAnyContent: false,
    };
  }

  const viewModel = buildC2PAMenuViewModel(c2paStatus, compromisedRegions);
  const hasAnyContent = Object.values(viewModel.items).some(value => value != null);

  return {
    mode: 'ready',
    manifestId,
    items: viewModel.items,
    isInvalid: false,
    hasAnyContent,
  };
}

export var C2PAMenu = function () {
  return {
    c2paMenuItems: function () {
      return c2paMenuItems;
    },

    c2paMenuDelimiter: function () {
      return c2paMenuDelimiter;
    },

    c2paMenuValueToKeyMap: function (itemValue) {
      return c2paMenuValueToKeyMap[itemValue];
    },

    //Functions to access the c2pa menu items from the c2pa manifest
    c2paItem: function (itemName, c2paStatus, compromisedRegions = []) {
      try {
        const viewModel = buildC2PAMenuViewModel(c2paStatus, compromisedRegions);
        return viewModel.items[itemName] ?? null;
      } catch (error) {
        console.error('[C2PA-MENU] Failed to build menu item', itemName, error);
        return null;
      }
    },
  };
};

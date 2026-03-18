import {
  selectClaimGenerator,
  selectCreativeWorkAuthors,
  selectCreativeWorkContent,
  selectIngredients,
  selectOrganizationIdentity,
} from './C2paManifestFunctions';

export var C2PAMenu = function () {
  //Items to show in the c2pa menu
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

  const c2paMenuValueToKeyMap = {};
  for (const key in c2paMenuItems) {
    c2paMenuValueToKeyMap[c2paMenuItems[key]] = key;
  }

  //Delimiter to separate the menu item name from its value
  const c2paMenuDelimiter = ' ';

  //Alert message to be shown when the c2pa validation has failed
  const c2paAlertPrefix = 'The segment between ';
  const c2paAlertSuffix = ' may have been tampered with';

  //Create an alert message if the c2pa validation has failed
  let c2paAlertMessage = function (compromisedRegions) {
    if (compromisedRegions.length > 0) {
      return c2paAlertPrefix + compromisedRegions.join(', ') + c2paAlertSuffix;
    } else {
      return null;
    }
  };

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
      let manifestStore,
        producer,
        generator
      try {
        manifestStore = c2paStatus.manifestStore;

      } catch (error) {
        console.error('[C2PA-MENU] Manifest does not exist');
        return null
      }

      const activeManifest = getActiveManifest(manifestStore);
      if (itemName == 'SIG_ISSUER') {
        return activeManifest?.signature_info?.issuer;
      }
      if (itemName == 'DATE') {
        const timeValue = activeManifest?.signature_info?.time;
        const date = timeValue ? new Date(timeValue) : null;
        return date
          ? new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          }).format(date)
          : null;
      }
      if (itemName == 'CLAIM_GENERATOR') {
        generator = selectClaimGenerator(activeManifest);
        return generator?.map(gen => gen.version ? `${gen.name} ${gen.version}` : gen.name).join(', ') ?? null;

      }
      if (itemName == 'NAME') {
        let authors = selectCreativeWorkAuthors(activeManifest);
        producer = authors?.length > 0 ? authors.map(author => author.name).join(', ') : null;
        return producer ?? null;
      }

      if (itemName == 'WEBSITE') {
        website = selectWebsite(activeManifest);
        return website;
      }


      if (itemName == 'C2PA_VALIDATION_STATUS') {
        switch (getActiveManifestValidationStatus(manifestStore)) {
          case "Trusted":
            return 'Trusted';
          case "Valid":
            return 'Valid';
          case "Invalid":
            return 'Failed';
          default:
            return 'Unknown';
        }
      }

      if (itemName == 'CAWG_IDENTITY') {
        let cawgOrganizationItem = selectOrganizationIdentity(activeManifest, manifestStore);
        if (!cawgOrganizationItem) {
          return null;
        }
        return cawgOrganizationItem ?? null;
      }

      if (itemName == 'INGREDIENTS') {
        let ingredients = selectIngredients(activeManifest, manifestStore);
        return ingredients && ingredients.length > 0 ? ingredients : null;
      }

      if (itemName == 'ALERT') {
        return c2paAlertMessage(compromisedRegions);
      }

      return null;
    },
  };
};
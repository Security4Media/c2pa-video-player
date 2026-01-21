export var C2PAMenu = function () {
  //Items to show in the c2pa menu
  const c2paMenuItems = {
    SIG_ISSUER: 'Issued by',
    DATE: 'Issued on',
    CLAIM_GENERATOR: 'App or device used',
    NAME: 'Name',
    LOCATION: 'Location',
    WEBSITE: 'Website',
    CAWG_IDENTITY: 'Publisher Identity (CAWG)',
    C2PA_VALIDATION_STATUS: 'Current C2PA Validation Status',
    CAWG_VALIDATION_STATUS: 'Current CAWG Validation Status',
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
      const verificationStatus = c2paStatus.validation_state;
      let manifestStore,
        producer,
        socialMedia,
        generator,
        website = null;

      try {
        manifestStore = c2paStatus.details.video.manifestStore;
        console.log('[C2PA] This is the manifest', manifestStore);

      } catch (error) {
        console.error('[C2PA] Manifest does not exist');
        return null
      }

      const activeManifestId = manifestStore.active_manifest;
      const activeManifest = manifestStore.manifests[activeManifestId];
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
        generator = selectFormattedClaimGenerator(activeManifest);
        return generator;

      }
      if (itemName == 'NAME') {
        let authors = selectCreativeWorkAuthors(activeManifest);
        producer = authors?.length > 0 ? authors.map(author => author.name).join(', ') : null;
        return producer ?? null;
      }
      // if (itemName == 'LOCATION') {
      //   location = selectLocation(activeManifest);
      //   return location;
      // }
      if (itemName == 'WEBSITE') {
        website = selectWebsite(activeManifest);
        return website;
      }
      if (itemName == 'SOCIAL') {
        socialMedia = selectSocialAccounts(activeManifest);
        return socialMedia?.map((account) => account['@id']) ?? null;
      }

      if (itemName == 'C2PA_VALIDATION_STATUS') {
        switch (verificationStatus) {
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
        let cawgId = selectCawgIdentity(activeManifest);
        if (!cawgId) {
          return "Not Present";
        }
        const [cawgIdentityStr, cawgIdentityObj] = cawgId;
        return cawgIdentityObj ?? null;
      }

      if (itemName == 'CAWG_VALIDATION_STATUS') {
        const cawgValidationStatus = getCAWGValidationStatus(manifestStore);
        return cawgValidationStatus;
      }

      if (itemName == 'ALERT') {
        return c2paAlertMessage(compromisedRegions);
      }

      return null;
    },
  };
};


function selectCreativeWorkAuthors(manifest) {
  const creativeWorkAssertion = manifest.assertions.find(
    assertion => assertion.label === 'stds.schema-org.CreativeWork'
  );
  return creativeWorkAssertion?.data?.author ?? null;
}

function selectFormattedClaimGenerator(manifest) {
  const claim_generators = manifest.claim_generator_info;
  const generatorString = claim_generators
    ?.map((gen) => `${gen.name} ${gen.version}`)
    .join(', ');

  return generatorString ?? null;

}

function selectWebsite(manifest) {
  const creativeWorkAssertion = manifest.assertions.find(
    assertion => assertion.label === 'stds.schema-org.CreativeWork'
  );
  return creativeWorkAssertion?.data?.url ?? null;
}

function selectLocation(manifest) {
  let exifAssertion = manifest.assertions.find(
    assertion => assertion.label === 'stds.exif'
  );

  if (!exifAssertion?.data) {
    return null;
  }

  let longitude =
    exifAssertion?.data[
    'EXIF:GPSLatitude'
    ];
  let latitude =
    exifAssertion?.data[
    'EXIF:GPSLatitude'
    ];

  let location = '';
  if (latitude) {
    location += `Lat: ${parseFloat(latitude)} `;
  }

  if (location && longitude) {
    location += ', ';
  }
  if (longitude) {
    location += `Long: ${parseFloat(longitude)}`;
  }

  return location || null;
}

function selectCawgIdentity(manifest) {
  const cawgAssertion = manifest.assertions.find(
    assertion => assertion.label === 'cawg.identity'
  );

  if (!cawgAssertion?.data) {
    return null;
  }

  let cawgString = '';
  let cawgObj = {};


  // Add issuer
  let signature_info = cawgAssertion.data.signature_info;
  cawgString += `Issuer: ${signature_info.issuer}`;
  cawgObj['issuer'] = signature_info.issuer;


  let signer_payload = cawgAssertion.data.signer_payload
  let referenced_assertions = signer_payload.referenced_assertions;
  // Add referenced assertions (filter out hash and revocation_status)
  if (referenced_assertions && Array.isArray(referenced_assertions)) {
    // filter hard-binding assertions
    const filteredAssertions = referenced_assertions
      .filter(assertion => !assertion.url.includes('hash'))
      .map(assertion => assertion.url.split('/').pop()) // get the action name only from the hashed url
      .join(', ');


    if (filteredAssertions) {
      cawgString += cawgString ? ', ' : '';
      cawgString += `Referenced Assertions: ${filteredAssertions}`;
      cawgObj['referenced_assertions'] = filteredAssertions;
    }
  }

  return [cawgString, cawgObj];
}



function getCAWGValidationStatus(manifestStore) {

  // Check if CAWG identity assertion is present
  const cawgAssertion = manifestStore.manifests[manifestStore.active_manifest].assertions.find(
    assertion => assertion.label === 'cawg.identity'
  );

  if (!cawgAssertion) {
    return 'Not Present';
  }

  // Evaluate validation results for CAWG identity
  const validationResults = manifestStore.validation_results;
  if (!validationResults) {
    return 'Unknown';
  }

  //Check that the CAWG is Trusted : well fomed + trusted credentials  
  const successResults = validationResults.activeManifest.success;
  let isWellFormed, isTrusted = false;

  if (successResults && successResults.length > 0) {
    isTrusted = successResults.some(result => (result.code === 'signingCredential.trusted') && result.url.includes('cawg.identity'));
    isWellFormed = successResults.some(result => (result.code === 'cawg.identity.well-formed') && result.url.includes('cawg.identity'));
    if (isWellFormed && isTrusted) {
      return 'Trusted';
    }
  }

  //Check that the CAWG is Valid =  well formed + trusted credentials  
  if (isWellFormed) {
    const failureResults = validationResults.activeManifest.failure;
    if (failureResults && failureResults.length > 0) {
      const isUntrusted = failureResults.some(result => (result.code === 'signingCredential.untrusted') && result.url.includes('cawg.identity'));
      if (isUntrusted) {
        return 'Valid';
      }
    }
  }

  return 'Invalid';
}

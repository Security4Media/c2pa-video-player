import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ManifestStore, Manifest, ManifestAssertion } from '@contentauth/c2pa-web';
import type { C2PAStatus } from '../types/c2pa.types';
import crIconUrl from '../assets/icons/cr-icon.svg?url';
import crInvalidIconUrl from '../assets/icons/cr-invalid.svg?url';
import './C2PADataOverlay.css';

interface C2PADataOverlayProps {
  c2paStatus: C2PAStatus | null;
  isVisible: boolean;
  videoPlayer: any;
}

export function C2PADataOverlay({ c2paStatus, isVisible, videoPlayer }: C2PADataOverlayProps) {
  const [c2paData, setC2paData] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  // Set up portal container in video player
  useEffect(() => {
    if (!videoPlayer) return;

    const playerContainer = videoPlayer.el();
    if (!playerContainer) return;

    // Ensure video player container has relative positioning
    if (window.getComputedStyle(playerContainer).position === 'static') {
      playerContainer.style.position = 'relative';
    }

    setPortalContainer(playerContainer);
  }, [videoPlayer]);

  // Extract C2PA data from status
  useEffect(() => {
    if (!c2paStatus) return;

    try {
      const manifestStore = c2paStatus.details?.video?.manifestStore;
      if (!manifestStore || !manifestStore.active_manifest) return;

      const activeManifestId = manifestStore.active_manifest;
      const activeManifest = manifestStore.manifests[activeManifestId];
      if (!activeManifest) return;

      const data = {
        issuer: activeManifest?.signature_info?.issuer || null,
        date: formatDate(activeManifest?.signature_info?.time),
        claimGenerator: selectClaimGenerator(activeManifest),
        authors: selectAuthors(activeManifest),
        website: selectWebsite(activeManifest),
        cawgIdentity: selectCawgIdentity(activeManifest),
        c2paValidation: c2paStatus.validation_state,
        cawgValidation: getCAWGValidation(manifestStore),
        isVerified: c2paStatus.verified,
      };

      setC2paData(data);
    } catch (error) {
      console.error('[C2PA Overlay] Error extracting data:', error);
    }
  }, [c2paStatus]);

  const formatDate = (timeValue: string | null | undefined) => {
    if (!timeValue) return null;
    const date = new Date(timeValue);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  };

  const selectClaimGenerator = (manifest: Manifest | undefined) => {
    const genAssertion = manifest?.assertions?.find(
      (a: ManifestAssertion) => a.label === 'c2pa.actions'
    );
    const data = genAssertion?.data as any;
    return data?.[0]?.softwareAgent || manifest?.claim_generator || null;
  };

  const selectAuthors = (manifest: Manifest | undefined) => {
    const creativeWork = manifest?.assertions?.find(
      (a: ManifestAssertion) => a.label === 'stds.schema-org.CreativeWork'
    );
    const data = creativeWork?.data as any;
    const authors = data?.author;
    return authors?.length > 0 ? authors.map((a: any) => a.name).join(', ') : null;
  };

  const selectWebsite = (manifest: Manifest | undefined) => {
    const creativeWork = manifest?.assertions?.find(
      (a: ManifestAssertion) => a.label === 'stds.schema-org.CreativeWork'
    );
    const data = creativeWork?.data as any;
    return data?.url || null;
  };

  const selectCawgIdentity = (manifest: Manifest | undefined) => {
    const cawgAssertion = manifest?.assertions?.find(
      (a: ManifestAssertion) => a.label === 'cawg.identity'
    );
    return cawgAssertion?.data || null;
  };

  const getCAWGValidation = (manifestStore: ManifestStore) => {
    // Check if CAWG identity assertion is present
    if (!manifestStore.active_manifest) return 'Unknown';
    
    const activeManifest = manifestStore.manifests[manifestStore.active_manifest];
    if (!activeManifest?.assertions) return 'Not Present';
    
    const cawgAssertion = activeManifest.assertions.find(
      (assertion: ManifestAssertion) => assertion.label === 'cawg.identity'
    );

  if (!cawgAssertion) {
    return 'Not Present';
  }

  // Evaluate validation results for CAWG identity
  const validationResults = manifestStore.validation_results;
  if (!validationResults) {
    return 'Unknown';
  }

  //Check that the CAWG is Trusted : well formed + trusted credentials  
  const activeManifestResults = validationResults.activeManifest;
  if (!activeManifestResults) return 'Unknown';
  
  const successResults = activeManifestResults.success;
  let isWellFormed = false;
  let isTrusted = false;

  if (successResults && successResults.length > 0) {
    isTrusted = successResults.some((result: any) => (result.code === 'signingCredential.trusted') && result.url.includes('cawg.identity'));
    isWellFormed = successResults.some((result: any) => (result.code === 'cawg.identity.well-formed') && result.url.includes('cawg.identity'));
    if (isWellFormed && isTrusted) {
      return 'Trusted';
    }
  }
  };

  

  const getValidationIcon = (state: string) => {
    switch (state) {
      case 'Trusted':
      case 'Valid':
        return crIconUrl;
      case 'Invalid':
        return crInvalidIconUrl;
      default:
        return crIconUrl;
    }
  };

  if (!isVisible || !c2paData || !portalContainer) return null;

  const validationStateClass = c2paData.c2paValidation.toLowerCase();

  const overlayContent = (
    <article
      className="c2pa-data-overlay"
      role="dialog"
      aria-label="Content Credentials Information"
      aria-modal="false"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <header className="c2pa-overlay-header">
        <img 
          src={getValidationIcon(c2paData.c2paValidation)}
          alt=""
          aria-hidden="true"
        />
        <div>
          <h2 className="c2pa-overlay-title">
            Content Credentials
          </h2>
          <p className="c2pa-overlay-subtitle">
            C2PA Verification Details
          </p>
        </div>
      </header>

      {/* Validation Status Banner */}
      <section
        className={`c2pa-validation-banner ${validationStateClass}`}
        aria-label="Validation Status"
      >
        <div className="c2pa-validation-icon" aria-hidden="true">
          {c2paData.c2paValidation === 'Trusted' || c2paData.c2paValidation === 'Valid' ? '✓' : 
           c2paData.c2paValidation === 'Invalid' ? '✗' : '?'}
        </div>
        <div className="c2pa-validation-text">
          <p className="c2pa-validation-state">
            {c2paData.c2paValidation}
          </p>
          <p className="c2pa-validation-label">
            C2PA Validation Status
          </p>
        </div>
      </section>

      {/* Data Fields */}
      <div className="c2pa-data-fields">
        {c2paData.issuer && (
          <DataField label="Issued by" value={c2paData.issuer} />
        )}
        {c2paData.date && (
          <DataField label="Issued on" value={c2paData.date} />
        )}
        {c2paData.claimGenerator && (
          <DataField label="App or device used" value={c2paData.claimGenerator} />
        )}
        {c2paData.authors && (
          <DataField label="Name" value={c2paData.authors} />
        )}
        {c2paData.website && (
          <DataField 
            label="Website" 
            value={c2paData.website}
            isLink
          />
        )}
        
        {/* CAWG Identity (Collapsible) */}
        {c2paData.cawgIdentity && (
          <details className="c2pa-collapsible" open={isExpanded}>
            <summary
              className="c2pa-collapsible-trigger"
              onClick={(e) => {
                e.preventDefault();
                setIsExpanded(!isExpanded);
              }}
            >
              <div>
                <div className="c2pa-field-label">
                  Publisher Identity (CAWG)
                </div>
                <div className="c2pa-field-value">
                  {isExpanded ? 'See details below' : 'Click to view details'}
                </div>
              </div>
              <span className="c2pa-collapsible-icon" aria-hidden="true">
                ▶
              </span>
            </summary>
            <div className="c2pa-collapsible-content">
              {JSON.stringify(c2paData.cawgIdentity, null, 2)}
            </div>
          </details>
        )}

        <DataField label="CAWG Validation Status" value={c2paData.cawgValidation} />
      </div>

      {/* Footer */}
      <footer className="c2pa-overlay-footer">
        Verification details based on C2PA manifest data
      </footer>
    </article>
  );

  return createPortal(overlayContent, portalContainer);
}

interface DataFieldProps {
  label: string;
  value: string | null;
  isLink?: boolean;
}

function DataField({ label, value, isLink = false }: DataFieldProps) {
  if (!value) return null;

  return (
    <div className="c2pa-data-field">
      <div className="c2pa-field-label">
        {label}
      </div>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="c2pa-field-value c2pa-field-link"
        >
          {value}
        </a>
      ) : (
        <div className="c2pa-field-value">{value}</div>
      )}
    </div>
  );
}


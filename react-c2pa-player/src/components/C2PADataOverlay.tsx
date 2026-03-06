import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { C2PAStatus } from '../types/c2pa.types';
import crIconUrl from '../assets/icons/cr-icon.svg?url';
import crInvalidIconUrl from '../assets/icons/cr-invalid.svg?url';

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
      if (!manifestStore) return;

      const activeManifestId = manifestStore.active_manifest;
      const activeManifest = manifestStore.manifests[activeManifestId];

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

  const formatDate = (timeValue: string | null) => {
    if (!timeValue) return null;
    const date = new Date(timeValue);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  };

  const selectClaimGenerator = (manifest: any) => {
    const genAssertion = manifest?.assertions?.find(
      (a: any) => a.label === 'c2pa.actions'
    );
    return genAssertion?.data?.[0]?.softwareAgent || manifest?.claim_generator || null;
  };

  const selectAuthors = (manifest: any) => {
    const creativeWork = manifest?.assertions?.find(
      (a: any) => a.label === 'stds.schema-org.CreativeWork'
    );
    const authors = creativeWork?.data?.author;
    return authors?.length > 0 ? authors.map((a: any) => a.name).join(', ') : null;
  };

  const selectWebsite = (manifest: any) => {
    const creativeWork = manifest?.assertions?.find(
      (a: any) => a.label === 'stds.schema-org.CreativeWork'
    );
    return creativeWork?.data?.url || null;
  };

  const selectCawgIdentity = (manifest: any) => {
    const cawgAssertion = manifest?.assertions?.find(
      (a: any) => a.label === 'cawg.publish_identity.v1'
    );
    return cawgAssertion?.data || null;
  };

  const getCAWGValidation = (manifestStore: any) => {
    // Simplified CAWG validation check
    const hasCAWG = manifestStore?.manifests?.[manifestStore.active_manifest]?.assertions?.some(
      (a: any) => a.label === 'cawg.publish_identity.v1'
    );
    return hasCAWG ? 'Present' : 'Not Present';
  };

  const getValidationColor = (state: string) => {
    switch (state) {
      case 'Trusted': return '#28a745';
      case 'Valid': return '#17a2b8';
      case 'Invalid': return '#dc3545';
      default: return '#ffc107';
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

  const overlayContent = (
    <div
      className="c2pa-data-overlay"
      style={{
        position: 'absolute',
        top: '10%',
        right: '5%',
        width: '450px',
        maxWidth: '90%',
        maxHeight: '80%',
        background: 'rgba(0, 0, 0, 0.95)',
        color: 'white',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        overflow: 'auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        backdropFilter: 'blur(10px)',
        pointerEvents: 'all',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        marginBottom: '20px',
        borderBottom: '2px solid rgba(255,255,255,0.15)',
        paddingBottom: '16px'
      }}>
        <img 
          src={getValidationIcon(c2paData.c2paValidation)}
          alt="Content Credentials"
          style={{ width: '40px', height: '40px' }}
        />
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>
            Content Credentials
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', opacity: 0.8 }}>
            C2PA Verification Details
          </p>
        </div>
      </div>

      {/* Validation Status Banner */}
      <div style={{
        background: getValidationColor(c2paData.c2paValidation),
        padding: '18px',
        borderRadius: '10px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
      }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          fontWeight: 'bold',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          {c2paData.c2paValidation === 'Trusted' || c2paData.c2paValidation === 'Valid' ? '✓' : 
           c2paData.c2paValidation === 'Invalid' ? '✗' : '?'}
        </div>
        <div>
          <div style={{ fontSize: '19px', fontWeight: '700' }}>
            {c2paData.c2paValidation}
          </div>
          <div style={{ fontSize: '14px', opacity: 0.95, marginTop: '2px' }}>
            C2PA Validation Status
          </div>
        </div>
      </div>

      {/* Data Fields */}
      <div style={{ 
        flex: 1, 
        overflow: 'auto',
        paddingRight: '8px',
        marginRight: '-8px'
      }}>
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
          <div style={{ marginBottom: '16px' }}>
            <div
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <div>
                <div style={{ fontSize: '11px', opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Publisher Identity (CAWG)
                </div>
                <div style={{ fontSize: '14px', marginTop: '4px' }}>
                  {isExpanded ? 'See details below' : 'Click to view details'}
                </div>
              </div>
              <div style={{ fontSize: '20px' }}>
                {isExpanded ? '▼' : '▶'}
              </div>
            </div>
            {isExpanded && (
              <div style={{
                marginTop: '8px',
                padding: '12px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {JSON.stringify(c2paData.cawgIdentity, null, 2)}
              </div>
            )}
          </div>
        )}

        <DataField label="CAWG Validation Status" value={c2paData.cawgValidation} />
      </div>

      {/* Footer */}
      <div style={{
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: '1px solid rgba(255,255,255,0.2)',
        fontSize: '11px',
        opacity: 0.6,
        textAlign: 'center'
      }}>
        Verification details based on C2PA manifest data
      </div>
    </div>
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
    <div style={{ 
      marginBottom: '14px',
      padding: '14px',
      background: 'rgba(255,255,255,0.08)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      <div style={{ 
        fontSize: '12px', 
        opacity: 0.75, 
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        marginBottom: '8px',
        fontWeight: '600'
      }}>
        {label}
      </div>
      {isLink ? (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: '#5dade2',
            textDecoration: 'none',
            fontSize: '15px',
            wordBreak: 'break-all',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
          onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
        >
          {value}
        </a>
      ) : (
        <div style={{ fontSize: '15px', lineHeight: '1.6', fontWeight: '500' }}>
          {value}
        </div>
      )}
    </div>
  );
}

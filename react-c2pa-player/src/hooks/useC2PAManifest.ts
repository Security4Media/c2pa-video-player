import { useState, useCallback } from 'react';
import type { C2PAStatus } from '../types/c2pa.types';

export function useC2PAManifest() {
  const [manifestData, setManifestData] = useState<any>(null);
  const [validationState, setValidationState] = useState<'Trusted' | 'Valid' | 'Invalid' | 'Unknown'>('Unknown');
  const [validationDetails, setValidationDetails] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);

  const updateManifest = useCallback((c2paStatus: C2PAStatus) => {
    if (!c2paStatus) return;

    setIsVerified(c2paStatus.verified);
    setValidationState(c2paStatus.validation_state);

    // Extract manifest details
    const details: string[] = [];
    if (c2paStatus.details) {
      Object.values(c2paStatus.details).forEach((detail: any) => {
        if (detail.manifestStore) {
          setManifestData(detail.manifestStore);
          
          // Extract useful information
          if (detail.manifestStore.active_manifest) {
            const manifest = detail.manifestStore.active_manifest;
            if (manifest.claim_generator) {
              details.push(`Generator: ${manifest.claim_generator}`);
            }
            if (manifest.title) {
              details.push(`Title: ${manifest.title}`);
            }
            if (manifest.assertions) {
              details.push(`Assertions: ${manifest.assertions.length}`);
            }
          }
        }
        if (detail.error) {
          details.push(`Error: ${detail.error}`);
        }
      });
    }

    setValidationDetails(details);
  }, []);

  return {
    manifestData,
    validationState,
    validationDetails,
    isVerified,
    updateManifest,
  };
}

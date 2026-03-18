import { useState, useCallback } from 'react';
import type { C2PAStatus, ValidationState } from '../types/c2pa.types';
import { ManifestStore } from '@contentauth/c2pa-web';

export function useC2PAManifest() {
  const [manifestData, setManifestData] = useState<ManifestStore | null>(null);
  const [validationState, setValidationState] = useState<ValidationState>('Unknown');

  const updateManifest = useCallback((c2paStatus: C2PAStatus) => {
    if (!c2paStatus) return;

    setValidationState(c2paStatus.verificationStatus);

    // Extract manifest details
    setManifestData(c2paStatus.manifestStore);
          
  }, []);

  return {
    manifestData,
    validationState,
    updateManifest,
  };
}

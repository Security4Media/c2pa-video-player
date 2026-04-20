/*
 * Copyright 2026 European Broadcasting Union
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

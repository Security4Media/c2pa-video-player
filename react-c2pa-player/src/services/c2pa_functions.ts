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

import { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import type { PlayerValidationState as ValidationState } from '@/validation/types';
import { readIngredientEvidence, readStoreEvidence } from '@/validation/evidence';
import {
    getActiveManifest as getValidationActiveManifest,
    getManifestStoreValidationState,
} from '@/validation/rules';

export function getActiveManifestValidationStatus(manifestStore: ManifestStore): ValidationState {
    return getManifestStoreValidationState(manifestStore);
}

/**
 * Status of the CAWG identity assertion's signer.
 *
 * 'Absent' (the manifest declares no identity) is reported as 'Invalid' so the
 * menu's indicator keeps its existing meaning: callers reach here only after
 * finding the assertion, so absence means the store disagrees with the manifest
 * they read it from.
 */
export function getCAWGValidationStatus(manifestStore: ManifestStore): ValidationState {
    const { identity } = readStoreEvidence(manifestStore);

    return identity === 'Absent' ? 'Invalid' : identity;
}

export function getIngredientValidationStatus(
    parentManifest: Manifest,
    ingredientManifestRef: string,
): ValidationState {
    const ingredient = parentManifest.ingredients?.find(
        (candidate) => candidate.active_manifest === ingredientManifestRef
    );

    if (!ingredient) {
        return 'Unknown';
    }

    return readIngredientEvidence(ingredient).state;
}

export function getActiveManifest(manifestStore: ManifestStore): Manifest | null {
    return getValidationActiveManifest(manifestStore);
}

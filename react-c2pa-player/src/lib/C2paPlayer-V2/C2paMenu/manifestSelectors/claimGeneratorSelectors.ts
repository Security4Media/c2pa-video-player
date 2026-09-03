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

import { Manifest } from '@contentauth/c2pa-web';
import { ClaimGeneratorItem } from '../models';

/**
 * Extract claim generator entries from the manifest without applying
 * any presentation formatting. The view layer is responsible for
 * deciding how to render names and versions.
 *
 * @param {Manifest} manifest - The manifest that may contain claim generator info
 * @returns {ClaimGeneratorItem[] | null} Array of claim generator models, or null when none are present
 */
export function selectClaimGenerator(manifest: Manifest): ClaimGeneratorItem[] | null {
    const claimGenerators = manifest.claim_generator_info;
    if (!Array.isArray(claimGenerators) || claimGenerators.length === 0) {
        return null;
    }

    return claimGenerators.map(generator => ({
        name: generator.name,
        version: generator.version ?? null,
    }));
}

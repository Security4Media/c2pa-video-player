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

/**
 * Extract the signature issuer from the manifest.
 *
 * @param {Manifest} manifest - The manifest that may contain signature info
 * @returns {string | null} Signature issuer, or null when unavailable
 */
export function selectSignatureIssuer(manifest: Manifest): string | null {
    return manifest.signature_info?.issuer ?? null;
}

/**
 * Extract the raw signature timestamp from the manifest.
 * The selector returns the original value so the view layer can decide
 * how to format or localize the date.
 *
 * @param {Manifest} manifest - The manifest that may contain signature info
 * @returns {string | null} Signature timestamp, or null when unavailable
 */
export function selectSignatureTime(manifest: Manifest): string | null {
    return manifest.signature_info?.time ?? null;
}

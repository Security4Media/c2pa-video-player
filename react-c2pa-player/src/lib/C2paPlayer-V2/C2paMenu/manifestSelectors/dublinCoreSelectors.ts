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
import { DublinCoreMetadataItem } from '../models';
import { selectDublinCoreAssertion } from './shared';

function readDcField(data: Record<string, unknown>, key: string): string | null {
    const value = data[key];
    return typeof value === 'string' ? value : null;
}

/**
 * Extract Dublin Core metadata from the manifest's `cawg.metadata` assertion,
 * when referenced by `cawg.identity`.
 *
 * @param manifest - The manifest that may contain a `cawg.metadata` assertion
 * @returns Structured Dublin Core metadata, or null when not present
 */
export function selectDublinCoreMetadata(manifest: Manifest): DublinCoreMetadataItem | null {
    const assertion = selectDublinCoreAssertion(manifest);
    if (!assertion?.data) {
        return null;
    }

    const { data } = assertion;

    const item = {
        title: readDcField(data, 'dc:title'),
        publisher: readDcField(data, 'dc:publisher'),
        rights: readDcField(data, 'dc:rights'),
        creator: readDcField(data, 'dc:creator'),
        description: readDcField(data, 'dc:description'),
    };

    // `cawg.metadata` is arbitrary JSON-LD, and a schema.org-shaped payload
    // (see cawgMetadataCopyrightSelectors.ts) carries none of these dc:*
    // keys. Returning an all-null object here rather than null would make it
    // look like Dublin Core content was found when it wasn't.
    const hasAnyField = Object.values(item).some(value => value !== null);

    return hasAnyField ? item : null;
}

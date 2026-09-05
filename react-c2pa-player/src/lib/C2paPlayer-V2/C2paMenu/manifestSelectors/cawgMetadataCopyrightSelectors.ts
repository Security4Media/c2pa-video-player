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
import {
    CawgCopyrightHolderItem,
    CawgCopyrightPublisherItem,
    CawgMetadataCopyrightItem,
} from '../models';
import { selectDublinCoreAssertion } from './shared';

function readCopyrightHolder(value: unknown): CawgCopyrightHolderItem | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const holder = value as Record<string, unknown>;
    const name = typeof holder.name === 'string' ? holder.name : null;
    const sameAs = Array.isArray(holder.sameAs)
        ? holder.sameAs.filter((entry): entry is string => typeof entry === 'string')
        : null;

    if (!name && (!sameAs || sameAs.length === 0)) {
        return null;
    }

    return { name, sameAs };
}

function readPublisher(value: unknown): CawgCopyrightPublisherItem | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const publisher = value as Record<string, unknown>;
    const name = typeof publisher.name === 'string' ? publisher.name : null;

    if (!name) {
        return null;
    }

    return {
        name,
        legalName: typeof publisher.legalName === 'string' ? publisher.legalName : null,
        alternateName: typeof publisher.alternateName === 'string' ? publisher.alternateName : null,
        website: typeof publisher.url === 'string' ? publisher.url : null,
    };
}

/**
 * Extract schema.org-style copyright/credit metadata from the manifest's
 * `cawg.metadata` assertion, when referenced by `cawg.identity`.
 *
 * `cawg.metadata` is arbitrary JSON-LD: this shape (copyrightHolder,
 * publisher, creditText, copyrightNotice, copyrightYear) is distinct from
 * the Dublin Core `dc:*` shape read by `selectDublinCoreMetadata` — either
 * can appear under the same assertion label, never assume which.
 *
 * @param manifest - The manifest that may contain a `cawg.metadata` assertion
 * @returns Structured copyright metadata, or null when none of these fields are present
 */
export function selectCawgMetadataCopyright(manifest: Manifest): CawgMetadataCopyrightItem | null {
    const assertion = selectDublinCoreAssertion(manifest);
    const data = assertion?.data;

    if (!data) {
        return null;
    }

    const copyrightNotice = typeof data.copyrightNotice === 'string' ? data.copyrightNotice : null;
    const copyrightHolder = readCopyrightHolder(data.copyrightHolder);
    const copyrightYear = typeof data.copyrightYear === 'number' ? data.copyrightYear : null;
    const creditText = typeof data.creditText === 'string' ? data.creditText : null;
    const publisher = readPublisher(data.publisher);

    if (!copyrightNotice && !copyrightHolder && copyrightYear === null && !creditText && !publisher) {
        return null;
    }

    return { copyrightNotice, copyrightHolder, copyrightYear, creditText, publisher };
}

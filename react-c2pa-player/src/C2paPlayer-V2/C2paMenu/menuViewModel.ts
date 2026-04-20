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

import { C2PAStatus } from '@/types/c2pa.types';
import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import { getActiveManifest, getActiveManifestValidationStatus } from '../../services/c2pa_functions';
import {
    selectAiOptOutSection,
    selectClaimGeneratorSection,
    selectHistorySection,
    selectOrganizationSection,
    selectSignatureIssuer,
    selectSignatureTime,
    selectWorkSection,
} from './C2paManifestFunctions';
import type {
    AiOptOutSectionItem,
    ClaimGeneratorSectionItem,
    HistorySectionItem,
    OrganizationSectionItem,
    WorkSectionItem,
} from './models';

export const c2paMenuSectionTitles = {
    summaryIssuer: 'Issued by',
    summaryDate: 'Issued on',
    claimGenerator: 'App or device used',
    organization: 'Organization Identity',
    work: 'About the Producer',
    aiOptOut: 'About Training and Data mining',
    history: 'History of provenance',
    validationStatus: 'Validation Status',
    alert: 'Alert',
} as const;

export type C2paMenuMode = 'ready' | 'loading' | 'no-manifest' | 'invalid';
export type C2paMenuSectionTitleKey = keyof typeof c2paMenuSectionTitles;

export interface SummarySectionItem {
    issuer: string | null;
    issuedOn: string | null;
    validationStatus: string | null;
    alert: string | null;
}

export interface C2paMenuSections {
    summary: SummarySectionItem;
    claimGenerator: ClaimGeneratorSectionItem | null;
    organization: OrganizationSectionItem | null;
    work: WorkSectionItem | null;
    aiOptOut: AiOptOutSectionItem | null;
    history: HistorySectionItem | null;
}

export interface C2paMenuRenderState {
    mode: C2paMenuMode;
    manifestId: string | null;
    sections: C2paMenuSections | null;
}

function buildAlertMessage(timeline: C2PATimelineState) {
    if (timeline.compromisedRegions.length > 0) {
        return `The segment between ${timeline.compromisedRegions.join(', ')} may have been tampered with`;
    }

    return null;
}

function formatSignatureDate(timeValue: string | null) {
    const date = timeValue ? new Date(timeValue) : null;

    return date
        ? new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
        }).format(date)
        : null;
}

/**
 * Build the normalized section-based render state consumed by the React menu tree.
 * The bridge passes raw player status into React, and this helper keeps
 * the mapping from manifest data to UI-facing sections in one typed place.
 *
 * @param c2paStatus - Current C2PA player status payload
 * @param timeline - Timeline snapshot from the shared player controller
 * @returns Render state describing menu mode, manifest identity, and visible sections
 */
export function buildMenuRenderState(
    c2paStatus: C2PAStatus | null,
    timeline: C2PATimelineState,
): C2paMenuRenderState {
    const manifestStore = c2paStatus?.manifestStore ?? null;
    const hasDefinitiveNoManifest =
        (c2paStatus && !manifestStore) ||
        (manifestStore?.manifests && Object.keys(manifestStore.manifests).length === 0);

    if (hasDefinitiveNoManifest) {
        return {
            mode: 'no-manifest',
            manifestId: 'no-manifest',
            sections: null,
        };
    }

    const activeManifest = manifestStore ? getActiveManifest(manifestStore) : null;
    if (!manifestStore || !activeManifest) {
        return {
            mode: 'loading',
            manifestId: manifestStore?.active_manifest ?? 'loading',
            sections: null,
        };
    }

    const validationStatus = getActiveManifestValidationStatus(manifestStore);
    if (validationStatus === 'Invalid') {
        return {
            mode: 'invalid',
            manifestId: manifestStore.active_manifest ?? null,
            sections: null,
        };
    }

    return {
        mode: 'ready',
        manifestId: manifestStore.active_manifest ?? null,
        sections: {
            summary: {
                issuer: selectSignatureIssuer(activeManifest),
                issuedOn: formatSignatureDate(selectSignatureTime(activeManifest)),
                validationStatus: validationStatus ?? 'Unknown',
                alert: buildAlertMessage(timeline),
            },
            claimGenerator: selectClaimGeneratorSection(activeManifest),
            organization: selectOrganizationSection(activeManifest, manifestStore),
            work: selectWorkSection(activeManifest, manifestStore),
            aiOptOut: selectAiOptOutSection(activeManifest),
            history: selectHistorySection(activeManifest, manifestStore),
        },
    };
}

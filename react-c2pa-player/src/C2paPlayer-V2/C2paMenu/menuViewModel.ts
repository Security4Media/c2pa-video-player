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

import type { Manifest, ManifestStore } from '@contentauth/c2pa-web';
import type { C2PAStatus, PlayerValidationState } from '@/types/c2pa.types';
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

function getManifestId(activeManifest: Manifest | null, c2paStatus: C2PAStatus | null) {
    const manifestId =
        c2paStatus?.manifestStore?.active_manifest ??
        activeManifest?.id ??
        null;

    return typeof manifestId === 'string' ? manifestId : null;
}

function createAdapterManifestStore(
    c2paStatus: C2PAStatus | null,
    manifestId: string | null,
    validationStatus: PlayerValidationState,
): ManifestStore | null {
    const normalizedResult = c2paStatus?.normalizedResult ?? null;

    if (!normalizedResult || !manifestId || !normalizedResult.activeManifest) {
        return null;
    }

    return {
        active_manifest: manifestId,
        manifests: normalizedResult.manifests,
        validation_state: validationStatus,
        validation_results: {
            activeManifest: {
                success: validationStatus === 'Invalid' ? [] : [{}],
                failure: validationStatus === 'Invalid' ? normalizedResult.validationErrors : [],
            },
        },
    } as ManifestStore;
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
    const normalizedResult = c2paStatus?.normalizedResult ?? null;
    const activeManifest = manifestStore
        ? getActiveManifest(manifestStore)
        : normalizedResult?.activeManifest ?? null;
    const hasDefinitiveNoManifest =
        (c2paStatus && !activeManifest && normalizedResult?.containsSignature === false) ||
        (manifestStore?.manifests && Object.keys(manifestStore.manifests).length === 0);

    if (hasDefinitiveNoManifest) {
        return {
            mode: 'no-manifest',
            manifestId: 'no-manifest',
            sections: null,
        };
    }

    if (!activeManifest) {
        return {
            mode: 'loading',
            manifestId: manifestStore?.active_manifest ?? 'loading',
            sections: null,
        };
    }

    const validationStatus = manifestStore
        ? getActiveManifestValidationStatus(manifestStore)
        : normalizedResult?.validationState ?? 'Unknown';
    const manifestId = getManifestId(activeManifest, c2paStatus);
    const selectorManifestStore =
        manifestStore ?? createAdapterManifestStore(c2paStatus, manifestId, validationStatus);

    if (validationStatus === 'Invalid') {
        return {
            mode: 'invalid',
            manifestId,
            sections: null,
        };
    }

    return {
        mode: 'ready',
        manifestId,
        sections: {
            summary: {
                issuer: selectSignatureIssuer(activeManifest),
                issuedOn: formatSignatureDate(selectSignatureTime(activeManifest)),
                validationStatus: validationStatus ?? 'Unknown',
                alert: buildAlertMessage(timeline),
            },
            claimGenerator: selectClaimGeneratorSection(activeManifest),
            organization: selectOrganizationSection(activeManifest, selectorManifestStore ?? undefined),
            work: selectWorkSection(activeManifest, selectorManifestStore ?? undefined),
            aiOptOut: selectAiOptOutSection(activeManifest),
            history: selectorManifestStore
                ? selectHistorySection(activeManifest, selectorManifestStore)
                : null,
        },
    };
}

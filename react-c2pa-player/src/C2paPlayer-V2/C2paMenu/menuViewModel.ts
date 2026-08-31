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

import type { Manifest } from '@contentauth/c2pa-web';
import type { C2PAStatus } from '@/types/c2pa.types';
import type { ValidationTimelineSegment } from '@/validation';
import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import { getActiveManifest, getActiveManifestValidationStatus } from '../../services/c2pa_functions';
import {
    resolveManifestFromSource,
    resolveManifestStoreFromSource,
    selectAiOptOutSection,
    selectClaimGeneratorSection,
    selectHistorySection,
    selectOrganizationSection,
    selectSignatureIssuer,
    selectSignatureTime,
    selectWorkSection,
} from './manifestSelectors';
import type {
    AiOptOutSectionItem,
    ClaimGeneratorSectionItem,
    HistorySectionItem,
    LiveSegmentDiagnosticsSectionItem,
    OrganizationSectionItem,
    WorkSectionItem,
} from './models';

const MAX_LIVE_SEGMENT_DIAGNOSTICS = 20;

export const c2paMenuSectionTitles = {
    summaryIssuer: 'Issued by',
    summaryDate: 'Issued on',
    claimGenerator: 'App or device used',
    organization: 'Organization Identity',
    work: 'About the Producer',
    aiOptOut: 'About Training and Data mining',
    history: 'History of provenance',
    liveSegments: 'Segment issues',
    validationStatus: 'Validation Status',
    alert: 'Alert',
} as const;

export type C2paMenuMode = 'ready' | 'loading' | 'no-manifest' | 'invalid' | 'segment-integrity';
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
    liveSegments: LiveSegmentDiagnosticsSectionItem | null;
}

export interface C2paMenuRenderState {
    mode: C2paMenuMode;
    manifestId: string | null;
    sections: C2paMenuSections | null;
    /** True when showing a clicked timeline fragment rather than the live/current status. */
    isSegmentView: boolean;
}

function selectLiveSegmentsSection(
    timelineSegments: C2PAStatus['timelineSegments'],
): LiveSegmentDiagnosticsSectionItem | null {
    const diagnostics = (timelineSegments ?? [])
        .flatMap((segment) => segment.diagnostics ?? [])
        // Every valid segment would otherwise flood this list; only the
        // anomalies the user asked to see are worth surfacing here.
        .filter((diagnostic) => diagnostic.status !== 'valid')
        .sort((a, b) => b.timestamp - a.timestamp);

    if (diagnostics.length === 0) {
        return null;
    }

    return {
        entries: diagnostics.slice(0, MAX_LIVE_SEGMENT_DIAGNOSTICS).map((diagnostic) => ({
            segmentNumber: diagnostic.segmentNumber,
            mediaType: diagnostic.mediaType,
            status: diagnostic.status,
            sequenceReason: diagnostic.sequenceReason,
            errorCodes: diagnostic.errorCodes,
            quality: diagnostic.quality,
        })),
        truncatedCount: Math.max(0, diagnostics.length - MAX_LIVE_SEGMENT_DIAGNOSTICS),
    };
}

function formatClock(totalSeconds: number) {
    const wholeSeconds = Math.max(0, Math.floor(totalSeconds));

    return `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

/**
 * Rounds a range outward to whole seconds. C2PA fragments are often shorter
 * than the mm:ss display resolution, so a truthful `[0.02, 0.6]` would read
 * as "00:00-00:00"; widening to at least one second keeps it legible and
 * never understates the affected region.
 */
function formatCompromisedRange(startTime: number, endTime: number) {
    const start = Math.max(0, Math.floor(startTime));

    return `${formatClock(start)}-${formatClock(Math.max(start + 1, Math.ceil(endTime)))}`;
}

/**
 * Ranges are derived from the validation timeline itself rather than from
 * `timeline.compromisedRegions`, which is read back out of the rendered DOM
 * and so reflects whatever the renderer did to the values. Monolithic sources
 * report no per-fragment segments, so they still fall back to it (their
 * "region" is the whole asset).
 */
function buildAlertMessage(
    timeline: C2PATimelineState,
    timelineSegments: C2PAStatus['timelineSegments'],
) {
    const invalidRanges = (timelineSegments ?? [])
        .filter((segment) => segment.validationState === 'Invalid')
        .filter((segment) => Number.isFinite(segment.startTime) && Number.isFinite(segment.endTime))
        .map((segment) => formatCompromisedRange(segment.startTime, segment.endTime));
    const ranges = invalidRanges.length > 0 ? invalidRanges : timeline.compromisedRegions;

    if (ranges.length === 0) {
        return null;
    }

    const label = ranges.length === 1 ? 'The segment between' : 'The segments between';

    return `${label} ${[...new Set(ranges)].join(', ')} may have been tampered with`;
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
    selectedSegment?: ValidationTimelineSegment | null,
): C2paMenuRenderState {
    if (selectedSegment) {
        return buildSegmentMenuRenderState(selectedSegment);
    }

    const manifestStore = c2paStatus?.manifestStore ?? null;
    const normalizedResult = c2paStatus?.normalizedResult ?? null;
    const activeManifest = manifestStore
        ? getActiveManifest(manifestStore)
        : normalizedResult?.activeManifest ?? null;
    const hasDefinitiveNoManifest =
        (c2paStatus && !activeManifest && !manifestStore && !normalizedResult?.manifestStore) ||
        (manifestStore?.manifests && Object.keys(manifestStore.manifests).length === 0);

    if (hasDefinitiveNoManifest) {
        return {
            mode: 'no-manifest',
            manifestId: 'no-manifest',
            sections: null,
            isSegmentView: false,
        };
    }

    if (!activeManifest) {
        return {
            mode: 'loading',
            manifestId: manifestStore?.active_manifest ?? 'loading',
            sections: null,
            isSegmentView: false,
        };
    }

    const validationStatus = manifestStore
        ? getActiveManifestValidationStatus(manifestStore)
        : normalizedResult?.validationState ?? 'Unknown';
    const manifestId = getManifestId(activeManifest, c2paStatus);
    // Adapters like DASH deliberately never populate normalizedResult.manifestStore
    // (see normalization/dash.ts) — fall back to resolving the adapter-agnostic
    // ManifestSource into the same store shape so their CAWG/organization/history
    // sections still render.
    const selectorManifestStore =
        manifestStore ??
        (manifestId
            ? resolveManifestStoreFromSource(normalizedResult?.manifestSource, manifestId, validationStatus)
            : null);

    // An invalid manifest's claimed content (issuer, CAWG identity, actions,
    // ...) is unverified by definition, so none of it is trustworthy enough
    // to show alongside the failure - surface only the failure message,
    // for every adapter (monolithic, HLS, DASH, live or VOD) alike.
    if (validationStatus === 'Invalid') {
        // When the manifest or init segment is what failed, the whole asset is
        // condemned and the alert already says so. Listing segments underneath
        // would imply those particular ones are at fault, when in truth every
        // fragment reports the same manifest-level failure - so the list is
        // both redundant and misleading. A fragment that failed its own
        // integrity check still earns an entry: there the list is the only
        // place naming which fragments went bad.
        const liveSegments = c2paStatus?.wholeAssetInvalid
            ? null
            : selectLiveSegmentsSection(c2paStatus?.timelineSegments);

        return {
            mode: 'invalid',
            manifestId,
            isSegmentView: false,
            sections: buildInvalidOnlySections(
                buildAlertMessage(timeline, c2paStatus?.timelineSegments),
                liveSegments,
            ),
        };
    }

    return {
        mode: 'ready',
        manifestId,
        isSegmentView: false,
        sections: {
            summary: {
                issuer: selectSignatureIssuer(activeManifest),
                issuedOn: formatSignatureDate(selectSignatureTime(activeManifest)),
                validationStatus: validationStatus ?? 'Unknown',
                alert: buildAlertMessage(timeline, c2paStatus?.timelineSegments),
            },
            claimGenerator: selectClaimGeneratorSection(activeManifest),
            organization: selectOrganizationSection(activeManifest, selectorManifestStore ?? undefined),
            work: selectWorkSection(activeManifest, selectorManifestStore ?? undefined),
            aiOptOut: selectAiOptOutSection(activeManifest),
            history: selectorManifestStore
                ? selectHistorySection(activeManifest, selectorManifestStore)
                : null,
            liveSegments: selectLiveSegmentsSection(c2paStatus?.timelineSegments),
        },
    };
}

/**
 * Sections for the 'invalid' mode: nothing the manifest *claims* is
 * trustworthy enough to show, so claim generator, organization, work, AI
 * opt-out and history are all suppressed. The failure message is kept, and
 * with it the per-segment issue list when one is still meaningful - both
 * describe the failure itself rather than asserting anything on the
 * unverified manifest's behalf. The caller passes `null` for the list when
 * the failure is manifest-wide.
 */
function buildInvalidOnlySections(
    alert: string | null,
    liveSegments: LiveSegmentDiagnosticsSectionItem | null,
): C2paMenuSections {
    return {
        summary: {
            issuer: null,
            issuedOn: null,
            validationStatus: null,
            alert,
        },
        claimGenerator: null,
        organization: null,
        work: null,
        aiOptOut: null,
        history: null,
        liveSegments,
    };
}

function buildSegmentAlertMessage(segment: ValidationTimelineSegment): string | null {
    const anomaly = (segment.diagnostics ?? [])
        .filter((diagnostic) => diagnostic.status !== 'valid')
        .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (anomaly) {
        return `${anomaly.mediaType} segment #${anomaly.segmentNumber}: ${anomaly.status}` +
            (anomaly.sequenceReason ? ` — ${anomaly.sequenceReason}` : '');
    }

    if (segment.manifestRef?.kind === 'integrity-only' && segment.manifestRef.integrityStatus !== 'valid') {
        const { integrityStatus, sequenceReason } = segment.manifestRef;
        return `Segment integrity: ${integrityStatus}` + (sequenceReason ? ` — ${sequenceReason}` : '');
    }

    return null;
}

/**
 * Builds render state for a clicked timeline fragment instead of the live
 * status. Reuses the same per-manifest selectors as the live path when the
 * segment has a manifest (`manifestRef` resolves to one); falls back to a
 * status/anomaly-only view (mode 'segment-integrity') when it doesn't - the
 * DASH VSI/integrity-only case, or any segment with no manifestRef at all.
 */
function buildSegmentMenuRenderState(segment: ValidationTimelineSegment): C2paMenuRenderState {
    const activeManifest = resolveManifestFromSource(segment.manifestRef);
    const validationStatus = segment.validationState;
    const alert = buildSegmentAlertMessage(segment);

    if (!activeManifest) {
        return {
            mode: 'segment-integrity',
            manifestId: 'segment',
            isSegmentView: true,
            sections: {
                summary: {
                    issuer: null,
                    issuedOn: null,
                    validationStatus,
                    alert: alert ?? 'No signed manifest is attached to this segment.',
                },
                claimGenerator: null,
                organization: null,
                work: null,
                aiOptOut: null,
                history: null,
                liveSegments: null,
            },
        };
    }

    if (validationStatus === 'Invalid') {
        return {
            mode: 'invalid',
            manifestId: getManifestId(activeManifest, null),
            isSegmentView: true,
            // No segment-issue list in a single-fragment view: that list is
            // about anomalies across the whole timeline, not this fragment,
            // whose own verdict is already the subject of this view.
            sections: buildInvalidOnlySections(alert, null),
        };
    }

    const manifestId = getManifestId(activeManifest, null);
    const selectorManifestStore = manifestId
        ? resolveManifestStoreFromSource(segment.manifestRef, manifestId, validationStatus)
        : null;

    return {
        mode: 'ready',
        manifestId,
        isSegmentView: true,
        sections: {
            summary: {
                issuer: selectSignatureIssuer(activeManifest),
                issuedOn: formatSignatureDate(selectSignatureTime(activeManifest)),
                validationStatus,
                alert,
            },
            claimGenerator: selectClaimGeneratorSection(activeManifest),
            organization: selectOrganizationSection(activeManifest, selectorManifestStore ?? undefined),
            work: selectWorkSection(activeManifest, selectorManifestStore ?? undefined),
            aiOptOut: selectAiOptOutSection(activeManifest),
            history: selectorManifestStore
                ? selectHistorySection(activeManifest, selectorManifestStore)
                : null,
            // Not relevant to a single-segment detail view - that list is
            // about anomalies across the whole timeline, not this fragment.
            liveSegments: null,
        },
    };
}

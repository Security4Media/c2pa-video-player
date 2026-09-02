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
import { readStoreEvidence } from '@/validation/evidence';
import { getActiveManifest } from '@/validation/rules';
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
}

export interface C2paMenuRenderState {
    mode: C2paMenuMode;
    manifestId: string | null;
    sections: C2paMenuSections | null;
    /** True when showing a clicked timeline fragment rather than the live/current status. */
    isSegmentView: boolean;
}

/** What to call the source in a sentence someone reads. */
function sourceNoun(isLive: boolean | undefined) {
    return isLive ? 'livestream' : 'video';
}

/**
 * What a viewer is told when something failed.
 *
 * These used to enumerate. The menu said "The segments between 00:08-00:12,
 * 00:16-00:20 may have been tampered with", which is an inventory rather than
 * an answer: it reads as a list of identifiers, it grows unboundedly on a live
 * stream, and it tells someone asking "can I trust this?" to go and
 * cross-reference timestamps. The list is engine output and now lives in the
 * validation log (diagnostics/diagnosticsLog.ts), where someone who wants it
 * has gone looking for it.
 *
 * Three sentences, because there are three genuinely different situations and
 * a viewer can act differently on each:
 *
 *  - something earlier failed, but not what is on screen now;
 *  - what is on screen now failed;
 *  - the source's own credentials failed, so nothing in it is vouched for.
 */
function buildSomePartsInvalidMessage(isLive: boolean | undefined) {
    // "Earlier" rather than a time: on a rolling live window the affected
    // moment may already have scrolled off the bar, and saying which second it
    // was is exactly the detail that sent people to the log.
    return isLive
        ? 'Some earlier parts of this livestream are invalid and may have been tampered with.'
        : 'Some parts of this video are invalid and may have been tampered with.';
}

function buildThisMomentInvalidMessage() {
    return 'The content credentials of this moment are invalid. The content may have been tampered with.';
}

function buildWholeSourceInvalidMessage(isLive: boolean | undefined) {
    return `The content credentials for this ${sourceNoun(isLive)} could not be verified. The content may have been tampered with.`;
}

/**
 * Whether any part of the timeline failed, wherever the playhead is.
 *
 * Read from the timeline segments where the adapter reports them, and from
 * `timeline.hasInvalidSegments` otherwise - monolithic sources report no
 * per-fragment segments, so their one verdict covers the whole asset.
 */
function hasInvalidRegion(
    timeline: C2PATimelineState,
    timelineSegments: C2PAStatus['timelineSegments'],
) {
    return (
        (timelineSegments ?? []).some((segment) => segment.validationState === 'Invalid') ||
        timeline.hasInvalidSegments
    );
}

/**
 * The banner for the live/current view: only ever about somewhere *else*.
 *
 * When the playhead itself is inside a failure the menu is in 'invalid' mode
 * and says so in its own headline, so repeating it here would state the same
 * thing twice in two different ways.
 */
function buildAlertMessage(
    timeline: C2PATimelineState,
    c2paStatus: C2PAStatus | null,
) {
    return hasInvalidRegion(timeline, c2paStatus?.timelineSegments)
        ? buildSomePartsInvalidMessage(c2paStatus?.isLive)
        : null;
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
        ? readStoreEvidence(manifestStore).state
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
        // Which failure this is decides the sentence. The source's own
        // credentials being broken condemns everything in it; one fragment
        // failing its hash condemns that moment. Reporting the second as the
        // first would overstate it, and the first as the second would let a
        // viewer think the rest of the stream was fine.
        return {
            mode: 'invalid',
            manifestId,
            isSegmentView: false,
            sections: buildInvalidOnlySections(
                c2paStatus?.wholeAssetInvalid
                    ? buildWholeSourceInvalidMessage(c2paStatus?.isLive)
                    : buildThisMomentInvalidMessage(),
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
                alert: buildAlertMessage(timeline, c2paStatus),
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

/**
 * Sections for the 'invalid' mode: nothing the manifest *claims* is
 * trustworthy enough to show, so claim generator, organization, work, AI
 * opt-out and history are all suppressed. Only the failure message remains -
 * it describes the failure itself rather than asserting anything on the
 * unverified manifest's behalf.
 */
function buildInvalidOnlySections(alert: string | null): C2paMenuSections {
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
    };
}

/**
 * What a clicked fragment says.
 *
 * This used to read "Segment integrity: replayed - gap_detected", which is the
 * engine's vocabulary verbatim: two words a viewer has no way to interpret,
 * offered in place of the one thing they wanted to know. Both words are still
 * recorded, in the validation log.
 */
function buildSegmentAlertMessage(segment: ValidationTimelineSegment): string | null {
    if (segment.validationState === 'Invalid') {
        return buildThisMomentInvalidMessage();
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
                    alert: alert ?? 'No content credentials are attached to this moment.',
                },
                claimGenerator: null,
                organization: null,
                work: null,
                aiOptOut: null,
                history: null,
            },
        };
    }

    if (validationStatus === 'Invalid') {
        return {
            mode: 'invalid',
            manifestId: getManifestId(activeManifest, null),
            isSegmentView: true,
            sections: buildInvalidOnlySections(alert),
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
        },
    };
}

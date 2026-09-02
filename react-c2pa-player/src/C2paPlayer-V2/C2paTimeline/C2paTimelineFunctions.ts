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

import { DEFAULT_LIVE_RETENTION_SECONDS } from '@/validation/policy/liveRetention';
import type { C2PATimelineSegmentUpdate, ValidationState } from '@/types/c2pa.types';
import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';
import { setLiveTimelineWindow } from './liveWindowState';

type TimelineVerificationStatus = ValidationState | 'unknown' | 'false';

interface TimelineSegmentElement extends HTMLDivElement {
    dataset: DOMStringMap & {
        startTime: string;
        endTime: string;
        verificationStatus: TimelineVerificationStatus;
    };
    /**
     * The full segment this element represents, when it was built from a
     * real per-fragment `ValidationTimelineSegment` (replaceC2PATimelineSegments)
     * rather than synthesized from a bare status string (the two legacy call
     * sites below).
     *
     * Present on every real segment, not just the click-inspectable ones: the
     * hover preview reads a segment's manifest to show its Dublin Core
     * metadata, and a Trusted fragment is precisely the case where there is
     * something worth showing.
     */
    __c2paSegment?: C2PATimelineSegmentUpdate;
}

const INSPECTABLE_CLASS = 'seekbar-play-c2pa--inspectable';
/**
 * Validated, but playback has not reached it and it still could. Rendered
 * dimmed, so a live bar can show verdicts as they arrive without claiming
 * content was checked *and shown*. See ValidationTimelineSegment.provisional.
 */
const PROVISIONAL_CLASS = 'seekbar-play-c2pa--provisional';

function isInspectableStatus(status: TimelineVerificationStatus): boolean {
    return status !== 'Valid' && status !== 'Trusted';
}

interface TimelineComponentLike {
    el(): HTMLElement;
}

interface TimelineVideoPlayer extends VideoJsPlayerLike {
    currentTime(): number;
    duration(): number;
}

export interface TimelineFunctions {
    getTimelineState: (
        isMonolithic: boolean,
        videoPlayer: TimelineVideoPlayer,
        currentTime?: number,
    ) => C2PATimelineState;
    handleC2PAValidation: (
        verificationStatus: string,
        currentTime: number,
        c2paControlBar: TimelineComponentLike,
    ) => void;
    handleOnSeeked: (time: number) => boolean;
    handleOnSeeking: (
        time: number,
        playbackStarted: boolean,
        lastPlaybackTime: number,
        isMonolithic: boolean,
        c2paControlBar: TimelineComponentLike,
        videoPlayer: TimelineVideoPlayer,
    ) => [boolean, number];
    formatTime: (seconds: number) => string;
    updateC2PATimeline: (
        currentTime: number,
        videoPlayer: TimelineVideoPlayer,
        extendTrailingSegmentToPlayhead?: boolean,
        isLive?: boolean,
        retentionSeconds?: number,
    ) => void;
    replaceC2PATimelineSegments: (
        segments: C2PATimelineSegmentUpdate[],
        videoPlayer: TimelineVideoPlayer,
        c2paControlBar: TimelineComponentLike,
        isLive?: boolean,
        retentionSeconds?: number,
    ) => void;
    renderWholeAssetVerdict: (
        verificationStatus: TimelineVerificationStatus,
        videoPlayer: TimelineVideoPlayer,
        c2paControlBar: TimelineComponentLike,
        isLive?: boolean,
        retentionSeconds?: number,
    ) => void;
}

function isInvalidSegmentStatus(status: string) {
    return status === 'Invalid' || status === 'false';
}

function normalizeVerificationStatus(status: string): TimelineVerificationStatus {
    if (status === 'Trusted' || status === 'Valid' || status === 'Invalid' || status === 'Unknown') {
        return status === 'Unknown' ? 'unknown' : status;
    }

    if (status === 'false' || status === 'unknown') {
        return status;
    }

    return 'unknown';
}

/**
 * How much of a live stream the bar covers.
 *
 * A live timeline has no end to scale against, and on this origin its times are
 * epoch-based (a DASH `availabilityStartTime` of 1970 puts `currentTime` near
 * 1.79e9). Scaling those from zero put every segment at `left: 100%` with a
 * width of about 5e-8%, an invisible sliver at the right edge - which is what
 * made validated DASH segments appear not to render at all.
 *
 * This is the cap, not the usual span: the bar is sized to the DVR window the
 * origin advertises and only falls back to this when there is none, or when the
 * origin retains more than we care to show. See getTimelineWindow.
 */
export const LIVE_WINDOW_SECONDS = DEFAULT_LIVE_RETENTION_SECONDS;

/**
 * The stretch of stream the bar currently represents.
 *
 * VOD is the whole asset, `{ start: 0, size: duration }`, which reduces the
 * positioning below to exactly what it was. Live is a window ending at the live
 * edge, so positions are relative to `start` rather than to zero.
 */
export interface TimelineWindow {
    start: number;
    size: number;
}

export function getTimelineWindow(
    rawDuration: number,
    currentTime: number,
    latestKnownEndTime: number,
    isLive = false,
    retentionSeconds = LIVE_WINDOW_SECONDS,
): TimelineWindow {
    if (isLive) {
        // A fixed span of the configured retention, anchored to the live edge, so
        // history rolls left at a constant rate and the scale never changes.
        //
        // Not sized to the DVR any more. That was worth doing while the bar was
        // also the seek control - it put the reachable range and the shown range
        // on one scale - but the bar is a monitor now, not a scrubber, and there
        // is no reason for a record of what was validated to be limited to what
        // the origin still happens to hold. Five minutes of history is the point
        // of it.
        //
        // Nor does it grow with the history behind it, which is the other thing
        // this has been: growing made the scale depend on the data, so a 28s
        // pause stretched the window from 60s to 104s and squashed real history
        // from the right-hand 6% of the bar into the left-hand 3.7%.
        const edge = Math.max(currentTime, latestKnownEndTime);

        return { start: edge - retentionSeconds, size: retentionSeconds };
    }

    if (Number.isFinite(rawDuration) && rawDuration > 0) {
        return { start: 0, size: rawDuration };
    }

    // Indefinite duration but not flagged live: fall back to filling to the
    // furthest point known, as before.
    return { start: 0, size: Math.max(currentTime, latestKnownEndTime, 1) };
}

/**
 * Places a segment over exactly its own stretch of the bar.
 *
 * Each segment is positioned (`left`) and sized (`width`) from its own
 * [startTime, endTime), so unread stretches stay uncovered and show the track's
 * grey through. Segments used to all start at `left: 0` and be layered by
 * z-index, which made a gap impossible to express: colouring 8-16s necessarily
 * painted 0-16s too.
 *
 * Positions are relative to the window's own origin, so a live bar whose times
 * are epoch-based places segments by their offset from the window start rather
 * than by their absolute value.
 */
/**
 * Publishes the window the segments were placed against, so the seek bar draws
 * its playhead to the same scale, and marks how much of it is still seekable.
 *
 * Called on every render rather than only on change: the live window rolls
 * continuously, and a stale value would put the cursor a few seconds out.
 */
function publishLiveWindow(window: TimelineWindow, isLive: boolean) {
    setLiveTimelineWindow(isLive && window.size > 0 ? { start: window.start, size: window.size } : null);
}

function positionTimelineSegment(segment: TimelineSegmentElement, window: TimelineWindow) {
    const startTime = parseFloat(segment.dataset.startTime);
    const endTime = parseFloat(segment.dataset.endTime);
    const clamp = (value: number) => Math.min(100, Math.max(0, value));
    const toPercent = (time: number) => ((time - window.start) / window.size) * 100;
    const left = clamp(toPercent(startTime));

    segment.style.left = `${left}%`;
    segment.style.width = `${clamp(toPercent(endTime)) - left}%`;
}

function getSegmentColor(verificationStatus: TimelineVerificationStatus, isManifestInvalid = false) {
    if (isManifestInvalid || verificationStatus === 'Invalid' || verificationStatus === 'false') {
        return getComputedStyle(document.documentElement).getPropertyValue('--c2pa-failed').trim();
    }

    if (verificationStatus === 'Trusted') {
        return getComputedStyle(document.documentElement).getPropertyValue('--c2pa-trusted').trim();
    }

    if (verificationStatus === 'Valid') {
        return getComputedStyle(document.documentElement).getPropertyValue('--c2pa-passed').trim();
    }

    return getComputedStyle(document.documentElement).getPropertyValue('--c2pa-unknown').trim();
}

/**
 * Create the imperative timeline helpers used by the current Video.js-based
 * player. The rendering remains DOM-driven for now, but the contract is typed
 * so the next React migration step can build on stable state semantics.
 *
 * @returns Typed timeline helpers for seek, validation, and segment updates
 */
export function getTimelineFunctions(
    onSegmentClick?: (segment: C2PATimelineSegmentUpdate) => void,
): TimelineFunctions {
    let progressSegments: TimelineSegmentElement[] = [];

    const handleOnSeeked = function (time: number) {
        console.log('[C2PA] Player seeked: ', time);
        return false;
    };

    const createTimelineSegment = function (
        segmentStartTime: number,
        segmentEndTime: number,
        verificationStatus: TimelineVerificationStatus,
        isManifestInvalid = false,
        sourceSegment?: C2PATimelineSegmentUpdate,
        provisional = false,
    ) {
        const segment = document.createElement('div') as TimelineSegmentElement;
        segment.className = 'seekbar-play-c2pa';
        segment.style.width = '0%';
        segment.dataset.startTime = String(segmentStartTime);
        segment.dataset.endTime = String(segmentEndTime);
        segment.dataset.verificationStatus = verificationStatus;
        segment.style.backgroundColor = getSegmentColor(verificationStatus, isManifestInvalid);

        if (provisional) {
            segment.classList.add(PROVISIONAL_CLASS);
        }

        // Every real per-fragment segment carries its source, so the hover
        // preview can read its manifest. Excluded are the synthesized
        // "unknown" gap filler and the legacy static-fallback status blob,
        // which represent no single fragment and have no manifest of their own.
        if (sourceSegment) {
            segment.__c2paSegment = sourceSegment;
        }

        // Clicking, though, stays limited to segments with a problem. A
        // Valid/Trusted stretch keeps `pointer-events: none` so a click there
        // falls through to video.js and seeks, which is what a viewer expects
        // from a progress bar; taking that over for the whole width to open a
        // panel would cost more than it gives.
        if (sourceSegment && onSegmentClick && isInspectableStatus(verificationStatus)) {
            segment.classList.add(INSPECTABLE_CLASS);
            segment.addEventListener('click', (event) => {
                event.stopPropagation();
                onSegmentClick(sourceSegment);
            });
        }

        return segment;
    };

    const removeProgressSegments = function () {
        progressSegments.forEach((segment) => {
            segment.remove();
        });
        progressSegments = [];
    };

    // Repositions already-appended segments; it no longer needs the host
    // element, since it does not create any.
    const updateC2PATimeline = function (
        currentTime: number,
        videoPlayer: TimelineVideoPlayer,
        // Whether the trailing segment should be stretched to the playhead.
        // True only for the playhead-appended fallback (monolithic sources),
        // where one verdict covers the whole asset and a segment's extent is
        // "from where this verdict started, up to wherever playback has
        // reached". Adapters that report real per-fragment bounds pass false:
        // stretching there would overwrite the one record of a fragment's
        // actual extent, and since the newest fragment legitimately ends
        // *ahead* of the playhead it would invert its range (start > end) -
        // which getTimelineState then reads back out of the DOM to build the
        // tampered-range alert.
        extendTrailingSegmentToPlayhead = false,
        isLive = false,
        retentionSeconds = DEFAULT_LIVE_RETENTION_SECONDS,
    ) {
        // No synthetic "unknown" placeholder when there is nothing to show: an
        // empty list is the correct initial state now that the track's own grey
        // means "not read yet".
        const lastSegment = progressSegments[progressSegments.length - 1];
        if (!lastSegment) {
            return;
        }

        if (extendTrailingSegmentToPlayhead && currentTime > parseFloat(lastSegment.dataset.startTime)) {
            lastSegment.dataset.endTime = String(currentTime);
        }

        const latestKnownEndTime = progressSegments.reduce(
            (max, segment) => Math.max(max, parseFloat(segment.dataset.endTime)),
            0,
        );
        const window = getTimelineWindow(
            videoPlayer.duration(),
            currentTime,
            latestKnownEndTime,
            isLive,
            retentionSeconds,
        );

        publishLiveWindow(window, isLive);

        // No z-index laddering: positioned segments cover disjoint stretches of
        // the bar, so none needs to paint over another.
        progressSegments.forEach((segment) => {
            positionTimelineSegment(segment, window);
        });

        // The played-bar colour is intentionally left to CSS. Painting
        // `.vjs-play-progress` from a single segment flattened the whole
        // played region to one verdict's colour. The menu button's invalid
        // state is likewise owned solely by C2paMenuBridge now (see
        // updateC2PAMenu) - this function used to be a second, competing
        // writer of that class.
    };

    const handleSeekC2PATimeline = function (
        seekTime: number,
        isMonolithic: boolean,
        c2paControlBar: TimelineComponentLike,
        videoPlayer: TimelineVideoPlayer,
    ) {
        console.log('[C2PA] Handle seek to: ', seekTime);

        progressSegments = progressSegments.filter((segment) => {
            const segmentStartTime = parseFloat(segment.dataset.startTime);
            const segmentEndTime = parseFloat(segment.dataset.endTime);
            const isSegmentActive =
                seekTime >= segmentEndTime ||
                (seekTime < segmentEndTime && seekTime >= segmentStartTime);

            if (!isSegmentActive) {
                segment.remove();
            }

            return isSegmentActive;
        });

        const lastSegment = progressSegments[progressSegments.length - 1];
        if (lastSegment) {
            const lastSegmentEndTime = parseFloat(lastSegment.dataset.endTime);
            if (lastSegmentEndTime > seekTime) {
                lastSegment.dataset.endTime = String(seekTime);
            } else if (
                !isMonolithic &&
                lastSegmentEndTime !== seekTime &&
                lastSegment.dataset.verificationStatus !== 'unknown'
            ) {
                const segment = createTimelineSegment(lastSegmentEndTime, seekTime, 'unknown');
                c2paControlBar.el().appendChild(segment);
                progressSegments.push(segment);
            }
        }

        updateC2PATimeline(seekTime, videoPlayer, isMonolithic);
    };

    const handleOnSeeking = function (
        time: number,
        playbackStarted: boolean,
        lastPlaybackTime: number,
        isMonolithic: boolean,
        c2paControlBar: TimelineComponentLike,
        videoPlayer: TimelineVideoPlayer,
    ): [boolean, number] {
        console.log('[C2PA] Player seeking: ', time);
        let seeking = true;

        if (time === 0) {
            console.log('[C2PA] Player resetting');
            removeProgressSegments();
            seeking = false;

            return [seeking, 0.0];
        }

        if (playbackStarted && time > 0 && progressSegments.length > 0) {
            handleSeekC2PATimeline(time, isMonolithic, c2paControlBar, videoPlayer);
        }

        return [seeking, lastPlaybackTime];
    };

    // Floors rather than rounds the seconds: Math.round(seconds % 60) can
    // return 60, which used to render as "00:60" / "01:60".
    const formatTime = function (seconds: number) {
        const wholeSeconds = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(wholeSeconds / 60);
        const remainingSeconds = wholeSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const getTimelineState = function (
        isMonolithic: boolean,
        videoPlayer: TimelineVideoPlayer,
        currentTime = videoPlayer.currentTime?.() ?? 0,
    ): C2PATimelineState {
        const compromisedRegions: string[] = [];
        const segments = progressSegments.map((segment) => ({
            startTime: parseFloat(segment.dataset.startTime),
            endTime: parseFloat(segment.dataset.endTime),
            verificationStatus: segment.dataset.verificationStatus,
        }));

        if (isMonolithic) {
            // A monolithic verdict covers the whole asset, so any invalid
            // segment means the whole asset is compromised. Checking *any*
            // rather than just `segments[0]`: the first entry is the synthetic
            // "unknown" seed that updateC2PATimeline creates before the first
            // real verdict arrives, so it is essentially never the invalid one.
            if (segments.some((segment) => isInvalidSegmentStatus(segment.verificationStatus))) {
                compromisedRegions.push(`${formatTime(0.0)}-${formatTime(videoPlayer.duration())}`);
            }
        } else {
            segments.forEach((segment) => {
                if (isInvalidSegmentStatus(segment.verificationStatus)) {
                    compromisedRegions.push(
                        `${formatTime(segment.startTime)}-${formatTime(segment.endTime)}`,
                    );
                }
            });
        }

        return {
            currentTime,
            compromisedRegions,
            hasInvalidSegments: segments.some((segment) =>
                isInvalidSegmentStatus(segment.verificationStatus),
            ),
            segments,
        };
    };

    const handleC2PAValidation = function (
        verificationStatus: string,
        currentTime: number,
        c2paControlBar: TimelineComponentLike,
    ) {
        const normalizedStatus = normalizeVerificationStatus(verificationStatus);

        if (
            progressSegments.length === 0 ||
            progressSegments[progressSegments.length - 1].dataset.verificationStatus !== normalizedStatus
        ) {
            console.log('[C2PA] New validation status: ', normalizedStatus);

            if (progressSegments.length > 0) {
                const lastSegment = progressSegments[progressSegments.length - 1];
                lastSegment.dataset.endTime = String(currentTime);
            }

            const segment = createTimelineSegment(currentTime, currentTime, normalizedStatus);
            c2paControlBar.el().appendChild(segment);
            progressSegments.push(segment);
        }
    };

    const replaceC2PATimelineSegments = function (
        segments: C2PATimelineSegmentUpdate[],
        videoPlayer: TimelineVideoPlayer,
        c2paControlBar: TimelineComponentLike,
        isLive = false,
        retentionSeconds = DEFAULT_LIVE_RETENTION_SECONDS,
    ) {
        removeProgressSegments();

        const sortedSegments = [...segments]
            .filter((segment) => Number.isFinite(segment.startTime) && Number.isFinite(segment.endTime))
            .filter((segment) => segment.endTime >= segment.startTime)
            .sort((a, b) => a.startTime - b.startTime);

        const latestKnownEndTime = sortedSegments.reduce(
            (max, segment) => Math.max(max, segment.endTime),
            0,
        );
        const window = getTimelineWindow(
            videoPlayer.duration(),
            videoPlayer.currentTime(),
            latestKnownEndTime,
            isLive,
            retentionSeconds,
        );

        publishLiveWindow(window, isLive);

        sortedSegments.forEach((segment) => {
            const verificationStatus = segment.pending
                ? 'unknown'
                : normalizeVerificationStatus(segment.validationState);
            const timelineSegment = createTimelineSegment(
                segment.startTime,
                segment.endTime,
                verificationStatus,
                false,
                // A pending segment has no verdict yet, so there's nothing to
                // inspect even though it normalizes to the same "unknown"
                // status as a real unverified/missing one.
                segment.pending ? undefined : segment,
                segment.provisional === true,
            );

            positionTimelineSegment(timelineSegment, window);
            c2paControlBar.el().appendChild(timelineSegment);
            progressSegments.push(timelineSegment);
        });

        // Deliberately no updateC2PATimeline() here. Every segment above is
        // already placed against `window`, so re-running the pass only
        // recomputed the same positions - and it did so without `isLive`,
        // which on a live stream replaced the correct window with one scaled
        // from zero and collapsed every segment back to a sliver.
    };

    /**
     * Paints the entire bar with a single verdict, for an asset whose own
     * credentials failed to verify. That is a property of the asset rather than
     * of any region, so it is not built up as playback reads segments - it
     * applies to the whole timeline from the moment it is known.
     */
    const renderWholeAssetVerdict = function (
        verificationStatus: TimelineVerificationStatus,
        videoPlayer: TimelineVideoPlayer,
        c2paControlBar: TimelineComponentLike,
        isLive = false,
        retentionSeconds = DEFAULT_LIVE_RETENTION_SECONDS,
    ) {
        removeProgressSegments();

        const window = getTimelineWindow(
            videoPlayer.duration(),
            videoPlayer.currentTime(),
            0,
            isLive,
            retentionSeconds,
        );
        publishLiveWindow(window, isLive);

        // Spans the window itself, so a condemned live stream is red edge to
        // edge just as a condemned VOD asset is.
        const segment = createTimelineSegment(
            window.start,
            window.start + window.size,
            verificationStatus,
        );
        positionTimelineSegment(segment, window);

        c2paControlBar.el().appendChild(segment);
        progressSegments.push(segment);
    };

    return {
        handleOnSeeked,
        handleOnSeeking,
        handleC2PAValidation,
        getTimelineState,
        formatTime,
        updateC2PATimeline,
        replaceC2PATimelineSegments,
        renderWholeAssetVerdict,
    };
}

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

import type { ValidationState } from '@/types/c2pa.types';
import type { C2PATimelineState } from '../C2PAPlayerRoot.types';
import type { VideoJsPlayerLike } from '../C2paMenu/C2paMenu.types';

type TimelineVerificationStatus = ValidationState | 'unknown' | 'false';

interface TimelineSegmentElement extends HTMLDivElement {
    dataset: DOMStringMap & {
        startTime: string;
        endTime: string;
        verificationStatus: TimelineVerificationStatus;
    };
}

interface TimelineComponentLike {
    el(): HTMLElement;
}

interface TimelineVideoPlayer extends VideoJsPlayerLike {
    currentTime(): number;
    duration(): number;
}

interface TimelineFunctions {
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
        c2paControlBar: TimelineComponentLike,
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
export function getTimelineFunctions(): TimelineFunctions {
    let progressSegments: TimelineSegmentElement[] = [];

    const handleOnSeeked = function (time: number) {
        console.log('[C2PA] Player seeked: ', time);
        return false;
    };

    const updateC2PAButton = function (videoPlayer: VideoJsPlayerLike, isVideoSegmentInvalid = false) {
        const c2paInvalidButton = videoPlayer.el()?.querySelector('.c2pa-menu-button button');
        if (c2paInvalidButton) {
            if (isVideoSegmentInvalid) {
                c2paInvalidButton.classList.add('c2pa-menu-button-invalid');
            } else {
                c2paInvalidButton.classList.remove('c2pa-menu-button-invalid');
            }
        }
    };

    const createTimelineSegment = function (
        segmentStartTime: number,
        segmentEndTime: number,
        verificationStatus: TimelineVerificationStatus,
        isManifestInvalid = false,
    ) {
        const segment = document.createElement('div') as TimelineSegmentElement;
        segment.className = 'seekbar-play-c2pa';
        segment.style.width = '0%';
        segment.dataset.startTime = String(segmentStartTime);
        segment.dataset.endTime = String(segmentEndTime);
        segment.dataset.verificationStatus = verificationStatus;
        segment.style.backgroundColor = getSegmentColor(verificationStatus, isManifestInvalid);
        return segment;
    };

    const updateC2PATimeline = function (
        currentTime: number,
        videoPlayer: TimelineVideoPlayer,
        c2paControlBar: TimelineComponentLike,
    ) {
        console.log('[C2PA] Updating play bar');

        if (progressSegments.length === 0) {
            handleC2PAValidation('unknown', currentTime, c2paControlBar);
        }

        const lastSegment = progressSegments[progressSegments.length - 1];
        if (!lastSegment) {
            return;
        }

        lastSegment.dataset.endTime = String(currentTime);

        const playProgressControl = videoPlayer.el()?.querySelector('.vjs-play-progress') as HTMLElement | null;
        if (playProgressControl) {
            playProgressControl.style.backgroundColor = lastSegment.style.backgroundColor;
            playProgressControl.style.color = lastSegment.style.backgroundColor;
        }

        let numSegments = progressSegments.length;
        let isVideoSegmentInvalid = false;

        progressSegments.forEach((segment) => {
            const segmentStartTime = parseFloat(segment.dataset.startTime);
            const segmentEndTime = parseFloat(segment.dataset.endTime);

            let segmentProgressPercentage = 0;
            if (currentTime >= segmentStartTime && currentTime <= segmentEndTime) {
                segmentProgressPercentage = (currentTime / videoPlayer.duration()) * 100;
            } else if (currentTime >= segmentEndTime) {
                segmentProgressPercentage = (segmentEndTime / videoPlayer.duration()) * 100;
            }

            console.log('[C2PA] Segment progress percentage: ', segmentProgressPercentage);
            segment.style.width = `${segmentProgressPercentage}%`;
            segment.style.zIndex = String(numSegments);
            numSegments--;
            console.log('[C2PA] ----');

            if (isInvalidSegmentStatus(segment.dataset.verificationStatus)) {
                isVideoSegmentInvalid = true;
            }
        });

        updateC2PAButton(videoPlayer, isVideoSegmentInvalid);
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

        updateC2PATimeline(seekTime, videoPlayer, c2paControlBar);
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
            progressSegments.forEach((segment) => {
                segment.remove();
            });

            progressSegments = [];
            seeking = false;

            updateC2PAButton(videoPlayer);
            return [seeking, 0.0];
        }

        if (playbackStarted && time > 0 && progressSegments.length > 0) {
            handleSeekC2PATimeline(time, isMonolithic, c2paControlBar, videoPlayer);
        }

        return [seeking, lastPlaybackTime];
    };

    const formatTime = function (seconds: number) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
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
            if (
                segments.length > 0 &&
                isInvalidSegmentStatus(segments[0].verificationStatus)
            ) {
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

    return {
        handleOnSeeked,
        handleOnSeeking,
        handleC2PAValidation,
        getTimelineState,
        formatTime,
        updateC2PATimeline,
    };
}

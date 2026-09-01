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

import type { C2PAPlayerProps } from '../types/c2pa.types';
import type {
    C2PAPlayerRootController,
    C2PATimelineState,
} from './C2PAPlayerRoot.types';
import type { VideoJsMenuButtonComponentLike, VideoJsPlayerLike } from './C2paMenu/C2paMenu.types';
import type {
    AdapterCapabilities,
    ValidationStatusSnapshot,
    ValidationTimelineSegment,
} from '../validation';
import { createC2PAStatusFromSnapshot } from '../validation';
import { initializeC2PAControlBar } from './C2paControlBar/C2paControlBarFunctions';
import {
    displayFrictionOverlay,
    disposeFrictionOverlay,
    initializeFrictionOverlay,
    updatePlayerRootValidationState,
} from './C2paFrictionModal/C2paFrictionModalFunctions';
import {
    disposeC2PAMenu,
    handleMenuOpened,
    initializeC2PAMenu,
    setPlayerRootController,
    updateC2PAMenu,
} from './C2paMenu/C2paMenuFunctions';
import { getTimelineFunctions } from './C2paTimeline/C2paTimelineFunctions';

interface TimelineComponentLike {
    el(): HTMLElement;
}

interface SeekBarLike {
    addChild(name: string): void;
    getChild(name: string): TimelineComponentLike | null;
    removeChild(name: string): void;
}

interface ProgressControlLike {
    seekBar: SeekBarLike;
}

interface ControlBarLike {
    addChild(name: string, options?: Record<string, unknown>, index?: number): unknown;
    children(): unknown[];
    getChild(name: string): TimelineComponentLike | null;
    progressControl: ProgressControlLike;
    removeChild(name: string): void;
}

interface C2PAVideoJsPlayer extends VideoJsPlayerLike {
    controlBar: ControlBarLike;
    currentTime(): number;
    duration(): number;
    on(eventName: string, handler: () => void): void;
    pause(): void;
    play(): void;
}

interface TimelineFunctions {
    getTimelineState: (
        useStaticTimelineFallback: boolean,
        videoPlayer: C2PAVideoJsPlayer,
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
        useStaticTimelineFallback: boolean,
        c2paControlBar: TimelineComponentLike,
        videoPlayer: C2PAVideoJsPlayer,
    ) => [boolean, number];
    updateC2PATimeline: (
        currentTime: number,
        videoPlayer: C2PAVideoJsPlayer,
        extendTrailingSegmentToPlayhead?: boolean,
        isLive?: boolean,
        retentionSeconds?: number,
    ) => void;
    replaceC2PATimelineSegments: (
        segments: NonNullable<ValidationStatusSnapshot['timelineSegments']>,
        videoPlayer: C2PAVideoJsPlayer,
        c2paControlBar: TimelineComponentLike,
        isLive?: boolean,
        retentionSeconds?: number,
    ) => void;
    renderWholeAssetVerdict: (
        verificationStatus: string,
        videoPlayer: C2PAVideoJsPlayer,
        c2paControlBar: TimelineComponentLike,
        isLive?: boolean,
        retentionSeconds?: number,
    ) => void;
}

function getValidationState(snapshot: ValidationStatusSnapshot | null): string {
    return snapshot?.result?.validationState ?? 'Unknown';
}

export interface C2PAPlayerInstance {
    initialize: () => void;
    dispose: () => void;
    playbackUpdate: (snapshot: ValidationStatusSnapshot | null) => void;
}

export const C2PAPlayer = function (
    videoJsPlayer: C2PAVideoJsPlayer,
    _videoHtml: C2PAPlayerProps['videoElement'],
    capabilities: AdapterCapabilities,
): C2PAPlayerInstance {
    const videoPlayer = videoJsPlayer;
    const useStaticTimelineFallback = !capabilities.providesTimelineSegments;

    let c2paMenu: TimelineComponentLike | null = null;
    let c2paControlBar: TimelineComponentLike | null = null;
    let playerRoot: C2PAPlayerRootController | null = null;

    // Referenced by name (not called) before playerRoot is assigned below -
    // by the time a user can actually click a segment, initialize() has
    // already run and playerRoot is set.
    const handleTimelineSegmentClick = function (segment: ValidationTimelineSegment) {
        if (!playerRoot) {
            return;
        }

        // Mirrors what the menu button's own handleClick() does when opened
        // normally: without this, the next playbackUpdate tick's
        // updateC2PAMenu() -> syncMenuStateToPlayerRoot() would overwrite
        // isMenuOpen back to false from the bridge's own (still-closed)
        // tracked state.
        handleMenuOpened();
        (c2paMenu as VideoJsMenuButtonComponentLike | null)?.pressButton?.();
        playerRoot.setState({ selectedSegment: segment, isMenuOpen: true });
    };

    const {
        getTimelineState,
        handleC2PAValidation,
        handleOnSeeked,
        handleOnSeeking,
        updateC2PATimeline,
        replaceC2PATimelineSegments,
        renderWholeAssetVerdict,
    } = getTimelineFunctions(handleTimelineSegmentClick) as TimelineFunctions;

    let isManifestInvalid = false;
    let seeking = false;
    let playbackStarted = false;
    let lastPlaybackTime = 0.0;

    const minSeekTime = 0.5;

    const setPlaybackStarted = function () {
        playbackStarted = true;
    };

    return {
        initialize: function () {
            initializeC2PAControlBar(videoPlayer);
            initializeC2PAMenu(videoPlayer);
            playerRoot = initializeFrictionOverlay(videoPlayer, setPlaybackStarted);
            setPlayerRootController(playerRoot);

            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');

            videoPlayer.on('play', function () {
                if (isManifestInvalid && !playbackStarted && playerRoot) {
                    displayFrictionOverlay(playbackStarted, videoPlayer, playerRoot);
                } else {
                    setPlaybackStarted();
                }
            });

            videoPlayer.on('seeked', function () {
                seeking = handleOnSeeked(videoPlayer.currentTime());
            });

            videoPlayer.on('seeking', function () {
                if (!c2paControlBar) {
                    return;
                }

                const [nextSeeking, nextPlaybackTime] = handleOnSeeking(
                    videoPlayer.currentTime(),
                    playbackStarted,
                    lastPlaybackTime,
                    useStaticTimelineFallback,
                    c2paControlBar,
                    videoPlayer,
                );
                seeking = nextSeeking;
                lastPlaybackTime = nextPlaybackTime;
            });
        },

        dispose: function () {
            disposeC2PAMenu();
            disposeFrictionOverlay(playerRoot);

            try {
                if (c2paMenu && videoPlayer && videoPlayer.controlBar) {
                    videoPlayer.controlBar.removeChild('C2PAMenuButton');
                }
                if (c2paControlBar && videoPlayer?.controlBar?.progressControl) {
                    videoPlayer.controlBar.progressControl.seekBar.removeChild('C2PALoadProgressBar');
                }
            } catch (error) {
                console.warn('[C2PA] Error removing UI components:', error);
            }

            c2paMenu = null;
            c2paControlBar = null;
            playerRoot = null;
            seeking = false;
            playbackStarted = false;
            lastPlaybackTime = 0.0;
            isManifestInvalid = false;
        },

        playbackUpdate: function (snapshot) {
            const currentTime = videoPlayer.currentTime();
            const c2paStatus = createC2PAStatusFromSnapshot(snapshot);

            // Adapters that report their own per-fragment segments own the
            // whole timeline, so their state is safe to apply on any tick -
            // including seeks and backward jumps, which the guard below skips.
            // Only the legacy playhead-appending fallback needs that guard,
            // since it infers a segment's extent from forward progression.
            // The asset's own credentials failed to verify, so the verdict is
            // whole-asset rather than per-region and applies from the moment
            // it's known - it must not wait for playback to read segments.
            const wholeAssetInvalid = Boolean(snapshot?.wholeAssetInvalid);
            // Keyed on the adapter's capability, not on whether it happens to
            // have produced segments yet. Deriving it from segment count sent
            // fragment-reporting adapters down the playhead-appending fallback
            // before their first verdict arrived, which synthesized a
            // placeholder span - so the bar was never truly empty at load.
            // With no segments yet the correct render is nothing at all: the
            // track's own grey already means "not read".
            const ownsFullTimeline = !useStaticTimelineFallback;
            const isOrdinaryForwardTick =
                !seeking &&
                currentTime >= lastPlaybackTime &&
                currentTime - lastPlaybackTime < minSeekTime;

            // A live source has no end to scale the bar against, and on some
            // origins its times are epoch-based, so the timeline positions
            // against a window at the live edge instead of against zero.
            const isLive = Boolean(snapshot?.isLive);
            // The adapter's own retention, so the bar cannot show a stretch
            // whose verdicts have already been pruned behind it.
            const retentionSeconds = snapshot?.liveRetentionSeconds;

            if (c2paControlBar && (wholeAssetInvalid || ownsFullTimeline || isOrdinaryForwardTick)) {
                if (wholeAssetInvalid) {
                    renderWholeAssetVerdict('Invalid', videoPlayer, c2paControlBar, isLive, retentionSeconds);
                } else if (ownsFullTimeline) {
                    replaceC2PATimelineSegments(
                        snapshot?.timelineSegments ?? [],
                        videoPlayer,
                        c2paControlBar,
                        isLive,
                        retentionSeconds,
                    );
                } else {
                    handleC2PAValidation(
                        getValidationState(snapshot),
                        currentTime,
                        c2paControlBar,
                    );
                    // Playhead-appended fallback: stretch the trailing segment
                    // to the playhead, since its verdict covers the asset from
                    // where it started through wherever playback has reached.
                    updateC2PATimeline(currentTime, videoPlayer, true, isLive, retentionSeconds);
                }

                const timeline = getTimelineState(useStaticTimelineFallback, videoPlayer, currentTime);
                isManifestInvalid =
                    wholeAssetInvalid ||
                    getValidationState(snapshot) === 'Invalid' ||
                    timeline.hasInvalidSegments;
                updatePlayerRootValidationState(
                    playerRoot,
                    c2paStatus,
                    timeline,
                );
                // Pass the timeline-wide verdict, not just the playhead's: a
                // tampered fragment anywhere must keep the menu button flagged
                // (updateC2PAMenu latches it).
                updateC2PAMenu(
                    c2paMenu,
                    videoPlayer,
                    isManifestInvalid,
                );
            }

            lastPlaybackTime = currentTime;
        },
    };
};

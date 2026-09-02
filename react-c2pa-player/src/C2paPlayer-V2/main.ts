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
import type { C2PAPlayerRootController } from './C2PAPlayerRoot.types';
import type { VideoJsMenuButtonComponentLike, VideoJsPlayerLike } from './C2paMenu/C2paMenu.types';
import type {
    AdapterCapabilities,
    ValidationStatusSnapshot,
    ValidationTimelineSegment,
} from '../validation';
import { createC2PAStatusFromSnapshot } from '../validation';
import { initializeC2PAControlBar } from './C2paControlBar/C2paControlBarFunctions';
import {
    initializeC2PADebugButton,
    removeC2PADebugButton,
    setDebugButtonAvailable,
} from './C2paDebugConsole/C2paDebugButton';
import {
    displayFrictionOverlay,
    disposeFrictionOverlay,
    initializeFrictionOverlay,
    updatePlayerRootValidationState,
} from './C2paFrictionModal/C2paFrictionModalFunctions';
import {
    closeDebugConsole,
    disposeC2PAMenu,
    handleMenuOpened,
    initializeC2PAMenu,
    setPlayerRootController,
    updateC2PAMenu,
} from './C2paMenu/C2paMenuFunctions';
import { getTimelineFunctions } from './C2paTimeline/C2paTimelineFunctions';
import { createTimelinePreview } from './C2paTimeline/C2paTimelinePreview';
import { decideLiveResume } from './C2paTimeline/liveResume';
import {
    decideValidatedPlayback,
    newestVerdictEnd,
} from './C2paTimeline/validatedPlaybackGate';

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
    // The hover preview attaches here rather than to the seek bar: the control
    // is the taller box (53px against the bar's 15px), so the whole band is a
    // hover and tap target.
    el(): HTMLElement;
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
    videoElement: C2PAPlayerProps['videoElement'],
    capabilities: AdapterCapabilities,
): C2PAPlayerInstance {
    const videoPlayer = videoJsPlayer;
    const useStaticTimelineFallback = !capabilities.providesTimelineSegments;

    let c2paMenu: TimelineComponentLike | null = null;
    let c2paControlBar: TimelineComponentLike | null = null;
    let playerRoot: C2PAPlayerRootController | null = null;
    const timelinePreview = createTimelinePreview();
    let sourceIsLive = false;
    // `timeShiftBufferDepth`, as the manifest declares it. Sizes the bar and
    // decides whether a paused position still exists at the origin.
    let dvrWindowSeconds: number | null = null;
    // True while playback is being held because the playhead reached content
    // with no verdict yet, so it can be released when one arrives.
    let heldForValidation = false;
    // When the stream was paused, so resuming can tell whether the position it
    // was left at still exists at the origin.
    let pausedAtEpochMs: number | null = null;

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
        disposeTimeline,
    } = getTimelineFunctions(handleTimelineSegmentClick);

    let isManifestInvalid = false;
    let seeking = false;
    let playbackStarted = false;
    let lastPlaybackTime = 0.0;

    const minSeekTime = 0.5;

    const setPlaybackStarted = function () {
        playbackStarted = true;
    };

    /**
     * Rejoins the live edge when a pause has outlasted what the origin keeps.
     *
     * Pausing a live DASH stream stops dash.js entirely, so the position it was
     * left at is deleted at the origin while the player still believes it is
     * seekable. Resuming from it does not fail visibly - it hangs. Measured:
     * resuming after 25s paused on a 30s window never recovered.
     */
    /**
     * Holds the picture rather than show a segment no verdict covers.
     *
     * The DASH plugin validates after handing bytes to the player, so without
     * this the picture runs ahead of the checking. Pausing is the only lever
     * available - the bytes are already in the buffer by then.
     *
     * The hold is announced rather than silent: a player that simply stops
     * looks broken, and if validation has stopped for good this will not
     * release on its own. `?gate=off` is the way out.
     */
    const enforceValidatedPlayback = function (
        snapshot: ValidationStatusSnapshot | null,
        currentTime: number,
        isLive: boolean,
    ) {
        const decision = decideValidatedPlayback({
            isLive,
            enforce: snapshot?.enforceValidatedPlayback !== false,
            currentTime,
            newestVerdictEnd: newestVerdictEnd(snapshot?.timelineSegments),
        });

        if (decision.hold) {
            if (!heldForValidation) {
                heldForValidation = true;
                console.warn(
                    '[C2PA] Holding playback: the playhead has reached content with no verdict yet. ' +
                        'Add ?gate=off to play unvalidated content.',
                );
            }

            if (!videoElement.paused) {
                videoElement.pause();
            }

            return;
        }

        if (heldForValidation) {
            heldForValidation = false;
            void videoElement.play().catch(() => {
                // The viewer may have paused deliberately while we were
                // holding; not resuming is the right outcome then.
            });
        }
    };

    const rejoinLiveIfPositionIsGone = function () {
        const pausedFor = pausedAtEpochMs === null ? 0 : (Date.now() - pausedAtEpochMs) / 1000;
        pausedAtEpochMs = null;

        const decision = decideLiveResume(
            sourceIsLive,
            pausedFor,
            dvrWindowSeconds,
        );

        if (!decision.rejoinAtLiveEdge) {
            return;
        }

        const seekable = videoElement.seekable;

        if (seekable.length === 0) {
            return;
        }

        // A shade inside the edge rather than exactly on it: the very last
        // moment of the window is the one most likely to be gone by the time
        // the seek lands.
        videoElement.currentTime = Math.max(
            seekable.start(0),
            seekable.end(seekable.length - 1) - 1,
        );
        console.warn(
            `[C2PA] Rejoined the live edge: paused ${pausedFor.toFixed(0)}s, longer than the stream retains.`,
        );
    };

    return {
        initialize: function () {
            initializeC2PAControlBar(videoPlayer);
            initializeC2PAMenu(videoPlayer);
            initializeC2PADebugButton(videoPlayer);
            // Shown only where there is a per-segment record to show. The
            // capability that decides it is the same one that decides whether
            // the adapter owns the timeline, which is the honest definition of
            // "fragmented" here - a monolithic MP4 has one verdict for the
            // whole asset and would open an empty log.
            setDebugButtonAvailable(videoPlayer, !useStaticTimelineFallback);
            playerRoot = initializeFrictionOverlay(videoPlayer, setPlaybackStarted);
            setPlayerRootController(playerRoot);

            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');
            timelinePreview.attach(videoPlayer.controlBar.progressControl.el());

            videoElement.addEventListener('pause', function () {
                pausedAtEpochMs = Date.now();
            });

            videoPlayer.on('play', function () {
                rejoinLiveIfPositionIsGone();

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

                // Only the playhead-appending fallback rewrites the bar on a
                // seek. An adapter that reports its own fragments rebuilds the
                // whole timeline from its snapshot on the next tick, so letting
                // handleOnSeeking loose on it just meant the bar was filtered
                // and had a synthetic "unknown" span appended, both to be
                // thrown away milliseconds later - visible as a flicker on the
                // jump back to the live edge, and pure waste besides.
                if (!useStaticTimelineFallback) {
                    seeking = true;
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
            // Before the root goes: the console is mounted in it, and it must
            // not be left showing over the next source's player.
            closeDebugConsole();
            disposeFrictionOverlay(playerRoot);
            timelinePreview.dispose();
            // Before the player is released: the timeline's roll holds the
            // player instance and reads `currentTime()` on every frame.
            disposeTimeline();

            try {
                if (c2paMenu && videoPlayer && videoPlayer.controlBar) {
                    videoPlayer.controlBar.removeChild('C2PAMenuButton');
                }
                if (videoPlayer?.controlBar) {
                    removeC2PADebugButton(videoPlayer);
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

            // Which engine produced these verdicts decides whether the preview
            // may present a segment's CAWG metadata as verified.
            timelinePreview.setAdapterKind(snapshot?.adapterKind ?? null);

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
            sourceIsLive = isLive;
            // The adapter's own retention, so the bar cannot show a stretch
            // whose verdicts have already been pruned behind it.
            const retentionSeconds = snapshot?.liveRetentionSeconds;
            dvrWindowSeconds = snapshot?.dvrWindowSeconds ?? null;

            if (c2paControlBar && (wholeAssetInvalid || ownsFullTimeline || isOrdinaryForwardTick)) {
                if (wholeAssetInvalid) {
                    renderWholeAssetVerdict(
                        'Invalid',
                        videoPlayer,
                        c2paControlBar,
                        isLive,
                        retentionSeconds,
                    );
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
                    updateC2PATimeline(
                        currentTime,
                        videoPlayer,
                        true,
                        isLive,
                        retentionSeconds,
                    );
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

            enforceValidatedPlayback(snapshot, currentTime, isLive);

            lastPlaybackTime = currentTime;
        },
    };
};

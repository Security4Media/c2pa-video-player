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
    ConsentMode,
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
    requestConsent,
    updateAuthenticityLabel,
    updatePlayerRootValidationState,
    withdrawConsent,
} from './C2paFrictionModal/C2paFrictionModalFunctions';
import {
    closeDebugConsole,
    disposeC2PAMenu,
    handleMenuOpened,
    initializeC2PAMenu,
    setPlayerRootController,
    updateC2PAMenu,
} from './C2paMenu/C2paMenuFunctions';
import {
    advanceAuthenticityGate,
    initialAuthenticityGateState,
    type AuthenticityGateDecision,
    type AuthenticityGateEvent,
    type AuthenticityGateInputs,
    type AuthenticityGateState,
} from './C2paAuthenticity/authenticityGate';
import { getTimelineFunctions } from './C2paTimeline/C2paTimelineFunctions';
import { createTimelinePreview } from './C2paTimeline/C2paTimelinePreview';
import { decideLiveResume } from './C2paTimeline/liveResume';
import { selectPlayheadVerdict } from './C2paTimeline/playheadVerdict';
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


/**
 * How often to re-evaluate the gate while nothing else is ticking.
 *
 * Only running while a decision reports a deadline, which is a collapse a few
 * seconds out or a consent question counting down. `playbackUpdate` is driven
 * by `timeupdate`, `play`, `seeking`, `seeked` and session emissions, and a
 * paused player produces none of them - paused DASH emits nothing at all - so
 * without this the countdown would freeze on the second it was raised and the
 * question would never withdraw. 250ms so a whole-second countdown never
 * appears to skip a number.
 */
const AUTHENTICITY_TICK_MS = 250;

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
    // True while playback is being held for an unanswered consent question.
    let heldForConsent = false;
    // Whether *we* are the reason the picture is stopped. Read on the falling
    // edge so releasing a hold cannot resume a pause the viewer asked for.
    let holdingPlayback = false;
    let authenticityGate: AuthenticityGateState = initialAuthenticityGateState(Date.now());
    /**
     * The last inputs the gate was given, minus the two that are always fresh.
     *
     * Cached so the timer above can re-evaluate without a snapshot. Safe
     * because the verdict at the playhead cannot move under a paused player:
     * `WatchedTimeline.observePlayhead` ignores samples while playback is not
     * actually running, so no new region can appear over a stationary
     * playhead. Null until the first tick, which is what stops the timer
     * running before there is anything to decide.
     */
    let authenticityInputs:
        | Omit<AuthenticityGateInputs, 'event' | 'nowMs' | 'alreadyPausedSeconds'>
        | null = null;
    let authenticityTimerId: ReturnType<typeof setInterval> | null = null;
    // Which consent question is in force. Either mid-playback mode suppresses
    // the legacy once-per-source one. Read off the snapshot rather than the URL
    // so the policy has one path into the player layer.
    let consentMode: ConsentMode = 'whole-asset';

    // Referenced by name (not called) before playerRoot is assigned below -
    // by the time a user can actually click a segment, initialize() has
    // already run and playerRoot is set.
    //
    // Takes a nullable segment because the authenticity label opens the same
    // panel: on the offending fragment when it is warning about one, and on the
    // general status when it is not. One function, so a click on the bar and a
    // click on the label cannot open the panel two different ways.
    const openMenuOnSegment = function (segment: ValidationTimelineSegment | null) {
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
        getIssuerAccentColor,
        renderWholeAssetVerdict,
        disposeTimeline,
    } = getTimelineFunctions(openMenuOnSegment);

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
     * The only place playback is held or released.
     *
     * Two mechanisms want to stop the picture - the validated-playback gate and
     * an unanswered consent question - and before this each called `pause()`
     * and `play()` for itself. Two writers on one element is how the gate's
     * falling-edge `play()` ended up fighting the consent pause. Holding is a
     * level, so it is safe to reassert on every tick; releasing is an edge, so
     * that resuming can never restart a pause the viewer asked for.
     */
    const syncPlaybackHold = function () {
        if (heldForConsent || heldForValidation) {
            holdingPlayback = true;

            if (!videoElement.paused) {
                videoElement.pause();
            }

            return;
        }

        if (!holdingPlayback) {
            return;
        }

        holdingPlayback = false;
        void videoElement.play().catch(() => {
            // The viewer may have paused deliberately while we were holding;
            // not resuming is the right outcome then.
        });
    };

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
        } else {
            heldForValidation = false;
        }

        syncPlaybackHold();
    };

    /**
     * Keeps the timer running only while something is waiting on it.
     */
    const syncAuthenticityTimer = function (nextDeadlineMs: number | null) {
        if (nextDeadlineMs !== null && authenticityTimerId === null) {
            authenticityTimerId = setInterval(() => {
                runAuthenticityGate('tick');
            }, AUTHENTICITY_TICK_MS);
            return;
        }

        if (nextDeadlineMs === null && authenticityTimerId !== null) {
            clearInterval(authenticityTimerId);
            authenticityTimerId = null;
        }
    };

    const applyAuthenticityDecision = function (decision: AuthenticityGateDecision) {
        updateAuthenticityLabel(playerRoot, decision.label);

        if (decision.showConsent) {
            // A level, so reasserting it every tick is what keeps the countdown
            // moving; the overlay is already showing by the second call.
            requestConsent(
                playerRoot,
                // The wording is the one visible difference between the modes:
                // per-stream has to say that this is the only warning.
                consentMode === 'per-stream' ? 'invalid-stream' : 'invalid-run',
                decision.consentSecondsRemaining,
            );
        } else if (heldForConsent) {
            // Was up and is not any more: either accepted or withdrawn, and the
            // state machine has already decided which. Taking it down here
            // covers both, and covers the seek-away case where neither
            // happened.
            withdrawConsent(playerRoot);
        }

        heldForConsent = decision.holdForConsent;
        syncPlaybackHold();
        syncAuthenticityTimer(decision.nextDeadlineMs);

        if (decision.openMenu) {
            // A deliberate pause rather than a hold: the viewer asked to look
            // at this, so it must not be resumed by a hold being released.
            videoElement.pause();
            openMenuOnSegment(decision.openMenu.segment);
        }
    };

    /**
     * Feeds the gate one event and applies what it decides.
     *
     * Every caller goes through here - the render tick, the timer, the consent
     * accept and the label click - so the state can only advance one way.
     */
    const runAuthenticityGate = function (event: AuthenticityGateEvent) {
        if (!authenticityInputs) {
            return;
        }

        const decision = advanceAuthenticityGate(authenticityGate, {
            ...authenticityInputs,
            event,
            // Measured fresh, because the countdown has to account for a pause
            // the viewer started before the question was raised: the rejoin
            // measures its budget from the pause, not from the question.
            alreadyPausedSeconds:
                pausedAtEpochMs === null ? 0 : (Date.now() - pausedAtEpochMs) / 1000,
            nowMs: Date.now(),
        });

        authenticityGate = decision.state;
        applyAuthenticityDecision(decision);
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
            playerRoot = initializeFrictionOverlay(videoPlayer, setPlaybackStarted, {
                onConsentAccepted: () => {
                    runAuthenticityGate('consent-accepted');
                },
                onAuthenticityLabelClick: () => {
                    runAuthenticityGate('label-clicked');
                },
            });
            setPlayerRootController(playerRoot);

            c2paMenu = videoPlayer.controlBar.getChild('C2PAMenuButton');
            c2paControlBar = videoPlayer.controlBar.progressControl.seekBar.getChild('C2PALoadProgressBar');
            timelinePreview.attach(videoPlayer.controlBar.progressControl.el());

            videoElement.addEventListener('pause', function () {
                pausedAtEpochMs = Date.now();
            });

            videoPlayer.on('play', function () {
                rejoinLiveIfPositionIsGone();

                // Either mid-playback question subsumes this one and is
                // strictly more capable, so it is not asked twice. No ordering
                // hazard in reading the mode off a snapshot:
                // `isManifestInvalid` is only ever set inside playbackUpdate,
                // so if no snapshot has arrived this branch cannot be reached
                // anyway.
                const legacyConsent = consentMode === 'whole-asset';

                if (isManifestInvalid && !playbackStarted && playerRoot && legacyConsent) {
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

            if (authenticityTimerId !== null) {
                clearInterval(authenticityTimerId);
                authenticityTimerId = null;
            }

            c2paMenu = null;
            c2paControlBar = null;
            playerRoot = null;
            seeking = false;
            playbackStarted = false;
            lastPlaybackTime = 0.0;
            isManifestInvalid = false;
            // Holds do not survive a source switch. `heldForValidation` did
            // not reset here before, so a source released while held left the
            // flag set and the next source's first release would fire a
            // `play()` nothing had asked for.
            heldForValidation = false;
            heldForConsent = false;
            holdingPlayback = false;
            consentMode = 'whole-asset';
            pausedAtEpochMs = null;
            authenticityInputs = null;
            authenticityGate = initialAuthenticityGateState(Date.now());
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
            // Live only - see replaceC2PATimelineSegments's own doc comment;
            // a VOD asset has one signer for its whole duration.
            const colorizeByIssuer = Boolean(snapshot?.colorizeTimelineByIssuer) && isLive;

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
                        colorizeByIssuer,
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

            // Outside the render guard above, because that guard skips
            // non-forward ticks: inside it, the label would freeze mid-seek
            // and the question would not be raised for a stretch the viewer
            // seeked into.
            const showLabel = snapshot?.showAuthenticityLabel === true;
            consentMode = snapshot?.consentMode ?? 'whole-asset';
            const consentMidPlayback = consentMode !== 'whole-asset';

            if (showLabel || consentMidPlayback) {
                const verdict = selectPlayheadVerdict({
                    segments: snapshot?.timelineSegments,
                    time: currentTime,
                    ownsTimeline: ownsFullTimeline,
                    wholeAssetInvalid,
                    fallbackState: snapshot?.result?.validationState ?? null,
                });

                authenticityInputs = {
                    verdict,
                    // Same assigner the timeline paints from (getIssuerAccentColor
                    // reads it once per tick here, since this is a single call
                    // rather than a per-segment render pass), so the label always
                    // matches whichever colour is under the playhead.
                    issuerAccentColor: colorizeByIssuer
                        ? getIssuerAccentColor(verdict.segment)
                        : null,
                    labelEnabled: showLabel,
                    consentMode,
                    isLive,
                    dvrDepthSeconds: dvrWindowSeconds,
                };
                runAuthenticityGate('tick');
            }

            // Runs while a question is unanswered too, deliberately. Guarding
            // it looked safer and was not: skipping it freezes
            // `heldForValidation` at whatever it was, and a paused DASH stream
            // emits nothing, so a hold latched just before the question was
            // raised would survive the acceptance and pause the picture
            // straight back with nothing left to clear it.
            //
            // Safe because `syncPlaybackHold` is the only writer, so the two
            // cannot fight over the element; and because a question is only
            // raised when a verdict covers the playhead, which is exactly the
            // condition under which this gate does not hold.
            enforceValidatedPlayback(snapshot, currentTime, isLive);

            lastPlaybackTime = currentTime;
        },
    };
};

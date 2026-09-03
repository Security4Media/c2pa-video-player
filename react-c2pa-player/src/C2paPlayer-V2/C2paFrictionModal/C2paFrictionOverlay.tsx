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

import { useEffect, useId, useRef } from 'react';

interface C2paFrictionOverlayProps {
    isVisible: boolean;
    scope: 'whole-asset' | 'invalid-run';
    /** Seconds before the question withdraws itself, or null when it will not. */
    countdownSeconds: number | null;
    onWatchAnyway: () => void;
}

/**
 * What each question actually claims.
 *
 * Two sentences rather than one, because the two are different claims and a
 * viewer acts on them differently. The whole-asset wording is unchanged from
 * before this file learned about runs.
 */
const CONSENT_MESSAGE = {
    'whole-asset':
        "The information in this video's Content Credentials is no longer trustworthy and the video's history cannot be confirmed.",
    'invalid-run':
        'The Content Credentials for the part now playing are invalid. This part of the stream may have been tampered with.',
} as const;

/**
 * The consent gate shown when an asset's own credentials failed to verify.
 *
 * This is the one surface in the player that stops playback and will not let it
 * resume until the viewer acts, which is what shapes the accessibility here:
 *
 *  - `role="alertdialog"`, because that is what it is. Not `aria-modal`,
 *    though: the control bar stays reachable behind it, and claiming modality
 *    without trapping focus would describe behaviour it does not have.
 *  - Focus moves to the accept button when it appears. Without that, the video
 *    simply stopped and nothing said why or what to do - the overlay is
 *    appended after the whole control bar in the DOM, so a keyboard user would
 *    have had to tab past every control to find it.
 *  - Focus goes back where it came from on dismissal, so accepting does not
 *    strand the viewer at the end of the control bar.
 *
 * Hidden with `display: none` rather than unmounted, which correctly keeps it
 * out of both the accessibility tree and the tab order while it is not showing.
 */
export function C2paFrictionOverlay({
    isVisible,
    scope,
    countdownSeconds,
    onWatchAnyway,
}: C2paFrictionOverlayProps) {
    const messageId = useId();
    const buttonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!isVisible) {
            return;
        }

        const returnTo = document.activeElement as HTMLElement | null;

        buttonRef.current?.focus();

        return () => {
            // Only if it is still in the document: on teardown the element that
            // had focus has often gone, and focusing a detached node drops
            // focus to the body rather than leaving it alone.
            if (returnTo?.isConnected) {
                returnTo.focus();
            }
        };
    }, [isVisible]);

    return (
        <div
            className="friction-overlay"
            role="alertdialog"
            aria-labelledby={messageId}
            style={{ display: isVisible ? 'flex' : 'none' }}
        >
            <p id={messageId}>{CONSENT_MESSAGE[scope]}</p>
            {/* Only when there is a real deadline. Saying what happens when it
                runs out matters more than the number: a countdown with no
                consequence attached just adds pressure. */}
            {countdownSeconds === null ? null : (
                <p className="friction-countdown">
                    If you do not choose within{' '}
                    <strong className="friction-countdown__seconds">{countdownSeconds}s</strong>,
                    this question will close and playback will continue from the live edge.
                </p>
            )}
            <button
                ref={buttonRef}
                type="button"
                className="friction-button"
                onClick={onWatchAnyway}
            >
                Watch Anyway
            </button>
        </div>
    );
}

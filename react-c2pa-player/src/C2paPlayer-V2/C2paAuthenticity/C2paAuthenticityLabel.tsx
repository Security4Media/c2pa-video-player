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

import { useEffect, useRef, useState } from 'react';
import type { AuthenticityLabelView } from './authenticityGate';

const EXIT_DURATION_MS = 240;

interface C2paAuthenticityLabelProps {
    /** What to say, or null to say nothing. See authenticityGate.ts. */
    label: AuthenticityLabelView | null;
    onClick: () => void;
}

/**
 * States the provenance of the moment on screen, in the picture.
 *
 * The first thing this player puts over the video, so a few things are
 * deliberate:
 *
 *  - **A real `<button>`.** It is clickable (it pauses and opens the panel), so
 *    it has to be reachable and operable without a mouse. It stays a button
 *    when collapsed to a dot.
 *  - **The verdict is in words, not only in colour.** The `aria-label` states
 *    it in full even while the visible text is collapsed away, so the meaning
 *    never depends on being able to tell green from red.
 *  - **The live region is a separate element.** Announcing from the button
 *    itself would re-announce on every collapse, and on a live source the
 *    verdict can change every few seconds. Only transitions into Invalid and
 *    Unknown are announced: those are the ones a viewer needs to be told about
 *    without looking.
 *  - **Animation is CSS, not the Web Animations API.** design-tokens.css has a
 *    global `prefers-reduced-motion` rule that zeroes animation and transition
 *    durations with `!important`, which reaches CSS but not WAAPI. The menu's
 *    animations are a known gap in exactly that respect; this does not add a
 *    second one.
 *
 * The exit fade is why the last non-null label is held locally: unmounting on
 * `null` would cut the fade off at its first frame. Nothing is rendered at all
 * once it has faded, so the feature costs nothing while switched off.
 */
export function C2paAuthenticityLabel({ label, onClick }: C2paAuthenticityLabelProps) {
    const [shown, setShown] = useState<AuthenticityLabelView | null>(label);
    const [isLeaving, setIsLeaving] = useState(false);
    const [announcement, setAnnouncement] = useState('');
    const announcedState = useRef<AuthenticityLabelView['state'] | null>(null);

    useEffect(() => {
        if (label) {
            setIsLeaving(false);

            // Compared field by field, not by identity: the decision produces a
            // fresh object on every tick, and a live source ticks four times a
            // second for a label that usually has not changed.
            setShown((current) =>
                current &&
                current.state === label.state &&
                current.expanded === label.expanded &&
                current.text === label.text
                    ? current
                    : label,
            );

            return;
        }

        if (!shown) {
            return;
        }

        setIsLeaving(true);
        const timeoutId = setTimeout(() => {
            setShown(null);
            setIsLeaving(false);
        }, EXIT_DURATION_MS);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [label, shown]);

    useEffect(() => {
        const state = label?.state ?? null;

        if (state === announcedState.current) {
            return;
        }

        announcedState.current = state;
        setAnnouncement(
            state === 'Invalid' || state === 'Unknown' ? (label?.text ?? '') : '',
        );
    }, [label?.state, label?.text]);

    return (
        <>
            <span className="c2pa-authenticity-live" aria-live="polite" role="status">
                {announcement}
            </span>
            {shown ? (
                <button
                    type="button"
                    className={[
                        'c2pa-authenticity-label',
                        `c2pa-authenticity-label--${shown.state.toLowerCase()}`,
                        shown.expanded
                            ? 'c2pa-authenticity-label--expanded'
                            : 'c2pa-authenticity-label--collapsed',
                        shown.glowing ? 'c2pa-authenticity-label--glowing' : '',
                        isLeaving ? 'c2pa-authenticity-label--leaving' : '',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    // Stated in words, and in full even when collapsed, so the
                    // verdict is never carried by colour alone.
                    aria-label={`${shown.text}. Show content credentials.`}
                    title={shown.text}
                    onClick={onClick}
                >
                    <span className="c2pa-authenticity-label__mark" aria-hidden="true" />
                    <span className="c2pa-authenticity-label__text">{shown.text}</span>
                </button>
            ) : null}
        </>
    );
}

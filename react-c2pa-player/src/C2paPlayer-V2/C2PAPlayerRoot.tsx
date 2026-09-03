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

import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { C2PAPlayerRootController } from './C2PAPlayerRoot.types';
import { C2paAuthenticityLabel } from './C2paAuthenticity/C2paAuthenticityLabel';
import { C2paDebugConsole } from './C2paDebugConsole/C2paDebugConsole';
import { C2paFrictionOverlay } from './C2paFrictionModal/C2paFrictionOverlay';
import { closeC2PAMenu } from './C2paMenu/C2paMenuBridge';
import { C2paMenuRoot } from './C2paMenu/C2paMenuRoot';

interface C2PAPlayerRootProps {
    controller: C2PAPlayerRootController;
    onWatchAnyway: () => void;
}

const MENU_OPEN_ANIMATION_DURATION_MS = 360;
const MENU_CLOSE_ANIMATION_DURATION_MS = 240;
const MENU_OPEN_ANIMATION_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const MENU_CLOSE_ANIMATION_EASING = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)';

type MenuRenderPhase = 'opening' | 'open' | 'closing';

const MENU_POINTER_DEFAULT_CENTER_PX = 43;
const MENU_POINTER_HALF_WIDTH_PX = 11;

type MenuAnchorStyle = CSSProperties & {
    '--c2pa-menu-panel-offset-x'?: string;
    '--c2pa-menu-anchor-origin-x'?: string;
};

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Top-level React overlay layer mounted into the Video.js player container.
 * Additional player-level React UI can be added here over time while the
 * existing Video.js shell remains in place.
 *
 * @param isFrictionOverlayVisible - Whether the friction overlay should be visible
 * @param onWatchAnyway - Callback fired when the user accepts playback
 * @returns Player overlay React tree
 */
export function C2PAPlayerRoot({
    controller,
    onWatchAnyway,
}: C2PAPlayerRootProps) {
    const [isMenuRendered, setIsMenuRendered] = useState(false);
    const [menuRenderPhase, setMenuRenderPhase] = useState<MenuRenderPhase>('closing');
    const [menuAnchorStyle, setMenuAnchorStyle] = useState<MenuAnchorStyle>({});
    const menuShellRef = useRef<HTMLDivElement | null>(null);
    const state = useSyncExternalStore(
        controller.subscribe,
        controller.getState,
        controller.getState,
    );

    /**
     * Escape closes whichever panel is on top.
     *
     * Video.js handles Escape for its own menu button, but only while focus is
     * on that button. Focus now moves into the panel when it opens, and the
     * panel lives in a separate overlay element rather than inside the
     * button's component, so the key event never reaches video.js at all. The
     * overlay has to handle it.
     *
     * Closing the menu goes back through video.js (`closeC2PAMenu`), so if
     * both paths do fire - focus on the button, video.js closes, then this
     * runs - the second call is a no-op rather than a desync.
     */
    useEffect(() => {
        if (!state.isMenuOpen && !state.isDebugOpen) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') {
                return;
            }

            // Topmost first. The menu overlay paints above the validation log,
            // so that is what a viewer means by "close this".
            if (state.isMenuOpen) {
                closeC2PAMenu();
            } else {
                controller.setState({ isDebugOpen: false });
            }
        };

        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [controller, state.isDebugOpen, state.isMenuOpen]);

    /**
     * A click anywhere but the panel closes it.
     *
     * Video.js has a path for this (`Menu.handleBlur`) and it cannot fire here:
     * the popup it listens on is the one menu-shell.css sets to
     * `display: none`, and an element that is not rendered is never focused, so
     * it never blurs. Without this, and with the overlay covering the whole
     * player at `pointer-events: auto`, an open panel had exactly one exit.
     *
     * `pointerdown` rather than `click`, so the panel goes before the pointer
     * is released and the interaction feels immediate. That is also why the
     * menu button is excluded: its own click handler toggles, and closing here
     * first would let that toggle re-open what the user just dismissed.
     */
    useEffect(() => {
        if (!state.isMenuOpen) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target as Element | null;

            if (
                target?.closest('.c2pa-menu-panel') ||
                target?.closest('.c2pa-menu-button') ||
                // The label's own click opens the panel. Closing here first
                // would let that reopen what this just dismissed, so a click
                // on the label would toggle instead of opening.
                target?.closest('.c2pa-authenticity-label')
            ) {
                return;
            }

            closeC2PAMenu();
        };

        document.addEventListener('pointerdown', handlePointerDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
        };
    }, [state.isMenuOpen]);

    /**
     * Where focus goes back to when the panel closes.
     *
     * Keyed on the logical open state rather than on whether the panel is still
     * rendered, so focus returns the moment the menu is dismissed instead of
     * waiting out its close animation.
     */
    useEffect(() => {
        if (!state.isMenuOpen) {
            return;
        }

        const returnTo = document.activeElement as HTMLElement | null;

        return () => {
            // Only if it is still there. On player teardown the button has
            // already gone, and focusing a detached node moves focus to the
            // body rather than leaving it where it was.
            if (returnTo?.isConnected) {
                returnTo.focus();
            }
        };
    }, [state.isMenuOpen]);

    /**
     * Focus moves into the panel when it appears.
     *
     * Video.js's `pressButton` does call `focus()`, but on the popup that
     * menu-shell.css sets to `display: none`, which is a no-op - so before
     * this, opening the panel left focus on the control-bar button while a
     * full-height panel appeared elsewhere in the DOM, eight or so tab stops
     * away.
     *
     * Keyed on `isMenuRendered`, not on `state.isMenuOpen`: the panel enters
     * the DOM one render *after* the open state flips (see the phase effect
     * below), so an effect on the open state alone runs while the ref is still
     * null. That is a real ordering bug this had, and the browser check caught
     * it.
     *
     * The container is focused rather than the first control inside it: which
     * control that is varies by render mode, and one mode has none at all.
     */
    useEffect(() => {
        if (!isMenuRendered) {
            return;
        }

        menuShellRef.current?.querySelector<HTMLElement>('.c2pa-menu-panel')?.focus();
    }, [isMenuRendered]);

    /** The same for the validation log, which has its own open state. */
    useEffect(() => {
        if (!state.isDebugOpen) {
            return;
        }

        const returnTo = document.activeElement as HTMLElement | null;
        const frame = requestAnimationFrame(() => {
            controller.container
                .querySelector<HTMLElement>('.c2pa-debug-console')
                ?.focus();
        });

        return () => {
            cancelAnimationFrame(frame);

            if (returnTo?.isConnected) {
                returnTo.focus();
            }
        };
    }, [controller, state.isDebugOpen]);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        if (state.isMenuOpen) {
            setIsMenuRendered(true);
            setMenuRenderPhase('opening');
            timeoutId = setTimeout(() => {
                setMenuRenderPhase('open');
            }, MENU_OPEN_ANIMATION_DURATION_MS);
        } else if (isMenuRendered) {
            setMenuRenderPhase('closing');
            timeoutId = setTimeout(() => {
                setIsMenuRendered(false);
            }, MENU_CLOSE_ANIMATION_DURATION_MS);
        }

        return () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        };
    }, [isMenuRendered, state.isMenuOpen]);

    useEffect(() => {
        const menuElement = menuShellRef.current?.querySelector('.c2pa-menu-panel') as HTMLDivElement | null;
        if (!menuElement) {
            return;
        }

        const closedStyle = {
            opacity: 0,
            transform: 'translate3d(-1.5rem, 1.5rem, 0) scale(0.08)',
            filter: 'blur(0.7rem)',
        };
        const openStyle = {
            opacity: 1,
            transform: 'translate3d(0, 0, 0) scale(1)',
            filter: 'blur(0)',
        };

        if (menuRenderPhase === 'opening') {
            menuElement.style.opacity = String(closedStyle.opacity);
            menuElement.style.transform = closedStyle.transform;
            menuElement.style.filter = closedStyle.filter;

            const animation = menuElement.animate(
                [
                    closedStyle,
                    {
                        opacity: 1,
                        transform: 'translate3d(0.45rem, -0.28rem, 0) scale(1.08)',
                        filter: 'blur(0.12rem)',
                    },
                    openStyle,
                ],
                {
                    duration: MENU_OPEN_ANIMATION_DURATION_MS,
                    easing: MENU_OPEN_ANIMATION_EASING,
                    fill: 'forwards',
                },
            );

            return () => {
                animation.cancel();
            };
        }

        if (menuRenderPhase === 'closing') {
            menuElement.style.opacity = String(openStyle.opacity);
            menuElement.style.transform = openStyle.transform;
            menuElement.style.filter = openStyle.filter;

            const animation = menuElement.animate(
                [
                    openStyle,
                    closedStyle,
                ],
                {
                    duration: MENU_CLOSE_ANIMATION_DURATION_MS,
                    easing: MENU_CLOSE_ANIMATION_EASING,
                    fill: 'forwards',
                },
            );

            return () => {
                animation.cancel();
            };
        }

        menuElement.style.opacity = '1';
        menuElement.style.transform = 'translate3d(0, 0, 0) scale(1)';
        menuElement.style.filter = 'blur(0)';
    }, [menuRenderPhase]);

    useEffect(() => {
        if (!isMenuRendered) {
            setMenuAnchorStyle({});
            return;
        }

        const updateMenuAnchor = () => {
            const shellElement = menuShellRef.current;
            const panelElement = shellElement?.querySelector('.c2pa-menu-panel') as HTMLDivElement | null;
            const overlayElement = shellElement?.closest('.c2pa-player-menu-overlay') as HTMLDivElement | null;
            const playerElement = controller.container.parentElement;
            const iconElement = playerElement?.querySelector('.c2pa-menu-button .vjs-icon-placeholder') as HTMLSpanElement | null;

            if (!shellElement || !panelElement || !overlayElement || !playerElement || !iconElement) {
                setMenuAnchorStyle({});
                return;
            }

            const overlayRect = overlayElement.getBoundingClientRect();
            const panelRect = panelElement.getBoundingClientRect();
            const iconRect = iconElement.getBoundingClientRect();

            const anchorCenterX = iconRect.left + (iconRect.width / 2) - overlayRect.left;
            const maxPanelOffsetX = Math.max(0, overlayRect.width - panelRect.width);
            const panelOffsetX = clamp(
                anchorCenterX - MENU_POINTER_DEFAULT_CENTER_PX,
                0,
                maxPanelOffsetX,
            );
            const anchorOriginX = clamp(
                anchorCenterX - panelOffsetX,
                MENU_POINTER_HALF_WIDTH_PX,
                panelRect.width - MENU_POINTER_HALF_WIDTH_PX,
            );

            setMenuAnchorStyle({
                '--c2pa-menu-panel-offset-x': `${panelOffsetX}px`,
                '--c2pa-menu-anchor-origin-x': `${anchorOriginX}px`,
            });
        };

        updateMenuAnchor();

        const playerElement = controller.container.parentElement;
        const resizeObserver = new ResizeObserver(() => {
            updateMenuAnchor();
        });

        if (playerElement) {
            resizeObserver.observe(playerElement);
        }

        window.addEventListener('resize', updateMenuAnchor);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateMenuAnchor);
        };
    }, [controller.container, isMenuRendered, state.isMenuOpen]);

    return (
        <>
            <C2paFrictionOverlay
                isVisible={state.isFrictionOverlayVisible}
                scope={state.consentScope}
                countdownSeconds={state.consentCountdownSeconds}
                onWatchAnyway={onWatchAnyway}
            />
            <C2paAuthenticityLabel
                label={state.authenticityLabel}
                onClick={controller.onAuthenticityLabelClick}
            />
            {/* Mounted only while open, so the log's subscription and its row
                rendering cost nothing for the viewers who never open it. */}
            {state.isDebugOpen ? (
                <C2paDebugConsole onClose={() => controller.setState({ isDebugOpen: false })} />
            ) : null}
            {isMenuRendered ? (
                <div className={`c2pa-player-menu-overlay c2pa-player-menu-overlay--${menuRenderPhase}`}>
                    <div className="vjs-menu">
                        <div
                            ref={menuShellRef}
                            className="c2pa-menu-panel-shell"
                            style={menuAnchorStyle}
                        >
                            <C2paMenuRoot
                                c2paStatus={state.c2paStatus}
                                timeline={state.timeline}
                                resetKey={state.menuResetKey}
                                selectedSegment={state.selectedSegment}
                                onBackToLive={() => controller.setState({ selectedSegment: null })}
                            />
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

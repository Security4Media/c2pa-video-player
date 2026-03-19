import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { C2PAPlayerRootController } from './C2PAPlayerRoot.types';
import { C2paFrictionOverlay } from './C2paFrictionModal/C2paFrictionOverlay';
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
    const menuContentRef = useRef<HTMLUListElement | null>(null);
    const state = useSyncExternalStore(
        controller.subscribe,
        controller.getState,
        controller.getState,
    );

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
        const menuElement = menuContentRef.current;
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

    return (
        <>
            <C2paFrictionOverlay
                isVisible={state.isFrictionOverlayVisible}
                onWatchAnyway={onWatchAnyway}
            />
            {isMenuRendered ? (
                <div className={`c2pa-player-menu-overlay c2pa-player-menu-overlay--${menuRenderPhase}`}>
                    <div className="vjs-menu">
                        <ul className="vjs-menu-content" role="menu" ref={menuContentRef}>
                            <C2paMenuRoot
                                c2paStatus={state.c2paStatus}
                                timeline={state.timeline}
                                resetKey={state.menuResetKey}
                            />
                        </ul>
                    </div>
                </div>
            ) : null}
        </>
    );
}

import { useSyncExternalStore } from 'react';
import type { C2PAPlayerRootController } from './C2PAPlayerRoot.types';
import { C2paFrictionOverlay } from './C2paFrictionModal/C2paFrictionOverlay';
import { C2paMenuRoot } from './C2paMenu/C2paMenuRoot';

interface C2PAPlayerRootProps {
    controller: C2PAPlayerRootController;
    onWatchAnyway: () => void;
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
    const state = useSyncExternalStore(
        controller.subscribe,
        controller.getState,
        controller.getState,
    );

    return (
        <>
            <C2paFrictionOverlay
                isVisible={state.isFrictionOverlayVisible}
                onWatchAnyway={onWatchAnyway}
            />
            {state.isMenuOpen ? (
                <div className="c2pa-player-menu-overlay">
                    <div className="vjs-menu">
                        <ul className="vjs-menu-content" role="menu">
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

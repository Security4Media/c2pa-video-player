import { C2paFrictionOverlay } from './C2paFrictionModal/C2paFrictionOverlay';

interface C2PAPlayerRootProps {
    isFrictionOverlayVisible: boolean;
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
    isFrictionOverlayVisible,
    onWatchAnyway,
}: C2PAPlayerRootProps) {
    return (
        <C2paFrictionOverlay
            isVisible={isFrictionOverlayVisible}
            onWatchAnyway={onWatchAnyway}
        />
    );
}

interface C2paFrictionOverlayProps {
    isVisible: boolean;
    onWatchAnyway: () => void;
}

/**
 * React presentation component for the invalid-manifest friction overlay.
 *
 * @param isVisible - Whether the overlay should be visible
 * @param onWatchAnyway - Callback fired when the user accepts playback
 * @returns Overlay markup mounted inside the player container
 */
export function C2paFrictionOverlay({
    isVisible,
    onWatchAnyway,
}: C2paFrictionOverlayProps) {
    return (
        <div
            className="friction-overlay"
            style={{ display: isVisible ? 'block' : 'none' }}
        >
            <p>
                The information in this video&apos;s Content Credentials is no longer trustworthy and the video&apos;s
                history cannot be confirmed.
            </p>
            <button
                type="button"
                className="friction-button"
                onClick={onWatchAnyway}
            >
                Watch Anyway
            </button>
        </div>
    );
}

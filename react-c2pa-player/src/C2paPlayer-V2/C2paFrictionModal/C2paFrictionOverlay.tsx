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

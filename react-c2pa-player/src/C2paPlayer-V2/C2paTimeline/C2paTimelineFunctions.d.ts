interface TimelineComponentLike {
    el(): HTMLElement;
}

export function getTimelineFunctions(): {
    getCompromisedRegions: import('../C2paMenu/C2paMenu.types').GetCompromisedRegions;
    handleC2PAValidation: (
        verificationStatus: string,
        currentTime: number,
        c2paControlBar: TimelineComponentLike,
    ) => void;
    handleOnSeeked: (time: number) => boolean;
    handleOnSeeking: (
        time: number,
        playbackStarted: boolean,
        lastPlaybackTime: number,
        isMonolithic: boolean,
        c2paControlBar: TimelineComponentLike,
        videoPlayer: import('../C2paMenu/C2paMenu.types').VideoJsPlayerLike,
    ) => [boolean, number];
    updateC2PATimeline: (
        currentTime: number,
        videoPlayer: import('../C2paMenu/C2paMenu.types').VideoJsPlayerLike,
        c2paControlBar: TimelineComponentLike,
    ) => void;
};

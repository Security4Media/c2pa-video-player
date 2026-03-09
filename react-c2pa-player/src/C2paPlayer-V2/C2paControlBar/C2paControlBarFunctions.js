export let initializeC2PAControlBar = function (videoPlayer) {
    console.log('[C2PAControlBar] Initializing C2PA control bar');
    console.log('[C2PAControlBar] videojs available:', typeof videojs !== 'undefined');

    //The playback progress bar from video-js is extended to support c2pa validation
    const LoadProgressBar = videojs.getComponent('LoadProgressBar');

    //The update event is overriden to support c2pa validation
    class C2PALoadProgressBar extends LoadProgressBar {
        update(e) { }
    }

    videojs.registerComponent('C2PALoadProgressBar', C2PALoadProgressBar);
    console.log('[C2PAControlBar] Registered C2PALoadProgressBar component');

    videoPlayer.controlBar.progressControl.seekBar.addChild(
        'C2PALoadProgressBar'
    );
    console.log('[C2PAControlBar] Added C2PALoadProgressBar to seekBar');

    //The progress timeline is managed directly, so we set this to transparent
    const c2paTimeline =
        videoPlayer.controlBar.progressControl.seekBar.getChild(
            'C2PALoadProgressBar'
        );

    console.log('[C2PAControlBar] Retrieved c2paTimeline:', c2paTimeline);

    c2paTimeline.el().style.width = '100%';
    c2paTimeline.el().style.backgroundColor = 'transparent';
};
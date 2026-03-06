# React C2PA Player - Integration Guide

## Overview

The React C2PA Player is now a fully reusable component library that provides interactive UI elements for C2PA content verification. The player automatically responds to manifest data extracted from videos.

## New Interactive Features

### 1. **C2PA Status Badge** (Top-Right Corner)
- **Dynamic Icon & Color**: Changes based on validation state
  - ✓ Green: Trusted content
  - ✓ Cyan: Valid content  
  - ✗ Red: Invalid content
  - ? Yellow: Unknown status
- **Hover Details**: Shows manifest information on hover
  - Claim generator
  - Content title
  - Number of assertions
  - Verification status

### 2. **Timeline Segment Visualizer** (Bottom Center)
- **Real-time Status Indicator**: Pulses with current validation state
- **Time Display**: Shows current playback time / total duration
- **Color-coded Labels**: Same color scheme as status badge

## Reusable Components

All components are exported and can be used independently:

```typescript
import {
  // Components
  C2PAPlayer,
  C2PAStatusBadge,
  TimelineSegmentVisualizer,
  C2PAFrictionOverlay,
  PlayerPage,
  
  // Hooks
  useC2PAManifest,
  useC2PATimeline,
  useC2PAValidation,
  useC2PASeekHandler,
  useVideoPlayerInitializer,
  
  // Types
  C2PAStatus
} from './src/index';
```

## Integration Methods

### Method 1: Direct HTML Integration (Current Setup)

The easiest way to integrate is through the HTML page (as in `cawg_c2pa_player.html`):

```html
<!-- Load React C2PA assets -->
<link href="../../react-c2pa-player/dist/assets/index.css" rel="stylesheet" />
<script type="module" src="../../react-c2pa-player/dist/assets/index.js"></script>

<!-- React root element -->
<div id="c2pa-player-root"></div>

<!-- Your video element -->
<video id="videoPlayer" class="video-js" controls="true"></video>

<script type="module">
  // Initialize C2PA plugin
  import { c2pa_init } from './c2pa-v2-monolithic-plugin.js';
  
  function setupC2PAPlayer(url) {
    // Create Video.js player
    const videoJsPlayer = videojs(video, options);
    
    // Initialize React C2PA UI
    if (window.initReactC2PAPlayer) {
      window.initReactC2PAPlayer(videoJsPlayer, video, true);
    }
    
    // Set video source
    video.src = url;
  }
  
  function playbackUpdate(e) {
    // Update React UI with C2PA status
    if (window.c2paPlayerUpdate) {
      window.c2paPlayerUpdate(e.c2pa_status);
    }
  }
  
  // Initialize C2PA validation
  video.addEventListener('canplay', function() {
    c2pa_init(video, playbackUpdate);
  });
</script>
```

### Method 2: As a React Component Library

For React projects, import components directly:

```tsx
import { C2PAPlayer, useC2PAManifest } from 'react-c2pa-player';

function MyVideoApp() {
  const [player, setPlayer] = useState(null);
  const [videoElement, setVideoElement] = useState(null);
  
  useEffect(() => {
    // Initialize your video player
    const vjsPlayer = videojs('my-video');
    setPlayer(vjsPlayer);
    setVideoElement(document.getElementById('my-video'));
  }, []);
  
  return (
    <>
      <video id="my-video" />
      {player && videoElement && (
        <C2PAPlayer 
          videoPlayer={player} 
          videoElement={videoElement} 
          isMonolithic={true} 
        />
      )}
    </>
  );
}
```

### Method 3: Using the Video Initializer Hook

For full control, use the `useVideoPlayerInitializer` hook:

```tsx
import { useVideoPlayerInitializer } from 'react-c2pa-player';

function VideoLoader() {
  const { initializePlayer, isLoading, currentUrl } = useVideoPlayerInitializer({
    onPlayerCreated: (player, element) => {
      console.log('Player ready!');
    },
    onError: (error) => {
      console.error('Player error:', error);
    }
  });
  
  const loadVideo = (url: string) => {
    const videoElement = document.getElementById('my-video') as HTMLVideoElement;
    initializePlayer(url, videoElement);
  };
  
  return (
    <button onClick={() => loadVideo('/video.mp4')}>
      Load Video
    </button>
  );
}
```

## Custom UI Components

### Using C2PAStatusBadge Separately

```tsx
import { C2PAStatusBadge, useC2PAManifest } from 'react-c2pa-player';

function MyPlayer() {
  const { validationState, isVerified, validationDetails } = useC2PAManifest();
  
  return (
    <C2PAStatusBadge
      validationState={validationState}
      isVerified={isVerified}
      details={validationDetails}
    />
  );
}
```

### Using TimelineSegmentVisualizer

```tsx
import { TimelineSegmentVisualizer } from 'react-c2pa-player';

function VideoTimeline({ currentTime, duration, validationState }) {
  return (
    <TimelineSegmentVisualizer
      validationState={validationState}
      currentTime={currentTime}
      duration={duration}
    />
  );
}
```

## Manifest Data Structure

The `useC2PAManifest` hook provides access to:

```typescript
{
  manifestData: any;           // Full manifest store data
  validationState: 'Trusted' | 'Valid' | 'Invalid' | 'Unknown';
  validationDetails: string[]; // Human-readable details
  isVerified: boolean;         // Overall verification status
  updateManifest: (c2paStatus: C2PAStatus) => void;
}
```

## Customization

### Styling Components

All components accept a `className` prop for custom styling:

```tsx
<C2PAStatusBadge 
  className="my-custom-badge"
  validationState={validationState}
  isVerified={isVerified}
/>
```

### Positioning

Components use fixed positioning by default. To change:

```tsx
// Override inline styles
<C2PAStatusBadge 
  style={{ position: 'absolute', top: '50px', right: '50px' }}
  // ... other props
/>
```

## Window API

When loaded via script tag, the following globals are available:

```typescript
// Initialize the React C2PA player
window.initReactC2PAPlayer(
  videoPlayer: any,      // Video.js player instance
  videoElement: HTMLVideoElement,  // Native video element
  isMonolithic: boolean  // Whether using monolithic mode
): void;

// Update C2PA status during playback
window.c2paPlayerUpdate(
  c2paStatus: C2PAStatus  // Current validation status
): void;
```

## Development Workflow

1. **Make changes** to React components in `src/`
2. **Build** the project:
   ```bash
   cd react-c2pa-player
   pnpm run build
   ```
3. **Test** by opening the HTML page:
   ```
   http://localhost:9000/dash-player-js/monolithic-v2/cawg_c2pa_player.html
   ```
4. **Refresh** the browser to see changes

## File Structure

```
react-c2pa-player/
├── src/
│   ├── components/
│   │   ├── C2PAPlayer.tsx                 # Main orchestrator
│   │   ├── C2PAStatusBadge.tsx            # Status indicator (top-right)
│   │   ├── TimelineSegmentVisualizer.tsx  # Timeline status (bottom)
│   │   ├── C2PAFrictionOverlay.tsx        # Warning overlay
│   │   └── PlayerPage.tsx                 # Full page component
│   ├── hooks/
│   │   ├── useC2PAManifest.ts            # Manifest data management
│   │   ├── useC2PATimeline.ts            # Timeline visualization
│   │   ├── useC2PAValidation.ts          # Validation state
│   │   ├── useC2PASeekHandler.ts         # Seek event handling
│   │   └── useVideoPlayerInitializer.ts  # Player initialization
│   ├── types/
│   │   └── c2pa.types.ts                 # TypeScript definitions
│   ├── App.tsx                            # Root app component
│   ├── main.tsx                           # Entry point
│   └── index.ts                           # Public API exports
├── dist/                                  # Built assets
│   ├── assets/
│   │   ├── index.js                      # Main bundle
│   │   └── index.css                     # Styles
│   └── index.html
└── INTEGRATION.md                         # This file
```

## Examples

See `dash-player-js/monolithic-v2/cawg_c2pa_player.html` for a complete working example.

## Troubleshooting

### Status Badge Not Appearing
- Check that `window.initReactC2PAPlayer` is called after video player creation
- Verify that playback has started (badge only shows after playback begins)

### Timeline Not Updating
- Ensure `window.c2paPlayerUpdate` is called during playback
- Check that C2PA plugin is properly initialized

### Console Errors
- Look for `[React C2PA]` prefixed messages
- Verify Video.js is loaded before React app initialization

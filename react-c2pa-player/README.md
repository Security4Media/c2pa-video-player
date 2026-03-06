# React C2PA Player

A reusable React component library for C2PA content verification with interactive UI elements that respond to manifest data extracted from videos.

## ✨ Key Features

### 🎨 Interactive UI Components

- **C2PA Status Badge** (top-right corner)
  - Real-time validation state with dynamic colors
  - Hover tooltip showing manifest details
  - Automatically updates based on C2PA data
  
- **Timeline Segment Visualizer** (bottom-center)
  - Pulsing status indicator with validation state
  - Real-time playback progress display
  - Color-coded validation states

- **Friction Overlay**
  - Warning modal for invalid/untrusted content
  - User acknowledgment required before playback

### 🔧 Reusable Architecture

All components and hooks are exported and can be used independently in other projects:

```typescript
// Components
import { 
  C2PAPlayer,
  C2PAStatusBadge,
  TimelineSegmentVisualizer,
  C2PAFrictionOverlay
} from 'react-c2pa-player';

// Hooks
import {
  useC2PAManifest,
  useC2PATimeline,
  useC2PAValidation,
  useVideoPlayerInitializer
} from 'react-c2pa-player';
```

### 📊 Validation States & Colors

| State | Color | Icon | Description |
|-------|-------|------|-------------|
| Trusted | Green (#28a745) | ✓ | Fully verified content |
| Valid | Cyan (#17a2b8) | ✓ | Valid but not trusted |
| Invalid | Red (#dc3545) | ✗ | Failed verification |
| Unknown | Yellow (#ffc107) | ? | Status pending |

## 🚀 Quick Start

### Option 1: HTML Integration (Current Setup)

Load the pre-built React app in your HTML page:

```html
<!-- Load React C2PA Player -->
<link href="../../react-c2pa-player/dist/assets/index.css" rel="stylesheet" />
<script type="module" src="../../react-c2pa-player/dist/assets/index.js"></script>

<!-- React root element -->
<div id="c2pa-player-root"></div>

<script type="module">
  // Your video setup
  function setupC2PAPlayer(url) {
    const videoJsPlayer = videojs(video, options);
    
    // Initialize React C2PA UI
    if (window.initReactC2PAPlayer) {
      window.initReactC2PAPlayer(videoJsPlayer, video, true);
    }
  }
  
  // Update React UI with C2PA status
  function playbackUpdate(e) {
    if (window.c2paPlayerUpdate) {
      window.c2paPlayerUpdate(e.c2pa_status);
    }
  }
</script>
```

### Option 2: As React Component Library

Use directly in React projects:

```tsx
import { C2PAPlayer } from 'react-c2pa-player';

function MyVideoApp() {
  const [player, setPlayer] = useState(null);
  const [videoElement, setVideoElement] = useState(null);
  
  return (
    <C2PAPlayer 
      videoPlayer={player} 
      videoElement={videoElement} 
      isMonolithic={true} 
    />
  );
}
```

## 📦 Installation & Development

### Prerequisites

- Node.js 18+ (recommended: `nvm use stable`)
- pnpm package manager

### Setup

```bash
# Install dependencies
pnpm install

# Build for production
pnpm run build

# Development mode with hot reload
pnpm dev

# Run tests
pnpm test
```

### Build Output

The build creates optimized files in `dist/`:
- `dist/assets/index.js` - Main JavaScript bundle (~205 KB)
- `dist/assets/index.css` - Styles
- `dist/index.html` - HTML template

## 📂 Project Structure

```
react-c2pa-player/
├── src/
│   ├── components/
│   │   ├── C2PAPlayer.tsx                 # Main orchestrator component
│   │   ├── C2PAStatusBadge.tsx            # Status indicator (top-right)
│   │   ├── TimelineSegmentVisualizer.tsx  # Timeline status (bottom)
│   │   ├── C2PAFrictionOverlay.tsx        # Warning modal
│   │   └── PlayerPage.tsx                 # Full page wrapper
│   ├── hooks/
│   │   ├── useC2PAManifest.ts            # Manifest data management
│   │   ├── useC2PATimeline.ts            # Timeline segment logic
│   │   ├── useC2PAValidation.ts          # Validation state handling
│   │   ├── useC2PASeekHandler.ts         # Seek event coordination
│   │   └── useVideoPlayerInitializer.ts  # Player initialization
│   ├── types/
│   │   └── c2pa.types.ts                 # TypeScript definitions
│   ├── App.tsx                            # Root component
│   ├── main.tsx                           # Entry point
│   └── index.ts                           # Public API exports
├── dist/                                  # Built assets (auto-generated)
├── INTEGRATION.md                         # Integration guide
├── COMPONENTS.md                          # Component documentation
├── README.md                              # This file
└── package.json
```

## 🔌 Window API

When loaded via script tag, these global functions are exposed:

```typescript
// Initialize the React C2PA player
window.initReactC2PAPlayer(
  videoPlayer: any,              // Video.js player instance
  videoElement: HTMLVideoElement, // Native video element
  isMonolithic: boolean          // Monolithic mode flag
): void;

// Update C2PA validation status during playback
window.c2paPlayerUpdate(
  c2paStatus: C2PAStatus  // Current validation status
): void;
```

## 📖 Documentation

- **[INTEGRATION.md](./INTEGRATION.md)** - Complete integration guide with examples
- **[COMPONENTS.md](./COMPONENTS.md)** - Detailed component and hook reference

## 🛠 Tech Stack

- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 5.4** - Build tool
- **Video.js 8.3** - Video player library
- **C2PA Web SDK 0.5** - Content credentials verification

## 🎯 Use Cases

- ✅ Embed C2PA verification in existing HTML pages
- ✅ Build standalone React video players with C2PA
- ✅ Create custom C2PA verification interfaces
- ✅ Integrate C2PA status indicators in dashboards
- ✅ Prototype C2PA validation workflows

## 🧩 Component Examples

### Using C2PAStatusBadge Independently

```tsx
import { C2PAStatusBadge, useC2PAManifest } from 'react-c2pa-player';

function VideoStatus() {
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

### Using Video Initializer Hook

```tsx
import { useVideoPlayerInitializer } from 'react-c2pa-player';

function VideoLoader() {
  const { initializePlayer, isLoading } = useVideoPlayerInitializer({
    onPlayerCreated: (player) => console.log('Ready!'),
    onError: (error) => console.error(error)
  });
  
  return (
    <button onClick={() => initializePlayer('/video.mp4', videoElement)}>
      {isLoading ? 'Loading...' : 'Load Video'}
    </button>
  );
}
```

## 🔄 Development Workflow

1. **Make changes** to components in `src/`
2. **Build**: `pnpm run build`
3. **Test** in HTML page: Open `http://localhost:9000/dash-player-js/monolithic-v2/cawg_c2pa_player.html`
4. **Refresh** browser to see changes

## 🐛 Troubleshooting

### Status badge not appearing
- Ensure playback has started (badge only shows after playback begins)
- Check browser console for `[React C2PA]` messages
- Verify `window.initReactC2PAPlayer` was called

### Timeline not updating
- Confirm `window.c2paPlayerUpdate` is called during playback
- Check that C2PA plugin is properly initialized

### TypeScript errors
- Run `pnpm install` to ensure dependencies are current
- Check that Video.js types are available

## 📝 License

Part of the EBU C2PA Player project.

## 🤝 Integration Example

See [dash-player-js/monolithic-v2/cawg_c2pa_player.html](../dash-player-js/monolithic-v2/cawg_c2pa_player.html) for a complete working example of HTML integration.

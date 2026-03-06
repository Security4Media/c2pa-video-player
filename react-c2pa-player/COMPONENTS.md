# Interactive UI Components

## Overview

This document describes the interactive UI components that respond to C2PA manifest data.

## C2PAStatusBadge

A floating badge that displays the current C2PA validation status with interactive hover details.

### Features

- **Dynamic Colors**: Automatically changes color based on validation state
  - Green (#28a745): Trusted content
  - Cyan (#17a2b8): Valid content
  - Red (#dc3545): Invalid content
  - Yellow (#ffc107): Unknown status

- **Interactive Icon**: Shows validation symbol (✓, ✗, ?)

- **Hover Tooltip**: Displays detailed manifest information:
  - Claim generator
  - Content title
  - Number of assertions
  - Verification status
  - Any errors encountered

### Usage

```tsx
<C2PAStatusBadge
  validationState="Trusted"
  isVerified={true}
  details={[
    'Generator: Adobe Photoshop',
    'Title: Sample Image',
    'Assertions: 5'
  ]}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `validationState` | `'Trusted' \| 'Valid' \| 'Invalid' \| 'Unknown'` | Current validation state |
| `isVerified` | `boolean` | Whether content is verified |
| `details` | `string[]` | Array of detail strings to show on hover |
| `className` | `string` | Optional CSS class for styling |

### Position

Fixed at top-right corner (20px from top and right edges).

---

## TimelineSegmentVisualizer

A real-time status indicator that shows the current validation state with playback time.

### Features

- **Pulsing Status Indicator**: Animated colored circle that pulses based on validation state
- **Status Label**: Human-readable text showing current status
- **Time Display**: Shows `currentTime / duration` in monospace font
- **Color-coded**: Matches C2PAStatusBadge color scheme

### Usage

```tsx
<TimelineSegmentVisualizer
  validationState="Valid"
  currentTime={45.2}
  duration={120.0}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `validationState` | `'Trusted' \| 'Valid' \| 'Invalid' \| 'Unknown'` | - | Current validation state |
| `currentTime` | `number` | `0` | Current playback time in seconds |
| `duration` | `number` | `100` | Total video duration in seconds |

### Position

Fixed at bottom-center (20px from bottom, horizontally centered).

### Animations

The status indicator includes a CSS pulse animation:
- Opacity cycles between 1 and 0.7
- Scale cycles between 1 and 0.95
- 2 second loop duration

---

## C2PAPlayer

The main orchestrator component that manages all C2PA UI elements and validation logic.

### Features

- **Composition**: Combines all sub-components and hooks
- **State Management**: Coordinates validation, timeline, and seek handling
- **Manifest Updates**: Processes C2PA status updates from video playback
- **Conditional Rendering**: Shows UI elements only when playback has started

### Usage

```tsx
<C2PAPlayer
  videoPlayer={videojsInstance}
  videoElement={videoHTMLElement}
  isMonolithic={true}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `videoPlayer` | `any` | Video.js player instance |
| `videoElement` | `HTMLVideoElement` | Native HTML video element |
| `isMonolithic` | `boolean` | Whether using monolithic C2PA mode |

### Child Components

- `C2PAFrictionOverlay`: Warning for untrusted content
- `C2PAStatusBadge`: Status indicator (shown after playback starts)
- `TimelineSegmentVisualizer`: Timeline status (shown after playback starts)

---

## C2PAFrictionOverlay

A modal overlay that warns users about invalid or untrusted content before playback.

### Features

- **Blocking Playback**: Prevents video from playing until user acknowledges
- **Warning Message**: Clear indication of content trust issues
- **User Action Required**: "Continue Anyway" button to proceed

### Usage

```tsx
<C2PAFrictionOverlay
  videoPlayer={videojsInstance}
  videoElement={videoHTMLElement}
  isManifestInvalid={true}
  playbackStarted={false}
  onPlaybackStart={() => setPlaybackStarted(true)}
/>
```

### Props

| Prop | Type | Description |
|------|------|-------------|
| `videoPlayer` | `any` | Video.js player instance |
| `videoElement` | `HTMLVideoElement` | Native video element |
| `isManifestInvalid` | `boolean` | Whether manifest is invalid |
| `playbackStarted` | `boolean` | Whether user has started playback |
| `onPlaybackStart` | `() => void` | Callback when user starts playback |

---

## Hooks

### useC2PAManifest

Manages C2PA manifest data and validation state.

```tsx
const {
  manifestData,        // Full manifest store
  validationState,     // Current state
  validationDetails,   // Human-readable details
  isVerified,          // Overall verification
  updateManifest       // Update function
} = useC2PAManifest();
```

### useC2PATimeline

Manages timeline segment visualization with color coding.

```tsx
const {
  segments,           // Array of timeline segments
  addSegment,         // Add a new segment
  updateTimeline,     // Update existing segments
  clearSegments,      // Clear all segments
  handleSeek          // Handle seek events
} = useC2PATimeline({ videoPlayer, isMonolithic });
```

### useC2PAValidation

Handles validation state and playback updates.

```tsx
const {
  currentValidationState,    // Current state
  lastCheckedTime,           // Last validation time
  resetValidation,           // Reset state
  handlePlaybackUpdate       // Process C2PA status
} = useC2PAValidation({
  videoPlayer,
  isManifestInvalid,
  addSegment,
  updateTimeline
});
```

### useC2PASeekHandler

Manages seeking events and state resets.

```tsx
const {
  seeking,              // Whether currently seeking
  lastSeekTime          // Last seek timestamp
} = useC2PASeekHandler({
  videoPlayer,
  playbackStarted,
  handleTimelineSeek,
  clearSegments,
  resetValidation
});
```

### useVideoPlayerInitializer

Initializes video player with C2PA support.

```tsx
const {
  initializePlayer,    // Initialize function
  isLoading,           // Loading state
  currentUrl           // Current video URL
} = useVideoPlayerInitializer({
  onPlayerCreated: (player, element) => {},
  onError: (error) => {}
});
```

---

## Styling

All components use inline styles for portability, but accept `className` and `style` props for customization.

### Color Palette

```css
/* Trusted */
--c2pa-trusted: #28a745;

/* Valid */
--c2pa-valid: #17a2b8;

/* Invalid */
--c2pa-invalid: #dc3545;

/* Unknown */
--c2pa-unknown: #ffc107;
```

### Z-Index Layering

- Status Badge: `z-index: 10000`
- Timeline Visualizer: `z-index: 9999`
- Friction Overlay: Default (blocks video)

---

## Interaction Flow

1. Video loads → React app initializes
2. User clicks "Load Stream" → `setupC2PAPlayer()` called
3. Video.js player created → `window.initReactC2PAPlayer()` called
4. C2PA plugin initializes → Listens for validation events
5. Playback starts → Status badge and timeline appear
6. During playback → `window.c2paPlayerUpdate()` called continuously
7. Manifest updates → UI components re-render with new colors/states
8. User seeks → Timeline and validation reset
9. Validation completes → Final state displayed

---

## Accessibility

- All interactive elements support keyboard navigation
- Status badge provides hover details for screen readers
- Color choices meet WCAG AA contrast requirements
- Animation can be disabled via `prefers-reduced-motion`

---

## Performance

- Components use React hooks for efficient re-rendering
- Inline styles minimize CSS bundle size
- Conditional rendering prevents unnecessary DOM updates
- Debounced updates during high-frequency events

# Video.js C2PA Overlay - Feature Documentation

## Overview

A sophisticated, reusable UI component that displays C2PA content credentials **directly on the Video.js player** as an overlay, similar to how Video.js control bars work.

## ✨ New Components

### 1. **C2PAControlButton** - Video.js Control Bar Button

A button integrated into the Video.js control bar that:
- Shows the Content Credentials icon from `/dash-player-js/assets/icons/`
- Displays a status indicator dot with validation color
- Has hover tooltip showing current validation state
- Positioned before the fullscreen button
- Toggles the C2PA data overlay

**Features:**
- Dynamic icon based on validation state:
  - `cr-icon-whitebg.svg` for Trusted/Valid
  - `cr-invalid-whitebg.svg` for Invalid
- Color-coded status dot (green/cyan/red/yellow)
- Hover tooltip: "Content Credentials: {state}"
- Integrated styling matching Video.js theme

### 2. **C2PADataOverlay** - Full-Screen Data Panel

A full-screen overlay on the video player showing detailed C2PA information:

**Header:**
- Content Credentials icon
- Title and subtitle
- Close button (×)

**Validation Banner:**
- Large status indicator with icon (✓, ✗, ?)
- Color-coded background matching validation state
- Status text and label

**Data Fields:**
- ✓ Issued by (signature issuer)
- ✓ Issued on (formatted date)
- ✓ App or device used (claim generator)
- ✓ Name (content authors)
- ✓ Website (clickable link)
- ✓ Publisher Identity (CAWG) - Collapsible JSON viewer
- ✓ CAWG Validation Status
- ✓ C2PA Validation Status

**Features:**
- Dark overlay (85% opacity) for readability
- Scrollable content area
- Collapsible CAWG identity section
- Clickable website links
- Professional typography and spacing
- Footer with verification note

## 🎨 Visual Design

### Control Button in Video.js Bar

```
┌──────────────────────────────────────────────────┐
│ Video Player                                     │
│ ┌──────────────────────────────────────────────┐│
│ │                                              ││
│ │           Video Content                      ││
│ │                                              ││
│ └──────────────────────────────────────────────┘│
│ ▶ ━━━━━━●━━━━━━━━━━━━━ 🔊 [CR•] ⛶            │
│   ^control bar                     ^CR button    │
└──────────────────────────────────────────────────┘
```

### Overlay View

```
┌──────────────────────────────────────────────────┐
│ ┌ Content Credentials                        × │
│ │ C2PA Verification Details                    │
│ ├────────────────────────────────────────────── │
│ │ ✓ Valid                                      │
│ │ C2PA Validation Status                       │
│ ├────────────────────────────────────────────── │
│ │ Issued by: Adobe Systems                     │
│ │ Issued on: Mar 6, 2026                       │
│ │ App or device used: Adobe Photoshop 2024     │
│ │ Name: John Doe                               │
│ │ Website: https://example.com                 │
│ │ ▶ Publisher Identity (CAWG)                  │
│ │ CAWG Validation Status: Present              │
│ └────────────────────────────────────────────── │
└──────────────────────────────────────────────────┘
```

## 🔧 Technical Implementation

### Component Architecture

```
C2PAPlayer
├── C2PAControlButton (in Video.js control bar)
│   ├── Icon (cr-icon or cr-invalid)
│   ├── Status Dot (color-coded)
│   └── Hover Tooltip
└── C2PADataOverlay (full-screen on player)
    ├── Header (icon, title, close button)
    ├── Validation Banner (status indicator)
    ├── Data Fields (scrollable)
    │   ├── Issuer
    │   ├── Date
    │   ├── Claim Generator
    │   ├── Authors
    │   ├── Website
    │   ├── CAWG Identity (collapsible)
    │   └── Validation Statuses
    └── Footer
```

### State Management

```typescript
const [showOverlay, setShowOverlay] = useState(false);
const [currentC2PAStatus, setCurrentC2PAStatus] = useState<C2PAStatus | null>(null);
```

### Data Extraction

The overlay extracts data from C2PA manifest:

```typescript
const manifestStore = c2paStatus.details?.video?.manifestStore;
const activeManifest = manifestStore.manifests[manifestStore.active_manifest];

// Extracted fields:
- issuer: signature_info.issuer
- date: signature_info.time (formatted)
- claimGenerator: from c2pa.actions assertion
- authors: from stds.schema-org.CreativeWork assertion
- website: from CreativeWork assertion
- cawgIdentity: from cawg.publish_identity.v1 assertion
- c2paValidation: validation_state
- cawgValidation: presence of CAWG assertion
```

## 📦 Usage

### Basic Integration (Automatic)

The overlay is automatically integrated when using `C2PAPlayer`:

```tsx
<C2PAPlayer 
  videoPlayer={videojsInstance}
  videoElement={videoElement}
  isMonolithic={true}
/>
```

### Standalone Usage

Use components independently:

```tsx
import { C2PAControlButton, C2PADataOverlay } from 'react-c2pa-player';

function MyPlayer() {
  const [showOverlay, setShowOverlay] = useState(false);
  const [c2paStatus, setC2paStatus] = useState(null);

  return (
    <>
      <C2PAControlButton
        videoPlayer={player}
        onToggle={() => setShowOverlay(!showOverlay)}
        validationState="Valid"
      />
      
      {showOverlay && (
        <C2PADataOverlay
          c2paStatus={c2paStatus}
          isVisible={showOverlay}
          onToggle={() => setShowOverlay(false)}
        />
      )}
    </>
  );
}
```

## 🎯 Features

### Interactive Elements

1. **Control Button**
   - Click to toggle overlay
   - Hover for status tooltip
   - Visual feedback on hover

2. **Overlay**
   - Click outside to close (via close button)
   - Scroll for long content
   - Expand/collapse CAWG identity
   - Clickable website links

### Validation States

| State | Icon | Color | Dot |
|-------|------|-------|-----|
| Trusted | cr-icon | Green (#28a745) | Green |
| Valid | cr-icon | Cyan (#17a2b8) | Cyan |
| Invalid | cr-invalid | Red (#dc3545) | Red |
| Unknown | cr-icon | Yellow (#ffc107) | Yellow |

### Data Formatting

- **Dates**: Formatted as "Mar 6, 2026"
- **Authors**: Comma-separated list
- **Website**: Clickable link with hover underline
- **CAWG Identity**: JSON formatted with syntax highlighting
- **Missing Data**: Fields hidden if not present

## 🔄 User Flow

1. **Video loads** → C2PA player initializes
2. **Playback starts** → Control button appears in Video.js bar
3. **User clicks CR button** → Overlay opens full-screen on player
4. **Overlay shows** → All C2PA data displayed
5. **User can**:
   - Scroll through data
   - Expand CAWG identity
   - Click website link
   - Close overlay
6. **Overlay closes** → Returns to video playback

## 🎨 Styling

### Control Button

```css
.vjs-control.vjs-button {
  width: 3em;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid rgba(255,255,255,0.1);
}
```

### Overlay

```css
.c2pa-data-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 100;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
}
```

### Color System

```css
--c2pa-trusted: #28a745;
--c2pa-valid: #17a2b8;
--c2pa-invalid: #dc3545;
--c2pa-unknown: #ffc107;
--c2pa-overlay-bg: rgba(0, 0, 0, 0.85);
--c2pa-text-primary: white;
--c2pa-text-secondary: rgba(255, 255, 255, 0.7);
```

## 📱 Responsive Design

- Scrollable content for long manifest data
- Flexible layout adapts to player size
- Touch-friendly close button
- Readable font sizes

## ♿ Accessibility

- High contrast colors (WCAG AA compliant)
- Semantic HTML structure
- Keyboard accessible (via Video.js controls)
- Screen reader friendly labels
- Focus indicators on interactive elements

## 🔒 Security

- External links open in new tab with `rel="noopener noreferrer"`
- No executable code in manifest display
- JSON data sanitized for display
- XSS protection via React

## 🎭 Animations

- Button hover: Background fade in/out (0.2s)
- Tooltip: Fade in on hover
- CAWG section: Smooth expand/collapse
- Icon filter: Brightness on hover

## 📊 Performance

- Lazy rendering (only when overlay is open)
- Memoized data extraction
- Efficient React rendering
- No unnecessary re-renders
- Bundle size: ~9KB additional

## 🐛 Troubleshooting

### Button not appearing
- Check that playback has started
- Verify Video.js control bar exists
- Ensure React app is initialized

### Overlay positioning issues
- Overlay uses absolute positioning within video container
- Z-index: 100 (above video, below controls when hovered)

### Data not showing
- Check C2PA status is valid
- Verify manifest structure
- Check browser console for errors

### Icons not loading
- Verify icon paths: `/dash-player-js/assets/icons/`
- Check file permissions
- Ensure HTTP server is running

## 🚀 Future Enhancements

- [ ] Keyboard shortcuts (Esc to close)
- [ ] Print/export validation report
- [ ] Deep link to specific fields
- [ ] Timeline integration showing changes
- [ ] Multi-language support
- [ ] Dark/light theme toggle
- [ ] Animation preferences
- [ ] Social media account display
- [ ] Location data visualization

## 📝 Example Integration

See the complete example in:
`/home/taddist/EBU/ebu-c2pa-player/dash-player-js/monolithic-v2/cawg_c2pa_player.html`

Click "Load Stream" → Watch video → Click CR button in control bar → See overlay!

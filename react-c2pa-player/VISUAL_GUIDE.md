# React C2PA Player - Visual Guide

## 🎨 UI Component Layout

```
┌─────────────────────────────────────────────────────────────┐
│                                                  ┌─────────┐ │
│                                                  │ C2PA    │ │ ← Status Badge
│                                                  │ ✓ Valid │ │   (Top-Right)
│  Video Player Area                               │         │ │
│                                                  └─────────┘ │
│  ┌─────────────────────────────────────────┐                │
│  │                                         │                │
│  │                                         │                │
│  │         Video Content Here              │                │
│  │                                         │                │
│  │                                         │                │
│  └─────────────────────────────────────────┘                │
│                                                              │
│                   ┌──────────────────┐                       │
│                   │ ● Valid Content  │                       │ ← Timeline
│                   │ 45.2s / 120.0s   │                       │   Visualizer
│                   └──────────────────┘                       │   (Bottom-Center)
└─────────────────────────────────────────────────────────────┘
```

## 🎯 C2PA Status Badge States

### Trusted Content (Green)
```
┌────────────────────────┐
│  ✓  C2PA Content       │  Background: #28a745
│     Credentials        │  Text: White
│     Trusted            │  Icon: ✓ in circle
└────────────────────────┘
```
**Hover Tooltip:**
```
┌───────────────────────────┐
│ Manifest Details          │
│                           │
│ Generator: Adobe Photoshop│
│ Title: Sample Video       │
│ Assertions: 5             │
│                           │
│ Verified: Yes             │
└───────────────────────────┘
```

### Valid Content (Cyan)
```
┌────────────────────────┐
│  ✓  C2PA Content       │  Background: #17a2b8
│     Credentials        │  Text: White
│     Valid              │  Icon: ✓ in circle
└────────────────────────┘
```

### Invalid Content (Red)
```
┌────────────────────────┐
│  ✗  C2PA Content       │  Background: #dc3545
│     Credentials        │  Text: White
│     Invalid            │  Icon: ✗ in circle
└────────────────────────┘
```

### Unknown Status (Yellow)
```
┌────────────────────────┐
│  ?  C2PA Content       │  Background: #ffc107
│     Credentials        │  Text: Black
│     Unknown            │  Icon: ? in circle
└────────────────────────┘
```

## 📊 Timeline Segment Visualizer States

### Trusted Content
```
┌───────────────────────────────┐
│ ● ✓ Trusted Content           │  Circle Color: #28a745
│   45.2s / 120.0s              │  Background: rgba(0,0,0,0.85)
└───────────────────────────────┘
```

### Valid Content
```
┌───────────────────────────────┐
│ ● ✓ Valid Content             │  Circle Color: #17a2b8
│   45.2s / 120.0s              │  Background: rgba(0,0,0,0.85)
└───────────────────────────────┘
```

### Invalid Content
```
┌───────────────────────────────┐
│ ● ✗ Invalid Content           │  Circle Color: #dc3545
│   45.2s / 120.0s              │  Background: rgba(0,0,0,0.85)
└───────────────────────────────┘
```

### Unknown Status
```
┌───────────────────────────────┐
│ ● ? Unknown Status            │  Circle Color: #ffc107
│   45.2s / 120.0s              │  Background: rgba(0,0,0,0.85)
└───────────────────────────────┘
```

## 🎭 Interactive Behaviors

### Status Badge Hover Effect
```
Normal State:
┌────────────────────────┐
│  ✓  C2PA Content       │  scale(1.0)
│     Credentials        │  
│     Trusted            │  
└────────────────────────┘

Hover State:
┌─────────────────────────┐
│  ✓  C2PA Content        │  scale(1.05)
│     Credentials         │  + Drop Shadow
│     Trusted             │  + Tooltip Below
└─────────────────────────┘
         ↓
  ┌───────────────────────┐
  │ Manifest Details      │
  │ [Information here]    │
  └───────────────────────┘
```

### Timeline Pulse Animation
```
Frame 1 (0s):     ●  opacity: 1.0, scale: 1.0
Frame 2 (1s):     ○  opacity: 0.7, scale: 0.95
Frame 3 (2s):     ●  opacity: 1.0, scale: 1.0
[Repeat...]
```

## 🔄 State Transitions

### Playback Flow
```
1. Video Loads
   ┌─────────────────────────┐
   │ No UI visible yet       │
   └─────────────────────────┘

2. User Clicks Play
   ┌─────────────────────────┐
   │ Status Badge appears    │ ← Top-Right
   │ Timeline appears        │ ← Bottom-Center
   └─────────────────────────┘

3. C2PA Validation Starts
   ┌────────────────────────┐
   │  ?  C2PA Content       │ ← Yellow (Unknown)
   │     Credentials        │
   │     Unknown            │
   └────────────────────────┘
   
   ┌───────────────────────────────┐
   │ ● ? Unknown Status            │ ← Yellow
   │   5.2s / 120.0s               │
   └───────────────────────────────┘

4. Validation Complete
   ┌────────────────────────┐
   │  ✓  C2PA Content       │ ← Green (Trusted)
   │     Credentials        │
   │     Trusted            │
   └────────────────────────┘
   
   ┌───────────────────────────────┐
   │ ● ✓ Trusted Content           │ ← Green
   │   15.7s / 120.0s              │
   └───────────────────────────────┘
```

### Seek Event Flow
```
1. User Seeks Forward
   ↓
2. Timeline Clears
   ┌───────────────────────────────┐
   │ ● ? Unknown Status            │ ← Reset to Unknown
   │   45.0s / 120.0s              │
   └───────────────────────────────┘
   ↓
3. New Validation Starts
   ┌───────────────────────────────┐
   │ ● ✓ Trusted Content           │ ← Updates after validation
   │   45.2s / 120.0s              │
   └───────────────────────────────┘
```

## 📏 Dimensions & Spacing

### Status Badge
```
Position: fixed
Top: 20px
Right: 20px
Z-Index: 10000

Size:
├─ Padding: 10px 16px
├─ Border-radius: 8px
├─ Icon: 24px × 24px
└─ Shadow: 0 4px 12px rgba(0,0,0,0.15)

Hover Scale: 1.05
Transition: all 0.3s ease
```

### Timeline Visualizer
```
Position: fixed
Bottom: 20px
Left: 50%
Transform: translateX(-50%)
Z-Index: 9999

Size:
├─ Padding: 12px 20px
├─ Border-radius: 8px
├─ Status Circle: 16px diameter
└─ Shadow: 0 4px 12px rgba(0,0,0,0.3)
```

### Tooltip (on Badge Hover)
```
Position: absolute
Top: 100% (below badge)
Right: 0
Margin-top: 8px

Size:
├─ Min-width: 250px
├─ Max-width: 400px
├─ Padding: 12px
├─ Border-radius: 8px
└─ Shadow: 0 4px 12px rgba(0,0,0,0.2)
```

## 🎨 Color System

### Status Colors
```css
/* Trusted - Full verification */
.trusted {
  background: #28a745;
  border: 2px solid #20873a;
}

/* Valid - Signature valid but not fully trusted */
.valid {
  background: #17a2b8;
  border: 2px solid #138496;
}

/* Invalid - Failed verification */
.invalid {
  background: #dc3545;
  border: 2px solid #bd2130;
}

/* Unknown - Pending or no data */
.unknown {
  background: #ffc107;
  border: 2px solid #e0a800;
}
```

### Text Colors
```css
.trusted, .valid, .invalid {
  color: white;
}

.unknown {
  color: black; /* Better contrast on yellow */
}
```

## 📱 Responsive Behavior

### Desktop (> 768px)
```
Badge: Top-right, full size
Timeline: Bottom-center, full size
Hover: Tooltip appears
```

### Mobile (< 768px)
```
Badge: Top-right, slightly smaller
Timeline: Bottom-center, compact
Hover: Tap to toggle tooltip
```

## 🎬 Animation Specs

### Pulse Animation (Timeline Circle)
```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.7;
    transform: scale(0.95);
  }
}

Duration: 2s
Iteration: infinite
Timing: ease-in-out
```

### Hover Scale (Status Badge)
```css
.badge {
  transition: all 0.3s ease;
}

.badge:hover {
  transform: scale(1.05);
}
```

### Tooltip Fade (Badge)
```css
.tooltip {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.badge:hover .tooltip {
  opacity: 1;
}
```

## 🖼️ Visual Examples

### Complete UI in Action
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                                              ╔═════════╗ ┃
┃  EBU C2PA Player                             ║ ✓ Valid ║ ┃
┃                                              ║  C2PA   ║ ┃
┃  ┌────────────────────────────────────┐     ╚═════════╝ ┃
┃  │                                    │                  ┃
┃  │  [Video Playing]                   │                  ┃
┃  │                                    │                  ┃
┃  │  ▶ ━━━━━━━●━━━━━━━━━━━━━━━━━━  🔊 │                  ┃
┃  │    15:30 / 45:00                   │                  ┃
┃  └────────────────────────────────────┘                  ┃
┃                                                          ┃
┃                ╔═══════════════════════╗                 ┃
┃                ║ ● ✓ Valid Content     ║                 ┃
┃                ║   15:30 / 45:00       ║                 ┃
┃                ╚═══════════════════════╝                 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### Badge with Hover Tooltip
```
                                              ╔═════════════╗
                                              ║ ✓ Trusted   ║
                                              ║   C2PA      ║
                                              ╚═════════════╝
                                                     ↓
                                            ┌────────────────┐
                                            │ Manifest Info  │
                                            │ Generator: ... │
                                            │ Verified: Yes  │
                                            └────────────────┘
```

## 🎯 Key Features Summary

✅ **Status Badge**
- Color-coded validation states
- Hover tooltip with details
- Always visible (top-right)
- Interactive (hover to expand)

✅ **Timeline Visualizer**
- Real-time status indicator
- Pulsing animation
- Time display
- Always visible (bottom-center)

✅ **Friction Overlay** (when invalid)
- Blocks playback
- Clear warning message
- User must acknowledge

✅ **Responsive Design**
- Works on all screen sizes
- Mobile-friendly
- High contrast
- Professional appearance

---

For more details, see:
- [INTEGRATION.md](./INTEGRATION.md) - How to integrate
- [COMPONENTS.md](./COMPONENTS.md) - Component API
- [README.md](./README.md) - Project overview

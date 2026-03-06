# 🎬 Video.js C2PA Overlay - Quick Start Guide

## ✨ What You Now Have

A sophisticated C2PA data viewer **built into your Video.js player** - similar to how other video players show subtitles or quality settings.

## 📍 Where to Find It

### Step 1: Load and Play a Video

1. Open: `http://localhost:9000/dash-player-js/monolithic-v2/cawg_c2pa_player.html`
2. Click **"Load Stream"** button
3. Video starts playing

### Step 2: Look for the Content Credentials Button

Once playback starts, look at the **Video.js control bar** (bottom of video):

```
┌──────────────────────────────────────────────┐
│                                              │
│           Your Video Playing Here            │
│                                              │
└──────────────────────────────────────────────┘
  ▶ ━━━━━━●━━━━━━━━━━━━━ 🔊  [CR]  ⛶
  ^play   ^progress      ^vol  ^NEW! ^fullscreen
```

The **[CR]** button is the new Content Credentials button!

**What it shows:**
- Content Credentials icon (checkmark)
- Small colored dot indicating status:
  - 🟢 Green = Trusted
  - 🔵 Cyan = Valid
  - 🔴 Red = Invalid
  - 🟡 Yellow = Unknown

### Step 3: Click the CR Button

Click the Content Credentials button to open the overlay.

### Step 4: View C2PA Data

A full-screen overlay appears **on top of the video** showing:

```
┌─────────────────────────────────────────────┐
│ 🔖 Content Credentials                   × │
│    C2PA Verification Details                │
├─────────────────────────────────────────────┤
│                                             │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│ ┃ ✓ Valid                                ┃  │
│ ┃ C2PA Validation Status                 ┃  │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                             │
│ ISSUED BY                                   │
│ Adobe Systems Incorporated                  │
│                                             │
│ ISSUED ON                                   │
│ Mar 6, 2026                                 │
│                                             │
│ APP OR DEVICE USED                          │
│ Adobe Premiere Pro 2024                     │
│                                             │
│ NAME                                        │
│ John Doe                                    │
│                                             │
│ WEBSITE                                     │
│ https://example.com                         │
│                                             │
│ ▶ PUBLISHER IDENTITY (CAWG)                 │
│   Click to view details                     │
│                                             │
│ CAWG VALIDATION STATUS                      │
│ Present                                     │
│                                             │
└─────────────────────────────────────────────┘
```

### Step 5: Interact with the Overlay

You can:

✅ **Scroll** - If there's lots of data, scroll to see more  
✅ **Expand CAWG Identity** - Click the ▶ arrow to see detailed publisher info  
✅ **Click Website Links** - Opens in a new tab  
✅ **Close** - Click the × button to return to video  

## 🎨 Visual Elements

### Control Bar Button (Always Visible)

**Normal State:**
```
[CR•] 
 ││└─ Status dot (colored)
 │└── Icon background
 └─── CR icon
```

**Hover State:**
```
[CR•]  ← Background lightens
  ↑
  Tooltip appears: "Content Credentials: Valid"
```

### Overlay Panel (Opens on Click)

**Header:**
- Content Credentials icon (left)
- Title and subtitle
- Close button × (right)

**Validation Banner:**
- Big checkmark or X
- Color-coded background
- Status text

**Data Sections:**
- Clean, card-like layout
- Label above value
- Light background for each field
- Scrollable if content is long

## 🎯 Status Colors

| Validation | Button Dot | Banner Color | What It Means |
|-----------|-----------|--------------|---------------|
| **Trusted** | 🟢 Green | Green background | Fully verified, trusted source |
| **Valid** | 🔵 Cyan | Cyan background | Signature valid, not fully trusted |
| **Invalid** | 🔴 Red | Red background | Failed verification, may be tampered |
| **Unknown** | 🟡 Yellow | Yellow background | Status not yet determined |

## 📱 What Data Is Shown

The overlay displays all available C2PA manifest data:

1. **Issued by** - Who signed the content
2. **Issued on** - When it was signed (formatted date)
3. **App or device used** - Software that created/edited it
4. **Name** - Author(s) of the content
5. **Website** - Creator's website (clickable)
6. **Publisher Identity (CAWG)** - Advanced identity info (collapsible)
7. **CAWG Validation Status** - Whether CAWG data is present
8. **C2PA Validation Status** - Overall validation state

*Note: Only fields with data are shown. Empty fields are hidden.*

## 🔄 Typical Workflow

```
1. Load video
   ↓
2. Playback starts
   ↓
3. CR button appears in control bar
   ↓
4. User hovers → sees tooltip
   ↓
5. User clicks → overlay opens
   ↓
6. User views all C2PA data
   ↓
7. User clicks × → overlay closes
   ↓
8. Back to watching video
```

## 🎮 Keyboard Shortcuts

Currently:
- **Click** - Opens/closes overlay
- **× Button** - Closes overlay

*Future: ESC key to close*

## 💡 Tips

### For Best Experience

✅ **Wait for playback to start** - Button appears after video begins  
✅ **Use on larger screens** - More data is visible at once  
✅ **Try different videos** - See how C2PA data varies  
✅ **Check status dot color** - Quick validation status at a glance  

### Troubleshooting

**Button not showing?**
- Make sure video is playing
- Check that React C2PA player loaded (see page-level indicators)

**Overlay appears blank?**
- Video may not have C2PA data
- Check browser console for errors

**Icons not loading?**
- Ensure HTTP server is running on port 9000
- Check that `/dash-player-js/assets/icons/` exists

## 🎬 Try It Now!

1. **Open the demo page**: `http://localhost:9000/dash-player-js/monolithic-v2/cawg_c2pa_player.html`

2. **Select a video** from the dropdown or enter URL:
   - `cawg_robot_wdr_c2pa.mp4`
   - `PTS_TRUSTED_premiere_wmk_cawg_c2pa.mp4`
   - `PTS_UNTRUSTED_EASYNEWS_cawg_robot.mp4`

3. **Click "Load Stream"**

4. **Click Play** (▶)

5. **Look for the CR button** in the Video.js control bar

6. **Click the CR button** to see all C2PA data!

## 🎨 Example Data You Might See

### Trusted Content
```
✓ Trusted
━━━━━━━━━━━━━━━━━━━━━━━━━
Issued by: CAI Test Certificate
Issued on: Feb 15, 2026
App or device used: Adobe Premiere Pro 2024
Name: Production Team
Website: https://production.example.com
Publisher Identity: ▶ Click to view
CAWG Status: Present
```

### Invalid Content
```
✗ Invalid
━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ This content may have been modified
Issued by: Unknown
CAWG Status: Not Present
```

## 🔗 Page-Level vs Player-Level UI

You now have **both**:

**Page-Level** (Previous):
- Status badge (top-right corner of page)
- Timeline visualizer (bottom-center of page)

**Player-Level** (NEW):
- CR button (in Video.js control bar)
- Data overlay (on top of video player)

Both work together to give you comprehensive C2PA information!

## 📚 More Information

- **Complete Documentation**: [VIDEOJS_OVERLAY.md](VIDEOJS_OVERLAY.md)
- **Implementation Details**: [VIDEOJS_OVERLAY_COMPLETE.md](VIDEOJS_OVERLAY_COMPLETE.md)
- **Integration Guide**: [INTEGRATION.md](INTEGRATION.md)

---

**🎉 Enjoy exploring your C2PA-verified content!**

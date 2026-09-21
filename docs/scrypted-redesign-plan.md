# Scrypted-Style Redesign: Detailed Implementation Plan

> **Project**: Aegis Vision AI (Home Security System)  
> **Target**: Streamline Aegis with Scrypted NVR / Modern NVR features optimized for low-cost hardware  
> **Status**: Comprehensive Implementation Plan (Ready for Phase-by-Phase Execution)  
> **Author**: Antigravity  

---

## 1. Architectural Blueprint & Page Layout

Following your specific design decisions, Aegis will adopt a 6-page navigation model powered by an ultra-lean, low-power backend. All timeline indexing, event search, and camera streaming operate directly on SQLite queries and lightweight Python algorithms.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Aegis Vision AI Shell                            │
├────┬────────────────────────────────────────────────────────────────────────┤
│ R  │  [Dashboard]      /             Recent events on top · Camera cards    │
│ A  │  [Camera Grid]    /grid         1x1 · 2x2 · 3x3 · 1+5 · Fullscreen wall│
│ I  │  [Playback]       /playback     Vertical timeline · Event pins · Player│
│ L  │  [Detections]     /detections   Faceted search · Person filter · Dual  │
│    │  [Faces]          /faces        Guided Face-ID HUD · Import · Auto-learn│
│    │  [Settings]       /settings     System · Cameras · AI · Alerts · Auth  │
└────┴────────────────────────────────────────────────────────────────────────┘
```

### Route Map & Roles
| Route         | Page Component       | Role & UX                                                                                                                                                        |
| ------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`           | `DashboardPage.tsx`  | **Command Center**: Recent Events carousel/strip on top, camera cards with hover-to-live stream, system health strip.                                            |
| `/grid`       | `CameraGridPage.tsx` | **Monitoring Wall**: Pure multi-camera view with layout switchers (`Auto`, `1x1`, `2x2`, `3x3`, `1+5 Focus`), low-bandwidth mode, and native fullscreen (`F`).   |
| `/playback`   | `PlaybackPage.tsx`   | **Scrypted Vertical Timeline**: Synchronized 24h scrubber, continuous footage segments, detected object glyphs, pinned event thumbnails, clip export.            |
| `/detections` | `DetectionsPage.tsx` | **Incident Search**: Full-text search (person, camera, tag), date range picker, event type chips, Gallery Grid vs Compact List views, detail drawer.             |
| `/faces`      | `FacesPage.tsx`      | **Face Management**: Multi-pose Face-ID style circular HUD, batch photo import, 1-click enroll-from-sighting, passive auto-enrichment.                           |
| `/settings`   | `SettingsPage.tsx`   | **Configuration**: System & storage retention, camera CRUD with connection test & zone editor, AI threshold sliders, alert channels with "Test Alert", security. |

### Strict Design System & Iconography Guardrails
1. **Lucide Icons Only (`lucide-react`)**:
   - **Zero Emoji**: Absolutely 0 emoji anywhere in TSX, HTML, or CSS.
   - **Zero Random / Ad-Hoc SVGs**: All icons are imported directly from `lucide-react` (`strokeWidth={1.8}` or `2.0`, uniform size hierarchy `14px` / `16px` / `18px` / `20px` / `24px`).
   - **Dedicated Icon Mapping**:
     - Navigation Rail: `LayoutDashboard` (Dashboard), `Grid` / `Cctv` (Camera Grid), `Film` (Playback), `Search` / `ListFilter` (Detections), `ScanFace` (Faces), `Settings` (Settings).
     - Media & Controls: `Play`, `Pause`, `Maximize2`, `Minimize2`, `Volume2`, `VolumeX`, `Camera`, `Download`, `ChevronLeft`, `ChevronRight`, `Clock`.
     - Detections & Alerts: `CircleAlert` (Alert), `PersonStanding` (Person / Motion), `User` (Known Face), `ShieldAlert` (Loitering), `CheckCircle2` (Success).
     - Editing & Management: `Plus`, `Trash2`, `Edit3`, `RefreshCw`, `Sliders`, `X`, `HardDrive`, `Cpu`.
2. **Emotion Design Tokens**:
   - All styling is embedded in TSX via `@emotion/react` (`css` prop or style objects) using typed tokens from `@/theme/designTokens.ts`.
   - No separate `.css` files.
   - Zero decorative gradients; clean zinc dark theme (`tokens.colors.surface.*`, `tokens.colors.border.*`, `tokens.colors.accent.*`).

---

## 2. Detailed Technical Specifications by Feature

### Feature 1: Top-Right Timestamp OSD (`Camera Name | YYYY-MM-DD HH:MM:SS`)

#### Objective
Render a forensic-grade, high-contrast on-screen display (OSD) at the **top-right corner** of every camera stream, snapshot, and event thumbnail, while maintaining zero performance degradation on low-power hardware.

#### Implementation Architecture
1. **Module Creation**: `src/camera/osd.py`
   ```python
   def draw_timestamp_osd(
       frame: np.ndarray,
       camera_name: str,
       dt: datetime | None = None,
   ) -> np.ndarray:
       """
       Renders 'Camera Name  |  YYYY-MM-DD HH:MM:SS' in the top-right corner.
       Uses a semi-transparent dark pill background for 100% legibility in
       both direct sunlight and dark IR night-vision scenes.
       """
   ```
2. **Visual & Rendering Details**:
   - **Text Format**: `f"{camera_name}  |  {dt.strftime('%Y-%m-%d %H:%M:%S')}"`
   - **Position**: Top-right corner with 12px margin from top and right borders.
   - **Text Size**: `cv2.getTextSize()` with `cv2.FONT_HERSHEY_SIMPLEX`, scale `0.55`, thickness `1`.
   - **Background Pill**:
     - Pill coordinates calculated dynamically based on text width and height + 8px horizontal padding, 6px vertical padding.
     - Dark translucent background: Extract ROI from frame, apply `cv2.addWeighted(roi, 0.35, black_overlay, 0.65, 0)` to achieve a dark tinted glass effect without obscuring behind-the-scene motion.
     - Rounded corner effect or subtle 1px border (`#3f3f46` zinc).
   - **Text Rendering**: Crisp white text (`(245, 245, 245)`) drawn with `cv2.LINE_AA` (anti-aliasing).
3. **Integration Point**:
   - In `src/api/inference.py`:
     - Inside `inference_loop()`, call `draw_timestamp_osd(frame, stream.name, datetime.now())` right before `cv2.imencode('.jpg', ...)` and before caching to `state.latest_frames[cam_id]`.
     - Replace the old hardcoded `cv2.putText` at lines 404–412.
4. **Inherited Benefits**:
   - MJPEG streams (`/video_feed`, `/video_feed/{id}`) instantly carry the OSD.
   - Snapshots (`/cameras/{id}/snapshot.jpg`) instantly carry the OSD.
   - Detection thumbnails saved via `_save_thumbnail()` inherit the timestamp.
   - Zero additional memory allocation or frame buffer copying.

---

### Feature 2: Dashboard Page (`/`)

#### Objective
A clean, informative landing page that immediately answers: *"What happened recently, and what is happening right now?"*

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Dashboard                                                  ● 3/3 Cameras Ok │
├─────────────────────────────────────────────────────────────────────────────┤
│ ✦ RECENT EVENTS (Past 24 Hours)                                [See All 42] │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐  │
│ │ Joynal (Front Door)  │ │ Unknown (Driveway)   │ │ Motion (Porch)       │  │
│ │ 08:14 AM · Sighting  │ │ 07:30 AM · Loitering │ │ 02:15 AM · Alert     │  │
│ │ [Event Thumbnail]    │ │ [Event Thumbnail]    │ │ [Event Thumbnail]    │  │
│ └──────────────────────┘ └──────────────────────┘ └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│ CAMERAS                                                    [Open Grid Wall] │
│ ┌───────────────────────────┐ ┌───────────────────────────┐                 │
│ │ Front Door         ● Live │ │ Driveway           ● Live │                 │
│ │                           │ │                           │                 │
│ │      [Camera Feed]        │ │      [Camera Feed]        │                 │
│ │                           │ │                           │                 │
│ │ 15 FPS · 1080p   [Play] ↗ │ │ 15 FPS · 1080p   [Play] ↗ │                 │
│ └───────────────────────────┘ └───────────────────────────┘                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ SYSTEM HEALTH                                                               │
│ Storage: 48.2 GB / 500 GB (10%) · CPU: 12% · Memory: 380 MB · Events: 42    │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Components
1. **Header**:
   - System title `Dashboard` + camera status badge (`● 3/3 online` / `▲ 2/3 online`).
   - Quick date badge (local day & date).
2. **Top Section — Recent Events Reel**:
   - Horizontal scrolling carousel of recent detection events from `/events?limit=15`.
   - Cards display:
     - 16:9 thumbnail crop with 2px severity color accent (Red = Unknown face, Amber = Loitering, Green = Known person).
     - Event label / person badge (`Joynal`, `Unknown #3`, `Loitering`).
     - Location: Camera name pill.
     - Timestamp: Relative time (`12m ago`) and exact time (`08:14 AM`).
     - Action: Clicking an event card deep-links to `/playback?cam={cam_id}&ts={timestamp}` with auto-seeking.
3. **Middle Section — Camera Status Cards**:
   - 16:9 ratio cards with subtle border and dark zinc styling.
   - Snapshot-idle with instant hover-to-live stream.
   - Camera header: Name, live green dot, FPS badge.
   - Bottom action bar:
     - Quick Playback button (`Play` icon jumps to timeline).
     - Snapshot trigger button (downloads instant full-res frame).
     - Expand button (switches to focused view).
4. **Bottom Section — System Health Mini-Bar**:
   - Compact status strip showing disk volume usage (GB used vs total capacity), CPU load estimate, RAM usage, and total events recorded today.

---

### Feature 3: Camera Grid Page (`/grid`)

#### Objective
Dedicated, distraction-free surveillance wall designed for security monitors, wall tablets, or continuous live viewing.

#### Key Features & Controls
1. **Layout Switcher**:
   - **Auto**: CSS Grid `repeat(auto-fit, minmax(360px, 1fr))` dynamically sizing tiles based on screen width.
   - **1x1 Focus**: Single full-size camera feed.
   - **2x2 Grid**: 4 equal-sized camera panes.
   - **3x3 Grid**: Up to 9 camera panes.
   - **1+5 Focus Layout**: 1 large hero pane occupying 70% of screen width, with up to 5 smaller secondary tiles stacked along the side/bottom. Clicking any secondary tile swaps it into the hero position without reloading streams!
2. **True Fullscreen Mode (`F`)**:
   - Native Fullscreen API integration: Pressing `F` or clicking the Fullscreen button hides the `AppRail` and browser chrome for a 100% full-screen wall display.
   - Pressing `Escape` or `F` again restores the standard layout.
3. **Low-Bandwidth Mode Toggle**:
   - Toggle switch in header: `Live Streams` vs `Eco Mode (Snapshots)`.
   - In Eco Mode, cameras poll snapshots every 2–5 seconds, consuming near-zero CPU and minimal network bandwidth. Hovering over any camera temporarily activates the 15–30 FPS live stream.
4. **Tile HUD Overlays**:
   - Top-left: Camera Name + Live status dot.
   - Top-right: Current FPS counter.
   - Bottom-left: Active detection pills (e.g. `Joynal #2`, `Unknown #5`, `Loitering`).

---

### Feature 4: Playback Page (`/playback`) with Scrypted Vertical Timeline

#### Objective
Replicate the signature **Scrypted NVR vertical timeline** — where time is encoded on the vertical Y-axis — synchronized with continuous recording playback, detected object tracks, and event pins.

#### Scrypted Vertical Timeline Geometry & Mechanics

```
 Desktop: Player Left (1fr) + Vertical Timeline Right (340px)
 ┌──────────────────────────────────────┬────────────────────────────────────┐
 │                                      │ 09:15 PM ─┐     ┌────────────────┐ │
 │                                      │           │ 🚶──┤ [thumbnail]    │ │
 │                                      │ 09:00 PM ─┤ ═══─┤ [thumbnail]    │ │
 │            [Video Player]            │           │ 🚗──┤ [thumbnail]    │ │
 │        (HTTP 206 Range Seeking)      │ 08:45 PM ─┤     └────────────────┘ │
 │                                      │   …       │ (rail)(pinned thumbs)  │
 │                                      │ ──────────[08:53:50 PM]─────────── │
 │                                      │          (Draggable Playhead Rule) │
 └──────────────────────────────────────┴────────────────────────────────────┘

 Mobile: Sticky Video Player Top (16:9) + Scrollable Vertical Timeline Below
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                   [Sticky Video Player — Fixed at Top]                    │
 ├───────────────────────────────────────────────────────────────────────────┤
 │ 09:15 PM ──┐        ┌────────────────────────────┐                        │
 │            │  🚶────┤ [16:9 Event Thumbnail]     │ (Scrollable            │
 │ 09:00 PM ──┤  ══════┤ 09:02 PM · Joynal (Front)  │  Vertical Timeline     │
 │            │  🚗────┤ [16:9 Event Thumbnail]     │  Under Player)         │
 │ ───────────[08:53:50 PM]─────────────────────────                         │
 └───────────────────────────────────────────────────────────────────────────┘
```

#### Exact Scrypted Mechanics to Replicate
1. **Vertical Rail (Time is the Y-Axis)**:
   - Time runs vertically from top (most recent / "Now") to bottom (past).
   - **58px Monospace Hour Scale**: Major tick marks with labels (e.g., `09:00 PM`, `08:45 PM`) on the left.
   - **16px Contiguous Coverage Rail**: Shows colored coverage bars (blue) where recorded segments exist on disk (from `RecordingIndex`), with gaps indicating dead time or camera downtime.
   - **Activity Density Blobs**: Thicker/bright blue segments where high motion or events occurred.
2. **Pinned Event Thumbnails with Connectors**:
   - Thumbnails are positioned along the vertical Y-axis **at their exact timestamp**, not an arbitrary list.
   - **Thin Connector Lines**: Subtle hairline rule connecting the rail track to each pinned 16:9 thumbnail.
   - **Object Class Icons**: Small inline icons on the connector (🚶 Person, 👤 Known Face, 🚨 Unknown Face, ⏳ Loitering) with exact timestamp.
   - **Zero Chrome Design**: No cards, heavy borders, or dividers; clean whitespace and thin connectors provide visual hierarchy.
3. **Draggable Playhead Rule & Time Badge**:
   - Full-width horizontal rule with a monospace playhead badge (`[Sep 21 / 08:53:50 PM]`).
   - Draggable along the timeline to scrub video in real time.
   - Clicking anywhere on the rail or scale moves the playhead and seeks the player.
4. **Player Controls & Clip Export**:
   - Seamless MP4 segment auto-advance across 15-minute boundaries.
   - Playback speed switcher: `0.5x`, `1x`, `2x`, `4x`.
   - Event jumping buttons (`[` Prev / `]` Next) and hotkeys (`Space`, `J`, `L`).
   - "Download Clip" button calling `GET /recordings/{cam}/clip.mp4?start={ts}&end={ts}`.

---

### Feature 5: Mobile Responsiveness Architecture (Scrypted Mobile Experience)

#### Objective
Deliver a fluid, native-app-feeling mobile experience on smartphones (iOS Safari / Android Chrome) and tablets, matching Scrypted's responsive elegance.

#### Responsive Breakpoints
- **Mobile Viewport**: $\le 768\text{px}$ (iPhone, Android phones)
- **Tablet Viewport**: $769\text{px} - 1024\text{px}$ (iPad, Android tablets)
- **Desktop Viewport**: $> 1024\text{px}$ (Laptops, monitors, wall displays)

#### 1. Navigation Shell: Bottom Bar on Mobile
- **Desktop**: 56px left vertical rail (`AppRail.tsx`).
- **Mobile ($\le 768\text{px}$)**:
  - Transforms into a **fixed bottom navigation bar**:
    ```css
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 56px;
    padding-bottom: env(safe-area-inset-bottom);
    background: rgba(18, 18, 20, 0.92);
    backdrop-filter: blur(12px);
    border-top: 1px solid tokens.colors.border.subtle;
    display: flex;
    justify-content: space-around;
    align-items: center;
    z-index: 100;
    ```
  - Touch targets sized to $44\text{px} \times 44\text{px}$ (Apple HIG compliance).
  - Main content container adds `padding-bottom: calc(56px + env(safe-area-inset-bottom))` to prevent content clipping.

#### 2. Playback Page on Mobile
- **Sticky Video Player**:
  - Docks at the top of the screen (`position: sticky; top: 0; z-index: 30; width: 100%; aspect-ratio: 16/9; background: #000`).
  - Stays visible while the user scrolls down through the timeline!
  - Single-tap on the video toggles overlay controls (Play/Pause, speed pill, fullscreen icon).
- **Scrollable Vertical Timeline Rail**:
  - Positioned directly beneath the sticky player, scrolling smoothly with touch momentum.
  - Tapping any event thumbnail or scrubbing the playhead immediately updates the sticky video above.

#### 3. Dashboard on Mobile
- **Recent Events Carousel**:
  - Full-width horizontal swipe with CSS snap points: `scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;`.
  - Cards snap cleanly to center: `scroll-snap-align: start; min-width: 260px;`.
- **Camera Cards**:
  - Stacks in a single clean column (`grid-template-columns: 1fr`).
  - Video preview occupies 100% width with 16:9 aspect ratio.
  - Large touch-friendly action buttons (`Play`, `Snapshot`, `Expand`).

#### 4. Camera Grid on Mobile
- Automatically adjusts to **1-column** (vertical feed) or **compact 2-column** grid with toggle button.
- Double-tap on any tile smoothly expands it to fill the viewport.
- Native Fullscreen button switches the phone into landscape surveillance mode.

#### 5. Detections Page on Mobile
- Filter chips scroll horizontally in a single row (`overflow-x: auto; white-space: nowrap; scrollbar-width: none;`).
- Event rows stack vertically: thumbnail on top, metadata below with generous tap targets.
- Event detail drawer renders as a **Bottom Sheet modal** (slides up from the bottom of the screen with a swipe-down dismiss handle).

#### 6. Settings on Mobile
- Settings navigation tabs switch from a sidebar rail to a **horizontal scrollable tab strip** at the top.
- Interactive Zone Editor features pinch-to-zoom and touch-friendly polygon vertex drag handles.

---

### Feature 6: Detections Page (`/detections`) with Full Search & Triage

#### Objective
Unified incident investigation center. Replaces the legacy events list with a powerful, searchable intelligence interface.

#### Key Features & Capabilities
1. **Search & Query Bar**:
   - Instant search input matching against `person_name`, `camera_id`, `camera_name`, or event metadata.
2. **Faceted Filter Controls**:
   - **Event Type Chips**: `All`, `Unknown Face` (Alert), `Known Face` (Sighting), `Loitering` (Warning), `Motion`.
   - **Camera Dropdown / Multi-Select**: Filter by one or multiple cameras.
   - **Person Dropdown**: Quick filter for specific enrolled people.
   - **Date Range Picker**: Quick presets (`Today`, `Yesterday`, `Last 7 Days`, `Last 30 Days`) or custom Date From / Date To calendar pickers.
3. **Dual View Modes**:
   - **Gallery View**: High-density card grid featuring large 16:9 thumbnails, person badges, camera pills, and relative timestamps.
   - **Table / List View**: Compact Scrypted-style rows featuring metadata on the left, 2px severity color accents (red, amber, green), and thumbnail on the right.
4. **Event Detail Drawer**:
   - Full-resolution cropped thumbnail + full scene snapshot view.
   - Detailed event metadata: Exact UTC/local timestamp, camera ID, track ID, confidence score, bounding box coordinates, and detected zone.
   - **Action 1: "Play in Timeline"**: Deep-links into `/playback?cam={cam}&ts={ts}`.
   - **Action 2: "Name this Person"**: If unknown face, allows naming the stranger inline to enroll them immediately.
   - **Action 3: "Download Snapshot"**: Downloads the high-res JPEG image.

---

### Feature 7: Revamped Multi-Avenue Face Registration

#### Objective
Provide a state-of-the-art face registration experience inspired by Apple Face ID, CompreFace, and Google Nest, combining interactive guided enrollment, photo album import, enroll-from-detection, and passive auto-enrichment.

```
                      ┌───────────────────────────────┐
                      │    Aegis Face Intelligence    │
                      └──────────────┬────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
 ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
 │ Guided Wizard │           │ Photo Import  │           │ Sighting Crop │
 │ (Face-ID HUD) │           │ (Batch Files) │           │ ("Name Person")│
 └───────┬───────┘           └───────┬───────┘           └───────┬───────┘
         │                           │                           │
         └───────────────────► Quality Gate ◄────────────────────┘
                                     │ (Blur, Size, Light, Pose)
                                     ▼
                      ┌───────────────────────────────┐
                      │  Known Faces Store & Vectors  │
                      └──────────────┬────────────────┘
                                     │
                                     ▼
                      ┌───────────────────────────────┐
                      │ Passive Enrichment Loop (Auto)│
                      │  High-confidence live crops   │
                      └───────────────────────────────┘
```

#### Avenue 1: Revamped Guided Live Wizard (`RegisterModal.tsx`)
- **Face-ID Style Circular Viewfinder HUD**:
  - Dark-tinted circular guide with a subtle 5-segment orbital ring: `Center`, `Left`, `Right`, `Up`, `Down`.
  - Non-linear pose progress: The user doesn't have to wait for strict steps. As they look around naturally, `compute_pose` continuously detects the head angle and lights up the corresponding segment in blue.
  - **Capture-Time Quality Gates**:
    - Minimum face resolution: $\ge 96 \times 96$ px.
    - Sharpness: Laplacian variance $\ge 60.0$ (rejects motion blur).
    - Illumination: Mean grayscale brightness between $40$ and $225$.
    - Real-time HUD feedback pills: `"Move closer"`, `"More light needed"`, `"Hold still"`.
  - **Auto-Capture & Haptic/Visual Confirmation**:
    - When a valid pose is held steady for $1.0\text{s}$ and passes quality gates, it auto-captures and turns green (`✓`).
  - **Thumbnail Review Strip**:
    - Shows all 5 captured thumbnails before final submission. The user can click "Retake" on any single photo without re-doing the entire wizard.

#### Avenue 2: Photo Batch Import (`ImportModal.tsx`)
- Drag & drop images from phone or desktop.
- Automatically handles EXIF-orientation transposition and strips GPS metadata for privacy.
- Detects faces; if an image contains multiple people, renders crops with a prompt: *"Select the face for [Name]"*.
- Batches crops into the background queue to keep ONNX inference single-threaded.

#### Avenue 3: Enroll from Detection Sighting ("Name this Stranger")
- Any "Unknown Face" event in Detections or Dashboard offers a 1-click **"Name this person"** button.
- Entering a name immediately saves the crop into `data/known_faces/<name>/` and registers the ArcFace embedding in the live model without restarting the server.

#### Avenue 4: Passive Enrichment Loop (Auto-Learning)
- Inside `src/api/inference.py`:
  - When a known person is detected with cosine similarity $\ge 0.62$, near-frontal pose, and passed quality gates:
  - If their reference photo count is $< 12$, automatically save the new crop as an additional reference image.
  - Automatically adapts to seasonal haircuts, glasses, and ambient lighting changes over time!

---

### Feature 8: Scrypted-Style Settings Suite (`/settings`)

#### Objective
Replace hardcoded `.env` and manual `cameras.json` edits with a centralized, tabbed configuration dashboard.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings                                                                    │
├───────────────┬─────────────────────────────────────────────────────────────┤
│ ⚙ General     │ STORAGE & RETENTION                                         │
│ 📹 Cameras     │ Recordings Volume: /data/recordings                         │
│ 🧠 AI & Vision│ ▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱ 48.2 GB used of 500 GB (10% used)       │
│ 🔔 Alerts     │ Retention Mode: [● Auto-purge when full ] [ Keep N days ]   │
│ 🔒 Security   │ Keep recordings for: [ 30 ] days                            │
│               │ Minimum free disk space: [ 10 ] GB                          │
│               │                                                             │
│               │ DATABASE MAINTENANCE                                        │
│               │ Events in database: 1,420 rows (2.4 MB)                     │
│               │ [ Vacuum Database ]    [ Export Backup ]                    │
└───────────────┴─────────────────────────────────────────────────────────────┘
```

#### Tab Breakdown & Backend APIs

1. **General / System Tab**:
   - **Storage Retention**: Visual bar showing GB used by recordings, thumbnails, and database vs total drive capacity.
   - Sliders for `retain_days` (default: 30) and `min_disk_free_gb` (default: 10 GB).
   - `Vacuum Database` button (`POST /settings/system/vacuum`) to reclaim fragmented SQLite space.
   - Live hardware status: CPU load %, RAM usage, uptime, ONNX execution provider.
2. **Cameras Tab**:
   - List of all configured cameras with live snapshot previews, RTSP URLs, and online badges.
   - **Add / Edit Camera Modal**:
     - Friendly name, Camera Type (`rtsp`, `tapo`, `macbook`, `file`).
     - Main RTSP stream URL (1080p for recording) and Sub-stream URL (360p for AI detection).
     - **"Test Stream" Button**: Backend attempts RTSP handshake and grabs 1 frame before saving to verify credentials and network accessibility.
     - **Interactive Activity Zone Editor**: Modal displaying the latest camera snapshot where the user clicks to draw polygonal detection zones.
   - Delete Camera action with confirmation.
3. **AI & Vision Tuning Tab**:
   - **YOLO Detection Sensitivity**: Confidence threshold slider (0.20 to 0.80, default: 0.50).
   - **ByteTrack Tracker**: Track activation buffer and lost track retention frames.
   - **InsightFace Recognition Threshold**: Cosine similarity cutoff slider (0.30 to 0.60, default: 0.40).
   - **Loitering Timer**: Seconds a person remains in a zone before triggering an alert (15s to 300s, default: 60s).
   - Quality gate toggles (min face size, blur cutoff).
4. **Alerts & Notifications Tab**:
   - Active alert provider toggle: `Console`, `Telegram`, `ntfy.sh`.
   - Telegram configuration: Bot Token, Chat ID, and a **"Send Test Alert"** button (`POST /settings/alerts/test`) that verifies message and photo delivery immediately.
   - ntfy configuration: Topic name, Server URL.
   - Cooldown settings: Global cooldown, Per-person cooldown (default: 60s).
5. **Security & Authentication Tab**:
   - Change admin password (enforcing bcrypt minimum complexity: 8+ chars, uppercase, lowercase, digit).
   - Session duration / JWT token expiration slider.
   - API tokens for home automation integration.

---

## 3. Backend Changes & Implementation Details

To support the Scrypted features without breaking our single-threaded ONNX architecture and low-power hardware constraints, the backend requires 4 targeted additions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Backend Architecture Map                           │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ New Modules              │ Router Additions         │ Pipeline Hooks        │
│ ──────────────────────── │ ──────────────────────── │ ───────────────────── │
│ • src/camera/osd.py      │ • src/api/routers/       │ • inference_loop()    │
│   (Pill timestamp OSD)   │   settings.py (Config,   │   (OSD overlay call + │
│                          │   Camera CRUD, Tests)    │   Passive auto-enrich)│
│                          │ • /events (Search & range│ • /register/capture   │
│                          │   query filters)         │   (Quality check gate)│
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

---

### 3.1. Timestamp OSD Module (`src/camera/osd.py`)

- **Role**: Render a high-contrast forensic timestamp pill directly onto video frames before encoding or distribution.
- **Function Signature**:
  ```python
  def draw_timestamp_osd(
      frame: np.ndarray,
      camera_name: str,
      dt: datetime | None = None,
  ) -> np.ndarray:
  ```
- **Internal Mechanics**:
  1. Default timestamp is `datetime.now()` (local time formatted as `YYYY-MM-DD HH:MM:SS`).
  2. Label text: `f"{camera_name}  |  {dt.strftime('%Y-%m-%d %H:%M:%S')}"`.
  3. Uses `cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)` to compute text dimensions.
  4. Top-right coordinates: `x = frame.shape[1] - text_w - 24`, `y = 12`.
  5. **Translucent Glass Pill**:
     - Slices the region of interest: `roi = frame[y : y + text_h + 12, x : x + text_w + 16]`.
     - Creates dark overlay array with matching shape: `cv2.addWeighted(roi, 0.35, black_box, 0.65, 0, roi)`.
     - Draws subtle 1px border around pill: `(63, 63, 70)` in BGR.
  6. Draws anti-aliased white text `(245, 245, 245)` with `cv2.LINE_AA`.
- **Integration in `src/api/inference.py`**:
  - Replaces lines 404–412:
    ```python
    frame = draw_timestamp_osd(frame, stream.name)
    ```
  - Located before `cv2.imencode('.jpg', ...)` and `state.latest_frames[cam_id] = frame`.
  - Automatically stamps all live feeds, WebRTC/MJPEG streams, snapshots, and event thumbnails without duplicating computation.

---

### 3.2. Settings API Router (`src/api/routers/settings.py`)

- **Role**: Provide full management over camera configurations, storage retention, AI detection sensitivity, alert credentials, and system diagnostics without requiring server restarts.
- **Mounted in `main.py`**: `app.include_router(settings_router.router)` with JWT authentication dependency.

#### Detailed Endpoints & Schemas

| Endpoint                  | Method   | Input Payload                                                                                               | Output Schema / Action                                                                                                                                                                                                                      |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/system`        | `GET`    | None                                                                                                        | `{ "cpu_percent": float, "memory_mb": float, "disk": { "recordings_gb": float, "thumbnails_gb": float, "database_mb": float, "total_gb": float, "free_gb": float }, "uptime_seconds": float, "cameras_online": int, "cameras_total": int }` |
| `/settings/config`        | `GET`    | None                                                                                                        | Returns current typed `AppConfig` (cameras, storage paths, active alert provider, retention rules) with secrets masked.                                                                                                                     |
| `/settings/config`        | `PATCH`  | `SettingsUpdateRequest` (`retain_days?`, `min_disk_free_gb?`, `delete_only_if_disk_full?`, `active_alert?`) | Updates global configuration and commits atomically to disk.                                                                                                                                                                                |
| `/settings/cameras`       | `POST`   | `CameraConfig`                                                                                              | Appends camera to `data/cameras.json`, validates connection, instantiates stream in `state.active_streams`, and starts stream thread.                                                                                                       |
| `/settings/cameras/{id}`  | `PUT`    | `CameraConfig`                                                                                              | Updates camera settings. If RTSP URL or index changed, gracefully stops old stream, instantiates new `CameraStreamWrapper`, and starts it.                                                                                                  |
| `/settings/cameras/{id}`  | `DELETE` | None                                                                                                        | Stops camera stream, releases capture handle, removes from `data/cameras.json`.                                                                                                                                                             |
| `/settings/cameras/test`  | `POST`   | `{ "type": str, "rtsp_url"?: str, "camera_index"?: int }`                                                   | Attempts connection via `cv2.VideoCapture` with 3-second timeout; returns `{ "ok": bool, "resolution"?: [w, h], "fps"?: float, "error"?: str }`.                                                                                            |
| `/settings/alerts/test`   | `POST`   | `{ "provider": "telegram" \| "ntfy", "token"?: str, "chat_id"?: str, "topic"?: str }`                       | Sends immediate test alert to phone with sample snapshot; returns `{ "ok": bool, "error"?: str }`.                                                                                                                                          |
| `/settings/system/vacuum` | `POST`   | None                                                                                                        | Runs `VACUUM` on `aegis.db` and rebuilds SQLite indexes; returns `{ "freed_bytes": int }`.                                                                                                                                                  |

#### Atomic Configuration Persistence Pattern
To guarantee zero file corruption on low-power devices during unexpected power loss:
```python
def save_cameras_atomically(cameras: list[CameraConfig]) -> None:
    temp_file = CAMERAS_FILE.with_suffix('.tmp')
    with open(temp_file, 'w') as f:
        json.dump([c.model_dump() for c in cameras], f, indent=2)
    os.replace(temp_file, CAMERAS_FILE)  # Atomic POSIX rename
```

---

### 3.3. Face Registration & Passive Auto-Enrichment Upgrades

#### 1. Quality-Gated Capture (`src/api/routers/register.py`)
- **Current Problem**: `/register/capture` saves the raw frame into `data/known_faces/<name>/` without verifying quality or cropping to the face.
- **Implementation Upgrade**:
  - Connect `/register/capture` to `quality_check()` from `src/api/enroll_jobs.py`.
  - When the frontend requests a capture:
    1. Grabs `state.latest_raw_frame`.
    2. Runs `quality_check(frame, bbox)` evaluating:
       - Resolution: face width and height $\ge 96\text{px}$.
       - Blur: Laplacian variance $\ge 60.0$.
       - Illumination: Mean brightness between $40.0$ and $225.0$.
    3. If gates fail $\rightarrow$ returns `422 Unprocessable Entity` with `{ "ok": false, "reason": "blurry" | "too_dark" | "too_small" }`.
    4. If gates pass $\rightarrow$ crops face with 25% margin padding, saves normalized JPEG into `data/known_faces/<name>/`, and enqueues embedding. Returns `{ "ok": true, "file": path, "quality": { "sharpness": float, "brightness": float } }`.

#### 2. Passive Auto-Enrichment Loop (`src/api/inference.py`)
- **Objective**: Improve face recognition over time across changing lighting, seasonal clothing, and hairstyles without manual re-enrollment.
- **Implementation in `inference_loop()`**:
  ```python
  if is_known and name and name != "Unknown":
      sim = det.get("similarity", 0.0)
      # High-confidence threshold (avoids learning false positives)
      if sim >= 0.62 and det["landmarks"] is not None:
          # Only save if pose is near-frontal and reference count < 12
          pose_info = compute_pose(det["landmarks"], det["bbox"])
          if pose_info["pose"] == "center":
              person = state.person_store.get_person(name=name)
              if person and state.person_store.get_image_count(person["id"]) < 12:
                  passed, _ = quality_check(frame, det["bbox"])
                  if passed:
                      crop = crop_face(frame, det["bbox"])
                      save_reference_crop(KNOWN_FACES_DIR, name, crop)
                      state.pending_embeddings.append({"name": name, "frame": crop})
  ```

---

### 3.4. Detections Search & Date Range Queries (`src/events/database.py`)

- **Current State**: `EventDatabase.list_events()` only supports exact date matching (`WHERE timestamp LIKE 'YYYY-MM-DD%'`) and exact person matching.
- **Backend Enhancement**:
  - Add support for:
    - Full-text search `q`: `WHERE (person_name LIKE :q OR camera_id LIKE :q OR metadata LIKE :q)`
    - Range filter: `WHERE timestamp >= :start_date AND timestamp <= :end_date`
  - Index Optimization: Verify composite index `CREATE INDEX IF NOT EXISTS idx_events_ts_type ON events(timestamp, event_type)`.
  - Pass parameters through `src/api/routers/events.py` via `q: str | None = None`, `start_date: str | None = None`, `end_date: str | None = None`.

---

## 4. Step-by-Step Phased Implementation Roadmap

### Phase 1: Timestamp OSD & Navigation Core
- [ ] **Task 1.1 — Timestamp OSD Module**:
  - Create `src/camera/osd.py` with `draw_timestamp_osd(frame, name, dt)`.
  - Format: `f"{name}  |  {dt.strftime('%Y-%m-%d %H:%M:%S')}"` in the top-right corner.
  - Implement semi-transparent dark pill background using alpha blending.
  - Wire into `src/api/inference.py` before caching and encoding.
  - *Verification*: Verify via `/video_feed/{id}` and `/cameras/{id}/snapshot.jpg` that the timestamp is clearly legible over bright and dark backgrounds.
- [ ] **Task 1.2 — Navigation & Routing Overhaul**:
  - Update `frontend/src/components/AppRail.tsx` with 6 icons: Dashboard (`LayoutDashboard`), Grid (`Grid`), Playback (`Film`), Detections (`Search`), Faces (`ScanFace`), Settings (`Settings`).
  - Add responsive bottom bar styling for mobile ($\le 768\text{px}$) with iOS safe-area support.
  - Update `frontend/src/App.tsx` routes:
    - `/` $\rightarrow$ `DashboardPage`
    - `/grid` $\rightarrow$ `CameraGridPage`
    - `/playback` and `/playback/:cameraId` $\rightarrow$ `PlaybackPage`
    - `/detections` $\rightarrow$ `DetectionsPage`
    - `/faces` $\rightarrow$ `FacesPage`
    - `/settings` $\rightarrow$ `SettingsPage`
    - Legacy redirect: `/events` $\rightarrow$ `/detections`.
  - *Verification*: `npm run lint` and `npm run build` pass cleanly; clicking rail items navigates correctly.
- [ ] **Task 1.3 — Camera Grid Page (`/grid`)**:
  - Implement `frontend/src/pages/CameraGridPage.tsx`.
  - Add layout switcher: `Auto`, `1x1`, `2x2`, `3x3`, `1+5 Focus`.
  - Implement native fullscreen toggle (`F` key / button).
  - Add low-bandwidth mode (snapshot polling) with hover-to-live stream.
  - *Verification*: Test all 5 layouts; verify fullscreen toggles smoothly.

---

### Phase 2: Dashboard Page (Recent Events + Camera Cards + System Status)
- [ ] **Task 2.1 — Recent Events Carousel**:
  - Implement responsive recent events carousel at the top of the dashboard.
  - 16:9 thumbnail cards with severity color accents (Red = Unknown, Amber = Loitering, Green = Known).
  - Smooth horizontal scroll with touch snap points (`scroll-snap-type: x mandatory`).
  - Click card deep-links to `/playback?cam={cam_id}&ts={timestamp}`.
- [ ] **Task 2.2 — Camera Cards Wall & Action Bar**:
  - Clean 16:9 camera cards with status dot, live FPS counter, and snapshot-idle with hover-to-live.
  - Quick action buttons: Playback (`Play`), Snapshot capture, Expand.
- [ ] **Task 2.3 — System Health Mini-Bar**:
  - Mini health strip showing storage usage (recordings + thumbnails vs disk capacity), CPU load, and total events today.
  - *Verification*: Verify clicking event cards navigates to `/playback` with the target timestamp; verify mobile responsive single-column stacking.

---

### Phase 3: Playback Page with Scrypted Vertical Timeline
- [ ] **Task 3.1 — Scrypted Vertical Timeline Scrubber**:
  - Enhance `TimelineRail.tsx`:
    - Y-axis time scale (newest at top).
    - 58px monospace hour labels with ticks.
    - 16px continuous recording coverage bars (`RecordingIndex`).
    - Pinned 16:9 event thumbnails connected to the rail via hairline rules with inline object icons (🚶 Person, 👤 Face, 🚨 Unknown, ⏳ Loitering).
    - Draggable horizontal playhead rule with badge (`[08:53:50 PM]`).
- [ ] **Task 3.2 — Playback Shell & Sticky Mobile Player**:
  - Implement `frontend/src/pages/PlaybackPage.tsx`.
  - Desktop: Player on left (1fr), vertical timeline on right (340px).
  - Mobile: Sticky top player (`position: sticky; top: 0; z-index: 30; aspect-ratio: 16/9`), vertical timeline scrolling smoothly underneath.
  - HTML5 video element with HTTP 206 partial content seeking and auto-advance across 15-minute segments.
  - Playback speed switcher: `0.5x`, `1x`, `2x`, `4x`.
- [ ] **Task 3.3 — Video Clip Exporter**:
  - Wire `GET /recordings/{cam}/clip.mp4?start={t1}&end={t2}` to an "Export Clip" button.
  - *Verification*: Verify scrubbing updates video in real time; verify mobile layout docks player at top while scrolling timeline below.

---

### Phase 4: Detections Search Center & Face Registration Revamp
- [ ] **Task 4.1 — Detections Page (`/detections`)**:
  - Implement `frontend/src/pages/DetectionsPage.tsx`.
  - Add full-text search input (person name, camera, tag).
  - Add faceted filters: Event type chips, camera dropdown, person dropdown, date range presets.
  - Add Dual View switcher: Gallery Grid view vs Compact List view.
  - Add event detail side drawer (desktop) / bottom sheet (mobile) with high-res zoom and "Play in Timeline" action.
- [ ] **Task 4.2 — Revamped Face-ID Guided Wizard (`RegisterModal.tsx`)**:
  - Build circular viewfinder HUD with 5-segment orbital ring (Center, Left, Right, Up, Down).
  - Non-linear pose tracking using `compute_pose` with auto-capture upon holding valid pose for 1s.
  - Real-time HUD feedback pills (`"Move closer"`, `"Hold still"`, `"More light"`).
  - Thumbnail review strip with 1-click single-pose retake.
- [ ] **Task 4.3 — Enroll from Sighting**:
  - In Detections and Dashboard, add a 1-click "Name this person" button to unknown face cards.
  - Submits crop to `POST /faces/{name}/add` and immediately updates the live recognition model.
- [ ] **Task 4.4 — Passive Auto-Enrichment Loop**:
  - In `src/api/inference.py`: When a known person is detected with cosine similarity $\ge 0.62$, near-frontal pose, and high sharpness, auto-save crop to `data/known_faces/<name>/` (up to 12 images per person).
  - *Verification*: Test face registration with circular HUD; verify unknown sighting enrollment; verify passive crop saving.

---

### Phase 5: Scrypted-Style Settings Suite
- [ ] **Task 5.1 — Settings Backend API (`src/api/routers/settings.py`)**:
  - `GET /settings/system`: CPU, RAM, disk space breakdown, uptime.
  - `GET /settings/config` & `PATCH /settings/config`: read and update application settings with atomic write to `cameras.json` and `.env`.
  - `POST /settings/cameras`, `PUT /settings/cameras/{id}`, `DELETE /settings/cameras/{id}`.
  - `POST /settings/cameras/test`: RTSP handshake and test frame capture.
  - `POST /settings/alerts/test`: send test notification via Telegram or ntfy.
  - `POST /settings/system/vacuum`: SQLite VACUUM maintenance.
- [ ] **Task 5.2 — Settings Frontend Page (`/settings`)**:
  - Implement `frontend/src/pages/SettingsPage.tsx` with sidebar navigation tabs (desktop) / horizontal scroll tab bar (mobile):
    - **General / Storage**: Retention sliders, storage usage visual bar, vacuum button.
    - **Cameras**: Camera cards, Add Camera modal, RTSP stream tester, and interactive polygon zone editor.
    - **AI & Vision**: Sliders for YOLO confidence, Face similarity threshold, and Loitering timeout.
    - **Alerts**: Provider selector (Telegram / ntfy / Console), token inputs, "Send Test Alert" button.
    - **Security**: Change admin password form and session duration slider.
  - *Verification*: Test saving camera configuration; verify test alert sends to phone; verify disk retention settings persist across backend restarts.

---

## 4. Verification & Testing Matrix

| Component             | Automated Tests (`pytest` & `vitest`)                                             | Live Manual Verification Check                                                                              |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Timestamp OSD**     | Unit test verifying text placement, bounds checking, and alpha blending execution | Inspect `/video_feed/{id}` and snapshot; verify `Camera Name \| YYYY-MM-DD HH:MM:SS` in top-right corner    |
| **App Navigation**    | TypeScript compiler (`tsc`) & ESLint clean                                        | Verify all 6 routes navigate smoothly; verify mobile bottom navigation bar on mobile screen size            |
| **Camera Grid**       | Component render tests                                                            | Verify `1x1`, `2x2`, `3x3`, `1+5` layouts resize smoothly; test `F` fullscreen                              |
| **Dashboard**         | Component render tests                                                            | Verify Recent Events carousel displays latest events and deep-links into playback                           |
| **Playback Timeline** | Segment resolution and timeline offset tests                                      | Scrub across 15-minute segment boundaries; verify sticky top player on mobile with scrolling timeline below |
| **Detections Search** | Database query tests for text matching, person filtering, date ranges             | Search by person name in UI; switch between Grid and List views                                             |
| **Face Registration** | Enrollment quality gate unit tests                                                | Run circular Face-ID wizard; test 1-click enroll from unknown sighting                                      |
| **Settings Suite**    | API route tests for config updating, camera CRUD, and retention logic             | Update retention days in UI; verify `cameras.json` updates; click "Send Test Alert"                         |

---

## 5. Summary & Next Steps

This plan provides a direct, complete roadmap to bring Aegis to feature-parity with Scrypted NVR while honoring your constraint for **low-cost hardware execution**:

1. **Recent events on top + camera cards** on the Dashboard (`/`).
2. **Top-right Timestamp OSD** (`Camera Name  |  YYYY-MM-DD HH:MM:SS`) with high-contrast pill styling.
3. **Dedicated Camera Grid wall** (`/grid`) with fullscreen and 1+5 focus layout.
4. **Playback Page with Scrypted vertical timeline** (`/playback`) with sticky top player on mobile and scrolling rail below.
5. **Full Mobile Responsiveness**: Fixed bottom navigation bar, safe-area-insets, touch-friendly tap targets, and touch-snapping carousels.
6. **Searchable Detections center** (`/detections`) with dual Grid/List views.
7. **Revamped Face-ID circular HUD & passive learning** (`/faces`).
8. **Complete Settings suite** (`/settings`) with camera CRUD, zone drawing, and test alerts.

Once you approve, we will begin execution starting with **Phase 1 (Timestamp OSD, Navigation Overhaul with Mobile Bottom Bar, and Camera Grid Page)**.

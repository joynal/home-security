# Aegis Vision AI — Evolution Research

> Research findings for scaling Aegis Vision AI from a single-camera prototype to a production-grade multi-camera home security system with recording, smart AI features, and a polished monitoring dashboard.

---

## Table of Contents

1. [Current State & Gaps](#1-current-state--gaps)
2. [Multi-Camera Architecture](#2-multi-camera-architecture)
3. [Video Recording & Storage](#3-video-recording--storage)
4. [AI Pipeline Redesign](#4-ai-pipeline-redesign)
5. [Smart AI Features](#5-smart-ai-features)
6. [Frontend Dashboard](#6-frontend-dashboard)
7. [Reference Projects](#7-reference-projects)
8. [Recommended Roadmap](#8-recommended-roadmap)

---

## 1. Current State & Gaps

### What Works Today
- Single inference thread processes all cameras sequentially
- InsightFace (RetinaFace + ArcFace) for face detection + recognition
- MJPEG streaming via `<img>` tag
- Basic alerting (console + Telegram)
- Face registration with 5-pose wizard

### Critical Gaps for Scaling

| Gap                           | Impact                                                                   |
| ----------------------------- | ------------------------------------------------------------------------ |
| **Single-threaded inference** | Adding cameras linearly degrades FPS — 4 cameras = ~7 FPS each           |
| **No recording**              | Zero video history — can't review past events                            |
| **MJPEG streaming**           | High bandwidth, no seeking, stacks frames into one image                 |
| **No motion detection**       | AI runs on every frame even when nothing is happening                    |
| **No event system**           | Can't browse/search past detections                                      |
| **Monolithic processing**     | One camera failure can crash the entire inference loop                   |
| **No object tracking**        | Face recognition runs on every frame, even for already-identified people |

---

## 2. Multi-Camera Architecture

### Current vs. Proposed

```
CURRENT (Single Thread)                    PROPOSED (Multi-Process)
========================                   ========================

Camera 1 ─┐                               Camera 1 ─→ [Process 1] ─→ SharedMemory ─┐
Camera 2 ─┤→ inference_loop()             Camera 2 ─→ [Process 2] ─→ SharedMemory ─┤
Camera 3 ─┘   (sequential,                Camera 3 ─→ [Process 3] ─→ SharedMemory ─┼→ Inference
               blocks on slow cam)         Camera N ─→ [Process N] ─→ SharedMemory ─┘   Worker(s)
```

### Recommendation: go2rtc as Stream Proxy

> [!IMPORTANT]
> Don't connect directly to cameras from Python. Use **go2rtc** as a stream proxy between cameras and your app.

**Why go2rtc:**
- Single RTSP connection per camera (cameras crash with multiple connections)
- Restreams to multiple consumers (recording, detection, live view)
- Built-in WebRTC support for low-latency browser viewing
- Handles reconnection automatically when cameras drop
- Lightweight Go binary, no dependencies

**Architecture with go2rtc:**

```
┌─────────────┐     RTSP      ┌─────────┐     RTSP/WebRTC    ┌──────────────────┐
│  IP Camera  │──────────────→│ go2rtc  │←──────────────────→│  React Frontend  │
│  (Tapo etc) │               │  proxy  │                    │  (WebRTC player) │
└─────────────┘               └────┬────┘                    └──────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              ┌──────────┐  ┌──────────┐  ┌──────────────┐
              │ FFmpeg   │  │ Detect   │  │ FastAPI      │
              │ Recorder │  │ Process  │  │ API server   │
              │ (15-min  │  │ (sub-    │  │              │
              │ segments)│  │ stream)  │  └──────────────┘
              └──────────┘  └──────────┘
```

### Dual-Stream Strategy (From Frigate)

Every IP camera outputs two streams — use both:

| Stream          | Resolution | FPS | Purpose                                        |
| --------------- | ---------- | --- | ---------------------------------------------- |
| **Main stream** | 1080p/2K   | 15  | Recording to disk (FFmpeg copy, zero CPU)      |
| **Sub-stream**  | 640×360    | 5   | AI detection (low resolution = fast inference) |

> [!TIP]
> This is the single most impactful optimization. Running AI on a 360p sub-stream instead of 1080p reduces compute by **~9x** with negligible accuracy loss for detection.

### Camera Configuration (Proposed)

```python
# src/config.py — proposed camera config format
CAMERAS = [
    {
        "id": "front_door",
        "name": "Front Door",
        "type": "tapo",
        # go2rtc handles the actual RTSP connection
        "go2rtc_stream": "front_door",       # go2rtc stream name
        "detect": {"width": 640, "height": 360, "fps": 5},
        "record": {"enabled": True, "retain_days": 30},
        "zones": [
            {"name": "porch", "coords": [[0,0], [300,0], [300,360], [0,360]]},
        ],
    },
    {
        "id": "backyard",
        "name": "Backyard",
        "type": "tapo",
        "go2rtc_stream": "backyard",
        "detect": {"width": 640, "height": 360, "fps": 5},
        "record": {"enabled": True, "retain_days": 30},
        "zones": [],
    },
]
```

### Per-Camera Process Model

```python
# Proposed: each camera gets its own process
import multiprocessing
from multiprocessing import shared_memory

class CameraWorker(multiprocessing.Process):
    """One process per camera — captures frames into shared memory."""
    
    def __init__(self, camera_config, shm_name, frame_shape):
        super().__init__(daemon=True)
        self.config = camera_config
        self.shm_name = shm_name
        self.frame_shape = frame_shape
    
    def run(self):
        shm = shared_memory.SharedMemory(name=self.shm_name)
        buffer = np.ndarray(self.frame_shape, dtype=np.uint8, buffer=shm.buf)
        cap = cv2.VideoCapture(self.config["rtsp_url"])
        
        while True:
            ret, frame = cap.read()
            if ret:
                resized = cv2.resize(frame, (640, 360))
                np.copyto(buffer, resized)  # Zero-copy write to shared memory
```

---

## 3. Video Recording & Storage

### Strategy: FFmpeg Segment Recording

> [!IMPORTANT]
> Use FFmpeg's segment muxer with `-vcodec copy` — this means **zero CPU usage** for recording since it just copies the raw H.264/H.265 stream to disk files.

**Per-camera FFmpeg process:**

```bash
ffmpeg -hide_banner -loglevel error \
  -rtsp_transport tcp \
  -use_wallclock_as_timestamps 1 \
  -i "rtsp://localhost:8554/front_door" \    # From go2rtc
  -vcodec copy -acodec copy \
  -f segment \
  -segment_time 900 \                        # 15-minute segments
  -segment_format mp4 \
  -segment_atclocktime 1 \
  -strftime 1 \
  "data/recordings/front_door/%Y%m%d_%H%M%S.mp4"
```

### Storage Estimates (30-Day Retention)

| Cameras | Codec | Bitrate | 30-Day Storage |
| ------- | ----- | ------- | -------------- |
| 1       | H.264 | 4 Mbps  | ~1.3 TB        |
| 1       | H.265 | 2 Mbps  | ~650 GB        |
| 4       | H.265 | 2 Mbps  | ~2.6 TB        |
| 8       | H.265 | 2 Mbps  | ~5.2 TB        |

> [!TIP]
> Use **H.265 (HEVC)** cameras — 30-50% smaller files than H.264 with same quality. Most modern Tapo cameras support this.

### Recording Directory Structure

```
data/recordings/
├── front_door/
│   ├── 20260917_080000.mp4      # 15-min segments
│   ├── 20260917_081500.mp4
│   ├── ...
│   └── metadata.db              # SQLite: timestamps, events, thumbnails
├── backyard/
│   └── ...
└── retention.json               # { "default_days": 30, "event_days": 90 }
```

### Retention Cleanup

```python
# Proposed: daily cleanup job
import os, time
from pathlib import Path

def cleanup_recordings(recordings_dir: Path, retain_days: int = 30):
    """Delete recording segments older than retain_days."""
    cutoff = time.time() - (retain_days * 86400)
    deleted = 0
    for camera_dir in recordings_dir.iterdir():
        if not camera_dir.is_dir():
            continue
        for segment in camera_dir.glob("*.mp4"):
            if segment.stat().st_mtime < cutoff:
                segment.unlink()
                deleted += 1
    return deleted
```

### Event-Driven Recording (Advanced)

Instead of continuous recording (expensive), a smarter approach:

| Mode                       | When                   | Quality        | Storage Impact     |
| -------------------------- | ---------------------- | -------------- | ------------------ |
| **Continuous low-quality** | Always                 | 640×360, 2 FPS | ~50 GB/cam/30 days |
| **Event high-quality**     | Motion/person detected | 1080p, 15 FPS  | Varies by activity |
| **Snapshot**               | Each detection event   | Full-res JPEG  | Minimal            |

This hybrid approach can reduce storage by **80%+** compared to continuous full-quality recording.

---

## 4. AI Pipeline Redesign

### Current Pipeline (Expensive)

```
Every frame → InsightFace (detect + recognize) → Alert
```

**Problem**: InsightFace runs on EVERY frame at full resolution, even empty hallways at 3 AM.

### Proposed: Cascading Pipeline (Efficient)

```
Frame → Motion Detect → Object Detect (YOLO) → Face Recognize (ArcFace) → Alert
         (CPU, <1ms)     (only if motion)       (only if person found)
              ↓                  ↓                       ↓
         Skip 95%           Skip 80%                 Skip 70%
         of frames         of motion events       of person detections
                                                  (already tracked)
```

> [!IMPORTANT]
> This cascading approach can reduce AI compute by **95%+** compared to running face recognition on every frame.

### Stage 1: Motion Detection (Gatekeeper)

```python
# Lightweight CPU-only motion detection using background subtraction
class MotionDetector:
    def __init__(self, threshold=25, min_area=500):
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=500, varThreshold=threshold, detectShadows=False
        )
        self.min_area = min_area
    
    def detect(self, frame) -> list[tuple]:
        """Returns list of (x, y, w, h) motion regions, or [] if no motion."""
        mask = self.bg_subtractor.apply(frame)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        return [cv2.boundingRect(c) for c in contours if cv2.contourArea(c) > self.min_area]
```

**Cost**: <1ms per frame on CPU. Eliminates ~95% of frames.

### Stage 2: Object Detection (Filter)

Only when motion is detected, run a lightweight object detector:

| Model        | Size  | Speed (CPU) | Accuracy                   |
| ------------ | ----- | ----------- | -------------------------- |
| **YOLOv8n**  | 6 MB  | ~30ms       | Good enough for person/car |
| **YOLOv11n** | 5 MB  | ~25ms       | Slightly better            |
| YOLO11s      | 18 MB | ~60ms       | Better accuracy            |

```python
# Only detect "person" class to filter out animals, cars, etc.
from ultralytics import YOLO

detector = YOLO("yolov8n.onnx")  # Nano model, ONNX for consistency

def detect_persons(frame):
    results = detector(frame, classes=[0], conf=0.5)  # class 0 = person
    return results[0].boxes  # Only person bounding boxes
```

**Why add YOLO when we already have InsightFace?**
- YOLO is **10x faster** than InsightFace for just detecting "is there a person?"
- InsightFace is expensive because it computes 512-d embeddings — only needed for *recognition*
- YOLO catches persons from behind, at distance, in profile — InsightFace needs a visible face

### Stage 3: Object Tracking (Skip Redundant Recognition)

> [!TIP]
> **ByteTrack** can reduce face recognition calls by ~90% by tracking already-identified people across frames.

```
Frame 1: Person detected → Face recognized as "Joynal" → Track ID #1 = "Joynal"
Frame 2: Track ID #1 still moving → SKIP face recognition (already know it's Joynal)
Frame 3: Track ID #1 still moving → SKIP
...
Frame 50: Track ID #1 lost → Person left scene
Frame 51: New person detected → Face recognition → Track ID #2 = "Unknown" → ALERT
```

**Implementation:**

```python
# pip install supervision  (wraps ByteTrack nicely)
import supervision as sv

tracker = sv.ByteTrack()
identity_cache = {}  # track_id → {"name": "joynal", "last_recognized": timestamp}

def process_with_tracking(frame, detections):
    tracked = tracker.update_with_detections(detections)
    
    for track_id, bbox in tracked:
        if track_id in identity_cache:
            # Already identified — skip expensive face recognition
            name = identity_cache[track_id]["name"]
        else:
            # New person — run face recognition
            face_crop = frame[y:y+h, x:x+w]
            name = recognizer.identify(face_crop)
            identity_cache[track_id] = {"name": name, "last_recognized": time.time()}
    
    return results
```

### Revised Full Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Per-Camera Detection Pipeline                       │
│                                                                             │
│  Sub-stream    Motion         YOLO            ByteTrack      ArcFace       │
│  (360p/5fps) → Detect  ──→  Person?  ──→    Track ID  ──→  Recognize     │
│                 │              │                │              │            │
│              No motion?     No person?      Known ID?      Store result    │
│              → SKIP         → SKIP          → SKIP          in cache       │
│                                                                             │
│  Result: ~95% of compute eliminated                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Smart AI Features

### Tier 1: Easy to Add (Weeks)

| Feature                       | How                                                                | Value                                                                |
| ----------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **Activity Zones**            | Define polygon regions per camera; ignore detections outside zones | Eliminates false alerts from sidewalks, trees                        |
| **Alert Cooldown per Person** | Track last alert time per identity, not globally                   | "Unknown person" alerts every 30s, but don't repeat for known people |
| **Event Log + Search**        | SQLite database: timestamp, camera, person, thumbnail, confidence  | Browse/search past events in the UI                                  |
| **Daily Summary**             | Cron job: count events per camera, generate stats                  | "Today: 12 known entries, 2 unknown alerts"                          |

### Tier 2: Moderate Effort (1-2 Months)

| Feature                  | How                                                           | Value                                          |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------- |
| **Loitering Detection**  | Track how long a person stays in a zone; alert if > threshold | "Person lingering at front door for 5 minutes" |
| **Package Detection**    | YOLO trained on COCO (class "suitcase"/"handbag") + zone      | "Package detected on porch"                    |
| **Person Counting**      | ByteTrack assigns unique IDs → count distinct visitors        | "14 people visited today"                      |
| **Timeline Scrubber**    | Link events to recording segments; seek to timestamp          | Click event → watch the 15-min recording clip  |
| **Multi-camera Handoff** | Same person ID tracked across cameras via face embedding      | "Joynal: Front door 18:05 → Kitchen 18:06"     |

### Tier 3: Advanced (3+ Months)

| Feature                       | How                                                               | Value                         |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| **Anomaly Detection**         | Train baseline of "normal" activity patterns → alert on deviation | "Unusual activity at 3 AM"    |
| **Vehicle Detection**         | YOLO vehicle classes + license plate recognition (PaddleOCR)      | Log cars entering driveway    |
| **Two-Way Audio**             | WebRTC audio channel through go2rtc                               | Talk to visitors from the app |
| **Mobile Push Notifications** | Firebase Cloud Messaging or ntfy.sh                               | Instant alerts on phone       |

---

## 6. Frontend Dashboard

### Current Limitations
- Single MJPEG stream (all cameras stacked into one image)
- No grid view for multiple cameras
- No recording playback
- No event timeline

### Proposed: Multi-Camera Grid Dashboard

**Key changes:**

| Current              | Proposed                                |
| -------------------- | --------------------------------------- |
| MJPEG via `<img>`    | WebRTC via `<video>` (from go2rtc)      |
| Single stacked frame | Responsive grid (1×1, 2×2, 3×3, custom) |
| No recording         | Timeline scrubber + segment playback    |
| No events            | Event sidebar with thumbnails           |

**Recommended libraries:**

| Need               | Library                   | Why                                    |
| ------------------ | ------------------------- | -------------------------------------- |
| Grid layout        | `react-grid-layout`       | Drag-and-drop, resizable camera tiles  |
| Video player       | Native `<video>` + WebRTC | Low latency, native browser support    |
| Recording playback | `hls.js` or native HLS    | Seek through MP4 segments              |
| State management   | `zustand`                 | Lightweight, perfect for camera states |

### Dashboard Layout Concept

```
┌─────────────────────────────────────────────────────────────────────┐
│  🛡 Aegis Vision    [1×1] [2×2] [3×3] [+Add Camera]    👤 admin   │
├────────────┬────────────────────────────────────────────────────────┤
│            │  ┌──────────────┐  ┌──────────────┐                   │
│  CAMERAS   │  │ Front Door   │  │ Backyard     │                   │
│            │  │  [LIVE feed] │  │  [LIVE feed] │                   │
│ 🟢 Front   │  │  WebRTC      │  │  WebRTC      │                   │
│ 🟢 Back    │  └──────────────┘  └──────────────┘                   │
│ 🟢 Garage  │  ┌──────────────┐  ┌──────────────┐                   │
│ 🔴 Kitchen │  │ Garage       │  │ Kitchen      │                   │
│            │  │  [LIVE feed] │  │  [OFFLINE]   │                   │
│ ────────── │  │  WebRTC      │  │              │                   │
│  EVENTS    │  └──────────────┘  └──────────────┘                   │
│            │                                                        │
│ 18:05 👤   │  ┌─ Timeline ────────────────────────────────────────┐ │
│ Unknown    │  │ |····█████····|····██···|····████████····|        │ │
│ Front Door │  │ 00:00    06:00    12:00    18:00   now            │ │
│            │  └──────────────────────────────────────────────────┘ │
│ 17:42 👤   │                                                        │
│ Joynal     │                                                        │
│ Backyard   │                                                        │
├────────────┴────────────────────────────────────────────────────────┤
│  System Armed  │  4 cameras  │  AI: Active  │  Storage: 1.2TB/4TB │
└─────────────────────────────────────────────────────────────────────┘
```

### WebRTC Integration (via go2rtc)

```jsx
// Proposed: WebRTC camera feed component
function CameraFeed({ cameraId }) {
  const videoRef = useRef(null);
  
  useEffect(() => {
    const pc = new RTCPeerConnection();
    
    pc.ontrack = (event) => {
      videoRef.current.srcObject = event.streams[0];
    };
    
    // go2rtc WebRTC signaling
    fetch(`http://localhost:1984/api/webrtc?src=${cameraId}`, {
      method: 'POST',
      body: pc.localDescription.sdp,
    })
    .then(r => r.text())
    .then(sdp => pc.setRemoteDescription({ type: 'answer', sdp }));
    
    return () => pc.close();
  }, [cameraId]);
  
  return <video ref={videoRef} autoPlay muted playsInline />;
}
```

**Benefits over current MJPEG:**
- **~80% less bandwidth** (H.264 compression vs raw JPEG per frame)
- **<200ms latency** (vs ~500ms+ for MJPEG)
- **Native browser controls** (fullscreen, picture-in-picture)
- **Audio support** (MJPEG is video-only)

---

## 7. Reference Projects

| Project                                                                               | What to Learn From It                                                                                                 |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [**Frigate**](https://frigate.video/)                                                 | Dual-stream architecture, go2rtc integration, motion→detect→recognize cascade, event system, recording with retention |
| [**Viseron**](https://viseron.netlify.app/)                                           | Python-native NVR with face recognition, motion detection zones, good reference for our stack                         |
| [**go2rtc**](https://github.com/AlexxIT/go2rtc)                                       | Stream proxy, WebRTC browser delivery, multi-consumer from single camera connection                                   |
| [**Supervision**](https://github.com/roboflow/supervision)                            | Python library wrapping ByteTrack, zone detection, line counting — drop-in tools                                      |
| [**Multi-Cam Face Tracker**](https://github.com/AarambhDevHub/multi-cam-face-tracker) | InsightFace + multi-camera + SQLite logging — closest to our current architecture                                     |

---

## 8. Recommended Roadmap

### Phase 1: Foundation (Core Infrastructure)
> Goal: Scale to N cameras without rewriting everything

- [ ] Integrate **go2rtc** as stream proxy (Docker sidecar or binary)
- [ ] Switch frontend from MJPEG to **WebRTC** playback
- [ ] Refactor camera config to support N cameras declaratively
- [ ] Build **responsive grid view** in the frontend (2×2, 3×3 layouts)
- [ ] Add **per-camera health monitoring** (online/offline status, FPS)

### Phase 2: Recording
> Goal: Never miss anything, keep 30 days

- [ ] Launch **FFmpeg recording** per camera (segment muxer, 15-min MP4s)
- [ ] Build **retention cleanup** (daily cron, configurable days)
- [ ] Add **recording playback** in frontend (segment list → `<video>` player)
- [ ] Create **SQLite event database** (timestamp, camera, type, thumbnail path)
- [ ] Build **timeline scrubber** UI linked to recording segments

### Phase 3: Smart Detection
> Goal: Reduce compute, increase intelligence

- [ ] Add **motion detection** as first filter (cv2 background subtraction)
- [ ] Integrate **YOLOv8n** for person detection (before face recognition)
- [ ] Add **ByteTrack** for object tracking (skip redundant recognition)
- [ ] Implement **activity zones** (polygon regions per camera)
- [ ] Build **event log UI** with search and thumbnails

### Phase 4: Polish & Advanced Features
> Goal: Production-quality smart home security

- [ ] **Loitering detection** (time-in-zone tracking)
- [ ] **Package detection** (YOLO object classes + zone)
- [ ] **Daily summary** notifications
- [ ] **Mobile push** via ntfy.sh or Firebase
- [ ] **Multi-camera person handoff** (track across cameras)
- [ ] **Hardware acceleration** support (CUDA, CoreML, OpenVINO)

---

> [!NOTE]
> Each phase is independently valuable — you get benefits after completing any single phase. Phase 1 is the most impactful for the "monitor many cameras" use case.

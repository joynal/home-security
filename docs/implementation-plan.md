# Aegis Vision AI — Implementation Plan

> Detailed, task-by-task implementation plan for evolving Aegis Vision AI from a single-camera prototype into a production-grade multi-camera home security system. Each task is self-contained with exact file paths, code structure, and verification steps — designed for autonomous agent execution.

---

## Prerequisites

Before starting any phase, ensure:
- Python 3.13 with `uv` working
- Node.js + npm for frontend
- Existing codebase passes `uv run ruff check .` and `cd frontend && npm run lint`
- `.env` file configured with `SECRET_KEY`

---

## Phase 1: Foundation (Multi-Camera + Streaming)

> **Goal**: Support N cameras declaratively, stream via WebRTC, display in a responsive grid dashboard.

---

### Task 1.1: Refactor Camera Configuration

**Description**: Replace the current flat `ACTIVE_CAMERAS` list with a richer, typed camera configuration that supports per-camera settings for detection, recording, zones, and go2rtc stream mapping.

**Files to modify**:
- `src/config.py`

**Files to create**:
- `src/models.py` — Pydantic models for camera config validation

**Implementation**:

1. Create `src/models.py` with Pydantic models:

```python
"""
src/models.py
─────────────
Pydantic models for typed configuration validation.
"""
from pydantic import BaseModel, Field


class DetectConfig(BaseModel):
    width: int = 640
    height: int = 360
    fps: int = 5
    enabled: bool = True


class RecordConfig(BaseModel):
    enabled: bool = True
    retain_days: int = 30
    segment_seconds: int = 900  # 15-minute segments
    delete_only_if_disk_full: bool = True  # If True, never delete if disk has space; only prune oldest when space is low
    min_disk_free_gb: float = 10.0         # Minimum free disk space (GB) on volume before purging oldest
    max_disk_usage_gb: float | None = None # Optional per-camera max disk usage cap (GB)
    source_url: str | None = None          # Dev/testing override for recording input (looped MP4, testsrc, …)
                                          # MUST be declared here: Pydantic silently drops unknown keys from
                                          # cameras.json, so without this field the Task 2.1 getattr() fallback
                                          # can never activate.


class ZoneConfig(BaseModel):
    name: str
    coordinates: list[list[int]]  # [[x1,y1], [x2,y2], ...]


class CameraConfig(BaseModel):
    id: str                           # Unique identifier (e.g., "front_door")
    name: str                         # Human-readable name (e.g., "Front Door")
    type: str                         # "macbook", "tapo", "rtsp"
    enabled: bool = True
    # Connection details
    rtsp_url: str | None = None       # Main stream RTSP URL (1080p — for recording)
    rtsp_sub_url: str | None = None   # Sub-stream RTSP URL (360p — for detection)
    camera_index: int = 0             # For macbook type
    # Sub-configs
    detect: DetectConfig = Field(default_factory=DetectConfig)
    record: RecordConfig = Field(default_factory=RecordConfig)
    zones: list[ZoneConfig] = Field(default_factory=list)


class AppConfig(BaseModel):
    cameras: list[CameraConfig]
    active_alert: str = "console"     # "console" or "telegram"
    secret_key: str
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    # Storage paths — override to point recordings/thumbnails to NAS or external drive
    # When not set, defaults to data/recordings and data/thumbnails (local)
    recordings_dir: str | None = None  # e.g., "/mnt/nas/aegis/recordings"
    thumbnails_dir: str | None = None  # e.g., "/mnt/nas/aegis/thumbnails"
```

2. Update `src/config.py`:
   - Keep existing env loading logic
   - Replace `ACTIVE_CAMERAS` list with parsed `CameraConfig` objects
   - Add a `cameras.json` file loader as alternative to hardcoded config
   - Maintain backward compatibility: if `cameras.json` doesn't exist, fall back to the existing `ACTIVE_CAMERAS` format

```python
# In src/config.py, add:
import json
from src.models import CameraConfig

CAMERAS_FILE = DATA_DIR / "cameras.json"

def load_cameras() -> list[CameraConfig]:
    """Load camera configs from cameras.json, or fall back to legacy format."""
    if CAMERAS_FILE.exists():
        raw = json.loads(CAMERAS_FILE.read_text())
        return [CameraConfig(**c) for c in raw]
    # Legacy fallback — read existing ACTIVE_CAMERAS so Tapo configs aren't silently dropped
    from src.config import ACTIVE_CAMERAS as _legacy
    return [
        CameraConfig(
            id=c.get("name", "cam0").lower().replace(" ", "_"),
            name=c.get("name", "Camera"),
            type=c.get("type", "macbook"),
            rtsp_url=f"rtsp://{c.get('user','admin')}:{c.get('pass','password')}@{c.get('ip','localhost')}:554/stream1"
            if c.get("type") == "tapo" else None,
        )
        for c in _legacy
    ]

CAMERAS: list[CameraConfig] = load_cameras()

# Storage paths — override via env to point to NAS/external drive
# Default: local data/ directory. Override for NAS:
#   RECORDINGS_DIR=/Volumes/NAS/aegis/recordings
#   THUMBNAILS_DIR=/Volumes/NAS/aegis/thumbnails
RECORDINGS_DIR = Path(os.getenv("RECORDINGS_DIR", str(DATA_DIR / "recordings")))
THUMBNAILS_DIR = Path(os.getenv("THUMBNAILS_DIR", str(DATA_DIR / "thumbnails")))
os.makedirs(RECORDINGS_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)
```

3. Create `data/cameras.json.example`:

```json
[
  {
    "id": "macbook_webcam",
    "name": "MacBook Webcam",
    "type": "macbook",
    "camera_index": 0,
    "detect": { "width": 640, "height": 360, "fps": 5 },
    "record": { "enabled": false }
  },
  {
    "id": "front_door",
    "name": "Front Door",
    "type": "tapo",
    "rtsp_url": "rtsp://admin:password@192.168.1.100:554/stream1",
    "rtsp_sub_url": "rtsp://admin:password@192.168.1.100:554/stream2",
    "detect": { "width": 640, "height": 360, "fps": 5 },
    "record": { "enabled": true, "retain_days": 30, "delete_only_if_disk_full": true, "min_disk_free_gb": 10.0 },
    "zones": [
      { "name": "porch", "coordinates": [[0,0], [300,0], [300,360], [0,360]] }
    ]
  }
]
```

**Verification**:
- `uv run ruff check src/models.py src/config.py`
- Existing app still starts with `uv run main.py` (backward compatible)

4. Update `.env.example` with storage overrides:

```env
SECRET_KEY=your-secret-key-here-replace-with-32-characters-or-more
TELEGRAM_BOT_TOKEN="123456789:ABCdefg..."
TELEGRAM_CHAT_ID="-100123456789"

# Storage — override to use NAS or external drive for recordings
# Default: stores in data/recordings and data/thumbnails (local)
# RECORDINGS_DIR=/Volumes/NAS/aegis/recordings
# THUMBNAILS_DIR=/Volumes/NAS/aegis/thumbnails
```

> **NAS / External Storage Setup**:
> The system stores recordings and thumbnails at configurable paths. To use a NAS:
>
> 1. Mount your NAS (SMB/NFS/AFP) to a local path (e.g., `/Volumes/NAS` on macOS, `/mnt/nas` on Linux)
> 2. Set env vars in `.env`:
>    - `RECORDINGS_DIR=/Volumes/NAS/aegis/recordings`
>    - `THUMBNAILS_DIR=/Volumes/NAS/aegis/thumbnails`
> 3. Keep `DATA_DIR` local — credentials and SQLite event DB stay on fast local SSD
>
> This separation ensures the database and auth are fast (local SSD) while bulk video goes to cheap, large NAS storage. No code changes needed — just env vars.

**Dependencies**: None

---

### Task 1.2: Add Pydantic Dependency

**Description**: Add `pydantic` to project dependencies since we're using it for config validation.

**Files to modify**:
- `pyproject.toml`

**Implementation**:

1. Add pydantic to the dependencies list in `pyproject.toml`:

```toml
dependencies = [
    # ... existing deps ...
    "pydantic>=2.10.0",
]
```

2. Run `uv sync` to install.

**Verification**:
- `uv run python -c "from pydantic import BaseModel; print('OK')"`

**Dependencies**: None (do this before or alongside Task 1.1)

---

### Task 1.3: Refactor Inference Loop for Multi-Camera

**Description**: Refactor `inference_loop()` to use the new `CameraConfig` objects and prepare for per-camera independent processing. Each camera should be handled independently so one failing camera doesn't crash others.

**Files to modify**:
- `src/api/inference.py`
- `src/api/state.py`

**Implementation**:

1. Update `src/api/state.py`:
   - Change `active_streams` from `list` to `dict[str, CameraStreamWrapper]` keyed by camera ID
   - Add per-camera status tracking:

```python
# Add to state.py:
camera_status: dict[str, dict] = {}  # camera_id → {online, fps, last_frame_at, error}
camera_status_lock = threading.Lock()

# Pin which camera is used for face registration (avoids ambiguity now that
# active_streams is a dict instead of a list with a fixed index-0 convention)
registration_camera_id: str | None = None  # Set to CAMERAS[0].id at startup
```

2. Update `src/api/inference.py`:
   - Import `CAMERAS` from config (new format) instead of `ACTIVE_CAMERAS`
   - Use `camera_config.id` as the key for streams
   - Wrap per-camera frame processing in try/except so one camera failure doesn't kill the loop
   - Update `build_camera()` to accept `CameraConfig` instead of a raw dict
   - Track per-camera health (online/offline, FPS, last frame time)

```python
def build_camera(config: CameraConfig) -> CameraSource:
    """Instantiate a camera from its typed config."""
    if config.type == "macbook":
        return MacbookWebcam(camera_index=config.camera_index)
    if config.type in ("tapo", "rtsp"):
        if not config.rtsp_url:
            raise ValueError(f"Camera '{config.id}' requires rtsp_url")
        # Parse RTSP URL components for TapoCamera
        # Or better: make TapoCamera accept a full URL directly
        return TapoCamera(rtsp_url=config.rtsp_url)
    raise ValueError(f"Unknown camera type: {config.type}")
```

3. Update `TapoCamera.__init__` to also accept a direct `rtsp_url` parameter (simpler than parsing user/pass/ip separately):

In `src/camera/tapo.py`, modify the constructor:

```python
class TapoCamera(CameraSource):
    def __init__(self, rtsp_url: str = None, *, username=None, password=None, ip_address=None, port=554, stream=1):
        if rtsp_url:
            self.rtsp_url = rtsp_url
        else:
            self.rtsp_url = f"rtsp://{username}:{password}@{ip_address}:{port}/stream{stream}"
        self.cap = None
```

4. Refactor the main `inference_loop()` body:
   - Iterate `CAMERAS` config list
   - Build cameras using new config
   - Per-camera try/except blocks
   - Update `camera_status` dict with health info

**Verification**:
- App starts successfully with existing single-camera setup
- No ruff errors
- Camera status dict is populated after startup

**Dependencies**: Task 1.1, Task 1.2

---

### Task 1.4: Camera List & Status API Endpoints

**Description**: Update the `/cameras` endpoint to return richer camera info (id, name, type, online status, FPS) and add a new `/cameras/{id}/status` endpoint.

**Files to modify**:
- `src/api/routers/stream.py`

**Implementation**:

1. Update `GET /cameras` to use new `CAMERAS` config and include live status:

```python
@router.get("/cameras")
def list_cameras(_: str = Depends(get_current_user)):
    """Return list of cameras with live status."""
    from src.config import CAMERAS
    result = []
    for cam in CAMERAS:
        with state.camera_status_lock:
            status = state.camera_status.get(cam.id, {})
        result.append({
            "id": cam.id,
            "name": cam.name,
            "type": cam.type,
            "enabled": cam.enabled,
            "online": status.get("online", False),
            "fps": status.get("fps", 0),
            "last_frame_at": status.get("last_frame_at"),
            "detect": {"width": cam.detect.width, "height": cam.detect.height, "fps": cam.detect.fps},
            "record": {"enabled": cam.record.enabled, "retain_days": cam.record.retain_days},
        })
    return {"cameras": result}
```

2. Add `GET /cameras/{camera_id}/status` endpoint for detailed single-camera status.

**Verification**:
- `curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/cameras` returns enriched camera list
- Frontend still loads camera list correctly

**Dependencies**: Task 1.3

---

### Task 1.5: Per-Camera Video Feed Endpoints

**Description**: Currently `/video_feed` serves a single stacked MJPEG stream of all cameras. Refactor to support per-camera feeds: `GET /video_feed/{camera_id}`. Keep the old combined endpoint as `/video_feed/grid` for backward compatibility.

**Files to modify**:
- `src/api/routers/stream.py`
- `src/api/state.py`

**Implementation**:

1. Update `state.py`:
   - Replace `latest_grid_frame` (single frame) with `latest_frames: dict[str, np.ndarray]` (per-camera)
   - Keep `latest_grid_frame` for backward compat grid view
   - Add the pre-encoded JPEG cache — this is what the generators below actually serve
   - Use a single lock guarding both dicts

```python
# In state.py, add:
latest_frames: dict[str, np.ndarray] = {}  # camera_id → latest annotated frame (BGR)
latest_jpeg_bytes: dict[str, bytes] = {}   # camera_id → JPEG encoded ONCE per camera per loop
frames_lock = threading.Lock()  # Single lock guarding both dicts
```

2. Update `inference.py` to store per-camera frames in `state.latest_frames[camera_id]` **and encode each camera's JPEG once per loop iteration**, writing the bytes to `state.latest_jpeg_bytes[camera_id]`. The MJPEG generators must serve these cached bytes — encoding per connected client (i.e., inside each generator) is exactly the bug this design avoids.

3. Add per-camera MJPEG endpoint in `stream.py`:

> **Performance note**: Encode JPEG **once per camera** in the inference loop and cache the bytes in `state.latest_jpeg_bytes[camera_id]`. Each connected browser's generator then serves the pre-encoded bytes — no per-client re-encoding. This is especially important with multiple viewers.

```python
@router.get("/video_feed/{camera_id}")
def video_feed_camera(camera_id: str, token: str = Query(...)):
    """MJPEG stream for a single camera."""
    verify_token_param(token)
    
    def generate():
        while True:
            with state.frames_lock:
                jpeg_bytes = state.latest_jpeg_bytes.get(camera_id)
            if jpeg_bytes is not None:
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
            time.sleep(0.05)
    
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")
```

4. Rename old `/video_feed` to `/video_feed/grid` (keep original path too for backward compat).

**Verification**:
- `http://localhost:8000/video_feed/macbook_webcam?token=...` shows single camera feed
- `http://localhost:8000/video_feed?token=...` still works (backward compat)
- Frontend still works with existing feed

**Dependencies**: Task 1.3

---

### Task 1.6: Frontend — Multi-Camera Grid View

**Description**: Redesign the main dashboard to show a responsive grid of camera feeds. Each camera gets its own `<img>` tile (MJPEG initially, WebRTC later). Support 1×1, 2×2, and auto layouts.

**Files to modify**:
- `frontend/src/App.jsx`
- `frontend/src/index.css`

**Files to create**:
- `frontend/src/components/CameraGrid.jsx`
- `frontend/src/components/CameraGrid.css`
- `frontend/src/components/CameraTile.jsx`
- `frontend/src/components/CameraTile.css`

**Implementation**:

1. Create `frontend/src/components/CameraTile.jsx`:

```jsx
/**
 * Single camera tile — displays MJPEG feed with status overlay.
 * Props: camera (object), token (string), isExpanded (bool), onExpand (func)
 */
import { useState } from 'react';
import './CameraTile.css';

const API = 'http://localhost:8000';

export default function CameraTile({ camera, token, isExpanded, onExpand }) {
  const [hasError, setHasError] = useState(false);
  const feedUrl = `${API}/video_feed/${camera.id}?token=${encodeURIComponent(token)}`;

  return (
    <div 
      className={`camera-tile ${isExpanded ? 'camera-tile--expanded' : ''} ${!camera.online ? 'camera-tile--offline' : ''}`}
      onClick={() => onExpand(camera.id)}
    >
      {/* Status badge */}
      <div className="camera-tile__status">
        <span className={`camera-tile__dot ${camera.online ? 'camera-tile__dot--online' : ''}`} />
        <span className="camera-tile__name">{camera.name}</span>
      </div>

      {/* Feed */}
      {camera.online && !hasError ? (
        <img 
          src={feedUrl} 
          alt={camera.name} 
          className="camera-tile__feed"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="camera-tile__offline-msg">
          <span>📷</span>
          <p>{hasError ? 'Feed unavailable' : 'Camera offline'}</p>
        </div>
      )}

      {/* Info strip */}
      <div className="camera-tile__info">
        <span>{camera.type.toUpperCase()}</span>
        {camera.online && <span>{camera.fps} FPS</span>}
      </div>
    </div>
  );
}
```

2. Create `frontend/src/components/CameraGrid.jsx`:

```jsx
/**
 * Responsive grid layout for multiple camera feeds.
 * Auto-calculates grid columns based on camera count.
 * Supports expanding a single camera to full view.
 */
import { useState } from 'react';
import CameraTile from './CameraTile';
import './CameraGrid.css';

export default function CameraGrid({ cameras, token }) {
  const [expandedId, setExpandedId] = useState(null);
  
  const handleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  // If a camera is expanded, show only that one
  if (expandedId) {
    const cam = cameras.find(c => c.id === expandedId);
    if (cam) {
      return (
        <div className="camera-grid camera-grid--single">
          <CameraTile 
            camera={cam} 
            token={token} 
            isExpanded={true}
            onExpand={handleExpand}
          />
        </div>
      );
    }
  }

  // Auto grid columns: 1 cam = 1col, 2-4 = 2col, 5-9 = 3col, 10+ = 4col
  const cols = cameras.length <= 1 ? 1 : cameras.length <= 4 ? 2 : cameras.length <= 9 ? 3 : 4;

  return (
    <div className="camera-grid" style={{ '--grid-cols': cols }}>
      {cameras.map(cam => (
        <CameraTile 
          key={cam.id}
          camera={cam} 
          token={token}
          isExpanded={false}
          onExpand={handleExpand}
        />
      ))}
    </div>
  );
}
```

3. Create CSS files for `CameraGrid.css` and `CameraTile.css`:
   - Grid uses CSS Grid with `grid-template-columns: repeat(var(--grid-cols), 1fr)`
   - Tiles have aspect-ratio: 16/9, dark background, rounded corners
   - Expanded tile fills the entire grid area
   - Offline tiles show a dimmed state
   - Status dot (green = online, red = offline) in top-left corner

4. Update `App.jsx`:
   - Remove the single `<img src={videoUrl}>` approach
   - Import and render `<CameraGrid cameras={cameras} token={token} />`
   - Pass the enriched camera data from the updated `/cameras` endpoint
   - Remove the old `CameraCard` sidebar component or repurpose it for the sidebar camera list

**Verification**:
- With 1 camera: shows single full-width feed
- With 2-4 cameras: shows 2×2 grid
- Clicking a tile expands it to full view, clicking again returns to grid
- Offline cameras show graceful placeholder
- `cd frontend && npm run lint` passes

**Dependencies**: Task 1.5

---

### Task 1.7: Frontend — Sidebar Camera List with Status

**Description**: Update the sidebar to show real-time camera status (online/offline dot, FPS counter) by polling the `/cameras` endpoint periodically.

**Files to modify**:
- `frontend/src/App.jsx`

**Implementation**:

1. Add a polling `useEffect` that refetches `/cameras` every 10 seconds to update camera status:

```jsx
useEffect(() => {
  if (!token) return;
  const fetchCameras = () => {
    fetch(`${API}/cameras`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setCameras(data.cameras))
      .catch(() => {});
  };
  fetchCameras();
  const interval = setInterval(fetchCameras, 10000);
  return () => clearInterval(interval);
}, [token, authHeaders]);
```

2. Update sidebar camera list items to show:
   - Green/red dot for online/offline
   - FPS counter next to camera name
   - Camera type badge

**Verification**:
- Sidebar shows green dots for running cameras
- FPS updates every 10 seconds
- Stopping a camera shows it as offline within 10-20 seconds

**Dependencies**: Task 1.4, Task 1.6

---

### Task 1.8: Add go2rtc Integration (Required — Phase 2 Prerequisite)

**Description**: Add go2rtc as a stream proxy. Both detection (OpenCV) and recording (FFmpeg) connect to `rtsp://localhost:8554/{camera_id}` instead of the camera directly. This is **required** — Tapo cameras tolerate very few concurrent RTSP sessions, and without go2rtc, detection + recording would open 2+ connections per camera, causing crashes and reconnect storms. go2rtc also provides auto-reconnect for free.

> [!IMPORTANT]
> This was originally marked "Optional Enhancement" but is promoted to **required** because Task 2.1 (recording) and the detection pipeline both need a single stream proxy. Without it, the system opens multiple direct RTSP connections per camera, which Tapo cameras cannot handle.

**Files to create**:
- `src/go2rtc.py` — go2rtc config generator and process manager
- `go2rtc.yaml.example` — Example go2rtc config

**Implementation**:

1. Create `go2rtc.yaml.example`:

```yaml
# go2rtc configuration — auto-generated from cameras.json
# Install: https://github.com/AlexxIT/go2rtc
# Run: go2rtc -config go2rtc.yaml

streams:
  front_door:
    - rtsp://admin:password@192.168.1.100:554/stream1
  backyard:
    - rtsp://admin:password@192.168.1.101:554/stream1

webrtc:
  listen: ":8555"

api:
  listen: ":1984"
```

2. Create `src/go2rtc.py`:

```python
"""
src/go2rtc.py
─────────────
Generates go2rtc config from camera settings and manages the go2rtc process.
"""
import subprocess
import yaml
from pathlib import Path
from src.config import CAMERAS, BASE_DIR

GO2RTC_CONFIG = BASE_DIR / "go2rtc.yaml"

def generate_go2rtc_config():
    """Generate go2rtc.yaml from camera configs."""
    streams = {}
    for cam in CAMERAS:
        if cam.type in ("tapo", "rtsp") and cam.rtsp_url:
            streams[cam.id] = [cam.rtsp_url]
    
    config = {
        "streams": streams,
        "webrtc": {"listen": "127.0.0.1:8555"},  # Bind to localhost — proxy via FastAPI
        "api": {"listen": "127.0.0.1:1984"},       # Bind to localhost to prevent unauthenticated access
    }
    GO2RTC_CONFIG.write_text(yaml.dump(config, default_flow_style=False))
    return GO2RTC_CONFIG

def check_go2rtc_available() -> bool:
    """Check if go2rtc binary is available."""
    try:
        subprocess.run(["go2rtc", "--version"], capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
```

3. Add `pyyaml` to `pyproject.toml` dependencies.

4. In `main.py` lifespan, start go2rtc and **shut it down on exit**:

```python
go2rtc_proc = None
if check_go2rtc_available():
    generate_go2rtc_config()
    go2rtc_proc = subprocess.Popen(["go2rtc", "-config", str(GO2RTC_CONFIG)])
    print("go2rtc started for stream proxying")
else:
    print("[WARN] go2rtc not found — recording and multi-stream won't work for RTSP cameras")

yield  # App runs

if go2rtc_proc:
    go2rtc_proc.terminate()
    try:
        go2rtc_proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        go2rtc_proc.kill()
```

> [!WARNING]
> **Security**: go2rtc's WebRTC and API ports are now bound to `127.0.0.1` so they are not directly accessible from the LAN. If you need LAN-direct WebRTC (bypassing FastAPI), you must explicitly bind to `0.0.0.0` and accept that video flows without JWT auth — document this exposure decision.

**Verification**:
- If go2rtc is installed: generates config, starts process, streams available at `http://localhost:1984`
- If go2rtc is NOT installed: app starts normally, falls back to MJPEG
- `uv run ruff check src/go2rtc.py`

**Dependencies**: Task 1.1

---

## Phase 2: Recording & Playback

> **Goal**: Record all camera feeds to disk, keep 30 days, and enable playback in the UI.
>
> **Prerequisite**: Task 1.8 (go2rtc) must be completed first. Recording reads from `rtsp://localhost:8554/{camera_id}` via go2rtc, not from cameras directly.

---

### Task 2.1: FFmpeg Recording Manager

**Description**: Create a recording manager that spawns one FFmpeg process per camera, recording the main stream into 15-minute MP4 segments using stream copy (zero CPU encoding).

**Files to create**:
- `src/recording/__init__.py`
- `src/recording/recorder.py`
- `src/recording/retention.py`

**Implementation**:

1. Create `src/recording/recorder.py`:

```python
"""
src/recording/recorder.py
──────────────────────────
Manages FFmpeg recording processes — one per camera.
Records RTSP streams into 15-minute MP4 segments using stream copy (zero CPU).
"""
import shutil
import subprocess
import threading
import time
from pathlib import Path
from src.config import RECORDINGS_DIR  # env-overridable (Task 1.1) — recorder writes here,
                                        # recordings API serves from here. Never hardcode DATA_DIR / "recordings".
from src.models import CameraConfig


def _check_ffmpeg_available() -> bool:
    """Check if ffmpeg binary is installed."""
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, timeout=5)
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


class CameraRecorder:
    """Manages FFmpeg recording for a single camera."""
    
    def __init__(self, config: CameraConfig):
        self.config = config
        self.process: subprocess.Popen | None = None
        self.is_running = False
        self._monitor_thread: threading.Thread | None = None
        self.output_dir = RECORDINGS_DIR / config.id
        self.output_dir.mkdir(parents=True, exist_ok=True)
        # Determine source URL: go2rtc proxy (single connection per camera — see Task 1.8).
        # record.source_url overrides for dev testing (ffmpeg testsrc, looped mp4) —
        # see the Dev testing note at the end of this task.
        self.source_url = config.record.source_url or f"rtsp://localhost:8554/{config.id}"
    
    def start(self):
        """Start FFmpeg recording process."""
        if not self.config.record.enabled:
            print(f"[Recorder] Skipping {self.config.id} (recording disabled)")
            return
        if not _check_ffmpeg_available():
            print(f"[Recorder] ERROR: ffmpeg binary not found — cannot record {self.config.id}")
            return
        
        self.is_running = True
        self._monitor_thread = threading.Thread(
            target=self._run_with_restart, daemon=True, name=f"Recorder-{self.config.id}"
        )
        self._monitor_thread.start()
    
    def _build_ffmpeg_cmd(self) -> list[str]:
        """Build the FFmpeg command for segment recording."""
        output_pattern = str(self.output_dir / "%Y%m%d_%H%M%S.mp4")
        return [
            "ffmpeg",
            "-hide_banner", "-loglevel", "error",
            "-rtsp_transport", "tcp",
            "-use_wallclock_as_timestamps", "1",
            "-i", self.source_url,  # go2rtc proxy, not camera directly
            "-vcodec", "copy",
            "-acodec", "copy",
            "-f", "segment",
            "-segment_time", str(self.config.record.segment_seconds),
            "-segment_format", "mp4",
            "-segment_atclocktime", "1",
            "-strftime", "1",
            "-reset_timestamps", "1",
            output_pattern,
        ]
    
    def _run_with_restart(self):
        """Run FFmpeg and auto-restart on crash (with backoff)."""
        backoff = 5
        while self.is_running:
            cmd = self._build_ffmpeg_cmd()
            print(f"[Recorder] Starting FFmpeg for {self.config.id}")
            try:
                # Use stderr=DEVNULL to prevent pipe deadlock:
                # With PIPE + wait(), if ffmpeg writes enough stderr the pipe fills,
                # ffmpeg blocks, and wait() never returns.
                self.process = subprocess.Popen(
                    cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                )
                self.process.wait()
                if self.is_running:
                    print(f"[Recorder] FFmpeg exited for {self.config.id} (code={self.process.returncode})")
            except Exception as e:
                print(f"[Recorder] FFmpeg error for {self.config.id}: {e}")
            
            # Piggyback retention cleanup: each segment is ~15 min, so this
            # runs every ~15 min per camera — no dedicated cleanup thread needed.
            self._cleanup_old_segments()
            
            if self.is_running:
                print(f"[Recorder] Restarting {self.config.id} in {backoff}s...")
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)  # Exponential backoff, max 60s
    
    def _cleanup_old_segments(self):
        """
        Delete recording segments based on retention and disk-space policy.
        - If delete_only_if_disk_full is True (default):
          Only delete oldest segments if free disk space < min_disk_free_gb
          or camera storage exceeds max_disk_usage_gb. As long as disk has space,
          footage is preserved even past retain_days!
        - If delete_only_if_disk_full is False:
          Strictly delete segments older than retain_days.
        """
        cfg = self.config.record
        if not self.output_dir.exists():
            return

        segments = sorted(self.output_dir.glob("*.mp4"), key=lambda f: f.stat().st_mtime)
        if not segments:
            return

        now = time.time()
        cutoff = now - (cfg.retain_days * 86400)

        # Check drive-level free space on the output volume
        try:
            _, _, free_bytes = shutil.disk_usage(self.output_dir)
            free_gb = free_bytes / (1024**3)
        except OSError:
            free_gb = float("inf")

        # Total space used by this camera
        cam_bytes = sum(f.stat().st_size for f in segments if f.exists())
        cam_gb = cam_bytes / (1024**3)

        deleted = 0
        freed = 0

        if cfg.delete_only_if_disk_full:
            # Only prune if disk free space is low or per-camera max cap is exceeded
            needs_space = (free_gb < cfg.min_disk_free_gb) or (
                cfg.max_disk_usage_gb is not None and cam_gb > cfg.max_disk_usage_gb
            )
            if not needs_space:
                return  # Ample space available — no deletion!

            # Prune oldest segments first until free space is restored
            for segment in segments:
                if (free_gb >= cfg.min_disk_free_gb) and (
                    cfg.max_disk_usage_gb is None or cam_gb <= cfg.max_disk_usage_gb
                ):
                    break
                try:
                    stat = segment.stat()
                    size = stat.st_size
                    segment.unlink()
                    deleted += 1
                    freed += size
                    free_gb += size / (1024**3)
                    cam_gb -= size / (1024**3)
                except OSError:
                    pass
        else:
            # Strict time-based cutoff
            for segment in segments:
                try:
                    stat = segment.stat()
                    if stat.st_mtime < cutoff:
                        freed += stat.st_size
                        segment.unlink()
                        deleted += 1
                except OSError:
                    pass

        if deleted:
            print(f"[Retention] {self.config.id}: pruned {deleted} segments, freed {freed / (1024*1024):.1f} MB (free: {free_gb:.1f} GB)")
    
    def stop(self):
        """Stop recording."""
        self.is_running = False
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()


class RecordingManager:
    """Manages recorders for all cameras."""
    
    def __init__(self, cameras: list[CameraConfig]):
        self.recorders = {cam.id: CameraRecorder(cam) for cam in cameras if cam.record.enabled}
    
    def start_all(self):
        for recorder in self.recorders.values():
            recorder.start()
        print(f"[RecordingManager] Started {len(self.recorders)} recorders")
    
    def stop_all(self):
        for recorder in self.recorders.values():
            recorder.stop()
    
    def cleanup_all(self):
        """One-time cleanup sweep — call at startup to clear old segments from downtime."""
        for recorder in self.recorders.values():
            recorder._cleanup_old_segments()
    
    def get_status(self) -> dict:
        return {
            cam_id: {
                "recording": rec.is_running and rec.process is not None and rec.process.poll() is None,
                "output_dir": str(rec.output_dir),
            }
            for cam_id, rec in self.recorders.items()
        }
```

2. Wire into `main.py` lifespan:

```python
from src.recording.recorder import RecordingManager
from src.config import CAMERAS

# In lifespan:
recording_manager = RecordingManager(CAMERAS)
recording_manager.cleanup_all()   # One-time startup sweep for stragglers from downtime
recording_manager.start_all()
yield
recording_manager.stop_all()
```

3. Add recording manager reference to `state.py`:

```python
recording_manager: RecordingManager | None = None
```

**Verification**:
- With a Tapo camera configured, an FFmpeg process starts and creates MP4 segments in `data/recordings/<camera_id>/`
- Segments are ~15 minutes each (or shorter if camera connection drops)
- For macbook cameras without RTSP, recorder is skipped gracefully
- FFmpeg auto-restarts if the camera stream drops
- `uv run ruff check src/recording/`

> **Dev testing**: The only camera in a typical dev setup (macbook) has no RTSP URL, so recording is skipped. To test Phase 2 without a Tapo camera, add `source_url` to the `record` config — e.g., a looped MP4 file (`-stream_loop -1 -re -i test.mp4`) or an ffmpeg test source. This way the recording pipeline is verifiable in any environment.

**Dependencies**: Task 1.1, Task 1.2

---

### Task 2.2: Retention Strategy (Disk-Space Controlled & No Dedicated Thread)

> [!NOTE]
> **Ordering**: numbered before Task 2.3 but depends on it — implement Task 2.3 (events DB) first. This task is mostly spec: the recorder-side cleanup already ships inside Task 2.1's `CameraRecorder._cleanup_old_segments()`, and the event/thumbnail cleanup ships inside Task 2.3's `EventDatabase.delete_older_than()`. Verify both against the policy below.

**Description**: Automatic cleanup of old data without a dedicated background thread, **controlled by disk space configuration**. If the disk has plenty of free space, footage is kept even past `retain_days` — nothing is deleted needlessly!

**Configuration options in `RecordConfig`**:
- `delete_only_if_disk_full: bool = True` (default: preserve recordings as long as there is room)
- `min_disk_free_gb: float = 10.0` (minimum free space on disk volume before purging oldest files)
- `max_disk_usage_gb: float | None = None` (optional per-camera storage quota cap)
- `retain_days: int = 30` (used as strict cutoff only if `delete_only_if_disk_full: False`)

| Data | Cleanup Mechanism | Policy / Trigger |
|------|-------------------|------------------|
| Recording segments | `CameraRecorder._cleanup_old_segments()` | After each FFmpeg rotation (~15 min) + startup sweep. Only purges oldest if disk is low or camera quota exceeded. |
| SQLite events & Thumbnails | `EventDatabase.delete_older_than()` | Purges oldest events + unlinks thumbnail files only when disk free space < `min_disk_free_gb`. |

> [!TIP]
> **Why this design**:
> 1. **No wasted disk capacity**: If you have 500GB of free space, deleting 31-day-old clips makes no sense. The system retains footage until space is actually needed.
> 2. **Oldest-first purging**: When disk free space falls below `min_disk_free_gb` (or camera exceeds `max_disk_usage_gb`), it deletes the oldest segments one by one until safe thresholds are restored.
> 3. **Zero background threads**: Piggybacked onto the recorder's segment rotation loop and startup sweep.

**Verification**:
- With `delete_only_if_disk_full: True` and ample disk space, files older than `retain_days` are NOT deleted.
- Simulate low disk space (or set `min_disk_free_gb` high) → oldest segments are purged first until threshold is satisfied.
- With `delete_only_if_disk_full: False`, strict `retain_days` cutoff is enforced.
- Thumbnails for purged events are unlinked from disk without leaving orphaned files.

**Dependencies**: Task 2.1, Task 2.3

---

### Task 2.3: SQLite Event Database

**Description**: Create a SQLite database to store detection events (unknown face detected, known person seen, motion events). Each event has a timestamp, camera, event type, person name (if recognized), confidence, and optional thumbnail path.

**Files to create**:
- `src/events/__init__.py`
- `src/events/database.py`
- `src/events/models.py`

**Implementation**:

1. Create `src/events/models.py`:

```python
"""Event data models."""
from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass
class DetectionEvent:
    camera_id: str
    event_type: str          # "unknown_face", "known_face", "person_detected", "motion"
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    person_name: str | None = None
    confidence: float = 0.0
    thumbnail_path: str | None = None
    recording_segment: str | None = None  # Link to the MP4 segment
    metadata: str = ""       # JSON string for extra data
```

> [!IMPORTANT]
> **All timestamps are UTC.** Using `datetime.now()` (naive local time) causes bugs when API filters carry timezone-aware ISO strings — lexicographic SQL comparison breaks across offsets. Store UTC everywhere; convert to local time only in the frontend display layer.

2. Create `src/events/database.py`:

```python
"""
src/events/database.py
──────────────────────
SQLite event storage for detection events.
Thread-safe: uses a single connection with a lock.
"""
import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from src.config import DATA_DIR
from src.events.models import DetectionEvent

DB_PATH = DATA_DIR / "events.db"


class EventDatabase:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()
    
    def _init_db(self):
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    camera_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    person_name TEXT,
                    confidence REAL DEFAULT 0.0,
                    thumbnail_path TEXT,
                    recording_segment TEXT,
                    metadata TEXT DEFAULT '',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_events_camera ON events(camera_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)")
            conn.commit()
            conn.close()
    
    def insert(self, event: DetectionEvent) -> int:
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            cursor = conn.execute(
                """INSERT INTO events (camera_id, event_type, timestamp, person_name,
                   confidence, thumbnail_path, recording_segment, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (event.camera_id, event.event_type, event.timestamp.isoformat(),
                 event.person_name, event.confidence, event.thumbnail_path,
                 event.recording_segment, event.metadata),
            )
            conn.commit()
            event_id = cursor.lastrowid
            conn.close()
            return event_id
    
    def query(
        self,
        camera_id: str | None = None,
        event_type: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Query events with optional filters."""
        conditions = []
        params = []
        
        if camera_id:
            conditions.append("camera_id = ?")
            params.append(camera_id)
        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        if since:
            conditions.append("timestamp >= ?")
            params.append(since.isoformat())
        if until:
            conditions.append("timestamp <= ?")
            params.append(until.isoformat())
        
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                f"SELECT * FROM events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
                params + [limit, offset],
            ).fetchall()
            conn.close()
            return [dict(row) for row in rows]
    
    def count(
        self,
        camera_id: str | None = None,
        event_type: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
    ) -> int:
        conditions = []
        params = []
        if camera_id:
            conditions.append("camera_id = ?")
            params.append(camera_id)
        if event_type:
            conditions.append("event_type = ?")
            params.append(event_type)
        if since:
            conditions.append("timestamp >= ?")
            params.append(since.isoformat())
        if until:
            conditions.append("timestamp <= ?")
            params.append(until.isoformat())
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            count = conn.execute(f"SELECT COUNT(*) FROM events {where}", params).fetchone()[0]
            conn.close()
            return count
    
    def get_by_id(self, event_id: int) -> dict | None:
        """Fetch a single event by ID."""
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
            conn.close()
            return dict(row) if row else None
    
    def delete_older_than(
        self,
        days: int = 30,
        only_if_disk_full: bool = True,
        min_disk_free_gb: float = 10.0,
    ) -> int:
        """
        Delete events older than N days and their thumbnail files.
        If only_if_disk_full is True (default), skip deletion if disk has ample space (free >= min_disk_free_gb).
        """
        import shutil
        from datetime import timedelta
        from pathlib import Path

        if only_if_disk_full:
            try:
                _, _, free_bytes = shutil.disk_usage(self.db_path.parent)
                free_gb = free_bytes / (1024**3)
                if free_gb >= min_disk_free_gb:
                    return 0  # Ample space, keep events and thumbnails!
            except OSError:
                pass

        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with self._lock:
            conn = sqlite3.connect(str(self.db_path))
            # Collect thumbnail paths before deleting rows
            thumbs = conn.execute(
                "SELECT thumbnail_path FROM events WHERE timestamp < ? AND thumbnail_path IS NOT NULL",
                (cutoff,),
            ).fetchall()
            cursor = conn.execute("DELETE FROM events WHERE timestamp < ?", (cutoff,))
            conn.commit()
            deleted = cursor.rowcount
            conn.close()
        # Cascade: delete thumbnail files from disk
        for (thumb_path,) in thumbs:
            try:
                Path(thumb_path).unlink(missing_ok=True)
            except OSError:
                pass
        return deleted
```

3. Add event database to `state.py`:

```python
from src.events.database import EventDatabase
event_db: EventDatabase | None = None
```

4. Initialize in `inference_loop()` startup:

```python
state.event_db = EventDatabase()
```

5. Update inference loop to log events when unknown faces are detected:

```python
# In the alert section of inference_loop():
if unknown_detected and state.event_db:
    # Save thumbnail — use THUMBNAILS_DIR from config (env-overridable). Never hardcode
    # DATA_DIR / "thumbnails": the /events/{id}/thumbnail endpoint validates paths against
    # THUMBNAILS_DIR, so a hardcoded write path breaks when the env override is set.
    thumb_dir = THUMBNAILS_DIR / camera_id
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    cv2.imwrite(str(thumb_path), trigger_frame)
    
    event = DetectionEvent(
        camera_id=camera_id,
        event_type="unknown_face",
        thumbnail_path=str(thumb_path),
    )
    state.event_db.insert(event)
```

**Verification**:
- `data/events.db` is created on startup
- Unknown face detections are logged to the database
- `EventDatabase.query()` returns stored events
- Thread-safe: no SQLite locking errors during concurrent access

**Dependencies**: Task 1.3

---

### Task 2.4: Events API Endpoints

**Description**: Create API endpoints to query events for the frontend — list events, get event details, get event thumbnails.

**Files to create**:
- `src/api/routers/events.py`

**Files to modify**:
- `main.py` (add events router)

**Implementation**:

1. Create `src/api/routers/events.py`:

```python
"""
src/api/routers/events.py
─────────────────────────
Event log API:
  GET /events          — list events with filters
  GET /events/summary  — counts by type and camera
  GET /events/{id}/thumbnail — serve event thumbnail image
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pathlib import Path

import src.api.state as state
from src.api.auth import get_current_user, verify_token_param

router = APIRouter(prefix="/events")


@router.get("")
def list_events(
    camera_id: str | None = None,
    event_type: str | None = None,
    since: str | None = None,      # ISO format
    until: str | None = None,      # ISO format
    limit: int = Query(50, le=500),
    offset: int = 0,
    _: str = Depends(get_current_user),
):
    """List detection events with optional filters."""
    if not state.event_db:
        return {"events": [], "total": 0}
    
    since_dt = datetime.fromisoformat(since) if since else None
    until_dt = datetime.fromisoformat(until) if until else None
    
    events = state.event_db.query(
        camera_id=camera_id, event_type=event_type,
        since=since_dt, until=until_dt, limit=limit, offset=offset,
    )
    total = state.event_db.count(
        camera_id=camera_id, event_type=event_type,
        since=since_dt, until=until_dt,
    )
    
    return {"events": events, "total": total}


@router.get("/summary")
def event_summary(_: str = Depends(get_current_user)):
    """Return event counts grouped by type."""
    if not state.event_db:
        return {"summary": {}}
    
    return {
        "summary": {
            "unknown_face": state.event_db.count(event_type="unknown_face"),
            "known_face": state.event_db.count(event_type="known_face"),
            "person_detected": state.event_db.count(event_type="person_detected"),
            "total": state.event_db.count(),
        }
    }


@router.get("/{event_id}/thumbnail")
def get_event_thumbnail(event_id: int, token: str):
    """Serve event thumbnail image. Uses query-param token for <img> compatibility."""
    verify_token_param(token)
    if not state.event_db:
        raise HTTPException(status_code=404, detail="Event system not initialized")
    
    event = state.event_db.get_by_id(event_id)
    if not event or not event.get("thumbnail_path"):
        raise HTTPException(status_code=404, detail="Event or thumbnail not found")
    
    thumb_path = Path(event["thumbnail_path"]).resolve()
    # Path traversal protection: ensure the resolved path is inside the thumbnails dir
    from src.config import THUMBNAILS_DIR
    if not str(thumb_path).startswith(str(THUMBNAILS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail file missing")
    return FileResponse(thumb_path, media_type="image/jpeg")
```

2. Register the router in `main.py`:

```python
from src.api.routers.events import router as events_router
app.include_router(events_router)
```

**Verification**:
- `GET /events` returns event list
- `GET /events?camera_id=front_door` filters by camera
- `GET /events/summary` returns aggregated counts
- All endpoints require authentication

**Dependencies**: Task 2.3

---

### Task 2.5: Recordings API Endpoints

**Description**: Create API endpoints to list and serve recording segments for playback in the UI.

**Files to create**:
- `src/api/routers/recordings.py`

**Files to modify**:
- `main.py` (add recordings router)

**Implementation**:

1. Create `src/api/routers/recordings.py`:

```python
"""
src/api/routers/recordings.py
──────────────────────────────
Recording playback API:
  GET /recordings/storage                 — storage usage stats
  GET /recordings/{camera_id}             — list segments for a camera
  GET /recordings/{camera_id}/{filename}  — serve MP4 segment for playback

NOTE: /storage MUST be declared before /{camera_id} — FastAPI matches in
declaration order, so /{camera_id} would capture "storage" as a camera_id.
"""
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from src.api.auth import get_current_user, verify_token_param
from src.config import RECORDINGS_DIR  # env-overridable — same path the recorder writes to (Task 2.1)

router = APIRouter(prefix="/recordings")


# ── Static routes first (before path-parameter routes) ──────────
@router.get("/storage")
def storage_stats(_: str = Depends(get_current_user)):
    """Return storage usage per camera and total."""
    stats = {}
    total_bytes = 0
    
    if not RECORDINGS_DIR.exists():
        return {"cameras": {}, "total_bytes": 0, "total_gb": 0}
    
    for camera_dir in RECORDINGS_DIR.iterdir():
        if not camera_dir.is_dir():
            continue
        cam_bytes = sum(f.stat().st_size for f in camera_dir.glob("*.mp4"))
        segment_count = len(list(camera_dir.glob("*.mp4")))
        stats[camera_dir.name] = {
            "bytes": cam_bytes,
            "gb": round(cam_bytes / (1024**3), 2),
            "segment_count": segment_count,
        }
        total_bytes += cam_bytes
    
    return {
        "cameras": stats,
        "total_bytes": total_bytes,
        "total_gb": round(total_bytes / (1024**3), 2),
    }


# ── Path-parameter routes ──────────────────────────────────────
@router.get("/{camera_id}")
def list_segments(
    camera_id: str,
    date: str | None = None,  # Filter by date: "20260917"
    limit: int = Query(100, le=1000),
    _: str = Depends(get_current_user),
):
    """List recording segments for a camera, newest first."""
    camera_dir = RECORDINGS_DIR / camera_id
    if not camera_dir.exists():
        return {"segments": [], "camera_id": camera_id}
    
    segments = []
    for f in sorted(camera_dir.glob("*.mp4"), reverse=True):
        if date and not f.stem.startswith(date):
            continue
        stat = f.stat()
        segments.append({
            "filename": f.name,
            "size_bytes": stat.st_size,
            "size_mb": round(stat.st_size / (1024 * 1024), 1),
            "created_at": stat.st_mtime,
            "duration_seconds": 900,  # Approximate; exact would require ffprobe
        })
        if len(segments) >= limit:
            break
    
    return {"segments": segments, "camera_id": camera_id}


@router.get("/{camera_id}/{filename}")
def serve_segment(camera_id: str, filename: str, token: str):
    """Serve an MP4 recording segment for browser playback."""
    verify_token_param(token)
    filepath = (RECORDINGS_DIR / camera_id / filename).resolve()
    # Path traversal protection: resolve the path and verify it's inside RECORDINGS_DIR
    if not str(filepath).startswith(str(RECORDINGS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not filepath.exists() or filepath.suffix != ".mp4":
        raise HTTPException(status_code=404, detail="Segment not found")
    return FileResponse(filepath, media_type="video/mp4")
```

2. Register in `main.py`:

```python
from src.api.routers.recordings import router as recordings_router
app.include_router(recordings_router)
```

**Verification**:
- `GET /recordings/front_door` lists MP4 segments
- `GET /recordings/front_door/20260917_080000.mp4?token=...` serves video for playback
- `GET /recordings/storage` shows per-camera disk usage
- Browser can play served MP4 files in a `<video>` tag

**Dependencies**: Task 2.1

---

### Task 2.6: Frontend — Event Sidebar

**Description**: Add an event sidebar/panel to the dashboard that shows recent detection events with thumbnails, timestamps, and camera source. Events are fetched from the `/events` API.

**Files to create**:
- `frontend/src/components/EventSidebar.jsx`
- `frontend/src/components/EventSidebar.css`

**Files to modify**:
- `frontend/src/App.jsx` (integrate event sidebar)

**Implementation**:

1. Create `EventSidebar.jsx`:
   - Fetches `GET /events?limit=50` on mount and every 15 seconds
   - Displays events as a scrollable list
   - Each event card shows: timestamp, camera name, event type icon, person name (if known), thumbnail
   - Color coding: red for unknown, green for known
   - Click event to expand details or seek to recording

2. Create `EventSidebar.css`:
   - Fixed-width right sidebar (300px)
   - Scrollable event list
   - Event cards with small thumbnails
   - Dark theme consistent with existing styles

3. Integrate into `App.jsx` layout:
   - Add event sidebar as a right panel alongside the camera grid
   - Make it collapsible/toggleable

**Verification**:
- Event sidebar appears on the right side of the dashboard
- Events load and auto-refresh
- Unknown face events show in red, known in green
- Sidebar is collapsible

**Dependencies**: Task 2.4, Task 1.6

---

### Task 2.7: Frontend — Recording Playback

**Description**: Add a recording playback view where users can browse recorded segments by camera and date, and play them in the browser.

**Files to create**:
- `frontend/src/RecordingsPage.jsx`
- `frontend/src/RecordingsPage.css`

**Files to modify**:
- `frontend/src/App.jsx` (add route)

**Implementation**:

1. Create `RecordingsPage.jsx`:
   - Camera selector dropdown (from `/cameras`)
   - Date picker (defaults to today)
   - Segment list from `GET /recordings/{camera_id}?date=YYYYMMDD`
   - `<video>` player that loads the selected segment
   - Show segment metadata: filename, size, duration
   - Previous/Next segment navigation

2. Add route in `App.jsx`:

```jsx
<Route path="/recordings" element={<RecordingsPage />} />
```

3. Add navigation link in sidebar:

```jsx
<button className="register-btn" onClick={() => navigate('/recordings')}>
  <span>📹</span> Recordings
</button>
```

**Verification**:
- Navigate to `/recordings`
- Select camera and date
- Segment list loads
- Click segment → video plays in browser
- Previous/Next navigation works

**Dependencies**: Task 2.5, Task 1.6

---

## Phase 3: Smart Detection Pipeline

> **Goal**: Add motion detection, YOLO person filtering, and ByteTrack to dramatically reduce compute and enable intelligent alerting.

---

### Task 3.1: Add YOLO and Supervision Dependencies

**Description**: Add `ultralytics` (YOLOv8) and `supervision` (ByteTrack wrapper) to the project.

**Files to modify**:
- `pyproject.toml`

**Implementation**:

```toml
dependencies = [
    # ... existing deps ...
    "ultralytics>=8.3.0",
    "supervision>=0.25.0",
]
```

Run `uv sync`. The first run of YOLO will auto-download the `yolov8n.pt` model (~6MB).

**Verification**:
- `uv run python -c "from ultralytics import YOLO; print('YOLO OK')"`
- `uv run python -c "import supervision as sv; print('Supervision OK')"`

**Dependencies**: None

---

### Task 3.2: Motion Detection Module

**Description**: Implement a lightweight motion detector using OpenCV background subtraction. This is the first filter in the cascading pipeline — it eliminates ~95% of frames before any AI runs.

**Files to create**:
- `src/detection/__init__.py`
- `src/detection/motion.py`

**Implementation**:

```python
"""
src/detection/motion.py
───────────────────────
Lightweight motion detection using background subtraction.
Runs on CPU in <1ms per frame.
"""
import cv2
import numpy as np


class MotionDetector:
    """Background subtraction-based motion detector."""
    
    def __init__(self, threshold: int = 25, min_area: int = 500, history: int = 500):
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=history, varThreshold=threshold, detectShadows=False
        )
        self.min_area = min_area
    
    def detect(self, frame: np.ndarray) -> list[tuple[int, int, int, int]]:
        """
        Returns list of (x, y, w, h) bounding boxes for motion regions.
        Empty list means no motion detected.
        """
        # Apply background subtraction
        mask = self.bg_subtractor.apply(frame)
        
        # Clean up noise
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        regions = []
        for contour in contours:
            if cv2.contourArea(contour) > self.min_area:
                regions.append(cv2.boundingRect(contour))
        
        return regions
    
    def has_motion(self, frame: np.ndarray) -> bool:
        """Quick boolean check: is there any motion?"""
        return len(self.detect(frame)) > 0
```

**Verification**:
- Create a quick test: read webcam frames, print when motion is detected
- Verify it returns empty list for static scenes
- Verify it detects motion when something moves
- `uv run ruff check src/detection/`

**Dependencies**: None

---

### Task 3.3: YOLO Person Detector

**Description**: Integrate YOLOv8-nano for fast person detection. This runs only when motion is detected, filtering out non-human motion (trees, shadows, animals).

**Files to create**:
- `src/detection/person.py`

**Implementation**:

```python
"""
src/detection/person.py
───────────────────────
YOLOv8-nano person detector.
Only detects 'person' class (COCO class 0) for efficiency.
"""
import numpy as np
from ultralytics import YOLO


class PersonDetector:
    """Lightweight YOLO-based person detector."""
    
    def __init__(self, model_path: str = "yolov8n.pt", confidence: float = 0.5):
        self.model = YOLO(model_path)
        self.confidence = confidence
        # COCO class 0 = person
        self.person_class = 0
    
    def detect(self, frame: np.ndarray) -> list[dict]:
        """
        Detect persons in frame.
        Returns list of {bbox: [x1,y1,x2,y2], confidence: float}
        """
        results = self.model(
            frame,
            classes=[self.person_class],
            conf=self.confidence,
            verbose=False,
        )
        
        detections = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            detections.append({
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
                "confidence": float(box.conf[0]),
            })
        
        return detections
    
    def detect_as_supervision(self, frame: np.ndarray):
        """Return detections in supervision.Detections format for tracker integration."""
        import supervision as sv
        results = self.model(
            frame, classes=[self.person_class], conf=self.confidence, verbose=False
        )
        return sv.Detections.from_ultralytics(results[0])
```

**Verification**:
- On first run, model auto-downloads (~6MB)
- Detects persons in webcam frames
- Does NOT detect objects like furniture, pets
- Returns empty list for empty scenes
- Inference time on CPU: <50ms per frame at 360p

**Dependencies**: Task 3.1

---

### Task 3.4: ByteTrack Object Tracker

**Description**: Integrate ByteTrack via the `supervision` library to track persons across frames. This maintains a persistent ID per person, enabling the system to skip face recognition for already-identified individuals.

**Files to create**:
- `src/detection/tracker.py`

**Implementation**:

```python
"""
src/detection/tracker.py
────────────────────────
ByteTrack-based multi-object tracker.
Assigns persistent IDs to detected persons across frames.
"""
import time
import supervision as sv


class PersonTracker:
    """
    Wraps ByteTrack to maintain persistent person identities.
    Caches face recognition results per track ID to avoid redundant calls.
    """
    
    def __init__(self, recognition_cooldown: float = 30.0):
        self.tracker = sv.ByteTrack(
            track_activation_threshold=0.4,
            lost_track_buffer=30,        # Keep lost tracks for 30 frames
            minimum_matching_threshold=0.8,
            frame_rate=5,
        )
        # Cache: track_id → {"name": str, "is_known": bool, "last_recognized": float}
        self.identity_cache: dict[int, dict] = {}
        self.recognition_cooldown = recognition_cooldown  # Re-run recognition after N seconds
    
    def update(self, detections: sv.Detections) -> sv.Detections:
        """Update tracker with new detections. Returns tracked detections with IDs."""
        return self.tracker.update_with_detections(detections)
    
    def needs_recognition(self, track_id: int) -> bool:
        """Check if a track needs face recognition (new or expired cache)."""
        if track_id not in self.identity_cache:
            return True
        entry = self.identity_cache[track_id]
        elapsed = time.time() - entry["last_recognized"]
        return elapsed > self.recognition_cooldown
    
    def cache_identity(self, track_id: int, name: str, is_known: bool):
        """Cache a recognition result for a track."""
        self.identity_cache[track_id] = {
            "name": name,
            "is_known": is_known,
            "last_recognized": time.time(),
        }
    
    def get_cached_identity(self, track_id: int) -> dict | None:
        """Get cached identity for a track, or None if not cached."""
        return self.identity_cache.get(track_id)
    
    def cleanup_stale_tracks(self):
        """Remove cache entries for tracks that no longer exist."""
        active_ids = set()
        # ByteTrack doesn't expose active IDs easily, so we prune by age
        cutoff = time.time() - (self.recognition_cooldown * 3)
        stale = [tid for tid, info in self.identity_cache.items() if info["last_recognized"] < cutoff]
        for tid in stale:
            del self.identity_cache[tid]
```

**Verification**:
- Feed sequential frames with a moving person → consistent track ID
- Person leaves and re-enters → new track ID
- `needs_recognition()` returns True for new tracks, False for cached ones
- Cache expires after `recognition_cooldown` seconds

**Dependencies**: Task 3.1

---

### Task 3.5: Cascading Detection Pipeline

**Description**: Wire motion detection → YOLO person detection → ByteTrack → ArcFace recognition into a unified pipeline that replaces the current direct InsightFace call. This is the core integration task.

**Files to create**:
- `src/detection/pipeline.py`

**Files to modify**:
- `src/api/inference.py` — use new pipeline instead of direct `recognizer.process_frame()`

**Implementation**:

1. Create `src/detection/pipeline.py`:

```python
"""
src/detection/pipeline.py
─────────────────────────
Cascading detection pipeline:
  Motion → YOLO Person → ByteTrack → ArcFace Recognition

Each stage filters out irrelevant frames, reducing total compute by ~95%.
"""
import time
import numpy as np
import supervision as sv

from src.detection.motion import MotionDetector
from src.detection.person import PersonDetector
from src.detection.tracker import PersonTracker
from src.recognition.face_ops import FaceRecognizer


class DetectionPipeline:
    """
    Orchestrates the cascading detection pipeline for a single camera.
    Each camera should have its own pipeline instance.
    """
    
    def __init__(self, recognizer: FaceRecognizer, enable_motion_filter: bool = True):
        self.motion_detector = MotionDetector() if enable_motion_filter else None
        self.person_detector = PersonDetector()
        self.tracker = PersonTracker(recognition_cooldown=30.0)
        self.recognizer = recognizer
        
        # Stats
        self.stats = {
            "frames_processed": 0,
            "frames_skipped_no_motion": 0,
            "frames_with_persons": 0,
            "recognition_calls": 0,
            "recognition_skipped_cached": 0,
        }
    
    def process_frame(self, frame: np.ndarray) -> list[dict]:
        """
        Process a single frame through the cascading pipeline.
        
        Returns list of detections:
        [
            {
                "bbox": [x, y, w, h],
                "name": "joynal" or "Unknown",
                "is_known": True/False,
                "track_id": 42,
                "confidence": 0.85,
                "landmarks": np.ndarray or None,
                "source": "cached" or "recognized",
            },
            ...
        ]
        """
        self.stats["frames_processed"] += 1
        
        # ── Stage 1: Motion Detection ──────────────────────
        if self.motion_detector and not self.motion_detector.has_motion(frame):
            self.stats["frames_skipped_no_motion"] += 1
            return []
        
        # ── Stage 2: YOLO Person Detection ─────────────────
        person_detections = self.person_detector.detect_as_supervision(frame)
        
        if len(person_detections) == 0:
            return []
        
        self.stats["frames_with_persons"] += 1
        
        # ── Stage 3: ByteTrack ─────────────────────────────
        tracked = self.tracker.update(person_detections)
        
        results = []
        for i in range(len(tracked)):
            bbox = tracked.xyxy[i].astype(int)
            track_id = tracked.tracker_id[i]
            x1, y1, x2, y2 = bbox
            
            # ── Stage 4: Face Recognition (only if needed) ─
            if self.tracker.needs_recognition(track_id):
                # Crop person region and run face recognition
                person_crop = frame[y1:y2, x1:x2]
                if person_crop.size > 0:
                    face_results = self.recognizer.process_frame(person_crop)
                    self.stats["recognition_calls"] += 1
                    
                    if face_results:
                        # Use the first face found in the person crop
                        _, _, _, _, name, is_known, landmarks = face_results[0]
                        self.tracker.cache_identity(track_id, name, is_known)
                        results.append({
                            "bbox": [x1, y1, x2 - x1, y2 - y1],
                            "name": name,
                            "is_known": is_known,
                            "track_id": int(track_id),
                            "confidence": float(tracked.confidence[i]) if tracked.confidence is not None else 0.0,
                            "landmarks": landmarks,
                            "source": "recognized",
                        })
                    else:
                        # Person detected but no face visible (back turned, etc.)
                        self.tracker.cache_identity(track_id, "Unknown", False)
                        results.append({
                            "bbox": [x1, y1, x2 - x1, y2 - y1],
                            "name": "Unknown",
                            "is_known": False,
                            "track_id": int(track_id),
                            "confidence": float(tracked.confidence[i]) if tracked.confidence is not None else 0.0,
                            "landmarks": None,
                            "source": "recognized",
                        })
            else:
                # Use cached identity
                cached = self.tracker.get_cached_identity(track_id)
                self.stats["recognition_skipped_cached"] += 1
                results.append({
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                    "name": cached["name"],
                    "is_known": cached["is_known"],
                    "track_id": int(track_id),
                    "confidence": float(tracked.confidence[i]) if tracked.confidence is not None else 0.0,
                    "landmarks": None,
                    "source": "cached",
                })
        
        # Periodic cleanup
        if self.stats["frames_processed"] % 100 == 0:
            self.tracker.cleanup_stale_tracks()
        
        return results
    
    def get_stats(self) -> dict:
        """Return pipeline performance stats."""
        total = self.stats["frames_processed"]
        return {
            **self.stats,
            "motion_filter_rate": (
                self.stats["frames_skipped_no_motion"] / total * 100 if total > 0 else 0
            ),
            "cache_hit_rate": (
                self.stats["recognition_skipped_cached"] /
                max(self.stats["recognition_calls"] + self.stats["recognition_skipped_cached"], 1) * 100
            ),
        }
```

2. Update `src/api/inference.py`:
   - Create a `DetectionPipeline` instance per camera
   - Replace `state.recognizer.process_frame(frame)` with `pipeline.process_frame(frame)`
   - Adapt the annotation code to use the new result format (dict instead of tuple)
   - The recognizer is still needed — it's passed into the pipeline

```python
# In inference_loop(), after creating the recognizer:
from src.detection.pipeline import DetectionPipeline

pipelines = {}
for cam in CAMERAS:
    # The registration camera MUST bypass the motion gate — someone holding
    # still for the 5-pose wizard produces zero motion, so the pipeline would
    # return [] and face_status would never update (modal hangs at step 1).
    is_reg_cam = (cam.id == state.registration_camera_id)
    pipelines[cam.id] = DetectionPipeline(
        recognizer=state.recognizer,
        enable_motion_filter=not is_reg_cam,  # No motion gate for registration cam
    )

# In the per-camera processing:
results = pipelines[camera_id].process_frame(frame)

# ── Registration camera: update face_status from raw frame ──────────
# The registration flow needs:
#   1. first_cam_raw — the unprocessed frame for /register/capture
#   2. face_status with landmarks relative to the FULL FRAME (not a person crop)
# The pipeline returns landmarks relative to the person crop, which breaks
# pose math. So for the registration camera, run InsightFace directly.
if camera_id == state.registration_camera_id:
    first_cam_raw = frame.copy()
    raw_results = state.recognizer.process_frame(frame)
    if raw_results:
        x, y, w, h, _, _, landmarks = raw_results[0]
        if landmarks is not None:
            pose_info = compute_pose(landmarks, [x, y, x + w, y + h])
            with state.face_status_lock:
                state.latest_face_status = {"face_found": True, **pose_info}
    else:
        with state.face_status_lock:
            state.latest_face_status = {"face_found": False, "pose": "none",
                                         "offset_x": 0.0, "offset_y": 0.0}

# Annotate using new format:
for det in results:
    x, y, w, h = det["bbox"]
    name = det["name"]
    is_known = det["is_known"]
    color = (0, 255, 0) if is_known else (0, 0, 255)
    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
    label = f"{name} #{det['track_id']}"
    cv2.putText(frame, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
```

> [!WARNING]
> **Registration camera carve-out**: The registration camera (`state.registration_camera_id`, set to `CAMERAS[0].id` at startup) runs InsightFace **directly on the raw frame** in addition to the pipeline. This is intentional:
> - Motion gate disabled: person holds still during enrollment
> - Landmarks are relative to the full frame (not a person crop), which pose math requires
> - `first_cam_raw` is preserved for `/register/capture`
>
> This means the registration camera does slightly more work than other cameras. If CPU is a concern, consider dedicating a low-res sub-stream for registration only.

**Verification**:
- App starts and processes frames through the full pipeline
- Static scenes → no detections (motion filter working)
- Person walks in → detected with track ID
- Same person stays → face recognition called once, then cached
- Pipeline stats show high motion_filter_rate and cache_hit_rate
- Performance: significantly lower CPU usage than before
- **Registration wizard still works**: face enrollment 5-pose flow completes without hanging
- `face_status` updates correctly on the registration camera even when standing still

**Dependencies**: Task 3.2, Task 3.3, Task 3.4

---

### Task 3.6: Activity Zones

**Description**: Implement polygon-based activity zones per camera. Detections outside defined zones are ignored. Zones are configured in `cameras.json`.

**Files to create**:
- `src/detection/zones.py`

**Files to modify**:
- `src/detection/pipeline.py` (integrate zone filtering)

**Implementation**:

```python
"""
src/detection/zones.py
──────────────────────
Polygon-based activity zones for filtering detections.
"""
import cv2
import numpy as np


class ZoneFilter:
    """Filter detections based on polygon activity zones."""
    
    def __init__(self, zones: list[dict]):
        """
        zones: list of {"name": str, "coordinates": [[x,y], ...]}
        If zones list is empty, all detections pass through (no filtering).
        """
        self.zones = zones
        self.polygons = [np.array(z["coordinates"], dtype=np.int32) for z in zones]
    
    def is_in_zone(self, bbox: list[int]) -> tuple[bool, str | None]:
        """
        Check if the center of a bounding box falls within any zone.
        Returns (in_zone, zone_name).
        """
        if not self.polygons:
            return True, None  # No zones defined = everything passes
        
        x, y, w, h = bbox
        center_x = x + w // 2
        center_y = y + h // 2
        
        for polygon, zone_config in zip(self.polygons, self.zones):
            if cv2.pointPolygonTest(polygon, (float(center_x), float(center_y)), False) >= 0:
                return True, zone_config["name"]
        
        return False, None
    
    def filter_detections(self, detections: list[dict]) -> list[dict]:
        """Filter detection list, keeping only those inside defined zones."""
        if not self.polygons:
            return detections  # No zones = pass all through
        
        filtered = []
        for det in detections:
            in_zone, zone_name = self.is_in_zone(det["bbox"])
            if in_zone:
                det["zone"] = zone_name
                filtered.append(det)
        return filtered
```

Integrate into `DetectionPipeline`:
- After Stage 4 results are computed, filter through `ZoneFilter`
- Zones come from `CameraConfig.zones`

**Verification**:
- Camera with zones defined: detections outside zones are ignored
- Camera without zones: all detections pass through
- Zone name is included in detection results

**Dependencies**: Task 3.5, Task 1.1

---

### Task 3.7: Pipeline Stats API

**Description**: Expose pipeline performance stats (motion filter rate, cache hit rate, recognition calls) via an API endpoint for monitoring.

**Files to modify**:
- `src/api/routers/stream.py` (or create a new diagnostics router)

**Implementation**:

Add `GET /diagnostics/pipeline` endpoint:

```python
@router.get("/diagnostics/pipeline")
def pipeline_stats(_: str = Depends(get_current_user)):
    """Return detection pipeline performance stats per camera."""
    # Access pipeline instances from state or inference module
    return {"pipelines": {cam_id: pipeline.get_stats() for cam_id, pipeline in pipelines.items()}}
```

**Verification**:
- Endpoint returns stats per camera
- `motion_filter_rate` shows percentage of frames skipped
- `cache_hit_rate` shows percentage of recognition calls saved by tracking

**Dependencies**: Task 3.5

---

## Phase 4: Advanced Features

> **Goal**: Add intelligent alerting, daily summaries, and push notifications.

---

### Task 4.1: Loitering Detection

**Description**: Detect when an unknown person stays in a zone for longer than a configured threshold (e.g., 2 minutes). Uses ByteTrack persistence.

**Files to create**:
- `src/detection/behaviors.py`

**Implementation**:

```python
"""
src/detection/behaviors.py
──────────────────────────
Behavioral detection: loitering, zone entry/exit.
"""
import time


class LoiteringDetector:
    """Detect persons staying in a zone beyond a time threshold."""
    
    def __init__(self, threshold_seconds: float = 120.0):
        self.threshold = threshold_seconds
        # track_id → {"first_seen": float, "zone": str, "alerted": bool}
        self.presence: dict[int, dict] = {}
    
    def update(self, track_id: int, zone_name: str | None, is_known: bool) -> bool:
        """
        Update presence tracking. Returns True if loitering alert should fire.
        Known persons don't trigger loitering alerts.
        """
        if is_known or zone_name is None:
            # Known person or not in a zone — remove from tracking
            self.presence.pop(track_id, None)
            return False
        
        if track_id not in self.presence:
            self.presence[track_id] = {
                "first_seen": time.time(),
                "zone": zone_name,
                "alerted": False,
            }
            return False
        
        entry = self.presence[track_id]
        elapsed = time.time() - entry["first_seen"]
        
        if elapsed > self.threshold and not entry["alerted"]:
            entry["alerted"] = True
            return True  # Fire loitering alert
        
        return False
    
    def cleanup(self, active_track_ids: set[int]):
        """Remove entries for tracks that no longer exist."""
        stale = [tid for tid in self.presence if tid not in active_track_ids]
        for tid in stale:
            del self.presence[tid]
```

Integrate into `DetectionPipeline` after zone filtering.

**Verification**:
- Unknown person in zone for <2 min → no alert
- Unknown person in zone for >2 min → loitering alert fires once
- Known person → never triggers loitering
- Person leaves zone → tracking entry cleaned up

**Dependencies**: Task 3.5, Task 3.6

---

### Task 4.2: Event Thumbnails & Snapshots

**Description**: Save a JPEG thumbnail for every detection event. Thumbnails are cropped to the detected person's bounding box and stored in `data/thumbnails/`.

**Files to modify**:
- `src/api/inference.py` (save thumbnails during detection)
- `src/events/database.py` (store thumbnail paths)

**Implementation**:

1. In the inference loop, when a detection occurs:

```python
import cv2
from pathlib import Path

from src.config import THUMBNAILS_DIR  # env-overridable — do NOT hardcode DATA_DIR / "thumbnails"

def save_thumbnail(frame, bbox, camera_id) -> str:
    """Save a cropped thumbnail and return its relative path."""
    x, y, w, h = bbox
    # Add padding
    pad = 20
    y1 = max(0, y - pad)
    y2 = min(frame.shape[0], y + h + pad)
    x1 = max(0, x - pad)
    x2 = min(frame.shape[1], x + w + pad)
    crop = frame[y1:y2, x1:x2]
    
    thumb_dir = THUMBNAILS_DIR / camera_id
    thumb_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
    filepath = thumb_dir / filename
    cv2.imwrite(str(filepath), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    return str(filepath)
```

2. Add thumbnail serving endpoint to events router:

```python
@router.get("/thumbnail/{camera_id}/{filename}")
def serve_thumbnail(camera_id: str, filename: str, token: str):
    verify_token_param(token)
    filepath = THUMBNAILS_DIR / camera_id / filename
    if not filepath.exists():
        raise HTTPException(status_code=404)
    return FileResponse(filepath)
```

3. Add retention for thumbnails in `retention.py` — delete thumbnails older than retain_days.

**Verification**:
- Thumbnails are saved to `data/thumbnails/<camera_id>/`
- Thumbnails are cropped to person bounding box with padding
- Thumbnails are viewable via the API endpoint
- Old thumbnails are cleaned up by retention

**Dependencies**: Task 2.3

---

### Task 4.3: Daily Summary

**Description**: Generate and send a daily summary of detection events — total events, unknown alerts, known entries, busiest camera, busiest hour.

**Files to create**:
- `src/alerts/summary.py`

**Implementation**:

```python
"""
src/alerts/summary.py
─────────────────────
Daily summary generation and delivery.
"""
from datetime import datetime, timedelta
from src.events.database import EventDatabase


def generate_daily_summary(event_db: EventDatabase) -> str:
    """Generate a text summary of the last 24 hours."""
    since = datetime.now() - timedelta(hours=24)
    events = event_db.query(since=since, limit=10000)
    
    total = len(events)
    unknown = sum(1 for e in events if e["event_type"] == "unknown_face")
    known = sum(1 for e in events if e["event_type"] == "known_face")
    
    # Busiest camera
    camera_counts = {}
    for e in events:
        cam = e["camera_id"]
        camera_counts[cam] = camera_counts.get(cam, 0) + 1
    busiest_cam = max(camera_counts, key=camera_counts.get) if camera_counts else "None"
    
    summary = f"""📊 Aegis Vision — Daily Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 {datetime.now().strftime('%Y-%m-%d')}

Total events: {total}
🔴 Unknown faces: {unknown}
🟢 Known entries: {known}
📷 Busiest camera: {busiest_cam} ({camera_counts.get(busiest_cam, 0)} events)
"""
    return summary
```

Wire as a daily background task:
- Run via a background thread at a configured time (e.g., 8 AM)
- Send via the configured alert manager (Telegram or console)

**Verification**:
- Summary text is generated correctly from event data
- Sent via Telegram or printed to console
- Runs daily at configured time

**Dependencies**: Task 2.3

---

### Task 4.4: Mobile Push Notifications via ntfy.sh

**Description**: Add support for instant push notifications via [ntfy.sh](https://ntfy.sh) — a free, open-source push notification service that requires no app or account. Users just subscribe to a topic URL on their phone.

**Files to create**:
- `src/alerts/ntfy.py`

**Files to modify**:
- `src/config.py` (add ntfy config)
- `src/api/inference.py` (add ntfy as alert option)

**Implementation**:

```python
"""
src/alerts/ntfy.py
──────────────────
Push notifications via ntfy.sh — free, no account needed.
"""
import asyncio
import cv2
import httpx
import time
import numpy as np

import src.api.state as state
from src.alerts.base import AlertManager


class NtfyAlert(AlertManager):
    """Send push notifications via ntfy.sh."""
    
    def __init__(self, topic: str, server: str = "https://ntfy.sh", cooldown_seconds: float = 30.0):
        self.topic = topic
        self.server = server
        self.url = f"{server}/{topic}"
        self.cooldown_seconds = cooldown_seconds
        self.last_alert_time = 0.0
        print(f"[NtfyAlert] Initialized — subscribe at: {self.url}")
    
    def send_alert(self, message: str, image_frame: np.ndarray = None):
        if state.main_loop is None:
            return
        
        current_time = time.time()
        if (current_time - self.last_alert_time) < self.cooldown_seconds:
            return
        self.last_alert_time = current_time
        
        if image_frame is not None:
            success, buffer = cv2.imencode(".jpg", image_frame)
            if success:
                asyncio.run_coroutine_threadsafe(
                    self._send_with_image(message, buffer.tobytes()),
                    state.main_loop,
                )
                return
        
        asyncio.run_coroutine_threadsafe(
            self._send_text(message),
            state.main_loop,
        )
    
    async def _send_text(self, message: str):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    self.url,
                    content=message.encode(),
                    headers={
                        "Title": "🚨 Aegis Vision Alert",
                        "Priority": "high",
                        "Tags": "warning,rotating_light",
                    },
                )
        except Exception as e:
            print(f"[NtfyAlert] Failed: {e}")
    
    async def _send_with_image(self, message: str, image_bytes: bytes):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.put(
                    self.url,
                    content=image_bytes,
                    headers={
                        "Title": "🚨 Aegis Vision Alert",
                        "Filename": "alert.jpg",
                        "Message": message,
                        "Priority": "high",
                        "Tags": "warning,rotating_light",
                    },
                )
        except Exception as e:
            print(f"[NtfyAlert] Failed: {e}")
```

Add to config:

```python
# In src/config.py:
NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")  # e.g., "aegis-vision-alerts"
```

Add to `.env.example`:

```
NTFY_TOPIC=aegis-vision-alerts
```

Update `build_alert()` in inference.py:

```python
if ACTIVE_ALERT == "ntfy":
    return NtfyAlert(topic=NTFY_TOPIC)
```

**Verification**:
- Set `NTFY_TOPIC=test-aegis` in `.env`
- Set `ACTIVE_ALERT=ntfy` in config
- Subscribe to `https://ntfy.sh/test-aegis` on phone
- Trigger an unknown face → push notification received with image
- Cooldown prevents notification spam

**Dependencies**: Task 1.3

---

### Task 4.5: Per-Person Alert Cooldown

**Description**: The current alert cooldown is global — one unknown person suppresses alerts for a *different* unknown person 5 seconds later. This was identified as a Tier-1 item in the research doc but never became a task. Implement per-person (per-track-ID) cooldowns.

**Files to modify**:
- `src/alerts/base.py` (update interface)
- `src/alerts/console.py`
- `src/alerts/telegram.py`
- `src/alerts/ntfy.py` (if exists)
- `src/api/inference.py` (pass track context to alert)

**Implementation**:

1. Change `send_alert()` to accept an optional `track_id` or `person_key`:

```python
class AlertManager(ABC):
    @abstractmethod
    def send_alert(self, message: str, image_frame: np.ndarray = None, 
                   person_key: str | None = None):
        """Send an alert. person_key enables per-person cooldown tracking."""
        ...
```

2. In each alert implementation, maintain a `dict[str, float]` of `person_key → last_alert_time`:

```python
class ConsoleAlert(AlertManager):
    def __init__(self, cooldown_seconds: int = 5):
        self.cooldown_seconds = cooldown_seconds
        self._cooldowns: dict[str, float] = {}  # person_key → last_alert_time
    
    def send_alert(self, message: str, image_frame=None, person_key: str | None = None):
        current_time = time.time()
        key = person_key or "__global__"
        last = self._cooldowns.get(key, 0)
        if (current_time - last) > self.cooldown_seconds:
            print(f"\n[🚨 ALERT | {time.strftime('%H:%M:%S')}] {message}")
            self._cooldowns[key] = current_time
```

3. In the inference loop, pass the track ID as the person key when alerting.

**Verification**:
- Unknown person A triggers alert → Unknown person B triggers alert immediately (not suppressed)
- Same unknown person A within cooldown → suppressed
- Known persons don't trigger alerts at all

**Dependencies**: Task 3.5

---

### Task 4.6: Test Suite

**Description**: Add a test framework and tests for the pure-logic modules that are trivially testable without cameras. The plan is designed for autonomous agent execution — manual verification like "person walks in" is exactly what agents can't do. Executable checks are worth more than prose.

**Files to create**:
- `tests/__init__.py`
- `tests/test_zones.py`
- `tests/test_loitering.py`
- `tests/test_motion.py`
- `tests/test_events_db.py`
- `tests/test_recorder_cleanup.py`

**Files to modify**:
- `pyproject.toml` (add pytest to dev dependencies)

**Implementation**:

1. Add pytest:

```toml
[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.24"]
```

2. Test modules (no cameras needed):

| Module | Test Strategy |
|--------|---------------|
| `ZoneFilter` | Point-in-polygon with known coordinates |
| `LoiteringDetector` | Time-based state machine with `time.sleep()` or mocked clock |
| `MotionDetector` | Synthetic numpy frames (static vs shifted) |
| `EventDatabase` | In-memory SQLite (`:memory:`) — insert, query, count, get_by_id, disk-aware `delete_older_than`, thumbnail cascade |
| Recorder cleanup | Mock `shutil.disk_usage` + temp MP4 files: verify files kept when disk has space, purged oldest-first when low |

3. Example test:

```python
# tests/test_zones.py
from src.detection.zones import ZoneFilter

def test_point_inside_zone():
    zones = [{"name": "porch", "coordinates": [[0,0], [100,0], [100,100], [0,100]]}]
    zf = ZoneFilter(zones)
    in_zone, name = zf.is_in_zone([10, 10, 20, 20])  # center = (20, 20)
    assert in_zone is True
    assert name == "porch"

def test_point_outside_zone():
    zones = [{"name": "porch", "coordinates": [[0,0], [100,0], [100,100], [0,100]]}]
    zf = ZoneFilter(zones)
    in_zone, _ = zf.is_in_zone([200, 200, 20, 20])  # center = (210, 210)
    assert in_zone is False

def test_no_zones_passes_everything():
    zf = ZoneFilter([])
    in_zone, _ = zf.is_in_zone([500, 500, 50, 50])
    assert in_zone is True
```

**Verification**:
- `uv run pytest tests/ -v` — all tests pass
- Tests run in CI without cameras or GPU

**Dependencies**: Task 3.5, Task 3.6, Task 4.1, Task 2.3

---

### Task 4.7: Deployment & Operations

**Description**: Both docs say "production-grade" but there's no ops story. A security system that's down when the machine reboots isn't production-grade. Add containerized deployment and service management.

**Files to create**:
- `Dockerfile`
- `docker-compose.yml`
- `deploy/aegis-vision.plist` (macOS launchd)
- `deploy/aegis-vision.service` (Linux systemd)

**Implementation**:

1. Create `docker-compose.yml` (app + go2rtc + frontend):

```yaml
# No `version` key — it's obsolete in Compose v2 and only produces a warning.

services:
  go2rtc:
    image: alexxit/go2rtc
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./go2rtc.yaml:/config/go2rtc.yaml

  backend:
    build: .
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
      - ./.env:/app/.env
    depends_on:
      - go2rtc

  frontend:
    build: ./frontend
    restart: unless-stopped
    ports:
      - "5173:5173"
    depends_on:
      - backend
```

2. Create `Dockerfile`:

```dockerfile
FROM python:3.13-slim
RUN apt-get update && apt-get install -y ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --no-dev
COPY . .
CMD ["uv", "run", "main.py"]
```

3. Create `deploy/aegis-vision.plist` for macOS auto-start on boot.

4. Create `deploy/aegis-vision.service` for Linux systemd.

**Verification**:
- `docker compose up -d` starts all services
- System survives reboot (launchd/systemd restarts it)
- `docker compose logs -f backend` shows inference running
- Frontend accessible at http://localhost:5173

**Dependencies**: Task 1.8, Task 2.1

---

## Known Technical Debt

> These are accepted trade-offs documented for visibility. They don't block implementation but should be addressed in future iterations.

| # | Area | Debt | Severity |
|---|------|------|----------|
| 1 | Auth | `?token=` in URL for `<img>`/`<video>` endpoints — tokens leak to browser history and server logs | Low (LAN-only) |
| 2 | Auth | Each new image/video endpoint (recordings, thumbnails, events) amplifies the token-in-URL surface | Low |
| 3 | Frontend | Hardcoded `API = 'http://localhost:8000'` in multiple files | Low |
| 4 | Frontend | Research Phase 1 roadmap says "switch frontend to WebRTC" but the plan correctly defers this and builds per-camera MJPEG tiles first — the incremental approach is right | None (roadmap updated) |
| 5 | Config | `AppConfig` Pydantic model is defined in Task 1.1 but never wired into the app — consider removing it or using it as the root config validator | Low |

---

## Post-Implementation Checklist

After completing all phases, verify:

- [ ] `uv run ruff check .` — zero errors
- [ ] `cd frontend && npm run lint` — zero errors
- [ ] `uv run pytest tests/ -v` — all tests pass
- [ ] App starts with single macbook camera (backward compat)
- [ ] App starts with multiple cameras from `cameras.json`
- [ ] Multi-camera grid view renders correctly
- [ ] Recording creates MP4 segments for configured cameras
- [ ] Disk-space retention: recordings & events preserved while space is available; oldest pruned first when low
- [ ] Events are logged to SQLite on detection
- [ ] Event sidebar shows recent detections
- [ ] Recording playback works in browser
- [ ] Motion filter reduces CPU when scene is static
- [ ] YOLO filters non-person motion
- [ ] ByteTrack reduces redundant face recognition calls
- [ ] Activity zones filter detections correctly
- [ ] Pipeline stats show high efficiency (>90% filter rate)
- [ ] Registration wizard 5-pose flow still works after pipeline swap
- [ ] Per-person alert cooldown: two unknowns → two alerts (not suppressed)
- [ ] `docker compose up` starts all services correctly
- [ ] Update `GEMINI.md` with new architecture
- [ ] Update `LEARNINGS.md` with discoveries during implementation

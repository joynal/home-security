"""
src/api/state.py
────────────────
All mutable shared state that crosses thread boundaries.
Import from here instead of from main.py.
"""

import asyncio
import threading

import numpy as np

from src.camera.stream import CameraStreamWrapper
from src.events.database import EventDatabase
from src.persons.store import PersonStore
from src.recognition.face_ops import FaceRecognizer
from src.recording.index import RecordingIndex
from src.recording.recorder import RecordingManager

# ── Video stream ────────────────────────────────────────────
# Annotated grid JPEG-ready frame served to web clients
latest_grid_frame: np.ndarray = np.zeros((480, 640, 3), dtype=np.uint8)
frame_lock = threading.Lock()

# ── Per-camera frames ───────────────────────────────────────
# The inference loop encodes each camera's JPEG ONCE per iteration; MJPEG
# generators serve these cached bytes — never encode per connected client.
latest_frames: dict[str, np.ndarray] = {}  # camera_id → latest annotated frame (BGR)
latest_jpeg_bytes: dict[str, bytes] = {}  # camera_id → pre-encoded JPEG bytes
frames_lock = threading.Lock()  # Single lock guarding both dicts

# ── Registration ────────────────────────────────────────────
# Raw (un-annotated) frame from camera[0], used by the capture endpoint
latest_raw_frame: np.ndarray | None = None
raw_frame_lock = threading.Lock()

# Latest face-pose result from the inference loop (polled by the UI)
latest_face_status: dict = {
  'face_found': False,
  'pose': 'none',
  'offset_x': 0.0,
  'offset_y': 0.0,
}
face_status_lock = threading.Lock()

# Pending enrollment queue.
# The capture endpoint pushes {name, frame} here;
# the inference loop drains it so app.get() is always single-threaded.
pending_embeddings: list[dict] = []
pending_lock = threading.Lock()

# Request-response enrollment jobs (photo import / add-from-event).
# API threads submit EnrollJob; the inference loop drains them (the only
# legal ONNX caller) and sets each job's event with the verdict.
pending_enroll_jobs: list = []

# ── Shared objects (set once, by the inference loop) ────────
recognizer: FaceRecognizer | None = None
active_streams: dict[str, CameraStreamWrapper] = {}  # camera_id → stream
event_db: EventDatabase | None = None
recording_index: 'RecordingIndex | None' = None  # set by lifespan (shared aegis.db conn)
person_store: 'PersonStore | None' = None  # set by lifespan
recording_manager: RecordingManager | None = None  # set by lifespan
# camera_id → DetectionPipeline (typed loosely to avoid importing the heavy
# detection stack at state-import time; the inference loop populates it)
pipelines: dict[str, 'object'] = {}

# Per-camera health: camera_id → {online, last_frame_at, error}
camera_status: dict[str, dict] = {}
camera_status_lock = threading.Lock()

# Pin which camera is used for face registration (avoids ambiguity now that
# active_streams is a dict instead of a list with a fixed index-0 convention)
registration_camera_id: str | None = None  # Set to CAMERAS[0].id at startup

# Main FastAPI event loop, used to schedule async background tasks
# from synchronous threads (like the inference thread).
main_loop: asyncio.AbstractEventLoop | None = None

# ── Alert manager (shared so PATCH /settings/config can swap it live) ──
# Typed loosely (like `pipelines`) to avoid importing the alerts stack here.
alert_manager: 'object | None' = None  # set by inference/rebuild_alert
alert_lock = threading.Lock()

# ── AI & Detection parameters (configurable via Settings) ──
# Persisted overrides (data/settings.json 'ai') win over these defaults.
_ai_persisted: dict = {}
try:  # pragma: no cover — import-time resilience; corrupt store must not crash
  from src.settings_store import load_settings as _load_persisted_settings

  _ai_persisted = _load_persisted_settings().get('ai') or {}
except Exception:
  _ai_persisted = {}
face_similarity_threshold: float = float(_ai_persisted.get('similarity_threshold', 0.40))
loitering_seconds: float = float(_ai_persisted.get('loitering_seconds', 30.0))
auto_enrichment_enabled: bool = bool(_ai_persisted.get('auto_enrichment', True))

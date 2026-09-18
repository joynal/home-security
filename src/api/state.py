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
from src.recognition.face_ops import FaceRecognizer
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
    "face_found": False,
    "pose": "none",
    "offset_x": 0.0,
    "offset_y": 0.0,
}
face_status_lock = threading.Lock()

# Pending enrollment queue.
# The capture endpoint pushes {name, frame} here;
# the inference loop drains it so app.get() is always single-threaded.
pending_embeddings: list[dict] = []
pending_lock = threading.Lock()

# ── Shared objects (set once, by the inference loop) ────────
recognizer: FaceRecognizer | None = None
active_streams: dict[str, CameraStreamWrapper] = {}  # camera_id → stream
event_db: EventDatabase | None = None
recording_manager: RecordingManager | None = None  # set by lifespan

# Per-camera health: camera_id → {online, fps, last_frame_at, error}
camera_status: dict[str, dict] = {}
camera_status_lock = threading.Lock()

# Pin which camera is used for face registration (avoids ambiguity now that
# active_streams is a dict instead of a list with a fixed index-0 convention)
registration_camera_id: str | None = None  # Set to CAMERAS[0].id at startup

# Main FastAPI event loop, used to schedule async background tasks
# from synchronous threads (like the inference thread).
main_loop: asyncio.AbstractEventLoop | None = None

"""
src/api/state.py
────────────────
All mutable shared state that crosses thread boundaries.
Import from here instead of from main.py.
"""

import threading

import numpy as np

from src.camera.stream import CameraStreamWrapper
from src.recognition.face_ops import FaceRecognizer

# ── Video stream ────────────────────────────────────────────
# Annotated grid JPEG-ready frame served to web clients
latest_grid_frame: np.ndarray = np.zeros((480, 640, 3), dtype=np.uint8)
frame_lock = threading.Lock()

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
active_streams: list[CameraStreamWrapper] = []

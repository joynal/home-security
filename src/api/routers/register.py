"""
src/api/routers/register.py
───────────────────────────
Registration endpoints:
  GET  /register/face_status  – current face pose (polled by the React UI)
  GET  /register/face_debug   – same, with calibration hint
  POST /register/capture      – save a frame and queue it for embedding
"""

import os
from datetime import datetime
from pathlib import Path

import cv2
from fastapi import APIRouter, Depends, HTTPException

import src.api.state as state
from src.api.auth import get_current_user
from src.config import KNOWN_FACES_DIR

router = APIRouter(prefix="/register")


@router.get("/face_status")
def face_status(_: str = Depends(get_current_user)):
    """Return current face detection + pose (polled every ~350 ms by the UI)."""
    with state.face_status_lock:
        return dict(state.latest_face_status)


@router.get("/face_debug")
def face_debug(_: str = Depends(get_current_user)):
    """Extended status with a calibration note — open in browser to tune thresholds."""
    with state.face_status_lock:
        return {
            **state.latest_face_status,
            "note": "offset_y: frontal ≈1.2-1.8 | down >1.9 | up <1.05",
        }


@router.post("/capture")
def capture_face(name: str, step: str, _: str = Depends(get_current_user)):
    """
    Snapshot the current raw frame for *name* at pose *step*.
    The frame is saved to disk and queued for incremental embedding (no restart needed).
    """
    with state.raw_frame_lock:
        frame = state.latest_raw_frame.copy() if state.latest_raw_frame is not None else None

    if frame is None:
        raise HTTPException(status_code=503, detail="No camera frame available yet.")

    # Persist to disk
    person_dir = Path(KNOWN_FACES_DIR) / name
    os.makedirs(person_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filepath = person_dir / f"{step}_{ts}.jpg"
    cv2.imwrite(str(filepath), frame)

    # Hand off to inference thread — avoids concurrent ONNX calls
    with state.pending_lock:
        state.pending_embeddings.append({"name": name, "frame": frame})

    print(f"[Register] Queued embedding · name='{name}' step='{step}'")
    return {"status": "saved", "file": str(filepath)}

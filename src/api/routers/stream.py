"""
src/api/routers/stream.py
─────────────────────────
Public endpoints:
  GET /cameras      – list of configured cameras (consumed by the React sidebar)
  GET /video_feed   – infinite MJPEG stream of the annotated camera grid
"""

import time

import cv2
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

import src.api.state as state
from src.config import ACTIVE_CAMERAS

router = APIRouter()


def _frame_generator():
    """Yield MJPEG boundary frames for as long as the client is connected."""
    while True:
        with state.frame_lock:
            frame = state.latest_grid_frame.copy()
        ret, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if ret:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
        time.sleep(0.05)  # ~20 FPS cap to reduce network load


@router.get("/cameras")
def list_cameras():
    """Return the list of configured cameras for the React sidebar."""
    return {
        "cameras": [
            {
                "id": c.get("name"),
                "name": c.get("name", "").replace("_", " "),
                "type": c.get("type"),
            }
            for c in ACTIVE_CAMERAS
        ]
    }


@router.get("/video_feed")
def video_feed():
    """Serve the infinite MJPEG stream."""
    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )

"""
src/api/inference.py
────────────────────
Background inference thread: grabs camera frames, runs InsightFace,
updates shared state, and drains the enrollment queue.
"""

import time

import cv2
import numpy as np

import src.api.state as state
from src.alerts.console import ConsoleAlert
from src.alerts.telegram import TelegramAlert
from src.api.pose import compute_pose
from src.camera.stream import CameraStreamWrapper
from src.camera.tapo import TapoCamera
from src.camera.webcam import MacbookWebcam
from src.config import ACTIVE_ALERT, ACTIVE_CAMERAS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from src.recognition.face_ops import FaceRecognizer

# ──────────────────────────────────────────────────────────
# Factory helpers
# ──────────────────────────────────────────────────────────


def build_camera(cam_config: dict):
    """Instantiate a camera from its config dict."""
    cam_type = cam_config.get("type")
    if cam_type == "macbook":
        return MacbookWebcam()
    if cam_type == "tapo":
        return TapoCamera(
            username=cam_config.get("user", "admin"),
            password=cam_config.get("pass", "password"),
            ip_address=cam_config.get("ip", "192.168.1.100"),
        )
    raise ValueError(f"Unknown camera type: {cam_type}")


def build_alert():
    """Instantiate the configured alert manager."""
    if ACTIVE_ALERT == "console":
        return ConsoleAlert(cooldown_seconds=10)
    if ACTIVE_ALERT == "telegram":
        return TelegramAlert(bot_token=TELEGRAM_BOT_TOKEN, chat_id=TELEGRAM_CHAT_ID)
    raise ValueError(f"Unknown alert: {ACTIVE_ALERT}")


# ──────────────────────────────────────────────────────────
# Frame utilities
# ──────────────────────────────────────────────────────────


def stack_frames(frames: list[np.ndarray]) -> np.ndarray:
    """Horizontally stack frames, preserving each camera's aspect ratio."""
    if not frames:
        return np.zeros((480, 640, 3), dtype=np.uint8)
    if len(frames) == 1:
        return frames[0]
    min_h = min(f.shape[0] for f in frames)
    resized = []
    for f in frames:
        h, w = f.shape[:2]
        resized.append(cv2.resize(f, (int(w * min_h / h), min_h)) if h != min_h else f)
    return np.hstack(resized)


# ──────────────────────────────────────────────────────────
# Main inference loop (runs in a daemon thread)
# ──────────────────────────────────────────────────────────


def inference_loop() -> None:
    """
    Initialises the recogniser and camera streams, then loops forever:
    - detecting / recognising faces on every frame
    - updating shared state for the API layer
    - draining the pending-enrollment queue
    """
    print("Initializing Home Security System...")
    state.recognizer = FaceRecognizer()
    alert_manager = build_alert()

    for cam_config in ACTIVE_CAMERAS:
        stream = CameraStreamWrapper(
            camera=build_camera(cam_config),
            name=cam_config.get("name", "Camera"),
        )
        state.active_streams.append(stream)

    try:
        for stream in state.active_streams:
            stream.start()
            print(f"  ✓ Camera started: {stream.name}")
    except Exception as exc:
        print(f"Failed to start cameras: {exc}")
        return

    print("AI inference loop running…")

    try:
        while True:
            display_frames: list[np.ndarray] = []
            unknown_detected = False
            trigger_frame = None
            first_cam_raw: np.ndarray | None = None

            for i, stream in enumerate(state.active_streams):
                frame = stream.get_latest_frame()
                if frame is None:
                    continue

                # Preserve raw frame from cam[0] for the registration endpoint
                if i == 0:
                    first_cam_raw = frame.copy()

                results = state.recognizer.process_frame(frame)

                # Update face-pose status from the first camera's first face
                if i == 0:
                    if results:
                        x, y, w, h, _, _, landmarks = results[0]
                        if landmarks is not None:
                            pose_info = compute_pose(landmarks, [x, y, x + w, y + h])
                            with state.face_status_lock:
                                state.latest_face_status = {"face_found": True, **pose_info}
                        else:
                            with state.face_status_lock:
                                state.latest_face_status = {
                                    "face_found": True,
                                    "pose": "center",
                                    "offset_x": 0.0,
                                    "offset_y": 0.0,
                                }
                    else:
                        with state.face_status_lock:
                            state.latest_face_status = {
                                "face_found": False,
                                "pose": "none",
                                "offset_x": 0.0,
                                "offset_y": 0.0,
                            }

                # Annotate frame
                for x, y, w, h, name, is_known, landmarks in results:
                    color = (0, 255, 0) if is_known else (0, 0, 255)
                    cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
                    cv2.putText(frame, name, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
                    if landmarks is not None:
                        for lx, ly in landmarks:
                            cv2.circle(frame, (int(lx), int(ly)), 2, (0, 255, 255), -1)
                    if not is_known:
                        unknown_detected = True
                        trigger_frame = frame.copy()

                cv2.putText(
                    frame, stream.name, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2
                )
                display_frames.append(frame)

            if unknown_detected:
                alert_manager.send_alert("Unknown person detected!", image_frame=trigger_frame)

            if display_frames:
                with state.frame_lock:
                    state.latest_grid_frame = stack_frames(display_frames)

            if first_cam_raw is not None:
                with state.raw_frame_lock:
                    state.latest_raw_frame = first_cam_raw

            # Drain enrollment queue — app.get() is safe here (single thread)
            with state.pending_lock:
                to_enroll = state.pending_embeddings.copy()
                state.pending_embeddings.clear()
            for item in to_enroll:
                state.recognizer.add_face_embedding(item["name"], item["frame"])

            time.sleep(0.03)

    except Exception as exc:
        print(f"Inference loop crashed: {exc}")

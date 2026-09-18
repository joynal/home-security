"""
src/api/inference.py
────────────────────
Background inference thread: grabs camera frames, runs InsightFace,
updates shared state, and drains the enrollment queue.

Each camera is handled independently — one failing camera marks itself
offline in state.camera_status without crashing the loop for the others.
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
from src.camera.video_file import VideoFileCamera
from src.camera.webcam import MacbookWebcam
from src.config import ACTIVE_ALERT, CAMERAS, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
from src.models import CameraConfig
from src.recognition.face_ops import FaceRecognizer

# ──────────────────────────────────────────────────────────
# Factory helpers
# ──────────────────────────────────────────────────────────


def build_camera(config: CameraConfig):
    """Instantiate a camera from its typed config."""
    if config.type == "macbook":
        return MacbookWebcam(camera_index=config.camera_index)
    if config.type in ("tapo", "rtsp"):
        if not config.rtsp_url:
            raise ValueError(f"Camera '{config.id}' requires rtsp_url")
        return TapoCamera(rtsp_url=config.rtsp_url)
    if config.type == "file":
        if not config.rtsp_url:
            raise ValueError(f"Camera '{config.id}' (type file) requires rtsp_url=<video file path>")
        return VideoFileCamera(path=config.rtsp_url)
    raise ValueError(f"Unknown camera type: {config.type}")


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


class _FpsCounter:
    """Simple rolling FPS counter — frames counted over a sliding window."""

    def __init__(self, window_seconds: float = 2.0):
        self.window = window_seconds
        self._frames = 0
        self._window_start = time.monotonic()
        self.fps = 0.0

    def tick(self) -> float:
        """Record a frame; returns current FPS estimate."""
        self._frames += 1
        elapsed = time.monotonic() - self._window_start
        if elapsed >= self.window:
            self.fps = self._frames / elapsed
            self._frames = 0
            self._window_start = time.monotonic()
        return self.fps

    def stale_fps(self) -> float:
        """FPS estimate even when no frame arrived this tick (decays toward 0)."""
        elapsed = time.monotonic() - self._window_start
        if elapsed >= self.window:
            self.fps = 0.0
        return self.fps


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

    # The first enabled camera is the registration camera (pose wizard + capture)
    state.registration_camera_id = next((c.id for c in CAMERAS if c.enabled), None)

    fps_counters: dict[str, _FpsCounter] = {}

    for cam_config in CAMERAS:
        if not cam_config.enabled:
            print(f"  · Camera disabled, skipping: {cam_config.id}")
            continue
        try:
            stream = CameraStreamWrapper(camera=build_camera(cam_config), name=cam_config.name)
        except Exception as exc:
            print(f"  ✗ Camera config invalid: {cam_config.id}: {exc}")
            with state.camera_status_lock:
                state.camera_status[cam_config.id] = {"online": False, "fps": 0, "error": str(exc)}
            continue
        state.active_streams[cam_config.id] = stream
        fps_counters[cam_config.id] = _FpsCounter()

    for cam_id, stream in state.active_streams.items():
        try:
            stream.start()
            with state.camera_status_lock:
                state.camera_status[cam_id] = {"online": True, "fps": 0, "error": None}
            print(f"  ✓ Camera started: {stream.name}")
        except Exception as exc:
            print(f"  ✗ Camera failed to start ({cam_id}): {exc}")
            with state.camera_status_lock:
                state.camera_status[cam_id] = {"online": False, "fps": 0, "error": str(exc)}

    if not state.active_streams:
        print("No cameras running — inference loop exiting.")
        return

    print("AI inference loop running…")

    try:
        while True:
            display_frames: list[np.ndarray] = []
            unknown_detected = False
            trigger_frame = None
            registration_raw: np.ndarray | None = None

            for cam_id, stream in state.active_streams.items():
                # Per-camera isolation: a crash processing one camera must not
                # kill the loop for the others.
                try:
                    frame = stream.get_latest_frame()
                    if frame is None:
                        with state.camera_status_lock:
                            state.camera_status[cam_id]["fps"] = fps_counters[cam_id].stale_fps()
                        continue

                    fps_counters[cam_id].tick()
                    with state.camera_status_lock:
                        state.camera_status[cam_id] = {
                            "online": True,
                            "fps": round(fps_counters[cam_id].fps, 1),
                            "last_frame_at": time.time(),
                            "error": None,
                        }

                    # Preserve the raw frame from the registration camera for /register/capture
                    if cam_id == state.registration_camera_id:
                        registration_raw = frame.copy()

                    results = state.recognizer.process_frame(frame)

                    # Update face-pose status from the registration camera's first face
                    if cam_id == state.registration_camera_id:
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

                    # Encode each camera's JPEG once per loop — MJPEG generators
                    # serve these cached bytes instead of re-encoding per client.
                    ret, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                    with state.frames_lock:
                        state.latest_frames[cam_id] = frame
                        if ret:
                            state.latest_jpeg_bytes[cam_id] = buf.tobytes()

                    display_frames.append(frame)

                except Exception as exc:
                    print(f"Camera processing error ({cam_id}): {exc}")
                    with state.camera_status_lock:
                        state.camera_status[cam_id] = {"online": False, "fps": 0, "error": str(exc)}

            if unknown_detected:
                alert_manager.send_alert("Unknown person detected!", image_frame=trigger_frame)

            if display_frames:
                with state.frame_lock:
                    state.latest_grid_frame = stack_frames(display_frames)

            if registration_raw is not None:
                with state.raw_frame_lock:
                    state.latest_raw_frame = registration_raw

            # Drain enrollment queue — app.get() is safe here (single thread)
            with state.pending_lock:
                to_enroll = state.pending_embeddings.copy()
                state.pending_embeddings.clear()
            for item in to_enroll:
                state.recognizer.add_face_embedding(item["name"], item["frame"])

            time.sleep(0.03)

    except Exception as exc:
        print(f"Inference loop crashed: {exc}")

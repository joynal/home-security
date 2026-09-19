"""
src/api/inference.py
────────────────────
Background inference thread: grabs camera frames, runs InsightFace,
updates shared state, and drains the enrollment queue.

Each camera is handled independently — one failing camera marks itself
offline in state.camera_status without crashing the loop for the others.
"""

import json
import time
from datetime import UTC, datetime

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
from src.config import (
  ACTIVE_ALERT,
  CAMERAS,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  THUMBNAILS_DIR,
)
from src.detection.pipeline import DetectionPipeline
from src.events.database import EventDatabase
from src.events.models import DetectionEvent
from src.models import CameraConfig
from src.recognition.face_ops import FaceRecognizer

# ──────────────────────────────────────────────────────────
# Factory helpers
# ──────────────────────────────────────────────────────────


def build_camera(config: CameraConfig):
  """Instantiate a camera from its typed config."""
  if config.type == 'macbook':
    return MacbookWebcam(camera_index=config.camera_index)
  if config.type in ('tapo', 'rtsp'):
    if not config.rtsp_url:
      raise ValueError(f"Camera '{config.id}' requires rtsp_url")
    return TapoCamera(rtsp_url=config.rtsp_url)
  if config.type == 'file':
    if not config.rtsp_url:
      raise ValueError(
        f"Camera '{config.id}' (type file) requires rtsp_url=<video file path>"
      )
    return VideoFileCamera(path=config.rtsp_url)
  raise ValueError(f'Unknown camera type: {config.type}')


def build_alert():
  """Instantiate the configured alert manager."""
  if ACTIVE_ALERT == 'console':
    return ConsoleAlert(cooldown_seconds=10)
  if ACTIVE_ALERT == 'telegram':
    return TelegramAlert(bot_token=TELEGRAM_BOT_TOKEN, chat_id=TELEGRAM_CHAT_ID)
  if ACTIVE_ALERT == 'ntfy':
    from src.alerts.ntfy import NtfyAlert
    from src.config import NTFY_TOPIC

    if not NTFY_TOPIC:
      raise ValueError('ACTIVE_ALERT=ntfy requires NTFY_TOPIC in .env')
    return NtfyAlert(topic=NTFY_TOPIC)
  raise ValueError(f'Unknown alert: {ACTIVE_ALERT}')


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
    resized.append(
      cv2.resize(f, (int(w * min_h / h), min_h)) if h != min_h else f
    )
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
# Event logging
# ──────────────────────────────────────────────────────────

# Per-camera cooldown so a continuous unknown presence logs one event per
# window, not one per frame (~30/s would flood the DB).
EVENT_COOLDOWN_SECONDS = 30.0

# Known-person sighting cooldown: one row per person per camera per minute —
# enough for "last seen" + counts without flooding.
KNOWN_EVENT_COOLDOWN_SECONDS = 60.0

# Event/thumbnail retention sweep cadence (disk-aware — only prunes when low).
EVENT_RETENTION_SWEEP_SECONDS = 900.0

THUMBNAIL_PAD_PX = 20


def _save_thumbnail(
  camera_id: str, frame: np.ndarray, bbox: list[int] | None
) -> str:
  """Save a (optionally bbox-cropped, padded) JPEG thumbnail. Returns its path."""
  if bbox is not None:
    x, y, w, h = bbox
    y1 = max(0, y - THUMBNAIL_PAD_PX)
    y2 = min(frame.shape[0], y + h + THUMBNAIL_PAD_PX)
    x1 = max(0, x - THUMBNAIL_PAD_PX)
    x2 = min(frame.shape[1], x + w + THUMBNAIL_PAD_PX)
    frame = frame[y1:y2, x1:x2]

  # THUMBNAILS_DIR is env-overridable — never hardcode DATA_DIR / "thumbnails"
  # (the /events/{id}/thumbnail endpoint validates paths against it)
  thumb_dir = THUMBNAILS_DIR / camera_id
  thumb_dir.mkdir(parents=True, exist_ok=True)
  thumb_path = (
    thumb_dir / f'{datetime.now(UTC).strftime("%Y%m%d_%H%M%S_%f")}.jpg'
  )
  cv2.imwrite(str(thumb_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
  return str(thumb_path)


def _log_detection_event(
  camera_id: str,
  frame: np.ndarray,
  last_event_at: dict[str, float],
  event_type: str,
  track_id: int | None = None,
  bbox: list[int] | None = None,
  throttle_key: str | None = None,
  cooldown: float = EVENT_COOLDOWN_SECONDS,
  person_name: str | None = None,
  confidence: float = 0.0,
) -> None:
  """Persist a detection event with a thumbnail (throttled per key)."""
  if state.event_db is None:
    return
  key = throttle_key or f'{event_type}:{camera_id}'
  now = time.time()
  if now - last_event_at.get(key, 0.0) < cooldown:
    return
  last_event_at[key] = now

  metadata = json.dumps({'track_id': track_id}) if track_id is not None else ''
  state.event_db.insert(
    DetectionEvent(
      camera_id=camera_id,
      event_type=event_type,
      person_name=person_name,
      confidence=confidence,
      thumbnail_path=_save_thumbnail(camera_id, frame, bbox),
      metadata=metadata,
    )
  )


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
  print('Initializing Home Security System...')
  state.recognizer = FaceRecognizer()
  if state.event_db is None:  # normally created by lifespan before this thread
    state.event_db = EventDatabase()
  alert_manager = build_alert()

  # The first enabled camera is the registration camera (pose wizard + capture)
  state.registration_camera_id = next(
    (c.id for c in CAMERAS if c.enabled), None
  )

  fps_counters: dict[str, _FpsCounter] = {}

  for cam_config in CAMERAS:
    if not cam_config.enabled:
      print(f'  · Camera disabled, skipping: {cam_config.id}')
      continue
    try:
      stream = CameraStreamWrapper(
        camera=build_camera(cam_config), name=cam_config.name
      )
    except Exception as exc:
      print(f'  ✗ Camera config invalid: {cam_config.id}: {exc}')
      with state.camera_status_lock:
        state.camera_status[cam_config.id] = {
          'online': False,
          'fps': 0,
          'error': str(exc),
        }
      continue
    state.active_streams[cam_config.id] = stream
    fps_counters[cam_config.id] = _FpsCounter()

  for cam_id, stream in state.active_streams.items():
    try:
      stream.start()
      with state.camera_status_lock:
        state.camera_status[cam_id] = {'online': True, 'fps': 0, 'error': None}
      print(f'  ✓ Camera started: {stream.name}')
    except Exception as exc:
      print(f'  ✗ Camera failed to start ({cam_id}): {exc}')
      with state.camera_status_lock:
        state.camera_status[cam_id] = {
          'online': False,
          'fps': 0,
          'error': str(exc),
        }

  if not state.active_streams:
    print('No cameras running — inference loop exiting.')
    return

  print('AI inference loop running…')

  # One cascading pipeline per camera (motion → YOLO → ByteTrack → ArcFace).
  # The registration camera MUST bypass the motion gate — someone holding
  # still for the 5-pose wizard produces zero motion, so the pipeline would
  # return [] and face_status would never update (modal hangs at step 1).
  pipelines: dict[str, DetectionPipeline] = {}
  for cam in CAMERAS:
    if cam.id not in state.active_streams:
      continue
    is_reg_cam = cam.id == state.registration_camera_id
    pipelines[cam.id] = DetectionPipeline(
      recognizer=state.recognizer,
      enable_motion_filter=not is_reg_cam,  # No motion gate for registration cam
      zones=[z.model_dump() for z in cam.zones],
    )
  state.pipelines = pipelines

  # Daily summary at 08:00 local — own cooldown bucket so a coincidental
  # alert right before 8am can't suppress it
  if state.event_db is not None:
    from src.alerts.summary import start_daily_summary_scheduler

    start_daily_summary_scheduler(
      state.event_db,
      lambda text: alert_manager.send_alert(text, person_key='daily-summary'),
    )

  last_event_at: dict[str, float] = {}
  last_retention_sweep = time.time()

  try:
    while True:
      display_frames: list[np.ndarray] = []
      unknown_detected = False
      trigger_frame = None
      event_camera_id: str | None = None
      event_track_id: int | None = None
      event_bbox: list[int] | None = None
      registration_raw: np.ndarray | None = None

      for cam_id, stream in state.active_streams.items():
        # Per-camera isolation: a crash processing one camera must not
        # kill the loop for the others.
        try:
          frame = stream.get_latest_frame()
          if frame is None:
            with state.camera_status_lock:
              state.camera_status[cam_id]['fps'] = fps_counters[
                cam_id
              ].stale_fps()
            continue

          fps_counters[cam_id].tick()
          with state.camera_status_lock:
            state.camera_status[cam_id] = {
              'online': True,
              'fps': round(fps_counters[cam_id].fps, 1),
              'last_frame_at': time.time(),
              'error': None,
            }

          # Preserve the raw frame from the registration camera for /register/capture
          if cam_id == state.registration_camera_id:
            registration_raw = frame.copy()

          # ── Cascading pipeline: motion → YOLO → track → recognize ──
          results = pipelines[cam_id].process_frame(frame)

          # ── Registration camera carve-out ──────────────────────
          # The registration flow needs:
          #   1. registration_raw — the unprocessed frame (captured above)
          #   2. face_status with landmarks relative to the FULL FRAME
          #      (not a person crop), which pose math requires.
          # So for the registration camera, run InsightFace directly.
          if cam_id == state.registration_camera_id:
            raw_results = state.recognizer.process_frame(frame)
            if raw_results:
              x, y, w, h, _, _, landmarks = raw_results[0]
              if landmarks is not None:
                pose_info = compute_pose(landmarks, [x, y, x + w, y + h])
                with state.face_status_lock:
                  state.latest_face_status = {'face_found': True, **pose_info}
              else:
                with state.face_status_lock:
                  state.latest_face_status = {
                    'face_found': True,
                    'pose': 'center',
                    'offset_x': 0.0,
                    'offset_y': 0.0,
                  }
            else:
              with state.face_status_lock:
                state.latest_face_status = {
                  'face_found': False,
                  'pose': 'none',
                  'offset_x': 0.0,
                  'offset_y': 0.0,
                }

          # Annotate frame (pipeline results: dict per detection)
          for det in results:
            x, y, w, h = det['bbox']
            name = det['name']
            is_known = det['is_known']
            color = (0, 255, 0) if is_known else (0, 0, 255)
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            label = f'{name} #{det["track_id"]}'
            if det.get('zone'):
              label += f' [{det["zone"]}]'
            if det.get('loitering'):
              label += ' ⏳LOITERING'
            cv2.putText(
              frame, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2
            )
            if det['landmarks'] is not None:
              for lx, ly in det['landmarks']:
                cv2.circle(frame, (int(lx), int(ly)), 2, (0, 255, 255), -1)
            if not is_known:
              unknown_detected = True
              trigger_frame = frame.copy()
              event_camera_id = cam_id
              event_track_id = det['track_id']
              event_bbox = det['bbox']
            elif name and name != 'Unknown':
              # Known sighting — one event per person per camera per window
              # (per-person history for the Faces page)
              _log_detection_event(
                cam_id,
                frame,
                last_event_at,
                event_type='known_face',
                track_id=det['track_id'],
                bbox=det['bbox'],
                throttle_key=f'known:{cam_id}:{name}',
                cooldown=KNOWN_EVENT_COOLDOWN_SECONDS,
                person_name=name,
              )
            if det.get('loitering'):
              # Fires once per track (detector's alerted flag);
              # zone + duration included in the event
              _log_detection_event(
                cam_id,
                frame,
                last_event_at,
                event_type='loitering',
                track_id=det['track_id'],
                bbox=det['bbox'],
                throttle_key=f'loitering:{cam_id}:{det["track_id"]}',
                cooldown=0.0,  # the detector already dedupes per track
              )

          cv2.putText(
            frame,
            stream.name,
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2,
          )

          # Encode each camera's JPEG once per loop — MJPEG generators
          # serve these cached bytes instead of re-encoding per client.
          ret, buf = cv2.imencode(
            '.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
          )
          with state.frames_lock:
            state.latest_frames[cam_id] = frame
            if ret:
              state.latest_jpeg_bytes[cam_id] = buf.tobytes()

          display_frames.append(frame)

        except Exception as exc:
          print(f'Camera processing error ({cam_id}): {exc}')
          with state.camera_status_lock:
            state.camera_status[cam_id] = {
              'online': False,
              'fps': 0,
              'error': str(exc),
            }

      if unknown_detected:
        alert_manager.send_alert(
          'Unknown person detected!',
          image_frame=trigger_frame,
          person_key=f'unknown#{event_track_id}'
          if event_track_id is not None
          else None,
        )
        if trigger_frame is not None and event_camera_id is not None:
          _log_detection_event(
            event_camera_id,
            trigger_frame,
            last_event_at,
            event_type='unknown_face',
            track_id=event_track_id,
            bbox=event_bbox,
          )

      # Periodic disk-aware retention sweep for events + thumbnails
      if (
        state.event_db is not None
        and time.time() - last_retention_sweep > EVENT_RETENTION_SWEEP_SECONDS
      ):
        last_retention_sweep = time.time()
        state.event_db.delete_older_than(
          days=30, only_if_disk_full=True, min_disk_free_gb=10.0
        )

      if display_frames:
        with state.frame_lock:
          state.latest_grid_frame = stack_frames(display_frames)

      if registration_raw is not None:
        with state.raw_frame_lock:
          state.latest_raw_frame = registration_raw

      # Drain enrollment queues — app.get() is safe here (single thread)
      with state.pending_lock:
        to_enroll = state.pending_embeddings.copy()
        state.pending_embeddings.clear()
      for item in to_enroll:
        state.recognizer.add_face_embedding(item['name'], item['frame'])

      # Request-response jobs (photo import / add-from-event): verdicts go
      # straight back to the waiting API caller
      if state.pending_enroll_jobs:
        from src.api.enroll_jobs import drain_jobs

        drained = drain_jobs()
        if drained:
          print(f'[EnrollJobs] Processed {drained} enrollment job(s)')

      time.sleep(0.03)

  except Exception as exc:
    print(f'Inference loop crashed: {exc}')

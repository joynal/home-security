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
from datetime import UTC
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

import src.api.state as state
from src.alerts.console import ConsoleAlert
from src.alerts.telegram import TelegramAlert
from src.api.pose import compute_pose
from src.camera.osd import draw_timestamp_osd
from src.camera.stream import CameraStreamWrapper
from src.camera.tapo import TapoCamera
from src.camera.video_file import VideoFileCamera
from src.camera.webcam import MacbookWebcam
from src.config import BASE_DIR
from src.config import CAMERAS
from src.config import THUMBNAILS_DIR
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
      raise ValueError(f"Camera '{config.id}' (type file) requires rtsp_url=<video file path>")
    p = Path(config.rtsp_url)
    if not p.is_absolute():
      p = BASE_DIR / p
    return VideoFileCamera(path=str(p))
  raise ValueError(f'Unknown camera type: {config.type}')


def build_alert():
  """Instantiate the alert manager from CURRENT config values (live module
  attrs — PATCH /settings/config takes effect via rebuild_alert)."""
  import src.config as config

  if config.ACTIVE_ALERT == 'console':
    return ConsoleAlert(cooldown_seconds=10)
  if config.ACTIVE_ALERT == 'telegram':
    return TelegramAlert(bot_token=config.TELEGRAM_BOT_TOKEN, chat_id=config.TELEGRAM_CHAT_ID)
  if config.ACTIVE_ALERT == 'ntfy':
    from src.alerts.ntfy import NtfyAlert

    if not config.NTFY_TOPIC:
      raise ValueError('ACTIVE_ALERT=ntfy requires NTFY_TOPIC (settings or .env)')
    return NtfyAlert(topic=config.NTFY_TOPIC)
  raise ValueError(f'Unknown alert: {config.ACTIVE_ALERT}')


def rebuild_alert():
  """Swap in a fresh alert manager from current config (thread-safe).

  Called at inference-loop start and by PATCH /settings/config so alert changes
  apply without a restart. On invalid config (e.g. ntfy without a topic) the
  previous manager is kept — alerts never silently stop.
  """
  try:
    mgr = build_alert()
  except ValueError as exc:
    print(f'[Alert] keeping previous manager: {exc}')
    return state.alert_manager
  with state.alert_lock:
    state.alert_manager = mgr
  return mgr


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
# Event logging
# ──────────────────────────────────────────────────────────

# Per-camera cooldown so a continuous unknown presence logs one event per
# window, not one per frame (~30/s would flood the DB).
EVENT_COOLDOWN_SECONDS = 30.0

# Known-person sighting cooldown: one row per person per camera per minute —
# enough for "last seen" + counts without flooding.
KNOWN_EVENT_COOLDOWN_SECONDS = 60.0

# Auto-enrichment per-track retry window (Task R12). The gate check (pose,
# person-store lookups, quality_check, imwrite) must not run every frame —
# once per track per window regardless of outcome (success or gate failure).
AUTO_ENRICH_RETRY_SECONDS = 60.0
_last_enrich_attempt: dict[str, float] = {}  # 'cam:track' → monotonic ts (loop thread only)


def _enrich_due(cam_id: str, track_id) -> bool:
  """True at most once per AUTO_ENRICH_RETRY_SECONDS per (camera, track)."""
  key = f'{cam_id}:{track_id}'
  now = time.monotonic()
  if now - _last_enrich_attempt.get(key, 0.0) < AUTO_ENRICH_RETRY_SECONDS:
    return False
  _last_enrich_attempt[key] = now
  if len(_last_enrich_attempt) > 256:  # prune stale track keys
    cutoff = now - AUTO_ENRICH_RETRY_SECONDS
    for stale in [k for k, ts in _last_enrich_attempt.items() if ts < cutoff]:
      del _last_enrich_attempt[stale]
  return True


# Event/thumbnail retention sweep cadence (disk-aware — only prunes when low).
EVENT_RETENTION_SWEEP_SECONDS = 900.0

THUMBNAIL_PAD_PX = 20


def _save_thumbnail(camera_id: str, frame: np.ndarray, bbox: list[int] | None) -> str:
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
  thumb_path = thumb_dir / f'{datetime.now(UTC).strftime("%Y%m%d_%H%M%S_%f")}.jpg'
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
  person_id = None
  if person_name and state.person_store is not None:
    person = state.person_store.get_person(name=person_name)
    person_id = person['id'] if person else None
  state.event_db.insert(
    DetectionEvent(
      camera_id=camera_id,
      event_type=event_type,
      person_name=person_name,
      person_id=person_id,
      confidence=confidence,
      thumbnail_path=_save_thumbnail(camera_id, frame, bbox),
      metadata=metadata,
    )
  )


# ──────────────────────────────────────────────────────────
# Live camera lifecycle (loop startup AND Settings camera CRUD — Task R9)
# ──────────────────────────────────────────────────────────


def ensure_pipeline(cam: CameraConfig) -> None:
  """(Re)create the cascading pipeline for a camera on state.pipelines.

  The registration camera bypasses the motion gate (see loop comment below).
  """
  is_reg_cam = cam.id == state.registration_camera_id
  state.pipelines[cam.id] = DetectionPipeline(
    recognizer=state.recognizer,
    enable_motion_filter=not is_reg_cam,
    zones=[z.model_dump() for z in cam.zones],
  )


def start_camera_stream(cam_config: CameraConfig) -> bool:
  """Build, start, and register a camera stream + pipeline."""
  try:
    stream = CameraStreamWrapper(camera=build_camera(cam_config), name=cam_config.name)
    stream.start()
  except Exception as exc:
    print(f'  ✗ Camera failed to start ({cam_config.id}): {exc}')
    with state.camera_status_lock:
      state.camera_status[cam_config.id] = {'online': False, 'error': str(exc)}
    state.active_streams.pop(cam_config.id, None)
    return False
  state.active_streams[cam_config.id] = stream
  ensure_pipeline(cam_config)
  with state.camera_status_lock:
    state.camera_status[cam_config.id] = {'online': True, 'error': None}
  print(f'  ✓ Camera started: {cam_config.name}')
  return True


def stop_camera_stream(cam_id: str) -> None:
  """Tear down a camera's stream, pipeline, recorder, and cached frames."""
  stream = state.active_streams.pop(cam_id, None)
  if stream is not None:
    try:
      stream.stop()
    except Exception as exc:
      print(f'  ✗ Camera stop error ({cam_id}): {exc}')
  state.pipelines.pop(cam_id, None)
  if state.recording_manager is not None:
    state.recording_manager.stop_camera(cam_id)
  with state.camera_status_lock:
    state.camera_status.pop(cam_id, None)
  with state.frames_lock:
    state.latest_frames.pop(cam_id, None)
    state.latest_jpeg_bytes.pop(cam_id, None)
  print(f'  · Camera stopped: {cam_id}')


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
  alert_manager = rebuild_alert()

  # The first enabled camera is the registration camera (pose wizard + capture)
  state.registration_camera_id = next((c.id for c in CAMERAS if c.enabled), None)

  for cam_config in CAMERAS:
    if not cam_config.enabled:
      print(f'  · Camera disabled, skipping: {cam_config.id}')
      continue
    start_camera_stream(cam_config)

  if not state.active_streams:
    print('No cameras running — inference loop exiting.')
    return

  print('AI inference loop running…')

  # Pipelines were created per-camera by start_camera_stream → ensure_pipeline
  # (one cascading pipeline per camera: motion → YOLO → ByteTrack → ArcFace;
  # the registration camera bypasses the motion gate — see ensure_pipeline).

  # Daily summary at 08:00 local — own cooldown bucket so a coincidental
  # alert right before 8am can't suppress it
  if state.event_db is not None:
    from src.alerts.summary import start_daily_summary_scheduler

    start_daily_summary_scheduler(
      state.event_db,
      # Read via state at call time so a live rebuild (PATCH /settings/config)
      # is honored; fall back to the loop-start manager.
      lambda text: (state.alert_manager or alert_manager).send_alert(
        text, person_key='daily-summary'
      ),
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
            continue

          with state.camera_status_lock:
            state.camera_status[cam_id] = {
              'online': True,
              'last_frame_at': time.time(),
              'error': None,
            }

          # Preserve the raw frame from the registration camera for /register/capture
          if cam_id == state.registration_camera_id:
            registration_raw = frame.copy()

          # ── Cascading pipeline: motion → YOLO → track → recognize ──
          pipeline = state.pipelines.get(cam_id)
          if pipeline is None:  # camera added at runtime without a pipeline
            ensure_pipeline(next(c for c in CAMERAS if c.id == cam_id))
            pipeline = state.pipelines[cam_id]
          results = pipeline.process_frame(frame)

          # ── Registration camera carve-out ──────────────────────
          # The registration flow needs:
          #   1. registration_raw — the unprocessed frame (captured above)
          #   2. face_status with landmarks relative to the FULL FRAME
          #      (not a person crop), which pose math requires.
          # So for the registration camera, run InsightFace directly.
          if cam_id == state.registration_camera_id:
            raw_results = state.recognizer.process_frame(frame)
            if raw_results:
              x, y, w, h, _, _, landmarks = raw_results[0][:7]
              if landmarks is not None:
                pose_info = compute_pose(landmarks, [x, y, x + w, y + h])
                with state.face_status_lock:
                  state.latest_face_status = {
                    'face_found': True,
                    'bbox': [x, y, x + w, y + h],
                    **pose_info,
                  }
              else:
                with state.face_status_lock:
                  state.latest_face_status = {
                    'face_found': True,
                    'bbox': [x, y, x + w, y + h],
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
            cv2.putText(frame, label, (x, y - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
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

              # Task S4.4: Passive auto-enrichment loop
              sim = det.get('similarity', 0.0)
              if (
                getattr(state, 'auto_enrichment_enabled', True)
                and sim >= 0.62
                and det.get('landmarks') is not None
                and state.person_store is not None
                and _enrich_due(cam_id, det['track_id'])
              ):
                pose_info = compute_pose(det['landmarks'], det['bbox'])
                if pose_info['pose'] == 'center':
                  person = state.person_store.get_person(name=name)
                  if person and len(state.person_store.images_for(person['id'])) < 12:
                    from src.api.enroll_jobs import quality_check
                    from src.config import KNOWN_FACES_DIR

                    left, top, w_b, h_b = det['bbox']
                    passed, _ = quality_check(frame, [left, top, left + w_b, top + h_b])
                    if passed:
                      h_f, w_f = frame.shape[:2]
                      pad_x = int(w_b * 0.25)
                      pad_y = int(h_b * 0.25)
                      x1 = max(0, left - pad_x)
                      y1 = max(0, top - pad_y)
                      x2 = min(w_f, left + w_b + pad_x)
                      y2 = min(h_f, top + h_b + pad_y)
                      crop = frame[y1:y2, x1:x2]
                      if crop.size > 0:
                        person_dir = KNOWN_FACES_DIR / name
                        person_dir.mkdir(parents=True, exist_ok=True)
                        fname = f'auto_{int(time.time())}_{det["track_id"]}.jpg'
                        save_path = person_dir / fname
                        if not save_path.exists():
                          cv2.imwrite(str(save_path), crop)
                          state.person_store.add_image(person['id'], save_path, source='auto')
                          with state.pending_lock:
                            state.pending_embeddings.append({'name': name, 'frame': crop})
                          print(f"[AutoEnrich] Auto-enrolled frontal crop for '{name}'")
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

          draw_timestamp_osd(frame, stream.name)

          # Encode each camera's JPEG once per loop — MJPEG generators
          # serve these cached bytes instead of re-encoding per client.
          ret, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
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
              'error': str(exc),
            }

      if unknown_detected:
        (state.alert_manager or alert_manager).send_alert(
          'Unknown person detected!',
          image_frame=trigger_frame,
          person_key=f'unknown#{event_track_id}' if event_track_id is not None else None,
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
        state.event_db.delete_older_than(days=30, only_if_disk_full=True, min_disk_free_gb=10.0)

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

"""
src/api/routers/settings.py
───────────────────────────
System diagnostics and settings API router:
  GET /settings/system — CPU, memory, disk usage, uptime, camera counts, events today
  POST /settings/system/vacuum — SQLite VACUUM database maintenance
  GET /settings/config — Read typed app settings (cameras, retention, vision thresholds, alerts)
  PATCH /settings/config — Update app settings with atomic persistence
  POST /settings/cameras — Add new camera configuration
  PUT /settings/cameras/{id} — Update existing camera configuration
  DELETE /settings/cameras/{id} — Delete camera configuration
  POST /settings/cameras/test — Test RTSP / webcam stream connection
  POST /settings/alerts/test — Dispatch test alert to Telegram, ntfy, or Console
  POST /settings/security/change-password — Update admin password
"""

import os
import shutil
import time
from datetime import UTC
from datetime import datetime
from pathlib import Path

import cv2
import httpx
import psutil
from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import status
from pydantic import BaseModel
from pydantic import Field

import src.api.state as state
from src.api.auth import get_current_user
from src.api.auth import update_password
from src.api.auth import verify_password
from src.config import CAMERAS
from src.config import RECORDINGS_DIR
from src.config import THUMBNAILS_DIR
from src.config import save_cameras
from src.events.database import DB_PATH
from src.models import CameraConfig

router = APIRouter(prefix='/settings')

_PROCESS_START_TIME = time.time()


# ── Pydantic Request Models ───────────────────────────────────────────────────


class RetentionUpdate(BaseModel):
  retain_days: int | None = Field(default=None, ge=1, le=365)
  min_disk_free_gb: float | None = Field(default=None, ge=0.5)
  delete_only_if_disk_full: bool | None = None


class AIUpdate(BaseModel):
  similarity_threshold: float | None = Field(default=None, ge=0.1, le=0.99)
  loitering_seconds: float | None = Field(default=None, ge=1.0, le=600.0)
  auto_enrichment: bool | None = None


class ConfigUpdateRequest(BaseModel):
  active_alert: str | None = None
  telegram_bot_token: str | None = None
  telegram_chat_id: str | None = None
  ntfy_topic: str | None = None
  retention: RetentionUpdate | None = None
  ai: AIUpdate | None = None


class CameraTestRequest(BaseModel):
  type: str = 'rtsp'  # 'macbook', 'rtsp', 'file', 'tapo'
  rtsp_url: str | None = None
  camera_index: int = 0


class AlertTestRequest(BaseModel):
  provider: str | None = None  # 'console', 'telegram', 'ntfy'
  message: str = 'Test alert from Aegis Vision AI'


class PasswordChangeRequest(BaseModel):
  current_password: str
  new_password: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _dir_size_gb(path: Path) -> float:
  """Return directory size in gigabytes (GB). Returns 0.0 if not existing."""
  if not path.exists():
    return 0.0
  total = 0
  for dirpath, _, filenames in os.walk(path):
    for f in filenames:
      fp = os.path.join(dirpath, f)
      try:
        total += os.path.getsize(fp)
      except OSError:
        pass
  return round(total / (1024**3), 3)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get('/system')
def get_system_health(_: str = Depends(get_current_user)):
  """Return live system resource usage and security metrics."""
  try:
    usage = shutil.disk_usage(RECORDINGS_DIR)
    total_gb = round(usage.total / (1024**3), 1)
    free_gb = round(usage.free / (1024**3), 1)
    used_gb = round(usage.used / (1024**3), 1)
    percent_used = round((usage.used / usage.total) * 100, 1) if usage.total > 0 else 0.0
  except OSError:
    total_gb, free_gb, used_gb, percent_used = 0.0, 0.0, 0.0, 0.0

  recordings_gb = _dir_size_gb(RECORDINGS_DIR)
  thumbnails_gb = _dir_size_gb(THUMBNAILS_DIR)
  database_mb = round(DB_PATH.stat().st_size / (1024**2), 2) if DB_PATH.exists() else 0.0

  # CPU & Memory
  try:
    cpu_percent = psutil.cpu_percent(interval=None)
    if cpu_percent == 0.0 and hasattr(os, 'getloadavg'):
      cpu_count = os.cpu_count() or 1
      cpu_percent = round(min(100.0, (os.getloadavg()[0] / cpu_count) * 100), 1)
  except Exception:
    cpu_percent = 0.0

  try:
    process = psutil.Process()
    memory_mb = round(process.memory_info().rss / (1024**2), 1)
  except Exception:
    memory_mb = 0.0

  # Cameras status
  cameras_total = len(CAMERAS)
  cameras_online = 0
  with state.camera_status_lock:
    for c in CAMERAS:
      if state.camera_status.get(c.id, {}).get('online', False):
        cameras_online += 1

  # Events today
  events_today = 0
  if state.event_db:
    try:
      today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
      events_today = state.event_db.count(since=today_start)
    except Exception:
      events_today = 0

  uptime_seconds = round(time.time() - _PROCESS_START_TIME, 1)

  return {
    'cpu_percent': cpu_percent,
    'memory_mb': memory_mb,
    'disk': {
      'total_gb': total_gb,
      'free_gb': free_gb,
      'used_gb': used_gb,
      'percent_used': percent_used,
      'recordings_gb': recordings_gb,
      'thumbnails_gb': thumbnails_gb,
      'database_mb': database_mb,
    },
    'uptime_seconds': uptime_seconds,
    'cameras_online': cameras_online,
    'cameras_total': cameras_total,
    'events_today': events_today,
  }


@router.post('/system/vacuum')
def vacuum_database(_: str = Depends(get_current_user)):
  """Execute VACUUM on SQLite database to defragment and reclaim space."""
  if not DB_PATH.exists():
    return {'success': True, 'size_before_mb': 0.0, 'size_after_mb': 0.0}

  size_before = round(DB_PATH.stat().st_size / (1024**2), 3)

  if state.event_db is not None:
    with state.event_db._lock:
      state.event_db._conn.execute('VACUUM')
  else:
    import sqlite3

    with sqlite3.connect(DB_PATH) as conn:
      conn.execute('VACUUM')

  size_after = round(DB_PATH.stat().st_size / (1024**2), 3)
  return {'success': True, 'size_before_mb': size_before, 'size_after_mb': size_after}


@router.get('/config')
def get_config(_: str = Depends(get_current_user)):
  """Return full application configuration with sensitive tokens masked."""
  import src.config as config

  tg_chat_masked = ''
  if config.TELEGRAM_CHAT_ID:
    if len(config.TELEGRAM_CHAT_ID) > 4:
      tg_chat_masked = f'{config.TELEGRAM_CHAT_ID[:2]}***{config.TELEGRAM_CHAT_ID[-2:]}'
    else:
      tg_chat_masked = '***'

  retention_sample = {
    'retain_days': config.CAMERAS[0].record.retain_days if config.CAMERAS else 30,
    'min_disk_free_gb': config.CAMERAS[0].record.min_disk_free_gb if config.CAMERAS else 10.0,
    'delete_only_if_disk_full': (
      config.CAMERAS[0].record.delete_only_if_disk_full if config.CAMERAS else True
    ),
  }

  return {
    'cameras': [c.model_dump() for c in config.CAMERAS],
    'active_alert': config.ACTIVE_ALERT,
    'retention': retention_sample,
    'ai': {
      'similarity_threshold': getattr(state, 'face_similarity_threshold', 0.40),
      'loitering_seconds': getattr(state, 'loitering_seconds', 30.0),
      'auto_enrichment': getattr(state, 'auto_enrichment_enabled', True),
    },
    'alerts': {
      'active': config.ACTIVE_ALERT,
      'telegram_configured': bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID),
      'telegram_chat_id': tg_chat_masked,
      'ntfy_topic': config.NTFY_TOPIC,
    },
  }


@router.patch('/config')
def update_config(req: ConfigUpdateRequest, _: str = Depends(get_current_user)):
  """Update runtime settings, persist them (data/settings.json), and rebuild
  the live alert manager — changes take effect without a restart."""
  import src.config as config

  if req.active_alert is not None:
    if req.active_alert not in ('console', 'telegram', 'ntfy'):
      raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid alert provider')
    config.ACTIVE_ALERT = req.active_alert

  if req.telegram_bot_token is not None:
    config.TELEGRAM_BOT_TOKEN = req.telegram_bot_token
  if req.telegram_chat_id is not None:
    config.TELEGRAM_CHAT_ID = req.telegram_chat_id
  if req.ntfy_topic is not None:
    config.NTFY_TOPIC = req.ntfy_topic

  ai_snapshot = {}
  if req.ai is not None:
    if req.ai.similarity_threshold is not None:
      state.face_similarity_threshold = float(req.ai.similarity_threshold)
      if state.recognizer is not None:
        state.recognizer.similarity_threshold = float(req.ai.similarity_threshold)
    if req.ai.loitering_seconds is not None:
      state.loitering_seconds = float(req.ai.loitering_seconds)
    if req.ai.auto_enrichment is not None:
      state.auto_enrichment_enabled = bool(req.ai.auto_enrichment)
    ai_snapshot = {
      'similarity_threshold': state.face_similarity_threshold,
      'loitering_seconds': state.loitering_seconds,
      'auto_enrichment': state.auto_enrichment_enabled,
    }

  if req.retention is not None and config.CAMERAS:
    for cam in config.CAMERAS:
      if req.retention.retain_days is not None:
        cam.record.retain_days = req.retention.retain_days
      if req.retention.min_disk_free_gb is not None:
        cam.record.min_disk_free_gb = req.retention.min_disk_free_gb
      if req.retention.delete_only_if_disk_full is not None:
        cam.record.delete_only_if_disk_full = req.retention.delete_only_if_disk_full
    save_cameras(config.CAMERAS)

  # Persist the effective snapshot (Task R8) — survives restarts; boot overlay
  # in src/config.py applies it over .env defaults.
  from src.settings_store import save_settings

  save_settings(
    {
      'active_alert': config.ACTIVE_ALERT,
      'telegram_bot_token': config.TELEGRAM_BOT_TOKEN or '',
      'telegram_chat_id': config.TELEGRAM_CHAT_ID or '',
      'ntfy_topic': config.NTFY_TOPIC or '',
      'ai': ai_snapshot,
    }
  )

  # Rebuild the live alert manager so the new provider/credentials apply now
  from src.api.inference import rebuild_alert

  rebuilt = rebuild_alert()

  return {
    'success': True,
    'message': 'Configuration updated',
    'alert_manager': type(rebuilt).__name__ if rebuilt is not None else None,
  }


# ── Camera CRUD Endpoints ─────────────────────────────────────────────────────


@router.post('/cameras')
def add_camera(cam: CameraConfig, _: str = Depends(get_current_user)):
  """Add a new camera configuration with atomic persistence."""
  import src.config as config

  if any(c.id == cam.id for c in config.CAMERAS):
    raise HTTPException(
      status_code=status.HTTP_409_CONFLICT,
      detail=f"Camera with id '{cam.id}' already exists",
    )

  new_cameras = list(config.CAMERAS) + [cam]
  save_cameras(new_cameras)
  with state.camera_status_lock:
    state.camera_status[cam.id] = {'online': False, 'fps': 0.0, 'last_frame_at': None}
  return cam


@router.put('/cameras/{camera_id}')
def update_camera(camera_id: str, updated_cam: CameraConfig, _: str = Depends(get_current_user)):
  """Update an existing camera configuration."""
  import src.config as config

  idx = next((i for i, c in enumerate(config.CAMERAS) if c.id == camera_id), None)
  if idx is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found"
    )

  new_cameras = list(config.CAMERAS)
  new_cameras[idx] = updated_cam
  save_cameras(new_cameras)
  return updated_cam


@router.delete('/cameras/{camera_id}')
def delete_camera(camera_id: str, _: str = Depends(get_current_user)):
  """Delete a camera configuration and clean up its status."""
  import src.config as config

  idx = next((i for i, c in enumerate(config.CAMERAS) if c.id == camera_id), None)
  if idx is None:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND, detail=f"Camera '{camera_id}' not found"
    )

  new_cameras = [c for c in config.CAMERAS if c.id != camera_id]
  save_cameras(new_cameras)

  with state.camera_status_lock:
    state.camera_status.pop(camera_id, None)
  with state.frames_lock:
    state.latest_frames.pop(camera_id, None)
    state.latest_jpeg_bytes.pop(camera_id, None)

  return {'success': True, 'id': camera_id}


# ── Stream Connection Test ────────────────────────────────────────────────────


@router.post('/cameras/test')
def check_camera_connection(req: CameraTestRequest, _: str = Depends(get_current_user)):
  """Test camera connection and verify frame capture."""
  target: int | str
  if req.type == 'macbook':
    target = req.camera_index
  elif req.type in ('rtsp', 'tapo', 'file'):
    if not req.rtsp_url:
      return {'success': False, 'error': 'rtsp_url is required'}
    target = req.rtsp_url
  else:
    return {'success': False, 'error': f'Unsupported camera type: {req.type}'}

  cap = cv2.VideoCapture(target)
  try:
    if not cap.isOpened():
      return {'success': False, 'error': f'Failed to open stream source: {target}'}

    ret, frame = cap.read()
    if not ret or frame is None:
      return {'success': False, 'error': 'Stream opened but could not read frame'}

    h, w = frame.shape[:2]
    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    return {'success': True, 'width': w, 'height': h, 'fps': round(fps, 1), 'error': None}
  except Exception as e:
    return {'success': False, 'error': str(e)}
  finally:
    cap.release()


# ── Alert Notification Test ───────────────────────────────────────────────────


@router.post('/alerts/test')
async def dispatch_test_alert(req: AlertTestRequest, _: str = Depends(get_current_user)):
  """Send a test alert via specified or active provider."""
  import src.config as config

  prov = req.provider or config.ACTIVE_ALERT
  msg = req.message

  if prov == 'console':
    print(f'\n[TEST ALERT | {time.strftime("%H:%M:%S")}] {msg}')
    return {'success': True, 'detail': 'Test alert logged to server console'}

  if prov == 'ntfy':
    topic = config.NTFY_TOPIC
    if not topic:
      return {'success': False, 'detail': 'NTFY_TOPIC is not configured'}
    url = f'https://ntfy.sh/{topic}'
    try:
      async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(
          url,
          content=msg.encode(),
          headers={'Title': 'Aegis Vision Test Alert', 'Priority': 'high', 'Tags': 'bell'},
        )
        res.raise_for_status()
      return {'success': True, 'detail': f'Sent test alert to ntfy.sh/{topic}'}
    except Exception as e:
      return {'success': False, 'detail': f'ntfy alert failed: {e}'}

  if prov == 'telegram':
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
      return {'success': False, 'detail': 'Telegram bot token or chat ID is missing'}
    url = f'https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/sendMessage'
    try:
      async with httpx.AsyncClient(timeout=10.0) as client:
        res = await client.post(url, data={'chat_id': config.TELEGRAM_CHAT_ID, 'text': msg})
        res.raise_for_status()
      return {'success': True, 'detail': 'Sent test alert to Telegram chat'}
    except Exception as e:
      return {'success': False, 'detail': f'Telegram alert failed: {e}'}

  return {'success': False, 'detail': f'Unknown alert provider: {prov}'}


# ── Security & Authentication ─────────────────────────────────────────────────


@router.post('/security/change-password')
def change_password(req: PasswordChangeRequest, _: str = Depends(get_current_user)):
  """Change admin password after verifying current password and strength."""
  if not verify_password(req.current_password):
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST, detail='Current password is incorrect'
    )

  try:
    update_password(req.new_password)
  except ValueError as e:
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)) from e

  return {'success': True, 'message': 'Admin password updated successfully'}

"""
src/api/routers/settings.py
───────────────────────────
System diagnostics and settings API router:
  GET /settings/system — CPU, memory, disk usage, uptime, camera counts, events today
"""

import os
import shutil
import time
from datetime import UTC
from datetime import datetime
from pathlib import Path

import psutil
from fastapi import APIRouter
from fastapi import Depends

import src.api.state as state
from src.api.auth import get_current_user
from src.config import CAMERAS
from src.config import RECORDINGS_DIR
from src.config import THUMBNAILS_DIR
from src.events.database import DB_PATH

router = APIRouter(prefix='/settings')

_PROCESS_START_TIME = time.time()


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


@router.get('/system')
def get_system_health(_: str = Depends(get_current_user)):
  """Return live system resource usage and security metrics."""
  # Disk metrics
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
      # Fallback to 1-min load average normalized to CPU count
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

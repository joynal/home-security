"""Tests for settings and system health API (Task S2.3 / S5.1)."""

from datetime import UTC
from datetime import datetime

import pytest

import src.api.state as state
from src.api.routers.settings import get_system_health
from src.events.database import EventDatabase
from src.events.models import DetectionEvent
from src.models import CameraConfig


@pytest.fixture
def env(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  rec_dir = tmp_path / 'recordings'
  rec_dir.mkdir()
  thumb_dir = tmp_path / 'thumbnails'
  thumb_dir.mkdir()

  # Create a dummy recording and thumbnail file
  (rec_dir / 'cam1').mkdir()
  (rec_dir / 'cam1' / 'clip.mp4').write_bytes(b'x' * 1024)
  (thumb_dir / 'thumb.jpg').write_bytes(b'y' * 512)

  monkeypatch.setattr('src.api.routers.settings.RECORDINGS_DIR', rec_dir)
  monkeypatch.setattr('src.api.routers.settings.THUMBNAILS_DIR', thumb_dir)
  monkeypatch.setattr('src.api.routers.settings.DB_PATH', tmp_path / 'aegis.db')
  monkeypatch.setattr(state, 'event_db', db)

  test_cameras = [
    CameraConfig(id='cam1', name='Camera 1', type='macbook'),
    CameraConfig(id='cam2', name='Camera 2', type='macbook'),
  ]
  monkeypatch.setattr('src.api.routers.settings.CAMERAS', test_cameras)

  with state.camera_status_lock:
    state.camera_status['cam1'] = {'online': True, 'fps': 15.0}
    state.camera_status['cam2'] = {'online': False, 'fps': 0.0}

  yield db, rec_dir, thumb_dir
  db.close()


def test_system_health_returns_metrics(env):
  db, _, _ = env
  # Insert an event for today
  now = datetime.now(UTC)
  db.insert(
    DetectionEvent(
      camera_id='cam1',
      event_type='known_face',
      person_name='Alice',
      timestamp=now,
    )
  )

  res = get_system_health()

  assert isinstance(res['cpu_percent'], (int, float))
  assert isinstance(res['memory_mb'], (int, float))
  assert 'disk' in res
  disk = res['disk']
  assert disk['total_gb'] > 0
  assert disk['free_gb'] >= 0
  assert disk['used_gb'] >= 0
  assert disk['recordings_gb'] >= 0
  assert disk['thumbnails_gb'] >= 0
  assert disk['database_mb'] >= 0
  assert res['uptime_seconds'] >= 0
  assert res['cameras_total'] == 2
  assert res['cameras_online'] == 1
  assert res['events_today'] >= 1

"""Tests for settings, system health, and camera management API (Task S5.1)."""

import json
from datetime import UTC
from datetime import datetime

import pytest
from fastapi import HTTPException
from passlib.context import CryptContext

import src.api.state as state
from src.api.routers.settings import AIUpdate
from src.api.routers.settings import AlertTestRequest
from src.api.routers.settings import CameraTestRequest
from src.api.routers.settings import ConfigUpdateRequest
from src.api.routers.settings import PasswordChangeRequest
from src.api.routers.settings import RetentionUpdate
from src.api.routers.settings import add_camera
from src.api.routers.settings import change_password
from src.api.routers.settings import check_camera_connection
from src.api.routers.settings import delete_camera
from src.api.routers.settings import dispatch_test_alert
from src.api.routers.settings import get_config
from src.api.routers.settings import get_system_health
from src.api.routers.settings import update_camera
from src.api.routers.settings import update_config
from src.api.routers.settings import vacuum_database
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
  data_dir = tmp_path / 'data'
  data_dir.mkdir()

  # Create a dummy recording and thumbnail file
  (rec_dir / 'cam1').mkdir()
  (rec_dir / 'cam1' / 'clip.mp4').write_bytes(b'x' * 1024)
  (thumb_dir / 'thumb.jpg').write_bytes(b'y' * 512)

  monkeypatch.setattr('src.api.routers.settings.RECORDINGS_DIR', rec_dir)
  monkeypatch.setattr('src.api.routers.settings.THUMBNAILS_DIR', thumb_dir)
  monkeypatch.setattr('src.api.routers.settings.DB_PATH', tmp_path / 'aegis.db')
  monkeypatch.setattr(state, 'event_db', db)

  cameras_file = data_dir / 'cameras.json'
  monkeypatch.setattr('src.config.CAMERAS_FILE', cameras_file)
  monkeypatch.setattr('src.config.DATA_DIR', data_dir)

  test_cameras = [
    CameraConfig(id='cam1', name='Camera 1', type='macbook'),
    CameraConfig(id='cam2', name='Camera 2', type='macbook'),
  ]
  monkeypatch.setattr('src.config.CAMERAS', list(test_cameras))
  monkeypatch.setattr('src.api.routers.settings.CAMERAS', list(test_cameras))

  # Set credentials for password tests
  pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
  creds_file = data_dir / 'credentials.json'
  creds_data = {'username': 'admin', 'hashed_password': pwd_ctx.hash('InitialPass123')}
  creds_file.write_text(json.dumps(creds_data))
  monkeypatch.setattr('src.api.auth.CREDENTIALS_FILE', creds_file)
  monkeypatch.setattr('src.api.auth._creds', creds_data)

  with state.camera_status_lock:
    state.camera_status['cam1'] = {'online': True, 'fps': 15.0}
    state.camera_status['cam2'] = {'online': False, 'fps': 0.0}

  yield db, rec_dir, thumb_dir
  db.close()


def test_system_health_returns_metrics(env):
  db, _, _ = env
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


def test_vacuum_database(env):
  res = vacuum_database()
  assert res['success'] is True
  assert res['size_before_mb'] >= 0
  assert res['size_after_mb'] >= 0


def test_get_and_patch_config(env):
  # 1. Get config
  cfg = get_config()
  assert 'cameras' in cfg
  assert len(cfg['cameras']) == 2
  assert 'active_alert' in cfg
  assert 'retention' in cfg
  assert 'ai' in cfg
  assert 'alerts' in cfg

  # 2. Patch config (AI, retention, alerts)
  update_req = ConfigUpdateRequest(
    active_alert='console',
    ai=AIUpdate(similarity_threshold=0.55, loitering_seconds=45.0, auto_enrichment=False),
    retention=RetentionUpdate(retain_days=14, min_disk_free_gb=15.0, delete_only_if_disk_full=True),
  )
  update_res = update_config(update_req)
  assert update_res['success'] is True

  assert state.face_similarity_threshold == 0.55
  assert state.loitering_seconds == 45.0
  assert state.auto_enrichment_enabled is False

  # Check updated config returned
  updated_cfg = get_config()
  assert updated_cfg['ai']['similarity_threshold'] == 0.55
  assert updated_cfg['ai']['auto_enrichment'] is False
  assert updated_cfg['retention']['retain_days'] == 14


def test_camera_crud(env):
  # 1. Add camera
  new_cam = CameraConfig(id='porch_cam', name='Porch Camera', type='macbook')
  added = add_camera(new_cam)
  assert added.id == 'porch_cam'

  # Attempt duplicate add -> 409
  with pytest.raises(HTTPException) as exc_info:
    add_camera(new_cam)
  assert exc_info.value.status_code == 409

  # 2. Update camera
  updated = CameraConfig(id='porch_cam', name='Porch Cam Renamed', type='macbook')
  res_updated = update_camera('porch_cam', updated)
  assert res_updated.name == 'Porch Cam Renamed'

  # Update non-existent -> 404
  with pytest.raises(HTTPException) as exc_info:
    update_camera('non_existent', updated)
  assert exc_info.value.status_code == 404

  # 3. Delete camera
  del_res = delete_camera('porch_cam')
  assert del_res['success'] is True
  assert del_res['id'] == 'porch_cam'

  # Delete non-existent -> 404
  with pytest.raises(HTTPException) as exc_info:
    delete_camera('porch_cam')
  assert exc_info.value.status_code == 404


def test_test_camera_connection_file(tmp_path, monkeypatch):
  # Test with dummy video file path
  req = CameraTestRequest(type='file', rtsp_url=str(tmp_path / 'non_existent.mp4'))
  res = check_camera_connection(req)
  assert res['success'] is False
  assert res['error'] is not None


@pytest.mark.anyio
async def test_test_alert_console():
  req = AlertTestRequest(provider='console', message='Unit test console alert')
  res = await dispatch_test_alert(req)
  assert res['success'] is True
  assert 'console' in res['detail'].lower()


def test_change_password(env):
  # Wrong current password -> 400
  with pytest.raises(HTTPException) as exc:
    change_password(
      PasswordChangeRequest(current_password='WrongPassword1', new_password='NewValidPass123')
    )
  assert exc.value.status_code == 400

  # Weak new password (no digit) -> 422
  with pytest.raises(HTTPException) as exc:
    change_password(PasswordChangeRequest(current_password='InitialPass123', new_password='short'))
  assert exc.value.status_code == 422

  # Successful change
  res = change_password(
    PasswordChangeRequest(current_password='InitialPass123', new_password='NewSuperPassword123')
  )
  assert res['success'] is True

  # Verify can't use old password anymore
  with pytest.raises(HTTPException) as exc:
    change_password(
      PasswordChangeRequest(current_password='InitialPass123', new_password='AnotherPass123')
    )
  assert exc.value.status_code == 400

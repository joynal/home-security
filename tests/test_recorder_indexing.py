"""Tests for recorder ↔ recordings-index wiring (Task B1.2). No ffmpeg needed."""

from datetime import UTC, datetime

import pytest

from src.events.database import EventDatabase
from src.models import CameraConfig
from src.recording.index import RecordingIndex
from src.recording.recorder import CameraRecorder, RecordingManager


def _camera(**record_overrides):
  record = {'enabled': True}
  record.update(record_overrides)
  return CameraConfig(
    id='front_door', name='Front Door', type='rtsp', rtsp_url='rtsp://x', record=record
  )


@pytest.fixture
def env(tmp_path):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  rec_dir = tmp_path / 'recordings'
  rec_dir.mkdir()
  idx = RecordingIndex(db._conn, db._lock, rec_dir)  # noqa: SLF001 — shared by design
  yield db, rec_dir, idx
  db.close()


def _seg(cam_dir, name, size=1024):
  path = cam_dir / name
  path.write_bytes(b'x' * size)
  return path


def test_start_backfills_index_from_disk(env, monkeypatch):
  """Recorder.start() scans existing segments even before ffmpeg runs."""
  db, rec_dir, idx = env
  cam_dir = rec_dir / 'front_door'
  cam_dir.mkdir()
  _seg(cam_dir, '20260919_100000.mp4')
  _seg(cam_dir, '20260919_101500.mp4')

  import src.recording.recorder as mod

  monkeypatch.setattr(mod, '_check_ffmpeg_available', lambda: False)
  rec = CameraRecorder(_camera(), recordings_dir=rec_dir, index=idx)
  rec.start()  # ffmpeg absent → only the backfill scan runs

  assert idx.days_with_recordings() == ['2026-09-19']
  assert len(idx.segments_between(
    'front_door', datetime(2026, 9, 19, tzinfo=UTC), datetime(2026, 9, 20, tzinfo=UTC)
  )) == 2


def test_rescan_picks_up_new_rotation(env):
  """Simulated rotation: a new segment file appears while 'recording' runs."""
  db, rec_dir, idx = env
  rec = CameraRecorder(_camera(), recordings_dir=rec_dir, index=idx)
  cam_dir = rec.output_dir
  _seg(cam_dir, '20260919_100000.mp4')
  rec._rescan_index()
  assert idx.days_with_recordings() == ['2026-09-19']

  _seg(cam_dir, '20260919_101500.mp4')  # ffmpeg rotated
  rec._rescan_index()
  segs = idx.segments_between(
    'front_door', datetime(2026, 9, 19, tzinfo=UTC), datetime(2026, 9, 20, tzinfo=UTC)
  )
  assert len(segs) == 2


def test_retention_drops_index_rows_for_deleted_files(env, monkeypatch):
  db, rec_dir, idx = env
  cam_dir = rec_dir / 'front_door'
  cam_dir.mkdir()
  _seg(cam_dir, '20260919_100000.mp4')
  _seg(cam_dir, '20260919_101500.mp4')
  idx.scan_directory()

  # Force deletion: strict mode + ancient mtime on both files
  import os
  import time

  for f in cam_dir.glob('*.mp4'):
    os.utime(f, (time.time() - 40 * 86400, time.time() - 40 * 86400))
  rec = CameraRecorder(
    _camera(delete_only_if_disk_full=False, retain_days=30),
    recordings_dir=rec_dir,
    index=idx,
  )
  rec.cleanup_old_segments()

  assert idx.days_with_recordings() == []  # rows gone with the files


def test_recorder_without_index_still_works(tmp_path):
  """index is optional — recorders must run standalone (backwards compat)."""
  rec = CameraRecorder(_camera(), recordings_dir=tmp_path)
  rec._rescan_index()  # no-op, no exception
  assert rec.index is None


def test_manager_passes_index_to_recorders(env):
  db, rec_dir, idx = env
  mgr = RecordingManager([_camera(), _camera(enabled=False)], recordings_dir=rec_dir, index=idx)
  assert list(mgr.recorders.keys()) == ['front_door']
  assert mgr.recorders['front_door'].index is idx

"""
Retention tests for CameraRecorder — mock disk usage + temp MP4 files.
No ffmpeg or real camera needed (Task 2.2 verification matrix).
"""

import os
import time

import pytest

from src.models import CameraConfig
from src.recording.recorder import CameraRecorder


def _mkseg(path, age_days: float = 0.0, size_mb: float = 1.0) -> None:
  path.write_bytes(b'x' * int(size_mb * 1024 * 1024))
  old = time.time() - age_days * 86400
  os.utime(path, (old, old))


def _camera(**record_overrides) -> CameraConfig:
  record = {'enabled': True, 'retain_days': 30}
  record.update(record_overrides)
  return CameraConfig(
    id='front_door',
    name='Front Door',
    type='rtsp',
    rtsp_url='rtsp://x',
    record=record,
  )


PLENTY = (100 << 30, 50 << 30, 500 << 30)  # free = 500 GB
LOW = (100 << 30, 98 << 30, 2 << 30)  # free = 2 GB


@pytest.fixture
def disk_usage(monkeypatch):
  """Control reported disk space; tests set the tuple via holder.value."""
  holder = {'value': PLENTY}
  monkeypatch.setattr(
    'src.recording.recorder.shutil.disk_usage', lambda _p: holder['value']
  )
  return holder


def test_files_kept_when_disk_has_space(tmp_path, disk_usage):
  disk_usage['value'] = PLENTY
  rec = CameraRecorder(
    _camera(delete_only_if_disk_full=True, min_disk_free_gb=10.0),
    recordings_dir=tmp_path,
  )
  _mkseg(rec.output_dir / 'old.mp4', age_days=60)  # well past retain_days
  _mkseg(rec.output_dir / 'new.mp4', age_days=1)

  rec.cleanup_old_segments()

  assert (rec.output_dir / 'old.mp4').exists()  # preserved — space available
  assert (rec.output_dir / 'new.mp4').exists()


def test_oldest_purged_first_when_disk_low(tmp_path, disk_usage):
  disk_usage['value'] = LOW
  # Cap of 2.5 GB with 3 GB of segments → purge oldest until under cap (3.0 → 2.0)
  rec = CameraRecorder(
    _camera(
      delete_only_if_disk_full=True,
      min_disk_free_gb=10.0,
      max_disk_usage_gb=2.5,
    ),
    recordings_dir=tmp_path,
  )
  _mkseg(rec.output_dir / 'a_oldest.mp4', age_days=10, size_mb=1024)
  _mkseg(rec.output_dir / 'b_middle.mp4', age_days=5, size_mb=1024)
  _mkseg(rec.output_dir / 'c_newest.mp4', age_days=1, size_mb=1024)

  rec.cleanup_old_segments()

  assert not (rec.output_dir / 'a_oldest.mp4').exists()  # oldest purged
  assert (rec.output_dir / 'b_middle.mp4').exists()  # camera now under cap —
  assert (
    rec.output_dir / 'c_newest.mp4'
  ).exists()  # volume pressure stops here


def test_purge_respects_free_space_threshold(tmp_path, disk_usage):
  # Simulate free space growing as files are deleted: start at 5 GB free
  # (below 10 GB threshold). Deleting one 8 GB file restores 13 GB → stop.
  calls = {'n': 0}

  def fake_usage(_p):
    free = (5 + 8 * calls['n']) << 30
    return (100 << 30, (100 - free // (1 << 30)) << 30, free)

  import src.recording.recorder as mod

  orig = mod.shutil.disk_usage
  mod.shutil.disk_usage = fake_usage
  try:
    rec = CameraRecorder(
      _camera(delete_only_if_disk_full=True, min_disk_free_gb=10.0),
      recordings_dir=tmp_path,
    )
    _mkseg(rec.output_dir / 'a.mp4', age_days=10, size_mb=8192)
    _mkseg(rec.output_dir / 'b.mp4', age_days=5, size_mb=8192)
    rec.cleanup_old_segments()
  finally:
    mod.shutil.disk_usage = orig

  assert not (rec.output_dir / 'a.mp4').exists()  # deleted, freed 8 GB
  assert (rec.output_dir / 'b.mp4').exists()  # 13 GB free ≥ 10 GB → kept


def test_strict_mode_deletes_by_age(tmp_path, disk_usage):
  disk_usage['value'] = PLENTY  # ample space must NOT matter in strict mode
  rec = CameraRecorder(
    _camera(delete_only_if_disk_full=False, retain_days=30),
    recordings_dir=tmp_path,
  )
  _mkseg(rec.output_dir / 'old.mp4', age_days=40)
  _mkseg(rec.output_dir / 'new.mp4', age_days=10)

  rec.cleanup_old_segments()

  assert not (rec.output_dir / 'old.mp4').exists()
  assert (rec.output_dir / 'new.mp4').exists()


def test_source_url_override(tmp_path):
  cam = _camera(source_url='data/test_clip.mp4')
  rec = CameraRecorder(cam, recordings_dir=tmp_path)
  assert rec.source_url == 'data/test_clip.mp4'

  cam2 = _camera()  # no override → go2rtc proxy
  rec2 = CameraRecorder(cam2, recordings_dir=tmp_path)
  assert rec2.source_url == 'rtsp://localhost:8554/front_door'


def test_ffmpeg_cmd_shape(tmp_path):
  rec = CameraRecorder(_camera(segment_seconds=900), recordings_dir=tmp_path)
  cmd = rec._build_ffmpeg_cmd()
  assert cmd[0] == 'ffmpeg'
  assert '-vcodec' in cmd and cmd[cmd.index('-vcodec') + 1] == 'copy'
  assert cmd[cmd.index('-segment_time') + 1] == '900'
  assert cmd[cmd.index('-i') + 1] == rec.source_url
  assert '%Y%m%d_%H%M%S.mp4' in cmd[-1]


def test_manager_skips_disabled_cameras(tmp_path):
  from src.recording.recorder import RecordingManager

  cams = [
    _camera(),
    CameraConfig(
      id='mac', name='Mac', type='macbook', record={'enabled': False}
    ),
  ]
  mgr = RecordingManager(cams, recordings_dir=tmp_path)
  assert list(mgr.recorders.keys()) == ['front_door']


def test_start_without_ffmpeg_is_graceful(tmp_path, monkeypatch):
  import src.recording.recorder as mod

  monkeypatch.setattr(mod, '_check_ffmpeg_available', lambda: False)
  rec = CameraRecorder(_camera(), recordings_dir=tmp_path)
  rec.start()  # must not raise, must not start a thread
  assert rec.is_running is False
  assert rec._monitor_thread is None

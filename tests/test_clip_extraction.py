"""Tests for clip extraction (Task B7.2) — REAL ffmpeg (now installed)."""

from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi import HTTPException

import src.api.state as state
from src.api.routers.recordings import camera_clip
from src.events.database import EventDatabase
from src.recording.clips import extract_clip
from src.recording.clips import ffmpeg_available
from src.recording.clips import resolve_clip_range
from src.recording.index import RecordingIndex


@pytest.fixture
def env(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  rec_dir = tmp_path / 'recordings'
  rec_dir.mkdir()
  idx = RecordingIndex(db._conn, db._lock, rec_dir)  # noqa: SLF001 — shared by design
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr(state, 'recording_index', idx)
  monkeypatch.setattr('src.api.routers.recordings.verify_token_param', lambda _t: None)
  monkeypatch.setattr('src.api.routers.recordings.extract_token', lambda r, t: 'tok')
  monkeypatch.setattr('src.recording.clips.CLIP_CACHE_DIR', tmp_path / 'clips')
  yield db, rec_dir, idx, tmp_path
  db.close()


def _write_numbered_video(path: Path, seconds=6, fps=10):
  path.parent.mkdir(parents=True, exist_ok=True)
  w, h = 320, 240
  writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
  for i in range(seconds * fps):
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    cv2.putText(frame, str(i // fps), (40, 140), cv2.FONT_HERSHEY_SIMPLEX, 4, (255, 255, 255), 6)
    writer.write(frame)
  writer.release()
  return path


@pytest.mark.skipif(not ffmpeg_available(), reason='ffmpeg not installed')
def test_extract_clip_cuts_the_right_range(env):
  _, _, _, tmp = env
  video = _write_numbered_video(tmp / '20260920_100000.mp4')

  clip = extract_clip(video, 2.0, 4.0)
  assert clip is not None and clip.exists()

  # Stream copy seeks to the nearest keyframe ≤ the cut point, so verify
  # the CLIP itself rather than exact frame content: playable, non-black,
  # and roughly the requested duration (~2s).
  cap = cv2.VideoCapture(str(clip))
  assert cap.isOpened()
  fps = cap.get(cv2.CAP_PROP_FPS) or 10.0
  n_frames = cap.get(cv2.CAP_PROP_FRAME_COUNT)
  ret, frame = cap.read()
  cap.release()
  assert ret
  assert frame.max() > 200  # the digit is present (not black)
  duration = n_frames / fps
  assert 1.0 <= duration <= 3.5, f'clip duration {duration:.2f}s out of range'


def test_extract_clip_cached(env):
  _, _, _, tmp = env
  video = _write_numbered_video(tmp / '20260920_100000.mp4')
  first = extract_clip(video, 1.0, 2.0)
  second = extract_clip(video, 1.0, 2.0)
  assert first == second  # cache hit — same path


def test_resolve_clip_range_padding_and_clamp(env):
  _, rec_dir, idx, tmp = env
  start = datetime(2026, 9, 20, 10, 0, tzinfo=UTC)
  seg = _write_numbered_video(rec_dir / 'cam' / '20260920_100000.mp4')
  idx.index_segment('cam', seg, start, start + timedelta(minutes=15))

  # Event 10:07:00-10:07:10 with 5s padding → offsets 415..435
  out = resolve_clip_range('cam', start.timestamp() + 420, start.timestamp() + 430, 5.0, idx)
  assert out is not None
  seg_path, clip_start, clip_end = out
  assert seg_path == seg
  assert clip_start == 415.0
  assert clip_end == 435.0

  # Padding before segment start clamps to 0
  out2 = resolve_clip_range('cam', start.timestamp() + 2, start.timestamp() + 4, 10.0, idx)
  assert out2 is not None and out2[1] == 0.0

  # Nothing covering → None
  assert resolve_clip_range('cam', start.timestamp() + 99999, start.timestamp() + 100000, 5.0, idx) is None


def test_endpoint_serves_real_clip(env):
  _, rec_dir, idx, tmp = env
  start = datetime(2026, 9, 20, 10, 0, tzinfo=UTC)
  seg = _write_numbered_video(rec_dir / 'cam' / '20260920_100000.mp4')
  idx.index_segment('cam', seg, start, start + timedelta(minutes=15))

  resp = camera_clip(
    'cam',
    start=start.timestamp() + 2,
    end=start.timestamp() + 3,
    padding=0.0,
    request=None,
    token='tok',
  )
  assert resp.media_type == 'video/mp4'
  assert Path(resp.path).exists()


def test_endpoint_404_when_uncovered(env):
  with pytest.raises(HTTPException) as exc:
    camera_clip('cam', start=1758000000.0, end=1758000060.0, padding=5.0, request=None, token='tok')
  assert exc.value.status_code == 404


def test_endpoint_503_without_ffmpeg(env, monkeypatch):
  import src.api.routers.recordings as mod

  monkeypatch.setattr(mod, 'ffmpeg_available', lambda: False)
  with pytest.raises(HTTPException) as exc:
    camera_clip('cam', start=1.0, end=2.0, padding=5.0, request=None, token='tok')
  assert exc.value.status_code == 503

"""Tests for playback primitives (Tasks B3.1/B3.2): event→segment, frame-at-time."""

from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

import cv2
import numpy as np
import pytest

import src.api.state as state
from src.api.routers.events import _attach_playback
from src.api.routers.recordings import frame_at_time
from src.events.database import EventDatabase
from src.events.models import DetectionEvent
from src.recording.frames import extract_frame
from src.recording.index import RecordingIndex


@pytest.fixture
def env(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  rec_dir = tmp_path / 'recordings'
  rec_dir.mkdir()
  idx = RecordingIndex(db._conn, db._lock, rec_dir)  # noqa: SLF001 — shared by design
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr(state, 'recording_index', idx)
  monkeypatch.setattr('src.config.THUMBNAILS_DIR', tmp_path / 'thumbs')
  monkeypatch.setattr('src.recording.frames.FRAME_CACHE_DIR', tmp_path / 'thumbs' / 'frames')
  monkeypatch.setattr('src.api.routers.recordings.verify_token_param', lambda _t: None)
  yield db, rec_dir, idx, tmp_path
  db.close()


def _write_numbered_video(path: Path, seconds=4, fps=10):
  """Synthetic mp4 whose frame at time t shows the digit of the second."""
  path.parent.mkdir(parents=True, exist_ok=True)
  w, h = 320, 240
  writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
  for i in range(seconds * fps):
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    cv2.putText(frame, str(i // fps), (40, 140), cv2.FONT_HERSHEY_SIMPLEX, 4, (255, 255, 255), 6)
    writer.write(frame)
  writer.release()
  return path


# ── B3.1: event → playable segment ────────────────────────────


def test_attach_playback_links_event_to_segment(env):
  db, rec_dir, idx, _ = env
  start = datetime(2026, 9, 19, 10, 0, tzinfo=UTC)
  idx.index_segment('cam', Path('/x/20260919_100000.mp4'), start, start + timedelta(minutes=15))

  events = [
    {'camera_id': 'cam', 'timestamp': (start + timedelta(minutes=7, seconds=3)).isoformat()},
  ]
  out = _attach_playback(events)
  assert out[0]['playback'] == {
    'file': '20260919_100000.mp4',
    'url': '/recordings/cam/20260919_100000.mp4',
    'start_offset': 423.0,
  }


def test_attach_playback_none_when_uncovered(env):
  db, rec_dir, idx, _ = env
  events = [
    {'camera_id': 'cam', 'timestamp': '2026-09-19T23:00:00+00:00'},  # no segments at all
    {'camera_id': 'cam', 'timestamp': 'garbage'},  # unparseable ts
  ]
  out = _attach_playback(events)
  assert out[0]['playback'] is None and out[1]['playback'] is None


def test_events_endpoint_includes_playback(env):
  """Through the actual router function, seeded end-to-end."""
  from src.api.routers.events import list_events

  db, rec_dir, idx, _ = env
  start = datetime(2026, 9, 19, 10, 0, tzinfo=UTC)
  idx.index_segment('cam', Path('/x/20260919_100000.mp4'), start, start + timedelta(minutes=15))
  db.insert(
    DetectionEvent(
      camera_id='cam', event_type='unknown_face', timestamp=start + timedelta(minutes=2)
    )
  )

  out = list_events(
    camera_id='cam', limit=10
  )  # limit passed explicitly: Query default breaks direct calls
  assert out['total'] == 1
  assert out['events'][0]['playback']['start_offset'] == 120.0


# ── B3.2: frame at time ────────────────────────────────────────


def test_extract_frame_seeks_accurately(env):
  _, _, _, tmp = env
  video = _write_numbered_video(tmp / '20260919_100000.mp4', seconds=4)

  f0 = extract_frame(video, 0.0)
  f2 = extract_frame(video, 2.0)
  assert f0 is not None and f2 is not None
  # Frame at t=2 differs from t=0 (shows "2" vs "0")
  assert np.abs(f0.astype(int) - f2.astype(int)).mean() > 5


def test_frame_endpoint_caches_and_serves(env):
  _, rec_dir, idx, tmp = env
  video = _write_numbered_video(rec_dir / 'cam' / '20260919_100000.mp4', seconds=4)
  start = datetime(2026, 9, 19, 10, 0, tzinfo=UTC)
  idx.index_segment('cam', video, start, start + timedelta(minutes=15))

  ts = (start + timedelta(seconds=2)).timestamp()
  resp1 = frame_at_time('cam', ts=ts, token='tok')  # token bypassed via state? no — verify below
  cache_dir = tmp / 'thumbs' / 'frames'
  assert resp1 is not None  # FileResponse built
  assert len(list(cache_dir.glob('*.jpg'))) == 1  # written + cached

  # Second call is a cache hit (no new files)
  frame_at_time('cam', ts=ts, token='tok')
  assert len(list(cache_dir.glob('*.jpg'))) == 1


def test_frame_endpoint_no_covering_segment(env):
  from fastapi import HTTPException

  with pytest.raises(HTTPException) as exc:
    frame_at_time('cam', ts=1758267600.0, token='tok')
  assert exc.value.status_code == 404

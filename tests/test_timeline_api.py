"""Tests for the timeline + summary APIs (Tasks B2.1/B2.2). No ffmpeg, no server."""

from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

import pytest

import src.api.state as state
from src.api.routers.recordings import camera_timeline
from src.api.routers.recordings import recordings_summary
from src.events.database import EventDatabase
from src.events.models import DetectionEvent
from src.recording.index import RecordingIndex


@pytest.fixture
def env(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  rec_dir = tmp_path / 'recordings'
  rec_dir.mkdir()
  idx = RecordingIndex(db._conn, db._lock, rec_dir)  # noqa: SLF001 — shared by design
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr(state, 'recording_index', idx)
  yield db, rec_dir, idx
  db.close()


def _seed_day(db, rec_dir, idx):
  """Two segments (10:00–10:15, 10:15–10:30) + events across two hours."""
  import os

  files = []
  for name in ('20260919_100000.mp4', '20260919_101500.mp4'):
    path = rec_dir / 'front_door' / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b'x' * 2048)
    files.append(path)
  # The newest segment's end comes from its mtime — pin it to start+15min
  # so the simulated recording is "finished", not still-writing.
  done = datetime(2026, 9, 19, 10, 30, tzinfo=UTC).timestamp()
  os.utime(files[-1], (done, done))
  idx.scan_directory()

  base = datetime(2026, 9, 19, tzinfo=UTC)
  db.insert(
    DetectionEvent(
      camera_id='front_door', event_type='unknown_face', timestamp=base.replace(hour=10, minute=2)
    )
  )
  db.insert(
    DetectionEvent(
      camera_id='front_door', event_type='unknown_face', timestamp=base.replace(hour=10, minute=9)
    )
  )
  db.insert(
    DetectionEvent(
      camera_id='front_door',
      event_type='known_face',
      person_name='joynal',
      timestamp=base.replace(hour=11, minute=30),
    )
  )
  db.insert(
    DetectionEvent(
      camera_id='front_door', event_type='loitering', timestamp=base.replace(hour=11, minute=45)
    )
  )
  # Other camera's events must not leak in
  db.insert(
    DetectionEvent(
      camera_id='backyard', event_type='unknown_face', timestamp=base.replace(hour=10, minute=5)
    )
  )


def test_timeline_buckets_and_segments(env):
  db, rec_dir, idx = env
  _seed_day(db, rec_dir, idx)

  out = camera_timeline('front_door', date='2026-09-19')

  assert out['date'] == '2026-09-19'
  assert len(out['hours']) == 24
  h10 = out['hours'][10]
  assert h10['segment_minutes'] == 30.0  # 10:00–10:30 recorded
  assert h10['events'] == 2 and h10['unknowns'] == 2
  h11 = out['hours'][11]
  assert h11['segment_minutes'] == 0.0  # no segments that hour
  assert h11['events'] == 2 and h11['unknowns'] == 0
  assert out['hours'][0]['events'] == 0  # quiet hours zeroed

  assert len(out['segments']) == 2
  assert out['segments'][0]['file'].endswith('20260919_100000.mp4')


def test_timeline_empty_day(env):
  db, rec_dir, idx = env
  out = camera_timeline('front_door', date='2026-01-01')
  assert all(h['events'] == 0 and h['segment_minutes'] == 0 for h in out['hours'])
  assert out['segments'] == []


def test_timeline_rejects_bad_date(env):
  from fastapi import HTTPException

  for bad in ('2026-9-19', 'not-a-date', '20260919'):
    with pytest.raises(HTTPException) as exc:
      camera_timeline('front_door', date=bad)
    assert exc.value.status_code == 422


def test_timeline_crossing_segment_clips_to_hour(env):
  """A segment spanning 10:45–11:15 contributes to BOTH hours."""
  db, rec_dir, idx = env
  start = datetime(2026, 9, 19, 10, 45, tzinfo=UTC)
  idx.index_segment('front_door', Path('/tmp/x.mp4'), start, start + timedelta(minutes=30))

  out = camera_timeline('front_door', date='2026-09-19')
  assert out['hours'][10]['segment_minutes'] == 15.0
  assert out['hours'][11]['segment_minutes'] == 15.0


def test_summary_lists_days(env):
  db, rec_dir, idx = env
  _seed_day(db, rec_dir, idx)
  out = recordings_summary()
  assert out == {'days': ['2026-09-19']}


def test_summary_empty(env):
  assert recordings_summary() == {'days': []}

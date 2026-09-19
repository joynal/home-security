"""Tests for the recordings index (Task B1.1) — temp dirs, fake segments, no ffmpeg."""

import os
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from src.events.database import EventDatabase
from src.recording.index import RecordingIndex, parse_segment_start


@pytest.fixture
def index(tmp_path):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  rec_dir = tmp_path / 'recordings'
  rec_dir.mkdir()
  idx = RecordingIndex(db._conn, db._lock, rec_dir)  # noqa: SLF001 — shared conn by design
  yield idx, rec_dir
  db.close()


def _mkseg(cam_dir, name, age_days=0.0):
  path = cam_dir / name
  path.write_bytes(b'x' * 1024)
  old = time.time() - age_days * 86400
  os.utime(path, (old, old))
  return path


def test_parse_segment_start():
  assert parse_segment_start(Path('20260919_101500.mp4')) == datetime(
    2026, 9, 19, 10, 15, 0, tzinfo=UTC
  )
  assert parse_segment_start(Path('clip.mp4')) is None
  assert parse_segment_start(Path('20261319_101500.mp4')) is None  # month 13


def test_scan_directory_derives_times_from_filenames(index):
  idx, rec_dir = index
  cam = rec_dir / 'front_door'
  cam.mkdir()
  _mkseg(cam, '20260919_100000.mp4')
  _mkseg(cam, '20260919_101500.mp4')
  _mkseg(cam, '20260919_103000.mp4')

  n = idx.scan_directory(camera_id='front_door')
  assert n == 3

  segs = idx.segments_between(
    'front_door', datetime(2026, 9, 19, tzinfo=UTC), datetime(2026, 9, 20, tzinfo=UTC)
  )
  assert len(segs) == 3
  # First two end at the next segment's start (clock-aligned 15-min grid)
  assert segs[0]['start_time'] == '2026-09-19T10:00:00+00:00'
  assert segs[0]['end_time'] == '2026-09-19T10:15:00+00:00'
  assert segs[1]['end_time'] == '2026-09-19T10:30:00+00:00'
  # Newest segment ends at its mtime (> start)
  assert segs[2]['end_time'] > segs[2]['start_time']


def test_scan_skips_non_matching_files(index):
  idx, rec_dir = index
  cam = rec_dir / 'cam'
  cam.mkdir()
  _mkseg(cam, '20260919_100000.mp4')
  _mkseg(cam, 'notes.txt')
  _mkseg(cam, 'tmp.mp4.part')
  assert idx.scan_directory() == 1


def test_scan_is_idempotent_and_size_aware(index):
  idx, rec_dir = index
  cam = rec_dir / 'cam'
  cam.mkdir()
  seg = _mkseg(cam, '20260919_100000.mp4')

  assert idx.scan_directory() == 1
  assert idx.scan_directory() == 0  # unchanged → no re-index

  seg.write_bytes(b'x' * 4096)  # size changed (e.g. re-recorded) → re-index
  os.utime(seg, None)
  assert idx.scan_directory() == 1


def test_segment_covering(index):
  idx, rec_dir = index
  cam = rec_dir / 'front_door'
  cam.mkdir()
  _mkseg(cam, '20260919_100000.mp4')
  _mkseg(cam, '20260919_101500.mp4')
  idx.scan_directory()

  hit = idx.segment_covering('front_door', datetime(2026, 9, 19, 10, 7, tzinfo=UTC))
  assert hit is not None
  assert hit['path'].endswith('20260919_100000.mp4')

  # Boundary: exactly at the second segment's start
  hit2 = idx.segment_covering('front_door', datetime(2026, 9, 19, 10, 15, tzinfo=UTC))
  assert hit2['path'].endswith('20260919_101500.mp4')

  miss = idx.segment_covering('front_door', datetime(2026, 9, 19, 23, 0, tzinfo=UTC))
  assert miss is None


def test_segments_between_overlap_semantics(index):
  idx, rec_dir = index
  cam = rec_dir / 'cam'
  cam.mkdir()
  seg1 = _mkseg(cam, '20260919_100000.mp4')
  seg2 = _mkseg(cam, '20260919_101500.mp4')
  # Pin mtimes: the newest segment's end time derives from mtime, which must
  # be deterministic (not "whenever the test happens to run").
  t1 = datetime(2026, 9, 19, 10, 15, tzinfo=UTC).timestamp()
  t2 = datetime(2026, 9, 19, 10, 30, tzinfo=UTC).timestamp()
  os.utime(seg1, (t1, t1))
  os.utime(seg2, (t2, t2))
  idx.scan_directory()

  # Window that clips the tail of seg1 and head of seg2 → both overlap
  segs = idx.segments_between(
    'cam',
    datetime(2026, 9, 19, 10, 10, tzinfo=UTC),
    datetime(2026, 9, 19, 10, 20, tzinfo=UTC),
  )
  assert len(segs) == 2
  # Window entirely after → none
  assert idx.segments_between(
    'cam', datetime(2026, 9, 19, 12, 0, tzinfo=UTC), datetime(2026, 9, 19, 13, 0, tzinfo=UTC)
  ) == []


def test_days_with_recordings(index):
  idx, rec_dir = index
  cam = rec_dir / 'cam'
  cam.mkdir()
  _mkseg(cam, '20260918_220000.mp4')
  _mkseg(cam, '20260919_100000.mp4')
  _mkseg(cam, '20260919_233000.mp4')
  idx.scan_directory()

  assert idx.days_with_recordings() == ['2026-09-18', '2026-09-19']
  assert idx.days_with_recordings(['other_cam']) == []


def test_gap_between_segments_is_not_papered_over(index):
  """Missing segments (recorder downtime) leave a real gap — no synthetic rows."""
  idx, rec_dir = index
  cam = rec_dir / 'cam'
  cam.mkdir()
  _mkseg(cam, '20260919_100000.mp4')
  _mkseg(cam, '20260919_110000.mp4')  # one hour later — the 10:15/10:30/10:45 files are gone
  idx.scan_directory()

  segs = idx.segments_between(
    'cam', datetime(2026, 9, 19, tzinfo=UTC), datetime(2026, 9, 20, tzinfo=UTC)
  )
  assert len(segs) == 2
  # First segment still ends at 11:00 (next start) — duration overstated by the gap,
  # which is the documented trade-off: end comes from the next file's existence.
  assert segs[0]['end_time'] == '2026-09-19T11:00:00+00:00'


def test_index_segment_direct_and_delete(index):
  idx, _ = index
  start = datetime(2026, 9, 19, 8, 0, tzinfo=UTC)
  end = start + timedelta(minutes=15)
  idx.index_segment('cam', Path('/tmp/fake.mp4'), start, end)
  assert idx.segment_covering('cam', start + timedelta(minutes=7)) is not None
  # Re-index same path → replace, not duplicate
  idx.index_segment('cam', Path('/tmp/fake.mp4'), start, end)
  assert len(idx.segments_between('cam', start, end)) == 1
  assert idx.delete_for_camera('cam') == 1
  assert idx.days_with_recordings() == []

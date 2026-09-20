"""PersonTracker tests — synthetic supervision Detections, mocked clock."""

import numpy as np
import supervision as sv

from src.detection.tracker import PersonTracker


def _det(x: float, conf: float = 0.9) -> sv.Detections:
  return sv.Detections(
    xyxy=np.array([[x, 100.0, x + 80, 300.0]]),
    confidence=np.array([conf]),
    class_id=np.array([0]),
  )


def test_track_id_stable_while_moving():
  tracker = PersonTracker()
  ids = []
  for x in (100, 110, 120, 130):  # smooth motion → same track
    tracked = tracker.update(_det(x))
    assert len(tracked) == 1
    ids.append(int(tracked.tracker_id[0]))
  assert len(set(ids)) == 1, f'track ID jumped: {ids}'


def test_new_track_after_disappearance():
  tracker = PersonTracker()
  first = tracker.update(_det(100))
  id1 = int(first.tracker_id[0])
  # Target vanishes for many frames (lost_track_buffer=30)
  empty = sv.Detections.empty()
  for _ in range(60):
    tracker.update(empty)
  # ByteTrack needs a few consecutive detections to confirm a new track
  ids = []
  for x in (400, 410, 420):
    tracked = tracker.update(_det(x))
    if len(tracked):
      ids.append(int(tracked.tracker_id[0]))
  assert ids, 're-entrant person should be tracked again'
  assert all(i != id1 for i in ids), f're-entrant person should get a NEW track ID: {ids}'


def test_needs_recognition_for_new_track():
  tracker = PersonTracker()
  assert tracker.needs_recognition(42) is True  # never seen


def test_cache_prevents_recognition_within_cooldown():
  tracker = PersonTracker(recognition_cooldown=30.0)
  tracker.cache_identity(7, 'joynal', True)
  assert tracker.needs_recognition(7) is False  # just cached
  cached = tracker.get_cached_identity(7)
  assert cached['name'] == 'joynal' and cached['is_known'] is True


def test_cache_expires_after_cooldown():
  from unittest.mock import patch

  tracker = PersonTracker(recognition_cooldown=30.0)
  with patch('src.detection.tracker.time.time', return_value=1000.0):
    tracker.cache_identity(7, 'joynal', True)
  with patch('src.detection.tracker.time.time', return_value=1000.0 + 31.0):
    assert tracker.needs_recognition(7) is True


def test_cleanup_stale_tracks():
  from unittest.mock import patch

  tracker = PersonTracker(recognition_cooldown=30.0)
  with patch('src.detection.tracker.time.time', return_value=1000.0):
    tracker.cache_identity(1, 'a', True)
  with patch('src.detection.tracker.time.time', return_value=1100.0):
    tracker.cache_identity(2, 'b', False)  # fresh
    tracker.cleanup_stale_tracks()  # cutoff = 1100 - 90 = 1010 → evicts id 1
  assert 1 not in tracker.identity_cache
  assert 2 in tracker.identity_cache

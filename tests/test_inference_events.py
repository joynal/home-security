"""Integration tests for the inference-loop → event-DB wiring (no camera needed)."""

from pathlib import Path

import numpy as np

import src.api.state as state
from src.api.inference import _log_detection_event
from src.api.inference import _save_thumbnail
from src.events.database import EventDatabase
from src.events.models import DetectionEvent


def _frame() -> np.ndarray:
  frame = np.zeros((120, 160, 3), dtype=np.uint8)
  frame[40:80, 60:100] = 255  # white box so the crop differs from the whole frame
  return frame


def test_unknown_face_event_logged_with_thumbnail(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'events.db')
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr('src.api.inference.THUMBNAILS_DIR', tmp_path / 'thumbs')

  last_event_at: dict[str, float] = {}
  _log_detection_event('front_door', _frame(), last_event_at, 'unknown_face', track_id=3)

  events = db.query(camera_id='front_door', event_type='unknown_face')
  assert len(events) == 1
  assert events[0]['metadata'] == '{"track_id": 3}'
  thumb = Path(events[0]['thumbnail_path'])
  assert thumb.exists()
  assert thumb.read_bytes()[:2] == b'\xff\xd8'  # JPEG SOI


def test_thumbnail_cropped_to_bbox_with_padding(tmp_path, monkeypatch):
  monkeypatch.setattr('src.api.inference.THUMBNAILS_DIR', tmp_path / 'thumbs')
  frame = _frame()  # white box at y 40:80, x 60:100

  path = Path(_save_thumbnail('cam', frame, bbox=[60, 40, 40, 40]))  # +20px pad each side
  thumb = __import__('cv2').imread(str(path))
  h, w = thumb.shape[:2]
  # 40px box + 2*20 pad = 80, but clamped to frame edges stays 80 here
  assert (w, h) == (80, 80)


def test_event_cooldown_prevents_flood(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'events.db')
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr('src.api.inference.THUMBNAILS_DIR', tmp_path / 'thumbs')

  last_event_at: dict[str, float] = {}
  for _ in range(50):  # ~30fps ≈ 1.7s of continuous unknown presence
    _log_detection_event('front_door', _frame(), last_event_at, 'unknown_face')

  assert db.count() == 1  # throttled to one event per cooldown window


def test_loitering_key_independent_of_unknown_key(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'events.db')
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr('src.api.inference.THUMBNAILS_DIR', tmp_path / 'thumbs')

  last_event_at: dict[str, float] = {}
  _log_detection_event('front_door', _frame(), last_event_at, 'unknown_face')
  # Loitering has its own throttle key — must not be suppressed
  _log_detection_event(
    'front_door',
    _frame(),
    last_event_at,
    'loitering',
    track_id=9,
    throttle_key='loitering:front_door:9',
    cooldown=0.0,
  )
  assert db.count(event_type='unknown_face') == 1
  assert db.count(event_type='loitering') == 1


def test_no_db_is_noop(monkeypatch):
  monkeypatch.setattr(state, 'event_db', None)
  _log_detection_event('front_door', _frame(), {}, 'unknown_face')
  # No exception, nothing to assert beyond reaching this point


def test_event_model_defaults():
  e = DetectionEvent(camera_id='c', event_type='motion')
  assert e.person_name is None
  assert e.confidence == 0.0
  assert e.timestamp.tzinfo is not None  # timezone-aware UTC default


def test_known_face_event_logged_per_person(tmp_path, monkeypatch):
  """Known sightings: person_name stored, per-person throttle keys independent."""
  db = EventDatabase(db_path=tmp_path / 'events.db')
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr('src.api.inference.THUMBNAILS_DIR', tmp_path / 'thumbs')

  last_event_at: dict[str, float] = {}
  frame = _frame()
  for _ in range(50):  # would flood without throttling
    _log_detection_event(
      'front_door',
      frame,
      last_event_at,
      'known_face',
      track_id=1,
      bbox=[10, 10, 50, 50],
      throttle_key='known:front_door:joynal',
      person_name='joynal',
    )
  assert db.count(event_type='known_face', person_name='joynal') == 1

  # A different person the same minute is NOT suppressed
  _log_detection_event(
    'front_door',
    frame,
    last_event_at,
    'known_face',
    track_id=2,
    throttle_key='known:front_door:alice',
    person_name='alice',
  )
  assert db.count(event_type='known_face', person_name='alice') == 1

  rows = db.query(event_type='known_face')
  assert {r['person_name'] for r in rows} == {'joynal', 'alice'}
  assert all(r['thumbnail_path'] for r in rows)


def test_person_name_filter(tmp_path):
  db = EventDatabase(db_path=tmp_path / 'e.db')
  db.insert(DetectionEvent(camera_id='c', event_type='known_face', person_name='joynal'))
  db.insert(DetectionEvent(camera_id='c', event_type='known_face', person_name='alice'))
  db.insert(DetectionEvent(camera_id='c', event_type='unknown_face'))
  assert db.count(person_name='joynal') == 1
  assert db.count(event_type='known_face', person_name='alice') == 1
  assert db.query(person_name='joynal')[0]['person_name'] == 'joynal'


# ── Task R12: auto-enrichment per-track throttle ──────────────────────────


def test_enrich_due_throttles_per_track(monkeypatch):
  """_enrich_due returns True once per window per (camera, track) — the guard
  sits BEFORE the person-store SQLite calls on the hot path."""
  from src.api import inference

  inference._last_enrich_attempt.clear()

  clock = {'now': 1000.0}
  monkeypatch.setattr(inference.time, 'monotonic', lambda: clock['now'])

  assert inference._enrich_due('cam1', 7) is True  # first sighting
  assert inference._enrich_due('cam1', 7) is False  # same track, same window
  assert inference._enrich_due('cam1', 8) is True  # other track → own window
  assert inference._enrich_due('cam2', 7) is True  # other camera → own window

  clock['now'] += 61.0
  assert inference._enrich_due('cam1', 7) is True  # window elapsed → due again

  inference._last_enrich_attempt.clear()


def test_enrich_throttle_skips_store_calls_between_windows(monkeypatch):
  """The enrich branch short-circuits: with the track not due, compute_pose and
  the person-store are never touched."""
  from src.api import inference
  from src.api import state

  inference._last_enrich_attempt.clear()

  class Boom:
    def __getattr__(self, name):
      raise AssertionError(f'person_store.{name} called while throttled')

  monkeypatch.setattr(state, 'person_store', Boom())
  monkeypatch.setattr(state, 'auto_enrichment_enabled', True)
  called = []
  monkeypatch.setattr(
    inference, 'compute_pose', lambda *a, **k: called.append(1) or {'pose': 'center'}
  )

  det = {'similarity': 0.9, 'landmarks': [[1, 2]] * 5, 'bbox': [0, 0, 200, 200], 'track_id': 3}

  clock = {'now': 100_000.0}
  monkeypatch.setattr(inference.time, 'monotonic', lambda: clock['now'])

  def run_branch():
    # mirrors the loop's enrich condition incl. the throttle guard
    if (
      getattr(state, 'auto_enrichment_enabled', True)
      and det['similarity'] >= 0.62
      and det.get('landmarks') is not None
      and state.person_store is not None
      and inference._enrich_due('cam1', det['track_id'])
    ):
      return inference.compute_pose(det['landmarks'], det['bbox'])
    return None

  assert run_branch() is not None  # first attempt evaluates pose
  clock['now'] += 1.0
  assert run_branch() is None  # throttled: no pose, no store
  assert called == [1]

  inference._last_enrich_attempt.clear()

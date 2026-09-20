"""Tests for the person store + management endpoints (Task B6.2)."""

import cv2
import numpy as np
import pytest

import src.api.state as state
from src.events.database import EventDatabase
from src.events.models import DetectionEvent
from src.persons.store import PersonStore


@pytest.fixture
def env(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  faces_dir = tmp_path / 'known_faces'
  faces_dir.mkdir()
  store = PersonStore(db._conn, db._lock, faces_dir)  # noqa: SLF001 — shared by design
  monkeypatch.setattr(state, 'event_db', db)
  monkeypatch.setattr(state, 'person_store', store)
  monkeypatch.setattr('src.api.routers.faces.faces_dir', faces_dir)
  yield db, faces_dir, store
  db.close()


def _person_dir(faces_dir, name, files=('a.jpg', 'b.jpg')):
  d = faces_dir / name
  d.mkdir(parents=True, exist_ok=True)
  for f in files:
    (d / f).write_bytes(b'jpg')
  return d


def test_backfill_from_directory(env):
  db, faces_dir, store = env
  _person_dir(faces_dir, 'joynal')
  _person_dir(faces_dir, 'alice', files=('x.png',))
  (faces_dir / '.DS_Store').write_text('')

  added = store.backfill_from_directory()
  assert added == 3  # 2 + 1 image rows

  people = {p['name']: p for p in store.list_persons()}
  assert set(people) == {'joynal', 'alice'}
  assert people['joynal']['image_count'] == 2
  assert people['alice']['image_count'] == 1

  # Idempotent
  assert store.backfill_from_directory() == 0


def test_events_get_person_id_links_and_rename_survives(env):
  db, faces_dir, store = env
  _person_dir(faces_dir, 'joynal')
  store.backfill_from_directory()
  person = store.get_person(name='joynal')

  # Event logged with the name (as inference does)
  db.insert(
    DetectionEvent(
      camera_id='cam', event_type='known_face', person_name='joynal', person_id=person['id']
    )
  )
  # An older event with a name but no link (pre-migration)
  db.insert(DetectionEvent(camera_id='cam', event_type='known_face', person_name='joynal'))
  assert store.backfill_event_links() == 1

  # Rename via the store
  store.rename_person(person['id'], 'joynal_ahmed')

  rows = db.query(person_name='joynal_ahmed')
  assert len(rows) == 2  # display names updated, ids intact
  assert all(r['person_id'] == person['id'] for r in rows)
  # Stable id: a fresh lookup under the new name resolves to the same person
  assert store.get_person(name='joynal_ahmed')['id'] == person['id']


def test_rename_person_images_paths_rewritten(env):
  db, faces_dir, store = env
  _person_dir(faces_dir, 'joynal')
  store.backfill_from_directory()
  pid = store.get_person(name='joynal')['id']
  store.rename_person(pid, 'joynal_ahmed')
  paths = [i['path'] for i in store.images_for(pid)]
  assert all('joynal_ahmed' in p for p in paths)


def test_rename_endpoint_moves_everything(env, monkeypatch):
  from src.api.routers import faces as faces_router

  db, faces_dir, store = env
  _person_dir(faces_dir, 'joynal')
  store.backfill_from_directory()
  pid = store.get_person(name='joynal')['id']
  db.insert(
    DetectionEvent(camera_id='cam', event_type='known_face', person_name='joynal', person_id=pid)
  )

  class FakeRecognizer:
    def rename_person(self, old, new):
      self.called = (old, new)

  fake = FakeRecognizer()
  monkeypatch.setattr(state, 'recognizer', fake)

  out = faces_router.rename_face('joynal', faces_router.RenameBody(new_name='joynal_ahmed'))
  assert out['name'] == 'joynal_ahmed'
  assert (faces_dir / 'joynal_ahmed' / 'a.jpg').exists()
  assert not (faces_dir / 'joynal').exists()
  assert fake.called == ('joynal', 'joynal_ahmed')
  assert db.count(person_name='joynal_ahmed') == 1


def test_rename_conflict_409(env):
  from fastapi import HTTPException

  from src.api.routers import faces as faces_router

  db, faces_dir, store = env
  _person_dir(faces_dir, 'joynal')
  _person_dir(faces_dir, 'alice')
  store.backfill_from_directory()

  with pytest.raises(HTTPException) as exc:
    faces_router.rename_face('joynal', faces_router.RenameBody(new_name='alice'))
  assert exc.value.status_code == 409


def test_add_from_event_enrolls_and_saves_crop(env, monkeypatch):
  from src.api.routers import faces as faces_router

  db, faces_dir, store = env

  # A 200x240 textured "face" thumbnail on disk
  rng = np.random.default_rng(1)
  thumb = np.clip(rng.normal(128, 10, (240, 200, 3)), 0, 255).astype(np.uint8)
  thumb_path = faces_dir.parent / 'thumbs' / 'ev1.jpg'
  thumb_path.parent.mkdir(parents=True, exist_ok=True)
  cv2.imwrite(str(thumb_path), thumb)
  eid = db.insert(
    DetectionEvent(camera_id='cam', event_type='unknown_face', thumbnail_path=str(thumb_path))
  )

  monkeypatch.setattr(
    'src.api.routers.faces.submit_job',
    lambda name, img, timeout=5.0: {'ok': True, 'bbox': [10, 10, 190, 230]},
  )

  out = faces_router.add_from_event('joynal', faces_router.AddFromEventBody(event_id=eid))
  assert out['status'] == 'enrolled'
  saved = list((faces_dir / 'joynal').glob('event_*.jpg'))
  assert len(saved) == 1
  imgs = store.images_for(store.get_person(name='joynal')['id'])
  assert imgs[0]['source'] == 'event'


def test_add_from_event_rejected_by_gates(env, monkeypatch):
  from src.api.routers import faces as faces_router

  db, faces_dir, store = env
  thumb_path = faces_dir.parent / 'thumbs' / 'ev2.jpg'
  thumb_path.parent.mkdir(parents=True, exist_ok=True)
  cv2.imwrite(str(thumb_path), np.full((240, 200, 3), 128, dtype=np.uint8))  # blurry
  eid = db.insert(
    DetectionEvent(camera_id='cam', event_type='unknown_face', thumbnail_path=str(thumb_path))
  )

  monkeypatch.setattr(
    'src.api.routers.faces.submit_job',
    lambda name, img, timeout=5.0: {'ok': False, 'reason': 'blurry'},
  )
  out = faces_router.add_from_event('joynal', faces_router.AddFromEventBody(event_id=eid))
  assert out['status'] == 'rejected'
  assert not (faces_dir / 'joynal').exists()


def test_known_event_logs_person_id(env, monkeypatch):
  """The inference helper attaches person_id when the store knows the person."""
  from src.api.inference import _log_detection_event

  db, faces_dir, store = env
  _person_dir(faces_dir, 'joynal')
  store.backfill_from_directory()

  monkeypatch.setattr('src.api.inference.THUMBNAILS_DIR', faces_dir.parent / 'thumbs')
  _log_detection_event(
    'cam',
    np.zeros((120, 160, 3), dtype=np.uint8),
    {},
    'known_face',
    throttle_key='known:cam:joynal',
    person_name='joynal',
  )
  row = db.query()[0]
  assert row['person_name'] == 'joynal'
  assert row['person_id'] == store.get_person(name='joynal')['id']

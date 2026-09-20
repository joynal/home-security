"""Tests for photo import (Task B12.1)."""

import asyncio
import io

import cv2
import numpy as np
import pytest
from fastapi import UploadFile
from PIL import Image

import src.api.state as state
from src.api.photo_import import crop_face
from src.api.photo_import import load_photo_for_enrollment
from src.api.photo_import import save_reference_crop
from src.events.database import EventDatabase
from src.persons.store import PersonStore


@pytest.fixture
def env(tmp_path, monkeypatch):
  db = EventDatabase(db_path=tmp_path / 'aegis.db')
  faces_dir = tmp_path / 'known_faces'
  faces_dir.mkdir()
  store = PersonStore(db._conn, db._lock, faces_dir)  # noqa: SLF001 — shared by design
  monkeypatch.setattr(state, 'person_store', store)
  monkeypatch.setattr('src.api.routers.faces.faces_dir', faces_dir)
  yield faces_dir, store
  db.close()


def _jpeg_bytes(arr: np.ndarray, exif=None) -> bytes:
  img = Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))
  buf = io.BytesIO()
  if exif is not None:
    exif = exif.tobytes() if hasattr(exif, 'tobytes') else exif
    img.save(buf, format='JPEG', exif=exif)
  else:
    img.save(buf, format='JPEG')
  return buf.getvalue()


def _exif_orientation(value: int):
  """Proper EXIF object with just the Orientation tag (PIL builds the TIFF)."""
  exif = Image.Exif()
  exif[274] = value  # 0x0112 Orientation
  return exif


# ── photo preprocessing ───────────────────────────────────────


def test_load_photo_applies_exif_orientation():
  # Asymmetric image: bright block top-left
  arr = np.zeros((200, 200, 3), dtype=np.uint8)
  arr[:50, :50] = 255
  raw = _jpeg_bytes(arr, exif=_exif_orientation(6))  # 6 = rotate 90° CW

  frame = load_photo_for_enrollment(raw)
  assert frame is not None
  gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
  # After transpose the bright block moves to the top-right
  assert gray[:40, -40:].mean() > 200
  assert gray[:40, :40].mean() < 20


def test_load_photo_downscales():
  arr = np.full((2000, 3000, 3), 128, dtype=np.uint8)
  frame = load_photo_for_enrollment(_jpeg_bytes(arr))
  assert max(frame.shape[:2]) <= 1280


def test_load_photo_corrupt_returns_none():
  assert load_photo_for_enrollment(b'not an image at all') is None


def test_saved_crops_have_no_exif(env):
  faces_dir, _ = env
  arr = np.full((300, 300, 3), 128, dtype=np.uint8)
  raw_with_exif = _jpeg_bytes(arr, exif=_exif_orientation(1))

  frame = load_photo_for_enrollment(raw_with_exif)
  path = save_reference_crop(faces_dir, 'joynal', crop_face(frame, [60, 40, 240, 260]))

  with Image.open(path) as img:
    assert img.getexif() == {}  # EXIF (incl. any GPS) stripped by re-encode


def test_crop_face_pads_and_clamps():
  frame = np.zeros((200, 400, 3), dtype=np.uint8)
  crop = crop_face(frame, [0, 0, 100, 100])  # face at the corner
  # Padded crop, clamped to frame edges (no negative indexing artifacts)
  assert crop.shape == (125, 125, 3)


# ── the endpoint ──────────────────────────────────────────────


def _upload(arr, filename='photo.jpg', exif=None):
  return UploadFile(file=io.BytesIO(_jpeg_bytes(arr, exif=exif)), filename=filename)


def test_import_endpoint_enrolls_good_photo(env, monkeypatch):
  from src.api.routers import faces as faces_router

  faces_dir, store = env
  rng = np.random.default_rng(3)
  photo = np.clip(rng.normal(128, 12, (480, 400, 3)), 0, 255).astype(np.uint8)

  monkeypatch.setattr(
    'src.api.routers.faces.submit_job',
    lambda name, img, timeout=5.0: {'ok': True, 'bbox': [100, 80, 300, 320]},
  )

  out = asyncio.run(
    faces_router.import_faces(name='dad', files=[_upload(photo, 'dad1.jpg')], _='user')
  )
  assert out['enrolled'] == 1 and out['total'] == 1
  saved = list((faces_dir / 'dad').glob('import_*.jpg'))
  assert len(saved) == 1
  imgs = store.images_for(store.get_person(name='dad')['id'])
  assert imgs[0]['source'] == 'photo_import'


def test_import_endpoint_mixed_batch(env, monkeypatch):
  """Good + no-face + unreadable in one batch → per-file verdicts."""
  from src.api.routers import faces as faces_router

  faces_dir, store = env
  good = np.clip(np.random.default_rng(4).normal(128, 12, (480, 400, 3)), 0, 255).astype(np.uint8)

  verdicts = iter(
    [
      {'ok': True, 'bbox': [100, 80, 300, 320]},
      {'ok': False, 'reason': 'no_face'},
    ]
  )
  monkeypatch.setattr(
    'src.api.routers.faces.submit_job', lambda name, img, timeout=5.0: next(verdicts)
  )

  bad_file = UploadFile(file=io.BytesIO(b'garbage'), filename='broken.jpg')
  out = asyncio.run(
    faces_router.import_faces(
      name='mom',
      files=[_upload(good, 'mom1.jpg'), _upload(good, 'mom2.jpg'), bad_file],
      _='user',
    )
  )
  assert out['total'] == 3 and out['enrolled'] == 1
  by_file = {r['file']: r['status'] for r in out['results']}
  assert by_file == {'mom1.jpg': 'enrolled', 'mom2.jpg': 'rejected', 'broken.jpg': 'unreadable'}
  assert by_file['mom2.jpg'] == 'rejected'
  reasons = {r['file']: r.get('reason') for r in out['results']}
  assert reasons['mom2.jpg'] == 'no_face'

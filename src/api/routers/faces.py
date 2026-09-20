"""
src/api/routers/faces.py
────────────────────────
Manage known faces:
  GET    /faces                 - List registered people (+ sightings via store)
  PATCH  /faces/{name}          - Rename a person (disk + DB + live model)
  POST   /faces/{name}/add      - Enroll from a detection event's thumbnail
  DELETE /faces/{name}          - Delete a person from disk and the live model
  GET    /faces/{name}/img      - Serve a thumbnail image for the UI
"""

import shutil
from datetime import UTC
from datetime import datetime
from pathlib import Path
from typing import Annotated

import cv2
from fastapi import APIRouter
from fastapi import Depends
from fastapi import File
from fastapi import Form
from fastapi import HTTPException
from fastapi import UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pydantic import Field

import src.api.state as state
from src.api.auth import get_current_user
from src.api.auth import verify_token_param
from src.api.enroll_jobs import submit_job
from src.api.photo_import import crop_face
from src.api.photo_import import load_photo_for_enrollment
from src.api.photo_import import save_reference_crop
from src.config import KNOWN_FACES_DIR

router = APIRouter(prefix='/faces')
faces_dir = Path(KNOWN_FACES_DIR)


class RenameBody(BaseModel):
  new_name: str = Field(min_length=1, max_length=64)


class AddFromEventBody(BaseModel):
  event_id: int


@router.get('')
def list_faces(_: str = Depends(get_current_user)):
  """Return a list of all registered people and how many face samples they have."""
  if not faces_dir.exists():
    return {'faces': []}

  # Sighting stats per person (last seen + count) from the events table
  sightings: dict[int, dict] = {}
  if state.event_db is not None and state.person_store is not None:
    for row in state.event_db.query_raw(
      """SELECT person_id, COUNT(*) AS n, MAX(timestamp) AS last_seen
         FROM events WHERE person_id IS NOT NULL GROUP BY person_id"""
    ):
      sightings[row['person_id']] = row

  by_name: dict[str, dict] = {}
  if state.person_store is not None:
    for p in state.person_store.list_persons():
      by_name[p['name']] = p

  results = []
  for entry in faces_dir.iterdir():
    if entry.is_dir() and not entry.name.startswith('.'):
      images = list(entry.glob('*.jpg')) + list(entry.glob('*.png'))
      if images:
        meta = by_name.get(entry.name, {})
        stats = sightings.get(meta.get('id'), {})
        results.append(
          {
            'name': entry.name,
            'id': meta.get('id'),
            'image_count': len(images),
            'images': [f.name for f in sorted(images)],
            'created_at': min(f.stat().st_ctime for f in images),
            'sightings': stats.get('n', 0),
            'last_seen': stats.get('last_seen'),
          }
        )

  # Sort descending by creation date (newest first)
  results.sort(key=lambda x: x['created_at'], reverse=True)
  return {'faces': results}


@router.patch('/{name}')
def rename_face(name: str, body: RenameBody, _: str = Depends(get_current_user)):
  """Rename a person everywhere: disk directory, DB (persons + events), live model."""
  if state.person_store is None:
    raise HTTPException(status_code=503, detail='Person store not initialized')
  person = state.person_store.get_person(name=name)
  if person is None:
    raise HTTPException(status_code=404, detail='Person not found')
  if body.new_name == name:
    return {'status': 'success', 'name': name}

  old_dir = faces_dir / name
  new_dir = faces_dir / body.new_name
  if new_dir.exists():
    raise HTTPException(status_code=409, detail=f"'{body.new_name}' already exists")

  # Disk first — store.rename rewrites person_images paths to the new location
  if old_dir.exists():
    try:
      shutil.move(str(old_dir), str(new_dir))
    except OSError as exc:
      raise HTTPException(status_code=500, detail=f'Rename failed: {exc}') from exc

  try:
    state.person_store.rename_person(person['id'], body.new_name)
  except Exception as exc:
    # Directory moved but DB failed — startup backfill reconciles the store
    raise HTTPException(status_code=500, detail=f'DB rename failed: {exc}') from exc

  if state.recognizer:
    state.recognizer.rename_person(name, body.new_name)

  return {'status': 'success', 'name': body.new_name}


@router.post('/{name}/add')
def add_from_event(name: str, body: AddFromEventBody, _: str = Depends(get_current_user)):
  """
  Enroll a person from a detection event's stored thumbnail (enroll-from-event).
  Runs through the inference-thread queue with quality gates; on success the
  crop is copied into the person's directory and embedded live.
  """
  if state.event_db is None:
    raise HTTPException(status_code=503, detail='Event system not initialized')
  event = state.event_db.get_by_id(body.event_id)
  if event is None or not event.get('thumbnail_path'):
    raise HTTPException(status_code=404, detail='Event or thumbnail not found')

  image = cv2.imread(event['thumbnail_path'])
  if image is None:
    raise HTTPException(status_code=422, detail='Thumbnail unreadable')

  verdict = submit_job(name, image, timeout=5.0)
  if not verdict.get('ok'):
    return {'status': 'rejected', 'verdict': verdict}

  # Persist the crop as a new reference image (plain JPEG — no EXIF by construction)
  person_dir = faces_dir / name
  person_dir.mkdir(parents=True, exist_ok=True)
  ts = datetime.now(UTC).strftime('%Y%m%d_%H%M%S_%f')
  crop_path = person_dir / f'event_{ts}.jpg'
  cv2.imwrite(str(crop_path), image, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

  if state.person_store is not None:
    person_id = state.person_store.get_or_create(name)
    state.person_store.add_image(person_id, crop_path, source='event')

  return {'status': 'enrolled', 'file': str(crop_path), 'verdict': verdict}


@router.post('/import')
async def import_faces(
  name: Annotated[str, Form()],
  files: Annotated[list[UploadFile], File()],
  _: str = Depends(get_current_user),
):
  """
  Enroll a person from existing photos (multipart: name + files[]).
  Per-file verdicts; successful files are saved as EXIF-free face crops and
  embedded live via the inference-thread queue.
  """
  if not files:
    raise HTTPException(status_code=422, detail='No files uploaded')

  results = []
  for upload in files[:20]:  # sane batch cap
    raw = await upload.read()
    frame = load_photo_for_enrollment(raw)
    if frame is None:
      results.append({'file': upload.filename, 'status': 'unreadable'})
      continue

    verdict = submit_job(name, frame, timeout=5.0)
    if not verdict.get('ok'):
      results.append(
        {'file': upload.filename, 'status': 'rejected', 'reason': verdict.get('reason', 'unknown')}
      )
      continue

    crop = crop_face(frame, verdict['bbox'])
    path = save_reference_crop(faces_dir, name, crop)
    if state.person_store is not None:
      person_id = state.person_store.get_or_create(name)
      state.person_store.add_image(person_id, path, source='photo_import')

    entry = {'file': upload.filename, 'status': 'enrolled', 'saved': path.name}
    if verdict.get('multiple_faces'):
      entry['note'] = 'multiple faces — used the largest'
    results.append(entry)

  enrolled = sum(1 for r in results if r['status'] == 'enrolled')
  return {'name': name, 'enrolled': enrolled, 'total': len(results), 'results': results}


@router.get('/{name}/img/{filename}')
def get_face_image(name: str, filename: str, token: str):
  """
  Serve a specific captured angle image.
  Uses query-param token for compatibility with <img src>.
  """
  verify_token_param(token)
  person_dir = faces_dir / name
  if not person_dir.exists() or not person_dir.is_dir():
    raise HTTPException(status_code=404, detail='Person not found')

  filepath = person_dir / filename
  if not filepath.exists() or not filepath.is_file():
    raise HTTPException(status_code=404, detail='Image not found')

  return FileResponse(filepath)


@router.delete('/{name}')
def delete_face(name: str, _: str = Depends(get_current_user)):
  """Delete a person from the disk and the live recognizer model."""
  person_dir = faces_dir / name
  if not person_dir.exists():
    raise HTTPException(status_code=404, detail='Person not found')

  # 1. Delete from disk
  try:
    shutil.rmtree(person_dir)
  except Exception as e:
    raise HTTPException(status_code=500, detail=f'Failed to delete directory: {e}') from e

  # 2. Remove from live recognizer
  if state.recognizer:
    state.recognizer.remove_person(name)

  return {'status': 'success', 'message': f'Deleted {name}'}

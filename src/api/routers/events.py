"""
src/api/routers/events.py
─────────────────────────
Event log API:
  GET /events                   — list events with filters (+ playback link)
  GET /events/summary           — counts by type
  GET /events/{id}/thumbnail    — serve event thumbnail image
"""

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Query
from fastapi.responses import FileResponse

import src.api.state as state
from src.api.auth import get_current_user
from src.api.auth import verify_token_param
from src.config import THUMBNAILS_DIR

router = APIRouter(prefix='/events')


def _attach_playback(events: list[dict]) -> list[dict]:
  """
  Enrich event rows with `playback: {file, url, start_offset}` — the segment
  covering the event's timestamp and the seconds into it. None when no
  recording covers the event (e.g. recording was off).
  """
  index = state.recording_index
  if index is None:
    return events
  for ev in events:
    try:
      ts = datetime.fromisoformat(ev['timestamp'])
    except (ValueError, TypeError):
      ev['playback'] = None
      continue
    seg = index.segment_covering(ev['camera_id'], ts)
    if seg is None:
      ev['playback'] = None
      continue
    ev['playback'] = {
      'file': Path(seg['path']).name,
      'url': f'/recordings/{ev["camera_id"]}/{Path(seg["path"]).name}',
      'start_offset': round((ts - datetime.fromisoformat(seg['start_time'])).total_seconds(), 1),
    }
  return events


@router.get('')
def list_events(
  camera_id: str | None = None,
  event_type: str | None = None,
  person_name: str | None = None,
  since: str | None = None,  # ISO format
  until: str | None = None,  # ISO format
  limit: int = Query(50, le=500),
  offset: int = 0,
  _: str = Depends(get_current_user),
):
  """List detection events with optional filters."""
  if not state.event_db:
    return {'events': [], 'total': 0}

  since_dt = datetime.fromisoformat(since) if since else None
  until_dt = datetime.fromisoformat(until) if until else None

  events = state.event_db.query(
    camera_id=camera_id,
    event_type=event_type,
    person_name=person_name,
    since=since_dt,
    until=until_dt,
    limit=limit,
    offset=offset,
  )
  total = state.event_db.count(
    camera_id=camera_id,
    event_type=event_type,
    person_name=person_name,
    since=since_dt,
    until=until_dt,
  )

  return {'events': _attach_playback(events), 'total': total}


@router.get('/summary')
def event_summary(_: str = Depends(get_current_user)):
  """Return event counts grouped by type."""
  if not state.event_db:
    return {'summary': {}}

  return {
    'summary': {
      'unknown_face': state.event_db.count(event_type='unknown_face'),
      'known_face': state.event_db.count(event_type='known_face'),
      'person_detected': state.event_db.count(event_type='person_detected'),
      'total': state.event_db.count(),
    }
  }


@router.get('/{event_id}/thumbnail')
def get_event_thumbnail(event_id: int, token: str):
  """Serve event thumbnail image. Uses query-param token for <img> compatibility."""
  verify_token_param(token)
  if not state.event_db:
    raise HTTPException(status_code=404, detail='Event system not initialized')

  event = state.event_db.get_by_id(event_id)
  if not event or not event.get('thumbnail_path'):
    raise HTTPException(status_code=404, detail='Event or thumbnail not found')

  thumb_path = Path(event['thumbnail_path']).resolve()
  # Path traversal protection: ensure the resolved path is inside the thumbnails dir
  if not str(thumb_path).startswith(str(THUMBNAILS_DIR.resolve())):
    raise HTTPException(status_code=403, detail='Access denied')
  if not thumb_path.exists():
    raise HTTPException(status_code=404, detail='Thumbnail file missing')
  return FileResponse(thumb_path, media_type='image/jpeg')

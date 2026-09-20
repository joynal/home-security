"""
src/api/routers/recordings.py
──────────────────────────────
Recording playback API:
  GET /recordings/storage                 — storage usage stats
  GET /recordings/summary                 — days that have recordings (calendar)
  GET /recordings/{camera_id}             — list segments for a camera
  GET /recordings/{camera_id}/timeline    — per-day hour buckets + exact segments
  GET /recordings/{camera_id}/{filename}  — serve MP4 segment for playback

NOTE: static routes (/storage, /summary) are declared before path-parameter
routes, and /{camera_id}/timeline before /{camera_id}/{filename} — FastAPI
matches in declaration order.
"""

import re
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Query
from fastapi.responses import FileResponse

import src.api.state as state
from src.api.auth import get_current_user
from src.api.auth import verify_token_param
from src.config import RECORDINGS_DIR  # env-overridable — same path the recorder writes to
from src.recording.frames import get_cached_frame

router = APIRouter(prefix='/recordings')

_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _parse_date(date: str) -> datetime:
  """Validate YYYY-MM-DD → UTC midnight, raising 422-shaped ValueError."""
  if not _DATE_RE.match(date):
    raise ValueError(f'Invalid date (expected YYYY-MM-DD): {date}')
  return datetime.strptime(date, '%Y-%m-%d').replace(tzinfo=UTC)


# ── Static routes first (before path-parameter routes) ──────────
@router.get('/storage')
def storage_stats(_: str = Depends(get_current_user)):
  """Return storage usage per camera and total."""
  stats = {}
  total_bytes = 0

  if not RECORDINGS_DIR.exists():
    return {'cameras': {}, 'total_bytes': 0, 'total_gb': 0}

  for camera_dir in RECORDINGS_DIR.iterdir():
    if not camera_dir.is_dir():
      continue
    cam_bytes = sum(f.stat().st_size for f in camera_dir.glob('*.mp4'))
    segment_count = len(list(camera_dir.glob('*.mp4')))
    stats[camera_dir.name] = {
      'bytes': cam_bytes,
      'gb': round(cam_bytes / (1024**3), 2),
      'segment_count': segment_count,
    }
    total_bytes += cam_bytes

  return {
    'cameras': stats,
    'total_bytes': total_bytes,
    'total_gb': round(total_bytes / (1024**3), 2),
  }


@router.get('/summary')
def recordings_summary(_: str = Depends(get_current_user)):
  """UTC dates that have any recorded footage — enables days in the date picker."""
  if state.recording_index is None:
    return {'days': []}
  return {'days': state.recording_index.days_with_recordings()}


# ── Path-parameter routes ──────────────────────────────────────
@router.get('/{camera_id}/timeline')
def camera_timeline(
  camera_id: str,
  date: str = Query(..., description='UTC date, YYYY-MM-DD'),
  _: str = Depends(get_current_user),
):
  """
  Per-day timeline data for the scrubber UI:
    hours:    [{hour, segment_minutes, events, unknowns}]
    segments: exact [{start, end, file}] overlapping the day
  """
  if state.recording_index is None or state.event_db is None:
    raise HTTPException(status_code=503, detail='Recording index not initialized')
  try:
    day_start = _parse_date(date)
  except ValueError as exc:
    raise HTTPException(status_code=422, detail=str(exc)) from exc
  day_end = day_start + timedelta(days=1)

  # Event counts per hour — one SQL GROUP BY over the events table
  # (timestamp LIKE 'YYYY-MM-DDT%' keeps it to the UTC day)
  event_rows = state.event_db.query_raw(
    """SELECT substr(timestamp, 1, 13) AS hour,
              COUNT(*) AS events,
              SUM(CASE WHEN event_type = 'unknown_face' THEN 1 ELSE 0 END) AS unknowns
       FROM events
       WHERE camera_id = ? AND timestamp LIKE ?
       GROUP BY hour""",
    (camera_id, f'{date}T%'),
  )
  events_by_hour = {
    r['hour']: {'events': r['events'], 'unknowns': r['unknowns']} for r in event_rows
  }

  # Segment minutes per hour — clip each segment's overlap with the day
  segments = state.recording_index.segments_between(camera_id, day_start, day_end)
  minutes_by_hour: dict[str, float] = {}
  for seg in segments:
    seg_start = datetime.fromisoformat(seg['start_time'])
    seg_end = datetime.fromisoformat(seg['end_time'])
    cursor = max(seg_start, day_start)
    while cursor < min(seg_end, day_end):
      hour_key = cursor.strftime('%Y-%m-%dT%H')
      hour_end = cursor.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
      chunk_end = min(seg_end, day_end, hour_end)
      minutes_by_hour[hour_key] = (
        minutes_by_hour.get(hour_key, 0.0) + (chunk_end - cursor).total_seconds() / 60
      )
      cursor = chunk_end

  hours = []
  for h in range(24):
    key = f'{date}T{h:02d}'
    ev = events_by_hour.get(key, {'events': 0, 'unknowns': 0})
    hours.append(
      {
        'hour': h,
        'segment_minutes': round(minutes_by_hour.get(key, 0.0), 1),
        'events': ev['events'],
        'unknowns': ev['unknowns'],
      }
    )

  return {
    'date': date,
    'camera_id': camera_id,
    'hours': hours,
    'segments': [
      {'start': s['start_time'], 'end': s['end_time'], 'file': s['path']} for s in segments
    ],
  }


@router.get('/{camera_id}/frame.jpg')
def frame_at_time(
  camera_id: str,
  ts: float = Query(..., description='UTC epoch seconds'),
  token: str = Query(...),
):
  """
  JPEG frame at an arbitrary timestamp (timeline hover previews).
  OpenCV seek inside the covering segment; cached under data/thumbnails/frames/.
  """
  verify_token_param(token)
  if state.recording_index is None:
    raise HTTPException(status_code=503, detail='Recording index not initialized')

  segment = state.recording_index.segment_covering(camera_id, datetime.fromtimestamp(ts, tz=UTC))
  if segment is None:
    raise HTTPException(status_code=404, detail='No recording covers that timestamp')
  segment_path = Path(segment['path'])
  if not segment_path.exists():
    raise HTTPException(status_code=404, detail='Segment file missing')

  jpeg = get_cached_frame(segment_path, ts, datetime.fromisoformat(segment['start_time']))
  if jpeg is None:
    raise HTTPException(status_code=404, detail='Could not decode frame at that time')
  return FileResponse(jpeg, media_type='image/jpeg')


@router.get('/{camera_id}')
def list_segments(
  camera_id: str,
  date: str | None = None,  # Filter by date: "20260917"
  limit: int = Query(100, le=1000),
  _: str = Depends(get_current_user),
):
  """List recording segments for a camera, newest first."""
  camera_dir = RECORDINGS_DIR / camera_id
  if not camera_dir.exists():
    return {'segments': [], 'camera_id': camera_id}

  segments = []
  for f in sorted(camera_dir.glob('*.mp4'), reverse=True):
    if date and not f.stem.startswith(date):
      continue
    stat = f.stat()
    segments.append(
      {
        'filename': f.name,
        'size_bytes': stat.st_size,
        'size_mb': round(stat.st_size / (1024 * 1024), 1),
        'created_at': stat.st_mtime,
        'duration_seconds': 900,  # Approximate; exact would require ffprobe
      }
    )
    if len(segments) >= limit:
      break

  return {'segments': segments, 'camera_id': camera_id}


@router.get('/{camera_id}/{filename}')
def serve_segment(camera_id: str, filename: str, token: str):
  """Serve an MP4 recording segment for browser playback."""
  verify_token_param(token)
  filepath = (RECORDINGS_DIR / camera_id / filename).resolve()
  # Path traversal protection: resolve the path and verify it's inside RECORDINGS_DIR
  if not str(filepath).startswith(str(RECORDINGS_DIR.resolve())):
    raise HTTPException(status_code=403, detail='Access denied')
  if not filepath.exists() or filepath.suffix != '.mp4':
    raise HTTPException(status_code=404, detail='Segment not found')
  return FileResponse(filepath, media_type='video/mp4')

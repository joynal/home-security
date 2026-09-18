"""
src/api/routers/events.py
─────────────────────────
Event log API:
  GET /events                   — list events with filters
  GET /events/summary           — counts by type
  GET /events/{id}/thumbnail    — serve event thumbnail image
"""

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

import src.api.state as state
from src.api.auth import get_current_user, verify_token_param
from src.config import THUMBNAILS_DIR

router = APIRouter(prefix="/events")


@router.get("")
def list_events(
    camera_id: str | None = None,
    event_type: str | None = None,
    since: str | None = None,  # ISO format
    until: str | None = None,  # ISO format
    limit: int = Query(50, le=500),
    offset: int = 0,
    _: str = Depends(get_current_user),
):
    """List detection events with optional filters."""
    if not state.event_db:
        return {"events": [], "total": 0}

    since_dt = datetime.fromisoformat(since) if since else None
    until_dt = datetime.fromisoformat(until) if until else None

    events = state.event_db.query(
        camera_id=camera_id,
        event_type=event_type,
        since=since_dt,
        until=until_dt,
        limit=limit,
        offset=offset,
    )
    total = state.event_db.count(
        camera_id=camera_id,
        event_type=event_type,
        since=since_dt,
        until=until_dt,
    )

    return {"events": events, "total": total}


@router.get("/summary")
def event_summary(_: str = Depends(get_current_user)):
    """Return event counts grouped by type."""
    if not state.event_db:
        return {"summary": {}}

    return {
        "summary": {
            "unknown_face": state.event_db.count(event_type="unknown_face"),
            "known_face": state.event_db.count(event_type="known_face"),
            "person_detected": state.event_db.count(event_type="person_detected"),
            "total": state.event_db.count(),
        }
    }


@router.get("/{event_id}/thumbnail")
def get_event_thumbnail(event_id: int, token: str):
    """Serve event thumbnail image. Uses query-param token for <img> compatibility."""
    verify_token_param(token)
    if not state.event_db:
        raise HTTPException(status_code=404, detail="Event system not initialized")

    event = state.event_db.get_by_id(event_id)
    if not event or not event.get("thumbnail_path"):
        raise HTTPException(status_code=404, detail="Event or thumbnail not found")

    thumb_path = Path(event["thumbnail_path"]).resolve()
    # Path traversal protection: ensure the resolved path is inside the thumbnails dir
    if not str(thumb_path).startswith(str(THUMBNAILS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail file missing")
    return FileResponse(thumb_path, media_type="image/jpeg")

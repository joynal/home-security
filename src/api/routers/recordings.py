"""
src/api/routers/recordings.py
──────────────────────────────
Recording playback API:
  GET /recordings/storage                 — storage usage stats
  GET /recordings/{camera_id}             — list segments for a camera
  GET /recordings/{camera_id}/{filename}  — serve MP4 segment for playback

NOTE: /storage MUST be declared before /{camera_id} — FastAPI matches in
declaration order, so /{camera_id} would capture "storage" as a camera_id.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from src.api.auth import get_current_user, verify_token_param
from src.config import RECORDINGS_DIR  # env-overridable — same path the recorder writes to

router = APIRouter(prefix="/recordings")


# ── Static routes first (before path-parameter routes) ──────────
@router.get("/storage")
def storage_stats(_: str = Depends(get_current_user)):
    """Return storage usage per camera and total."""
    stats = {}
    total_bytes = 0

    if not RECORDINGS_DIR.exists():
        return {"cameras": {}, "total_bytes": 0, "total_gb": 0}

    for camera_dir in RECORDINGS_DIR.iterdir():
        if not camera_dir.is_dir():
            continue
        cam_bytes = sum(f.stat().st_size for f in camera_dir.glob("*.mp4"))
        segment_count = len(list(camera_dir.glob("*.mp4")))
        stats[camera_dir.name] = {
            "bytes": cam_bytes,
            "gb": round(cam_bytes / (1024**3), 2),
            "segment_count": segment_count,
        }
        total_bytes += cam_bytes

    return {
        "cameras": stats,
        "total_bytes": total_bytes,
        "total_gb": round(total_bytes / (1024**3), 2),
    }


# ── Path-parameter routes ──────────────────────────────────────
@router.get("/{camera_id}")
def list_segments(
    camera_id: str,
    date: str | None = None,  # Filter by date: "20260917"
    limit: int = Query(100, le=1000),
    _: str = Depends(get_current_user),
):
    """List recording segments for a camera, newest first."""
    camera_dir = RECORDINGS_DIR / camera_id
    if not camera_dir.exists():
        return {"segments": [], "camera_id": camera_id}

    segments = []
    for f in sorted(camera_dir.glob("*.mp4"), reverse=True):
        if date and not f.stem.startswith(date):
            continue
        stat = f.stat()
        segments.append(
            {
                "filename": f.name,
                "size_bytes": stat.st_size,
                "size_mb": round(stat.st_size / (1024 * 1024), 1),
                "created_at": stat.st_mtime,
                "duration_seconds": 900,  # Approximate; exact would require ffprobe
            }
        )
        if len(segments) >= limit:
            break

    return {"segments": segments, "camera_id": camera_id}


@router.get("/{camera_id}/{filename}")
def serve_segment(camera_id: str, filename: str, token: str):
    """Serve an MP4 recording segment for browser playback."""
    verify_token_param(token)
    filepath = (RECORDINGS_DIR / camera_id / filename).resolve()
    # Path traversal protection: resolve the path and verify it's inside RECORDINGS_DIR
    if not str(filepath).startswith(str(RECORDINGS_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")
    if not filepath.exists() or filepath.suffix != ".mp4":
        raise HTTPException(status_code=404, detail="Segment not found")
    return FileResponse(filepath, media_type="video/mp4")

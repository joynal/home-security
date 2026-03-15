"""
src/api/routers/faces.py
────────────────────────
Manage known faces:
  GET    /faces            - List all registered names and their image counts
  DELETE /faces/{name}     - Delete a person from disk and the live AI model
  GET    /faces/{name}/img - Serve a thumbnail image for the UI
"""
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

import src.api.state as state
from src.api.auth import get_current_user, verify_token_param
from src.config import KNOWN_FACES_DIR

router = APIRouter(prefix="/faces")
faces_dir = Path(KNOWN_FACES_DIR)


@router.get("")
def list_faces(_: str = Depends(get_current_user)):
    """Return a list of all registered people and how many face samples they have."""
    if not faces_dir.exists():
        return {"faces": []}

    results = []
    for entry in faces_dir.iterdir():
        if entry.is_dir() and not entry.name.startswith("."):
            images = list(entry.glob("*.jpg")) + list(entry.glob("*.png"))
            if images:
                results.append({
                    "name": entry.name,
                    "image_count": len(images),
                    "images": [f.name for f in sorted(images)],
                    "created_at": min(f.stat().st_ctime for f in images)
                })

    # Sort descending by creation date (newest first)
    results.sort(key=lambda x: x["created_at"], reverse=True)
    return {"faces": results}


@router.get("/{name}/img/{filename}")
def get_face_image(name: str, filename: str, token: str):
    """
    Serve a specific captured angle image.
    Uses query-param token for compatibility with <img src>.
    """
    verify_token_param(token)
    person_dir = faces_dir / name
    if not person_dir.exists() or not person_dir.is_dir():
        raise HTTPException(status_code=404, detail="Person not found")

    filepath = person_dir / filename
    if not filepath.exists() or not filepath.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(filepath)


@router.delete("/{name}")
def delete_face(name: str, _: str = Depends(get_current_user)):
    """Delete a person from the disk and the live recognizer model."""
    person_dir = faces_dir / name
    if not person_dir.exists():
        raise HTTPException(status_code=404, detail="Person not found")

    # 1. Delete from disk
    try:
        shutil.rmtree(person_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete directory: {e}") from e

    # 2. Remove from live recognizer
    if state.recognizer:
        state.recognizer.remove_person(name)

    return {"status": "success", "message": f"Deleted {name}"}

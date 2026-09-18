"""Integration test for the inference-loop → event-DB wiring (no camera needed)."""

import numpy as np

import src.api.state as state
from src.api.inference import _log_unknown_face_event
from src.events.database import EventDatabase
from src.events.models import DetectionEvent


def test_unknown_face_event_logged_with_thumbnail(tmp_path, monkeypatch):
    db = EventDatabase(db_path=tmp_path / "events.db")
    monkeypatch.setattr(state, "event_db", db)
    monkeypatch.setattr("src.api.inference.THUMBNAILS_DIR", tmp_path / "thumbs")

    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    last_event_at: dict[str, float] = {}

    _log_unknown_face_event("front_door", frame, last_event_at)

    events = db.query(camera_id="front_door", event_type="unknown_face")
    assert len(events) == 1
    thumb = events[0]["thumbnail_path"]
    assert tmp_path.joinpath("thumbs", "front_door").as_posix() in thumb.replace("\\", "/")
    # Thumbnail file actually written and is a real image
    from pathlib import Path

    assert Path(thumb).exists()
    assert Path(thumb).read_bytes()[:2] == b"\xff\xd8"  # JPEG SOI


def test_event_cooldown_prevents_flood(tmp_path, monkeypatch):
    db = EventDatabase(db_path=tmp_path / "events.db")
    monkeypatch.setattr(state, "event_db", db)
    monkeypatch.setattr("src.api.inference.THUMBNAILS_DIR", tmp_path / "thumbs")

    frame = np.zeros((120, 160, 3), dtype=np.uint8)
    last_event_at: dict[str, float] = {}

    for _ in range(50):  # ~30fps ≈ 1.7s of continuous unknown presence
        _log_unknown_face_event("front_door", frame, last_event_at)

    assert db.count() == 1  # throttled to one event per cooldown window


def test_no_db_is_noop(tmp_path, monkeypatch):
    monkeypatch.setattr(state, "event_db", None)
    _log_unknown_face_event("front_door", np.zeros((10, 10, 3), dtype=np.uint8), {})
    # No exception, nothing to assert beyond reaching this point


def test_event_model_defaults():
    e = DetectionEvent(camera_id="c", event_type="motion")
    assert e.person_name is None
    assert e.confidence == 0.0
    assert e.timestamp.tzinfo is not None  # timezone-aware UTC default

"""Daily summary generation tests."""

from datetime import UTC, datetime, timedelta

from src.alerts.summary import generate_daily_summary
from src.events.database import EventDatabase
from src.events.models import DetectionEvent


def _seed(db: EventDatabase) -> None:
    now = datetime.now(UTC)
    db.insert(DetectionEvent(camera_id="front_door", event_type="unknown_face", timestamp=now))
    db.insert(DetectionEvent(camera_id="front_door", event_type="unknown_face", timestamp=now))
    db.insert(DetectionEvent(camera_id="front_door", event_type="motion", timestamp=now))
    db.insert(DetectionEvent(camera_id="backyard", event_type="known_face", person_name="joynal", timestamp=now))
    db.insert(DetectionEvent(camera_id="backyard", event_type="loitering", timestamp=now))
    db.insert(DetectionEvent(camera_id="porch", event_type="motion", timestamp=now))
    # Old event — outside the 24h window, must not be counted
    db.insert(
        DetectionEvent(
            camera_id="porch",
            event_type="unknown_face",
            timestamp=now - timedelta(hours=30),
        )
    )


def test_summary_counts_and_busiest_camera(tmp_path):
    db = EventDatabase(db_path=tmp_path / "e.db")
    _seed(db)
    s = generate_daily_summary(db)
    assert "Total events: 6" in s
    assert "Unknown faces: 2" in s
    assert "Known entries: 1" in s
    assert "Loitering alerts: 1" in s
    assert "front_door (3 events)" in s


def test_summary_empty_db(tmp_path):
    db = EventDatabase(db_path=tmp_path / "e.db")
    s = generate_daily_summary(db)
    assert "Total events: 0" in s
    assert "Busiest camera: None" in s


def test_summary_busiest_hour(tmp_path):
    db = EventDatabase(db_path=tmp_path / "e.db")
    now = datetime.now(UTC)
    for _ in range(3):
        db.insert(DetectionEvent(camera_id="c", event_type="motion", timestamp=now))
    s = generate_daily_summary(db)
    assert "Busiest hour" in s

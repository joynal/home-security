"""Tests for the SQLite event database — runs on in-memory SQLite, no cameras."""

from datetime import UTC, datetime, timedelta

import pytest

from src.events.database import EventDatabase
from src.events.models import DetectionEvent


@pytest.fixture
def db():
    return EventDatabase(db_path=":memory:")


def _event(**overrides) -> DetectionEvent:
    defaults = {"camera_id": "front_door", "event_type": "unknown_face"}
    defaults.update(overrides)
    return DetectionEvent(**defaults)


def test_insert_and_get_by_id(db):
    eid = db.insert(_event(person_name=None, confidence=0.87))
    row = db.get_by_id(eid)
    assert row is not None
    assert row["camera_id"] == "front_door"
    assert row["event_type"] == "unknown_face"
    assert row["confidence"] == 0.87


def test_get_by_id_missing(db):
    assert db.get_by_id(99999) is None


def test_query_filters(db):
    db.insert(_event(camera_id="front_door", event_type="unknown_face"))
    db.insert(_event(camera_id="backyard", event_type="known_face", person_name="joynal"))
    db.insert(_event(camera_id="front_door", event_type="known_face", person_name="joynal"))

    assert db.count() == 3
    assert db.count(camera_id="front_door") == 2
    assert db.count(event_type="known_face") == 2
    assert db.count(camera_id="front_door", event_type="known_face") == 1

    rows = db.query(camera_id="front_door")
    assert len(rows) == 2
    assert all(r["camera_id"] == "front_door" for r in rows)


def test_query_since_until(db):
    old = datetime.now(UTC) - timedelta(days=2)
    recent = datetime.now(UTC)
    db.insert(_event(timestamp=old))
    db.insert(_event(timestamp=recent))

    since = datetime.now(UTC) - timedelta(days=1)
    assert db.count(since=since) == 1
    assert db.count(until=since) == 1  # the 2-day-old event


def test_query_newest_first_and_limit(db):
    base = datetime.now(UTC)
    for i in range(10):
        db.insert(_event(timestamp=base - timedelta(minutes=i)))
    rows = db.query(limit=3)
    assert len(rows) == 3
    assert rows[0]["timestamp"] >= rows[1]["timestamp"] >= rows[2]["timestamp"]


def test_utc_timestamps_stored(db):
    ts = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    eid = db.insert(_event(timestamp=ts))
    assert db.get_by_id(eid)["timestamp"] == ts.isoformat()


def test_delete_older_than_strict(db, tmp_path):
    old_ts = datetime.now(UTC) - timedelta(days=40)
    db.insert(_event(timestamp=old_ts, thumbnail_path=str(tmp_path / "old.jpg")))
    db.insert(_event(timestamp=datetime.now(UTC)))

    deleted = db.delete_older_than(days=30, only_if_disk_full=False)
    assert deleted == 1
    assert db.count() == 1


def test_delete_older_than_thumbnail_cascade(db, tmp_path):
    thumb = tmp_path / "old_thumb.jpg"
    thumb.write_bytes(b"fake-jpeg")
    old_ts = datetime.now(UTC) - timedelta(days=40)
    db.insert(_event(timestamp=old_ts, thumbnail_path=str(thumb)))

    db.delete_older_than(days=30, only_if_disk_full=False)
    assert not thumb.exists()  # orphaned thumbnail unlinked


def test_delete_older_than_skipped_when_disk_has_space(db, monkeypatch, tmp_path):
    # Simulate a volume with plenty of free space
    monkeypatch.setattr(
        "src.events.database.shutil.disk_usage",
        lambda _p: (100 << 30, 100 << 30, 500 << 30),  # total, used, free=500GB
    )
    db_file = tmp_path / "events.db"
    disk_db = EventDatabase(db_path=db_file)
    disk_db.insert(_event(timestamp=datetime.now(UTC) - timedelta(days=90)))

    deleted = disk_db.delete_older_than(days=30, only_if_disk_full=True, min_disk_free_gb=10.0)
    assert deleted == 0
    assert disk_db.count() == 1  # preserved — space available


def test_delete_older_than_runs_when_disk_low(db, monkeypatch, tmp_path):
    # Simulate a nearly-full volume: free = 2GB < 10GB threshold
    monkeypatch.setattr(
        "src.events.database.shutil.disk_usage",
        lambda _p: (100 << 30, 98 << 30, 2 << 30),
    )
    db_file = tmp_path / "events.db"
    disk_db = EventDatabase(db_path=db_file)
    disk_db.insert(_event(timestamp=datetime.now(UTC) - timedelta(days=90)))
    disk_db.insert(_event(timestamp=datetime.now(UTC)))

    deleted = disk_db.delete_older_than(days=30, only_if_disk_full=True, min_disk_free_gb=10.0)
    assert deleted == 1
    assert disk_db.count() == 1


def test_thread_safety():
    """Concurrent inserts from multiple threads must not corrupt or lose rows."""
    import threading

    db = EventDatabase(db_path=":memory:")
    errors = []

    def writer(n: int) -> None:
        try:
            for _ in range(50):
                db.insert(_event(camera_id=f"cam{n}", event_type="motion"))
        except Exception as exc:  # pragma: no cover - only on failure
            errors.append(exc)

    threads = [threading.Thread(target=writer, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert db.count() == 200

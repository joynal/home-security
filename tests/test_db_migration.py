"""Tests for the one-time events.db → aegis.db consolidation (Task B0)."""

from datetime import UTC, datetime

from src.events.database import EventDatabase, migrate_legacy_db
from src.events.models import DetectionEvent


def test_migration_copies_rows_and_renames_legacy(tmp_path):
  legacy = tmp_path / 'events.db'
  target = tmp_path / 'aegis.db'

  old = EventDatabase(db_path=legacy)
  old.insert(DetectionEvent(camera_id='cam', event_type='unknown_face'))
  old.insert(DetectionEvent(camera_id='cam', event_type='known_face', person_name='joynal'))
  old.close()

  assert migrate_legacy_db(legacy_path=legacy, target_path=target) is True

  new = EventDatabase(db_path=target)
  assert new.count() == 2
  assert new.count(event_type='known_face') == 1
  new.close()
  # Legacy file renamed out of the way, contents preserved
  assert not legacy.exists()
  assert (tmp_path / 'events.db.migrated').exists()


def test_migration_idempotent(tmp_path):
  legacy = tmp_path / 'events.db'
  target = tmp_path / 'aegis.db'
  old = EventDatabase(db_path=legacy)
  old.insert(DetectionEvent(camera_id='cam', event_type='motion'))
  old.close()

  assert migrate_legacy_db(legacy_path=legacy, target_path=target) is True
  # Second run: legacy no longer exists → no-op
  assert migrate_legacy_db(legacy_path=legacy, target_path=target) is False
  assert target.exists()


def test_no_migration_when_target_exists(tmp_path):
  legacy = tmp_path / 'events.db'
  target = tmp_path / 'aegis.db'

  old = EventDatabase(db_path=legacy)
  old.insert(DetectionEvent(camera_id='cam', event_type='motion'))
  old.close()
  fresh = EventDatabase(db_path=target)  # creates the target first
  fresh.insert(DetectionEvent(camera_id='x', event_type='loitering'))
  fresh.close()

  # Target existed → migration must not clobber it
  assert migrate_legacy_db(legacy_path=legacy, target_path=target) is False
  db = EventDatabase(db_path=target)
  assert db.count() == 1
  assert db.query()[0]['event_type'] == 'loitering'


def test_migration_with_new_events_after(tmp_path):
  """Old rows survive; new inserts land in the same table alongside them."""
  legacy = tmp_path / 'events.db'
  target = tmp_path / 'aegis.db'
  old = EventDatabase(db_path=legacy)
  old.insert(
    DetectionEvent(camera_id='cam', event_type='unknown_face', timestamp=datetime.now(UTC))
  )
  old.close()
  migrate_legacy_db(legacy_path=legacy, target_path=target)

  db = EventDatabase(db_path=target)
  db.insert(DetectionEvent(camera_id='cam2', event_type='loitering'))
  assert db.count() == 2
  db.close()

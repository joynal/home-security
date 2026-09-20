"""
src/events/database.py
──────────────────────
The app database (data/aegis.db): detection events now, recordings index and
person metadata as the v2 plan lands. Thread-safe: single connection + lock.

All timestamps are UTC. Using naive local time causes bugs when API filters
carry timezone-aware ISO strings — lexicographic SQL comparison breaks across
offsets. Convert to local time only in the frontend display layer.
"""

import shutil
import sqlite3
import threading
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

from src.config import DATA_DIR
from src.events.models import DetectionEvent

DB_PATH = DATA_DIR / 'aegis.db'
LEGACY_DB_PATH = DATA_DIR / 'events.db'
LEGACY_MIGRATED_SUFFIX = '.migrated'


def migrate_legacy_db(legacy_path: Path = LEGACY_DB_PATH, target_path: Path = DB_PATH) -> bool:
  """
  One-time: fold the old events.db into aegis.db. Idempotent — no-op when the
  legacy file is absent or the target already exists. Returns True if migrated.
  """
  if not legacy_path.exists() or target_path.exists():
    return False
  src = sqlite3.connect(str(legacy_path))
  dst = sqlite3.connect(str(target_path))
  try:
    src.backup(dst)  # copies schema + rows into the fresh target
  finally:
    src.close()
    dst.close()
  legacy_path.rename(legacy_path.with_name(legacy_path.name + LEGACY_MIGRATED_SUFFIX))
  return True


class EventDatabase:
  def __init__(self, db_path: Path | None = None):
    self.db_path = Path(db_path) if db_path else DB_PATH
    self._lock = threading.Lock()
    # One-time legacy migration (default path only — tests pass explicit paths)
    if self.db_path == DB_PATH:
      migrate_legacy_db()
    # Single persistent connection — required for ":memory:" databases
    # (each sqlite3.connect(":memory:") would create a separate empty DB),
    # and faster than per-call connects. Our lock serializes access, so
    # check_same_thread=False is safe here.
    self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
    self._conn.row_factory = sqlite3.Row
    self._init_db()

  def _init_db(self) -> None:
    with self._lock:
      self._conn.execute("""
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    camera_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    person_name TEXT,
                    person_id INTEGER,
                    confidence REAL DEFAULT 0.0,
                    thumbnail_path TEXT,
                    recording_segment TEXT,
                    metadata TEXT DEFAULT '',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
      self._conn.execute('CREATE INDEX IF NOT EXISTS idx_events_camera ON events(camera_id)')
      self._conn.execute('CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)')
      self._conn.execute('CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)')
      # B6.2 migration: stable person link (added for pre-existing databases;
      # fresh ones get it via CREATE TABLE above only if listed there — keep
      # the ALTER for both paths' safety)
      cols = [r['name'] for r in self._conn.execute('PRAGMA table_info(events)')]
      if 'person_id' not in cols:
        self._conn.execute('ALTER TABLE events ADD COLUMN person_id INTEGER')
        self._conn.execute('CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id)')
      self._conn.commit()

  def close(self) -> None:
    with self._lock:
      self._conn.close()

  def insert(self, event: DetectionEvent) -> int:
    with self._lock:
      cursor = self._conn.execute(
        """INSERT INTO events (camera_id, event_type, timestamp, person_name, person_id,
                   confidence, thumbnail_path, recording_segment, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
          event.camera_id,
          event.event_type,
          event.timestamp.isoformat(),
          event.person_name,
          event.person_id,
          event.confidence,
          event.thumbnail_path,
          event.recording_segment,
          event.metadata,
        ),
      )
      self._conn.commit()
      return cursor.lastrowid

  def query(
    self,
    camera_id: str | None = None,
    event_type: str | None = None,
    person_name: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
  ) -> list[dict]:
    """Query events with optional filters. newest first."""
    conditions, params = self._build_filters(camera_id, event_type, person_name, since, until)
    where = 'WHERE ' + ' AND '.join(conditions) if conditions else ''

    with self._lock:
      rows = self._conn.execute(
        f'SELECT * FROM events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?',
        params + [limit, offset],
      ).fetchall()
      return [dict(row) for row in rows]

  def count(
    self,
    camera_id: str | None = None,
    event_type: str | None = None,
    person_name: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
  ) -> int:
    conditions, params = self._build_filters(camera_id, event_type, person_name, since, until)
    where = 'WHERE ' + ' AND '.join(conditions) if conditions else ''

    with self._lock:
      return self._conn.execute(f'SELECT COUNT(*) FROM events {where}', params).fetchone()[0]

  @staticmethod
  def _build_filters(
    camera_id: str | None,
    event_type: str | None,
    person_name: str | None,
    since: datetime | None,
    until: datetime | None,
  ) -> tuple[list[str], list]:
    conditions, params = [], []
    if camera_id:
      conditions.append('camera_id = ?')
      params.append(camera_id)
    if event_type:
      conditions.append('event_type = ?')
      params.append(event_type)
    if person_name:
      conditions.append('person_name = ?')
      params.append(person_name)
    if since:
      conditions.append('timestamp >= ?')
      params.append(since.isoformat())
    if until:
      conditions.append('timestamp <= ?')
      params.append(until.isoformat())
    return conditions, params

  def get_by_id(self, event_id: int) -> dict | None:
    """Fetch a single event by ID."""
    with self._lock:
      row = self._conn.execute('SELECT * FROM events WHERE id = ?', (event_id,)).fetchone()
      return dict(row) if row else None

  def query_raw(self, sql: str, params: list | tuple = ()) -> list[dict]:
    """Escape hatch for read-only aggregate queries (e.g. timeline GROUP BY)."""
    with self._lock:
      rows = self._conn.execute(sql, params).fetchall()
      return [dict(r) for r in rows]

  def delete_older_than(
    self,
    days: int = 30,
    only_if_disk_full: bool = True,
    min_disk_free_gb: float = 10.0,
  ) -> int:
    """
    Delete events older than N days and their thumbnail files.
    If only_if_disk_full is True (default), skip deletion entirely while the
    volume holding the DB has at least min_disk_free_gb free.
    """
    if only_if_disk_full:
      try:
        _, _, free_bytes = shutil.disk_usage(self.db_path.parent)
        free_gb = free_bytes / (1024**3)
        if free_gb >= min_disk_free_gb:
          return 0  # Ample space, keep events and thumbnails!
      except OSError:
        pass

    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    with self._lock:
      # Collect thumbnail paths before deleting rows (cascade to files)
      thumbs = self._conn.execute(
        'SELECT thumbnail_path FROM events WHERE timestamp < ? AND thumbnail_path IS NOT NULL',
        (cutoff,),
      ).fetchall()
      cursor = self._conn.execute('DELETE FROM events WHERE timestamp < ?', (cutoff,))
      self._conn.commit()
      deleted = cursor.rowcount
    for (thumb_path,) in thumbs:
      try:
        Path(thumb_path).unlink(missing_ok=True)
      except OSError:
        pass
    return deleted

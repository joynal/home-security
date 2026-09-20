"""
src/recording/index.py
──────────────────────
SQLite index of recorded segments — the data layer the timeline UI reads
(Frigate's Recordings-table pattern). Lives in the shared aegis.db; writes come
from the recorder (on rotation) and the startup backfill; never scans the
directory at query time.
"""

import re
import sqlite3
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

# Clock-aligned segment filenames: YYYYMMDD_HHMMSS.mp4
_SEGMENT_NAME_RE = re.compile(r'^(\d{8})_(\d{6})\.mp4$')


def parse_segment_start(path: Path) -> datetime | None:
  """Extract the UTC start time from a segment filename, or None if unmatched."""
  match = _SEGMENT_NAME_RE.match(path.name)
  if not match:
    return None
  try:
    return datetime.strptime(path.name, '%Y%m%d_%H%M%S.mp4').replace(tzinfo=UTC)
  except ValueError:
    return None


class RecordingIndex:
  """Segment index over the shared aegis.db connection (caller owns the lock)."""

  def __init__(self, conn: sqlite3.Connection, lock, recordings_dir: Path):
    self._conn = conn
    self._lock = lock  # shared with EventDatabase — one writer regime
    self.recordings_dir = recordings_dir
    self._init_table()

  def _init_table(self) -> None:
    with self._lock:
      self._conn.execute("""
        CREATE TABLE IF NOT EXISTS recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            path TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            duration REAL NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0
        )
      """)
      self._conn.execute(
        'CREATE INDEX IF NOT EXISTS idx_recordings_cam_start ON recordings(camera_id, start_time)'
      )
      self._conn.commit()

  # ── Writes ─────────────────────────────────────────────

  def index_segment(self, camera_id: str, path: Path, start: datetime, end: datetime) -> None:
    """Insert (or refresh) one segment row. Replaces an existing row for the
    same camera+path so rotation re-indexing stays idempotent."""
    duration = (end - start).total_seconds()
    size = path.stat().st_size if path.exists() else 0
    with self._lock:
      self._conn.execute(
        'DELETE FROM recordings WHERE camera_id = ? AND path = ?',
        (camera_id, str(path)),
      )
      self._conn.execute(
        """INSERT INTO recordings (camera_id, path, start_time, end_time, duration, size_bytes)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (camera_id, str(path), start.isoformat(), end.isoformat(), duration, size),
      )
      self._conn.commit()

  def scan_directory(self, camera_id: str | None = None) -> int:
    """
    Backfill the index from the recordings directory. Start times come from
    filenames; end times from the next segment's start (or file mtime for the
    newest segment of each camera). Only inserts rows for paths not yet indexed
    (or whose size changed) — safe to run on every startup.

    Returns the number of segments indexed.
    """
    if not self.recordings_dir.exists():
      return 0

    cameras = (
      [d.name for d in sorted(self.recordings_dir.iterdir()) if d.is_dir()]
      if camera_id is None
      else [camera_id]
    )

    known = self._known_paths()
    indexed = 0
    for cam in cameras:
      cam_dir = self.recordings_dir / cam
      segments = []
      for f in sorted(cam_dir.glob('*.mp4')):
        start = parse_segment_start(f)
        if start is None:
          continue
        segments.append((f, start))

      for i, (path, start) in enumerate(segments):
        key = str(path)
        try:
          size = path.stat().st_size
        except OSError:
          size = 0
        if key in known and known[key] == size:
          continue  # already indexed, unchanged
        # End: next segment's start; for the newest file fall back to mtime
        if i + 1 < len(segments):
          end = segments[i + 1][1]
        else:
          try:
            mtime = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
          except OSError:
            mtime = start + timedelta(seconds=900)
          end = max(mtime, start + timedelta(seconds=1))
        self.index_segment(cam, path, start, end)
        indexed += 1
    return indexed

  def _known_paths(self) -> dict[str, int]:
    with self._lock:
      rows = self._conn.execute('SELECT path, size_bytes FROM recordings').fetchall()
      return {r['path']: r['size_bytes'] for r in rows}

  # ── Reads ──────────────────────────────────────────────

  def segments_between(self, camera_id: str, start: datetime, end: datetime) -> list[dict]:
    """Segments overlapping [start, end], oldest first."""
    with self._lock:
      rows = self._conn.execute(
        """SELECT * FROM recordings
           WHERE camera_id = ?
             AND start_time <= ?
             AND end_time >= ?
           ORDER BY start_time ASC""",
        (camera_id, end.isoformat(), start.isoformat()),
      ).fetchall()
      return [dict(r) for r in rows]

  def segment_covering(self, camera_id: str, ts: datetime) -> dict | None:
    """The segment whose [start, end] contains ts — used to resolve event playback."""
    with self._lock:
      row = self._conn.execute(
        """SELECT * FROM recordings
           WHERE camera_id = ? AND start_time <= ? AND end_time >= ?
           ORDER BY start_time DESC LIMIT 1""",
        (camera_id, ts.isoformat(), ts.isoformat()),
      ).fetchone()
      return dict(row) if row else None

  def days_with_recordings(self, camera_ids: list[str] | None = None) -> list[str]:
    """Distinct UTC dates (YYYY-MM-DD) that have any segment, sorted."""
    if camera_ids:
      placeholders = ','.join('?' * len(camera_ids))
      sql = (
        f'SELECT DISTINCT substr(start_time, 1, 10) AS day FROM recordings '
        f'WHERE camera_id IN ({placeholders}) ORDER BY day'
      )
      params: list = list(camera_ids)
    else:
      sql = 'SELECT DISTINCT substr(start_time, 1, 10) AS day FROM recordings ORDER BY day'
      params = []
    with self._lock:
      rows = self._conn.execute(sql, params).fetchall()
      return [r['day'] for r in rows]

  def delete_path(self, path: Path) -> None:
    """Drop the index row for one segment file (retention deleted it)."""
    with self._lock:
      self._conn.execute('DELETE FROM recordings WHERE path = ?', (str(path),))
      self._conn.commit()

  def delete_for_camera(self, camera_id: str) -> int:
    """Drop all index rows for a camera (call when purging its recordings)."""
    with self._lock:
      cursor = self._conn.execute('DELETE FROM recordings WHERE camera_id = ?', (camera_id,))
      self._conn.commit()
      return cursor.rowcount

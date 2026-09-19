"""
src/persons/store.py
─────────────────────
Person metadata in the shared aegis.db.

Architecture (per docs/scrypted-research.md §4 / plan v2 B6.2):
- Reference IMAGES stay on disk (data/known_faces/<name>/) — source of truth.
- Embeddings stay derived in RAM (recomputed at boot).
- The DB holds only METADATA: stable person ids, provenance, cover photo.

`events.person_id` is the stable link (added by B6.2 migration); events keep a
denormalized person_name for display, refreshed on rename so history never breaks.
"""

import sqlite3
from datetime import UTC, datetime
from pathlib import Path


def _utcnow_iso() -> str:
  return datetime.now(UTC).isoformat()


class PersonStore:
  """persons / person_images tables over the shared aegis.db connection."""

  def __init__(self, conn: sqlite3.Connection, lock, known_faces_dir: Path):
    self._conn = conn
    self._lock = lock
    self.known_faces_dir = Path(known_faces_dir)
    self._init_tables()

  def _init_tables(self) -> None:
    with self._lock:
      self._conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS persons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL,
            cover_image TEXT
        );
        CREATE TABLE IF NOT EXISTS person_images (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person_id INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
            path TEXT NOT NULL UNIQUE,
            source TEXT NOT NULL DEFAULT 'wizard',
            quality REAL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_person_images_person ON person_images(person_id);
        """
      )
      # events.person_id is migrated by EventDatabase itself (schema owner);
      # nothing to do here.
      self._conn.commit()

  # ── Backfill ────────────────────────────────────────────

  def backfill_from_directory(self) -> int:
    """
    Sync persons/person_images with data/known_faces/: create rows for
    directories/images not yet known. Idempotent — safe on every startup.
    Returns the number of image rows added.
    """
    if not self.known_faces_dir.exists():
      return 0
    added = 0
    for person_dir in sorted(self.known_faces_dir.iterdir()):
      if not person_dir.is_dir() or person_dir.name.startswith('.'):
        continue
      person_id = self.get_or_create(person_dir.name)
      known = self._known_image_paths()
      for img in sorted(list(person_dir.glob('*.jpg')) + list(person_dir.glob('*.png'))):
        if str(img) in known:
          continue
        self.add_image(person_id, img, source='wizard')
        added += 1
    return added

  def _known_image_paths(self) -> set[str]:
    with self._lock:
      rows = self._conn.execute('SELECT path FROM person_images').fetchall()
      return {r['path'] for r in rows}

  def backfill_event_links(self) -> int:
    """Attach person_id to events that carry a person_name but no link yet."""
    with self._lock:
      cursor = self._conn.execute(
        """UPDATE events
           SET person_id = (SELECT id FROM persons WHERE persons.name = events.person_name)
           WHERE person_id IS NULL AND person_name IS NOT NULL"""
      )
      self._conn.commit()
      return cursor.rowcount

  # ── Writes ──────────────────────────────────────────────

  def get_or_create(self, name: str) -> int:
    with self._lock:
      row = self._conn.execute(
        'SELECT id FROM persons WHERE name = ?', (name,)
      ).fetchone()
      if row:
        return row['id']
      cursor = self._conn.execute(
        'INSERT INTO persons (name, created_at) VALUES (?, ?)', (name, _utcnow_iso())
      )
      self._conn.commit()
      return cursor.lastrowid

  def add_image(self, person_id: int, path: Path, source: str = 'wizard',
                quality: float | None = None) -> None:
    with self._lock:
      self._conn.execute(
        """INSERT OR IGNORE INTO person_images (person_id, path, source, quality, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (person_id, str(path), source, quality, _utcnow_iso()),
      )
      self._conn.commit()

  def rename_person(self, person_id: int, new_name: str) -> bool:
    """
    Rename: persons row + the denormalized person_name on events (person_id
    links stay untouched) + person_images paths. Raises on name collision.
    """
    with self._lock:
      old_name = self._old_name(person_id)  # capture BEFORE the row update
      try:
        self._conn.execute('BEGIN')
        self._conn.execute('UPDATE persons SET name = ? WHERE id = ?', (new_name, person_id))
        self._conn.execute(
          'UPDATE events SET person_name = ? WHERE person_id = ?', (new_name, person_id)
        )
        self._conn.execute(
          'UPDATE person_images SET path = REPLACE(path, ?, ?) WHERE person_id = ?',
          (f'/{old_name}/', f'/{new_name}/', person_id),
        )
        self._conn.commit()
        return True
      except sqlite3.Error:
        self._conn.rollback()
        raise

  def _old_name(self, person_id: int) -> str:
    row = self._conn.execute('SELECT name FROM persons WHERE id = ?', (person_id,)).fetchone()
    return row['name'] if row else ''

  def delete_person(self, person_id: int) -> None:
    with self._lock:
      self._conn.execute('DELETE FROM persons WHERE id = ?', (person_id,))
      self._conn.commit()

  def set_cover(self, person_id: int, path: str) -> None:
    with self._lock:
      self._conn.execute(
        'UPDATE persons SET cover_image = ? WHERE id = ?', (path, person_id)
      )
      self._conn.commit()

  # ── Reads ───────────────────────────────────────────────

  def list_persons(self) -> list[dict]:
    with self._lock:
      rows = self._conn.execute(
        """SELECT p.id, p.name, p.created_at, p.cover_image,
                  COUNT(i.id) AS image_count,
                  MAX(i.created_at) AS last_image_at
           FROM persons p LEFT JOIN person_images i ON i.person_id = p.id
           GROUP BY p.id ORDER BY p.created_at DESC"""
      ).fetchall()
      return [dict(r) for r in rows]

  def get_person(self, *, person_id: int | None = None, name: str | None = None) -> dict | None:
    if person_id is None and name is None:
      return None
    with self._lock:
      if person_id is not None:
        row = self._conn.execute(
          'SELECT * FROM persons WHERE id = ?', (person_id,)
        ).fetchone()
      else:
        row = self._conn.execute(
          'SELECT * FROM persons WHERE name = ?', (name,)
        ).fetchone()
      return dict(row) if row else None

  def images_for(self, person_id: int) -> list[dict]:
    with self._lock:
      rows = self._conn.execute(
        'SELECT * FROM person_images WHERE person_id = ? ORDER BY created_at DESC',
        (person_id,),
      ).fetchall()
      return [dict(r) for r in rows]

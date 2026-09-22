"""Persistent UI-editable settings (Task R8).

data/settings.json is the source of truth for values the Settings UI can change
at runtime (alert provider + credentials, AI tuning). At boot it WINS over .env
(.env stays the bootstrap default for first run). SECRET_KEY and admin
credentials never live here. Writes are atomic (tmp + os.replace), same pattern
as save_cameras().
"""

import json
import os

from src.config import DATA_DIR

SETTINGS_FILE = DATA_DIR / 'settings.json'

PERSISTED_KEYS = ('active_alert', 'telegram_bot_token', 'telegram_chat_id', 'ntfy_topic')


def load_settings() -> dict:
  """Read persisted settings; missing/corrupt file → {} (never crash boot)."""
  try:
    raw = json.loads(SETTINGS_FILE.read_text())
  except (OSError, ValueError):
    return {}
  return raw if isinstance(raw, dict) else {}


def save_settings(settings: dict) -> None:
  """Atomically persist the settings snapshot."""
  SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
  tmp = SETTINGS_FILE.with_suffix('.json.tmp')
  tmp.write_text(json.dumps(settings, indent=2))
  os.replace(tmp, SETTINGS_FILE)

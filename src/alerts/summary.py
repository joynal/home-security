"""
src/alerts/summary.py
─────────────────────
Daily summary generation and delivery.
"""

import threading
import time
from datetime import UTC
from datetime import datetime
from datetime import timedelta

from src.events.database import EventDatabase


def generate_daily_summary(event_db: EventDatabase, hours: int = 24) -> str:
  """Generate a text summary of the last N hours (UTC timestamps in the DB)."""
  since = datetime.now(UTC) - timedelta(hours=hours)
  events = event_db.query(since=since, limit=10000)

  total = len(events)
  unknown = sum(1 for e in events if e['event_type'] == 'unknown_face')
  known = sum(1 for e in events if e['event_type'] == 'known_face')
  loitering = sum(1 for e in events if e['event_type'] == 'loitering')

  # Busiest camera
  camera_counts: dict[str, int] = {}
  for e in events:
    cam = e['camera_id']
    camera_counts[cam] = camera_counts.get(cam, 0) + 1
  busiest_cam = max(camera_counts, key=camera_counts.get) if camera_counts else 'None'

  # Busiest hour (computed from the UTC ISO strings)
  hour_counts: dict[int, int] = {}
  for e in events:
    try:
      hour = datetime.fromisoformat(e['timestamp']).hour
    except (ValueError, TypeError):
      continue
    hour_counts[hour] = hour_counts.get(hour, 0) + 1
  busiest_hour = max(hour_counts, key=hour_counts.get) if hour_counts else None

  # NOTE: no nested double quotes inside the f-string expressions — CPython
  # rejects them inside triple-quoted f-strings.
  today = datetime.now().strftime('%Y-%m-%d')
  busiest_count = camera_counts.get(busiest_cam, 0)
  summary = (
    f'📊 Aegis Vision — Daily Summary\n'
    f'━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    f'📅 {today} (last {hours}h)\n'
    f'\n'
    f'Total events: {total}\n'
    f'🔴 Unknown faces: {unknown}\n'
    f'🟢 Known entries: {known}\n'
    f'⏳ Loitering alerts: {loitering}\n'
    f'📷 Busiest camera: {busiest_cam} ({busiest_count} events)'
  )
  if busiest_hour is not None:
    hour_count = hour_counts[busiest_hour]
    summary += f'\n🕐 Busiest hour (UTC): {busiest_hour:02d}:00 ({hour_count} events)'
  return summary


def start_daily_summary_scheduler(
  event_db: EventDatabase,
  send_func,
  hour: int = 8,
  minute: int = 0,
) -> threading.Thread:
  """
  Start a daemon thread that sends the summary once per day at hour:minute local.
  send_func(summary_text) delivers it (alert manager's text path or print).
  """

  def _run() -> None:
    while True:
      now = datetime.now()
      next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
      if next_run <= now:
        next_run += timedelta(days=1)
      wait_seconds = (next_run - now).total_seconds()
      time.sleep(wait_seconds)
      try:
        send_func(generate_daily_summary(event_db))
      except Exception as exc:  # never kill the scheduler
        print(f'[Summary] Failed to send daily summary: {exc}')

  t = threading.Thread(target=_run, daemon=True, name='daily-summary')
  t.start()
  return t

"""
src/detection/behaviors.py
──────────────────────────
Behavioral detection: loitering, zone entry/exit.
"""

import time


class LoiteringDetector:
  """Detect persons staying in a zone beyond a time threshold."""

  def __init__(self, threshold_seconds: float = 120.0):
    self.threshold = threshold_seconds
    # track_id → {"first_seen": float, "zone": str, "alerted": bool}
    self.presence: dict[int, dict] = {}

  def update(self, track_id: int, zone_name: str | None, is_known: bool) -> bool:
    """
    Update presence tracking. Returns True if loitering alert should fire.
    Known persons don't trigger loitering alerts.
    """
    if is_known or zone_name is None:
      # Known person or not in a zone — remove from tracking
      self.presence.pop(track_id, None)
      return False

    if track_id not in self.presence:
      self.presence[track_id] = {
        'first_seen': time.time(),
        'zone': zone_name,
        'alerted': False,
      }
      return False

    entry = self.presence[track_id]
    elapsed = time.time() - entry['first_seen']

    if elapsed > self.threshold and not entry['alerted']:
      entry['alerted'] = True
      return True  # Fire loitering alert

    return False

  def cleanup(self, active_track_ids: set[int]):
    """Remove entries for tracks that no longer exist."""
    stale = [tid for tid in self.presence if tid not in active_track_ids]
    for tid in stale:
      del self.presence[tid]

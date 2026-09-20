import time
from abc import ABC
from abc import abstractmethod

import numpy as np


class AlertManager(ABC):
  """
  Base class for alert managers with per-person cooldown tracking.

  A cooldown keyed by person_key means two DIFFERENT unknown people each
  get their own alert window — one person's alert no longer suppresses
  another's (the old global-cooldown bug).
  """

  def __init__(self, cooldown_seconds: float = 5.0):
    self.cooldown_seconds = cooldown_seconds
    self._cooldowns: dict[str, float] = {}  # person_key → last_alert_time

  def _within_cooldown(self, person_key: str | None) -> bool:
    """True if this person is still inside the cooldown window (and should be skipped)."""
    key = person_key or '__global__'
    now = time.time()
    if (now - self._cooldowns.get(key, 0.0)) < self.cooldown_seconds:
      return True
    self._cooldowns[key] = now
    return False

  @abstractmethod
  def send_alert(self, message: str, image_frame: np.ndarray = None, person_key: str | None = None):
    """Send an alert. person_key enables per-person cooldown tracking."""
    pass

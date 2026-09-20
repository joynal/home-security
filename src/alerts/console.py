import time

import numpy as np

from src.alerts.base import AlertManager


class ConsoleAlert(AlertManager):
  def __init__(self, cooldown_seconds: float = 5):
    super().__init__(cooldown_seconds=cooldown_seconds)

  def send_alert(self, message: str, image_frame: np.ndarray = None, person_key: str | None = None):
    if self._within_cooldown(person_key):
      return
    print(f'\n[🚨 ALERT | {time.strftime("%H:%M:%S")}] {message}' + _suffix(person_key))
    if image_frame is not None:
      print(f' -> (Image of shape {image_frame.shape} attached)')


def _suffix(person_key: str | None) -> str:
  return f' [{person_key}]' if person_key else ''

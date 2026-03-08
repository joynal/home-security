import time

import numpy as np

from src.alerts.base import AlertManager


class ConsoleAlert(AlertManager):
    def __init__(self, cooldown_seconds: int = 5):
        self.cooldown_seconds = cooldown_seconds
        self.last_alert_time = 0

    def send_alert(self, message: str, image_frame: np.ndarray = None):
        current_time = time.time()
        if (current_time - self.last_alert_time) > self.cooldown_seconds:
            print(f"\n[🚨 ALERT | {time.strftime('%H:%M:%S')}] {message}")
            if image_frame is not None:
                print(f" -> (Image of shape {image_frame.shape} attached)")
            self.last_alert_time = current_time

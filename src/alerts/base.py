from abc import ABC, abstractmethod

import numpy as np


class AlertManager(ABC):
    @abstractmethod
    def send_alert(self, message: str, image_frame: np.ndarray = None):
        """Send an alert with an optional image frame."""
        pass

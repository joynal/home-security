from abc import ABC, abstractmethod

import numpy as np


class CameraSource(ABC):
    @abstractmethod
    def start(self):
        """Initialize the camera feed."""
        pass

    @abstractmethod
    def get_frame(self) -> np.ndarray:
        """Fetch the latest frame as a numpy array."""
        pass

    @abstractmethod
    def stop(self):
        """Release the camera resources."""
        pass

import threading
import time

import numpy as np

from src.camera.base import CameraSource


class CameraStreamWrapper:
    """
    Wraps any CameraSource to read frames in a background thread.
    This prevents slow network cameras (like RTSP Tapos) from blocking
    the main OpenCV display loop and dropping historical frames.
    """

    def __init__(self, camera: CameraSource, name: str):
        self.camera = camera
        self.name = name
        self.latest_frame = None
        self.is_running = False
        self._thread = None
        self._lock = threading.Lock()

    def start(self):
        self.camera.start()
        self.is_running = True
        self._thread = threading.Thread(
            target=self._update, daemon=True, name=f"CameraThread-{self.name}"
        )
        self._thread.start()

    def _update(self):
        while self.is_running:
            frame = self.camera.get_frame()
            if frame is not None:
                # Lock and update the absolute latest frame (dropping old frames)
                with self._lock:
                    self.latest_frame = frame.copy()
            else:
                # Give CPU a tiny rest if camera failed to yield frame
                time.sleep(0.01)

    def get_latest_frame(self) -> np.ndarray:
        with self._lock:
            # Return a copy to prevent race conditions during OpenCV drawing
            return self.latest_frame.copy() if self.latest_frame is not None else None

    def stop(self):
        self.is_running = False
        if self._thread:
            self._thread.join()
        self.camera.stop()

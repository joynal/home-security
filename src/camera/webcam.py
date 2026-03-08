import cv2
import numpy as np

from src.camera.base import CameraSource


class MacbookWebcam(CameraSource):
    def __init__(self, camera_index=0):
        self.camera_index = camera_index
        self.cap = None

    def start(self):
        self.cap = cv2.VideoCapture(self.camera_index)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open webcam on index {self.camera_index}")

    def get_frame(self) -> np.ndarray:
        if self.cap is None:
            raise RuntimeError("Camera not started.")
        ret, frame = self.cap.read()
        if not ret:
            print("Warning: Failed to read frame from webcam.")
            return None
        return frame

    def stop(self):
        if self.cap:
            self.cap.release()
            self.cap = None

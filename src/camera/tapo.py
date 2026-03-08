# Stub for Tapo C210 Camera using RTSP
# You will need to configure the camera in the Tapo App to enable Camera Account (username/password)
import cv2
import numpy as np

from src.camera.base import CameraSource


class TapoCamera(CameraSource):
    def __init__(self, username, password, ip_address, port=554, stream=1):
        # Default RTSP URL format for Tapo
        self.rtsp_url = f"rtsp://{username}:{password}@{ip_address}:{port}/stream{stream}"
        self.cap = None

    def start(self):
        self.cap = cv2.VideoCapture(self.rtsp_url)
        if not self.cap.isOpened():
            raise RuntimeError(f"Could not open Tapo stream at {self.rtsp_url}")

    def get_frame(self) -> np.ndarray:
        if self.cap is None:
            raise RuntimeError("Camera not started.")
        ret, frame = self.cap.read()
        return frame if ret else None

    def stop(self):
        if self.cap:
            self.cap.release()
            self.cap = None

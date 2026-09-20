"""
src/camera/video_file.py
───────────────────────
Looping video-file camera source — dev/testing stand-in for a real camera.

Lets the full pipeline (inference, MJPEG feeds, detection, events, recording)
run end-to-end without hardware: point a "file"-type camera at any MP4 and it
loops forever. Generate a synthetic clip with scripts/make_test_video.py.
"""

import time

import cv2
import numpy as np

from src.camera.base import CameraSource


class VideoFileCamera(CameraSource):
  """Reads a video file in a loop, pacing playback to the file's native FPS."""

  def __init__(self, path: str, realtime: bool = True):
    self.path = path
    self.realtime = realtime  # Pace reads to native FPS (False = as fast as possible)
    self.cap = None
    self._delay = 0.0

  def start(self):
    self.cap = cv2.VideoCapture(self.path)
    if not self.cap.isOpened():
      raise RuntimeError(f'Could not open video file: {self.path}')
    fps = self.cap.get(cv2.CAP_PROP_FPS)
    self._delay = 1.0 / fps if fps and fps > 0 and self.realtime else 0.0

  def get_frame(self) -> np.ndarray | None:
    if self.cap is None:
      raise RuntimeError('Camera not started.')
    ret, frame = self.cap.read()
    if not ret:
      # End of file — loop back to the start
      self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
      ret, frame = self.cap.read()
      if not ret:
        return None
    if self._delay:
      time.sleep(self._delay)
    return frame

  def stop(self):
    if self.cap:
      self.cap.release()
      self.cap = None

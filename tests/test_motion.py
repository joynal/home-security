"""Motion detector tests — synthetic numpy frames, no camera needed."""

import numpy as np

from src.detection.motion import MotionDetector


def _static_frame(w=640, h=360) -> np.ndarray:
  return np.full((h, w, 3), 40, dtype=np.uint8)


def _frame_with_moving_box(x: int, w=640, h=360) -> np.ndarray:
  frame = _static_frame(w, h)
  frame[100:220, x : x + 120] = 230  # bright 120x120 box — way over min_area
  return frame


def test_static_scene_has_no_motion():
  det = MotionDetector(threshold=25, min_area=500)
  for _ in range(10):  # let the background model settle
    det.detect(_static_frame())
  assert det.detect(_static_frame()) == []


def test_moving_box_detected():
  det = MotionDetector(threshold=25, min_area=500)
  for x in (50, 200, 350, 500):  # box walks across the frame
    det.detect(_frame_with_moving_box(x))
  regions = det.detect(_frame_with_moving_box(650 - 130))
  assert len(regions) >= 1
  x, y, w, h = regions[0]
  assert w * h > 500  # bounding box over min area
  assert 80 <= x <= 640 and 80 <= y <= 220  # roughly where the box moved


def test_has_motion_boolean():
  det = MotionDetector(threshold=25, min_area=500)
  for x in (50, 200, 350):
    det.detect(_frame_with_moving_box(x))
  assert det.has_motion(_frame_with_moving_box(500)) is True


def test_tiny_changes_below_min_area_ignored():
  det = MotionDetector(threshold=25, min_area=500)
  for _ in range(10):
    det.detect(_static_frame())
  frame = _static_frame()
  frame[10:14, 10:14] = 255  # 4x4 speck — far below min_area
  assert det.detect(frame) == []

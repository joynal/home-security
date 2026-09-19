"""Person detector tests — uses ultralytics' bundled bus.jpg (real people)."""

from pathlib import Path

import cv2
import numpy as np
import ultralytics

from src.detection.person import PersonDetector

BUS_JPG = Path(ultralytics.__file__).parent / 'assets' / 'bus.jpg'


def _detector() -> PersonDetector:
  return PersonDetector(model_path='yolov8n.pt', confidence=0.4)


def test_detects_persons_in_bus_image():
  frame = cv2.imread(str(BUS_JPG))
  assert frame is not None, 'bus.jpg not readable'
  detections = _detector().detect(frame)
  assert len(detections) >= 3, f'expected several people, got {len(detections)}'
  for det in detections:
    x1, y1, x2, y2 = det['bbox']
    assert 0 <= x1 < x2 <= frame.shape[1]
    assert 0 <= y1 < y2 <= frame.shape[0]
    assert 0.4 <= det['confidence'] <= 1.0


def test_blank_frame_no_persons():
  blank = np.zeros((360, 640, 3), dtype=np.uint8)
  assert _detector().detect(blank) == []


def test_supervision_format_has_person_class():
  frame = cv2.imread(str(BUS_JPG))
  dets = _detector().detect_as_supervision(frame)
  assert len(dets) >= 3
  assert set(dets.class_id.tolist()) == {0}  # only COCO class 0 = person
  assert dets.tracker_id is None  # not yet tracked

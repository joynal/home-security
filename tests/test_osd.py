from datetime import datetime

import numpy as np

from src.camera.osd import draw_timestamp_osd


def test_draw_timestamp_osd_standard_frame():
  # 640x480 black frame
  frame = np.zeros((480, 640, 3), dtype=np.uint8)
  dt = datetime(2026, 9, 21, 14, 30, 15)
  result = draw_timestamp_osd(frame, 'Front Door', dt=dt)

  assert result.shape == (480, 640, 3)
  assert result.dtype == np.uint8
  # Frame was modified (contains non-zero text and border pixels)
  assert np.any(result > 0)


def test_draw_timestamp_osd_layout_positioning():
  # Ensure two-line OSD is strictly rendered in top-left
  frame = np.zeros((480, 640, 3), dtype=np.uint8)
  dt = datetime(2026, 9, 21, 14, 30, 15)
  result = draw_timestamp_osd(frame, 'Front Door', dt=dt)

  # Top-left region contains both lines of the rendered OSD (timestamp + camera name)
  assert np.any(result[10:80, 10:280] > 0)
  # Lower section of the frame remains untouched
  assert np.all(result[300:450, 10:630] == 0)


def test_draw_timestamp_osd_bright_frame():
  # 640x480 pure white frame (simulating bright sunlight)
  frame = np.full((480, 640, 3), 255, dtype=np.uint8)
  dt = datetime(2026, 9, 21, 14, 30, 15)
  result = draw_timestamp_osd(frame, 'Driveway', dt=dt)

  assert result.shape == (480, 640, 3)
  # The black drop shadow / outline has darkened pixels (less than 255)
  assert np.any(result < 255)


def test_draw_timestamp_osd_small_frame():
  # Tiny frame (e.g. 50x50) should not crash
  frame = np.zeros((50, 50, 3), dtype=np.uint8)
  result = draw_timestamp_osd(frame, 'Very Long Camera Name That Exceeds Width')
  assert result.shape == (50, 50, 3)


def test_draw_timestamp_osd_empty_or_none():
  assert draw_timestamp_osd(None, 'Cam') is None
  empty = np.array([])
  assert draw_timestamp_osd(empty, 'Cam').size == 0


def test_draw_timestamp_osd_high_resolution():
  # 1920x1080 frame scaling check
  frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
  dt = datetime(2026, 9, 21, 14, 30, 15)
  result = draw_timestamp_osd(frame, 'Driveway 4K', dt=dt)
  assert result.shape == (1080, 1920, 3)
  assert np.any(result > 0)

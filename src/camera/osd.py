"""
src/camera/osd.py
─────────────────
Forensic On-Screen Display (OSD) for camera frames.
Renders two lines in the top-left corner:
  YYYY-MM-DD HH:MM:SS
  Camera Name

Features:
- No black background pill/box for clean, unobtrusive surveillance styling
- Monospaced font so numbers don't jump or jitter as seconds change
- 1px dark drop-shadow/halo around text for 100% legibility over any background
- Resolution-aware proportional scaling
"""

import os
from datetime import datetime

import cv2
import numpy as np
from PIL import Image
from PIL import ImageDraw
from PIL import ImageFont

# Candidate monospaced fonts in priority order
_MONO_FONT_CANDIDATES = [
  # macOS
  '/System/Library/Fonts/Menlo.ttc',
  '/System/Library/Fonts/SFNSMono.ttf',
  '/System/Library/Fonts/Monaco.ttf',
  '/System/Library/Fonts/Supplemental/Courier New.ttf',
  '/Library/Fonts/Courier New.ttf',
  # Linux (Debian, Ubuntu, Fedora, Alpine)
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
  '/usr/share/fonts/truetype/freefont/FreeMonoBold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeMono.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
]

_SYSTEM_MONO_PATH: str | None = next((p for p in _MONO_FONT_CANDIDATES if os.path.exists(p)), None)
_FONT_CACHE: dict[int, ImageFont.FreeTypeFont] = {}


def _get_mono_font(size: int) -> ImageFont.FreeTypeFont:
  """Retrieve or instantiate a cached monospaced font at the specified size."""
  if size not in _FONT_CACHE:
    if _SYSTEM_MONO_PATH:
      try:
        _FONT_CACHE[size] = ImageFont.truetype(_SYSTEM_MONO_PATH, size)
      except Exception:
        _FONT_CACHE[size] = ImageFont.load_default(size=size)
    else:
      _FONT_CACHE[size] = ImageFont.load_default(size=size)
  return _FONT_CACHE[size]


def draw_timestamp_osd(
  frame: np.ndarray,
  camera_name: str,
  dt: datetime | None = None,
) -> np.ndarray:
  """
  Renders two lines in the top-left corner:
    YYYY-MM-DD HH:MM:SS
    Camera Name

  Uses a monospaced font with no background pill box and a tight black shadow
  for sharp, crisp legibility across all scene lighting conditions.
  """
  if frame is None or frame.size == 0 or len(frame.shape) < 2:
    return frame

  if dt is None:
    dt = datetime.now()

  time_str = dt.strftime('%Y-%m-%d %H:%M:%S')
  frame_h, frame_w = frame.shape[:2]

  # Guard against degenerate tiny frames
  if frame_w < 50 or frame_h < 30:
    return frame

  # Proportional resolution scaling (anchored to 640x360)
  scale = max(1.0, min(frame_w / 640.0, frame_h / 360.0))
  font_size = max(12, round(16 * scale))
  tl_x = round(14 * scale)
  tl_y = round(12 * scale)
  line_gap = round(4 * scale)

  try:
    font = _get_mono_font(font_size)
    img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img)

    # Line 1: Timestamp (top-left)
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (1, 1)]:
      draw.text((tl_x + dx, tl_y + dy), time_str, font=font, fill=(0, 0, 0))
    draw.text((tl_x, tl_y), time_str, font=font, fill=(255, 255, 255))

    # Line 2: Camera Name (directly below timestamp)
    if camera_name:
      bbox = font.getbbox(time_str)
      line_h = bbox[3] - bbox[1]
      cam_y = tl_y + line_h + line_gap

      for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (1, 1)]:
        draw.text((tl_x + dx, cam_y + dy), camera_name, font=font, fill=(0, 0, 0))
      draw.text((tl_x, cam_y), camera_name, font=font, fill=(255, 255, 255))

    frame[:] = cv2.cvtColor(np.asarray(img), cv2.COLOR_RGB2BGR)

  except Exception:
    # High-reliability fallback to OpenCV monospaced plain font
    font_scale = 1.2 * scale
    cv2.putText(
      frame,
      time_str,
      (tl_x + 1, tl_y + 15),
      cv2.FONT_HERSHEY_PLAIN,
      font_scale,
      (0, 0, 0),
      1,
      cv2.LINE_4,
    )
    cv2.putText(
      frame,
      time_str,
      (tl_x, tl_y + 14),
      cv2.FONT_HERSHEY_PLAIN,
      font_scale,
      (255, 255, 255),
      1,
      cv2.LINE_4,
    )
    if camera_name:
      cv2.putText(
        frame,
        camera_name,
        (tl_x + 1, tl_y + 35),
        cv2.FONT_HERSHEY_PLAIN,
        font_scale,
        (0, 0, 0),
        1,
        cv2.LINE_4,
      )
      cv2.putText(
        frame,
        camera_name,
        (tl_x, tl_y + 34),
        cv2.FONT_HERSHEY_PLAIN,
        font_scale,
        (255, 255, 255),
        1,
        cv2.LINE_4,
      )

  return frame

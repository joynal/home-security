"""
src/camera/osd.py
─────────────────
Forensic On-Screen Display (OSD) for camera frames.
Renders 'Camera Name  |  YYYY-MM-DD HH:MM:SS' in the top-right corner with a
semi-transparent dark pill background for 100% legibility in all lighting conditions.
"""

from datetime import datetime

import cv2
import numpy as np


def draw_timestamp_osd(
  frame: np.ndarray,
  camera_name: str,
  dt: datetime | None = None,
) -> np.ndarray:
  """
  Renders 'Camera Name  |  YYYY-MM-DD HH:MM:SS' in the top-right corner.

  Uses a dark translucent pill background (alpha blend) with a subtle border
  and crisp anti-aliased white text.
  """
  if frame is None or frame.size == 0 or len(frame.shape) < 2:
    return frame

  if dt is None:
    dt = datetime.now()

  time_str = dt.strftime('%Y-%m-%d %H:%M:%S')
  text = f'{camera_name}  |  {time_str}'

  font = cv2.FONT_HERSHEY_SIMPLEX
  font_scale = 0.52
  thickness = 1

  (text_w, text_h), baseline = cv2.getTextSize(text, font, font_scale, thickness)

  pad_x = 10
  pad_y = 6
  margin_top = 10
  margin_right = 12

  pill_w = text_w + (pad_x * 2)
  pill_h = text_h + baseline + (pad_y * 2)

  frame_h, frame_w = frame.shape[:2]

  # Ensure coordinates stay within frame bounds
  x2 = frame_w - margin_right
  x1 = max(0, x2 - pill_w)
  y1 = margin_top
  y2 = min(frame_h, y1 + pill_h)

  # If frame is too small for overlay, clamp or return
  if x2 <= x1 or y2 <= y1:
    return frame

  # Extract Region of Interest for translucent background pill
  roi = frame[y1:y2, x1:x2]
  overlay = np.zeros_like(roi, dtype=np.uint8)

  # 65% dark overlay + 35% original scene
  blended = cv2.addWeighted(roi, 0.35, overlay, 0.65, 0)
  frame[y1:y2, x1:x2] = blended

  # Subtle 1px zinc border around pill
  cv2.rectangle(frame, (x1, y1), (x2 - 1, y2 - 1), (63, 63, 70), 1)

  # Text origin (bottom-left of baseline)
  text_x = x1 + pad_x
  text_y = y1 + pad_y + text_h

  # Crisp anti-aliased text
  cv2.putText(
    frame,
    text,
    (text_x, text_y),
    font,
    font_scale,
    (245, 245, 245),
    thickness,
    lineType=cv2.LINE_AA,
  )

  return frame

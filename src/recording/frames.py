"""
src/recording/frames.py
──────────────────────
Frame extraction from recorded segments — OpenCV-only (no ffmpeg binary),
used by the timeline's hover previews (GET /recordings/{cam}/frame.jpg?ts=).
Results are cached on disk; the cache key pins segment path + second-resolution
timestamp, so clock-aligned filenames make stale entries near-impossible.
"""

import hashlib
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np

from src.config import THUMBNAILS_DIR

FRAME_CACHE_DIR = THUMBNAILS_DIR / 'frames'
JPEG_QUALITY = 80


def _cache_path(segment_path: str, ts: float) -> Path:
  key = hashlib.sha256(f'{segment_path}@{int(ts)}'.encode()).hexdigest()[:24]
  return FRAME_CACHE_DIR / f'{key}.jpg'


def extract_frame(segment_path: Path, offset_seconds: float) -> np.ndarray | None:
  """Read one decoded frame at offset_seconds into the segment, or None."""
  cap = cv2.VideoCapture(str(segment_path))
  try:
    if not cap.isOpened():
      return None
    # POS_MSEC seek lands near the requested time (keyframe granularity) —
    # more than precise enough for hover previews.
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0.0, offset_seconds) * 1000.0)
    ret, frame = cap.read()
    return frame if ret else None
  finally:
    cap.release()


def get_cached_frame(segment_path: Path, ts_epoch: float, segment_start: datetime) -> Path | None:
  """
  Frame for an absolute UTC epoch timestamp inside the given segment.
  Returns a JPEG path (freshly written or cache hit), or None on failure.
  """
  offset = ts_epoch - segment_start.timestamp()
  if offset < 0:
    return None

  cache_file = _cache_path(str(segment_path), ts_epoch)
  if cache_file.exists():
    return cache_file

  frame = extract_frame(segment_path, offset)
  if frame is None:
    return None

  cache_file.parent.mkdir(parents=True, exist_ok=True)
  cv2.imwrite(str(cache_file), frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
  return cache_file


def epoch_to_datetime(ts: float) -> datetime:
  return datetime.fromtimestamp(ts, tz=UTC)

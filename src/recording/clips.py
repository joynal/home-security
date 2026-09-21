"""
src/recording/clips.py
──────────────────────
Event-clip extraction via ffmpeg stream copy (zero re-encode).
GET /recordings/{cam}/clip.mp4?start=&end=&padding= — powers "play event with
lead-in" and share/export. Clips are cached by segment+offsets.
"""

import hashlib
import subprocess
from datetime import UTC
from datetime import datetime
from pathlib import Path

from src.config import THUMBNAILS_DIR

CLIP_CACHE_DIR = THUMBNAILS_DIR / 'clips'
FFMPEG_TIMEOUT_S = 30.0


def ffmpeg_available() -> bool:
  try:
    subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5, check=False)
    return True
  except (FileNotFoundError, subprocess.TimeoutExpired):
    return False


def _cache_path(segment_path: str, start: float, end: float) -> Path:
  key = hashlib.sha256(f'{segment_path}@{start:.1f}-{end:.1f}'.encode()).hexdigest()[:24]
  return CLIP_CACHE_DIR / f'{key}.mp4'


def extract_clip(segment_path: Path, start_offset: float, end_offset: float) -> Path | None:
  """
  Cut [start_offset, end_offset] seconds out of one segment with stream copy.
  Returns the cached clip path, or None if ffmpeg failed/missing.
  """
  cache_file = _cache_path(str(segment_path), start_offset, end_offset)
  if cache_file.exists():
    return cache_file

  cache_file.parent.mkdir(parents=True, exist_ok=True)
  cmd = [
    'ffmpeg',
    '-hide_banner',
    '-loglevel',
    'error',
    # -ss before -i = fast seek to keyframe; stream copy, no re-encode
    '-ss',
    f'{max(0.0, start_offset):.3f}',
    '-to',
    f'{max(start_offset + 0.5, end_offset):.3f}',
    '-i',
    str(segment_path),
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    '-y',
    str(cache_file),
  ]
  try:
    result = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_TIMEOUT_S)
    if result.returncode != 0 or not cache_file.exists() or cache_file.stat().st_size == 0:
      cache_file.unlink(missing_ok=True)
      return None
  except (FileNotFoundError, subprocess.TimeoutExpired):
    cache_file.unlink(missing_ok=True)
    return None
  return cache_file


def resolve_clip_range(
  camera_id: str, start_epoch: float, end_epoch: float, padding: float, index
) -> tuple[Path, float, float] | None:
  """
  Map an absolute [start,end] epoch range onto a covering segment.
  Returns (segment_path, clip_start_offset, clip_end_offset) with padding
  applied, clamped to the segment — or None if nothing covers the start.
  """
  seg = index.segment_covering(camera_id, datetime.fromtimestamp(start_epoch, tz=UTC))
  if seg is None:
    return None
  seg_path = Path(seg['path'])
  if not seg_path.exists():
    return None
  seg_start = datetime.fromisoformat(seg['start_time']).timestamp()
  seg_end = datetime.fromisoformat(seg['end_time']).timestamp()

  clip_start = max(0.0, start_epoch - padding - seg_start)
  clip_end = min(seg_end - seg_start, end_epoch + padding - seg_start)
  if clip_end - clip_start < 0.5:
    clip_end = min(seg_end - seg_start, clip_start + 0.5)
  return seg_path, clip_start, clip_end

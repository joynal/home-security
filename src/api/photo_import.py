"""
src/api/photo_import.py
───────────────────────
Enroll people from existing photos (phone gallery, profile pics).

Pipeline per image: EXIF-orientation transpose (PIL) → downscale to ≤1280px →
request-response enrollment job (quality gates + embedding on the inference
thread) → on success, save an EXIF-free FACE CROP as a reference image.
Re-encoding through OpenCV strips EXIF by construction — imported photos never
carry their original GPS/camera metadata into data/known_faces/.
"""

import io
from datetime import UTC
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from PIL import ImageOps

MAX_DIMENSION = 1280
CROP_PAD_FRACTION = 0.25  # context around the face, relative to face size
JPEG_QUALITY = 92


def load_photo_for_enrollment(raw: bytes) -> np.ndarray | None:
  """Decode an uploaded photo into a BGR frame: EXIF-transposed + downscaled."""
  try:
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img)  # iPhone photos carry orientation flags
    img = img.convert('RGB')
  except Exception:
    return None

  w, h = img.size
  longest = max(w, h)
  if longest > MAX_DIMENSION:
    scale = MAX_DIMENSION / longest
    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

  # PIL RGB → OpenCV BGR
  return np.asarray(img)[:, :, ::-1].copy()


def crop_face(frame: np.ndarray, bbox: list[float]) -> np.ndarray:
  """Crop the detected face with proportional padding, clamped to the frame."""
  left, top, right, bottom = [int(v) for v in bbox]
  fw, fh = right - left, bottom - top
  pad_x = int(fw * CROP_PAD_FRACTION)
  pad_y = int(fh * CROP_PAD_FRACTION)
  x1 = max(0, left - pad_x)
  y1 = max(0, top - pad_y)
  x2 = min(frame.shape[1], right + pad_x)
  y2 = min(frame.shape[0], bottom + pad_y)
  return frame[y1:y2, x1:x2]


def save_reference_crop(faces_dir: Path, name: str, crop: np.ndarray) -> Path:
  """Persist the crop as a plain JPEG (no EXIF — cv2 never writes it)."""
  person_dir = faces_dir / name
  person_dir.mkdir(parents=True, exist_ok=True)
  ts = datetime.now(UTC).strftime('%Y%m%d_%H%M%S_%f')
  path = person_dir / f'import_{ts}.jpg'
  cv2.imwrite(str(path), crop, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
  return path

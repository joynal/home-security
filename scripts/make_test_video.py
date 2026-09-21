#!/usr/bin/env python3
"""
scripts/make_test_video.py
──────────────────────────
Generates synthetic and realistic simulation test clips for hardware-free camera testing.

Outputs:
  - data/test_clip.mp4: drifting square with crude face pattern and timer
  - data/test_people.mp4: realistic scene with multiple real persons from ultralytics assets

Usage:
    uv run scripts/make_test_video.py [output_path] [seconds] [--people]
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def make_synthetic_clip(out: Path, seconds: float = 10, fps: int = 15) -> None:
  w, h = 640, 360
  out.parent.mkdir(parents=True, exist_ok=True)
  writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
  if not writer.isOpened():
    raise SystemExit(f'Could not open VideoWriter for {out}')

  n_frames = int(seconds * fps)
  for i in range(n_frames):
    frame = np.full((h, w, 3), 25, dtype=np.uint8)  # dark background
    # Drifting square with a crude face pattern
    x = 40 + int((w - 120) * (0.5 + 0.5 * np.sin(2 * np.pi * i / n_frames)))
    y = h // 2 - 50
    cv2.rectangle(frame, (x, y), (x + 100, y + 100), (220, 220, 220), -1)
    cv2.circle(frame, (x + 30, y + 35), 8, (30, 30, 30), -1)  # eye
    cv2.circle(frame, (x + 70, y + 35), 8, (30, 30, 30), -1)  # eye
    cv2.ellipse(frame, (x + 50, y + 70), (25, 12), 0, 0, 180, (30, 30, 30), -1)  # mouth
    cv2.putText(
      frame, f't={i / fps:.1f}s', (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2
    )
    writer.write(frame)

  writer.release()
  print(f'Wrote {n_frames} frames ({seconds}s @ {fps}fps) to {out}')


def make_people_clip(out: Path, seconds: float = 10, fps: int = 10) -> None:
  import ultralytics

  bus_path = Path(ultralytics.__file__).parent / 'assets' / 'bus.jpg'
  if not bus_path.exists():
    make_synthetic_clip(out, seconds, fps)
    return

  img = cv2.imread(str(bus_path))
  if img is None:
    make_synthetic_clip(out, seconds, fps)
    return

  w, h = 640, 360
  out.parent.mkdir(parents=True, exist_ok=True)
  writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*'mp4v'), fps, (w, h))
  if not writer.isOpened():
    raise SystemExit(f'Could not open VideoWriter for {out}')

  scale = 800 / img.shape[1]
  scaled = cv2.resize(img, (800, int(img.shape[0] * scale)))
  crop_h = 450
  y_start = 250
  people_strip = scaled[y_start : y_start + crop_h, :]
  people_strip = cv2.resize(people_strip, (800, 360))

  n_frames = int(seconds * fps)
  max_offset = 800 - 640
  for i in range(n_frames):
    t = i / n_frames
    offset = int(max_offset * 0.5 * (1 + np.sin(2 * np.pi * t)))
    frame = people_strip[:, offset : offset + 640].copy()
    cv2.putText(
      frame,
      f'SIMULATED CAM | {i / fps:.1f}s',
      (10, 25),
      cv2.FONT_HERSHEY_SIMPLEX,
      0.6,
      (0, 255, 255),
      2,
    )
    writer.write(frame)

  writer.release()
  print(f'Wrote {n_frames} frames ({seconds}s @ {fps}fps) with real people to {out}')


def main() -> None:
  args = [a for a in sys.argv[1:] if not a.startswith('--')]
  is_people = '--people' in sys.argv

  out = Path(
    args[0] if len(args) > 0 else ('data/test_people.mp4' if is_people else 'data/test_clip.mp4')
  )
  seconds = float(args[1] if len(args) > 1 else 10)

  if is_people:
    make_people_clip(out, seconds)
  else:
    make_synthetic_clip(out, seconds)


if __name__ == '__main__':
  main()

#!/usr/bin/env python3
"""
scripts/make_test_video.py
──────────────────────────
Generates a synthetic test clip for hardware-free verification.

The clip contains a white square drifting across a dark background — enough
motion for the motion detector, and the loop never "ends" for the
VideoFileCamera. Optionally draws a crude face-like pattern (two dark eyes,
mouth) so it registers as *something* on camera, though not a real face.

Usage:
    uv run scripts/make_test_video.py [output_path] [seconds]
"""

import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "data/test_clip.mp4")
    seconds = float(sys.argv[2] if len(sys.argv) > 2 else 10)
    fps = 15
    w, h = 640, 360

    out.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        raise SystemExit(f"Could not open VideoWriter for {out}")

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
            frame, f"t={i / fps:.1f}s", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2
        )
        writer.write(frame)

    writer.release()
    print(f"Wrote {n_frames} frames ({seconds}s @ {fps}fps) to {out}")


if __name__ == "__main__":
    main()

"""
src/detection/motion.py
───────────────────────
Lightweight motion detection using background subtraction.
Runs on CPU in <1ms per frame — the first gate of the cascading pipeline.
"""

import cv2
import numpy as np


class MotionDetector:
    """Background subtraction-based motion detector."""

    def __init__(self, threshold: int = 25, min_area: int = 500, history: int = 500):
        self.bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=history, varThreshold=threshold, detectShadows=False
        )
        self.min_area = min_area

    def detect(self, frame: np.ndarray) -> list[tuple[int, int, int, int]]:
        """
        Returns list of (x, y, w, h) bounding boxes for motion regions.
        Empty list means no motion detected.
        """
        # Apply background subtraction
        mask = self.bg_subtractor.apply(frame)

        # Clean up noise
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        regions = []
        for contour in contours:
            if cv2.contourArea(contour) > self.min_area:
                regions.append(cv2.boundingRect(contour))

        return regions

    def has_motion(self, frame: np.ndarray) -> bool:
        """Quick boolean check: is there any motion?"""
        return len(self.detect(frame)) > 0

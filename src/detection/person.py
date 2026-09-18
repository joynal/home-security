"""
src/detection/person.py
───────────────────────
YOLOv8-nano person detector.
Only detects 'person' class (COCO class 0) for efficiency.
"""

import numpy as np
from ultralytics import YOLO


class PersonDetector:
    """Lightweight YOLO-based person detector."""

    def __init__(self, model_path: str = "yolov8n.pt", confidence: float = 0.5):
        self.model = YOLO(model_path)
        self.confidence = confidence
        # COCO class 0 = person
        self.person_class = 0

    def detect(self, frame: np.ndarray) -> list[dict]:
        """
        Detect persons in frame.
        Returns list of {bbox: [x1,y1,x2,y2], confidence: float}
        """
        results = self.model(
            frame,
            classes=[self.person_class],
            conf=self.confidence,
            verbose=False,
        )

        detections = []
        for box in results[0].boxes:
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
            detections.append(
                {
                    "bbox": [int(x1), int(y1), int(x2), int(y2)],
                    "confidence": float(box.conf[0]),
                }
            )

        return detections

    def detect_as_supervision(self, frame: np.ndarray):
        """Return detections in supervision.Detections format for tracker integration."""
        import supervision as sv

        results = self.model(
            frame, classes=[self.person_class], conf=self.confidence, verbose=False
        )
        return sv.Detections.from_ultralytics(results[0])

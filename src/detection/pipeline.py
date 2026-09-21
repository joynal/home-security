"""
src/detection/pipeline.py
─────────────────────────
Cascading detection pipeline:
  Motion → YOLO Person → ByteTrack → ArcFace Recognition → Zones

Each stage filters out irrelevant frames, reducing total compute by ~95%.
One instance per camera.
"""

import time

import numpy as np

from src.detection.behaviors import LoiteringDetector
from src.detection.motion import MotionDetector
from src.detection.person import PersonDetector
from src.detection.tracker import PersonTracker
from src.detection.zones import ZoneFilter
from src.recognition.face_ops import FaceRecognizer


class DetectionPipeline:
  """
  Orchestrates the cascading detection pipeline for a single camera.
  Each camera should have its own pipeline instance.
  """

  def __init__(
    self,
    recognizer: FaceRecognizer,
    enable_motion_filter: bool = True,
    zones: list[dict] | None = None,
    loitering_threshold_seconds: float = 120.0,
  ):
    self.motion_detector = MotionDetector() if enable_motion_filter else None
    self.person_detector = PersonDetector()
    self.tracker = PersonTracker(recognition_cooldown=30.0)
    self.recognizer = recognizer
    self.zone_filter = ZoneFilter(zones or [])
    self.loitering_detector = (
      LoiteringDetector(threshold_seconds=loitering_threshold_seconds) if zones else None
    )

    # Stats
    self.stats = {
      'frames_processed': 0,
      'frames_skipped_no_motion': 0,
      'frames_with_persons': 0,
      'recognition_calls': 0,
      'recognition_skipped_cached': 0,
    }

  def process_frame(self, frame: np.ndarray) -> list[dict]:
    """
    Process a single frame through the cascading pipeline.

    Returns list of detections:
    [
        {
            "bbox": [x, y, w, h],
            "name": "joynal" or "Unknown",
            "is_known": True/False,
            "track_id": 42,
            "confidence": 0.85,
            "landmarks": np.ndarray or None,
            "zone": str | None,
            "source": "cached" or "recognized",
        },
        ...
    ]
    """
    self.stats['frames_processed'] += 1

    # ── Stage 1: Motion Detection ──────────────────────
    if self.motion_detector and not self.motion_detector.has_motion(frame):
      self.stats['frames_skipped_no_motion'] += 1
      return []

    # ── Stage 2: YOLO Person Detection ─────────────────
    person_detections = self.person_detector.detect_as_supervision(frame)

    if len(person_detections) == 0:
      return []

    self.stats['frames_with_persons'] += 1

    # ── Stage 3: ByteTrack ─────────────────────────────
    tracked = self.tracker.update(person_detections)

    results = []
    for i in range(len(tracked)):
      bbox = tracked.xyxy[i].astype(int)
      track_id = tracked.tracker_id[i]
      x1, y1, x2, y2 = bbox

      # ── Stage 4: Face Recognition (only if needed) ──
      if self.tracker.needs_recognition(track_id):
        # Crop person region and run face recognition
        person_crop = frame[y1:y2, x1:x2]
        if person_crop.size > 0:
          face_results = self.recognizer.process_frame(person_crop)
          self.stats['recognition_calls'] += 1

          if face_results:
            # Use the first face found in the person crop
            first_match = face_results[0]
            name = first_match[4]
            is_known = first_match[5]
            landmarks = first_match[6]
            sim = first_match[7] if len(first_match) > 7 else 0.0
            self.tracker.cache_identity(track_id, name, is_known)
            results.append(
              {
                'bbox': [x1, y1, x2 - x1, y2 - y1],
                'name': name,
                'is_known': is_known,
                'track_id': int(track_id),
                'confidence': (
                  float(tracked.confidence[i]) if tracked.confidence is not None else 0.0
                ),
                'landmarks': landmarks,
                'similarity': float(sim),
                'source': 'recognized',
              }
            )
          else:
            # Person detected but no face visible (back turned, etc.)
            self.tracker.cache_identity(track_id, 'Unknown', False)
            results.append(
              {
                'bbox': [x1, y1, x2 - x1, y2 - y1],
                'name': 'Unknown',
                'is_known': False,
                'track_id': int(track_id),
                'confidence': (
                  float(tracked.confidence[i]) if tracked.confidence is not None else 0.0
                ),
                'landmarks': None,
                'source': 'recognized',
              }
            )
      else:
        # Use cached identity
        cached = self.tracker.get_cached_identity(track_id)
        self.stats['recognition_skipped_cached'] += 1
        results.append(
          {
            'bbox': [x1, y1, x2 - x1, y2 - y1],
            'name': cached['name'],
            'is_known': cached['is_known'],
            'track_id': int(track_id),
            'confidence': (float(tracked.confidence[i]) if tracked.confidence is not None else 0.0),
            'landmarks': None,
            'source': 'cached',
          }
        )

    # ── Stage 5: Activity zones ────────────────────────
    results = self.zone_filter.filter_detections(results)

    # ── Stage 6: Loitering (unknown persons lingering in a zone) ──
    if self.loitering_detector is not None:
      self.stats.setdefault('loitering_alerts', 0)
      for det in results:
        det['loitering'] = self.loitering_detector.update(
          det['track_id'], det.get('zone'), det['is_known']
        )
        if det['loitering']:
          self.stats['loitering_alerts'] += 1
      self.loitering_detector.cleanup(
        {int(tid) for tid in tracked.tracker_id} if len(tracked) else set()
      )

    # Periodic cleanup
    if self.stats['frames_processed'] % 100 == 0:
      self.tracker.cleanup_stale_tracks()

    return results

  def get_stats(self) -> dict:
    """Return pipeline performance stats."""
    total = self.stats['frames_processed']
    return {
      **self.stats,
      'motion_filter_rate': (
        self.stats['frames_skipped_no_motion'] / total * 100 if total > 0 else 0
      ),
      'cache_hit_rate': (
        self.stats['recognition_skipped_cached']
        / max(
          self.stats['recognition_calls'] + self.stats['recognition_skipped_cached'],
          1,
        )
        * 100
      ),
    }

  def time_now(self) -> float:
    """Exposed for tests that freeze the clock."""
    return time.time()

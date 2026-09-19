"""
src/detection/zones.py
──────────────────────
Polygon-based activity zones for filtering detections.
"""

import cv2
import numpy as np


class ZoneFilter:
  """Filter detections based on polygon activity zones."""

  def __init__(self, zones: list[dict]):
    """
    zones: list of {"name": str, "coordinates": [[x,y], ...]}
    If zones list is empty, all detections pass through (no filtering).
    """
    self.zones = zones
    self.polygons = [np.array(z['coordinates'], dtype=np.int32) for z in zones]

  def is_in_zone(self, bbox: list[int]) -> tuple[bool, str | None]:
    """
    Check if the center of a bounding box falls within any zone.
    Returns (in_zone, zone_name).
    """
    if not self.polygons:
      return True, None  # No zones defined = everything passes

    x, y, w, h = bbox
    center_x = x + w // 2
    center_y = y + h // 2

    for polygon, zone_config in zip(self.polygons, self.zones, strict=True):
      if (
        cv2.pointPolygonTest(polygon, (float(center_x), float(center_y)), False)
        >= 0
      ):
        return True, zone_config['name']

    return False, None

  def filter_detections(self, detections: list[dict]) -> list[dict]:
    """Filter detection list, keeping only those inside defined zones."""
    if not self.polygons:
      return detections  # No zones = pass all through

    filtered = []
    for det in detections:
      in_zone, zone_name = self.is_in_zone(det['bbox'])
      if in_zone:
        det['zone'] = zone_name
        filtered.append(det)
    return filtered

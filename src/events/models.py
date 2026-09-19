"""Event data models."""

from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass
class DetectionEvent:
  camera_id: str
  event_type: str  # "unknown_face", "known_face", "person_detected", "motion"
  timestamp: datetime = field(default_factory=lambda: datetime.now(UTC))
  person_name: str | None = None
  confidence: float = 0.0
  thumbnail_path: str | None = None
  recording_segment: str | None = None  # Link to the MP4 segment
  metadata: str = ''  # JSON string for extra data

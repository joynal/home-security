"""
src/models.py
─────────────
Pydantic models for typed configuration validation.
"""

from pydantic import BaseModel, Field


class DetectConfig(BaseModel):
  width: int = 640
  height: int = 360
  fps: int = 5
  enabled: bool = True


class RecordConfig(BaseModel):
  enabled: bool = True
  retain_days: int = 30
  segment_seconds: int = 900  # 15-minute segments
  delete_only_if_disk_full: bool = (
    True  # If True, never delete if disk has space; only prune oldest when low
  )
  min_disk_free_gb: float = (
    10.0  # Minimum free disk space (GB) on volume before purging oldest
  )
  max_disk_usage_gb: float | None = (
    None  # Optional per-camera max disk usage cap (GB)
  )
  # Dev/testing override for recording input (looped MP4, ffmpeg testsrc, …).
  # MUST be declared here: Pydantic silently drops unknown keys from cameras.json,
  # so without this field the recorder's fallback could never activate.
  source_url: str | None = None


class ZoneConfig(BaseModel):
  name: str
  coordinates: list[list[int]]  # [[x1,y1], [x2,y2], ...]


class CameraConfig(BaseModel):
  id: str  # Unique identifier (e.g., "front_door")
  name: str  # Human-readable name (e.g., "Front Door")
  type: str  # "macbook", "tapo", "rtsp"
  enabled: bool = True
  # Connection details
  rtsp_url: str | None = None  # Main stream RTSP URL (1080p — for recording)
  rtsp_sub_url: str | None = None  # Sub-stream RTSP URL (360p — for detection)
  camera_index: int = 0  # For macbook type
  # Sub-configs
  detect: DetectConfig = Field(default_factory=DetectConfig)
  record: RecordConfig = Field(default_factory=RecordConfig)
  zones: list[ZoneConfig] = Field(default_factory=list)


class AppConfig(BaseModel):
  """Root config — documents the full shape; cameras.json holds the list part."""

  cameras: list[CameraConfig]
  active_alert: str = 'console'  # "console", "telegram", or "ntfy"
  secret_key: str
  telegram_bot_token: str = ''
  telegram_chat_id: str = ''
  # Storage paths — override to point recordings/thumbnails to NAS or external drive
  recordings_dir: str | None = None
  thumbnails_dir: str | None = None

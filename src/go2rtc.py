"""
src/go2rtc.py
─────────────
Generates go2rtc config from camera settings and manages the go2rtc process.

go2rtc is the single RTSP connection point per camera: detection (OpenCV) and
recording (FFmpeg) both read from rtsp://localhost:8554/{camera_id} instead of
opening concurrent direct connections, which Tapo cameras cannot tolerate.
"""

import subprocess
from pathlib import Path

import yaml

from src.config import BASE_DIR, CAMERAS

GO2RTC_CONFIG = BASE_DIR / 'go2rtc.yaml'


def generate_go2rtc_config() -> Path:
  """Generate go2rtc.yaml from camera configs. Returns the config path."""
  streams = {}
  for cam in CAMERAS:
    if cam.type in ('tapo', 'rtsp') and cam.rtsp_url:
      streams[cam.id] = [cam.rtsp_url]

  config = {
    'streams': streams,
    'rtsp': {
      'listen': '127.0.0.1:8554'
    },  # Local proxy feed for recorder + detection
    'webrtc': {
      'listen': '127.0.0.1:8555'
    },  # Bind to localhost — proxy via FastAPI
    'api': {
      'listen': '127.0.0.1:1984'
    },  # Bind to localhost to prevent unauthenticated access
  }
  GO2RTC_CONFIG.write_text(yaml.dump(config, default_flow_style=False))
  return GO2RTC_CONFIG


def check_go2rtc_available() -> bool:
  """Check if the go2rtc binary is available on PATH."""
  try:
    subprocess.run(['go2rtc', '--version'], capture_output=True, timeout=5)
    return True
  except (FileNotFoundError, subprocess.TimeoutExpired):
    return False


def start_go2rtc() -> subprocess.Popen | None:
  """Generate config and start go2rtc. Returns the process, or None if unavailable."""
  if not check_go2rtc_available():
    print(
      "[WARN] go2rtc not found — recording and multi-stream won't work for RTSP cameras"
    )
    print(
      '       Install: https://github.com/AlexxIT/go2rtc (brew install go2rtc)'
    )
    return None

  config_path = generate_go2rtc_config()
  has_streams = any(
    cam.type in ('tapo', 'rtsp') and cam.rtsp_url for cam in CAMERAS
  )
  if not has_streams:
    print('[go2rtc] No RTSP cameras configured — not started')
    return None

  proc = subprocess.Popen(['go2rtc', '-config', str(config_path)])
  print(f'[go2rtc] Started (config: {config_path})')
  return proc


def stop_go2rtc(proc: subprocess.Popen | None) -> None:
  """Terminate go2rtc gracefully."""
  if proc is None:
    return
  proc.terminate()
  try:
    proc.wait(timeout=10)
  except subprocess.TimeoutExpired:
    proc.kill()
  print('[go2rtc] Stopped')

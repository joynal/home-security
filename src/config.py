import json
import os
from pathlib import Path

# Load environment variables from .env file if it exists
try:
  from dotenv import load_dotenv

  _env_path = Path(__file__).resolve().parent.parent / '.env'
  if _env_path.exists():
    load_dotenv(_env_path)
except ImportError:
  pass

from src.models import CameraConfig

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
KNOWN_FACES_DIR = DATA_DIR / 'known_faces'
# data/ (gitignored) is the ONLY camera store — keeps RTSP credentials out of the repo.
DATA_CAMERAS_FILE = DATA_DIR / 'cameras.json'
CAMERAS_FILE = DATA_CAMERAS_FILE

# Ensure directories exist
os.makedirs(KNOWN_FACES_DIR, exist_ok=True)

# Storage paths — override via env to point recordings/thumbnails to NAS/external drive.
# Default: local data/ directory. Override for NAS:
#   RECORDINGS_DIR=/Volumes/NAS/aegis/recordings
#   THUMBNAILS_DIR=/Volumes/NAS/aegis/thumbnails
RECORDINGS_DIR = Path(os.getenv('RECORDINGS_DIR', str(DATA_DIR / 'recordings')))
THUMBNAILS_DIR = Path(os.getenv('THUMBNAILS_DIR', str(DATA_DIR / 'thumbnails')))
os.makedirs(RECORDINGS_DIR, exist_ok=True)
os.makedirs(THUMBNAILS_DIR, exist_ok=True)

# Security
_secret_key = os.getenv('SECRET_KEY')
if not _secret_key:
  raise ValueError('SECRET_KEY environment variable is not set. Please add it to your .env file.')
# Type narrowing: after the check above, we know _secret_key is not None
SECRET_KEY: str = _secret_key

# Application state (legacy format — used as fallback when cameras.json is absent)
# Example: [{"name": "Porch", "type": "macbook"}, {"name": "Driveway", "type": "tapo", "ip": "192.168.1.10", "user": "admin", "pass": "secret"}]
ACTIVE_CAMERAS = [{'name': 'MacBook_Webcam', 'type': 'macbook'}]

ACTIVE_ALERT = (
  'console'  # Options: 'console', 'telegram', 'ntfy' (switch back to telegram for real use)
)
TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_CHAT_ID = os.getenv('TELEGRAM_CHAT_ID', '')
NTFY_TOPIC = os.getenv('NTFY_TOPIC', '')  # e.g., "aegis-vision-alerts"


def load_cameras() -> list[CameraConfig]:
  """Load camera configs from data/cameras.json, or fall back to legacy format."""
  if CAMERAS_FILE.exists():
    raw = json.loads(CAMERAS_FILE.read_text())
    return [CameraConfig(**c) for c in raw]
  # Legacy fallback — map the old flat dicts so existing Tapo configs aren't dropped
  return [
    CameraConfig(
      id=c.get('name', 'cam0').lower().replace(' ', '_'),
      name=c.get('name', 'Camera'),
      type=c.get('type', 'macbook'),
      rtsp_url=(
        f'rtsp://{c.get("user", "admin")}:{c.get("pass", "password")}'
        f'@{c.get("ip", "localhost")}:554/stream1'
        if c.get('type') == 'tapo'
        else None
      ),
    )
    for c in ACTIVE_CAMERAS
  ]


CAMERAS: list[CameraConfig] = load_cameras()


def save_cameras(cameras: list[CameraConfig]) -> None:
  """Atomically save camera configs to data/cameras.json and update global CAMERAS."""
  global CAMERAS
  CAMERAS_FILE.parent.mkdir(parents=True, exist_ok=True)
  tmp_file = CAMERAS_FILE.with_suffix('.json.tmp')
  tmp_file.write_text(json.dumps([c.model_dump() for c in cameras], indent=2))
  tmp_file.replace(CAMERAS_FILE)
  CAMERAS = cameras

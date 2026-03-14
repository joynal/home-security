import os
from pathlib import Path

# Load environment variables from .env file if it exists
try:
    from dotenv import load_dotenv

    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
except ImportError:
    pass

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
KNOWN_FACES_DIR = DATA_DIR / "known_faces"

# Ensure directories exist
os.makedirs(KNOWN_FACES_DIR, exist_ok=True)

# Security
_secret_key = os.getenv("SECRET_KEY")
if not _secret_key:
    raise ValueError("SECRET_KEY environment variable is not set. Please add it to your .env file.")
# Type narrowing: after the check above, we know _secret_key is not None
SECRET_KEY: str = _secret_key

# Application state
# Example: [{"name": "Porch", "type": "macbook"}, {"name": "Driveway", "type": "tapo", "ip": "192.168.1.10", "user": "admin", "pass": "secret"}]
ACTIVE_CAMERAS = [{"name": "MacBook_Webcam", "type": "macbook"}]

ACTIVE_ALERT = "console"  # Options: 'console', 'telegram'

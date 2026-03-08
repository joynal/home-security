import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
KNOWN_FACES_DIR = DATA_DIR / "known_faces"

# Ensure directories exist
os.makedirs(KNOWN_FACES_DIR, exist_ok=True)

# Application state
# Example: [{"name": "Porch", "type": "macbook"}, {"name": "Driveway", "type": "tapo", "ip": "192.168.1.10", "user": "admin", "pass": "secret"}]
ACTIVE_CAMERAS = [{"name": "MacBook_Webcam", "type": "macbook"}]

ACTIVE_ALERT = "console"  # Options: 'console', 'telegram'

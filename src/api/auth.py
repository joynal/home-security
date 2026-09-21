"""
src/api/auth.py
───────────────
File-based single-account JWT authentication.

Credentials live in data/credentials.json:
  { "username": "admin", "hashed_password": "<bcrypt>" }

Secret key is loaded from environment variable (SECRET_KEY in .env file).
Users must run set_password.py to set up authentication before starting the application.
"""

import json
from datetime import UTC
from datetime import datetime
from datetime import timedelta
from pathlib import Path

from fastapi import HTTPException
from fastapi import Request
from fastapi import status
from fastapi.security import HTTPBearer
from jose import JWTError
from jose import jwt
from passlib.context import CryptContext

from src.config import DATA_DIR
from src.config import SECRET_KEY

# ──────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────

CREDENTIALS_FILE = Path(DATA_DIR) / 'credentials.json'
TOKEN_EXPIRE_HOURS = 24
ALGORITHM = 'HS256'

_pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')
_bearer = HTTPBearer()

# ──────────────────────────────────────────────────────────
# Credential file management
# ──────────────────────────────────────────────────────────


def _load_credentials() -> dict:
  """Load credentials from file."""
  if not CREDENTIALS_FILE.exists():
    raise RuntimeError(
      f'Credentials file not found at {CREDENTIALS_FILE}.\n'
      "Please run 'uv run scripts/set_password.py' to set up authentication."
    )

  data = json.loads(CREDENTIALS_FILE.read_text())
  if not isinstance(data, dict):
    raise ValueError('Invalid credentials file format')
  return data


# Load once at module import time
_creds = _load_credentials()


def get_secret_key() -> str:
  """Return the JWT secret key from environment variable."""
  return SECRET_KEY


# ──────────────────────────────────────────────────────────
# Password helpers
# ──────────────────────────────────────────────────────────


def verify_password(plain: str) -> bool:
  return _pwd_ctx.verify(plain, _creds['hashed_password'])


def validate_password_strength(password: str) -> tuple[bool, str]:
  """Validate password strength (min 8 chars, uppercase, lowercase, digit)."""
  if len(password) < 8:
    return False, 'Password must be at least 8 characters long.'
  if not any(c.isupper() for c in password):
    return False, 'Password must contain at least one uppercase letter.'
  if not any(c.islower() for c in password):
    return False, 'Password must contain at least one lowercase letter.'
  if not any(c.isdigit() for c in password):
    return False, 'Password must contain at least one digit.'
  return True, ''


def update_password(new_password: str) -> None:
  """Update admin password, write to credentials.json atomically, and refresh in-memory cache."""
  global _creds
  valid, error_msg = validate_password_strength(new_password)
  if not valid:
    raise ValueError(error_msg)
  hashed = _pwd_ctx.hash(new_password)
  creds = _load_credentials()
  creds['hashed_password'] = hashed
  tmp_file = CREDENTIALS_FILE.with_suffix('.tmp')
  tmp_file.write_text(json.dumps(creds, indent=2))
  tmp_file.replace(CREDENTIALS_FILE)
  _creds = creds


def get_username() -> str:
  username = _creds.get('username')
  if not isinstance(username, str):
    raise ValueError('Invalid username in credentials file')
  return username


# ──────────────────────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────────────────────


def create_access_token(username: str) -> str:
  expire = datetime.now(UTC) + timedelta(hours=TOKEN_EXPIRE_HOURS)
  payload = {'sub': username, 'exp': expire}
  return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def decode_token(token: str) -> str:
  """Decode a JWT and return the username, or raise HTTPException."""
  try:
    payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
    username = payload.get('sub')
    if not isinstance(username, str):
      raise ValueError('missing sub')
    return username
  except JWTError as exc:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail='Invalid or expired token',
      headers={'WWW-Authenticate': 'Bearer'},
    ) from exc


# ──────────────────────────────────────────────────────────
# FastAPI dependency
# ──────────────────────────────────────────────────────────


def get_current_user(request: Request) -> str:
  """
  FastAPI dependency: validates the session and returns the username.
  Accepts Authorization Bearer header, the HttpOnly access_token cookie
  (set by /auth/login), or a legacy ?token= query param — same precedence
  as extract_token, so cookies work for XHR too, not just media tags.
  """
  return decode_token(extract_token(request))


def extract_token(request: Request | None = None, token: str | None = None) -> str:
  """
  Extract token from query param (?token=), Cookie header, or Authorization header.
  Allows media endpoints (<img> and <video>) to authenticate via Cookie headers
  without leaking the JWT token into URL query strings and access logs.
  """
  if token:
    return token
  if request is not None:
    cookie_token = request.cookies.get('access_token')
    if cookie_token:
      return cookie_token
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
      return auth_header.removeprefix('Bearer ').strip()

  raise HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail='Missing, invalid, or expired authentication',
    headers={'WWW-Authenticate': 'Bearer'},
  )


def verify_token_param(token: str) -> str:
  """For endpoints where the token is verified (e.g. img/video media endpoints)."""
  return decode_token(token)

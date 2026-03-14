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
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from src.config import DATA_DIR, SECRET_KEY

# ──────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────

CREDENTIALS_FILE = Path(DATA_DIR) / "credentials.json"
TOKEN_EXPIRE_HOURS = 24
ALGORITHM = "HS256"

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer()

# ──────────────────────────────────────────────────────────
# Credential file management
# ──────────────────────────────────────────────────────────


def _load_credentials() -> dict:
    """Load credentials from file."""
    if not CREDENTIALS_FILE.exists():
        raise RuntimeError(
            f"Credentials file not found at {CREDENTIALS_FILE}.\n"
            "Please run 'uv run scripts/set_password.py' to set up authentication."
        )

    data = json.loads(CREDENTIALS_FILE.read_text())
    if not isinstance(data, dict):
        raise ValueError("Invalid credentials file format")
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
    return _pwd_ctx.verify(plain, _creds["hashed_password"])


def get_username() -> str:
    username = _creds.get("username")
    if not isinstance(username, str):
        raise ValueError("Invalid username in credentials file")
    return username


# ──────────────────────────────────────────────────────────
# JWT helpers
# ──────────────────────────────────────────────────────────


def create_access_token(username: str) -> str:
    expire = datetime.now(UTC) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, get_secret_key(), algorithm=ALGORITHM)


def decode_token(token: str) -> str:
    """Decode a JWT and return the username, or raise HTTPException."""
    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not isinstance(username, str):
            raise ValueError("missing sub")
        return username
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ──────────────────────────────────────────────────────────
# FastAPI dependency
# ──────────────────────────────────────────────────────────


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),  # noqa: B008
) -> str:
    """FastAPI dependency: validates Bearer token, returns username."""
    return decode_token(creds.credentials)


def verify_token_param(token: str) -> str:
    """For endpoints where the token is passed as a query param (e.g. img src)."""
    return decode_token(token)

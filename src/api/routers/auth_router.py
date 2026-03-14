"""
src/api/routers/auth_router.py
───────────────────────────────
POST /auth/login  — exchange username+password for a JWT
GET  /auth/me     — verify token and return current user info
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from src.api.auth import create_access_token, get_current_user, get_username, verify_password

router = APIRouter(prefix="/auth")


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    username:     str


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    """Exchange credentials for a JWT access token."""
    if body.username != get_username() or not verify_password(body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = create_access_token(body.username)
    return TokenResponse(access_token=token, username=body.username)


@router.get("/me")
def me(current_user: str = Depends(get_current_user)):
    """Return the currently authenticated user. Useful to validate tokens."""
    return {"username": current_user}

"""
src/api/routers/auth_router.py
───────────────────────────────
POST /auth/login  — exchange username+password for a JWT
GET  /auth/me     — verify token and return current user info
"""

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Response
from fastapi import status
from pydantic import BaseModel

from src.api.auth import TOKEN_EXPIRE_HOURS
from src.api.auth import create_access_token
from src.api.auth import get_current_user
from src.api.auth import get_username
from src.api.auth import verify_password

router = APIRouter(prefix='/auth')


class LoginRequest(BaseModel):
  username: str
  password: str


class TokenResponse(BaseModel):
  access_token: str
  token_type: str = 'bearer'
  username: str


@router.post('/login', response_model=TokenResponse)
def login(body: LoginRequest, response: Response):
  """Exchange credentials for a JWT access token and set session cookie."""
  if body.username != get_username() or not verify_password(body.password):
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail='Invalid credentials',
    )
  token = create_access_token(body.username)
  response.set_cookie(
    key='access_token',
    value=token,
    httponly=True,
    samesite='lax',
    secure=False,
    path='/',
    max_age=TOKEN_EXPIRE_HOURS * 3600,
  )
  return TokenResponse(access_token=token, username=body.username)


@router.post('/logout')
def logout(response: Response):
  """Clear the session cookie."""
  response.delete_cookie(key='access_token', path='/')
  return {'ok': True}


@router.get('/me')
def me(current_user: str = Depends(get_current_user)):
  """Return the currently authenticated user. Useful to validate tokens."""
  return {'username': current_user}

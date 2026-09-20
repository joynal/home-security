"""Tests for the live snapshot endpoint (Task B7.1)."""

import numpy as np
import pytest
from fastapi import HTTPException

import src.api.state as state
from src.api.routers.stream import camera_snapshot
from src.models import CameraConfig


@pytest.fixture
def cam(monkeypatch):
  cams = [CameraConfig(id='test_clip', name='Test', type='file')]
  monkeypatch.setattr('src.api.routers.stream.CAMERAS', cams)
  monkeypatch.setattr('src.api.routers.stream.verify_token_param', lambda _t: None)
  return cams[0].id


def test_snapshot_returns_jpeg(cam, monkeypatch):
  monkeypatch.setattr(
    state, 'latest_frames', {'test_clip': np.full((60, 80, 3), 200, dtype=np.uint8)}
  )
  resp = camera_snapshot('test_clip', token='t')
  assert resp.media_type == 'image/jpeg'
  assert resp.body[:2] == b'\xff\xd8'  # JPEG SOI


def test_snapshot_unknown_camera_404(cam):
  with pytest.raises(HTTPException) as exc:
    camera_snapshot('nope', token='t')
  assert exc.value.status_code == 404


def test_snapshot_no_frame_yet_503(cam, monkeypatch):
  monkeypatch.setattr(state, 'latest_frames', {})
  with pytest.raises(HTTPException) as exc:
    camera_snapshot('test_clip', token='t')
  assert exc.value.status_code == 503

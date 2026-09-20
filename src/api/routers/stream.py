"""
src/api/routers/stream.py
─────────────────────────
Public endpoints:
  GET /cameras                     – list of configured cameras with live status
  GET /cameras/{camera_id}/status  – detailed status for one camera
  GET /video_feed                  – infinite MJPEG stream of the annotated camera grid (legacy)
  GET /video_feed/grid             – same as /video_feed (explicit name)
  GET /video_feed/{camera_id}      – MJPEG stream for a single camera

Route order matters: static paths (/grid) are declared before the
/{camera_id} path-parameter route, or FastAPI would match "grid" as an id.
"""

import time

import cv2
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

import src.api.state as state
from src.api.auth import get_current_user, verify_token_param
from src.config import CAMERAS

router = APIRouter()


def _frame_generator():
  """Yield MJPEG boundary frames for as long as the client is connected."""
  while True:
    with state.frame_lock:
      frame = state.latest_grid_frame.copy()
    ret, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if ret:
      yield (
        b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buf.tobytes() + b'\r\n'
      )
    time.sleep(0.05)  # ~20 FPS cap to reduce network load


def _camera_frame_generator(camera_id: str):
  """Yield pre-encoded MJPEG frames for a single camera (encode-once cache)."""
  while True:
    with state.frames_lock:
      jpeg_bytes = state.latest_jpeg_bytes.get(camera_id)
    if jpeg_bytes is not None:
      yield (
        b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg_bytes + b'\r\n'
      )
    time.sleep(0.05)


@router.get('/cameras')
def list_cameras(_: str = Depends(get_current_user)):
  """Return list of cameras with live status."""
  result = []
  for cam in CAMERAS:
    with state.camera_status_lock:
      status = state.camera_status.get(cam.id, {})
    result.append(
      {
        'id': cam.id,
        'name': cam.name,
        'type': cam.type,
        'enabled': cam.enabled,
        'online': status.get('online', False),
        'fps': status.get('fps', 0),
        'last_frame_at': status.get('last_frame_at'),
        'detect': {
          'width': cam.detect.width,
          'height': cam.detect.height,
          'fps': cam.detect.fps,
        },
        'record': {
          'enabled': cam.record.enabled,
          'retain_days': cam.record.retain_days,
        },
      }
    )
  return {'cameras': result}


@router.get('/cameras/{camera_id}/status')
def camera_status(camera_id: str, _: str = Depends(get_current_user)):
  """Return detailed live status for a single camera."""
  cam = next((c for c in CAMERAS if c.id == camera_id), None)
  if cam is None:
    raise HTTPException(status_code=404, detail=f'Unknown camera: {camera_id}')
  with state.camera_status_lock:
    status = dict(state.camera_status.get(camera_id, {}))
  return {
    'id': cam.id,
    'name': cam.name,
    'type': cam.type,
    'enabled': cam.enabled,
    'online': status.get('online', False),
    'fps': status.get('fps', 0),
    'last_frame_at': status.get('last_frame_at'),
    'error': status.get('error'),
  }


@router.get('/video_feed')
@router.get('/video_feed/grid')
def video_feed_grid(token: str = Query(...)):
  """MJPEG stream of the stacked grid. Accepts token as query param (img src)."""
  verify_token_param(token)  # raises 401 if invalid
  return StreamingResponse(
    _frame_generator(),
    media_type='multipart/x-mixed-replace; boundary=frame',
  )


@router.get('/video_feed/{camera_id}')
def video_feed_camera(camera_id: str, token: str = Query(...)):
  """MJPEG stream for a single camera (serves the encode-once JPEG cache)."""
  verify_token_param(token)
  if not any(c.id == camera_id for c in CAMERAS):
    raise HTTPException(status_code=404, detail=f'Unknown camera: {camera_id}')
  return StreamingResponse(
    _camera_frame_generator(camera_id),
    media_type='multipart/x-mixed-replace; boundary=frame',
  )


@router.get('/cameras/{camera_id}/snapshot.jpg')
def camera_snapshot(camera_id: str, token: str = Query(...)):
  """
  Current still frame from a camera's latest annotated frame.
  Cheap alternative to the MJPEG stream for grid tiles and notifications.
  """
  verify_token_param(token)
  if not any(c.id == camera_id for c in CAMERAS):
    raise HTTPException(status_code=404, detail=f'Unknown camera: {camera_id}')
  with state.frames_lock:
    frame = state.latest_frames.get(camera_id)
  if frame is None:
    raise HTTPException(status_code=503, detail='No frame yet')
  ret, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
  if not ret:
    raise HTTPException(status_code=500, detail='Encode failed')
  from fastapi.responses import Response

  return Response(content=buf.tobytes(), media_type='image/jpeg')


@router.get('/diagnostics/pipeline')
def pipeline_stats(_: str = Depends(get_current_user)):
  """Return detection pipeline performance stats per camera."""
  return {
    'pipelines': {
      cam_id: pipeline.get_stats()
      for cam_id, pipeline in state.pipelines.items()
    }
  }

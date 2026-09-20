"""
src/api/enroll_jobs.py
──────────────────────
Request-response enrollment over the inference thread.

API endpoints (photo import, add-from-event) need synchronous per-image
verdicts ("enrolled / no face / blurry"), but ONNX must stay single-threaded:
only the inference loop may call the recognizer. So an API thread submits an
EnrollJob carrying a threading.Event; the inference loop drains the queue,
runs detection + quality gates, fills the result, and sets the event. The
submitter blocks briefly (default 2s) and returns the verdict.
"""

import threading

import cv2
import numpy as np

import src.api.state as state

# Quality gates (capture-time rejection thresholds)
MIN_FACE_SIZE_PX = 96  # smaller of bbox width/height
MIN_SHARPNESS = 60.0  # Laplacian variance on the face crop
MIN_BRIGHTNESS = 40.0  # mean pixel value
MAX_BRIGHTNESS = 225.0


class EnrollJob:
  """One enrollment request: frame in, verdict out."""

  __slots__ = ('name', 'frame', 'apply_gates', 'event', 'result')

  def __init__(self, name: str, frame: np.ndarray, apply_gates: bool = True):
    self.name = name
    self.frame = frame
    self.apply_gates = apply_gates
    self.event = threading.Event()
    self.result: dict | None = None


def quality_check(frame: np.ndarray, bbox) -> tuple[bool, str | None]:
  """
  Gate a detected face for enrollment quality.
  `bbox` is InsightFace-style [left, top, right, bottom] (floats ok).
  Returns (ok, failure_reason).
  """
  left, top, right, bottom = [int(v) for v in bbox]
  w, h = right - left, bottom - top
  if min(w, h) < MIN_FACE_SIZE_PX:
    return False, 'too_small'

  crop = frame[max(0, top) : bottom, max(0, left) : right]
  if crop.size == 0:
    return False, 'no_pixels'

  gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
  sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()
  if sharpness < MIN_SHARPNESS:
    return False, 'blurry'

  brightness = float(gray.mean())
  if brightness < MIN_BRIGHTNESS:
    return False, 'too_dark'
  if brightness > MAX_BRIGHTNESS:
    return False, 'too_bright'

  return True, None


def submit_job(
  name: str, frame: np.ndarray, timeout: float = 2.0, apply_gates: bool = True
) -> dict:
  """Queue an enrollment job and wait for the inference loop's verdict."""
  job = EnrollJob(name, frame, apply_gates=apply_gates)
  with state.pending_lock:
    state.pending_enroll_jobs.append(job)
  if not job.event.wait(timeout):
    return {'ok': False, 'reason': 'timeout', 'detail': 'inference loop did not respond'}
  assert job.result is not None
  return job.result


def drain_jobs() -> int:
  """
  Run every queued enrollment job. MUST be called from the inference thread
  (the only legal ONNX caller). Returns the number of jobs processed.
  """
  with state.pending_lock:
    jobs = state.pending_enroll_jobs.copy()
    state.pending_enroll_jobs.clear()

  recognizer = state.recognizer
  for job in jobs:
    try:
      job.result = _process(job, recognizer)
    except Exception as exc:  # never wedge the submitter on an unexpected error
      job.result = {'ok': False, 'reason': 'error', 'detail': str(exc)}
    finally:
      job.event.set()
  return len(jobs)


def _process(job: EnrollJob, recognizer) -> dict:
  if recognizer is None:
    return {'ok': False, 'reason': 'error', 'detail': 'recognizer not ready'}

  faces = recognizer.detect_faces(job.frame)
  if not faces:
    return {'ok': False, 'reason': 'no_face'}

  multiple = len(faces) > 1
  # Largest face wins (by bbox area)
  face = max(faces, key=lambda f: float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])))
  bbox = [float(v) for v in face.bbox]

  if job.apply_gates:
    ok, reason = quality_check(job.frame, bbox)
    if not ok:
      return {'ok': False, 'reason': reason, 'bbox': bbox}

  recognizer.add_embedding(job.name, face.embedding)
  result = {'ok': True, 'bbox': bbox, 'multiple_faces': multiple}
  if multiple:
    result['note'] = 'multiple faces in image — used the largest'
  return result

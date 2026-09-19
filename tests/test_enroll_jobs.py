"""Tests for the request-response enrollment queue (Task B6.1). No real ONNX —
a fake recognizer stands in, so these test the plumbing: gates, verdicts,
timeouts, and concurrency."""

import threading
from dataclasses import dataclass, field

import numpy as np
import pytest

import src.api.state as state
from src.api.enroll_jobs import drain_jobs, quality_check, submit_job


@dataclass
class FakeFace:
  bbox: list[float]
  embedding: np.ndarray = field(default_factory=lambda: np.zeros(4))


class FakeRecognizer:
  def __init__(self, faces=None):
    self.faces = faces or []
    self.added = []

  def detect_faces(self, frame):
    return self.faces

  def add_embedding(self, name, embedding):
    self.added.append((name, embedding))


def _frame(bright=128.0, noise=5.0) -> np.ndarray:
  rng = np.random.default_rng(42)
  return np.clip(rng.normal(bright, noise, (480, 640, 3)), 0, 255).astype(np.uint8)


@pytest.fixture
def reset_state():
  saved_jobs = state.pending_enroll_jobs
  saved_rec = state.recognizer
  state.pending_enroll_jobs = []
  yield
  state.pending_enroll_jobs = saved_jobs
  state.recognizer = saved_rec


def test_quality_check_gates():
  frame = _frame()
  ok, reason = quality_check(frame, [200, 100, 400, 340])  # 200x240 face
  assert ok and reason is None

  ok, reason = quality_check(frame, [200, 100, 260, 160])  # 60x60 → too small
  assert not ok and reason == 'too_small'

  ok, reason = quality_check(_frame(bright=15.0), [200, 100, 400, 340])  # dark
  assert not ok and reason == 'too_dark'

  ok, reason = quality_check(_frame(bright=245.0), [200, 100, 400, 340])  # blown out
  assert not ok and reason == 'too_bright'

  # Blurry: flat crop (no texture) → Laplacian variance ~0
  flat = np.full((480, 640, 3), 128, dtype=np.uint8)
  ok, reason = quality_check(flat, [200, 100, 400, 340])
  assert not ok and reason == 'blurry'


def test_submit_and_drain_round_trip(reset_state):
  state.recognizer = FakeRecognizer(faces=[FakeFace(bbox=[200, 100, 400, 340])])
  results = {}

  def submitter():
    results['verdict'] = submit_job('joynal', _frame(), timeout=5.0)

  t = threading.Thread(target=submitter)
  t.start()
  import time

  for _ in range(50):  # simulate the inference loop's cadence
    if state.pending_enroll_jobs:
      break
    time.sleep(0.02)
  drained = drain_jobs()
  t.join(timeout=2)

  assert drained == 1
  assert results['verdict']['ok'] is True
  assert state.recognizer.added[0][0] == 'joynal'


def test_verdict_no_face(reset_state):
  from src.api.enroll_jobs import EnrollJob

  state.recognizer = FakeRecognizer(faces=[])
  job = EnrollJob('x', _frame())
  state.pending_enroll_jobs.append(job)
  drain_jobs()
  assert job.result['ok'] is False and job.result['reason'] == 'no_face'


def test_gates_block_blurry_face(reset_state):
  state.recognizer = FakeRecognizer(faces=[FakeFace(bbox=[200, 100, 400, 340])])
  from src.api.enroll_jobs import EnrollJob

  job = EnrollJob('x', np.full((480, 640, 3), 128, dtype=np.uint8))
  state.pending_enroll_jobs.append(job)
  drain_jobs()
  assert job.result['ok'] is False and job.result['reason'] == 'blurry'
  assert state.recognizer.added == []  # nothing enrolled


def test_gates_optional(reset_state):
  state.recognizer = FakeRecognizer(faces=[FakeFace(bbox=[200, 100, 400, 340])])
  from src.api.enroll_jobs import EnrollJob

  job = EnrollJob('x', np.full((480, 640, 3), 128, dtype=np.uint8), apply_gates=False)
  state.pending_enroll_jobs.append(job)
  drain_jobs()
  assert job.result['ok'] is True
  assert len(state.recognizer.added) == 1


def test_multiple_faces_uses_largest(reset_state):
  state.recognizer = FakeRecognizer(
    faces=[FakeFace(bbox=[300, 200, 340, 240]), FakeFace(bbox=[100, 80, 320, 300])]
  )
  from src.api.enroll_jobs import EnrollJob

  job = EnrollJob('x', _frame())
  state.pending_enroll_jobs.append(job)
  drain_jobs()
  assert job.result['ok'] is True
  assert job.result['multiple_faces'] is True


def test_timeout_when_no_drainer(reset_state):
  state.recognizer = FakeRecognizer()
  verdict = submit_job('x', _frame(), timeout=0.2)
  assert verdict['ok'] is False and verdict['reason'] == 'timeout'
  state.pending_enroll_jobs.clear()  # clean the abandoned job


def test_concurrent_submissions(reset_state):
  state.recognizer = FakeRecognizer(faces=[FakeFace(bbox=[200, 100, 400, 340])])
  verdicts = {}
  threads = []

  def submitter(i):
    verdicts[i] = submit_job(f'p{i}', _frame(), timeout=5.0)

  for i in range(5):
    t = threading.Thread(target=submitter, args=(i,))
    t.start()
    threads.append(t)

  import time

  for _ in range(100):
    if len(state.pending_enroll_jobs) == 5:
      break
    time.sleep(0.02)
  assert drain_jobs() == 5
  for t in threads:
    t.join(timeout=2)

  assert all(v['ok'] for v in verdicts.values())
  assert len(state.recognizer.added) == 5

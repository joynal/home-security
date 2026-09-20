"""Per-person alert cooldown tests (Task 4.5) + ntfy init (Task 4.4)."""

from unittest.mock import patch

import numpy as np

import src.api.state as state
from src.alerts.console import ConsoleAlert
from src.alerts.ntfy import NtfyAlert


def test_same_person_suppressed_within_cooldown(capsys):
  alert = ConsoleAlert(cooldown_seconds=30.0)
  alert.send_alert('msg', person_key='unknown#1')
  alert.send_alert('msg', person_key='unknown#1')  # same person, within window
  out = capsys.readouterr().out
  assert out.count('ALERT') == 1


def test_different_people_not_cross_suppressed(capsys):
  """The old global-cooldown bug: person B silent because person A just alerted."""
  alert = ConsoleAlert(cooldown_seconds=30.0)
  alert.send_alert('msg', person_key='unknown#1')
  alert.send_alert('msg', person_key='unknown#2')  # different person — MUST fire
  out = capsys.readouterr().out
  assert out.count('ALERT') == 2
  assert '[unknown#2]' in out


def test_cooldown_expires_for_same_person():
  alert = ConsoleAlert(cooldown_seconds=10.0)
  with patch('src.alerts.base.time.time', return_value=1000.0):
    alert.send_alert('msg', person_key='p')
  with patch('src.alerts.base.time.time', return_value=1011.0):  # 11s later
    fired = not alert._within_cooldown('p')
  assert fired is True


def test_global_key_when_no_person(capsys):
  alert = ConsoleAlert(cooldown_seconds=30.0)
  alert.send_alert('msg')  # no person_key → global
  alert.send_alert('msg')
  out = capsys.readouterr().out
  assert out.count('ALERT') == 1


def test_ntfy_alert_noop_without_main_loop():
  """Must not raise when called before FastAPI's loop exists (inference thread races)."""
  saved = state.main_loop
  state.main_loop = None
  try:
    ntfy = NtfyAlert(topic='test-topic', cooldown_seconds=1.0)
    ntfy.send_alert('hello', image_frame=np.zeros((10, 10, 3), dtype=np.uint8))
  finally:
    state.main_loop = saved


def test_ntfy_per_person_cooldown():
  ntfy = NtfyAlert(topic='test-topic', cooldown_seconds=30.0)
  assert ntfy._within_cooldown('unknown#1') is False  # first → passes
  assert ntfy._within_cooldown('unknown#1') is True  # second → suppressed
  assert ntfy._within_cooldown('unknown#2') is False  # other person → passes


def test_build_alert_ntfy_requires_topic(monkeypatch):
  import src.api.inference as inf
  import src.config as config
  from src.api.inference import build_alert

  monkeypatch.setattr(inf, 'ACTIVE_ALERT', 'ntfy')
  monkeypatch.setattr(config, 'NTFY_TOPIC', '')
  try:
    build_alert()
    raise AssertionError('should have raised')
  except ValueError as e:
    assert 'NTFY_TOPIC' in str(e)

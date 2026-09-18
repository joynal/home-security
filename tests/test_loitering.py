"""Loitering detector tests — time-based state machine with mocked clock."""

from unittest.mock import patch

from src.detection.behaviors import LoiteringDetector


def test_no_alert_before_threshold():
    det = LoiteringDetector(threshold_seconds=120.0)
    with patch("src.detection.behaviors.time.time", return_value=1000.0):
        assert det.update(1, "porch", is_known=False) is False  # first seen
    with patch("src.detection.behaviors.time.time", return_value=1000.0 + 60.0):
        assert det.update(1, "porch", is_known=False) is False  # 1 min — under


def test_alert_fires_once_after_threshold():
    det = LoiteringDetector(threshold_seconds=120.0)
    with patch("src.detection.behaviors.time.time", return_value=1000.0):
        det.update(1, "porch", is_known=False)
    with patch("src.detection.behaviors.time.time", return_value=1000.0 + 121.0):
        assert det.update(1, "porch", is_known=False) is True  # over threshold
    with patch("src.detection.behaviors.time.time", return_value=1000.0 + 300.0):
        assert det.update(1, "porch", is_known=False) is False  # already alerted


def test_known_person_never_triggers():
    det = LoiteringDetector(threshold_seconds=120.0)
    with patch("src.detection.behaviors.time.time", return_value=1000.0):
        det.update(1, "porch", is_known=False)  # starts as unknown
    with patch("src.detection.behaviors.time.time", return_value=1000.0 + 121.0):
        assert det.update(1, "porch", is_known=True) is False  # recognized meanwhile
    assert 1 not in det.presence  # evicted from tracking


def test_no_zone_no_tracking():
    det = LoiteringDetector(threshold_seconds=120.0)
    with patch("src.detection.behaviors.time.time", return_value=1000.0):
        det.update(1, None, is_known=False)
    assert det.presence == {}


def test_leaving_zone_resets_clock():
    det = LoiteringDetector(threshold_seconds=120.0)
    with patch("src.detection.behaviors.time.time", return_value=1000.0):
        det.update(1, "porch", is_known=False)
        det.update(1, None, is_known=False)  # leaves the zone → evicted
    with patch("src.detection.behaviors.time.time", return_value=1000.0 + 121.0):
        det.update(1, "porch", is_known=False)  # re-enters → clock restarts
        assert det.update(1, "porch", is_known=False) is False


def test_cleanup_removes_gone_tracks():
    det = LoiteringDetector(threshold_seconds=120.0)
    with patch("src.detection.behaviors.time.time", return_value=1000.0):
        det.update(1, "porch", is_known=False)
        det.update(2, "porch", is_known=False)
    det.cleanup(active_track_ids={2})
    assert 1 not in det.presence and 2 in det.presence

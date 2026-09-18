"""
src/detection/tracker.py
────────────────────────
ByteTrack-based multi-object tracker.
Assigns persistent IDs to detected persons across frames,
caching face-recognition results per track ID to avoid redundant calls.

NOTE: supervision deprecates ByteTrack in 0.28–0.30 (removal planned for 0.31,
no in-package replacement yet). pyproject pins supervision<0.31; when a
replacement lands, adapt here.
"""

import time
import warnings

with warnings.catch_warnings():
    warnings.filterwarnings("ignore", message=".*ByteTrack.*deprecated.*", category=FutureWarning)
    from supervision.tracker import ByteTrack


class PersonTracker:
    """
    Wraps ByteTrack to maintain persistent person identities.
    Caches face recognition results per track ID to avoid redundant calls.
    """

    def __init__(self, recognition_cooldown: float = 30.0):
        self.tracker = ByteTrack(
            track_activation_threshold=0.4,
            lost_track_buffer=30,  # Keep lost tracks for 30 frames
            minimum_matching_threshold=0.8,
            frame_rate=5,
        )
        # Cache: track_id → {"name": str, "is_known": bool, "last_recognized": float}
        self.identity_cache: dict[int, dict] = {}
        self.recognition_cooldown = recognition_cooldown  # Re-run recognition after N seconds

    def update(self, detections):
        """Update tracker with new detections. Returns tracked detections with IDs."""
        return self.tracker.update_with_detections(detections)

    def needs_recognition(self, track_id: int) -> bool:
        """Check if a track needs face recognition (new or expired cache)."""
        if track_id not in self.identity_cache:
            return True
        entry = self.identity_cache[track_id]
        elapsed = time.time() - entry["last_recognized"]
        return elapsed > self.recognition_cooldown

    def cache_identity(self, track_id: int, name: str, is_known: bool):
        """Cache a recognition result for a track."""
        self.identity_cache[track_id] = {
            "name": name,
            "is_known": is_known,
            "last_recognized": time.time(),
        }

    def get_cached_identity(self, track_id: int) -> dict | None:
        """Get cached identity for a track, or None if not cached."""
        return self.identity_cache.get(track_id)

    def cleanup_stale_tracks(self):
        """Remove cache entries for tracks that no longer exist."""
        # ByteTrack doesn't expose active IDs easily, so we prune by age
        cutoff = time.time() - (self.recognition_cooldown * 3)
        stale = [tid for tid, info in self.identity_cache.items() if info["last_recognized"] < cutoff]
        for tid in stale:
            del self.identity_cache[tid]

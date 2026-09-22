"""
src/recording/recorder.py
──────────────────────────
Manages FFmpeg recording processes — one per camera.
Records RTSP streams into 15-minute MP4 segments using stream copy (zero CPU).

Retention (Task 2.2) ships here: cleanup runs piggybacked on segment rotation
(~every 15 min per camera) plus a startup sweep — no dedicated thread.
"""

import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

from src.config import RECORDINGS_DIR
from src.models import CameraConfig
from src.recording.index import RecordingIndex

# Host where go2rtc's RTSP proxy listens. "localhost:8554" on bare metal;
# set GO2RTC_HOST=go2rtc:8554 when the backend runs in Docker Compose.
GO2RTC_RTSP_HOST = os.getenv('GO2RTC_HOST', 'localhost:8554')

# Directory re-index cadence while FFmpeg runs (segment rotation detection)
INDEX_POLL_SECONDS = 60.0


def _check_ffmpeg_available() -> bool:
  """Check if the ffmpeg binary is installed."""
  try:
    subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
    return True
  except (FileNotFoundError, subprocess.TimeoutExpired):
    return False


class CameraRecorder:
  """Manages FFmpeg recording for a single camera."""

  def __init__(
    self,
    config: CameraConfig,
    recordings_dir: Path | None = None,
    index: 'RecordingIndex | None' = None,
  ):
    self.config = config
    self.process: subprocess.Popen | None = None
    self.is_running = False
    self._monitor_thread: threading.Thread | None = None
    self.output_dir = (recordings_dir or RECORDINGS_DIR) / config.id
    self.output_dir.mkdir(parents=True, exist_ok=True)
    # Recordings index (shared aegis.db) — optional so tests can run without one
    self.index = index
    # go2rtc proxy (single connection per camera — see src/go2rtc.py).
    # record.source_url overrides for dev testing (ffmpeg testsrc, looped mp4).
    self.source_url = config.record.source_url or f'rtsp://{GO2RTC_RTSP_HOST}/{config.id}'

  def start(self):
    """Start FFmpeg recording process."""
    if not self.config.enabled or not self.config.record.enabled:
      print(f'[Recorder] Skipping {self.config.id} (camera or recording disabled)')
      return

    # Backfill the index from any segments already on disk (downtime, first
    # run) — before and independent of the ffmpeg check: indexing existing
    # footage never needs the binary.
    self._rescan_index()

    if not _check_ffmpeg_available():
      print(f'[Recorder] ERROR: ffmpeg binary not found — cannot record {self.config.id}')
      return

    self.is_running = True
    self._monitor_thread = threading.Thread(
      target=self._run_with_restart,
      daemon=True,
      name=f'Recorder-{self.config.id}',
    )
    self._monitor_thread.start()

  def _rescan_index(self) -> None:
    """Idempotent directory scan → index rows (new/changed files only)."""
    if self.index is None:
      return
    try:
      self.index.scan_directory(camera_id=self.config.id)
    except Exception as exc:  # indexing must never take recording down
      print(f'[Recorder] Index scan failed for {self.config.id}: {exc}')

  def _build_ffmpeg_cmd(self) -> list[str]:
    """Build the FFmpeg command for segment recording."""
    output_pattern = str(self.output_dir / '%Y%m%d_%H%M%S.mp4')
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error']
    # RTSP-specific input options break non-RTSP sources (file/testsrc dev
    # overrides) — ffmpeg exits instantly with "Option rtsp_transport not
    # found". Only add them for actual rtsp:// URLs.
    if self.source_url.startswith('rtsp://'):
      cmd += ['-rtsp_transport', 'tcp']
      input_url = self.source_url
    else:
      # Local file dev override — absolutize so the subprocess cwd doesn't
      # matter (Path.resolve() on a URL would mangle it). NOTE: file sources
      # are consumed faster than real-time under stream copy (-re can't pace
      # -c copy), so wall-clock segment spans run short vs content duration;
      # real RTSP cameras don't have this quirk.
      input_url = str(Path(self.source_url).resolve())
    cmd += [
      '-use_wallclock_as_timestamps',
      '1',
      '-i',
      input_url,
      '-vcodec',
      'copy',
      '-acodec',
      'copy',
      '-f',
      'segment',
      '-segment_time',
      str(self.config.record.segment_seconds),
      '-segment_format',
      'mp4',
      '-segment_atclocktime',
      '1',
      '-strftime',
      '1',
      '-reset_timestamps',
      '1',
      output_pattern,
    ]
    return cmd

  def _run_with_restart(self):
    """Run FFmpeg and auto-restart on crash (with backoff)."""
    backoff = 5
    while self.is_running:
      cmd = self._build_ffmpeg_cmd()
      print(f'[Recorder] Starting FFmpeg for {self.config.id}')
      try:
        # stderr=DEVNULL prevents pipe deadlock: with PIPE + wait(),
        # a full stderr pipe blocks ffmpeg and wait() never returns.
        self.process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # Poll in short liveness ticks: notice a dead ffmpeg within ~1s
        # (its final segment then gets indexed immediately), and re-index
        # the output directory every INDEX_POLL_SECONDS so rotations land
        # and the in-progress segment's size/end-time stay fresh.
        alive_seconds = 0.0
        while self.is_running and self.process.poll() is None:
          time.sleep(1.0)
          alive_seconds += 1.0
          if alive_seconds >= INDEX_POLL_SECONDS:
            alive_seconds = 0.0
            self._rescan_index()
        if self.is_running:
          print(f'[Recorder] FFmpeg exited for {self.config.id} (code={self.process.returncode})')
      except Exception as e:
        print(f'[Recorder] FFmpeg error for {self.config.id}: {e}')

      # Final scan catches the last segment written before exit
      self._rescan_index()

      # Piggyback retention cleanup: each segment is ~15 min, so this
      # runs every ~15 min per camera — no dedicated cleanup thread.
      self.cleanup_old_segments()

      if self.is_running:
        print(f'[Recorder] Restarting {self.config.id} in {backoff}s...')
        time.sleep(backoff)
        backoff = min(backoff * 2, 60)  # Exponential backoff, max 60s

  def cleanup_old_segments(self):
    """
    Delete recording segments based on retention and disk-space policy.
    - If delete_only_if_disk_full is True (default):
      Only delete oldest segments if free disk space < min_disk_free_gb
      or camera storage exceeds max_disk_usage_gb. As long as disk has space,
      footage is preserved even past retain_days!
    - If delete_only_if_disk_full is False:
      Strictly delete segments older than retain_days.
    """
    cfg = self.config.record
    if not self.output_dir.exists():
      return

    segments = sorted(self.output_dir.glob('*.mp4'), key=lambda f: f.stat().st_mtime)
    if not segments:
      return

    now = time.time()
    cutoff = now - (cfg.retain_days * 86400)

    # Drive-level free space on the output volume
    try:
      _, _, free_bytes = shutil.disk_usage(self.output_dir)
      free_gb = free_bytes / (1024**3)
    except OSError:
      free_gb = float('inf')

    # Total space used by this camera
    cam_bytes = sum(f.stat().st_size for f in segments if f.exists())
    cam_gb = cam_bytes / (1024**3)

    deleted = 0
    freed = 0

    if cfg.delete_only_if_disk_full:
      # Only prune if disk free space is low or per-camera max cap is exceeded
      needs_space = (free_gb < cfg.min_disk_free_gb) or (
        cfg.max_disk_usage_gb is not None and cam_gb > cfg.max_disk_usage_gb
      )
      if not needs_space:
        return  # Ample space available — no deletion!

      # Prune oldest segments first until a safe threshold is restored.
      # Each threshold stops the purge independently: once the camera is
      # back under its quota it must not keep deleting just because the
      # *volume* is still tight (that pressure belongs to other cameras).
      for segment in segments:
        if free_gb >= cfg.min_disk_free_gb:
          break
        if cfg.max_disk_usage_gb is not None and cam_gb <= cfg.max_disk_usage_gb:
          break
        try:
          size = segment.stat().st_size
          segment.unlink()
          self._drop_index_row(segment)
          deleted += 1
          freed += size
          free_gb += size / (1024**3)
          cam_gb -= size / (1024**3)
        except OSError:
          pass
    else:
      # Strict time-based cutoff
      for segment in segments:
        try:
          stat = segment.stat()
          if stat.st_mtime < cutoff:
            freed += stat.st_size
            segment.unlink()
            self._drop_index_row(segment)
            deleted += 1
        except OSError:
          pass

    if deleted:
      print(
        f'[Retention] {self.config.id}: pruned {deleted} segments, '
        f'freed {freed / (1024 * 1024):.1f} MB (free: {free_gb:.1f} GB)'
      )

  def _drop_index_row(self, segment: Path) -> None:
    """Keep the recordings index in sync when retention deletes a file."""
    if self.index is None:
      return
    try:
      self.index.delete_path(segment)
    except Exception:
      pass  # index drift is cosmetic; the next directory scan reconciles

  def stop(self):
    """Stop recording."""
    self.is_running = False
    if self.process:
      self.process.terminate()
      try:
        self.process.wait(timeout=10)
      except subprocess.TimeoutExpired:
        self.process.kill()


class RecordingManager:
  """Manages recorders for all cameras."""

  def __init__(
    self,
    cameras: list[CameraConfig],
    recordings_dir: Path | None = None,
    index: RecordingIndex | None = None,
  ):
    # Remember ctor args so cameras added at runtime (Settings CRUD) can get
    # recorders with the same output dir + index.
    self._recordings_dir = recordings_dir
    self._index = index
    self.recorders = {
      cam.id: CameraRecorder(cam, recordings_dir=recordings_dir, index=index)
      for cam in cameras
      if cam.enabled and cam.record.enabled
    }

  def start_all(self):
    for recorder in self.recorders.values():
      recorder.start()
    print(f'[RecordingManager] Started {len(self.recorders)} recorders')

  def start_camera(self, cam: CameraConfig) -> None:
    """Start a recorder for a camera added at runtime (no-op if recording off)."""
    if not (cam.enabled and cam.record.enabled) or cam.id in self.recorders:
      return
    recorder = CameraRecorder(cam, recordings_dir=self._recordings_dir, index=self._index)
    self.recorders[cam.id] = recorder
    recorder.start()

  def stop_camera(self, camera_id: str) -> None:
    """Stop one camera's recorder (live camera deletion/update)."""
    recorder = self.recorders.pop(camera_id, None)
    if recorder is not None:
      recorder.stop()

  def stop_all(self):
    for recorder in self.recorders.values():
      recorder.stop()

  def cleanup_all(self):
    """One-time cleanup sweep — call at startup to clear old segments from downtime."""
    for recorder in self.recorders.values():
      recorder.cleanup_old_segments()

  def get_status(self) -> dict:
    return {
      cam_id: {
        'recording': rec.is_running and rec.process is not None and rec.process.poll() is None,
        'output_dir': str(rec.output_dir),
      }
      for cam_id, rec in self.recorders.items()
    }

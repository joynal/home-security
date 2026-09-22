/**
 * PlaybackPage — Phase 3 (Tasks S3.1, S3.2, S3.3)
 * Full Scrypted NVR Playback experience:
 * - Desktop: 1fr video player + 340px vertical timeline scrubber
 * - Mobile: Sticky 16:9 top video player docked during timeline scrolling
 * - HTML5 Range seeking with 15-minute segment auto-advance
 * - Controls: Play/Pause, ±10s, Prev/Next event, Speed switcher (0.5x, 1x, 2x, 4x)
 * - Keyboard shortcuts: Space, J, K, L, [, ], F
 * - Clip Exporter (Task S3.3) for downloading MP4 ranges
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Download,
  Maximize,
  Radio,
  Clock,
  Film,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import TimelineRail from '@/components/TimelineRail';
import { dayStartEpoch, tsToY } from '@/lib/timeline';
import { cameraService } from '@/services/cameras';
import { eventService } from '@/services/events';
import { recordingService } from '@/services/recordings';
import { tokens } from '@/theme/designTokens';
import type { Camera, NormalizedSegment, SecurityEvent, TimelineResponse } from '@/types';

interface PlaybackMode {
  url: string;
  startEpoch: number;
  filename: string;
}

type Mode = 'live' | PlaybackMode;

/** Timeline zoom presets — px-per-hour (rail is ~790px tall). */
const ZOOM_PRESETS = [
  { label: '1h', pxPerHour: 800 },
  { label: '2h', pxPerHour: 400 },
  { label: '6h', pxPerHour: 132 },
  { label: '24h', pxPerHour: 33 },
] as const;
const DEFAULT_ZOOM = ZOOM_PRESETS[1];

const headerStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.sm,
  flexWrap: 'wrap' as const,
  padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
  background: tokens.colors.surface.default,
  borderBottom: `1px solid ${tokens.colors.border.subtle}`,
};

const selectStyles = {
  background: tokens.colors.surface.subtle,
  color: tokens.colors.text.primary,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.sm,
  height: '32px',
  padding: '0 8px',
  fontFamily: 'inherit',
  fontSize: tokens.fontSizes.sm,
  cursor: 'pointer',
};

const dateNavStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.sm,
  background: tokens.colors.surface.subtle,
  padding: '0 2px',
  height: '32px',
};

const dateInputStyles = {
  background: 'transparent',
  color: tokens.colors.text.primary,
  border: 'none',
  fontFamily: 'inherit',
  fontSize: '12.5px',
  padding: '0 6px',
  width: '128px',
  cursor: 'pointer',
  '&:focus': { outline: 'none' },
};

const navBtnStyles = {
  background: 'transparent',
  border: 'none',
  color: tokens.colors.text.secondary,
  padding: '4px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: tokens.radii.sm,
  '&:hover': {
    color: tokens.colors.text.primary,
    background: tokens.colors.surface.raised,
  },
};

const liveIndicatorBtn = (isLive: boolean) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 12px',
  borderRadius: tokens.radii.sm,
  fontSize: tokens.fontSizes.xs,
  fontWeight: tokens.fontWeights.medium,
  background: isLive ? 'rgba(34, 197, 94, 0.12)' : tokens.colors.surface.raised,
  border: `1px solid ${isLive ? 'rgba(34, 197, 94, 0.3)' : tokens.colors.border.subtle}`,
  color: isLive ? tokens.colors.status.live : tokens.colors.text.primary,
  cursor: 'pointer',
});

const exportBtnStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '32px',
  padding: '0 10px',
  borderRadius: tokens.radii.sm,
  fontSize: tokens.fontSizes.xs,
  fontWeight: tokens.fontWeights.medium,
  background: tokens.colors.surface.subtle,
  border: `1px solid ${tokens.colors.border.subtle}`,
  color: tokens.colors.text.secondary,
  cursor: 'pointer',
  transition: `background ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
  '&:hover': {
    background: tokens.colors.surface.raised,
    color: tokens.colors.text.primary,
  },
};

const shellStyles = {
  display: 'grid',
  gridTemplateColumns: '1fr 340px',
  height: 'calc(100vh - 49px)',
  overflow: 'hidden',
  '@media (max-width: 768px)': {
    display: 'flex',
    flexDirection: 'column' as const,
    // flex:1 + minHeight:0 let the shell shrink inside .app-shell__main
    // (overflow:hidden flex parent) and become the real scroll container —
    // without these the 24h rail is clipped and unscrollable, and the
    // player's position:sticky never engages.
    flex: 1,
    minHeight: 0,
    height: 'auto',
    overflowY: 'auto' as const,
  },
};

const playerContainerStyles = {
  background: '#000',
  display: 'flex',
  flexDirection: 'column' as const,
  position: 'relative' as const,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-width: 768px)': {
    position: 'sticky' as const,
    top: 0,
    zIndex: 30,
    width: '100%',
    aspectRatio: '16 / 9',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.7)',
  },
};

const mediaViewStyles = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative' as const,
  minHeight: 0,
  width: '100%',
  height: '100%',
  '& img, & video': {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  },
};

const scrubOverlayStyles = {
  position: 'absolute' as const,
  inset: 0,
  background: '#000',
  zIndex: 5,
  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  },
};

const scrubBadgeStyles = {
  position: 'absolute' as const,
  bottom: '10px',
  left: '12px',
  background: 'rgba(9, 9, 11, 0.85)',
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.sm,
  padding: '3px 8px',
  fontSize: '12px',
  color: tokens.colors.text.primary,
};

const controlsBarStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
  background: 'rgba(16, 16, 20, 0.95)',
  borderTop: `1px solid ${tokens.colors.border.subtle}`,
  flexShrink: 0,
  gap: tokens.spacing.sm,
  zIndex: 10,
};

const controlGroupStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.xs,
};

const ctrlBtnStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: tokens.radii.sm,
  background: 'transparent',
  border: 'none',
  color: tokens.colors.text.primary,
  cursor: 'pointer',
  transition: `background ${tokens.transitions.fast}`,
  '&:hover': {
    background: tokens.colors.surface.raised,
  },
};

const timelinePaneStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  borderLeft: `1px solid ${tokens.colors.border.subtle}`,
  background: tokens.colors.surface.default,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-width: 768px)': {
    borderLeft: 'none',
    borderTop: `1px solid ${tokens.colors.border.subtle}`,
    overflowY: 'visible' as const,
  },
};

const timelineHeaderStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.sm,
  padding: '10px 14px',
  borderBottom: `1px solid ${tokens.colors.border.subtle}`,
  color: tokens.colors.text.secondary,
  fontSize: tokens.fontSizes.sm,
  fontWeight: tokens.fontWeights.semibold,
  flexShrink: 0,
};

const zoomBtnStyles = (active: boolean) => ({
  height: '22px',
  padding: '0 8px',
  borderRadius: tokens.radii.sm,
  border: `1px solid ${active ? tokens.colors.accent.primary : tokens.colors.border.subtle}`,
  background: active ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
  color: active ? tokens.colors.accent.hover : tokens.colors.text.muted,
  fontSize: '11px',
  fontWeight: tokens.fontWeights.medium,
  cursor: 'pointer',
  '&:hover': {
    color: tokens.colors.text.primary,
  },
});

const timelineScrollStyles = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: '8px 10px 32px',
  scrollbarWidth: 'thin' as const,
  '@media (max-width: 768px)': {
    overflowY: 'visible' as const,
    height: 'auto',
  },
};

const modalOverlayStyles = {
  position: 'fixed' as const,
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: tokens.spacing.md,
};

const modalContentStyles = {
  background: tokens.colors.bg.surface2,
  border: `1px solid ${tokens.colors.border.strong}`,
  borderRadius: tokens.radii.default,
  padding: tokens.spacing.lg,
  maxWidth: '420px',
  width: '100%',
  boxShadow: tokens.shadows.modal,
};

function localDateStr(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The LOCAL calendar day [start, end) — the timeline renders local time end-to-end. */
function dayRange(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  return { start, end: new Date(start.getTime() + 86400000) };
}

/** Parse a ?ts= query value: epoch seconds or ISO string → epoch seconds (null if unusable). */
function parseTsParam(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 0) return n;
  const iso = new Date(v).getTime() / 1000;
  return !Number.isNaN(iso) && iso > 0 ? iso : null;
}

export default function PlaybackPage() {
  const { cameraId: pathCamId } = useParams<{ cameraId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth();
  const navigate = useNavigate();

  const camParam = searchParams.get('cam');
  const tsEpoch = parseTsParam(searchParams.get('ts'));

  const [cameras, setCameras] = useState<Camera[]>([]);
  // Deep-linked ?ts= without an explicit date: derive the day from the timestamp,
  // otherwise the seek targets the wrong (default: today) day and silently no-ops.
  const date = searchParams.get('date') || (tsEpoch ? localDateStr(new Date(tsEpoch * 1000)) : localDateStr());
  const activeCameraId = pathCamId || camParam || (cameras.length > 0 ? cameras[0].id : '');
  const [timeline, setTimeline] = useState<TimelineResponse>({ hours: [], segments: [] });
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [days, setDays] = useState<string[]>([]);

  // API segments ({start,end,file} ISO/abs-path) → normalized epoch/basename view.
  // NOTE: the API never returned start_epoch/duration_seconds — the previous
  // mismatch made every seek compare against undefined (playback never loaded).
  const segs = useMemo<NormalizedSegment[]>(
    () =>
      timeline.segments
        .map((s) => ({
          name: s.file.split('/').pop() ?? s.file,
          startEpoch: Date.parse(s.start) / 1000,
          endEpoch: Date.parse(s.end) / 1000,
        }))
        .sort((a, b) => a.startEpoch - b.startEpoch),
    [timeline.segments],
  );

  const [mode, setMode] = useState<Mode>('live');
  const [playTs, setPlayTs] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [pxPerHour, setPxPerHour] = useState<number>(DEFAULT_ZOOM.pxPerHour);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportDuration, setExportDuration] = useState<number>(30); // 30s default
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const pendingTs = useRef<number | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  // Scrub preview: debounced frame.jpg fetch while dragging the playhead
  const [scrubPreview, setScrubPreview] = useState<{ url: string; ts: number } | null>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubSeq = useRef(0);
  const previewUrlRef = useRef<string | null>(null);

  const handleScrub = useCallback(
    (ts: number | null) => {
      if (ts == null) {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
        setScrubPreview(null);
        return;
      }
      if (scrubTimer.current) clearTimeout(scrubTimer.current);
      const seq = ++scrubSeq.current;
      const camId = activeCameraId;
      if (!camId) return;
      scrubTimer.current = setTimeout(() => {
        fetch(recordingService.getFrameUrl(camId, Math.round(ts)), { credentials: 'include' })
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (!blob || seq !== scrubSeq.current) return; // stale response
            if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
            const url = URL.createObjectURL(blob);
            previewUrlRef.current = url;
            setScrubPreview({ url, ts });
          })
          .catch(() => {});
      }, 120);
    },
    [activeCameraId],
  );

  // Revoke the last preview object URL on unmount
  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  // Keep the rail viewport anchored around "now" (or day end) on date/zoom changes
  const scrollToNow = useCallback(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const day0 = dayStartEpoch(date);
    const target = Math.min(Date.now() / 1000, day0 + 86400);
    const y = tsToY(target, day0, pxPerHour);
    el.scrollTop = Math.max(0, y - el.clientHeight * 0.3);
  }, [date, pxPerHour]);

  useEffect(() => {
    scrollToNow();
  }, [scrollToNow]);

  // Initial cameras & recording summary load
  useEffect(() => {
    if (!token) return;
    cameraService
      .getCameras()
      .then((d) => {
        setCameras(d.cameras || []);
      })
      .catch(() => {});

    recordingService
      .getSummary()
      .then((d) => setDays(d.days || []))
      .catch(() => {});
  }, [token]);

  // Set pending timestamp from query parameter (?ts=)
  useEffect(() => {
    if (tsEpoch) {
      pendingTs.current = tsEpoch;
    }
  }, [tsEpoch]);

  // Load timeline & events when camera or date changes
  useEffect(() => {
    if (!token || !activeCameraId) return;
    recordingService
      .getTimeline(activeCameraId, date)
      .then((d) => setTimeline({ hours: d.hours || [], segments: d.segments || [] }))
      .catch(() => setTimeline({ hours: [], segments: [] }));

    const { start, end } = dayRange(date);
    eventService
      .getEvents({
        cameraId: activeCameraId,
        since: start.toISOString(),
        until: end.toISOString(),
        limit: 300,
      })
      .then((d) => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, [token, activeCameraId, date]);

  // ── Seek logic ────────────────────────────────────────────────────────────
  const onSeek = useCallback(
    (epochS: number) => {
      if (!activeCameraId) return;
      const seg = segs.find((s) => epochS >= s.startEpoch && epochS < s.endEpoch);

      if (!seg) {
        setPlayTs(epochS);
        return;
      }

      const offset = Math.max(0, epochS - seg.startEpoch);
      const url = recordingService.getRecordingUrl(activeCameraId, seg.name);
      setMode({ url, startEpoch: seg.startEpoch, filename: seg.name });
      setPlayTs(epochS);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.playbackRate = playbackSpeed;
          videoRef.current.currentTime = offset;
          videoRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        }
      }, 50);
    },
    [activeCameraId, segs, playbackSpeed],
  );

  // Trigger pending seek when segments become available
  useEffect(() => {
    if (pendingTs.current && timeline.segments.length > 0) {
      const ts = pendingTs.current;
      pendingTs.current = null;
      onSeek(ts);
    }
  }, [timeline.segments, onSeek]);

  const goLive = () => {
    setMode('live');
    setPlayTs(null);
  };

  const togglePlayPause = () => {
    if (typeof mode !== 'object' || !videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const jumpSeconds = (delta: number) => {
    if (typeof mode !== 'object' || !videoRef.current) return;
    const target = videoRef.current.currentTime + delta;
    // Within this segment → plain seek; across a boundary → resolve the
    // covering segment (or the neighboring one) so ±10s works at edges.
    const seg = segs.find((s) => s.name === mode.filename);
    if (seg && (target < 0 || target > (videoRef.current.duration || Infinity))) {
      onSeek(mode.startEpoch + target);
      return;
    }
    videoRef.current.currentTime = Math.max(0, target);
  };

  const jumpEvent = (direction: 'prev' | 'next') => {
    if (events.length === 0 || playTs === null) return;
    const sorted = [...events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const currentMs = playTs * 1000;

    if (direction === 'prev') {
      const prev = sorted
        .slice()
        .reverse()
        .find((ev) => new Date(ev.timestamp).getTime() < currentMs - 2000);
      if (prev) onSeek(new Date(prev.timestamp).getTime() / 1000);
    } else {
      const next = sorted.find((ev) => new Date(ev.timestamp).getTime() > currentMs + 2000);
      if (next) onSeek(new Date(next.timestamp).getTime() / 1000);
    }
  };

  const cycleSpeed = () => {
    const speeds = [0.5, 1, 2, 4];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const next = speeds[nextIdx];
    setPlaybackSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const onTimeUpdate = () => {
    if (!videoRef.current || typeof mode !== 'object' || !activeCameraId) return;
    const current = mode.startEpoch + videoRef.current.currentTime;
    setPlayTs(current);

    // Auto-advance to the next recorded segment
    if (
      videoRef.current.duration &&
      videoRef.current.currentTime >= videoRef.current.duration - 0.5
    ) {
      const idx = segs.findIndex((s) => s.name === mode.filename);
      if (idx >= 0 && idx + 1 < segs.length) {
        const next = segs[idx + 1];
        const url = recordingService.getRecordingUrl(activeCameraId, next.name);
        setMode({ url, startEpoch: next.startEpoch, filename: next.name });
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.playbackRate = playbackSpeed;
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
          }
        }, 50);
      }
    }
  };

  const shiftDate = (deltaDays: number) => {
    const [y, m, d] = date.split('-').map(Number);
    // Local-math day navigation (UTC construction breaks next-day in negative offsets)
    const nextStr = localDateStr(new Date(y, m - 1, d + deltaDays));
    setSearchParams({ cam: activeCameraId, date: nextStr });
  };

  const handleCameraChange = (newCamId: string) => {
    // Navigate to the query-param form (not just setSearchParams) — on a
    // /playback/:id URL the stale path segment would keep shadowing the
    // selection (activeCameraId = pathCamId || camParam) and the select
    // would silently snap back.
    navigate(`/playback?cam=${encodeURIComponent(newCamId)}&date=${date}`, { replace: true });
  };

  // Keyboard controls (Space, J, K, L, [, ], F) — bind the listener ONCE and
  // route through a ref so the latest render's handlers are used (the previous
  // no-dep effect re-registered the listener on every render).
  const keyHandlerRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});

  useEffect(() => {
    keyHandlerRef.current = (e: globalThis.KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;

      if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        jumpSeconds(-10);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        jumpSeconds(10);
      } else if (e.key === '[') {
        e.preventDefault();
        jumpEvent('prev');
      } else if (e.key === ']') {
        e.preventDefault();
        jumpEvent('next');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (playerRef.current) {
          if (!document.fullscreenElement) {
            playerRef.current.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
      }
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Task S3.3: Clip Exporter Action
  const triggerClipDownload = () => {
    if (!activeCameraId) return;
    const centerTs = playTs || Date.now() / 1000;
    const half = exportDuration / 2;
    const start = Math.round(centerTs - half);
    const end = Math.round(centerTs + half);

    const clipUrl = recordingService.getClipUrl(activeCameraId, start, end, 5.0);

    // Test fetch to check if ffmpeg is present or returned 503
    fetch(clipUrl, { method: 'HEAD', credentials: 'include' })
      .then((res) => {
        if (res.status === 503) {
          setExportNotice('ffmpeg binary is not installed on this server to extract clips.');
          return;
        }
        if (!res.ok) {
          setExportNotice('No recording footage available covering this exact time range.');
          return;
        }
        setShowExportModal(false);
        setExportNotice(null);
        const a = document.createElement('a');
        a.href = clipUrl;
        a.download = `${activeCameraId}_clip_${start}_${end}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch(() => {
        setExportNotice('Network error while requesting video clip.');
      });
  };

  const activeCamera = cameras.find((c) => c.id === activeCameraId);
  const liveFeedUrl =
    activeCamera?.online && activeCameraId ? cameraService.getVideoFeedUrl(activeCameraId) : null;

  return (
    <>
      <header css={headerStyles}>
        <button
          type="button"
          css={navBtnStyles}
          onClick={() => navigate('/')}
          aria-label="Back to dashboard"
          title="Back to Dashboard"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Camera Selector */}
        <select
          css={selectStyles}
          value={activeCameraId}
          onChange={(e) => handleCameraChange(e.target.value)}
          aria-label="Select camera"
        >
          {cameras.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.online ? '(Live)' : '(Offline)'}
            </option>
          ))}
        </select>

        {/* Date Navigator */}
        <div css={dateNavStyles}>
          <button
            type="button"
            css={navBtnStyles}
            onClick={() => shiftDate(-1)}
            aria-label="Previous day"
            title="Previous day"
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            css={dateInputStyles}
            className="tnum"
            value={date}
            max={localDateStr()}
            onChange={(e) => {
              if (e.target.value) {
                setSearchParams({ cam: activeCameraId, date: e.target.value });
              }
            }}
            aria-label="Playback date"
            title={days.length ? `Recordings exist for: ${days.join(', ')}` : 'Select date'}
          />
          <button
            type="button"
            css={navBtnStyles}
            onClick={() => shiftDate(1)}
            aria-label="Next day"
            title="Next day"
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Live vs Playback toggle */}
        {mode === 'live' ? (
          <span css={liveIndicatorBtn(true)}>
            <span className="status-dot status-dot--live" /> Live
          </span>
        ) : (
          <button type="button" css={liveIndicatorBtn(false)} onClick={goLive}>
            <Radio size={13} /> Back to Live
          </button>
        )}

        <span style={{ marginLeft: 'auto' }} />

        {/* Clip Export Action (Task S3.3) */}
        <button
          type="button"
          css={exportBtnStyles}
          onClick={() => setShowExportModal(true)}
          title="Export and download MP4 clip"
          aria-label="Export clip"
        >
          <Film size={14} />
          <span>Export Clip</span>
        </button>
      </header>

      <div css={shellStyles}>
        {/* Left Pane: Video Player */}
        <div ref={playerRef} css={playerContainerStyles}>
          <div css={mediaViewStyles}>
            {/* Scrub preview overlay (Task R5) — frame.jpg at the dragged time */}
            {scrubPreview && (
              <div css={scrubOverlayStyles}>
                <img src={scrubPreview.url} alt="Scrub preview" />
                <span css={scrubBadgeStyles} className="tnum">
                  {new Date(scrubPreview.ts * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
            )}
            {mode === 'live' ? (
              liveFeedUrl ? (
                <img
                  src={liveFeedUrl}
                  crossOrigin="use-credentials"
                  alt={`${activeCamera?.name ?? activeCameraId} live feed`}
                />
              ) : (
                <div css={{ color: tokens.colors.text.muted, fontSize: tokens.fontSizes.base }}>
                  Camera offline
                </div>
              )
            ) : (
              <video
                ref={videoRef}
                key={mode.url}
                src={mode.url}
                crossOrigin="use-credentials"
                playsInline
                autoPlay
                onTimeUpdate={onTimeUpdate}
                onClick={togglePlayPause}
              />
            )}
          </div>

          {/* Controls Bar for Playback mode */}
          {mode !== 'live' && (
            <div css={controlsBarStyles}>
              <div css={controlGroupStyles}>
                <button
                  type="button"
                  css={ctrlBtnStyles}
                  onClick={togglePlayPause}
                  aria-label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>

                <button
                  type="button"
                  css={ctrlBtnStyles}
                  onClick={() => jumpSeconds(-10)}
                  aria-label="Rewind 10s (J)"
                  title="Rewind 10s (J)"
                >
                  <RotateCcw size={15} />
                </button>

                <button
                  type="button"
                  css={ctrlBtnStyles}
                  onClick={() => jumpSeconds(10)}
                  aria-label="Forward 10s (L)"
                  title="Forward 10s (L)"
                >
                  <RotateCw size={15} />
                </button>

                <button
                  type="button"
                  css={ctrlBtnStyles}
                  onClick={() => jumpEvent('prev')}
                  aria-label="Previous Event ([)"
                  title="Previous Event ([)"
                >
                  <SkipBack size={15} />
                </button>

                <button
                  type="button"
                  css={ctrlBtnStyles}
                  onClick={() => jumpEvent('next')}
                  aria-label="Next Event (])"
                  title="Next Event (])"
                >
                  <SkipForward size={15} />
                </button>
              </div>

              <div css={controlGroupStyles}>
                {/* Speed Switcher */}
                <button
                  type="button"
                  css={{
                    ...ctrlBtnStyles,
                    width: 'auto',
                    padding: '0 8px',
                    fontSize: '11px',
                    fontWeight: tokens.fontWeights.semibold,
                  }}
                  onClick={cycleSpeed}
                  title="Playback speed"
                >
                  {playbackSpeed}x
                </button>

                {/* Fullscreen */}
                <button
                  type="button"
                  css={ctrlBtnStyles}
                  onClick={() => {
                    if (playerRef.current) {
                      if (!document.fullscreenElement) {
                        playerRef.current.requestFullscreen().catch(() => {});
                      } else {
                        document.exitFullscreen().catch(() => {});
                      }
                    }
                  }}
                  aria-label="Toggle Fullscreen (F)"
                  title="Fullscreen (F)"
                >
                  <Maximize size={15} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Pane: Scrypted Vertical Timeline */}
        <aside css={timelinePaneStyles} aria-label="Scrypted vertical timeline">
          <div css={timelineHeaderStyles}>
            <div css={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={14} color={tokens.colors.accent.primary} />
              <span>Timeline</span>
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: '4px' }}>
              {ZOOM_PRESETS.map((z) => (
                <button
                  key={z.label}
                  type="button"
                  css={zoomBtnStyles(pxPerHour === z.pxPerHour)}
                  onClick={() => setPxPerHour(z.pxPerHour)}
                  title={`${z.label} window`}
                  aria-pressed={pxPerHour === z.pxPerHour}
                >
                  {z.label}
                </button>
              ))}
              <button
                type="button"
                css={zoomBtnStyles(false)}
                onClick={scrollToNow}
                title="Scroll the timeline to now"
              >
                Now
              </button>
            </div>
            <span className="tnum" css={{ color: tokens.colors.text.muted, fontSize: '11px' }}>
              {events.length} events
            </span>
          </div>

          <div css={timelineScrollStyles} ref={timelineScrollRef}>
            <TimelineRail
              date={date}
              segments={segs}
              events={events}
              playTs={playTs}
              onSeek={onSeek}
              onScrub={handleScrub}
              pxPerHour={pxPerHour}
              cameraId={activeCameraId}
              token={token}
            />
          </div>
        </aside>
      </div>

      {/* Task S3.3: Clip Exporter Modal */}
      {showExportModal && (
        <div css={modalOverlayStyles} onClick={() => setShowExportModal(false)} role="dialog">
          <div css={modalContentStyles} onClick={(e) => e.stopPropagation()}>
            <div
              css={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: tokens.spacing.md,
              }}
            >
              <div css={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Film size={16} color={tokens.colors.accent.primary} />
                <span
                  css={{ fontSize: tokens.fontSizes.base, fontWeight: tokens.fontWeights.semibold }}
                >
                  Export Video Clip
                </span>
              </div>
              <button
                type="button"
                css={navBtnStyles}
                onClick={() => setShowExportModal(false)}
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <p
              css={{
                fontSize: tokens.fontSizes.xs,
                color: tokens.colors.text.secondary,
                marginBottom: tokens.spacing.md,
              }}
            >
              Download an MP4 clip centered around the current playhead position.
            </p>

            <div css={{ display: 'flex', gap: tokens.spacing.xs, marginBottom: tokens.spacing.md }}>
              {[15, 30, 60, 120].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  css={{
                    flex: 1,
                    padding: `${tokens.spacing.xs} 0`,
                    borderRadius: tokens.radii.sm,
                    border: `1px solid ${exportDuration === dur ? tokens.colors.accent.primary : tokens.colors.border.subtle}`,
                    background:
                      exportDuration === dur
                        ? tokens.colors.accent.primary
                        : tokens.colors.surface.raised,
                    color: exportDuration === dur ? '#fff' : tokens.colors.text.primary,
                    fontSize: tokens.fontSizes.xs,
                    fontWeight: tokens.fontWeights.medium,
                    cursor: 'pointer',
                  }}
                  onClick={() => setExportDuration(dur)}
                >
                  {dur < 60 ? `${dur}s` : `${dur / 60}m`}
                </button>
              ))}
            </div>

            {exportNotice && (
              <div
                css={{
                  padding: tokens.spacing.sm,
                  borderRadius: tokens.radii.sm,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: tokens.colors.status.danger,
                  fontSize: tokens.fontSizes.xs,
                  marginBottom: tokens.spacing.md,
                }}
              >
                {exportNotice}
              </div>
            )}

            <div css={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.spacing.sm }}>
              <button
                type="button"
                css={{
                  padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                  borderRadius: tokens.radii.sm,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  background: 'transparent',
                  color: tokens.colors.text.secondary,
                  cursor: 'pointer',
                  fontSize: tokens.fontSizes.sm,
                }}
                onClick={() => setShowExportModal(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                css={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
                  borderRadius: tokens.radii.sm,
                  border: 'none',
                  background: tokens.colors.accent.primary,
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: tokens.fontSizes.sm,
                  fontWeight: tokens.fontWeights.medium,
                  '&:hover': {
                    background: tokens.colors.accent.hover,
                  },
                }}
                onClick={triggerClipDownload}
              >
                <Download size={14} />
                <span>Download Clip</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Camera detail — player left + vertical timeline rail right (the flagship).
 * Live mode: MJPEG stream. Scrub/click the rail (or an event thumbnail):
 * resolves the covering segment (playback info from /events, segments from
 * /timeline) and plays the MP4 at an offset; auto-advances across segments.
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PanelRightClose, Radio } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import TimelineRail from '../components/TimelineRail';
import { cameraService } from '../services/cameras';
import { eventService } from '../services/events';
import { recordingService } from '../services/recordings';
import type { Camera, SecurityEvent, TimelineResponse } from '../types';

interface PlaybackMode {
  url: string;
  startEpoch: number;
  filename: string;
}

type Mode = 'live' | PlaybackMode;

const headerStyles = {
  gap: '6px',
};

const cameraSelectStyles = {
  background: 'var(--surface-2)',
  color: 'var(--text-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  height: '30px',
  padding: '0 8px',
  fontFamily: 'inherit',
  fontSize: '13px',
};

const dateContainerStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0 2px',
  height: '30px',
};

const dateInputStyles = {
  background: 'transparent',
  color: 'var(--text-1)',
  border: 'none',
  fontFamily: 'inherit',
  fontSize: '12.5px',
  padding: '0 4px',
  width: '128px',
  '&:focus': { outline: 'none', color: 'var(--accent-hover)' },
};

const modeLiveStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  height: '30px',
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12.5px',
  fontWeight: 500,
  color: 'var(--live)',
};

const modePlaybackStyles = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  height: '30px',
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12.5px',
  fontWeight: 500,
  color: 'var(--text-1)',
  background: 'var(--surface-3)',
};

const bodyStyles = {
  flex: 1,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '1fr 320px',
  '@media (max-width: 900px)': {
    gridTemplateColumns: '1fr',
    gridTemplateRows: '1fr 240px',
  },
};

const playerStyles = {
  background: '#000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative' as const,
  overflow: 'hidden',
  minHeight: 0,
  '& img, & video': {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
  },
};

const playerEmptyStyles = {
  color: 'var(--text-3)',
  fontSize: '13px',
};

const railStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  borderLeft: '1px solid var(--border)',
  minHeight: 0,
  background: 'var(--surface)',
  '@media (max-width: 900px)': {
    borderLeft: 'none',
    borderTop: '1px solid var(--border)',
  },
};

const railHeadStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  padding: '10px 14px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-2)',
  fontSize: '12px',
  fontWeight: 600,
  flexShrink: 0,
  '& span:last-child': {
    marginLeft: 'auto',
    color: 'var(--text-3)',
    fontWeight: 400,
  },
};

const railScrollStyles = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: '6px 10px 24px',
  scrollbarWidth: 'thin' as const,
};

function localDateStr(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayRange(date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  return { start, end: new Date(start.getTime() + 86400000) };
}

export default function CameraDetailPage() {
  const { cameraId } = useParams<{ cameraId: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const date = searchParams.get('date') || localDateStr();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [timeline, setTimeline] = useState<TimelineResponse>({ hours: [], segments: [] });
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [days, setDays] = useState<string[]>([]);

  // 'live' | { url, startEpoch, filename } — playback rides the <video>
  const [mode, setMode] = useState<Mode>('live');
  const [playTs, setPlayTs] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Deep link (?ts=) from the events drawer — seek once segments are loaded
  const pendingTs = useRef<number | null>(null);
  const tsParam = searchParams.get('ts');
  useEffect(() => {
    if (tsParam && Number(tsParam) > 0) pendingTs.current = Number(tsParam);
  }, [tsParam]);

  // ── Data loading ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    cameraService.getCameras()
      .then(d => setCameras(d.cameras || []))
      .catch(() => {});
    recordingService.getSummary()
      .then(d => setDays(d.days || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !cameraId) return;
    recordingService.getTimeline(cameraId, date)
      .then(d => setTimeline({ hours: d.hours || [], segments: d.segments || [] }))
      .catch(() => setTimeline({ hours: [], segments: [] }));

    const { start, end } = dayRange(date);
    eventService.getEvents({
      cameraId,
      since: start.toISOString(),
      until: end.toISOString(),
      limit: 300,
    })
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, [token, cameraId, date]);

  // ── Playback control ────────────────────────────────────
  const onSeek = (epochS: number) => {
    const seg = timeline.segments.find(
      s => epochS >= s.start_epoch && epochS < s.start_epoch + s.duration_seconds
    );
    if (!seg || !cameraId) {
      setPlayTs(epochS);
      return;
    }
    const offset = Math.max(0, epochS - seg.start_epoch);
    const url = recordingService.getRecordingUrl(cameraId, seg.filename);
    setMode({ url, startEpoch: seg.start_epoch, filename: seg.filename });
    setPlayTs(epochS);
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = offset;
        videoRef.current.play().catch(() => {});
      }
    }, 50);
  };

  // Deep-link seek once segments are ready
  useEffect(() => {
    if (pendingTs.current && timeline.segments.length > 0) {
      const ts = pendingTs.current;
      pendingTs.current = null;
      onSeek(ts);
    }
  });

  const goLive = () => {
    setMode('live');
    setPlayTs(null);
  };

  const onTimeUpdate = () => {
    if (!videoRef.current || typeof mode !== 'object' || !cameraId) return;
    const current = mode.startEpoch + videoRef.current.currentTime;
    setPlayTs(current);

    // Auto-advance: within 0.5s of end, jump to next segment if one exists
    if (videoRef.current.duration && videoRef.current.currentTime >= videoRef.current.duration - 0.5) {
      const idx = timeline.segments.findIndex(s => s.filename === mode.filename);
      if (idx >= 0 && idx + 1 < timeline.segments.length) {
        const next = timeline.segments[idx + 1];
        const url = recordingService.getRecordingUrl(cameraId, next.filename);
        setMode({ url, startEpoch: next.start_epoch, filename: next.filename });
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.currentTime = 0;
            videoRef.current.play().catch(() => {});
          }
        }, 50);
      }
    }
  };

  const shiftDate = (deltaDays: number) => {
    const [y, m, d] = date.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
    setSearchParams({ date: localDateStr(next) });
  };

  const camera = cameras.find(c => c.id === cameraId);
  const liveFeedUrl = camera?.online && cameraId
    ? cameraService.getVideoFeedUrl(cameraId)
    : null;

  return (
    <>
      <header className="page-header" css={headerStyles}>
        <button className="btn-ghost" onClick={() => navigate('/')}>
          <ChevronLeft size={15} strokeWidth={1.75} /> All cameras
        </button>
        <select
          css={cameraSelectStyles}
          value={cameraId || ''}
          onChange={e => navigate(`/camera/${e.target.value}`)}
          aria-label="Switch camera"
        >
          {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <span className="page-header__spacer" />

        <div css={dateContainerStyles}>
          <button className="btn-ghost" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            css={dateInputStyles}
            className="tnum"
            value={date}
            max={localDateStr()}
            onChange={e => { if (e.target.value) setSearchParams({ date: e.target.value }); }}
            aria-label="Timeline date"
            title={days.length ? `Days with recordings: ${days.join(', ')}` : 'No recordings yet'}
          />
          <button className="btn-ghost" onClick={() => shiftDate(1)} aria-label="Next day">
            <ChevronRight size={14} />
          </button>
        </div>

        {mode === 'live' ? (
          <span css={modeLiveStyles}>
            <span className="status-dot status-dot--live" /> Live
            {camera?.fps !== undefined && camera.fps > 0 && <span className="tnum">· {Math.round(camera.fps)} fps</span>}
          </span>
        ) : (
          <button css={modePlaybackStyles} onClick={goLive}>
            <Radio size={13} strokeWidth={1.75} /> Back to live
          </button>
        )}
      </header>

      <div css={bodyStyles}>
        <div css={playerStyles}>
          {mode === 'live' ? (
            liveFeedUrl ? (
              <img src={liveFeedUrl} crossOrigin="use-credentials" alt={`${camera?.name ?? cameraId} live`} />
            ) : (
              <div css={playerEmptyStyles}>Camera offline</div>
            )
          ) : (
            <video
              ref={videoRef}
              key={mode.url}
              src={mode.url}
              crossOrigin="use-credentials"
              controls
              autoPlay
              onTimeUpdate={onTimeUpdate}
            />
          )}
        </div>

        <aside css={railStyles} aria-label="Timeline">
          <div css={railHeadStyles}>
            <PanelRightClose size={13} strokeWidth={1.75} />
            <span>Timeline</span>
            <span className="tnum">{events.length} events</span>
          </div>
          <div css={railScrollStyles}>
            <TimelineRail
              date={date}
              hours={timeline.hours}
              events={events}
              playTs={playTs}
              onSeek={onSeek}
              token={token}
            />
          </div>
        </aside>
      </div>
    </>
  );
}

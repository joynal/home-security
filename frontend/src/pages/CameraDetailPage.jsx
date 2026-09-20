/**
 * Camera detail — player left + vertical timeline rail right (the flagship).
 * Live mode: MJPEG stream. Scrub/click the rail (or an event thumbnail):
 * resolves the covering segment (playback info from /events, segments from
 * /timeline) and plays the MP4 at an offset; auto-advances across segments.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, PanelRightClose, Radio } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import TimelineRail from '../components/TimelineRail';
import './CameraDetailPage.css';

const API = 'http://localhost:8000';

function localDateStr(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayRange(date) {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  return { start, end: new Date(start.getTime() + 86400000) };
}

export default function CameraDetailPage() {
  const { cameraId } = useParams();
  const { token, authHeaders } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const date = searchParams.get('date') || localDateStr();
  const [cameras, setCameras] = useState([]);
  const [timeline, setTimeline] = useState({ hours: [], segments: [] });
  const [events, setEvents] = useState([]);
  const [days, setDays] = useState([]);

  // 'live' | { url, startEpoch } — playback rides the <video>
  const [mode, setMode] = useState('live');
  const [playTs, setPlayTs] = useState(null);
  const videoRef = useRef(null);
  // Deep link (?ts=) from the events drawer — seek once segments are loaded
  const pendingTs = useRef(null);
  const tsParam = searchParams.get('ts');
  useEffect(() => {
    if (tsParam && Number(tsParam) > 0) pendingTs.current = Number(tsParam);
  }, [tsParam]);

  // ── Data loading ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/cameras`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setCameras(d.cameras || []))
      .catch(() => {});
    fetch(`${API}/recordings/summary`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setDays(d.days || []))
      .catch(() => {});
  }, [token, authHeaders]);

  useEffect(() => {
    if (!token || !cameraId) return;
    fetch(`${API}/recordings/${cameraId}/timeline?date=${date}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setTimeline({ hours: d.hours || [], segments: d.segments || [] }))
      .catch(() => setTimeline({ hours: [], segments: [] }));

    const { start, end } = dayRange(date);
    fetch(
      `${API}/events?camera_id=${cameraId}&since=${start.toISOString()}&until=${end.toISOString()}&limit=300`,
      { headers: authHeaders() }
    )
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => setEvents([]));
  }, [token, cameraId, date, authHeaders]);

  const camera = useMemo(
    () => cameras.find(c => c.id === cameraId),
    [cameras, cameraId]
  );

  const segmentForTs = useCallback(
    (epochSecs) => {
      const ts = new Date(epochSecs * 1000).toISOString();
      return (timeline.segments || []).find(
        s => s.start <= ts && ts <= s.end
      );
    },
    [timeline.segments]
  );

  // ── Playback ────────────────────────────────────────────
  const playAt = useCallback(
    (epochSecs) => {
      const seg = segmentForTs(epochSecs);
      if (!seg) return false;
      const offset = epochSecs - new Date(seg.start).getTime() / 1000;
      const file = seg.file.split('/').pop();
      setMode({
        url: `${API}/recordings/${cameraId}/${file}?token=${encodeURIComponent(token)}#t=${offset}`,
        startEpoch: new Date(seg.start).getTime() / 1000,
        segStart: seg.start,
      });
      setPlayTs(epochSecs);
      return true;
    },
    [segmentForTs, cameraId, token]
  );

  const onSeek = useCallback(
    (epochSecs) => {
      if (!playAt(epochSecs)) {
        // No recording at that time — still move the playhead for feedback
        setPlayTs(epochSecs);
      }
    },
    [playAt]
  );

  // Fire the pending deep-link seek once the timeline data arrives
  useEffect(() => {
    if (pendingTs.current && timeline.segments.length) {
      const ts = pendingTs.current;
      pendingTs.current = null;
      playAt(ts);
    }
  }, [timeline.segments, playAt]);

  // Follow the video clock; auto-advance at segment ends
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || typeof mode !== 'object') return;
    setPlayTs(mode.startEpoch + v.currentTime);

    if (v.duration && v.duration - v.currentTime < 0.6) {
      const nextEnd = mode.startEpoch + v.duration + 1;
      if (!playAt(nextEnd)) setMode('live'); // ran off the recordings → back to live
    }
  };

  const goLive = () => { setMode('live'); setPlayTs(null); };

  // Esc back to the grid
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') navigate('/'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const shiftDate = (deltaDays) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + deltaDays);
    const next = d.toISOString().slice(0, 10);
    if (next <= localDateStr()) setSearchParams({ date: next });
  };

  const liveFeedUrl = camera?.online
    ? `${API}/video_feed/${cameraId}?token=${encodeURIComponent(token)}`
    : null;

  return (
    <>
      <header className="page-header cd-header">
        <button className="btn-ghost" onClick={() => navigate('/')}>
          <ChevronLeft size={15} strokeWidth={1.75} /> All cameras
        </button>
        <select
          className="cd-camera-select"
          value={cameraId}
          onChange={e => navigate(`/camera/${e.target.value}`)}
          aria-label="Switch camera"
        >
          {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <span className="page-header__spacer" />

        <div className="cd-date">
          <button className="btn-ghost" onClick={() => shiftDate(-1)} aria-label="Previous day">
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            className="cd-date__input tnum"
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
          <span className="cd-mode cd-mode--live">
            <span className="status-dot status-dot--live" /> Live
            {camera?.fps > 0 && <span className="tnum">· {Math.round(camera.fps)} fps</span>}
          </span>
        ) : (
          <button className="cd-mode cd-mode--playback" onClick={goLive}>
            <Radio size={13} strokeWidth={1.75} /> Back to live
          </button>
        )}
      </header>

      <div className="cd-body">
        <div className="cd-player">
          {mode === 'live' ? (
            liveFeedUrl ? (
              <img src={liveFeedUrl} alt={`${camera?.name ?? cameraId} live`} />
            ) : (
              <div className="cd-player__empty">Camera offline</div>
            )
          ) : (
            <video
              ref={videoRef}
              key={mode.url}
              src={mode.url}
              controls
              autoPlay
              onTimeUpdate={onTimeUpdate}
            />
          )}
        </div>

        <aside className="cd-rail" aria-label="Timeline">
          <div className="cd-rail__head">
            <PanelRightClose size={13} strokeWidth={1.75} />
            <span>Timeline</span>
            <span className="tnum">{events.length} events</span>
          </div>
          <div className="cd-rail__scroll">
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

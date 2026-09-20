/**
 * Events page v2 — the triage browser.
 * Filter chips with counts, camera/person/date filters, Scrypted-style rows,
 * and a detail drawer: Play jumps into the camera timeline; unknown events
 * offer "Name this person" (enrolls from the event's thumbnail).
 */
import { useState, useEffect, useCallback, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { keyframes } from '@emotion/react';
import { useAuth } from '../contexts/useAuth';
import { Activity, ChevronLeft, ChevronRight, CircleAlert, Play, PersonStanding, User, UserPlus, X } from 'lucide-react';
import { eventService } from '../services/events';
import { cameraService } from '../services/cameras';
import { faceService } from '../services/faces';
import type { Camera, EventSummary, FacePerson, SecurityEvent, AddFaceResponse } from '../types';

const evDrawerIn = keyframes`
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const eventsEmptyStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: '10px',
  color: 'var(--text-3)',
  padding: '80px 0',
};

const eventRowsStyles = {
  maxWidth: '760px',
};

const evChipsStyles = {
  display: 'flex',
  gap: '6px',
};

const evChipStyles = (active: boolean) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  height: '30px',
  padding: '0 12px',
  borderRadius: '999px',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
  color: active ? 'var(--text-1)' : 'var(--text-2)',
  background: active ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
  fontSize: '12.5px',
  transition: 'color var(--transition), border-color var(--transition), background var(--transition)',
  '&:hover': {
    color: 'var(--text-1)',
    borderColor: 'var(--border-strong)',
  },
});

const evChipCountStyles = {
  fontSize: '11px',
  color: 'var(--text-3)',
};

const evSelectStyles = {
  background: 'var(--surface-2)',
  color: 'var(--text-1)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  height: '30px',
  padding: '0 8px',
  fontFamily: 'inherit',
  fontSize: '12.5px',
  maxWidth: '150px',
};

const eventRowStyles = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 4px',
  borderBottom: '1px solid var(--border)',
  width: '100%',
  textAlign: 'left' as const,
  '&:hover': { background: 'var(--surface)' },
  '&:focus-visible': { outline: '2px solid var(--accent)', outlineOffset: '-2px' },
};

const eventRowThumbStyles = {
  width: '96px',
  aspectRatio: '16 / 9',
  borderRadius: 'var(--radius-sm)',
  objectFit: 'cover' as const,
  background: '#000',
  flexShrink: 0,
};

const eventRowBodyStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '3px',
  minWidth: 0,
  flex: 1,
};

const eventRowTitleStyles = (tone: string) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '13px',
  fontWeight: 500,
  color: tone === 'alert' ? 'var(--alert)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-1)',
});

const eventRowMetaStyles = {
  display: 'flex',
  gap: '8px',
  fontSize: '11px',
  color: 'var(--text-3)',
};

const eventRowPlayStyles = {
  color: 'var(--text-3)',
  marginLeft: 'auto',
  flexShrink: 0,
  '.event-row:hover &': {
    color: 'var(--accent)',
  },
};

const evLoadMoreStyles = {
  margin: '14px auto',
  display: 'flex',
};

const evDrawerStyles = {
  position: 'fixed' as const,
  top: 0,
  right: 0,
  bottom: 0,
  width: '380px',
  background: 'var(--surface)',
  borderLeft: '1px solid var(--border)',
  boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.45)',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column' as const,
  animation: `${evDrawerIn} var(--transition-slow) ease-out`,
};

const evDrawerHeadStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const evDrawerBodyStyles = {
  padding: '16px',
  overflowY: 'auto' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '16px',
};

const evDrawerThumbStyles = {
  width: '100%',
  aspectRatio: '16 / 9',
  objectFit: 'contain' as const,
  background: '#000',
  borderRadius: 'var(--radius)',
};

const evDrawerMetaStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '8px',
  '& > div': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '12.5px',
  },
  '& dt': { color: 'var(--text-3)' },
  '& dd': { color: 'var(--text-1)', textAlign: 'right' as const },
};

const evDrawerActionsStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '10px',
};

const evDrawerNameStyles = {
  borderTop: '1px solid var(--border)',
  paddingTop: '14px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '10px',
};

const evDrawerNameTitleStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--text-1)',
};

const evDrawerNameRowStyles = {
  display: 'flex',
  gap: '8px',
  '& input': {
    flex: 1,
    height: '32px',
    padding: '0 12px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-1)',
    fontFamily: 'inherit',
    fontSize: '13px',
    '&:focus': { outline: 'none', borderColor: 'var(--accent)' },
  },
};

const evNameResultStyles = (isOk: boolean) => ({
  fontSize: '12.5px',
  lineHeight: 1.5,
  color: isOk ? 'var(--live)' : 'var(--alert)',
});

interface EventTypeMeta {
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  label: string;
  tone: string;
}

const TYPE_META: Record<string, EventTypeMeta> = {
  unknown_face: { icon: CircleAlert, label: 'Unknown person', tone: 'alert' },
  known_face: { icon: User, label: 'Known person', tone: 'ok' },
  loitering: { icon: PersonStanding, label: 'Loitering', tone: 'warn' },
  person_detected: { icon: PersonStanding, label: 'Person detected', tone: 'ok' },
  motion: { icon: Activity, label: 'Motion', tone: 'ok' },
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

function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function EventsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState('');
  const [cameraFilter, setCameraFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [date, setDate] = useState(localDateStr());

  const [summary, setSummary] = useState<EventSummary | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [people, setPeople] = useState<FacePerson[]>([]);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [selected, setSelected] = useState<SecurityEvent | null>(null); // event in the drawer
  const [naming, setNaming] = useState('');       // name input while enrolling
  const [nameResult, setNameResult] = useState<AddFaceResponse | { status: string; detail?: string } | null>(null);

  // Static-ish reference data
  useEffect(() => {
    if (!token) return;
    eventService.getSummary()
      .then(d => setSummary(d.summary || null)).catch(() => {});
    cameraService.getCameras()
      .then(d => setCameras(d.cameras || [])).catch(() => {});
    faceService.getFaces()
      .then(d => setPeople(d.faces || [])).catch(() => {});
  }, [token]);

  const loadEvents = useCallback((offset = 0) => {
    if (!token) return;
    const { start, end } = dayRange(date);
    eventService.getEvents({
      since: start.toISOString(),
      until: end.toISOString(),
      limit: 50,
      offset,
      eventType: typeFilter || undefined,
      cameraId: cameraFilter || undefined,
      personName: personFilter || undefined,
    })
      .then(d => {
        setEvents(prev => (offset === 0 ? d.events || [] : [...prev, ...(d.events || [])]));
        setTotal(d.total || 0);
        setLoaded(true);
      })
      .catch(() => {});
  }, [token, typeFilter, cameraFilter, personFilter, date]);

  useEffect(() => { loadEvents(0); }, [loadEvents]);

  const shiftDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next <= localDateStr()) setDate(next);
  };

  const openEvent = (ev: SecurityEvent) => { setSelected(ev); setNaming(''); setNameResult(null); };
  const closeDrawer = () => setSelected(null);

  const playEvent = (ev: SecurityEvent) => {
    const ts = new Date(ev.timestamp).getTime() / 1000;
    navigate(`/camera/${ev.camera_id}?date=${ev.timestamp.slice(0, 10)}&ts=${ts}`);
  };

  const submitName = async () => {
    if (!naming.trim() || !selected) return;
    try {
      const data = await faceService.addFaceFromEvent(naming.trim(), selected.id);
      setNameResult(data);
    } catch (e) {
      setNameResult({ status: 'error', detail: String((e as Error).message || e) });
    }
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chips = [
    { key: '', label: 'All', count: summary?.total },
    { key: 'unknown_face', label: 'Unknown', count: summary?.unknown_face },
    { key: 'known_face', label: 'Known', count: summary?.known_face },
    { key: 'loitering', label: 'Loitering', count: summary?.loitering },
  ];

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Events</span>

        <div css={evChipsStyles}>
          {chips.map(c => (
            <button
              key={c.key}
              css={evChipStyles(typeFilter === c.key)}
              onClick={() => setTypeFilter(c.key)}
            >
              {c.label}
              {typeof c.count === 'number' && <span css={evChipCountStyles} className="tnum">{c.count}</span>}
            </button>
          ))}
        </div>

        <span className="page-header__spacer" />

        <select css={evSelectStyles} value={cameraFilter} onChange={e => setCameraFilter(e.target.value)} aria-label="Filter by camera">
          <option value="">All cameras</option>
          {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select css={evSelectStyles} value={personFilter} onChange={e => setPersonFilter(e.target.value)} aria-label="Filter by person">
          <option value="">All people</option>
          {people.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div className="cd-date">
          <button className="btn-ghost" onClick={() => shiftDate(-1)} aria-label="Previous day"><ChevronLeft size={14} /></button>
          <input type="date" className="cd-date__input tnum" value={date} max={localDateStr()}
            onChange={e => e.target.value && setDate(e.target.value)} aria-label="Events date" />
          <button className="btn-ghost" onClick={() => shiftDate(1)} aria-label="Next day"><ChevronRight size={14} /></button>
        </div>
      </header>

      <div className="page-body">
        {loaded && events.length === 0 && (
          <div css={eventsEmptyStyles}>
            <Activity size={26} strokeWidth={1.5} />
            <p>No events for this day{typeFilter ? ' and filter' : ''}</p>
          </div>
        )}

        <div css={eventRowsStyles}>
          {events.map(ev => {
            const meta = TYPE_META[ev.event_type] || TYPE_META.motion;
            const Icon = meta.icon;
            return (
              <button key={ev.id} css={eventRowStyles} className="event-row" onClick={() => openEvent(ev)}>
                {ev.thumbnail_path && (
                  <img
                    css={eventRowThumbStyles}
                    src={eventService.getThumbnailUrl(ev.id)}
                    crossOrigin="use-credentials"
                    alt=""
                    loading="lazy"
                  />
                )}
                <div css={eventRowBodyStyles}>
                  <div css={eventRowTitleStyles(meta.tone)}>
                    <Icon size={14} strokeWidth={1.75} />
                    <span>{ev.person_name || meta.label}</span>
                  </div>
                  <div css={eventRowMetaStyles} className="tnum">
                    <span>{ev.camera_id}</span>
                    <span>{relTime(ev.timestamp)}</span>
                  </div>
                </div>
                {ev.playback && <Play size={14} strokeWidth={1.75} css={eventRowPlayStyles} className="event-row__play" />}
              </button>
            );
          })}
        </div>

        {events.length < total && (
          <button className="btn-ghost" css={evLoadMoreStyles} onClick={() => loadEvents(events.length)}>
            Load more ({events.length}/{total})
          </button>
        )}
      </div>

      {selected && (
        <aside css={evDrawerStyles} role="dialog" aria-label="Event detail">
          <div css={evDrawerHeadStyles}>
            <span className="page-header__title">Event</span>
            <button className="btn-ghost" onClick={closeDrawer} aria-label="Close"><X size={15} /></button>
          </div>

          <div css={evDrawerBodyStyles}>
            {selected.thumbnail_path && (
              <img
                css={evDrawerThumbStyles}
                src={eventService.getThumbnailUrl(selected.id)}
                crossOrigin="use-credentials"
                alt=""
              />
            )}

            <dl css={evDrawerMetaStyles} className="tnum">
              <div><dt>Type</dt><dd>{(TYPE_META[selected.event_type] || {}).label || selected.event_type}</dd></div>
              <div><dt>Camera</dt><dd>{selected.camera_id}</dd></div>
              <div><dt>Time</dt><dd>{new Date(selected.timestamp).toLocaleString()}</dd></div>
              {selected.person_name && <div><dt>Person</dt><dd>{selected.person_name}</dd></div>}
              {selected.playback && (
                <div><dt>Recording</dt><dd>{selected.playback.file} @ {selected.playback.start_offset}s</dd></div>
              )}
            </dl>

            <div css={evDrawerActionsStyles}>
              {selected.playback ? (
                <button className="btn-primary" onClick={() => playEvent(selected)}>
                  <Play size={14} strokeWidth={1.75} /> Play in timeline
                </button>
              ) : (
                <span className="status-label">No recording covers this event</span>
              )}
            </div>

            {selected.event_type === 'unknown_face' && (
              <div css={evDrawerNameStyles}>
                <div css={evDrawerNameTitleStyles}>
                  <UserPlus size={14} strokeWidth={1.75} /> Name this person
                </div>
                <div css={evDrawerNameRowStyles}>
                  <input
                    value={naming}
                    onChange={e => setNaming(e.target.value)}
                    placeholder="e.g. Alice"
                    aria-label="Person name"
                    onKeyDown={e => e.key === 'Enter' && submitName()}
                  />
                  <button className="btn-primary" onClick={submitName} disabled={!naming.trim()}>Save</button>
                </div>
                {nameResult && (
                  <span css={evNameResultStyles(nameResult.status === 'ok')}>
                    {nameResult.status === 'ok' ? 'Enrolled successfully!' : (nameResult.detail || 'Enrollment failed')}
                  </span>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

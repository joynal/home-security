/**
 * Events page v2 — the triage browser.
 * Filter chips with counts, camera/person/date filters, Scrypted-style rows,
 * and a detail drawer: Play jumps into the camera timeline; unknown events
 * offer "Name this person" (enrolls from the event's thumbnail).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { Activity, ChevronLeft, ChevronRight, CircleAlert, Play, PersonStanding, User, UserPlus, X } from 'lucide-react';
import './EventsPage.css';

const API = 'http://localhost:8000';

const TYPE_META = {
  unknown_face: { icon: CircleAlert, label: 'Unknown person', tone: 'alert' },
  known_face: { icon: User, label: 'Known person', tone: 'ok' },
  loitering: { icon: PersonStanding, label: 'Loitering', tone: 'warn' },
  person_detected: { icon: PersonStanding, label: 'Person detected', tone: 'ok' },
  motion: { icon: Activity, label: 'Motion', tone: 'ok' },
};

function localDateStr(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayRange(date) {
  const [y, m, d] = date.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  return { start, end: new Date(start.getTime() + 86400000) };
}

function relTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export default function EventsPage() {
  const { token, authHeaders } = useAuth();
  const navigate = useNavigate();

  const [typeFilter, setTypeFilter] = useState('');
  const [cameraFilter, setCameraFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [date, setDate] = useState(localDateStr());

  const [summary, setSummary] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const [selected, setSelected] = useState(null); // event in the drawer
  const [naming, setNaming] = useState('');       // name input while enrolling
  const [nameResult, setNameResult] = useState(null);

  // Static-ish reference data
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/events/summary`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setSummary(d.summary || null)).catch(() => {});
    fetch(`${API}/cameras`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setCameras(d.cameras || [])).catch(() => {});
    fetch(`${API}/faces`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setPeople(d.faces || [])).catch(() => {});
  }, [token, authHeaders]);

  const loadEvents = useCallback((offset = 0) => {
    if (!token) return;
    const { start, end } = dayRange(date);
    const params = new URLSearchParams({
      since: start.toISOString(),
      until: end.toISOString(),
      limit: 50,
      offset,
    });
    if (typeFilter) params.set('event_type', typeFilter);
    if (cameraFilter) params.set('camera_id', cameraFilter);
    if (personFilter) params.set('person_name', personFilter);

    fetch(`${API}/events?${params}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => {
        setEvents(prev => (offset === 0 ? d.events || [] : [...prev, ...(d.events || [])]));
        setTotal(d.total || 0);
        setLoaded(true);
      })
      .catch(() => {});
  }, [token, authHeaders, typeFilter, cameraFilter, personFilter, date]);

  useEffect(() => { loadEvents(0); }, [loadEvents]);

  const shiftDate = (delta) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    const next = d.toISOString().slice(0, 10);
    if (next <= localDateStr()) setDate(next);
  };

  const openEvent = (ev) => { setSelected(ev); setNaming(''); setNameResult(null); };
  const closeDrawer = () => setSelected(null);

  const playEvent = (ev) => {
    const ts = new Date(ev.timestamp).getTime() / 1000;
    navigate(`/camera/${ev.camera_id}?date=${ev.timestamp.slice(0, 10)}&ts=${ts}`);
  };

  const submitName = async () => {
    if (!naming.trim() || !selected) return;
    try {
      const res = await fetch(`${API}/faces/${encodeURIComponent(naming.trim())}/add`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: selected.id }),
      });
      const data = await res.json();
      setNameResult(res.ok ? data : { status: 'error', detail: data.detail });
    } catch (e) {
      setNameResult({ status: 'error', detail: String(e) });
    }
  };

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeDrawer(); };
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

        <div className="ev-chips">
          {chips.map(c => (
            <button
              key={c.key}
              className={`ev-chip ${typeFilter === c.key ? 'ev-chip--active' : ''}`}
              onClick={() => setTypeFilter(c.key)}
            >
              {c.label}
              {typeof c.count === 'number' && <span className="ev-chip__count tnum">{c.count}</span>}
            </button>
          ))}
        </div>

        <span className="page-header__spacer" />

        <select className="ev-select" value={cameraFilter} onChange={e => setCameraFilter(e.target.value)} aria-label="Filter by camera">
          <option value="">All cameras</option>
          {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="ev-select" value={personFilter} onChange={e => setPersonFilter(e.target.value)} aria-label="Filter by person">
          <option value="">All people</option>
          {people.map(p => <option key={p.id ?? p.name} value={p.name}>{p.name}</option>)}
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
          <div className="events-empty">
            <Activity size={26} strokeWidth={1.5} />
            <p>No events for this day{typeFilter ? ' and filter' : ''}</p>
          </div>
        )}

        <div className="event-rows">
          {events.map(ev => {
            const meta = TYPE_META[ev.event_type] || TYPE_META.motion;
            const Icon = meta.icon;
            return (
              <button key={ev.id} className={`event-row event-row--${meta.tone}`} onClick={() => openEvent(ev)}>
                {ev.thumbnail_path && (
                  <img
                    className="event-row__thumb"
                    src={`${API}/events/${ev.id}/thumbnail?token=${encodeURIComponent(token)}`}
                    alt=""
                    loading="lazy"
                  />
                )}
                <div className="event-row__body">
                  <div className="event-row__title">
                    <Icon size={14} strokeWidth={1.75} />
                    <span>{ev.person_name || meta.label}</span>
                  </div>
                  <div className="event-row__meta tnum">
                    <span>{ev.camera_id}</span>
                    <span>{relTime(ev.timestamp)}</span>
                  </div>
                </div>
                {ev.playback && <Play size={14} strokeWidth={1.75} className="event-row__play" />}
              </button>
            );
          })}
        </div>

        {events.length < total && (
          <button className="btn-ghost ev-load-more" onClick={() => loadEvents(events.length)}>
            Load more ({events.length}/{total})
          </button>
        )}
      </div>

      {selected && (
        <aside className="ev-drawer" role="dialog" aria-label="Event detail">
          <div className="ev-drawer__head">
            <span className="page-header__title">Event</span>
            <button className="btn-ghost" onClick={closeDrawer} aria-label="Close"><X size={15} /></button>
          </div>

          <div className="ev-drawer__body">
            {selected.thumbnail_path && (
              <img
                className="ev-drawer__thumb"
                src={`${API}/events/${selected.id}/thumbnail?token=${encodeURIComponent(token)}`}
                alt=""
              />
            )}

            <dl className="ev-drawer__meta tnum">
              <div><dt>Type</dt><dd>{(TYPE_META[selected.event_type] || {}).label || selected.event_type}</dd></div>
              <div><dt>Camera</dt><dd>{selected.camera_id}</dd></div>
              <div><dt>Time</dt><dd>{new Date(selected.timestamp).toLocaleString()}</dd></div>
              {selected.person_name && <div><dt>Person</dt><dd>{selected.person_name}</dd></div>}
              {selected.playback && (
                <div><dt>Recording</dt><dd>{selected.playback.file} @ {selected.playback.start_offset}s</dd></div>
              )}
            </dl>

            <div className="ev-drawer__actions">
              {selected.playback ? (
                <button className="btn-primary" onClick={() => playEvent(selected)}>
                  <Play size={14} strokeWidth={1.75} /> Play in timeline
                </button>
              ) : (
                <span className="status-label">No recording covers this event</span>
              )}
            </div>

            {selected.event_type === 'unknown_face' && (
              <div className="ev-drawer__name">
                <div className="ev-drawer__name-title">
                  <UserPlus size={13} strokeWidth={1.75} /> Know this person?
                </div>
                {nameResult ? (
                  <div className={`ev-name-result ${nameResult.status === 'enrolled' ? 'ev-name-result--ok' : 'ev-name-result--bad'}`}>
                    {nameResult.status === 'enrolled'
                      ? `Enrolled as ${naming.trim()} — future sightings will be recognized.`
                      : `Not enrolled: ${nameResult.verdict?.reason || nameResult.detail || 'rejected'}`}
                  </div>
                ) : (
                  <div className="ev-drawer__name-row">
                    <input
                      value={naming}
                      onChange={e => setNaming(e.target.value)}
                      placeholder="Their name"
                      onKeyDown={e => e.key === 'Enter' && submitName()}
                      aria-label="Person name"
                    />
                    <button className="btn-primary" onClick={submitName} disabled={!naming.trim()}>
                      Enroll
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      )}
    </>
  );
}

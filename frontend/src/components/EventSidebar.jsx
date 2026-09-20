/**
 * Event sidebar — recent detection events with thumbnails and timestamps.
 * Polls GET /events?limit=50 on mount and every 15 seconds.
 * Props: token (string), authHeaders (func), collapsed (bool), onToggle (func)
 */
import { useState, useEffect } from 'react';
import { Activity, CircleAlert, ListChecks, PersonStanding, User } from 'lucide-react';
import './EventSidebar.css';

const API = 'http://localhost:8000';

const EVENT_META = {
  unknown_face:    { icon: CircleAlert, label: 'Unknown person' },
  known_face:      { icon: User, label: 'Known person' },
  person_detected: { icon: PersonStanding, label: 'Person detected' },
  motion:          { icon: Activity, label: 'Motion' },
};

function formatTime(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function EventSidebar({ token, authHeaders, collapsed, onToggle }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchEvents = () => {
      fetch(`${API}/events?limit=50`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => { if (!cancelled && data.events) setEvents(data.events); })
        .catch(() => {});
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, authHeaders]);

  if (collapsed) {
    return (
      <button className="event-sidebar event-sidebar--collapsed" onClick={onToggle} title="Show events">
        <ListChecks size={16} strokeWidth={1.75} /><span className="event-sidebar__count">{events.length}</span>
      </button>
    );
  }

  return (
    <aside className="event-sidebar">
      <div className="event-sidebar__header">
        <span>EVENTS</span>
        <button className="event-sidebar__collapse" onClick={onToggle} title="Hide events">⟩⟩</button>
      </div>
      <div className="event-sidebar__list">
        {events.length === 0 && (
          <p className="event-sidebar__empty">No events yet</p>
        )}
        {events.map(ev => {
          const meta = EVENT_META[ev.event_type] || { icon: Activity, label: ev.event_type };
          const isUnknown = ev.event_type === 'unknown_face';
          const MetaIcon = meta.icon;
          return (
            <div key={ev.id} className={`event-card ${isUnknown ? 'event-card--unknown' : 'event-card--known'}`}>
              {ev.thumbnail_path && (
                <img
                  className="event-card__thumb"
                  src={`${API}/events/${ev.id}/thumbnail?token=${encodeURIComponent(token)}`}
                  alt=""
                  loading="lazy"
                />
              )}
              <div className="event-card__body">
                <div className="event-card__title">
                  <MetaIcon size={13} strokeWidth={1.75} />
                  <span>{ev.person_name || meta.label}</span>
                </div>
                <div className="event-card__meta">
                  <span className="event-card__camera">{ev.camera_id}</span>
                  <span className="event-card__time">{formatTime(ev.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

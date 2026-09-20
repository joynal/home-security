/**
 * Recent activity strip — "what just happened" above the grid
 * (Frigate filmstrip pattern; story-card styling per the Scrypted research).
 * Horizontal scroll of recent event thumbnails; severity = bottom border only.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/useAuth';
import './RecentEvents.css';

const API = 'http://localhost:8000';

function relTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export default function RecentEvents({ limit = 10 }) {
  const { token, authHeaders } = useAuth();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      fetch(`${API}/events?limit=${limit}`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => { if (!cancelled) setEvents(d.events || []); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, authHeaders, limit]);

  if (events.length === 0) return null;

  return (
    <div className="recent-strip" aria-label="Recent activity">
      {events.map(ev => (
        <div
          key={ev.id}
          className={`recent-strip__card recent-strip__card--${ev.event_type}`}
          title={`${ev.person_name || ev.event_type} · ${ev.camera_id}`}
        >
          {ev.thumbnail_path && (
            <img
              src={`${API}/events/${ev.id}/thumbnail?token=${encodeURIComponent(token)}`}
              alt=""
              loading="lazy"
            />
          )}
          <span className="recent-strip__time tnum">{relTime(ev.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

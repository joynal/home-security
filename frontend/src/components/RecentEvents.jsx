/**
 * Recent activity strip — "what just happened" above the grid
 * (Frigate filmstrip pattern; story-card styling per the Scrypted research).
 * Horizontal scroll of recent event thumbnails; severity = bottom border only.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/useAuth';

const API = 'http://localhost:8000';

const stripStyles = {
  display: 'flex',
  gap: '8px',
  overflowX: 'auto',
  paddingBottom: '4px',
  marginBottom: '8px',
  scrollbarWidth: 'thin',
};

const getBorderColor = (type) => {
  if (type === 'unknown_face') return 'var(--alert)';
  if (type === 'loitering') return 'var(--warn)';
  if (type === 'known_face') return 'var(--live)';
  return 'transparent';
};

const cardStyles = (eventType) => ({
  position: 'relative',
  flexShrink: 0,
  width: '150px',
  aspectRatio: '16 / 9',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  background: 'var(--surface-2)',
  borderBottom: `2px solid ${getBorderColor(eventType)}`,
  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
});

const timeStyles = {
  position: 'absolute',
  bottom: '4px',
  right: '6px',
  fontSize: '10.5px',
  color: '#fff',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
};

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
    <div css={stripStyles} aria-label="Recent activity">
      {events.map(ev => (
        <div
          key={ev.id}
          css={cardStyles(ev.event_type)}
          title={`${ev.person_name || ev.event_type} · ${ev.camera_id}`}
        >
          {ev.thumbnail_path && (
            <img
              src={`${API}/events/${ev.id}/thumbnail?token=${encodeURIComponent(token)}`}
              alt=""
              loading="lazy"
            />
          )}
          <span css={timeStyles} className="tnum">{relTime(ev.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

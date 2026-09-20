/**
 * Recent activity strip — "what just happened" above the grid
 * (Frigate filmstrip pattern; story-card styling per the Scrypted research).
 * Horizontal scroll of recent event thumbnails; severity = bottom border only.
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/useAuth';
import { eventService } from '../services/events';
import type { SecurityEvent } from '../types';

export interface RecentEventsProps {
  limit?: number;
}

const stripStyles = {
  display: 'flex',
  gap: '8px',
  overflowX: 'auto' as const,
  paddingBottom: '4px',
  marginBottom: '8px',
  scrollbarWidth: 'thin' as const,
};

const getBorderColor = (type: string) => {
  if (type === 'unknown_face') return 'var(--alert)';
  if (type === 'loitering') return 'var(--warn)';
  if (type === 'known_face') return 'var(--live)';
  return 'transparent';
};

const cardStyles = (eventType: string) => ({
  position: 'relative' as const,
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
    objectFit: 'cover' as const,
  },
});

const timeStyles = {
  position: 'absolute' as const,
  bottom: '4px',
  right: '6px',
  fontSize: '10.5px',
  color: '#fff',
  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
};

function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

export default function RecentEvents({ limit = 10 }: RecentEventsProps) {
  const { token } = useAuth();
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      eventService.getEvents({ limit })
        .then(d => { if (!cancelled) setEvents(d.events || []); })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, limit]);

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
              src={eventService.getThumbnailUrl(ev.id)}
              crossOrigin="use-credentials"
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

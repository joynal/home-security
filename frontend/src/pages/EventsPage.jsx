/**
 * Events page — detection event browser.
 * (Interim layout; the full Scrypted-style browser lands in U5 with day
 * navigation, filters with counts, and the detail drawer.)
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Activity, CircleAlert, PersonStanding, User } from 'lucide-react';

const API = 'http://localhost:8000';

const EVENT_META = {
  unknown_face: { icon: CircleAlert, label: 'Unknown person', tone: 'alert' },
  known_face: { icon: User, label: 'Known person', tone: 'ok' },
  loitering: { icon: PersonStanding, label: 'Loitering', tone: 'warn' },
  person_detected: { icon: PersonStanding, label: 'Person detected', tone: 'ok' },
  motion: { icon: Activity, label: 'Motion', tone: 'ok' },
};

function relTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function EventsPage() {
  const { token, authHeaders } = useAuth();
  const [events, setEvents] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      fetch(`${API}/events?limit=50`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => { if (!cancelled) { setEvents(d.events || []); setLoaded(true); } })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, authHeaders]);

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Events</span>
        <span className="page-header__spacer" />
        <span className="status-label tnum">{events.length} recent</span>
      </header>

      <div className="page-body">
        {loaded && events.length === 0 && (
          <div className="events-empty">
            <Activity size={26} strokeWidth={1.5} />
            <p>No events yet</p>
          </div>
        )}

        <div className="event-rows">
          {events.map(ev => {
            const meta = EVENT_META[ev.event_type] || EVENT_META.motion;
            const Icon = meta.icon;
            return (
              <div key={ev.id} className={`event-row event-row--${meta.tone}`}>
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
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

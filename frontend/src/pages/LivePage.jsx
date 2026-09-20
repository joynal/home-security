/**
 * Live page — the camera grid IS the app (UniFi/Frigate pattern).
 * Grid hero + recent-event rail (U3 replaces the sidebar-era event panel).
 */
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import CameraGrid from '../components/CameraGrid';
import EventSidebar from '../components/EventSidebar';

const API = 'http://localhost:8000';

export default function LivePage() {
  const { token, authHeaders } = useAuth();
  const [cameras, setCameras] = useState([]);
  const [eventsCollapsed, setEventsCollapsed] = useState(false);

  // Poll /cameras every 10s for live status (online/offline, FPS)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchCameras = () => {
      fetch(`${API}/cameras`, { headers: authHeaders() })
        .then(r => r.json())
        .then(data => {
          if (cancelled || !data.cameras) return;
          setCameras(data.cameras);
        })
        .catch(() => {});
    };
    fetchCameras();
    const interval = setInterval(fetchCameras, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, authHeaders]);

  const online = cameras.filter(c => c.online).length;

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Live</span>
        <span className={`status-dot ${online === cameras.length && cameras.length > 0 ? 'status-dot--live' : 'status-dot--warn'}`} />
        <span className="status-label tnum">{online}/{cameras.length} online</span>
        <span className="page-header__spacer" />
      </header>

      <div className="live-body">
        <div className="live-body__grid">
          {cameras.length > 0 ? (
            <CameraGrid cameras={cameras} token={token} />
          ) : (
            <div className="live-placeholder">
              <p>Loading cameras…</p>
            </div>
          )}
        </div>

        <EventSidebar
          token={token}
          authHeaders={authHeaders}
          collapsed={eventsCollapsed}
          onToggle={() => setEventsCollapsed(c => !c)}
        />
      </div>
    </>
  );
}

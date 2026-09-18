import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './index.css';
import { useAuth } from './contexts/AuthContext';
import RegisterModal from './RegisterModal';
import ManageFacesPage from './ManageFacesPage';
import RecordingsPage from './RecordingsPage';
import CameraGrid from './components/CameraGrid';
import EventSidebar from './components/EventSidebar';

const API = 'http://localhost:8000';

function CameraCard({ camera, isActive, onClick }) {
  const icons = { macbook: '💻', tapo: '📷', file: '🎬', rtsp: '🎥', default: '🎥' };
  const icon  = icons[camera.type] || icons.default;
  return (
    <button
      className={`camera-card ${isActive ? 'camera-card--active' : ''}`}
      onClick={() => onClick(camera)}
    >
      <div className="camera-card__icon">{icon}</div>
      <div className="camera-card__info">
        <span className="camera-card__name">{camera.name}</span>
        <span className="camera-card__type">
          {camera.type.toUpperCase()}
          {camera.online && camera.fps > 0 ? ` · ${Math.round(camera.fps)} FPS` : ''}
        </span>
      </div>
      <div
        className={`camera-card__dot ${camera.online ? 'camera-card__dot--online' : ''} ${
          isActive ? 'camera-card__dot--active' : ''
        }`}
        title={camera.online ? 'Online' : 'Offline'}
      />
    </button>
  );
}

function Dashboard() {
  const { token, username, logout, authHeaders } = useAuth();
  const navigate = useNavigate();
  const [cameras,      setCameras]      = useState([]);
  const [activeCamera, setActiveCamera] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
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
          setCameras(prev => {
            // Keep activeCamera valid when the list changes
            if (!prev.length && data.cameras.length > 0) setActiveCamera(data.cameras[0]);
            return data.cameras;
          });
        })
        .catch(() => {});
    };
    fetchCameras();
    const interval = setInterval(fetchCameras, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, authHeaders]);

  return (
    <>
      <div className="layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar__logo">
            <span className="sidebar__logo-icon">🛡</span>
            <span className="sidebar__logo-text">Aegis Vision</span>
          </div>

          <p className="sidebar__section-label">CAMERAS</p>

          <div className="sidebar__camera-list">
            {cameras.map(cam => (
              <CameraCard
                key={cam.id}
                camera={cam}
                isActive={activeCamera?.id === cam.id}
                onClick={setActiveCamera}
              />
            ))}
          </div>

          <div className="sidebar__footer">
            <button className="register-btn manage-faces-btn" onClick={() => navigate('/manage-faces')}>
              <span>👥</span> Manage Faces
            </button>
            <button className="register-btn manage-faces-btn" onClick={() => navigate('/recordings')}>
              <span>📹</span> Recordings
            </button>
            <button className="register-btn" onClick={() => setShowRegister(true)}>
              <span>＋</span> Register Person
            </button>
            <div className="status-pill">
              <span className="status-pill__pulse" />
              System Armed
            </div>
            {/* Logout */}
            <button className="logout-btn" onClick={logout} title={`Signed in as ${username}`}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="content">
          <header className="topbar">
            <div className="topbar__title">{activeCamera ? activeCamera.name : 'All Cameras'}</div>
            <div className="topbar__badges">
              <span className="badge badge--live">● LIVE</span>
              <span className="badge badge--ai">AI: ArcFace + RetinaFace</span>
              <span className="badge badge--user">👤 {username}</span>
            </div>
          </header>

          <div className="content-row">
            <div className="content-col">
              <div className="video-wrapper video-wrapper--grid">
                {cameras.length > 0 ? (
                  <CameraGrid cameras={cameras} token={token} />
                ) : (
                  <div className="video-placeholder">
                    <span>🎥</span>
                    <p>Loading cameras…</p>
                  </div>
                )}
              </div>

              <div className="stats-strip">
                <div className="stat"><span className="stat__label">AI Model</span><span className="stat__value">InsightFace buffalo_l</span></div>
                <div className="stat"><span className="stat__label">Detection</span><span className="stat__value">RetinaFace 3D</span></div>
                <div className="stat"><span className="stat__label">Recognition</span><span className="stat__value">ArcFace 512-d</span></div>
                <div className="stat"><span className="stat__label">Cameras</span><span className="stat__value">{cameras.filter(c => c.online).length}/{cameras.length} online</span></div>
              </div>
            </div>

            <EventSidebar
              token={token}
              authHeaders={authHeaders}
              collapsed={eventsCollapsed}
              onToggle={() => setEventsCollapsed(c => !c)}
            />
          </div>
        </main>
      </div>

      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/manage-faces" element={<ManageFacesPage />} />
      <Route path="/recordings" element={<RecordingsPage />} />
    </Routes>
  );
}

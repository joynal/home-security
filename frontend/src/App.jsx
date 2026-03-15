import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import './index.css';
import { useAuth } from './contexts/AuthContext';
import RegisterModal from './RegisterModal';
import ManageFacesPage from './ManageFacesPage';

const API = 'http://localhost:8000';

function CameraCard({ camera, isActive, onClick }) {
  const icons = { macbook: '💻', tapo: '📷', default: '🎥' };
  const icon  = icons[camera.type] || icons.default;
  return (
    <button
      className={`camera-card ${isActive ? 'camera-card--active' : ''}`}
      onClick={() => onClick(camera)}
    >
      <div className="camera-card__icon">{icon}</div>
      <div className="camera-card__info">
        <span className="camera-card__name">{camera.name}</span>
        <span className="camera-card__type">{camera.type.toUpperCase()}</span>
      </div>
      <div className={`camera-card__dot ${isActive ? 'camera-card__dot--active' : ''}`} />
    </button>
  );
}

function Dashboard() {
  const { token, username, logout, authHeaders } = useAuth();
  const navigate = useNavigate();
  const [cameras,      setCameras]      = useState([]);
  const [activeCamera, setActiveCamera] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/cameras`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        setCameras(data.cameras);
        if (data.cameras.length > 0) setActiveCamera(data.cameras[0]);
      })
      .catch(() => {
        const demo = [{ id: 'MacBook_Webcam', name: 'MacBook Webcam', type: 'macbook' }];
        setCameras(demo);
        setActiveCamera(demo[0]);
      });
  }, [token, authHeaders]);

  // Video feed URL includes token as query param (browsers can't add headers to img src)
  const videoUrl = activeCamera ? `${API}/video_feed?token=${encodeURIComponent(token)}` : null;

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
            <div className="topbar__title">{activeCamera ? activeCamera.name : 'Select a Camera'}</div>
            <div className="topbar__badges">
              <span className="badge badge--live">● LIVE</span>
              <span className="badge badge--ai">AI: ArcFace + RetinaFace</span>
              <span className="badge badge--user">👤 {username}</span>
            </div>
          </header>

          <div className="video-wrapper">
            {videoUrl ? (
              <img key={activeCamera.id} src={videoUrl} alt={`${activeCamera.name} live`} className="video-feed" />
            ) : (
              <div className="video-placeholder">
                <span>🎥</span>
                <p>Select a camera from the sidebar</p>
              </div>
            )}
            <div className="video-overlay-corner">{activeCamera?.name}</div>
          </div>

          <div className="stats-strip">
            <div className="stat"><span className="stat__label">AI Model</span><span className="stat__value">InsightFace buffalo_l</span></div>
            <div className="stat"><span className="stat__label">Detection</span><span className="stat__value">RetinaFace 3D</span></div>
            <div className="stat"><span className="stat__label">Recognition</span><span className="stat__value">ArcFace 512-d</span></div>
            <div className="stat"><span className="stat__label">Cameras</span><span className="stat__value">{cameras.length} active</span></div>
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
    </Routes>
  );
}

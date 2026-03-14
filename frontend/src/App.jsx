import { useState, useEffect } from 'react';
import './index.css';
import RegisterModal from './RegisterModal';

const API = 'http://localhost:8000';

function CameraCard({ camera, isActive, onClick }) {
  const icons = { macbook: '💻', tapo: '📷', default: '🎥' };
  const icon = icons[camera.type] || icons.default;

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

export default function App() {
  const [cameras, setCameras] = useState([]);
  const [activeCamera, setActiveCamera] = useState(null);
  const [showRegister, setShowRegister] = useState(false);

  useEffect(() => {
    fetch(`${API}/cameras`)
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
  }, []);

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
            <button
              className="register-btn"
              onClick={() => setShowRegister(true)}
            >
              <span>＋</span> Register Person
            </button>
            <div className="status-pill">
              <span className="status-pill__pulse" />
              System Armed
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="content">
          <header className="topbar">
            <div className="topbar__title">
              {activeCamera ? activeCamera.name : 'Select a Camera'}
            </div>
            <div className="topbar__badges">
              <span className="badge badge--live">● LIVE</span>
              <span className="badge badge--ai">AI: ArcFace + RetinaFace</span>
            </div>
          </header>

          <div className="video-wrapper">
            {activeCamera ? (
              <img
                key={activeCamera.id}
                src={`${API}/video_feed`}
                alt={`${activeCamera.name} live feed`}
                className="video-feed"
              />
            ) : (
              <div className="video-placeholder">
                <span>🎥</span>
                <p>Select a camera from the sidebar</p>
              </div>
            )}
            <div className="video-overlay-corner">{activeCamera?.name}</div>
          </div>

          <div className="stats-strip">
            <div className="stat">
              <span className="stat__label">AI Model</span>
              <span className="stat__value">InsightFace buffalo_l</span>
            </div>
            <div className="stat">
              <span className="stat__label">Detection</span>
              <span className="stat__value">RetinaFace 3D</span>
            </div>
            <div className="stat">
              <span className="stat__label">Recognition</span>
              <span className="stat__value">ArcFace 512-d</span>
            </div>
            <div className="stat">
              <span className="stat__label">Cameras</span>
              <span className="stat__value">{cameras.length} active</span>
            </div>
          </div>
        </main>
      </div>

      {/* ── Register Modal (portal-like overlay) ── */}
      {showRegister && (
        <RegisterModal
          onClose={() => setShowRegister(false)}
          onSuccess={() => {}}
        />
      )}
    </>
  );
}

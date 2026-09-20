/**
 * Single camera tile — displays MJPEG feed with status overlay.
 * Props: camera (object), token (string), isExpanded (bool), onExpand (func)
 */
import { useState } from 'react';
import { VideoOff } from 'lucide-react';
import './CameraTile.css';

const API = 'http://localhost:8000';

export default function CameraTile({ camera, token, isExpanded, onExpand }) {
  const [hasError, setHasError] = useState(false);
  const feedUrl = `${API}/video_feed/${camera.id}?token=${encodeURIComponent(token)}`;

  return (
    <div
      className={`camera-tile ${isExpanded ? 'camera-tile--expanded' : ''} ${!camera.online ? 'camera-tile--offline' : ''}`}
      onClick={() => onExpand(camera.id)}
    >
      {/* Status badge */}
      <div className="camera-tile__status">
        <span className={`camera-tile__dot ${camera.online ? 'camera-tile__dot--online' : ''}`} />
        <span className="camera-tile__name">{camera.name}</span>
      </div>

      {/* Feed */}
      {camera.online && !hasError ? (
        <img
          src={feedUrl}
          alt={camera.name}
          className="camera-tile__feed"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="camera-tile__offline-msg">
          <VideoOff size={26} strokeWidth={1.5} />
          <p>{hasError ? 'Feed unavailable' : 'Camera offline'}</p>
        </div>
      )}

      {/* Info strip */}
      <div className="camera-tile__info">
        <span>{camera.type.toUpperCase()}</span>
        {camera.online && <span>{Math.round(camera.fps)} FPS</span>}
      </div>
    </div>
  );
}

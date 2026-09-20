/**
 * Camera tile — just video (Frigate/UniFi pattern).
 * Black 16:9 cell, no card chrome. Overlays: name bottom-left on a scrim,
 * status dot + word top-right. Everything else lives in the detail view.
 * Props: camera, token, onSelect(cameraId)
 */
import { useState } from 'react';
import { VideoOff } from 'lucide-react';
import useVisible from '../hooks/useVisible';
import './CameraTile.css';

const API = 'http://localhost:8000';

export default function CameraTile({ camera, token, onSelect }) {
  const [hasError, setHasError] = useState(false);
  const [ref, visible] = useVisible();
  // Stream gating: off-screen or hidden tab → drop the src (server keeps
  // encoding once per loop; we just stop pulling frames per client).
  const feedUrl = visible
    ? `${API}/video_feed/${camera.id}?token=${encodeURIComponent(token)}`
    : null;
  const showFeed = camera.online && !hasError && feedUrl;

  return (
    <button
      ref={ref}
      className={`camera-tile ${showFeed ? '' : 'camera-tile--offline'}`}
      onClick={() => onSelect?.(camera.id)}
      aria-label={`Open ${camera.name}`}
    >
      {showFeed ? (
        <img
          src={feedUrl}
          alt={`${camera.name} live feed`}
          className="camera-tile__feed"
          onError={() => setHasError(true)}
        />
      ) : camera.online && !hasError ? (
        <div className="camera-tile__offline camera-tile__offline--paused">
          <span>Paused — off screen</span>
        </div>
      ) : (
        <div className="camera-tile__offline">
          <VideoOff size={26} strokeWidth={1.5} />
          <span>{hasError ? 'Feed unavailable' : 'Offline'}</span>
        </div>
      )}

      {/* Name — bottom-left over a scrim */}
      <span className="camera-tile__name">{camera.name}</span>

      {/* Status — dot + word, top-right */}
      <span className="camera-tile__status">
        <span className={`status-dot ${camera.online ? 'status-dot--live' : ''}`} />
        <span>{camera.online ? 'Live' : 'Offline'}</span>
      </span>
    </button>
  );
}

/**
 * Camera grid — the hero. Uniform black tiles, 8px gutters,
 * auto-fill columns from 340px. The grid IS the camera list.
 */
import CameraTile from './CameraTile';
import './CameraGrid.css';

export default function CameraGrid({ cameras, token, onSelect }) {
  return (
    <div className="camera-grid" role="list" aria-label="Camera feeds">
      {cameras.map(cam => (
        <CameraTile
          key={cam.id}
          camera={cam}
          token={token}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

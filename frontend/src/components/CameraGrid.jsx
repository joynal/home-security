/**
 * Responsive grid layout for multiple camera feeds.
 * Auto-calculates grid columns based on camera count.
 * Supports expanding a single camera to full view.
 */
import { useState } from 'react';
import CameraTile from './CameraTile';
import './CameraGrid.css';

export default function CameraGrid({ cameras, token }) {
  const [expandedId, setExpandedId] = useState(null);

  const handleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  // If a camera is expanded, show only that one
  if (expandedId) {
    const cam = cameras.find(c => c.id === expandedId);
    if (cam) {
      return (
        <div className="camera-grid camera-grid--single">
          <CameraTile
            camera={cam}
            token={token}
            isExpanded={true}
            onExpand={handleExpand}
          />
        </div>
      );
    }
  }

  // Auto grid columns: 1 cam = 1col, 2-4 = 2col, 5-9 = 3col, 10+ = 4col
  const cols = cameras.length <= 1 ? 1 : cameras.length <= 4 ? 2 : cameras.length <= 9 ? 3 : 4;

  return (
    <div className="camera-grid" style={{ '--grid-cols': cols }}>
      {cameras.map(cam => (
        <CameraTile
          key={cam.id}
          camera={cam}
          token={token}
          isExpanded={false}
          onExpand={handleExpand}
        />
      ))}
    </div>
  );
}

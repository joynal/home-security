/**
 * Camera grid — the hero. Uniform black tiles, 8px gutters,
 * auto-fill columns from 340px. The grid IS the camera list.
 */
import CameraTile from './CameraTile';
import type { Camera } from '../types';

export interface CameraGridProps {
  cameras: Camera[];
  onSelect?: (cameraId: string) => void;
}

const gridStyles = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  gap: '8px',
  '@media (max-width: 760px)': {
    gridTemplateColumns: '1fr',
  },
};

export default function CameraGrid({ cameras, onSelect }: CameraGridProps) {
  return (
    <div css={gridStyles} role="list" aria-label="Camera feeds">
      {cameras.map(cam => (
        <CameraTile
          key={cam.id}
          camera={cam}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

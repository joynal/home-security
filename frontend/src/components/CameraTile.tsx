/**
 * Camera tile — just video (Frigate/UniFi pattern).
 * Black 16:9 cell, no card chrome. Overlays: name bottom-left on a scrim,
 * status dot + word top-right. Everything else lives in the detail view.
 * Props: camera, onSelect(cameraId)
 */
import { useState } from 'react';
import { VideoOff } from 'lucide-react';
import useVisible from '../hooks/useVisible';
import { cameraService } from '../services/cameras';
import type { Camera } from '../types';

export interface CameraTileProps {
  camera: Camera;
  onSelect?: (cameraId: string) => void;
}

const tileStyles = {
  position: 'relative' as const,
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#000',
  borderRadius: 'var(--radius)',
  overflow: 'hidden',
  display: 'block',
  padding: 0,
  transition: 'outline-color var(--transition)',
  outline: '1px solid transparent',
  outlineOffset: '-1px',
  '&:hover': { outlineColor: 'var(--border-strong)' },
  '&:focus-visible': { outline: '2px solid var(--accent)' },
};

const feedStyles = {
  width: '100%',
  height: '100%',
  objectFit: 'contain' as const, // letterbox — never crop a security feed
};

const offlineStyles = (paused: boolean) => ({
  position: 'absolute' as const,
  inset: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  color: 'var(--text-3)',
  background: paused ? '#000' : 'var(--surface-2)',
  '& span': { fontSize: '12px' },
});

const nameStyles = {
  position: 'absolute' as const,
  left: 0,
  bottom: 0,
  right: 0,
  padding: '28px 12px 10px',
  background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.65))', // legibility scrim over video
  color: '#fff',
  fontSize: '13px',
  fontWeight: 500,
  textAlign: 'left' as const,
  pointerEvents: 'none' as const,
};

const statusStyles = {
  position: 'absolute' as const,
  top: '10px',
  right: '10px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 9px',
  borderRadius: '999px',
  background: 'rgba(9, 9, 11, 0.72)',
  backdropFilter: 'blur(4px)',
  color: 'var(--text-2)',
  fontSize: '11px',
  fontWeight: 500,
  pointerEvents: 'none' as const,
};

export default function CameraTile({ camera, onSelect }: CameraTileProps) {
  const [hasError, setHasError] = useState(false);
  const [ref, visible] = useVisible<HTMLButtonElement>();
  // Stream gating: off-screen or hidden tab → drop the src (server keeps
  // encoding once per loop; we just stop pulling frames per client).
  const feedUrl = visible
    ? cameraService.getVideoFeedUrl(camera.id)
    : null;
  const showFeed = camera.online && !hasError && feedUrl;

  return (
    <button
      ref={ref}
      css={tileStyles}
      onClick={() => onSelect?.(camera.id)}
      aria-label={`Open ${camera.name}`}
    >
      {showFeed ? (
        <img
          src={feedUrl}
          crossOrigin="use-credentials"
          alt={`${camera.name} live feed`}
          css={feedStyles}
          onError={() => setHasError(true)}
        />
      ) : camera.online && !hasError ? (
        <div css={offlineStyles(true)}>
          <span>Paused — off screen</span>
        </div>
      ) : (
        <div css={offlineStyles(false)}>
          <VideoOff size={26} strokeWidth={1.5} />
          <span>{hasError ? 'Feed unavailable' : 'Offline'}</span>
        </div>
      )}

      {/* Name — bottom-left over a scrim */}
      <span css={nameStyles}>{camera.name}</span>

      {/* Status — dot + word, top-right */}
      <span css={statusStyles}>
        <span className={`status-dot ${camera.online ? 'status-dot--live' : ''}`} />
        <span>{camera.online ? 'Live' : 'Offline'}</span>
      </span>
    </button>
  );
}

/**
 * Camera tile — just video (Frigate/UniFi pattern).
 * Black 16:9 cell, no card chrome. Snapshot-idle: tiles show a cheap still
 * refreshing every ~10s and upgrade to the full MJPEG stream only on hover
 * or keyboard focus (Frigate's biggest bandwidth win for many cameras).
 * Off-screen/hidden-tab tiles drop all requests entirely.
 * Overlays: name bottom-left on a scrim, status dot + word top-right.
 */
import { useEffect, useState } from 'react';
import { VideoOff } from 'lucide-react';
import useVisible from '@/hooks/useVisible';
import { cameraService } from '@/services/cameras';
import { tokens } from '@/theme/designTokens';
import type { Camera } from '@/types';

export interface CameraTileProps {
  camera: Camera;
  onSelect?: (cameraId: string) => void;
  forceLive?: boolean;
}

const SNAPSHOT_REFRESH_MS = 10_000;

const tileStyles = {
  position: 'relative' as const,
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#000',
  borderRadius: tokens.radii.default,
  overflow: 'hidden',
  display: 'block',
  padding: 0,
  transition: `outline-color ${tokens.transitions.default}`,
  outline: '1px solid transparent',
  outlineOffset: '-1px',
  '&:hover': { outlineColor: tokens.colors.border.strong },
  '&:focus-visible': { outline: `2px solid ${tokens.colors.accent.primary}` },
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
  gap: tokens.spacing.sm,
  color: tokens.colors.text.muted,
  background: paused ? '#000' : tokens.colors.surface.subtle,
  '& span': { fontSize: tokens.fontSizes.sm },
});


const statusStyles = {
  position: 'absolute' as const,
  top: '10px',
  right: '10px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '3px 9px',
  borderRadius: tokens.radii.full,
  background: tokens.colors.bg.glass,
  backdropFilter: 'blur(4px)',
  color: tokens.colors.text.secondary,
  fontSize: tokens.fontSizes.xs,
  fontWeight: tokens.fontWeights.medium,
  pointerEvents: 'none' as const,
};

export default function CameraTile({ camera, onSelect, forceLive }: CameraTileProps) {
  const [hasError, setHasError] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [snapBust, setSnapBust] = useState(() => Date.now());
  const [ref, visible] = useVisible<HTMLButtonElement>();

  const isLive = hovering || !!forceLive;

  // Snapshot refresh while idle (visible + not live-streaming)
  useEffect(() => {
    if (!visible || isLive || !camera.online) return;
    const t = setInterval(() => {
      setSnapBust(Date.now());
      setHasError(false); // retry snapshot on next tick
    }, SNAPSHOT_REFRESH_MS);
    return () => clearInterval(t);
  }, [visible, isLive, camera.online]);

  const handleHoverStart = () => {
    setHovering(true);
    setHasError(false);
  };

  const handleHoverEnd = () => {
    setHovering(false);
  };

  const showLive = camera.online && !hasError && visible && isLive;
  const showSnapshot = camera.online && !hasError && visible && !isLive;
  const src = showLive
    ? cameraService.getVideoFeedUrl(camera.id)
    : showSnapshot
      ? cameraService.getSnapshotUrl(camera.id, snapBust)
      : null;

  return (
    <button
      ref={ref}
      css={tileStyles}
      onClick={() => onSelect?.(camera.id)}
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
      onFocus={handleHoverStart}
      onBlur={handleHoverEnd}
      aria-label={`Open ${camera.name}`}
    >
      {src ? (
        <img
          key={showLive ? 'live' : 'snapshot'}
          src={src}
          crossOrigin="use-credentials"
          alt={`${camera.name} ${showLive ? 'live feed' : 'snapshot'}`}
          css={feedStyles}
          onError={() => setHasError(true)}
        />
      ) : camera.online && !hasError ? (
        <div css={offlineStyles(true)}>
          <span>Paused — off screen</span>
        </div>
      ) : (
        <div css={offlineStyles(false)}>
          <VideoOff size={24} strokeWidth={1.5} />
          <span>{hasError ? 'Stream error' : 'Offline'}</span>
        </div>
      )}

      <div css={statusStyles}>
        <span css={{ color: tokens.colors.text.primary, fontWeight: tokens.fontWeights.medium }}>
          {camera.name}
        </span>
        <span
          className={`status-dot ${camera.online && !hasError ? 'status-dot--live' : 'status-dot--offline'}`}
        />
        <span>{camera.online && !hasError ? (showLive ? 'LIVE' : 'IDLE') : 'OFFLINE'}</span>
      </div>
    </button>
  );
}

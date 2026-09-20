/**
 * Camera tile — just video (Frigate/UniFi pattern).
 * Black 16:9 cell, no card chrome. Overlays: name bottom-left on a scrim,
 * status dot + word top-right. Everything else lives in the detail view.
 * Props: camera, onSelect(cameraId)
 */
import { useState } from 'react';
import { VideoOff } from 'lucide-react';
import useVisible from '@/hooks/useVisible';
import { cameraService } from '@/services/cameras';
import { tokens } from '@/theme/designTokens';
import type { Camera } from '@/types';

export interface CameraTileProps {
  camera: Camera;
  onSelect?: (cameraId: string) => void;
}

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

const nameStyles = {
  position: 'absolute' as const,
  left: 0,
  bottom: 0,
  right: 0,
  padding: '28px 12px 10px',
  background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.65))', // legibility scrim over video
  color: tokens.colors.text.primary,
  fontSize: tokens.fontSizes.base,
  fontWeight: tokens.fontWeights.medium,
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
  borderRadius: tokens.radii.full,
  background: tokens.colors.bg.glass,
  backdropFilter: 'blur(4px)',
  color: tokens.colors.text.secondary,
  fontSize: tokens.fontSizes.xs,
  fontWeight: tokens.fontWeights.medium,
  pointerEvents: 'none' as const,
};

export default function CameraTile({ camera, onSelect }: CameraTileProps) {
  const [hasError, setHasError] = useState(false);
  const [ref, visible] = useVisible<HTMLButtonElement>();
  // Stream gating: off-screen or hidden tab → drop the src (server keeps
  // encoding once per loop; we just stop pulling frames per client).
  const feedUrl = visible ? cameraService.getVideoFeedUrl(camera.id) : null;
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
          <VideoOff size={24} strokeWidth={1.5} />
          <span>{hasError ? 'Stream error' : 'Offline'}</span>
        </div>
      )}

      <div css={nameStyles}>{camera.name}</div>

      <div css={statusStyles}>
        <span
          className={`status-dot ${camera.online && !hasError ? 'status-dot--live' : 'status-dot--offline'}`}
        />
        <span>{camera.online && !hasError ? 'LIVE' : 'OFFLINE'}</span>
      </div>
    </button>
  );
}

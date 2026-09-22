/**
 * CameraCard — Task S2.2
 * Clean 16:9 surveillance card with status dot,
 * snapshot-idle with hover-to-live stream, and quick action buttons
 * (Playback, Snapshot capture, Expand).
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Camera as CameraIcon, Maximize2, VideoOff } from 'lucide-react';
import useVisible from '@/hooks/useVisible';
import { cameraService } from '@/services/cameras';
import { tokens } from '@/theme/designTokens';
import type { Camera } from '@/types';

export interface CameraCardProps {
  camera: Camera;
  onSelect?: (cameraId: string) => void;
  onSnapshot?: (cameraId: string) => void;
}

const SNAPSHOT_REFRESH_MS = 10_000;

const cardStyles = {
  position: 'relative' as const,
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#000',
  borderRadius: tokens.radii.default,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column' as const,
  border: `1px solid ${tokens.colors.border.subtle}`,
  transition: `border-color ${tokens.transitions.fast}, box-shadow ${tokens.transitions.fast}`,
  cursor: 'pointer',
  '&:hover': {
    borderColor: tokens.colors.border.strong,
    boxShadow: tokens.shadows.card,
    '& .camera-card__actions': {
      opacity: 1,
      transform: 'translateY(0)',
    },
  },
};

const feedStyles = {
  position: 'absolute' as const,
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain' as const,
};

const topHudStyles = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  padding: '8px 10px',
  background: 'linear-gradient(to bottom, rgba(9, 9, 11, 0.75) 0%, transparent 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '8px',
  zIndex: 2,
  pointerEvents: 'none' as const,
};

const nameGroupStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const nameTextStyles = {
  fontSize: tokens.fontSizes.sm,
  fontWeight: tokens.fontWeights.semibold,
  color: tokens.colors.text.primary,
  textShadow: '0 1px 3px rgba(0, 0, 0, 0.9)',
};

const badgeGroupStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const pillBadgeStyles = {
  fontSize: '10.5px',
  fontWeight: tokens.fontWeights.medium,
  padding: '2px 7px',
  borderRadius: tokens.radii.full,
  background: 'rgba(9, 9, 11, 0.75)',
  backdropFilter: 'blur(4px)',
  border: `1px solid ${tokens.colors.border.subtle}`,
  color: tokens.colors.text.secondary,
};

const actionsBarStyles = {
  position: 'absolute' as const,
  bottom: '8px',
  right: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  padding: '3px 4px',
  borderRadius: tokens.radii.sm,
  background: 'rgba(9, 9, 11, 0.82)',
  backdropFilter: 'blur(6px)',
  border: `1px solid ${tokens.colors.border.subtle}`,
  zIndex: 3,
  opacity: 0.88,
  transform: 'translateY(0)',
  transition: `opacity ${tokens.transitions.fast}, transform ${tokens.transitions.fast}`,
  '@media (hover: hover)': {
    opacity: 0,
    transform: 'translateY(4px)',
  },
};

const actionBtnStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: tokens.radii.sm,
  background: 'transparent',
  border: 'none',
  color: tokens.colors.text.secondary,
  cursor: 'pointer',
  transition: `background ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
  '&:hover': {
    background: tokens.colors.surface.raised,
    color: tokens.colors.text.primary,
  },
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

export default function CameraCard({ camera, onSelect, onSnapshot }: CameraCardProps) {
  const navigate = useNavigate();
  const [hasError, setHasError] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [snapBust, setSnapBust] = useState(() => Date.now());
  const [ref, visible] = useVisible<HTMLDivElement>();
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLive = hovering;

  // Touch devices have no hover — a tap-and-hold (or first touch) gives a
  // 30s live window so mobile users can see motion, then it falls back to
  // snapshot-idle (bandwidth-friendly).
  const onTouchStart = () => {
    setHovering(true);
    setHasError(false);
    if (touchTimer.current) clearTimeout(touchTimer.current);
    touchTimer.current = setTimeout(() => setHovering(false), 30_000);
  };

  useEffect(
    () => () => {
      if (touchTimer.current) clearTimeout(touchTimer.current);
    },
    [],
  );

  // Snapshot refresh while idle
  useEffect(() => {
    if (!visible || isLive || !camera.online) return;
    const t = setInterval(() => {
      setSnapBust(Date.now());
      setHasError(false);
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

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(camera.id);
    } else {
      navigate(`/playback?cam=${encodeURIComponent(camera.id)}`);
    }
  };

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/playback?cam=${encodeURIComponent(camera.id)}`);
  };

  const handleSnapshotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSnapshot) {
      onSnapshot(camera.id);
    } else {
      // Download snapshot directly
      const url = cameraService.getSnapshotUrl(camera.id, Date.now());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${camera.id}-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/playback?cam=${encodeURIComponent(camera.id)}`);
  };

  return (
    <div
      ref={ref}
      css={cardStyles}
      onClick={handleCardClick}
      onMouseEnter={handleHoverStart}
      onMouseLeave={handleHoverEnd}
      onTouchStart={onTouchStart}
      role="region"
      aria-label={`Camera ${camera.name}`}
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

      {/* Top HUD - Right-aligned Live Icon and Camera Name */}
      <div css={topHudStyles}>
        <div css={nameGroupStyles}>
          <span
            className={`status-dot ${camera.online && !hasError ? 'status-dot--live' : 'status-dot--offline'}`}
          />
          <span css={nameTextStyles}>{camera.name}</span>
        </div>

        {(!camera.online || hasError) && (
          <div css={badgeGroupStyles}>
            <span
              css={{
                ...pillBadgeStyles,
                color: tokens.colors.status.danger,
              }}
            >
              OFFLINE
            </span>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="camera-card__actions" css={actionsBarStyles}>
        <button
          type="button"
          css={actionBtnStyles}
          onClick={handlePlayClick}
          title="Jump to timeline playback"
          aria-label={`Jump to playback for ${camera.name}`}
        >
          <Play size={14} />
        </button>
        <button
          type="button"
          css={actionBtnStyles}
          onClick={handleSnapshotClick}
          title="Save snapshot image"
          aria-label={`Save snapshot for ${camera.name}`}
        >
          <CameraIcon size={14} />
        </button>
        <button
          type="button"
          css={actionBtnStyles}
          onClick={handleExpandClick}
          title="Open camera view"
          aria-label={`Expand ${camera.name}`}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}

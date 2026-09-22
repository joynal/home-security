/**
 * DashboardPage — Phase 2 (Tasks S2.1, S2.2, S2.3)
 * Executive command center:
 * - S2.1: Recent events horizontal carousel with touch snap, 16:9 crops, severity accents, and playback deep link
 * - S2.2: Camera cards wall with live status dot, hover-to-live stream, and quick actions
 * - S2.3: System health mini-bar with disk volume usage, CPU load, memory, and events today
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Grid } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import RecentEvents from '@/components/RecentEvents';
import CameraCard from '@/components/CameraCard';
import SystemHealthBar from '@/components/SystemHealthBar';
import { cameraService } from '@/services/cameras';
import { tokens } from '@/theme/designTokens';
import type { Camera } from '@/types';

const camerasHeaderStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: tokens.spacing.md,
  marginTop: tokens.spacing.md,
};

const sectionTitleGroupStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.xs,
  fontSize: tokens.fontSizes.sm,
  fontWeight: tokens.fontWeights.semibold,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: tokens.colors.text.secondary,
};

const countBadgeStyles = {
  fontSize: tokens.fontSizes.xs,
  padding: '2px 6px',
  borderRadius: tokens.radii.sm,
  background: tokens.colors.surface.raised,
  color: tokens.colors.text.muted,
};

const gridWallBtnStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  background: tokens.colors.surface.raised,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.sm,
  color: tokens.colors.text.primary,
  fontSize: tokens.fontSizes.xs,
  fontWeight: tokens.fontWeights.medium,
  padding: `${tokens.spacing.xs} ${tokens.spacing.sm}`,
  cursor: 'pointer',
  transition: `background ${tokens.transitions.fast}, border-color ${tokens.transitions.fast}`,
  '&:hover': {
    background: tokens.colors.bg.surface3,
    borderColor: tokens.colors.border.strong,
  },
};

const cameraGridContainerStyles = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
  gap: tokens.spacing.md,
  '@media (max-width: 640px)': {
    gridTemplateColumns: '1fr',
  },
};

const dateBadgeStyles = {
  fontSize: tokens.fontSizes.xs,
  color: tokens.colors.text.muted,
  padding: `2px ${tokens.spacing.sm}`,
  borderRadius: tokens.radii.full,
  background: tokens.colors.surface.subtle,
  border: `1px solid ${tokens.colors.border.subtle}`,
};

export default function DashboardPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState<Camera[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchCameras = () => {
      cameraService
        .getCameras()
        .then((data) => {
          if (cancelled || !data.cameras) return;
          setCameras(data.cameras);
        })
        .catch(() => {});
    };
    fetchCameras();
    const interval = setInterval(fetchCameras, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  const online = cameras.filter((c) => c.online).length;

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const handleCameraSelect = (cameraId: string) => {
    navigate(`/playback?cam=${encodeURIComponent(cameraId)}`);
  };

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Dashboard</span>
        <span
          className={`status-dot ${online === cameras.length && cameras.length > 0 ? 'status-dot--live' : 'status-dot--warn'}`}
        />
        <span className="status-label tnum">
          {online}/{cameras.length} online
        </span>
        <span css={dateBadgeStyles}>{todayStr}</span>
        <span className="page-header__spacer" />
      </header>

      <div className="page-body">
        {/* S2.1: Recent Events Activity Carousel */}
        <RecentEvents limit={15} showHeader={true} />

        {/* S2.2: Camera Preview Cards Wall */}
        <section aria-label="Camera feeds">
          <div css={camerasHeaderStyles}>
            <div css={sectionTitleGroupStyles}>
              <Video size={14} color={tokens.colors.accent.primary} />
              <span>Surveillance Cameras</span>
              <span css={countBadgeStyles} className="tnum">
                {cameras.length}
              </span>
            </div>
            <button
              type="button"
              css={gridWallBtnStyles}
              onClick={() => navigate('/grid')}
              aria-label="Open full camera grid wall"
            >
              <Grid size={13} />
              <span>Open Grid Wall</span>
            </button>
          </div>

          {cameras.length > 0 ? (
            <div css={cameraGridContainerStyles}>
              {cameras.map((camera) => (
                <CameraCard key={camera.id} camera={camera} onSelect={handleCameraSelect} />
              ))}
            </div>
          ) : (
            <div className="live-placeholder">
              <p>Loading camera feeds…</p>
            </div>
          )}
        </section>

        {/* S2.3: System Health Mini-Bar */}
        <SystemHealthBar />
      </div>
    </>
  );
}

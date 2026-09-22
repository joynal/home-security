/**
 * Camera Grid page — dedicated multi-camera surveillance wall.
 * Supports Auto, 1x1, 2x2, 3x3, and 1+5 focus layouts, plus native fullscreen (F).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Maximize2, Minimize2, Square, Zap, ZapOff } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import CameraTile from '@/components/CameraTile';
import { cameraService } from '@/services/cameras';
import { tokens } from '@/theme/designTokens';
import type { Camera } from '@/types';

type LayoutMode = 'auto' | '1x1' | '2x2' | '3x3' | 'focus';

const toolbarBtnStyles = (active?: boolean) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '30px',
  padding: '0 10px',
  borderRadius: tokens.radii.sm,
  fontSize: '12px',
  fontWeight: tokens.fontWeights.medium,
  color: active ? tokens.colors.text.primary : tokens.colors.text.muted,
  background: active ? tokens.colors.surface.raised : 'transparent',
  border: `1px solid ${active ? tokens.colors.border.strong : tokens.colors.border.subtle}`,
  cursor: 'pointer',
  transition: `background ${tokens.transitions.fast}, color ${tokens.transitions.fast}`,
  '&:hover': {
    color: tokens.colors.text.primary,
    background: tokens.colors.surface.raised,
  },
});

const gridContainerStyles = (layout: LayoutMode, count: number) => {
  if (layout === '1x1') {
    return {
      display: 'grid',
      gridTemplateColumns: '1fr',
      height: '100%',
      gap: tokens.spacing.md,
      padding: tokens.spacing.md,
    };
  }
  if (layout === '2x2') {
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: count > 2 ? 'repeat(2, 1fr)' : '1fr',
      height: '100%',
      gap: tokens.spacing.md,
      padding: tokens.spacing.md,
      '@media (max-width: 768px)': {
        gridTemplateColumns: '1fr',
        gridTemplateRows: 'auto',
      },
    };
  }
  if (layout === '3x3') {
    return {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      height: '100%',
      gap: tokens.spacing.md,
      padding: tokens.spacing.md,
      '@media (max-width: 900px)': {
        gridTemplateColumns: 'repeat(2, 1fr)',
      },
      '@media (max-width: 600px)': {
        gridTemplateColumns: '1fr',
      },
    };
  }
  if (layout === 'focus') {
    return {
      display: 'grid',
      gridTemplateColumns: '1fr 280px',
      height: '100%',
      gap: tokens.spacing.md,
      padding: tokens.spacing.md,
      '@media (max-width: 900px)': {
        gridTemplateColumns: '1fr',
        gridTemplateRows: '1fr auto',
      },
    };
  }
  // Default 'auto'
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    overflowY: 'auto' as const,
    alignContent: 'start',
    '@media (max-width: 600px)': {
      gridTemplateColumns: '1fr',
    },
  };
};

const sideStripStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: tokens.spacing.sm,
  overflowY: 'auto' as const,
  maxHeight: '100%',
  '@media (max-width: 900px)': {
    flexDirection: 'row' as const,
    overflowX: 'auto' as const,
    maxHeight: '160px',
  },
};

export default function CameraGridPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [layout, setLayout] = useState<LayoutMode>('auto');
  const [focusIndex, setFocusIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [ecoMode, setEcoMode] = useState(false);

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

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  // Listen for 'F' shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        toggleFullscreen();
      }
    };
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [toggleFullscreen]);

  const online = cameras.filter((c) => c.online).length;

  const heroCamera = cameras[focusIndex] || cameras[0];
  const sideCameras = cameras.filter((_, idx) => idx !== focusIndex);

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">Camera Wall</span>
        <span
          className={`status-dot ${online === cameras.length && cameras.length > 0 ? 'status-dot--live' : 'status-dot--warn'}`}
        />
        <span className="status-label tnum">
          {online}/{cameras.length} online
        </span>

        <span className="page-header__spacer" />

        {/* Layout controls */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            css={toolbarBtnStyles(layout === 'auto')}
            onClick={() => setLayout('auto')}
            title="Auto Grid"
            aria-label="Auto Grid"
          >
            <Grid size={14} />
            <span className="hide-mobile">Auto</span>
          </button>
          <button
            css={toolbarBtnStyles(layout === '1x1')}
            onClick={() => setLayout('1x1')}
            title="1x1 Single View"
            aria-label="1x1 Single View"
          >
            <Square size={14} />
            <span className="hide-mobile">1x1</span>
          </button>
          <button
            css={toolbarBtnStyles(layout === '2x2')}
            onClick={() => setLayout('2x2')}
            title="2x2 Grid"
            aria-label="2x2 Grid"
          >
            <span>2×2</span>
          </button>
          <button
            css={toolbarBtnStyles(layout === '3x3')}
            onClick={() => setLayout('3x3')}
            title="3x3 Grid"
            aria-label="3x3 Grid"
          >
            <span>3×3</span>
          </button>
          <button
            css={toolbarBtnStyles(layout === 'focus')}
            onClick={() => setLayout('focus')}
            title="1+Focus Layout"
            aria-label="1+Focus Layout"
          >
            <span>1+F</span>
          </button>

          <div
            style={{
              width: '1px',
              height: '18px',
              background: tokens.colors.border.subtle,
              margin: '0 2px',
            }}
          />

          {/* Eco / Live mode toggle */}
          <button
            css={toolbarBtnStyles(ecoMode)}
            onClick={() => setEcoMode((v) => !v)}
            title={ecoMode ? 'Eco Mode: Low bandwidth snapshot polling' : 'Live Streams'}
            aria-label="Toggle Eco Mode"
          >
            {ecoMode ? (
              <ZapOff size={14} color={tokens.colors.status.warning} />
            ) : (
              <Zap size={14} color={tokens.colors.status.live} />
            )}
            <span className="hide-mobile">{ecoMode ? 'Eco' : 'Live'}</span>
          </button>

          {/* Fullscreen button */}
          <button
            css={toolbarBtnStyles(isFullscreen)}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </header>

      <div
        style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: tokens.colors.bg.canvas }}
      >
        {cameras.length === 0 ? (
          <div className="live-placeholder">
            <p>Loading camera feeds…</p>
          </div>
        ) : layout === 'focus' && heroCamera ? (
          <div css={gridContainerStyles('focus', cameras.length)}>
            <div style={{ height: '100%', minHeight: 0 }}>
              <CameraTile
                camera={heroCamera}
                forceLive={!ecoMode}
                onSelect={() => navigate(`/playback/${heroCamera.id}`)}
              />
            </div>
            <div css={sideStripStyles}>
              {sideCameras.map((cam) => {
                const actualIdx = cameras.findIndex((c) => c.id === cam.id);
                return (
                  <div key={cam.id} style={{ height: '140px', flexShrink: 0 }}>
                    {/* Clicking a side tile SWAPS it into the hero (plan: without
                        reloading streams) — navigation stays on the tile's expand
                        affordance rather than hijacking the whole click. */}
                    <CameraTile
                      camera={cam}
                      forceLive={false}
                      onSelect={() => setFocusIndex(actualIdx)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div css={gridContainerStyles(layout, cameras.length)}>
            {cameras.map((camera) => (
              <div
                key={camera.id}
                style={{ height: layout === 'auto' ? 'auto' : '100%', minHeight: 0 }}
              >
                <CameraTile
                  camera={camera}
                  forceLive={!ecoMode}
                  onSelect={() => navigate(`/playback/${camera.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

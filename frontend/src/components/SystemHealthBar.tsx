/**
 * SystemHealthBar — Task S2.3
 * Compact system status strip showing storage volume usage, CPU load estimate,
 * memory consumption, and events recorded today.
 */
import { useState, useEffect } from 'react';
import { HardDrive, Cpu, Activity, ShieldCheck, Video } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { systemService } from '@/services/system';
import { tokens } from '@/theme/designTokens';
import type { SystemHealthResponse } from '@/types';

const stripStyles = {
  marginTop: tokens.spacing.xl,
  padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
  background: tokens.colors.surface.subtle,
  borderRadius: tokens.radii.default,
  border: `1px solid ${tokens.colors.border.subtle}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap' as const,
  gap: tokens.spacing.md,
  fontSize: tokens.fontSizes.xs,
  color: tokens.colors.text.secondary,
};

const groupStyles = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap' as const,
  gap: tokens.spacing.lg,
};

const itemStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const labelStyles = {
  color: tokens.colors.text.muted,
};

const valueStyles = {
  color: tokens.colors.text.primary,
  fontWeight: tokens.fontWeights.medium,
};

const storageBarContainerStyles = {
  width: '64px',
  height: '6px',
  borderRadius: tokens.radii.full,
  background: tokens.colors.surface.raised,
  overflow: 'hidden',
  display: 'inline-block',
};

export default function SystemHealthBar() {
  const { token } = useAuth();
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetchHealth = () => {
      systemService
        .getSystemHealth()
        .then((data) => {
          if (!cancelled) setHealth(data);
        })
        .catch(() => {});
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  if (!health) return null;

  const storagePct = Math.min(100, Math.max(0, health.disk.percent_used));
  const storageColor =
    storagePct > 90
      ? tokens.colors.status.danger
      : storagePct > 75
        ? tokens.colors.status.warning
        : tokens.colors.accent.primary;

  return (
    <footer css={stripStyles} aria-label="System health summary">
      <div css={groupStyles}>
        {/* Storage */}
        <div
          css={itemStyles}
          title={`Used: ${health.disk.used_gb} GB / Free: ${health.disk.free_gb} GB`}
        >
          <HardDrive size={13} color={tokens.colors.accent.primary} />
          <span css={labelStyles}>Storage:</span>
          <span css={valueStyles} className="tnum">
            {health.disk.recordings_gb > 0
              ? `${health.disk.recordings_gb} GB`
              : `${health.disk.used_gb} GB`}{' '}
            / {health.disk.total_gb} GB ({storagePct}%)
          </span>
          <div css={storageBarContainerStyles} aria-hidden="true">
            <div
              css={{
                height: '100%',
                width: `${storagePct}%`,
                background: storageColor,
                borderRadius: tokens.radii.full,
                transition: `width ${tokens.transitions.slow}`,
              }}
            />
          </div>
        </div>

        {/* CPU */}
        <div css={itemStyles}>
          <Cpu size={13} color={tokens.colors.text.secondary} />
          <span css={labelStyles}>CPU:</span>
          <span css={valueStyles} className="tnum">
            {health.cpu_percent}%
          </span>
        </div>

        {/* Memory */}
        <div css={itemStyles}>
          <Activity size={13} color={tokens.colors.text.secondary} />
          <span css={labelStyles}>Memory:</span>
          <span css={valueStyles} className="tnum">
            {health.memory_mb} MB
          </span>
        </div>
      </div>

      <div css={groupStyles}>
        {/* Cameras status */}
        <div css={itemStyles}>
          <Video size={13} color={tokens.colors.status.live} />
          <span css={labelStyles}>Cameras:</span>
          <span css={valueStyles} className="tnum">
            {health.cameras_online}/{health.cameras_total} Online
          </span>
        </div>

        {/* Events Today */}
        <div css={itemStyles}>
          <ShieldCheck size={13} color={tokens.colors.accent.cyan} />
          <span css={labelStyles}>Events Today:</span>
          <span css={valueStyles} className="tnum">
            {health.events_today}
          </span>
        </div>
      </div>
    </footer>
  );
}

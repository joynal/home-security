/**
 * TimelineRail — Scrypted-style vertical timeline (time is the Y axis).
 * Newest at top. Event blobs on a rail; thumbnails pinned to timestamps
 * with thin connector lines; hour ticks with monospace labels; a playhead
 * line at the current playback/live position. Click anywhere to seek.
 */
import { useMemo, type KeyboardEvent, type MouseEvent, type ComponentType } from 'react';
import { CircleAlert, PersonStanding, User } from 'lucide-react';
import { eventService } from '@/services/events';
import { tokens } from '@/theme/designTokens';
import type { SecurityEvent, TimelineHour } from '@/types';

export interface TimelineRailProps {
  date: string;
  hours: TimelineHour[];
  events: SecurityEvent[];
  playTs: number | null;
  onSeek: (epochS: number) => void;
  cameraId?: string;
  token?: string | null;
}

interface SeverityConfig {
  tone: 'alert' | 'warn' | 'ok';
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
}

const HOUR_PX = 56; // vertical scale: px per hour
const TOP_PAD = 12;

const SEVERITY: Record<string, SeverityConfig> = {
  unknown_face: { tone: 'alert', icon: CircleAlert },
  loitering: { tone: 'warn', icon: PersonStanding },
  known_face: { tone: 'ok', icon: User },
  person_detected: { tone: 'ok', icon: PersonStanding },
  motion: { tone: 'ok', icon: PersonStanding },
};

const tlContainerStyles = {
  display: 'flex',
  height: '100%',
  minHeight: 0,
  userSelect: 'none' as const,
};

const scaleStyles = {
  width: '58px',
  flexShrink: 0,
  position: 'relative' as const,
};

const hourRowStyles = (top: number) => ({
  position: 'absolute' as const,
  right: tokens.spacing.sm,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transform: 'translateY(-50%)',
  top,
});

const hourLabelStyles = {
  fontSize: '10.5px',
  color: tokens.colors.text.muted,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap' as const,
};

const tickStyles = {
  width: '8px',
  height: '1px',
  background: tokens.colors.border.strong,
};

const canvasStyles = (height: number) => ({
  position: 'relative' as const,
  flex: 1,
  height,
  cursor: 'pointer',
  outline: 'none',
  '&:focus-visible': {
    boxShadow: `inset 0 0 0 1px ${tokens.colors.accent.primary}`,
  },
});

const railTrackStyles = {
  position: 'absolute' as const,
  left: '6px',
  width: '2px',
  top: `${TOP_PAD}px`,
  bottom: `${TOP_PAD}px`,
  background: tokens.colors.border.subtle,
};

const coverageBarStyles = (top: number, height: number) => ({
  position: 'absolute' as const,
  left: 0,
  width: '2px',
  top,
  height,
  background: tokens.colors.accent.primary,
  opacity: 0.85,
});

const eventRowStyles = (top: number) => ({
  position: 'absolute' as const,
  left: 0,
  right: '6px',
  display: 'flex',
  alignItems: 'center',
  transform: 'translateY(-50%)',
  top,
  pointerEvents: 'auto' as const,
});

const blobStyles = (tone: string) => {
  const bg =
    tone === 'alert'
      ? tokens.colors.status.alert
      : tone === 'warn'
        ? tokens.colors.status.warning
        : tokens.colors.status.live;
  return {
    position: 'absolute' as const,
    left: '3px',
    width: '8px',
    height: '8px',
    borderRadius: tokens.radii.full,
    background: bg,
    transform: 'translateX(-50%)',
    boxShadow: `0 0 0 2px ${tokens.colors.surface.default}, 0 0 6px ${bg}`,
  };
};

const connectorStyles = {
  position: 'absolute' as const,
  left: '8px',
  width: '12px',
  height: '1px',
  background: tokens.colors.border.strong,
};

const iconWrapperStyles = (tone: string) => {
  const color =
    tone === 'alert'
      ? tokens.colors.status.alert
      : tone === 'warn'
        ? tokens.colors.status.warning
        : tokens.colors.status.live;
  return {
    marginLeft: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px',
    color,
    flexShrink: 0,
  };
};

const thumbStyles = {
  width: '56px',
  aspectRatio: '16 / 9',
  borderRadius: tokens.radii.sm,
  objectFit: 'cover' as const,
  background: '#000',
  border: `1px solid ${tokens.colors.border.subtle}`,
  flexShrink: 0,
  marginLeft: '4px',
  cursor: 'pointer',
  transition: 'transform 0.12s, border-color 0.12s',
  '&:hover': {
    transform: 'scale(1.08)',
    borderColor: tokens.colors.accent.primary,
    zIndex: 5,
  },
};

const thumbEmptyStyles = {
  width: '56px',
  aspectRatio: '16 / 9',
  borderRadius: tokens.radii.sm,
  border: `1px solid ${tokens.colors.border.subtle}`,
  flexShrink: 0,
  marginLeft: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: tokens.colors.surface.subtle,
  color: tokens.colors.text.muted,
  fontSize: '10px',
};

const whenStyles = {
  fontSize: '10px',
  color: tokens.colors.text.muted,
  marginLeft: '7px',
};

const playheadStyles = (top: number) => ({
  position: 'absolute' as const,
  left: 0,
  right: 0,
  height: 0,
  borderTop: `2px solid ${tokens.colors.accent.primary}`,
  pointerEvents: 'none' as const,
  top,
});

const playheadBadgeStyles = {
  position: 'absolute' as const,
  left: '2px',
  top: '-11px',
  background: tokens.colors.accent.primary,
  color: tokens.colors.text.primary,
  fontSize: '10px',
  fontWeight: tokens.fontWeights.semibold,
  padding: '2px 7px',
  borderRadius: tokens.radii.sm,
};

function dayStartEpoch(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 1000;
}

function fmtHour(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function TimelineRail({ date, hours, events, playTs, onSeek }: TimelineRailProps) {
  const day0 = dayStartEpoch(date);
  const totalPx = 24 * HOUR_PX;

  const positioned = useMemo(() => {
    return events
      .map((ev) => {
        const ts = new Date(ev.timestamp).getTime() / 1000;
        const off = ts - day0;
        if (off < 0 || off > 86400) return null;
        const seg = SEVERITY[ev.event_type] || SEVERITY.motion;
        return { ...ev, ts, top: TOP_PAD + (off / 86400) * totalPx, ...seg };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .sort((a, b) => b.ts - a.ts); // newest first (top)
  }, [events, day0, totalPx]);

  const tsToY = (ts: number) => TOP_PAD + ((ts - day0) / 86400) * totalPx;

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top - TOP_PAD;
    const clampedY = Math.max(0, Math.min(totalPx, y));
    const epochS = day0 + (clampedY / totalPx) * 86400;
    onSeek(Math.round(epochS));
  };

  return (
    <div css={tlContainerStyles}>
      {/* Time axis labels */}
      <div css={scaleStyles}>
        {Array.from({ length: 25 }, (_, i) => {
          const top = TOP_PAD + i * HOUR_PX;
          return (
            <div key={i} css={hourRowStyles(top)}>
              <span css={hourLabelStyles} className="tnum">
                {fmtHour(i % 24)}
              </span>
              <span css={tickStyles} />
            </div>
          );
        })}
      </div>

      {/* Rail canvas */}
      <div
        css={canvasStyles(totalPx + TOP_PAD * 2)}
        onClick={handleClick}
        role="slider"
        aria-label="Timeline — click to seek"
        aria-valuemin={0}
        aria-valuemax={86400}
        aria-valuenow={playTs ? Math.round(playTs - day0) : undefined}
        tabIndex={0}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'ArrowUp') onSeek((playTs ?? day0) + 60);
          if (e.key === 'ArrowDown') onSeek((playTs ?? day0) - 60);
        }}
      >
        {/* Recorded-segment coverage behind the rail (blue bars) */}
        <div css={railTrackStyles}>
          {hours.map((h, i) =>
            h.segment_minutes > 0 ? (
              <div
                key={i}
                css={coverageBarStyles(
                  TOP_PAD + i * HOUR_PX + 2,
                  Math.max(3, (h.segment_minutes / 60) * (HOUR_PX - 4)),
                )}
              />
            ) : null,
          )}
        </div>

        {/* Event blobs + connector + thumbnail rows */}
        {positioned.map((ev) => (
          <div key={ev.id} css={eventRowStyles(ev.top)}>
            <span css={blobStyles(ev.tone)} />
            <span css={connectorStyles} />
            <span css={iconWrapperStyles(ev.tone)}>
              <ev.icon size={11} strokeWidth={2} />
            </span>
            {ev.thumbnail_path ? (
              <img
                css={thumbStyles}
                src={eventService.getThumbnailUrl(ev.id)}
                crossOrigin="use-credentials"
                alt=""
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(ev.ts);
                }}
              />
            ) : (
              <span
                css={thumbEmptyStyles}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(ev.ts);
                }}
              >
                {fmtTime(ev.ts)}
              </span>
            )}
            <span css={whenStyles} className="tnum">
              {fmtTime(ev.ts)}
            </span>
          </div>
        ))}

        {/* Playhead marker line */}
        {playTs !== null && playTs >= day0 && playTs <= day0 + 86400 && (
          <div css={playheadStyles(tsToY(playTs))}>
            <span css={playheadBadgeStyles} className="tnum">
              {fmtTime(playTs)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

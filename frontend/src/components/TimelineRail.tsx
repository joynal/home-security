/**
 * TimelineRail — Task S3.1
 * Scrypted NVR signature vertical timeline:
 * - Time is on the vertical Y-axis (top = most recent / "Now", bottom = past)
 * - 58px monospace hour scale with tick marks
 * - Continuous recording coverage bars (RecordingIndex segments)
 * - Pinned 16:9 event thumbnails with hairline connectors & object icons
 * - Draggable horizontal playhead rule with live time badge
 * - Click or drag anywhere to seek
 */
import { useState, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { AlertTriangle, UserCheck, User, Clock, CircleAlert } from 'lucide-react';
import { eventService } from '@/services/events';
import { TOP_PAD, dayStartEpoch, placePins, railHeight, tsToY, yToTs } from '@/lib/timeline';
import { tokens } from '@/theme/designTokens';
import type { NormalizedSegment, SecurityEvent } from '@/types';

export interface TimelineRailProps {
  date: string;
  segments: NormalizedSegment[];
  events: SecurityEvent[];
  playTs: number | null;
  onSeek: (epochS: number) => void;
  /** Vertical scale — px per hour. Zoom presets live in the parent. */
  pxPerHour: number;
  cameraId?: string;
  token?: string | null;
}

const RAIL_WIDTH = 12; // coverage rail width
const THUMB_W = 120; // pin thumbnail width (16:9 → ~68px tall)
const PIN_MIN_GAP = 78; // thumbnail height + margin — closer events cluster
const THUMBS_AT_PXH = 240; // show thumbnail pins only when zoomed in enough

const tlContainerStyles = {
  display: 'flex',
  height: '100%',
  minHeight: 0,
  userSelect: 'none' as const,
  position: 'relative' as const,
};

const scaleStyles = {
  width: '64px',
  flexShrink: 0,
  position: 'relative' as const,
};

const hourRowStyles = (top: number) => ({
  position: 'absolute' as const,
  right: tokens.spacing.xs,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transform: 'translateY(-50%)',
  top,
});

const hourLabelStyles = {
  fontSize: '11px',
  color: tokens.colors.text.muted,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap' as const,
};

const tickStyles = (major: boolean) => ({
  width: major ? '8px' : '5px',
  height: '1px',
  background: major ? tokens.colors.border.strong : tokens.colors.border.subtle,
});

const canvasStyles = (height: number) => ({
  position: 'relative' as const,
  flex: 1,
  height,
  cursor: 'pointer',
  outline: 'none',
  touchAction: 'none' as const,
  '&:focus-visible': {
    boxShadow: `inset 0 0 0 1px ${tokens.colors.accent.primary}`,
  },
});

const railTrackStyles = {
  position: 'absolute' as const,
  left: '8px',
  width: `${RAIL_WIDTH}px`,
  top: `${TOP_PAD}px`,
  bottom: `${TOP_PAD}px`,
  background: 'rgba(255, 255, 255, 0.04)',
  borderRadius: '4px',
  border: `1px solid ${tokens.colors.border.subtle}`,
};

const coverageBarStyles = (top: number, height: number) => ({
  position: 'absolute' as const,
  left: '1px',
  right: '1px',
  top,
  height,
  background: tokens.colors.accent.primary,
  borderRadius: '2px',
});

const eventRowStyles = (top: number) => ({
  position: 'absolute' as const,
  left: '8px',
  right: '10px',
  display: 'flex',
  alignItems: 'center',
  transform: 'translateY(-50%)',
  top,
  zIndex: 3,
  pointerEvents: 'auto' as const,
});

/** Flat severity dot ON the rail at the event's true y — every event, no glow. */
const railDotStyles = (top: number, severity: string) => ({
  position: 'absolute' as const,
  left: `${RAIL_WIDTH / 2}px`,
  width: '6px',
  height: '6px',
  borderRadius: tokens.radii.full,
  background:
    severity === 'alert'
      ? tokens.colors.status.danger
      : severity === 'warn'
        ? tokens.colors.status.warning
        : tokens.colors.status.live,
  transform: 'translate(-50%, -50%)',
  zIndex: 4,
  top,
});

const connectorStyles = {
  position: 'absolute' as const,
  left: `${RAIL_WIDTH}px`,
  width: '14px',
  height: '1px',
  background: tokens.colors.border.strong,
};

/** Bare colored object-class icon — no chip, no border (zero-chrome guardrail). */
const iconStyles = (severity: string) => ({
  marginLeft: '18px',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  color:
    severity === 'alert'
      ? tokens.colors.status.danger
      : severity === 'warn'
        ? tokens.colors.status.warning
        : tokens.colors.status.live,
});

const thumbStyles = {
  width: `${THUMB_W}px`,
  aspectRatio: '16 / 9',
  borderRadius: tokens.radii.sm,
  objectFit: 'cover' as const,
  background: '#000',
  border: `1px solid ${tokens.colors.border.subtle}`,
  flexShrink: 0,
  marginLeft: '6px',
  cursor: 'pointer',
  transition: `transform ${tokens.transitions.fast}, border-color ${tokens.transitions.fast}`,
  '&:hover': {
    transform: 'scale(1.15)',
    borderColor: tokens.colors.accent.primary,
    zIndex: 10,
  },
};

const thumbEmptyStyles = {
  width: `${THUMB_W}px`,
  aspectRatio: '16 / 9',
  borderRadius: tokens.radii.sm,
  border: `1px solid ${tokens.colors.border.subtle}`,
  flexShrink: 0,
  marginLeft: '6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: tokens.colors.surface.subtle,
  color: tokens.colors.text.muted,
  fontSize: '10px',
  cursor: 'pointer',
  '&:hover': {
    borderColor: tokens.colors.accent.primary,
  },
};

const clusterBadgeStyles = {
  fontSize: '10px',
  fontWeight: tokens.fontWeights.semibold,
  color: tokens.colors.accent.hover,
  background: 'rgba(59, 130, 246, 0.15)',
  borderRadius: tokens.radii.sm,
  padding: '1px 5px',
  marginLeft: '5px',
  flexShrink: 0,
};

const labelInfoStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  marginLeft: '6px',
  minWidth: 0,
  overflow: 'hidden',
};

const personNameStyles = {
  fontSize: '11px',
  fontWeight: tokens.fontWeights.medium,
  color: tokens.colors.text.primary,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const whenStyles = {
  fontSize: '10px',
  color: tokens.colors.text.muted,
};

const playheadStyles = (top: number) => ({
  position: 'absolute' as const,
  left: 0,
  right: 0,
  height: 0,
  borderTop: `2px solid ${tokens.colors.accent.primary}`,
  pointerEvents: 'none' as const,
  zIndex: 15,
  top,
});

const playheadHandleStyles = {
  position: 'absolute' as const,
  left: `${8 + RAIL_WIDTH / 2}px`,
  top: '-7px',
  width: '14px',
  height: '14px',
  borderRadius: tokens.radii.full,
  background: tokens.colors.accent.primary,
  border: '2px solid #fff',
  boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
  transform: 'translateX(-50%)',
  cursor: 'grab',
  pointerEvents: 'auto' as const,
  '&:active': {
    cursor: 'grabbing',
  },
};

const playheadBadgeStyles = {
  position: 'absolute' as const,
  right: '8px',
  top: '-12px',
  background: tokens.colors.accent.primary,
  color: '#fff',
  fontSize: '10.5px',
  fontWeight: tokens.fontWeights.semibold,
  padding: '2px 8px',
  borderRadius: tokens.radii.sm,
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
  whiteSpace: 'nowrap' as const,
};

function fmtHour(h: number): string {
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getEventSeverity(type: string): 'alert' | 'warn' | 'ok' {
  if (type === 'unknown_face') return 'alert';
  if (type === 'loitering') return 'warn';
  return 'ok';
}

function getEventIcon(type: string) {
  if (type === 'unknown_face') return <CircleAlert size={11} strokeWidth={2.2} />;
  if (type === 'loitering') return <Clock size={11} strokeWidth={2.2} />;
  if (type === 'known_face') return <UserCheck size={11} strokeWidth={2.2} />;
  if (type === 'motion') return <AlertTriangle size={11} strokeWidth={2.2} />;
  return <User size={11} strokeWidth={2.2} />;
}

export default function TimelineRail({
  date,
  segments,
  events,
  playTs,
  onSeek,
  pxPerHour,
}: TimelineRailProps) {
  const day0 = dayStartEpoch(date);
  const totalPx = 24 * pxPerHour;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const toY = (ts: number) => tsToY(ts, day0, pxPerHour);
  const fromY = (y: number) => yToTs(y, day0, pxPerHour);

  // Every event gets a flat dot on the rail at its TRUE position (density view).
  const inDayEvents = events
    .map((ev) => {
      const ts = new Date(ev.timestamp).getTime() / 1000;
      const off = ts - day0;
      if (off < 0 || off > 86400) return null;
      return { ...ev, ts, severity: getEventSeverity(ev.event_type) };
    })
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const railDots = inDayEvents.map((ev) => ({ ...ev, y: toY(ev.ts) }));

  // Thumbnail pins at true positions; collisions cluster onto the newer pin.
  const showThumbs = pxPerHour >= THUMBS_AT_PXH;
  const pins = showThumbs
    ? placePins(
        inDayEvents,
        (ev) => ev.ts,
        (ts) => toY(ts),
        PIN_MIN_GAP,
      )
    : [];

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const epochS = fromY(y);
    onSeek(epochS);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const epochS = fromY(y);
    onSeek(epochS);
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may have already been released
      }
    }
  };

  return (
    <div css={tlContainerStyles}>
      {/* Time axis scale — quarter-hour ticks, hourly labels (thinned at low zoom) */}
      <div css={scaleStyles}>
        {(() => {
          const showMinor = pxPerHour >= 200; // 15-min ticks only when zoomed in
          const labelEveryHours = pxPerHour < 60 ? 3 : pxPerHour < 120 ? 2 : 1;
          return Array.from({ length: 97 }, (_, q) => {
            const minutesFromDayEnd = q * 15; // q=0 is the top (end of day)
            const isHour = minutesFromDayEnd % 60 === 0;
            if (!isHour && !showMinor) return null;
            const hour = (minutesFromDayEnd / 60) % 24;
            const showLabel = isHour && (q === 96 || hour % labelEveryHours === 0);
            const top = TOP_PAD + (minutesFromDayEnd / 1440) * totalPx;
            return (
              <div key={q} css={hourRowStyles(top)}>
                <span
                  css={{ ...hourLabelStyles, visibility: showLabel ? ('visible' as const) : ('hidden' as const) }}
                  className="tnum"
                >
                  {fmtHour(hour)}
                </span>
                <span css={tickStyles(isHour)} />
              </div>
            );
          });
        })()}
      </div>

      {/* Rail canvas */}
      <div
        ref={canvasRef}
        css={canvasStyles(railHeight(pxPerHour))}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setIsDragging(false)}
        role="slider"
        aria-label="Timeline scrubber — drag or click to seek"
        aria-valuemin={0}
        aria-valuemax={86400}
        aria-valuenow={playTs ? Math.round(playTs - day0) : undefined}
        tabIndex={0}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (e.key === 'ArrowUp') onSeek((playTs ?? day0) + 60);
          if (e.key === 'ArrowDown') onSeek((playTs ?? day0) - 60);
        }}
      >
        {/* Exact recording coverage from the segments index (contiguous runs, gaps = downtime) */}
        <div css={railTrackStyles}>
          {segments.map((seg) => {
            const dayEnd = day0 + 86400;
            const clampedStart = Math.max(seg.startEpoch, day0);
            const clampedEnd = Math.min(seg.endEpoch, dayEnd);
            if (clampedEnd - clampedStart <= 0) return null;
            const top = toY(clampedEnd); // later time = higher on the rail
            const height = Math.max(2, toY(clampedStart) - toY(clampedEnd));
            return (
              <div
                key={`${seg.name}-${seg.startEpoch}`}
                css={coverageBarStyles(top, height)}
                title={`${fmtTime(clampedStart)} – ${fmtTime(clampedEnd)} · ${seg.name}`}
              />
            );
          })}
        </div>

        {/* Flat severity dots on the rail — every event at its true time */}
        {railDots.map((ev) => (
          <span
            key={`dot-${ev.id}`}
            css={railDotStyles(ev.y, ev.severity)}
            title={`${ev.person_name || ev.event_type.replace('_', ' ')} · ${fmtTime(ev.ts)}`}
          />
        ))}

        {/* Thumbnail pins (zoomed in) — clustered, never displaced */}
        {pins.map((pin) => {
          const ev = pin.event;
          const personOrType =
            ev.person_name ||
            (ev.event_type === 'unknown_face'
              ? 'Unknown'
              : ev.event_type === 'loitering'
                ? 'Loitering'
                : ev.event_type.replace('_', ' '));

          return (
            <div key={ev.id} css={eventRowStyles(pin.y)}>
              <span css={connectorStyles} />
              <span css={iconStyles(ev.severity)}>{getEventIcon(ev.event_type)}</span>

              {ev.thumbnail_path ? (
                <img
                  css={thumbStyles}
                  src={eventService.getThumbnailUrl(ev.id)}
                  crossOrigin="use-credentials"
                  alt={personOrType}
                  loading="lazy"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(ev.ts);
                  }}
                  title={`${personOrType}${pin.clusterCount ? ` +${pin.clusterCount} more` : ''} · ${fmtTime(ev.ts)}`}
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

              <div css={labelInfoStyles}>
                <span css={personNameStyles}>
                  {personOrType}
                  {pin.clusterCount > 0 && (
                    <span className="tnum" css={clusterBadgeStyles}>
                      +{pin.clusterCount}
                    </span>
                  )}
                </span>
                <span css={whenStyles} className="tnum">
                  {fmtTime(ev.ts)}
                </span>
              </div>
            </div>
          );
        })}

        {/* Draggable playhead line + badge */}
        {playTs !== null && playTs >= day0 && playTs <= day0 + 86400 && (
          <div css={playheadStyles(toY(playTs))} data-dragging={isDragging || undefined}>
            <div css={playheadHandleStyles} aria-label="Draggable playhead handle" />
            <span css={playheadBadgeStyles} className="tnum">
              {fmtTime(playTs)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

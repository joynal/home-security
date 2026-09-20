/**
 * TimelineRail — Scrypted-style vertical timeline (time is the Y axis).
 * Newest at top. Event blobs on a rail; thumbnails pinned to timestamps
 * with thin connector lines; hour ticks with monospace labels; a playhead
 * line at the current playback/live position. Click anywhere to seek.
 *
 * Props: date (YYYY-MM-DD), hours (timeline API buckets), events [],
 * playTs (epoch s | null), onSeek(epochS), cameraId, token
 */
import { useMemo } from 'react';
import { CircleAlert, PersonStanding, User } from 'lucide-react';
import { eventService } from '../services/events';
const HOUR_PX = 56; // vertical scale: px per hour
const TOP_PAD = 12;

const SEVERITY = {
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
  userSelect: 'none',
};

const scaleStyles = {
  width: '58px',
  flexShrink: 0,
  position: 'relative',
};

const hourRowStyles = (top) => ({
  position: 'absolute',
  right: '8px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  transform: 'translateY(-50%)',
  top,
});

const hourLabelStyles = {
  fontSize: '10.5px',
  color: 'var(--text-3)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

const tickStyles = {
  width: '8px',
  height: '1px',
  background: 'var(--border-strong)',
};

const canvasStyles = (height) => ({
  position: 'relative',
  flex: 1,
  minWidth: 0,
  cursor: 'crosshair',
  height,
  '&:focus-visible': {
    outline: '2px solid var(--accent)',
    outlineOffset: '-2px',
  },
});

const railTrackStyles = {
  position: 'absolute',
  left: '12px',
  top: 0,
  bottom: 0,
  width: '10px',
  borderRadius: '5px',
  background: 'var(--surface-2)',
};

const coverageBarStyles = (top, height) => ({
  position: 'absolute',
  left: 0,
  width: '10px',
  borderRadius: '5px',
  background: '#2e5c8f', // muted recorded-blue on zinc
  top,
  height,
});

const getToneColor = (tone) => {
  if (tone === 'alert') return 'var(--alert)';
  if (tone === 'warn') return 'var(--warn)';
  return '#4b7ba8';
};

const eventRowStyles = (top) => ({
  position: 'absolute',
  left: 0,
  display: 'flex',
  alignItems: 'center',
  height: '46px',
  transform: 'translateY(-50%)',
  pointerEvents: 'none',
  top,
});

const blobStyles = (tone) => ({
  position: 'absolute',
  left: '11px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  background: getToneColor(tone),
});

const connectorStyles = {
  width: '34px',
  height: '1px',
  background: 'var(--border-strong)',
  marginLeft: '24px',
  flexShrink: 0,
};

const iconWrapperStyles = (tone) => ({
  color: tone === 'alert' ? 'var(--alert)' : tone === 'warn' ? 'var(--warn)' : 'var(--text-3)',
  marginRight: '6px',
  display: 'flex',
});

const thumbStyles = {
  width: '112px',
  aspectRatio: '16 / 9',
  borderRadius: 'var(--radius-sm)',
  objectFit: 'cover',
  background: '#000',
  pointerEvents: 'auto',
  cursor: 'pointer',
  transition: 'transform var(--transition)',
  '&:hover': {
    transform: 'scale(1.06)',
  },
};

const thumbEmptyStyles = {
  ...thumbStyles,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--surface-2)',
  color: 'var(--text-3)',
  fontSize: '10px',
};

const whenStyles = {
  fontSize: '10px',
  color: 'var(--text-3)',
  marginLeft: '7px',
};

const playheadStyles = (top) => ({
  position: 'absolute',
  left: 0,
  right: 0,
  height: 0,
  borderTop: '2px solid var(--accent)',
  pointerEvents: 'none',
  top,
});

const playheadBadgeStyles = {
  position: 'absolute',
  left: '2px',
  top: '-11px',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: '10px',
  fontWeight: 600,
  padding: '2px 7px',
  borderRadius: '4px',
};

function dayStartEpoch(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 1000;
}

function fmtHour(h) {
  const ampm = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

function fmtTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function TimelineRail({ date, hours, events, playTs, onSeek }) {
  const day0 = dayStartEpoch(date);
  const totalPx = 24 * HOUR_PX;

  const positioned = useMemo(() => {
    return events
      .map(ev => {
        const ts = new Date(ev.timestamp).getTime() / 1000;
        const off = ts - day0;
        if (off < 0 || off > 86400) return null;
        const seg = SEVERITY[ev.event_type] || SEVERITY.motion;
        return { ...ev, ts, top: TOP_PAD + (off / 86400) * totalPx, ...seg };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts); // newest first (top)
  }, [events, day0, totalPx]);

  const tsToY = (ts) => TOP_PAD + ((ts - day0) / 86400) * totalPx;

  const handleClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top - TOP_PAD;
    const clamped = Math.max(0, Math.min(1, y / totalPx));
    onSeek(day0 + clamped * 86400);
  };

  return (
    <div css={tlContainerStyles}>
      {/* Hour labels + ticks column */}
      <div css={scaleStyles} aria-hidden="true">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} css={hourRowStyles(TOP_PAD + h * HOUR_PX)}>
            <span css={hourLabelStyles} className="tnum">{fmtHour(23 - h)}</span>
            <span css={tickStyles} />
          </div>
        ))}
      </div>

      {/* Interactive rail + pinned events */}
      <div
        css={canvasStyles(totalPx + TOP_PAD * 2)}
        onClick={handleClick}
        role="slider"
        aria-label="Timeline — click to seek"
        aria-valuemin={0}
        aria-valuemax={86400}
        aria-valuenow={playTs ? Math.round(playTs - day0) : undefined}
        tabIndex={0}
        onKeyDown={e => {
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
                  Math.max(3, (h.segment_minutes / 60) * (HOUR_PX - 4))
                )}
              />
            ) : null
          )}
        </div>

        {/* Event blobs + connector + thumbnail rows */}
        {positioned.map(ev => (
          <div key={ev.id} css={eventRowStyles(ev.top)}>
            <span css={blobStyles(ev.tone)} />
            <span css={connectorStyles} />
            <span css={iconWrapperStyles(ev.tone)}><ev.icon size={11} strokeWidth={2} /></span>
            {ev.thumbnail_path ? (
              <img
                css={thumbStyles}
                src={eventService.getThumbnailUrl(ev.id)}
                crossOrigin="use-credentials"
                alt=""
                loading="lazy"
                onClick={e => { e.stopPropagation(); onSeek(ev.ts); }}
              />
            ) : (
              <span css={thumbEmptyStyles} onClick={e => { e.stopPropagation(); onSeek(ev.ts); }}>
                {fmtTime(ev.ts)}
              </span>
            )}
            <span css={whenStyles} className="tnum">{fmtTime(ev.ts)}</span>
          </div>
        ))}

        {/* Playhead */}
        {playTs && playTs >= day0 && playTs <= day0 + 86400 && (
          <div css={playheadStyles(tsToY(playTs))}>
            <span css={playheadBadgeStyles} className="tnum">
              {new Date(playTs * 1000).toLocaleTimeString(undefined, { hour12: false })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

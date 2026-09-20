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
import './TimelineRail.css';

const HOUR_PX = 56; // vertical scale: px per hour
const TOP_PAD = 12;

const SEVERITY = {
  unknown_face: { tone: 'alert', icon: CircleAlert },
  loitering: { tone: 'warn', icon: PersonStanding },
  known_face: { tone: 'ok', icon: User },
  person_detected: { tone: 'ok', icon: PersonStanding },
  motion: { tone: 'ok', icon: PersonStanding },
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

export default function TimelineRail({ date, hours, events, playTs, onSeek, token }) {
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
    <div className="tl">
      {/* Hour labels + ticks column */}
      <div className="tl__scale" aria-hidden="true">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="tl__hour" style={{ top: TOP_PAD + h * HOUR_PX }}>
            <span className="tl__hour-label tnum">{fmtHour(23 - h)}</span>
            <span className="tl__tick" />
          </div>
        ))}
      </div>

      {/* Interactive rail + pinned events */}
      <div
        className="tl__canvas"
        style={{ height: totalPx + TOP_PAD * 2 }}
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
        <div className="tl__rail">
          {hours.map((h, i) =>
            h.segment_minutes > 0 ? (
              <div
                key={i}
                className="tl__coverage"
                style={{
                  top: TOP_PAD + i * HOUR_PX + 2,
                  height: Math.max(3, (h.segment_minutes / 60) * (HOUR_PX - 4)),
                }}
              />
            ) : null
          )}
        </div>

        {/* Event blobs + connector + thumbnail rows */}
        {positioned.map(ev => (
          <div key={ev.id} className={`tl__event tl__event--${ev.tone}`} style={{ top: ev.top }}>
            <span className="tl__blob" />
            <span className="tl__connector" />
            <span className="tl__icon"><ev.icon size={11} strokeWidth={2} /></span>
            {ev.thumbnail_path ? (
              <img
                className="tl__thumb"
                src={`http://localhost:8000/events/${ev.id}/thumbnail?token=${encodeURIComponent(token)}`}
                alt=""
                loading="lazy"
                onClick={e => { e.stopPropagation(); onSeek(ev.ts); }}
              />
            ) : (
              <span className="tl__thumb tl__thumb--empty" onClick={e => { e.stopPropagation(); onSeek(ev.ts); }}>
                {fmtTime(ev.ts)}
              </span>
            )}
            <span className="tl__when tnum">{fmtTime(ev.ts)}</span>
          </div>
        ))}

        {/* Playhead */}
        {playTs && playTs >= day0 && playTs <= day0 + 86400 && (
          <div className="tl__playhead" style={{ top: tsToY(playTs) }}>
            <span className="tl__playhead-badge tnum">
              {new Date(playTs * 1000).toLocaleTimeString(undefined, { hour12: false })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

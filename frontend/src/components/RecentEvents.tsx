/**
 * Recent Activity Carousel — Task S2.1
 * 16:9 thumbnail cards with severity color accents, smooth horizontal scroll
 * with touch snap points, and direct deep-linking to /playback?cam={id}&ts={ts}.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, UserCheck, UserX, Clock, AlertTriangle, User } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { eventService } from '@/services/events';
import { tokens } from '@/theme/designTokens';
import type { SecurityEvent } from '@/types';

export interface RecentEventsProps {
  limit?: number;
  showHeader?: boolean;
}

const headerStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: tokens.spacing.sm,
};

const headerTitleStyles = {
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

const seeAllBtnStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  background: 'transparent',
  border: 'none',
  fontSize: tokens.fontSizes.xs,
  fontWeight: tokens.fontWeights.medium,
  color: tokens.colors.accent.primary,
  cursor: 'pointer',
  padding: `${tokens.spacing.xxs} ${tokens.spacing.xs}`,
  borderRadius: tokens.radii.sm,
  transition: `color ${tokens.transitions.fast}`,
  '&:hover': {
    color: tokens.colors.accent.hover,
  },
};

const carouselContainerStyles = {
  display: 'flex',
  gap: tokens.spacing.md,
  overflowX: 'auto' as const,
  scrollSnapType: 'x mandatory' as const,
  scrollBehavior: 'smooth' as const,
  paddingBottom: tokens.spacing.sm,
  scrollbarWidth: 'thin' as const,
  WebkitOverflowScrolling: 'touch' as const,
  '&::-webkit-scrollbar': {
    height: '4px',
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    background: tokens.colors.border.strong,
    borderRadius: '2px',
  },
};

const getSeverityColor = (type: string) => {
  if (type === 'unknown_face') return tokens.colors.status.danger;
  if (type === 'loitering') return tokens.colors.status.warning;
  if (type === 'known_face') return tokens.colors.status.live;
  return tokens.colors.accent.primary;
};

const getEventIcon = (type: string) => {
  if (type === 'unknown_face') return <UserX size={12} />;
  if (type === 'loitering') return <Clock size={12} />;
  if (type === 'known_face') return <UserCheck size={12} />;
  if (type === 'motion') return <AlertTriangle size={12} />;
  return <User size={12} />;
};

const cardStyles = (eventType: string) => ({
  position: 'relative' as const,
  flex: '0 0 190px',
  aspectRatio: '16 / 9',
  scrollSnapAlign: 'start' as const,
  borderRadius: tokens.radii.default,
  overflow: 'hidden',
  background: tokens.colors.bg.surface2,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderBottom: `3px solid ${getSeverityColor(eventType)}`,
  cursor: 'pointer',
  transition: `transform ${tokens.transitions.fast}, box-shadow ${tokens.transitions.fast}, border-color ${tokens.transitions.fast}`,
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: tokens.shadows.card,
    borderColor: tokens.colors.border.strong,
  },
  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
});

const overlayStyles = {
  position: 'absolute' as const,
  inset: 0,
  background:
    'linear-gradient(to top, rgba(9, 9, 11, 0.92) 0%, rgba(9, 9, 11, 0.1) 50%, rgba(9, 9, 11, 0.7) 100%)',
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'space-between',
  padding: '8px 10px',
  pointerEvents: 'none' as const,
};

const topBadgeStyles = (eventType: string) => ({
  alignSelf: 'flex-start',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '11px',
  fontWeight: tokens.fontWeights.medium,
  padding: '2px 6px',
  borderRadius: tokens.radii.sm,
  background: 'rgba(9, 9, 11, 0.8)',
  backdropFilter: 'blur(4px)',
  color: getSeverityColor(eventType),
  border: `1px solid ${getSeverityColor(eventType)}40`,
});

const bottomRowStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '10.5px',
  color: tokens.colors.text.secondary,
};

const camPillStyles = {
  background: 'rgba(0, 0, 0, 0.65)',
  padding: '1px 5px',
  borderRadius: tokens.radii.sm,
  color: tokens.colors.text.primary,
  maxWidth: '90px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
};

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function formatExactTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function RecentEvents({ limit = 12, showHeader = true }: RecentEventsProps) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => {
      eventService
        .getEvents({ limit })
        .then((d) => {
          if (!cancelled) setEvents(d.events || []);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 12000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, limit]);

  if (events.length === 0) return null;

  const handleCardClick = (ev: SecurityEvent) => {
    navigate(
      `/playback?cam=${encodeURIComponent(ev.camera_id)}&ts=${encodeURIComponent(ev.timestamp)}`,
    );
  };

  return (
    <section aria-label="Recent activity stream" css={{ marginBottom: tokens.spacing.lg }}>
      {showHeader && (
        <div css={headerStyles}>
          <div css={headerTitleStyles}>
            <Activity size={14} color={tokens.colors.accent.primary} />
            <span>Recent Activity</span>
            <span css={countBadgeStyles} className="tnum">
              {events.length}
            </span>
          </div>
          <button
            type="button"
            css={seeAllBtnStyles}
            onClick={() => navigate('/detections')}
            aria-label="View all detection events"
          >
            <span>See all</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      <div css={carouselContainerStyles} role="region" aria-label="Events carousel">
        {events.map((ev) => {
          const label =
            ev.person_name ||
            (ev.event_type === 'unknown_face'
              ? 'Unknown Face'
              : ev.event_type === 'loitering'
                ? 'Loitering'
                : ev.event_type.replace('_', ' '));

          return (
            <div
              key={ev.id}
              css={cardStyles(ev.event_type)}
              onClick={() => handleCardClick(ev)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleCardClick(ev);
                }
              }}
              title={`${label} · ${ev.camera_id} · ${formatExactTime(ev.timestamp)}`}
            >
              {ev.thumbnail_path ? (
                <img
                  src={eventService.getThumbnailUrl(ev.id)}
                  crossOrigin="use-credentials"
                  alt={label}
                  loading="lazy"
                />
              ) : (
                <div
                  css={{
                    width: '100%',
                    height: '100%',
                    background: tokens.colors.bg.surface3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: tokens.colors.text.muted,
                  }}
                >
                  <Activity size={24} />
                </div>
              )}

              <div css={overlayStyles}>
                <div css={topBadgeStyles(ev.event_type)}>
                  {getEventIcon(ev.event_type)}
                  <span>{label}</span>
                </div>

                <div css={bottomRowStyles}>
                  <span css={camPillStyles}>{ev.camera_id}</span>
                  <span className="tnum">{formatRelTime(ev.timestamp)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

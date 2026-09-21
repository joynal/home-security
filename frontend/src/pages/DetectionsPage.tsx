/**
 * DetectionsPage — Task S4.1 & S4.3
 * Unified Security Detection Triage Center:
 * - Full-text search (person name, camera id, event type, metadata)
 * - Faceted filter chips with live counts + Camera + Person + Date filters
 * - Dual View switcher: Gallery Grid view vs Compact List view
 * - Event detail side drawer (desktop) / bottom sheet (mobile)
 * - "Play in Timeline" deep action
 * - 1-Click "Name this person" enrollment action for unknown faces
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keyframes } from '@emotion/react';
import {
  Search,
  X,
  LayoutGrid,
  List,
  Play,
  UserPlus,
  Activity,
  Camera as CameraIcon,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { eventService } from '@/services/events';
import { cameraService } from '@/services/cameras';
import { faceService } from '@/services/faces';
import { tokens } from '@/theme/designTokens';
import type { Camera, EventSummary, FacePerson, SecurityEvent, AddFaceResponse } from '@/types';

const drawerSlideIn = keyframes`
  from { transform: translateX(30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const bottomSheetSlideUp = keyframes`
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
`;

const pageHeaderStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: tokens.spacing.md,
  flexWrap: 'wrap' as const,
  padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
  background: tokens.colors.surface.default,
  borderBottom: `1px solid ${tokens.colors.border.subtle}`,
};

const searchBoxStyles = {
  position: 'relative' as const,
  flex: '1 1 240px',
  maxWidth: '360px',
  display: 'flex',
  alignItems: 'center',
};

const searchInputStyles = {
  width: '100%',
  height: '34px',
  background: tokens.colors.surface.subtle,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.sm,
  padding: '0 32px 0 34px',
  color: tokens.colors.text.primary,
  fontSize: tokens.fontSizes.sm,
  fontFamily: 'inherit',
  outline: 'none',
  transition: `border-color ${tokens.transitions.fast}, background ${tokens.transitions.fast}`,
  '&:focus': {
    borderColor: tokens.colors.accent.primary,
    background: tokens.colors.bg.surface2,
  },
};

const filterToolbarStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: tokens.spacing.sm,
  padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
  background: 'rgba(16, 16, 20, 0.65)',
  borderBottom: `1px solid ${tokens.colors.border.subtle}`,
  flexWrap: 'wrap' as const,
};

const chipsContainerStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  overflowX: 'auto' as const,
  paddingBottom: '2px',
  scrollbarWidth: 'none' as const,
  '&::-webkit-scrollbar': { display: 'none' },
};

const chipStyles = (active: boolean) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '28px',
  padding: '0 10px',
  borderRadius: tokens.radii.full,
  border: `1px solid ${active ? tokens.colors.accent.primary : tokens.colors.border.subtle}`,
  background: active ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
  color: active ? tokens.colors.text.primary : tokens.colors.text.secondary,
  fontSize: tokens.fontSizes.xs,
  fontWeight: active ? tokens.fontWeights.semibold : tokens.fontWeights.medium,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  transition: `all ${tokens.transitions.fast}`,
  '&:hover': {
    borderColor: tokens.colors.border.strong,
    color: tokens.colors.text.primary,
  },
});

const selectDropdownStyles = {
  background: tokens.colors.surface.subtle,
  color: tokens.colors.text.primary,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.sm,
  height: '28px',
  padding: '0 8px',
  fontFamily: 'inherit',
  fontSize: tokens.fontSizes.xs,
  cursor: 'pointer',
  outline: 'none',
  '&:focus': {
    borderColor: tokens.colors.accent.primary,
  },
};

const viewToggleBtnStyles = (active: boolean) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: tokens.radii.sm,
  background: active ? tokens.colors.surface.raised : 'transparent',
  border: `1px solid ${active ? tokens.colors.border.strong : 'transparent'}`,
  color: active ? tokens.colors.text.primary : tokens.colors.text.muted,
  cursor: 'pointer',
  transition: `all ${tokens.transitions.fast}`,
  '&:hover': {
    color: tokens.colors.text.primary,
  },
});

const mainLayoutStyles = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
  position: 'relative' as const,
  overflow: 'hidden',
};

const contentScrollStyles = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: tokens.spacing.md,
  scrollbarWidth: 'thin' as const,
};

const gridViewStyles = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: tokens.spacing.md,
};

const cardStyles = (isSelected: boolean, tone: string) => {
  const accentColor =
    tone === 'alert'
      ? tokens.colors.status.danger
      : tone === 'warn'
        ? tokens.colors.status.warning
        : tokens.colors.status.live;
  return {
    position: 'relative' as const,
    background: tokens.colors.bg.surface2,
    border: `1px solid ${isSelected ? tokens.colors.accent.primary : tokens.colors.border.subtle}`,
    borderBottom: `3px solid ${accentColor}`,
    borderRadius: tokens.radii.default,
    overflow: 'hidden',
    cursor: 'pointer',
    transition: `transform ${tokens.transitions.fast}, border-color ${tokens.transitions.fast}, box-shadow ${tokens.transitions.fast}`,
    boxShadow: isSelected ? tokens.shadows.card : 'none',
    '&:hover': {
      transform: 'translateY(-2px)',
      borderColor: tokens.colors.border.strong,
      boxShadow: tokens.shadows.card,
    },
  };
};

const cardThumbContainerStyles = {
  position: 'relative' as const,
  width: '100%',
  aspectRatio: '16 / 9',
  background: '#000',
  overflow: 'hidden',
  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
};

const cardInfoStyles = {
  padding: '10px 12px',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '4px',
};

const listViewStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '2px',
  maxWidth: '900px',
};

const listRowStyles = (isSelected: boolean, tone: string) => {
  const accentColor =
    tone === 'alert'
      ? tokens.colors.status.danger
      : tone === 'warn'
        ? tokens.colors.status.warning
        : tokens.colors.status.live;
  return {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: '8px 12px',
    background: isSelected ? tokens.colors.surface.raised : tokens.colors.surface.subtle,
    border: `1px solid ${isSelected ? tokens.colors.accent.primary : tokens.colors.border.subtle}`,
    borderLeft: `3px solid ${accentColor}`,
    borderRadius: tokens.radii.sm,
    cursor: 'pointer',
    transition: `background ${tokens.transitions.fast}`,
    '&:hover': {
      background: tokens.colors.surface.raised,
    },
  };
};

const drawerStyles = {
  width: '380px',
  borderLeft: `1px solid ${tokens.colors.border.subtle}`,
  background: tokens.colors.surface.default,
  display: 'flex',
  flexDirection: 'column' as const,
  minHeight: 0,
  animation: `${drawerSlideIn} 0.2s cubic-bezier(0.16, 1, 0.3, 1)`,
  overflowY: 'auto' as const,
  padding: tokens.spacing.md,
  gap: tokens.spacing.md,
  '@media (max-width: 768px)': {
    position: 'fixed' as const,
    inset: 'auto 0 0 0',
    width: '100%',
    maxHeight: '80vh',
    borderLeft: 'none',
    borderTop: `1px solid ${tokens.colors.border.strong}`,
    boxShadow: tokens.shadows.modal,
    zIndex: 60,
    animation: `${bottomSheetSlideUp} 0.25s cubic-bezier(0.16, 1, 0.3, 1)`,
    paddingBottom: 'calc(56px + env(safe-area-inset-bottom))',
  },
};

const TYPE_META: Record<string, { label: string; tone: string }> = {
  unknown_face: { label: 'Unknown Face', tone: 'alert' },
  known_face: { label: 'Known Person', tone: 'ok' },
  loitering: { label: 'Loitering', tone: 'warn' },
  person_detected: { label: 'Person Detected', tone: 'ok' },
  motion: { label: 'Motion', tone: 'ok' },
};

function relTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function exactTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function DetectionsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [summary, setSummary] = useState<EventSummary>({});
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [persons, setPersons] = useState<FacePerson[]>([]);

  // Filters from URL
  const queryParam = searchParams.get('q') || '';
  const typeParam = searchParams.get('type') || '';
  const camParam = searchParams.get('cam') || '';
  const personParam = searchParams.get('person') || '';
  const dateRangeParam = searchParams.get('range') || 'all';

  const [searchInput, setSearchInput] = useState<string>(queryParam);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);

  // 1-Click Name person dialog state
  const [enrollName, setEnrollName] = useState('');
  const [enrollSubmitting, setEnrollSubmitting] = useState(false);
  const [enrollResult, setEnrollResult] = useState<AddFaceResponse | null>(null);

  // Sync search input with URL
  useEffect(() => {
    setSearchInput(queryParam);
  }, [queryParam]);

  // Load cameras and registered persons for filter dropdowns
  useEffect(() => {
    if (!token) return;
    cameraService
      .getCameras()
      .then((d) => setCameras(d.cameras || []))
      .catch(() => {});

    faceService
      .getFaces()
      .then((d) => setPersons(d.faces || []))
      .catch(() => {});

    eventService
      .getSummary()
      .then((d) => setSummary(d.summary || {}))
      .catch(() => {});
  }, [token]);

  // Calculate since / until dates from date range preset
  const { sinceDate, untilDate } = useMemo(() => {
    const now = new Date();
    if (dateRangeParam === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { sinceDate: start.toISOString(), untilDate: undefined };
    }
    if (dateRangeParam === 'yesterday') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { sinceDate: start.toISOString(), untilDate: end.toISOString() };
    }
    if (dateRangeParam === '7d') {
      const start = new Date(now.getTime() - 7 * 86400000);
      return { sinceDate: start.toISOString(), untilDate: undefined };
    }
    if (dateRangeParam === '30d') {
      const start = new Date(now.getTime() - 30 * 86400000);
      return { sinceDate: start.toISOString(), untilDate: undefined };
    }
    return { sinceDate: undefined, untilDate: undefined };
  }, [dateRangeParam]);

  // Fetch events matching filters
  const loadEvents = useCallback(() => {
    if (!token) return;
    eventService
      .getEvents({
        q: queryParam || undefined,
        eventType: typeParam || undefined,
        cameraId: camParam || undefined,
        personName: personParam || undefined,
        since: sinceDate,
        until: untilDate,
        limit: 100,
      })
      .then((res) => {
        setEvents(res.events || []);
        setTotalCount(res.total || 0);
      })
      .catch(() => {});
  }, [token, queryParam, typeParam, camParam, personParam, sinceDate, untilDate]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'all') {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    setSearchParams(next);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateParam('q', searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    updateParam('q', '');
  };

  const handleSelectEvent = (ev: SecurityEvent) => {
    setSelectedEvent(ev);
    setEnrollName('');
    setEnrollResult(null);
  };

  const handlePlayInTimeline = (ev: SecurityEvent) => {
    navigate(
      `/playback?cam=${encodeURIComponent(ev.camera_id)}&ts=${encodeURIComponent(ev.timestamp)}`,
    );
  };

  // Task S4.3: 1-Click enroll from sighting
  const handleEnrollFromEvent = async () => {
    if (!selectedEvent || !enrollName.trim()) return;
    setEnrollSubmitting(true);
    try {
      const res = await faceService.addFaceFromEvent(enrollName.trim(), selectedEvent.id);
      setEnrollResult(res);
      loadEvents();
    } catch {
      setEnrollResult({ status: 'error', detail: 'Enrollment failed' });
    } finally {
      setEnrollSubmitting(false);
    }
  };

  const CHIP_FILTERS = [
    { key: '', label: 'All', count: summary.total },
    { key: 'unknown_face', label: 'Unknown Faces', count: summary.unknown_face },
    { key: 'known_face', label: 'Known Persons', count: summary.known_face },
    { key: 'loitering', label: 'Loitering', count: summary.loitering },
    { key: 'person_detected', label: 'Persons', count: summary.person_detected },
  ];

  return (
    <>
      <header css={pageHeaderStyles}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color={tokens.colors.accent.primary} />
          <span className="page-header__title">Detections</span>
          <span className="status-label tnum">
            {totalCount} event{totalCount === 1 ? '' : 's'}
          </span>
        </div>

        {/* Full-text search bar */}
        <form onSubmit={handleSearchSubmit} css={searchBoxStyles} role="search">
          <Search
            size={15}
            color={tokens.colors.text.muted}
            style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}
          />
          <input
            type="text"
            css={searchInputStyles}
            placeholder="Search person, camera, tag…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search detections"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              css={{
                position: 'absolute',
                right: '8px',
                background: 'transparent',
                border: 'none',
                color: tokens.colors.text.muted,
                cursor: 'pointer',
              }}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </form>

        {/* View mode switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            css={viewToggleBtnStyles(viewMode === 'grid')}
            onClick={() => setViewMode('grid')}
            title="Grid view"
            aria-label="Grid view"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            type="button"
            css={viewToggleBtnStyles(viewMode === 'list')}
            onClick={() => setViewMode('list')}
            title="List view"
            aria-label="List view"
          >
            <List size={15} />
          </button>
        </div>
      </header>

      {/* Filter toolbar */}
      <div css={filterToolbarStyles}>
        {/* Type chips */}
        <div css={chipsContainerStyles}>
          {CHIP_FILTERS.map((chip) => {
            const active = typeParam === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                css={chipStyles(active)}
                onClick={() => updateParam('type', chip.key)}
              >
                <span>{chip.label}</span>
                {chip.count !== undefined && (
                  <span className="tnum" style={{ opacity: 0.7 }}>
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Dropdowns: Camera, Person, Date range */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Camera filter */}
          <select
            css={selectDropdownStyles}
            value={camParam}
            onChange={(e) => updateParam('cam', e.target.value)}
            aria-label="Filter by camera"
          >
            <option value="">All Cameras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Person filter */}
          <select
            css={selectDropdownStyles}
            value={personParam}
            onChange={(e) => updateParam('person', e.target.value)}
            aria-label="Filter by person"
          >
            <option value="">All Persons</option>
            {persons.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Date range filter */}
          <select
            css={selectDropdownStyles}
            value={dateRangeParam}
            onChange={(e) => updateParam('range', e.target.value)}
            aria-label="Filter by date range"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
        </div>
      </div>

      <div css={mainLayoutStyles}>
        {/* Main Content Area */}
        <div css={contentScrollStyles}>
          {events.length === 0 ? (
            <div
              css={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '80px 20px',
                color: tokens.colors.text.muted,
                gap: tokens.spacing.sm,
              }}
            >
              <Activity size={32} />
              <p style={{ fontSize: tokens.fontSizes.base }}>
                No detection events match your query.
              </p>
              {(queryParam || typeParam || camParam || personParam || dateRangeParam !== 'all') && (
                <button
                  type="button"
                  css={{
                    background: tokens.colors.surface.raised,
                    border: `1px solid ${tokens.colors.border.subtle}`,
                    borderRadius: tokens.radii.sm,
                    color: tokens.colors.text.primary,
                    padding: '6px 14px',
                    fontSize: tokens.fontSizes.xs,
                    cursor: 'pointer',
                  }}
                  onClick={() => setSearchParams(new URLSearchParams())}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div css={gridViewStyles}>
              {events.map((ev) => {
                const meta = TYPE_META[ev.event_type] || { label: ev.event_type, tone: 'ok' };
                const isSelected = selectedEvent?.id === ev.id;
                const titleLabel = ev.person_name || meta.label;

                return (
                  <div
                    key={ev.id}
                    css={cardStyles(isSelected, meta.tone)}
                    onClick={() => handleSelectEvent(ev)}
                    role="button"
                    tabIndex={0}
                  >
                    <div css={cardThumbContainerStyles}>
                      {ev.thumbnail_path ? (
                        <img
                          src={eventService.getThumbnailUrl(ev.id)}
                          crossOrigin="use-credentials"
                          alt={titleLabel}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          css={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: tokens.colors.text.muted,
                          }}
                        >
                          <CameraIcon size={24} />
                        </div>
                      )}
                    </div>

                    <div css={cardInfoStyles}>
                      <div
                        css={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: tokens.fontSizes.xs,
                        }}
                      >
                        <span
                          css={{
                            fontWeight: tokens.fontWeights.semibold,
                            color: tokens.colors.text.primary,
                          }}
                        >
                          {titleLabel}
                        </span>
                        <span css={{ color: tokens.colors.text.muted }} className="tnum">
                          {relTime(ev.timestamp)}
                        </span>
                      </div>

                      <div
                        css={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          color: tokens.colors.text.muted,
                        }}
                      >
                        <span>{ev.camera_id}</span>
                        <span className="tnum">{exactTime(ev.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div css={listViewStyles}>
              {events.map((ev) => {
                const meta = TYPE_META[ev.event_type] || { label: ev.event_type, tone: 'ok' };
                const isSelected = selectedEvent?.id === ev.id;
                const titleLabel = ev.person_name || meta.label;

                return (
                  <div
                    key={ev.id}
                    css={listRowStyles(isSelected, meta.tone)}
                    onClick={() => handleSelectEvent(ev)}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Tiny thumbnail */}
                    <div
                      css={{
                        width: '48px',
                        aspectRatio: '16 / 9',
                        borderRadius: tokens.radii.sm,
                        overflow: 'hidden',
                        background: '#000',
                        flexShrink: 0,
                      }}
                    >
                      {ev.thumbnail_path ? (
                        <img
                          src={eventService.getThumbnailUrl(ev.id)}
                          crossOrigin="use-credentials"
                          alt=""
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : null}
                    </div>

                    {/* Classification */}
                    <div css={{ flex: 1, minWidth: 0 }}>
                      <div
                        css={{
                          fontSize: tokens.fontSizes.sm,
                          fontWeight: tokens.fontWeights.medium,
                          color: tokens.colors.text.primary,
                        }}
                      >
                        {titleLabel}
                      </div>
                      <div css={{ fontSize: '11px', color: tokens.colors.text.muted }}>
                        Camera: {ev.camera_id}
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div
                      css={{
                        textAlign: 'right' as const,
                        fontSize: tokens.fontSizes.xs,
                        flexShrink: 0,
                      }}
                    >
                      <div css={{ color: tokens.colors.text.primary }} className="tnum">
                        {exactTime(ev.timestamp)}
                      </div>
                      <div css={{ color: tokens.colors.text.muted }} className="tnum">
                        {relTime(ev.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side Drawer / Bottom Sheet */}
        {selectedEvent && (
          <aside css={drawerStyles} aria-label="Detection event details">
            <div css={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div css={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Tag size={15} color={tokens.colors.accent.primary} />
                <span
                  css={{ fontSize: tokens.fontSizes.base, fontWeight: tokens.fontWeights.semibold }}
                >
                  Event #{selectedEvent.id}
                </span>
              </div>
              <button
                type="button"
                css={{
                  background: 'transparent',
                  border: 'none',
                  color: tokens.colors.text.muted,
                  cursor: 'pointer',
                  padding: '4px',
                }}
                onClick={() => setSelectedEvent(null)}
                aria-label="Close details"
              >
                <X size={16} />
              </button>
            </div>

            {/* High-res Image Preview */}
            <div
              css={{
                width: '100%',
                aspectRatio: '16 / 9',
                borderRadius: tokens.radii.default,
                overflow: 'hidden',
                background: '#000',
              }}
            >
              {selectedEvent.thumbnail_path ? (
                <img
                  src={eventService.getThumbnailUrl(selectedEvent.id)}
                  crossOrigin="use-credentials"
                  alt="High-resolution sighting"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : null}
            </div>

            {/* Metadata Table */}
            <div
              css={{
                display: 'flex',
                flexDirection: 'column' as const,
                gap: tokens.spacing.xs,
                fontSize: tokens.fontSizes.xs,
                background: tokens.colors.surface.subtle,
                padding: tokens.spacing.sm,
                borderRadius: tokens.radii.sm,
                border: `1px solid ${tokens.colors.border.subtle}`,
              }}
            >
              <div css={{ display: 'flex', justifyContent: 'space-between' }}>
                <span css={{ color: tokens.colors.text.muted }}>Classification:</span>
                <span
                  css={{ color: tokens.colors.text.primary, fontWeight: tokens.fontWeights.medium }}
                >
                  {selectedEvent.person_name || selectedEvent.event_type}
                </span>
              </div>
              <div css={{ display: 'flex', justifyContent: 'space-between' }}>
                <span css={{ color: tokens.colors.text.muted }}>Camera:</span>
                <span css={{ color: tokens.colors.text.primary }}>{selectedEvent.camera_id}</span>
              </div>
              <div css={{ display: 'flex', justifyContent: 'space-between' }}>
                <span css={{ color: tokens.colors.text.muted }}>Timestamp:</span>
                <span css={{ color: tokens.colors.text.primary }} className="tnum">
                  {new Date(selectedEvent.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div
              css={{ display: 'flex', flexDirection: 'column' as const, gap: tokens.spacing.xs }}
            >
              <button
                type="button"
                css={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  height: '36px',
                  borderRadius: tokens.radii.sm,
                  background: tokens.colors.accent.primary,
                  border: 'none',
                  color: '#fff',
                  fontSize: tokens.fontSizes.sm,
                  fontWeight: tokens.fontWeights.medium,
                  cursor: 'pointer',
                  '&:hover': { background: tokens.colors.accent.hover },
                }}
                onClick={() => handlePlayInTimeline(selectedEvent)}
              >
                <Play size={14} fill="#fff" />
                <span>Play in Timeline</span>
              </button>
            </div>

            {/* Task S4.3: 1-Click "Name this person" */}
            {selectedEvent.event_type === 'unknown_face' && (
              <div
                css={{
                  marginTop: tokens.spacing.sm,
                  padding: tokens.spacing.sm,
                  background: tokens.colors.surface.subtle,
                  borderRadius: tokens.radii.sm,
                  border: `1px solid ${tokens.colors.border.subtle}`,
                  display: 'flex',
                  flexDirection: 'column' as const,
                  gap: tokens.spacing.xs,
                }}
              >
                <div
                  css={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: tokens.fontSizes.xs,
                  }}
                >
                  <UserPlus size={14} color={tokens.colors.status.live} />
                  <span
                    css={{
                      fontWeight: tokens.fontWeights.medium,
                      color: tokens.colors.text.primary,
                    }}
                  >
                    Name this person (Enroll Face)
                  </span>
                </div>

                <div css={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    placeholder="Enter name (e.g. Alice)"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleEnrollFromEvent()}
                    css={{
                      flex: 1,
                      height: '30px',
                      background: tokens.colors.bg.surface2,
                      border: `1px solid ${tokens.colors.border.subtle}`,
                      borderRadius: tokens.radii.sm,
                      color: tokens.colors.text.primary,
                      padding: '0 8px',
                      fontSize: tokens.fontSizes.xs,
                      outline: 'none',
                      '&:focus': { borderColor: tokens.colors.accent.primary },
                    }}
                  />
                  <button
                    type="button"
                    disabled={enrollSubmitting || !enrollName.trim()}
                    onClick={handleEnrollFromEvent}
                    css={{
                      padding: '0 12px',
                      height: '30px',
                      borderRadius: tokens.radii.sm,
                      background: tokens.colors.surface.raised,
                      border: `1px solid ${tokens.colors.border.subtle}`,
                      color: tokens.colors.text.primary,
                      fontSize: tokens.fontSizes.xs,
                      cursor: 'pointer',
                      '&:hover:not(:disabled)': { background: tokens.colors.bg.surface3 },
                      '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
                    }}
                  >
                    {enrollSubmitting ? 'Saving…' : 'Save'}
                  </button>
                </div>

                {enrollResult && (
                  <div
                    css={{
                      fontSize: '11px',
                      color:
                        enrollResult.status === 'enrolled'
                          ? tokens.colors.status.live
                          : tokens.colors.status.danger,
                    }}
                  >
                    {enrollResult.status === 'enrolled'
                      ? `Enrolled as ${enrollName}! Recognition active immediately.`
                      : 'Enrollment could not be completed.'}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </>
  );
}

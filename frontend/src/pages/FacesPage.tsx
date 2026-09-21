/**
 * Faces page — known people (gallery, person detail, import, registration).
 * U6 implementation: person cards with cover/sightings, person detail drawer
 * with sightings timeline and rename, add-photos import, and delete.
 */
import { useState, useEffect, useCallback, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { css, keyframes } from '@emotion/react';
import {
  Camera,
  Check,
  ImagePlus,
  Pencil,
  Play,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import RegisterModal from '@/components/RegisterModal';
import ImportModal from '@/components/ImportModal';
import { faceService } from '@/services/faces';
import { eventService } from '@/services/events';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/designTokens';
import type { FacePerson, SecurityEvent } from '@/types';

const drawerIn = keyframes`
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
`;

const facesStyles = css`
  max-width: 1080px;

  .mf-loading,
  .mf-error,
  .mf-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: ${tokens.colors.text.muted};
    font-size: ${tokens.fontSizes.md};
    text-align: center;
    gap: ${tokens.spacing.lg};
  }
  .mf-empty-icon {
    opacity: 0.5;
    margin-bottom: ${tokens.spacing.sm};
  }
  .mf-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-top-color: ${tokens.colors.accent.primary};
    border-radius: ${tokens.radii.full};
    animation: mf-spin 0.8s linear infinite;
  }
  @keyframes mf-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .mf-error {
    color: ${tokens.colors.status.danger};
    background: rgba(239, 68, 68, 0.08);
    border-radius: ${tokens.radii.default};
  }

  .mf-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: ${tokens.spacing.lg};
  }

  .mf-card {
    background: ${tokens.colors.surface.default};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.lg};
    overflow: hidden;
    transition:
      transform ${tokens.transitions.slow},
      background ${tokens.transitions.slow},
      border-color ${tokens.transitions.slow};
    display: flex;
    flex-direction: column;
    cursor: pointer;
  }
  .mf-card:hover {
    transform: translateY(-2px);
    background: ${tokens.colors.surface.subtle};
    border-color: ${tokens.colors.border.strong};
  }

  .mf-card__gallery {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: #000;
    border-bottom: 1px solid ${tokens.colors.border.subtle};
  }
  .mf-card__img-wrap {
    flex: 1;
    aspect-ratio: 1;
    position: relative;
    overflow: hidden;
    border-radius: ${tokens.radii.sm};
  }
  .mf-card__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s;
  }
  .mf-card:hover .mf-card__img {
    transform: scale(1.05);
  }
  .mf-card__img-fallback {
    background: ${tokens.colors.surface.raised};
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${tokens.colors.text.muted};
  }

  .mf-card__info {
    padding: 14px 16px 12px;
    flex: 1;
  }
  .mf-card__name {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: ${tokens.fontWeights.semibold};
    color: ${tokens.colors.text.primary};
    letter-spacing: -0.2px;
  }
  .mf-card__meta {
    margin: 0;
    font-size: ${tokens.fontSizes.sm};
    color: ${tokens.colors.text.muted};
  }

  .mf-card__actions {
    display: flex;
    border-top: 1px solid ${tokens.colors.border.subtle};
  }
  .mf-btn {
    flex: 1;
    padding: 10px;
    background: transparent;
    border: none;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: ${tokens.fontWeights.medium};
    cursor: pointer;
    transition:
      background ${tokens.transitions.fast},
      color ${tokens.transitions.fast};
  }
  .mf-btn--detail {
    color: ${tokens.colors.text.primary};
    border-right: 1px solid ${tokens.colors.border.subtle};
  }
  .mf-btn--detail:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .mf-btn--update {
    color: ${tokens.colors.accent.hover};
    border-right: 1px solid ${tokens.colors.border.subtle};
  }
  .mf-btn--update:hover {
    background: rgba(59, 130, 246, 0.1);
  }

  .mf-btn--delete {
    color: ${tokens.colors.text.muted};
  }
  .mf-btn--delete:hover {
    color: ${tokens.colors.status.danger};
    background: rgba(239, 68, 68, 0.1);
  }
`;

const drawerStyles = css`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100vw);
  background: ${tokens.colors.surface.default};
  border-left: 1px solid ${tokens.colors.border.subtle};
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
  z-index: 60;
  display: flex;
  flex-direction: column;
  animation: ${drawerIn} ${tokens.transitions.slow} ease-out;

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid ${tokens.colors.border.subtle};
    flex-shrink: 0;
  }
  .drawer-body {
    padding: 18px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: ${tokens.spacing.xl};
    flex: 1;
  }
  .section-title {
    font-size: ${tokens.fontSizes.sm};
    font-weight: ${tokens.fontWeights.semibold};
    color: ${tokens.colors.text.secondary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .rename-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .rename-input {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.sm};
    color: ${tokens.colors.text.primary};
    font-size: 13.5px;
    font-family: inherit;
    outline: none;
    &:focus {
      border-color: ${tokens.colors.accent.primary};
    }
  }
  .ref-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .ref-item {
    aspect-ratio: 1;
    border-radius: ${tokens.radii.sm};
    overflow: hidden;
    background: #000;
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .sightings-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sighting-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.sm};
  }
  .sighting-thumb {
    width: 64px;
    aspect-ratio: 16 / 9;
    border-radius: 4px;
    object-fit: cover;
    background: #000;
    flex-shrink: 0;
  }
  .sighting-info {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sighting-time {
    color: ${tokens.colors.text.primary};
  }
  .sighting-cam {
    color: ${tokens.colors.text.muted};
    font-size: 11.5px;
  }
  .drawer-foot {
    padding: 14px 18px;
    border-top: 1px solid ${tokens.colors.border.subtle};
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
`;

export default function FacesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [faces, setFaces] = useState<FacePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalName, setModalName] = useState<string | null>(null); // null | '' (new) | name (update)
  const [importFor, setImportFor] = useState<string | undefined>(undefined); // undefined=closed | ''=new | name
  const [detailPerson, setDetailPerson] = useState<FacePerson | null>(null);

  // Detail drawer sub-state
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [sightings, setSightings] = useState<SecurityEvent[]>([]);
  const [sightingsLoading, setSightingsLoading] = useState(false);

  const fetchFaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await faceService.getFaces();
      setFaces(data.faces);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaces();
  }, [fetchFaces]);

  // Load sightings when a person detail is opened
  useEffect(() => {
    if (!detailPerson) {
      setSightings([]);
      setEditingName(false);
      return;
    }
    setNameInput(detailPerson.name);
    setSightingsLoading(true);
    eventService
      .getEvents({ personName: detailPerson.name, limit: 10 })
      .then((data) => setSightings(data.events || []))
      .catch(() => setSightings([]))
      .finally(() => setSightingsLoading(false));
  }, [detailPerson]);

  const handleDelete = async (name: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${name}? This will instantly remove them from the AI model.`,
      )
    ) {
      return;
    }
    try {
      await faceService.deleteFace(name);
      setFaces((prev) => prev.filter((f) => f.name !== name));
      if (detailPerson?.name === name) setDetailPerson(null);
      toast.success(`Removed ${name} from AI recognition model`);
    } catch (err) {
      toast.error(`Error deleting ${name}: ${(err as Error).message}`);
    }
  };

  const handleRename = async () => {
    if (!detailPerson || !nameInput.trim() || nameInput.trim() === detailPerson.name) {
      setEditingName(false);
      return;
    }
    const oldName = detailPerson.name;
    const newName = nameInput.trim();
    try {
      await faceService.renameFace(oldName, newName);
      toast.success(`Renamed ${oldName} to ${newName}`);
      setEditingName(false);
      await fetchFaces();
      setDetailPerson((prev) => (prev ? { ...prev, name: newName } : null));
    } catch (err) {
      toast.error(`Rename failed: ${(err as Error).message}`);
    }
  };

  if (modalName !== null) {
    return (
      <RegisterModal
        initialName={modalName || undefined}
        onClose={() => setModalName(null)}
        onSuccess={() => {
          setModalName(null);
          fetchFaces();
          toast.success('Face profile updated successfully');
        }}
      />
    );
  }

  return (
    <>
      <header className="page-header">
        <span className="page-header__title">People</span>
        <span className="page-header__spacer" />
        <span className="status-label tnum">{faces.length} registered</span>
        <button className="btn-ghost" onClick={() => setImportFor('')}>
          <ImagePlus size={14} strokeWidth={1.75} /> Import photos
        </button>
        <button className="btn-primary" onClick={() => setModalName('')}>
          <UserPlus size={14} strokeWidth={1.75} /> Register with camera
        </button>
      </header>

      {importFor !== undefined && (
        <ImportModal
          fixedName={importFor || null}
          onClose={() => setImportFor(undefined)}
          onDone={() => {
            setImportFor(undefined);
            fetchFaces();
            toast.success('Photos imported successfully');
          }}
        />
      )}

      <div className="page-body">
        <div css={facesStyles} className="mf-page">
          {loading && (
            <div className="mf-loading">
              <span className="mf-spinner" /> Loading…
            </div>
          )}
          {error && <div className="mf-error">{error}</div>}

          {!loading && !error && faces.length === 0 && (
            <div className="mf-empty">
              <div className="mf-empty-icon">
                <Users size={32} strokeWidth={1.5} />
              </div>
              <p>No faces registered yet.</p>
            </div>
          )}

          {!loading && faces.length > 0 && (
            <div className="mf-grid">
              {faces.map((face) => (
                <div
                  key={face.name}
                  className="mf-card"
                  onClick={() => setDetailPerson(face)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setDetailPerson(face)}
                  aria-label={`View details for ${face.name}`}
                >
                  <div className="mf-card__gallery">
                    {face.images?.length > 0 ? (
                      face.images.slice(0, 4).map((filename) => (
                        <div
                          key={filename}
                          className="mf-card__img-wrap"
                          title={filename.split('_')[0]}
                        >
                          <img
                            className="mf-card__img"
                            src={faceService.getFaceImageUrl(face.name, filename)}
                            crossOrigin="use-credentials"
                            alt={`${face.name} ${filename}`}
                            onError={(e: SyntheticEvent<HTMLImageElement>) => {
                              const target = e.currentTarget;
                              target.style.display = 'none';
                              target.parentElement?.classList.add('mf-card__img-fallback');
                            }}
                          />
                        </div>
                      ))
                    ) : (
                      <div className="mf-card__img-wrap mf-card__img-fallback">
                        <User size={20} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  <div className="mf-card__info">
                    <h3 className="mf-card__name">{face.name}</h3>
                    <p className="mf-card__meta tnum">
                      {face.image_count ?? face.images?.length ?? 0} reference images
                      {face.sightings !== undefined &&
                        face.sightings > 0 &&
                        ` · ${face.sightings} sightings`}
                    </p>
                  </div>

                  <div className="mf-card__actions" onClick={(e) => e.stopPropagation()}>
                    <button className="mf-btn mf-btn--detail" onClick={() => setDetailPerson(face)}>
                      Details
                    </button>
                    <button
                      className="mf-btn mf-btn--update"
                      onClick={() => setImportFor(face.name)}
                    >
                      Add photos
                    </button>
                    <button
                      className="mf-btn mf-btn--delete"
                      onClick={() => handleDelete(face.name)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Person Detail Drawer (U6.3) ── */}
      {detailPerson && (
        <aside css={drawerStyles} role="dialog" aria-label={`Details for ${detailPerson.name}`}>
          <div className="drawer-head">
            <span className="page-header__title">Person Details</span>
            <button className="btn-ghost" onClick={() => setDetailPerson(null)} aria-label="Close">
              <X size={15} />
            </button>
          </div>

          <div className="drawer-body">
            {/* Person Name & Rename */}
            <div>
              <div className="section-title">
                <span>Identity</span>
                {!editingName && (
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setNameInput(detailPerson.name);
                      setEditingName(true);
                    }}
                    style={{ padding: '2px 6px', height: 'auto', fontSize: '11px' }}
                  >
                    <Pencil size={11} strokeWidth={1.75} /> Rename
                  </button>
                )}
              </div>
              {editingName ? (
                <div className="rename-row">
                  <input
                    className="rename-input"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    autoFocus
                  />
                  <button className="btn-primary" onClick={handleRename}>
                    <Check size={12} strokeWidth={2} /> Save
                  </button>
                  <button className="btn-ghost" onClick={() => setEditingName(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <h2 style={{ margin: 0, fontSize: '18px', color: tokens.colors.text.primary }}>
                  {detailPerson.name}
                </h2>
              )}
            </div>

            {/* Reference Photos Gallery */}
            <div>
              <div className="section-title">
                <span>Reference Photos ({detailPerson.images?.length || 0})</span>
                <button
                  className="btn-ghost"
                  onClick={() => setImportFor(detailPerson.name)}
                  style={{ padding: '2px 6px', height: 'auto', fontSize: '11px' }}
                >
                  <ImagePlus size={11} strokeWidth={1.75} /> Add photos
                </button>
              </div>
              <div className="ref-grid">
                {detailPerson.images && detailPerson.images.length > 0 ? (
                  detailPerson.images.map((img) => (
                    <div key={img} className="ref-item" title={img}>
                      <img
                        src={faceService.getFaceImageUrl(detailPerson.name, img)}
                        crossOrigin="use-credentials"
                        alt={`${detailPerson.name} reference`}
                        loading="lazy"
                      />
                    </div>
                  ))
                ) : (
                  <p style={{ color: tokens.colors.text.muted, fontSize: '12px', margin: 0 }}>
                    No reference images
                  </p>
                )}
              </div>
            </div>

            {/* Sightings Timeline */}
            <div>
              <div className="section-title">
                <span>Recent Sightings ({detailPerson.sightings || 0})</span>
              </div>
              {sightingsLoading && (
                <p style={{ color: tokens.colors.text.muted, fontSize: '12px' }}>
                  Loading sightings…
                </p>
              )}
              {!sightingsLoading && sightings.length === 0 && (
                <p style={{ color: tokens.colors.text.muted, fontSize: '12px' }}>
                  No recent sightings logged yet for this person.
                </p>
              )}
              {!sightingsLoading && sightings.length > 0 && (
                <div className="sightings-list">
                  {sightings.map((s) => (
                    <div key={s.id} className="sighting-row">
                      {s.thumbnail_path && (
                        <img
                          className="sighting-thumb"
                          src={eventService.getThumbnailUrl(s.id)}
                          crossOrigin="use-credentials"
                          alt=""
                        />
                      )}
                      <div className="sighting-info">
                        <span className="sighting-time tnum">
                          {new Date(s.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="sighting-cam">{s.camera_id}</span>
                      </div>
                      {s.playback && (
                        <button
                          className="btn-ghost"
                          title="Play sighting in camera timeline"
                          onClick={() => {
                            const ts = new Date(s.timestamp).getTime() / 1000;
                            navigate(
                              `/camera/${s.camera_id}?date=${s.timestamp.slice(0, 10)}&ts=${ts}`,
                            );
                          }}
                          style={{ padding: '6px', height: 'auto' }}
                        >
                          <Play size={13} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="drawer-foot">
            <button
              className="btn-ghost"
              onClick={() => {
                setDetailPerson(null);
                setModalName(detailPerson.name);
              }}
            >
              <Camera size={13} strokeWidth={1.75} /> Re-scan with camera
            </button>
            <button
              className="btn-ghost"
              style={{ color: tokens.colors.status.danger }}
              onClick={() => handleDelete(detailPerson.name)}
            >
              <Trash2 size={13} strokeWidth={1.75} /> Delete person
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

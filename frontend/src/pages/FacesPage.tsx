/**
 * Faces page — known people (gallery + wizard).
 * U6 rebuilds this into the full person manager (sightings, import, rename);
 * for now: gallery, register wizard, update, delete.
 */
import { useState, useEffect, useCallback, type SyntheticEvent } from 'react';
import { css } from '@emotion/react';
import { ImagePlus, UserPlus, Users } from 'lucide-react';
import RegisterModal from '@/components/RegisterModal';
import ImportModal from '@/components/ImportModal';
import { faceService } from '@/services/faces';
import { useToast } from '@/hooks/useToast';
import { tokens } from '@/theme/designTokens';
import type { FacePerson } from '@/types';

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
    font-size: 48px;
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
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: ${tokens.spacing.lg};
  }

  .mf-card {
    background: ${tokens.colors.surface.default};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.lg};
    overflow: hidden;
    transition:
      transform ${tokens.transitions.slow},
      background ${tokens.transitions.slow};
    display: flex;
    flex-direction: column;
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
  }
  .mf-card__img-fallback::after {
    content: '👤';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    opacity: 0.3;
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

export default function FacesPage() {
  const toast = useToast();
  const [faces, setFaces] = useState<FacePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalName, setModalName] = useState<string | null>(null); // null | '' (new) | name (update)
  const [importFor, setImportFor] = useState<string | undefined>(undefined); // undefined=closed | ''=new | name

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
      toast.success(`Removed ${name} from AI recognition model`);
    } catch (err) {
      toast.error(`Error deleting ${name}: ${(err as Error).message}`);
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
                <Users size={30} strokeWidth={1.5} />
              </div>
              <p>No faces registered yet.</p>
            </div>
          )}

          {!loading && faces.length > 0 && (
            <div className="mf-grid">
              {faces.map((face) => (
                <div key={face.name} className="mf-card">
                  <div className="mf-card__gallery">
                    {face.images?.length > 0 ? (
                      face.images.slice(0, 5).map((filename) => (
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
                      <div className="mf-card__img-wrap mf-card__img-fallback" />
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

                  <div className="mf-card__actions">
                    <button
                      className="mf-btn mf-btn--update"
                      onClick={() => setModalName(face.name)}
                    >
                      Update
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
    </>
  );
}

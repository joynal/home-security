/**
 * Faces page — known people (gallery + wizard).
 * U6 rebuilds this into the full person manager (sightings, import, rename);
 * for now: gallery, register wizard, update, delete.
 */
import { useState, useEffect, useCallback } from 'react';
import { css } from '@emotion/react';
import { useAuth } from '../contexts/useAuth';
import { ImagePlus, UserPlus, Users } from 'lucide-react';
import RegisterModal from '../RegisterModal';
import ImportModal from '../components/ImportModal';

const API = 'http://localhost:8000';

const facesStyles = css`
  max-width: 1080px;

  .mf-loading, .mf-error, .mf-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 0;
    color: #7a879e;
    font-size: 14px;
    text-align: center;
    gap: 16px;
  }
  .mf-empty-icon {
    font-size: 48px;
    opacity: 0.5;
    margin-bottom: 8px;
  }
  .mf-spinner {
    width: 24px; height: 24px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: #3b9eff;
    border-radius: 50%;
    animation: mf-spin 0.8s linear infinite;
  }
  @keyframes mf-spin { to { transform: rotate(360deg); } }

  .mf-error {
    color: #f87171;
    background: rgba(248,113,113,0.05);
    border-radius: 12px;
  }

  .mf-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }

  .mf-card {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    overflow: hidden;
    transition: transform 0.2s, background 0.2s;
    display: flex;
    flex-direction: column;
  }
  .mf-card:hover {
    transform: translateY(-2px);
    background: rgba(255,255,255,0.04);
    border-color: rgba(255,255,255,0.1);
  }

  .mf-card__gallery {
    display: flex;
    gap: 2px;
    padding: 2px;
    background: #000;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .mf-card__img-wrap {
    flex: 1;
    aspect-ratio: 1;
    position: relative;
    overflow: hidden;
    border-radius: 4px;
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
    background: var(--surface-3);
  }
  .mf-card__img-fallback::after {
    content: '👤';
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    opacity: 0.5;
  }

  .mf-card__info {
    padding: 14px 14px 12px;
  }
  .mf-card__name {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: #e8eaf0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mf-card__meta {
    margin: 0;
    font-size: 12px;
    color: #7a879e;
  }

  .mf-card__actions {
    display: flex;
    border-top: 1px solid rgba(255,255,255,0.05);
    margin-top: auto;
  }
  .mf-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0;
    background: transparent;
    border: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .mf-btn--update {
    color: #63b3ff;
    border-right: 1px solid rgba(255,255,255,0.05);
  }
  .mf-btn--update:hover {
    background: rgba(99,179,255,0.1);
  }

  .mf-btn--delete {
    color: #7a879e;
  }
  .mf-btn--delete:hover {
    color: #f87171;
    background: rgba(248,113,113,0.1);
  }
`;

export default function FacesPage() {
  const { authHeaders } = useAuth();
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalName, setModalName] = useState(null); // null | '' (new) | name (update)
  const [importFor, setImportFor] = useState(undefined); // undefined=closed | ''=new | name

  const fetchFaces = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/faces`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Failed to fetch faces');
      const data = await res.json();
      setFaces(data.faces);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { fetchFaces(); }, [fetchFaces]);

  const handleDelete = async (name) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This will instantly remove them from the AI model.`)) {
      return;
    }
    try {
      const res = await fetch(`${API}/faces/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete person');
      setFaces(prev => prev.filter(f => f.name !== name));
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  if (modalName !== null) {
    return (
      <RegisterModal
        initialName={modalName || undefined}
        onClose={() => setModalName(null)}
        onSuccess={() => { setModalName(null); fetchFaces(); }}
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
          onDone={() => { setImportFor(undefined); fetchFaces(); }}
        />
      )}

      <div className="page-body">
        <div css={facesStyles} className="mf-page">
          {loading && <div className="mf-loading"><span className="mf-spinner" /> Loading…</div>}
          {error && <div className="mf-error">{error}</div>}

          {!loading && !error && faces.length === 0 && (
            <div className="mf-empty">
              <div className="mf-empty-icon"><Users size={30} strokeWidth={1.5} /></div>
              <p>No faces registered yet.</p>
            </div>
          )}

          {!loading && faces.length > 0 && (
            <div className="mf-grid">
              {faces.map(face => (
                <div key={face.name} className="mf-card">
                  <div className="mf-card__gallery">
                    {face.images?.length > 0 ? (
                      face.images.slice(0, 5).map(filename => (
                        <div key={filename} className="mf-card__img-wrap" title={filename.split('_')[0]}>
                          <img
                            className="mf-card__img"
                            src={`${API}/faces/${encodeURIComponent(face.name)}/img/${encodeURIComponent(filename)}`}
                            crossOrigin="use-credentials"
                            alt={`${face.name} ${filename}`}
                            onError={e => {
                              e.target.style.display = 'none';
                              e.target.parentElement.classList.add('mf-card__img-fallback');
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
                      {face.image_count} reference images
                      {face.sightings > 0 && ` · ${face.sightings} sightings`}
                    </p>
                  </div>

                  <div className="mf-card__actions">
                    <button className="mf-btn mf-btn--update" onClick={() => setModalName(face.name)}>
                      Update
                    </button>
                    <button className="mf-btn mf-btn--update" onClick={() => setImportFor(face.name)}>
                      Add photos
                    </button>
                    <button className="mf-btn mf-btn--delete" onClick={() => handleDelete(face.name)}>
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

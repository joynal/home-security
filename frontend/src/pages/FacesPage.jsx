/**
 * Faces page — known people (gallery + wizard).
 * U6 rebuilds this into the full person manager (sightings, import, rename);
 * for now: gallery, register wizard, update, delete.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/useAuth';
import { ImagePlus, UserPlus, Users } from 'lucide-react';
import RegisterModal from '../RegisterModal';
import ImportModal from '../components/ImportModal';
import '../ManageFacesPage.css';

const API = 'http://localhost:8000';

export default function FacesPage() {
  const { token, authHeaders } = useAuth();
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
        <div className="mf-page">
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
                            src={`${API}/faces/${encodeURIComponent(face.name)}/img/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`}
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

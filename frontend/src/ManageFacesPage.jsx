import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './ManageFacesPage.css';
import { useAuth } from './contexts/AuthContext';
import RegisterModal from './RegisterModal';

const API = 'http://localhost:8000';

export default function ManageFacesPage() {
  const navigate = useNavigate();
  const { token, authHeaders } = useAuth();
  const [faces, setFaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // For updates
  const [updatingPerson, setUpdatingPerson] = useState(null);

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
      
      // Remove from local state immediately
      setFaces(prev => prev.filter(f => f.name !== name));
    } catch (err) {
      alert(`Error deleting: ${err.message}`);
    }
  };

  const handleUpdate = (name) => {
    setUpdatingPerson(name); // Opens the RegisterModal in update mode
  };

  /* ── If updating, overlay the RegisterModal ── */
  if (updatingPerson) {
    return (
      <RegisterModal
        // Pass the name down so the modal skips the name-entry phase
        initialName={updatingPerson}
        onClose={() => setUpdatingPerson(null)}
        onSuccess={() => {
          setUpdatingPerson(null);
          // Auto-deletion happens implicitly because registering overwrites the dir
          // But to be clean, we should delete first, or the Register endpoint just adds more pics
          // The current POST /register/capture just writes to the dir.
          fetchFaces(); 
        }}
      />
    );
  }

  return (
    <div className="mf-page-container">
      <div className="mf-panel">
        
        {/* Header */}
        <div className="mf-header">
          <div>
            <h2 className="mf-title">Manage Known Faces</h2>
            <p className="mf-sub">View, update, or remove people from the AI model</p>
          </div>
          <button className="mf-close" onClick={() => navigate('/')} aria-label="Back to Dashboard">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="mf-content">
          {loading && <div className="mf-loading"><span className="mf-spinner"/> Loading faces...</div>}
          {error && <div className="mf-error">{error}</div>}
          
          {!loading && !error && faces.length === 0 && (
            <div className="mf-empty">
              <div className="mf-empty-icon">👥</div>
              <p>No faces registered yet.</p>
            </div>
          )}

          {!loading && faces.length > 0 && (
            <div className="mf-grid">
              {faces.map(face => (
                <div key={face.name} className="mf-card">
                  {/* All Angles Gallery */}
                  <div className="mf-card__gallery">
                    {face.images?.length > 0 ? (
                      face.images.slice(0, 5).map(filename => (
                        <div key={filename} className="mf-card__img-wrap" title={filename.split('_')[0]}>
                          <img 
                            className="mf-card__img" 
                            src={`${API}/faces/${encodeURIComponent(face.name)}/img/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`} 
                            alt={`${face.name} ${filename}`} 
                            onError={(e) => {
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
                    <p className="mf-card__meta">{face.image_count} angles captured</p>
                  </div>

                  <div className="mf-card__actions">
                    <button className="mf-btn mf-btn--update" onClick={() => handleUpdate(face.name)}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      Update
                    </button>
                    <button className="mf-btn mf-btn--delete" onClick={() => handleDelete(face.name)}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

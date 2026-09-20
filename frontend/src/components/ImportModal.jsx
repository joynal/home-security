/**
 * ImportModal — enroll a person from photos (drag-and-drop or picker).
 * Posts multipart to /faces/import; shows a per-file verdict list
 * (enrolled / no_face / blurry / too_small / …). EXIF is stripped server-side.
 * Props: fixedName (string | null — when adding photos to an existing person),
 *        onClose(), onDone()
 */
import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, CircleAlert, ImagePlus, Upload, X } from 'lucide-react';
import './ImportModal.css';

const API = 'http://localhost:8000';

const REASON_LABELS = {
  no_face: 'No face found',
  blurry: 'Too blurry',
  too_small: 'Face too small / too far',
  too_dark: 'Too dark',
  too_bright: 'Too bright',
  unreadable: 'Not a readable image',
  timeout: 'Server busy — try again',
};

export default function ImportModal({ fixedName, onClose, onDone }) {
  const { authHeaders } = useAuth();
  const [name, setName] = useState(fixedName || '');
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const addFiles = useCallback((fileList) => {
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...imgs].slice(0, 20));
    setResults(null);
    setError(null);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const submit = async () => {
    if (!name.trim() || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      files.forEach(f => form.append('files', f, f.name));
      const res = await fetch(`${API}/faces/import`, {
        method: 'POST',
        headers: { ...authHeaders() },
        body: form,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Import failed (${res.status})`);
      }
      setResults(await res.json());
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const enrolled = results?.results?.filter(r => r.status === 'enrolled').length ?? 0;
  const done = results !== null;

  return (
    <div className="im-overlay" role="dialog" aria-modal="true" aria-label="Import faces from photos">
      <div className="im-panel">
        <div className="im-head">
          <span className="im-title">
            <ImagePlus size={15} strokeWidth={1.75} />
            {fixedName ? `Add photos — ${fixedName}` : 'Add person from photos'}
          </span>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        <div className="im-body">
          {!fixedName && (
            <label className="im-field">
              <span>Name</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Dad"
                disabled={done}
                aria-label="Person name"
              />
            </label>
          )}

          {!done && (
            <div
              className={`im-dropzone ${dragging ? 'im-dropzone--over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
              aria-label="Drop photos here or click to browse"
            >
              <Upload size={22} strokeWidth={1.5} />
              <p>Drop photos here, or click to browse</p>
              <span className="im-hint">Face photos work best; EXIF/GPS is stripped on import</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={e => addFiles(e.target.files)}
              />
            </div>
          )}

          {files.length > 0 && !done && (
            <div className="im-files">
              {files.map((f, i) => (
                <div key={i} className="im-file">
                  <img src={URL.createObjectURL(f)} alt="" />
                  <button
                    className="im-file__x"
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div className="im-error">{error}</div>}

          {done && results && (
            <div className="im-results">
              <p className="im-results__summary">
                {enrolled} of {results.total} photo{results.total === 1 ? '' : 's'} enrolled
                {enrolled === 0 ? ' — try clearer, closer, better-lit photos.' : '.'}
              </p>
              {results.results.map((r, i) => (
                <div key={i} className={`im-result im-result--${r.status === 'enrolled' ? 'ok' : 'bad'}`}>
                  {r.status === 'enrolled'
                    ? <CheckCircle2 size={13} strokeWidth={1.75} />
                    : <CircleAlert size={13} strokeWidth={1.75} />}
                  <span className="im-result__name">{r.file}</span>
                  <span className="im-result__status">
                    {r.status === 'enrolled'
                      ? (r.note || 'enrolled')
                      : (REASON_LABELS[r.reason] || r.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="im-foot">
          <button className="btn-ghost" onClick={onClose}>{done ? 'Close' : 'Cancel'}</button>
          {!done && (
            <button className="btn-primary" onClick={submit} disabled={busy || !name.trim() || files.length === 0}>
              <Upload size={14} strokeWidth={1.75} />
              {busy ? 'Importing…' : `Import ${files.length || ''} photo${files.length === 1 ? '' : 's'}`}
            </button>
          )}
          {done && enrolled > 0 && (
            <button className="btn-primary" onClick={() => onDone(results)}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * ImportModal — enroll a person from photos (drag-and-drop or picker).
 * Posts multipart to /faces/import; shows a per-file verdict list
 * (enrolled / no_face / blurry / too_small / …). EXIF is stripped server-side.
 * Props: fixedName (string | null — when adding photos to an existing person),
 *        onClose(), onDone()
 */
import { useState, useRef, useCallback } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, Upload, X } from 'lucide-react';
import { faceService } from '../services/faces';

const REASON_LABELS = {
  no_face: 'No face found',
  blurry: 'Too blurry',
  too_small: 'Face too small / too far',
  too_dark: 'Too dark',
  too_bright: 'Too bright',
  unreadable: 'Not a readable image',
  timeout: 'Server busy — try again',
};

const overlayStyles = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 80,
};

const panelStyles = {
  width: 'min(480px, calc(100vw - 32px))',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 'calc(100vh - 64px)',
};

const headStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border)',
};

const titleStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  fontSize: '14px',
  fontWeight: 600,
};

const bodyStyles = {
  padding: '18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  overflowY: 'auto',
};

const fieldStyles = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  '& span': { fontSize: '12px', color: 'var(--text-2)', fontWeight: 500 },
  '& input': {
    height: '34px',
    padding: '0 12px',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-1)',
    fontFamily: 'inherit',
    fontSize: '13.5px',
    '&:focus': { outline: 'none', borderColor: 'var(--accent)' },
  },
};

const dropzoneStyles = (dragging) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  padding: '30px 16px',
  border: `1px dashed ${dragging ? 'var(--accent)' : 'var(--border-strong)'}`,
  borderRadius: 'var(--radius)',
  color: dragging ? 'var(--text-1)' : 'var(--text-3)',
  cursor: 'pointer',
  transition: 'border-color var(--transition), color var(--transition)',
  '&:hover': {
    borderColor: 'var(--accent)',
    color: 'var(--text-1)',
  },
  '& p': { fontSize: '13px', color: 'var(--text-2)' },
});

const hintStyles = {
  fontSize: '11.5px',
  color: 'var(--text-3)',
};

const filesStyles = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
};

const fileItemStyles = {
  position: 'relative',
  width: '72px',
  height: '72px',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  background: 'var(--surface-2)',
  '& img': { width: '100%', height: '100%', objectFit: 'cover' },
};

const removeBtnStyles = {
  position: 'absolute',
  top: '3px',
  right: '3px',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  background: 'rgba(9, 9, 11, 0.8)',
  color: 'var(--text-1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const errorStyles = {
  color: 'var(--alert)',
  fontSize: '12.5px',
  background: 'rgba(239, 68, 68, 0.08)',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 12px',
};

const resultsContainerStyles = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const resultsSummaryStyles = {
  fontSize: '13px',
  color: 'var(--text-1)',
};

const resultItemStyles = (isOk) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  fontSize: '12.5px',
  padding: '7px 10px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--surface-2)',
  color: isOk ? 'var(--live)' : 'var(--alert)',
});

const resultNameStyles = {
  color: 'var(--text-1)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
};

const resultStatusStyles = {
  color: 'var(--text-3)',
};

const footStyles = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  padding: '14px 18px',
  borderTop: '1px solid var(--border)',
};

export default function ImportModal({ fixedName, onClose, onDone }) {
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
      const data = await faceService.importFaces(name.trim(), files);
      setResults(data);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const enrolled = results?.results?.filter(r => r.status === 'enrolled').length ?? 0;
  const done = results !== null;

  return (
    <div css={overlayStyles} role="dialog" aria-modal="true" aria-label="Import faces from photos">
      <div css={panelStyles}>
        <div css={headStyles}>
          <span css={titleStyles}>
            <ImagePlus size={15} strokeWidth={1.75} />
            {fixedName ? `Add photos — ${fixedName}` : 'Add person from photos'}
          </span>
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>

        <div css={bodyStyles}>
          {!fixedName && (
            <label css={fieldStyles}>
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
              css={dropzoneStyles(dragging)}
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
              <span css={hintStyles}>Face photos work best; EXIF/GPS is stripped on import</span>
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
            <div css={filesStyles}>
              {files.map((f, i) => (
                <div key={i} css={fileItemStyles}>
                  <img src={URL.createObjectURL(f)} alt="" />
                  <button
                    css={removeBtnStyles}
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <div css={errorStyles}>{error}</div>}

          {done && results && (
            <div css={resultsContainerStyles}>
              <p css={resultsSummaryStyles}>
                {enrolled} of {results.total} photo{results.total === 1 ? '' : 's'} enrolled
                {enrolled === 0 ? ' — try clearer, closer, better-lit photos.' : '.'}
              </p>
              {results.results.map((r, i) => (
                <div key={i} css={resultItemStyles(r.status === 'enrolled')}>
                  {r.status === 'enrolled'
                    ? <CheckCircle2 size={13} strokeWidth={1.75} />
                    : <CircleAlert size={13} strokeWidth={1.75} />}
                  <span css={resultNameStyles}>{r.file}</span>
                  <span css={resultStatusStyles}>
                    {r.status === 'enrolled'
                      ? (r.note || 'enrolled')
                      : (REASON_LABELS[r.reason] || r.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div css={footStyles}>
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

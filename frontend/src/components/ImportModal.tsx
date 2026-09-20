/**
 * ImportModal — enroll a person from photos (drag-and-drop or picker).
 * Posts multipart to /faces/import; shows a per-file verdict list
 * (enrolled / no_face / blurry / too_small / …). EXIF is stripped server-side.
 */
import { useState, useRef, useCallback, type DragEvent } from 'react';
import { CheckCircle2, CircleAlert, ImagePlus, Upload, X } from 'lucide-react';
import { faceService } from '../services/faces';

export interface ImportModalProps {
  fixedName?: string | null;
  onClose: () => void;
  onDone?: (results: ImportResponseData) => void;
}

export interface ImportResultItem {
  file?: string;
  filename?: string;
  status: string;
  reason?: string;
  note?: string;
}

export interface ImportResponseData {
  total?: number;
  results: ImportResultItem[];
}

const REASON_LABELS: Record<string, string> = {
  no_face: 'No face found',
  blurry: 'Too blurry',
  too_small: 'Face too small / too far',
  too_dark: 'Too dark',
  too_bright: 'Too bright',
  unreadable: 'Not a readable image',
  timeout: 'Server busy — try again',
};

const overlayStyles = {
  position: 'fixed' as const,
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
  flexDirection: 'column' as const,
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
  flexDirection: 'column' as const,
  gap: '14px',
  overflowY: 'auto' as const,
};

const fieldStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
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

const dropzoneStyles = (dragging: boolean) => ({
  display: 'flex',
  flexDirection: 'column' as const,
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
  flexWrap: 'wrap' as const,
  gap: '8px',
};

const fileItemStyles = {
  position: 'relative' as const,
  width: '72px',
  height: '72px',
  borderRadius: 'var(--radius-sm)',
  overflow: 'hidden',
  background: 'var(--surface-2)',
  '& img': { width: '100%', height: '100%', objectFit: 'cover' as const },
};

const removeBtnStyles = {
  position: 'absolute' as const,
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
  flexDirection: 'column' as const,
  gap: '8px',
};

const resultsSummaryStyles = {
  fontSize: '13px',
  color: 'var(--text-1)',
};

const resultItemStyles = (isOk: boolean) => ({
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
  whiteSpace: 'nowrap' as const,
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

export default function ImportModal({ fixedName, onClose, onDone }: ImportModalProps) {
  const [name, setName] = useState(fixedName || '');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResponseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const imgs = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    setFiles(prev => [...prev, ...imgs].slice(0, 20));
    setResults(null);
    setError(null);
  }, []);

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
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
      setResults(data as unknown as ImportResponseData);
    } catch (e) {
      setError(String((e as Error).message || e));
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
                {enrolled} of {results.total ?? results.results.length} photo{(results.total ?? results.results.length) === 1 ? '' : 's'} enrolled
                {enrolled === 0 ? ' — try clearer, closer, better-lit photos.' : '.'}
              </p>
              {results.results.map((r, i) => (
                <div key={i} css={resultItemStyles(r.status === 'enrolled')}>
                  {r.status === 'enrolled'
                    ? <CheckCircle2 size={13} strokeWidth={1.75} />
                    : <CircleAlert size={13} strokeWidth={1.75} />}
                  <span css={resultNameStyles}>{r.file || r.filename}</span>
                  <span css={resultStatusStyles}>
                    {r.status === 'enrolled'
                      ? (r.note || 'enrolled')
                      : ((r.reason && REASON_LABELS[r.reason]) || r.status)}
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
            <button className="btn-primary" onClick={() => onDone?.(results)}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

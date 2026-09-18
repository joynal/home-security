/**
 * Recordings playback page — browse recorded segments by camera and date,
 * play them in the browser, navigate prev/next.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import './RecordingsPage.css';

const API = 'http://localhost:8000';

function localDateStr(d = new Date()) {
  // YYYY-MM-DD in local time for <input type="date">
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function RecordingsPage() {
  const { token, authHeaders } = useAuth();
  const navigate = useNavigate();
  const [cameras, setCameras] = useState([]);
  const [cameraId, setCameraId] = useState('');
  const [date, setDate] = useState(localDateStr());
  const [segments, setSegments] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [storage, setStorage] = useState(null);

  // Load cameras + storage stats once
  useEffect(() => {
    if (!token) return;
    fetch(`${API}/cameras`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        setCameras(data.cameras || []);
        if (data.cameras?.length > 0) setCameraId(c => c || data.cameras[0].id);
      })
      .catch(() => {});
    fetch(`${API}/recordings/storage`, { headers: authHeaders() })
      .then(r => r.json())
      .then(setStorage)
      .catch(() => {});
  }, [token, authHeaders]);

  // Load segments when camera or date changes
  useEffect(() => {
    if (!token || !cameraId) return;
    const compact = date.replaceAll('-', ''); // YYYYMMDD
    fetch(`${API}/recordings/${cameraId}?date=${compact}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        setSegments(data.segments || []);
        setSelectedIdx(data.segments?.length > 0 ? 0 : -1);
      })
      .catch(() => setSegments([]));
  }, [token, cameraId, date, authHeaders]);

  const selected = selectedIdx >= 0 ? segments[selectedIdx] : null;
  const videoUrl = selected
    ? `${API}/recordings/${cameraId}/${selected.filename}?token=${encodeURIComponent(token)}`
    : null;

  const step = useCallback(
    delta => setSelectedIdx(i => Math.min(Math.max(i + delta, 0), segments.length - 1)),
    [segments.length]
  );

  const camStorage = storage?.cameras?.[cameraId];

  return (
    <div className="recordings-page">
      <header className="recordings-page__header">
        <button className="recordings-page__back" onClick={() => navigate('/')}>⟨ Dashboard</button>
        <h1>📹 Recordings</h1>
        {camStorage && (
          <span className="recordings-page__storage">
            {camStorage.segment_count} segments · {camStorage.gb} GB
          </span>
        )}
      </header>

      <div className="recordings-page__controls">
        <label>
          Camera
          <select value={cameraId} onChange={e => setCameraId(e.target.value)}>
            {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>
      </div>

      <div className="recordings-page__body">
        <div className="recordings-page__player">
          {videoUrl ? (
            <>
              <video key={videoUrl} src={videoUrl} controls autoPlay className="recordings-page__video" />
              <div className="recordings-page__nav">
                <button disabled={selectedIdx <= 0} onClick={() => step(1)}>⟨ Newer</button>
                <span>
                  {selectedIdx + 1} / {segments.length} · {selected.filename} · {selected.size_mb} MB
                </span>
                <button disabled={selectedIdx >= segments.length - 1} onClick={() => step(-1)}>Older ⟩</button>
              </div>
            </>
          ) : (
            <div className="recordings-page__placeholder">
              <span>📼</span>
              <p>No segments for this camera and date</p>
            </div>
          )}
        </div>

        <aside className="recordings-page__list">
          <h3>Segments ({segments.length})</h3>
          {segments.map((seg, i) => (
            <button
              key={seg.filename}
              className={`seg-item ${i === selectedIdx ? 'seg-item--active' : ''}`}
              onClick={() => setSelectedIdx(i)}
            >
              <span className="seg-item__name">{seg.filename.replace('.mp4', '')}</span>
              <span className="seg-item__size">{seg.size_mb} MB</span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}

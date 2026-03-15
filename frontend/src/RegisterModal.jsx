import { useState, useEffect, useRef, useCallback } from 'react';
import './RegisterModal.css';
import { useAuth } from './contexts/AuthContext';

const API = 'http://localhost:8000';

const STEPS = [
  { id: 'center', label: 'Center',     instruction: 'Look directly into the camera',   arrowDir: null,    icon: '◎' },
  { id: 'left',   label: 'Turn Left',  instruction: 'Slowly turn your head to the left',  arrowDir: 'left',  icon: '←' },
  { id: 'right',  label: 'Turn Right', instruction: 'Slowly turn your head to the right', arrowDir: 'right', icon: '→' },
  { id: 'up',     label: 'Look Up',    instruction: 'Tilt your head slightly upward',   arrowDir: 'up',    icon: '↑' },
  { id: 'down',   label: 'Look Down',  instruction: 'Tilt your head slightly downward', arrowDir: 'down',  icon: '↓' },
];

/* ── Biometric face illustration for name phase ─────────── */
function FaceScanArt() {
  return (
    <svg className="rm-face-art" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Corner scan brackets */}
      <path d="M24 68 L24 24 L68 24" className="rm-bracket" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M152 24 L196 24 L196 68" className="rm-bracket" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M24 152 L24 196 L68 196" className="rm-bracket" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M152 196 L196 196 L196 152" className="rm-bracket" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Face oval */}
      <ellipse cx="110" cy="108" rx="55" ry="68" className="rm-face-oval"/>
      {/* Eyes */}
      <ellipse cx="90" cy="96" rx="7" ry="5" className="rm-eye"/>
      <ellipse cx="130" cy="96" rx="7" ry="5" className="rm-eye"/>
      {/* Subtle nose */}
      <path d="M110 104 L106 118 Q110 121 114 118 L110 104" className="rm-nose"/>
      {/* Mouth */}
      <path d="M96 132 Q110 142 124 132" className="rm-mouth"/>
      {/* Landmark dots */}
      <circle cx="90"  cy="96"  r="2.5" className="rm-dot"/>
      <circle cx="130" cy="96"  r="2.5" className="rm-dot"/>
      <circle cx="110" cy="114" r="2.5" className="rm-dot"/>
      <circle cx="97"  cy="132" r="2.5" className="rm-dot"/>
      <circle cx="123" cy="132" r="2.5" className="rm-dot"/>
      {/* Scan line */}
      <line x1="55" y1="110" x2="165" y2="110" className="rm-scanline"/>
    </svg>
  );
}

/* ── Animated direction arrows overlay ─────────────────── */
function DirectionArrow({ dir }) {
  if (!dir) return null;
  const arrows = { left: '←', right: '→', up: '↑', down: '↓' };
  return (
    <div className={`rm-dir-arrow rm-dir-arrow--${dir}`}>
      <span>{arrows[dir]}</span>
    </div>
  );
}

export default function RegisterModal({ onClose, onSuccess }) {
  const [phase, setPhase]               = useState('name');
  const [name, setName]                 = useState('');
  const [nameError, setNameError]       = useState('');
  const [stepIdx, setStepIdx]           = useState(0);
  const [faceStatus, setFaceStatus]     = useState({ face_found: false, pose: 'none', offset_y: null });
  const [countdown, setCountdown]       = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [capturing, setCapturing]       = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [flashSuccess, setFlashSuccess] = useState(false);

  const pollingRef   = useRef(null);
  const countdownRef = useRef(null);
  const isCapturing  = useRef(false);
  const stepIdxRef   = useRef(stepIdx);
  const nameRef      = useRef(name);

  useEffect(() => { stepIdxRef.current = stepIdx; }, [stepIdx]);
  useEffect(() => { nameRef.current    = name;    }, [name]);

  const { token, authHeaders } = useAuth();

  const currentStep   = STEPS[stepIdx];
  const isCorrectPose = faceStatus.face_found && faceStatus.pose === currentStep?.id;

  /* ── Stable doCapture ───────────────────────────────── */
  const doCapture = useCallback(async () => {
    if (isCapturing.current) return;
    isCapturing.current = true;
    setCapturing(true);
    setCaptureError('');

    const step        = STEPS[stepIdxRef.current];
    const currentName = nameRef.current.trim();

    try {
      const res = await fetch(
        `${API}/register/capture?name=${encodeURIComponent(currentName)}&step=${step.id}`,
        { method: 'POST', headers: authHeaders() },
      );
      if (res.ok) {
        setFlashSuccess(true);
        setCompletedSteps(prev => [...prev, step.id]);
        setTimeout(() => {
          setFlashSuccess(false);
          const nextIdx = stepIdxRef.current + 1;
          if (nextIdx >= STEPS.length) {
            clearInterval(pollingRef.current);
            setPhase('success');
          } else {
            setStepIdx(nextIdx);
          }
          isCapturing.current = false;
          setCapturing(false);
        }, 700);
      } else {
        const body = await res.text();
        setCaptureError(`Server error ${res.status}: ${body}`);
        isCapturing.current = false;
        setCapturing(false);
      }
    } catch (err) {
      setCaptureError(`Network error: ${err.message}`);
      isCapturing.current = false;
      setCapturing(false);
    }
  }, []);

  /* ── Polling ─────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'capture') return;
    pollingRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/register/face_status`, { headers: authHeaders() });
        const data = await res.json();
        setFaceStatus(data);
      } catch {
        setFaceStatus({ face_found: false, pose: 'none' });
      }
    }, 350);
    return () => clearInterval(pollingRef.current);
  }, [phase]);

  /* ── Auto-capture countdown ─────────────────────────── */
  useEffect(() => {
    if (phase !== 'capture') return;
    if (isCorrectPose && !isCapturing.current) {
      let tick = 2;
      setCountdown(tick);
      countdownRef.current = setInterval(() => {
        tick -= 1;
        if (tick <= 0) {
          clearInterval(countdownRef.current);
          setCountdown(null);
          doCapture();
        } else {
          setCountdown(tick);
        }
      }, 1000);
    } else if (!isCorrectPose) {
      clearInterval(countdownRef.current);
      setCountdown(null);
    }
    return () => clearInterval(countdownRef.current);
  }, [isCorrectPose, phase, doCapture]);

  /* ── Name form ──────────────────────────────────────── */
  const handleStart = () => {
    const t = name.trim();
    if (!t)                            return setNameError('Please enter a name.');
    if (!/^[a-zA-Z0-9_-]+$/.test(t)) return setNameError('Letters, numbers, _ or - only.');
    setNameError('');
    setPhase('capture');
  };

  /* ── Guide message ──────────────────────────────────── */
  const guide = (() => {
    if (capturing)              return { text: 'Captured!',                         ok: true  };
    if (!faceStatus.face_found) return { text: 'No face detected – move into frame', ok: false };
    if (isCorrectPose)          return { text: countdown != null ? `Hold still… ${countdown}` : 'Perfect! Hold still…', ok: true };
    return { text: currentStep?.instruction || '', ok: false };
  })();

  return (
    <div className="rm-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rm-panel">

        {/* ── Persistent close button ── */}
        <button className="rm-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/>
          </svg>
        </button>

        {/* ════════ PHASE: name ════════ */}
        {phase === 'name' && (
          <div className="rm-name-phase">
            <FaceScanArt />

            <div className="rm-name-copy">
              <h2 className="rm-name-title">Register a Person</h2>
              <p className="rm-name-sub">5 quick face scans · no restart required</p>
            </div>

            <div className="rm-step-chips">
              {STEPS.map(s => (
                <div key={s.id} className="rm-chip">
                  <span className="rm-chip__icon">{s.icon}</span>
                  <span className="rm-chip__label">{s.label}</span>
                </div>
              ))}
            </div>

            <div className="rm-field">
              <label className="rm-field__label" htmlFor="reg-name">Person's name</label>
              <input
                id="reg-name"
                className={`rm-field__input ${nameError ? 'rm-field__input--err' : ''}`}
                placeholder="e.g. joynal"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStart()}
                autoFocus
              />
              {nameError && <span className="rm-field__error">{nameError}</span>}
            </div>

            <button className="rm-cta" onClick={handleStart}>
              Begin Scan
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </button>
          </div>
        )}

        {/* ════════ PHASE: capture ════════ */}
        {phase === 'capture' && (
          <div className="rm-capture-phase">
            {/* Step header */}
            <div className="rm-step-header">
              <div className="rm-step-header__label">
                <span className="rm-step-num">{stepIdx + 1}/{STEPS.length}</span>
                <span className="rm-step-name">{currentStep.label}</span>
              </div>
              {/* Step dots */}
              <div className="rm-dots">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`rm-dot-pip ${completedSteps.includes(STEPS[i].id) ? 'rm-dot-pip--done' : i === stepIdx ? 'rm-dot-pip--active' : ''}`}
                  />
                ))}
              </div>
            </div>

            {/* Video */}
            <div className={`rm-video-wrap ${isCorrectPose ? 'rm-video-wrap--ok' : ''} ${flashSuccess ? 'rm-video-wrap--flash' : ''}`}>
              <img src={`${API}/video_feed?token=${encodeURIComponent(token)}`} alt="live" className="rm-video" />

              {/* Face guide oval */}
              <div className={`rm-oval ${isCorrectPose ? 'rm-oval--ok' : ''} ${!faceStatus.face_found ? 'rm-oval--warn' : ''}`}>
                {/* Animated scan line inside oval */}
                <div className="rm-oval__scan" />
              </div>

              {/* Directional arrow */}
              {!isCorrectPose && <DirectionArrow dir={currentStep.arrowDir} />}

              {/* Countdown ring */}
              {countdown !== null && (
                <div className="rm-ring">
                  <svg viewBox="0 0 56 56" className="rm-ring__svg">
                    <circle cx="28" cy="28" r="24" className="rm-ring__track"/>
                    <circle cx="28" cy="28" r="24" className="rm-ring__fill" style={{ animationDuration: '1s' }}/>
                  </svg>
                  <span className="rm-ring__num">{countdown}</span>
                </div>
              )}

              {/* Flash */}
              {flashSuccess && <div className="rm-flash" />}

              {/* Debug badge */}
              <div className="rm-debug">
                {faceStatus.face_found
                  ? `pose: ${faceStatus.pose}  y=${faceStatus.offset_y?.toFixed(2) ?? '–'}`
                  : 'no face'}
              </div>
            </div>

            {/* Guide + error */}
            <p className={`rm-guide ${guide.ok ? 'rm-guide--ok' : 'rm-guide--warn'}`}>{guide.text}</p>
            {captureError && <p className="rm-err">{captureError}</p>}

            {/* Manual button */}
            <button
              className="rm-manual-btn"
              onClick={doCapture}
              disabled={!faceStatus.face_found || capturing}
            >
              {capturing ? 'Capturing…' : 'Capture manually'}
            </button>
          </div>
        )}

        {/* ════════ PHASE: success ════════ */}
        {phase === 'success' && (
          <div className="rm-success-phase">
            <div className="rm-success-circle">
              <svg viewBox="0 0 80 80" fill="none" className="rm-check-svg">
                <circle cx="40" cy="40" r="36" className="rm-check-ring"/>
                <path d="M24 40 L35 51 L56 29" className="rm-check-path" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="rm-success-title">Welcome, {name}!</h2>
            <p className="rm-success-sub">All 5 angles captured. The AI will recognise you immediately.</p>
            <button className="rm-cta" onClick={() => { onSuccess?.(); onClose(); }}>Done</button>
          </div>
        )}

      </div>
    </div>
  );
}

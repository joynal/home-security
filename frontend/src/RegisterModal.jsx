import { useState, useEffect, useRef, useCallback } from 'react';
import { css } from '@emotion/react';
import { registerService } from './services/register';
import { cameraService } from './services/cameras';

const modalStyles = css`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: rm-fade 0.2s ease;

  @keyframes rm-fade { from { opacity: 0; } to { opacity: 1; } }

  .rm-panel {
    position: relative;
    background: #0b0f19;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 24px;
    width: min(540px, 95vw);
    max-height: 92vh;
    overflow-y: auto;
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.7);
    animation: rm-up 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
  }
  @keyframes rm-up {
    from { transform: translateY(28px) scale(0.96); opacity: 0; }
    to   { transform: translateY(0)    scale(1);    opacity: 1; }
  }

  .rm-close {
    position: absolute;
    top: 18px; right: 18px;
    width: 32px; height: 32px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #7a879e;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    z-index: 10;
  }
  .rm-close:hover { background: rgba(248, 113, 113, 0.15); color: #f87171; }

  .rm-name-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 40px 36px 36px;
  }

  .rm-face-art {
    width: 160px;
    height: 160px;
    flex-shrink: 0;
  }

  .rm-bracket {
    stroke: #3b9eff;
    stroke-width: 3;
    fill: none;
    animation: rm-bracket-glow 3s ease-in-out infinite;
  }
  @keyframes rm-bracket-glow {
    0%, 100% { stroke-opacity: 0.6; }
    50%       { stroke-opacity: 1;   }
  }

  .rm-face-oval {
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 1.5;
  }

  .rm-eye {
    stroke: #63b3ff;
    stroke-width: 1.5;
    fill: none;
  }

  .rm-nose {
    stroke: rgba(255, 255, 255, 0.2);
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rm-mouth {
    stroke: #63b3ff;
    stroke-width: 1.5;
    fill: none;
    stroke-linecap: round;
  }

  .rm-dot {
    fill: #3b9eff;
    animation: rm-dot-pulse 2s ease-in-out infinite;
  }
  @keyframes rm-dot-pulse {
    0%, 100% { fill-opacity: 0.5; }
    50%       { fill-opacity: 1;   }
  }

  .rm-scanline {
    stroke: #3b9eff;
    stroke-width: 1;
    stroke-dasharray: 6 3;
    stroke-opacity: 0.7;
    animation: rm-scan 3s ease-in-out infinite;
  }
  @keyframes rm-scan {
    0%   { transform: translateY(-30px); opacity: 0; }
    20%  { opacity: 1; }
    80%  { opacity: 1; }
    100% { transform: translateY(30px);  opacity: 0; }
  }

  .rm-name-copy { text-align: center; }
  .rm-name-title {
    margin: 0 0 6px;
    font-size: 20px;
    font-weight: 700;
    color: #e8eaf0;
    letter-spacing: -0.3px;
  }
  .rm-name-sub {
    margin: 0;
    font-size: 13px;
    color: #7a879e;
  }

  .rm-step-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .rm-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    font-size: 12px;
    color: #7a879e;
  }
  .rm-chip__icon {
    font-size: 14px;
    opacity: 0.8;
    font-style: normal;
  }
  .rm-chip__label { font-weight: 500; }

  .rm-field { width: 100%; display: flex; flex-direction: column; gap: 6px; }
  .rm-field__label {
    font-size: 12px; font-weight: 600;
    letter-spacing: 0.5px; color: #7a879e;
    text-transform: uppercase;
  }
  .rm-field__input {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 15px;
    font-family: inherit;
    color: #e8eaf0;
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
    box-sizing: border-box;
  }
  .rm-field__input:focus    { border-color: rgba(59, 158, 255, 0.45); }
  .rm-field__input--err     { border-color: rgba(248, 113, 113, 0.5); }
  .rm-field__error { font-size: 12px; color: #f87171; }

  .rm-cta {
    display: flex; align-items: center; justify-content: center;
    gap: 8px;
    width: 100%; padding: 15px;
    border-radius: 14px;
    background: linear-gradient(135deg, #2563eb, #6366f1);
    font-size: 15px; font-weight: 600; font-family: inherit;
    color: white; border: none; cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
  }
  .rm-cta:hover { opacity: 0.88; transform: translateY(-1px); }

  .rm-capture-phase {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px 24px 28px;
  }

  .rm-step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .rm-step-header__label { display: flex; align-items: baseline; gap: 8px; }
  .rm-step-num {
    font-size: 11px; font-weight: 700;
    letter-spacing: 1px; color: #3b9eff;
    text-transform: uppercase;
  }
  .rm-step-name { font-size: 14px; font-weight: 600; color: #e8eaf0; }

  .rm-dots { display: flex; gap: 5px; }
  .rm-dot-pip {
    width: 24px; height: 4px; border-radius: 99px;
    background: rgba(255, 255, 255, 0.08);
    transition: background 0.3s;
  }
  .rm-dot-pip--active { background: #3b9eff; }
  .rm-dot-pip--done   { background: #22d3a5; }

  .rm-video-wrap {
    position: relative;
    border-radius: 18px;
    overflow: hidden;
    background: #000;
    aspect-ratio: 4/3;
    border: 2px solid rgba(255, 255, 255, 0.05);
    transition: border-color 0.3s, box-shadow 0.3s;
  }
  .rm-video-wrap--ok    { border-color: rgba(34, 211, 165, 0.4); box-shadow: 0 0 28px rgba(34, 211, 165, 0.15); }
  .rm-video-wrap--flash { border-color: white; }

  .rm-video { width: 100%; height: 100%; object-fit: cover; display: block; }

  .rm-oval {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -52%);
    width: 42%; aspect-ratio: 3/4;
    border-radius: 50%;
    border: none;
    overflow: hidden;
    transition: border-color 0.3s;
  }
  .rm-oval--ok   { border-color: #22d3a5;  }
  .rm-oval--warn { border-color: rgba(248, 113, 113, 0.5); }

  .rm-oval__scan {
    position: absolute;
    left: 0; right: 0;
    height: 2px;
    background: var(--live);
    animation: none;
    opacity: 0.7;
  }
  .rm-oval--ok .rm-oval__scan { background: var(--live); }

  .rm-dir-arrow {
    position: absolute;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px;
    color: rgba(59, 158, 255, 0.9);
    animation: rm-arrow-pulse 1s ease-in-out infinite;
    text-shadow: 0 0 20px rgba(59, 158, 255, 0.7);
    font-style: normal;
    pointer-events: none;
  }
  .rm-dir-arrow--left  { top: 50%; left: 16px;    transform: translateY(-50%); }
  .rm-dir-arrow--right { top: 50%; right: 16px;   transform: translateY(-50%); }
  .rm-dir-arrow--up    { top: 16px;   left: 50%;  transform: translateX(-50%); }
  .rm-dir-arrow--down  { bottom: 16px; left: 50%; transform: translateX(-50%); }
  @keyframes rm-arrow-pulse {
    0%, 100% { opacity: 0.5; transform: translateY(-50%) scale(1);   }
    50%       { opacity: 1;   transform: translateY(-50%) scale(1.2); }
  }
  .rm-dir-arrow--up,    .rm-dir-arrow--down    { animation-name: rm-arrow-pulse-v; }
  .rm-dir-arrow--left,  .rm-dir-arrow--right   { animation-name: rm-arrow-pulse-h; }
  @keyframes rm-arrow-pulse-v {
    0%, 100% { opacity: 0.5; transform: translateX(-50%) scale(1);   }
    50%       { opacity: 1;   transform: translateX(-50%) scale(1.2); }
  }
  @keyframes rm-arrow-pulse-h {
    0%, 100% { opacity: 0.5; transform: translateY(-50%) scale(1);   }
    50%       { opacity: 1;   transform: translateY(-50%) scale(1.2); }
  }

  .rm-ring {
    position: absolute;
    bottom: 16px; right: 16px;
    width: 56px; height: 56px;
    display: flex; align-items: center; justify-content: center;
  }
  .rm-ring__svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  .rm-ring__track { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 4; }
  .rm-ring__fill  {
    fill: none; stroke: #22d3a5; stroke-width: 4;
    stroke-dasharray: 150.8;
    stroke-dashoffset: 0;
    stroke-linecap: round;
    animation: rm-ring-drain 1s linear forwards;
  }
  @keyframes rm-ring-drain {
    from { stroke-dashoffset: 0; }
    to   { stroke-dashoffset: 150.8; }
  }
  .rm-ring__num {
    font-size: 20px; font-weight: 700; color: #22d3a5;
    position: relative; z-index: 1;
    animation: rm-num-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rm-num-pop {
    from { transform: scale(0.5); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  .rm-flash {
    position: absolute; inset: 0;
    background: rgba(255, 255, 255, 0.55);
    animation: rm-flash-out 0.7s ease forwards;
    pointer-events: none;
  }
  @keyframes rm-flash-out { from { opacity: 0.55; } to { opacity: 0; } }

  .rm-debug {
    position: absolute; bottom: 10px; left: 12px;
    font-size: 10px; font-weight: 500; font-family: 'Courier New', monospace;
    color: rgba(255,255,255,0.5);
    background: rgba(0,0,0,0.45);
    padding: 3px 8px; border-radius: 5px;
    pointer-events: none;
  }

  .rm-guide {
    font-size: 14px; font-weight: 500;
    text-align: center;
    padding: 10px 16px;
    border-radius: 10px;
    margin: 0;
  }
  .rm-guide--ok   { color: #22d3a5; background: rgba(34, 211, 165, 0.07); border: 1px solid rgba(34, 211, 165, 0.2); }
  .rm-guide--warn { color: #facc15; background: rgba(234, 179, 8, 0.06);  border: 1px solid rgba(234, 179, 8, 0.18); }

  .rm-err { font-size: 12px; color: #f87171; text-align: center; margin: 0; }

  .rm-manual-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 12px;
    padding: 12px;
    font-size: 13px; font-weight: 500; font-family: inherit;
    color: #7a879e;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .rm-manual-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: #e8eaf0; }
  .rm-manual-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .rm-success-phase {
    display: flex; flex-direction: column; align-items: center;
    gap: 20px; padding: 56px 36px 48px;
    text-align: center;
  }

  .rm-success-circle {
    width: 88px; height: 88px;
    animation: rm-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rm-pop { from { transform: scale(0.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }

  .rm-check-svg { width: 100%; height: 100%; }

  .rm-check-ring {
    stroke: #22d3a5;
    stroke-width: 3;
    fill: rgba(34, 211, 165, 0.08);
    stroke-dasharray: 226;
    stroke-dashoffset: 226;
    animation: rm-ring-draw 0.5s 0.2s ease forwards;
  }
  @keyframes rm-ring-draw { to { stroke-dashoffset: 0; } }

  .rm-check-path {
    stroke: #22d3a5; stroke-width: 4;
    fill: none;
    stroke-dasharray: 50; stroke-dashoffset: 50;
    animation: rm-check-draw 0.4s 0.6s ease forwards;
  }
  @keyframes rm-check-draw { to { stroke-dashoffset: 0; } }

  .rm-success-title { margin: 0; font-size: 22px; font-weight: 700; color: #e8eaf0; letter-spacing: -0.3px; }
  .rm-success-sub   { margin: 0; font-size: 13px; color: #7a879e; max-width: 340px; line-height: 1.65; }
`;

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
      await registerService.captureStep(currentName, step.id);
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
    } catch (err) {
      setCaptureError(err.message || String(err));
      isCapturing.current = false;
      setCapturing(false);
    }
  }, []);

  /* ── Polling ─────────────────────────────────────────── */
  useEffect(() => {
    if (phase !== 'capture') return;
    pollingRef.current = setInterval(async () => {
      try {
        const data = await registerService.getFaceStatus();
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
      // deferred out of the effect body (react-hooks/set-state-in-effect)
      setTimeout(() => setCountdown(null), 0);
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
    <div css={modalStyles} className="rm-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
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
              <img src={cameraService.getVideoFeedUrl()} crossOrigin="use-credentials" alt="live" className="rm-video" />

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

import { useState, useEffect, useRef, useCallback } from 'react';
import { css } from '@emotion/react';
import { registerService } from './services/register';
import { cameraService } from './services/cameras';
import type { FaceStatus } from './types';

export interface RegisterModalProps {
  initialName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

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
    width: 100%;
    max-width: 440px;
    background: #111318;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 24px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.04);
    overflow: hidden;
    animation: rm-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes rm-slide-up {
    from { transform: translateY(16px) scale(0.98); opacity: 0; }
    to   { transform: translateY(0) scale(1); opacity: 1; }
  }

  .rm-close {
    position: absolute;
    top: 18px; right: 18px;
    width: 32px; height: 32px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: #7a879e;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 10;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .rm-close:hover { background: rgba(255, 255, 255, 0.1); color: #e8eaf0; border-color: rgba(255, 255, 255, 0.16); }

  .rm-name-phase {
    display: flex; flex-direction: column; align-items: center;
    gap: 22px; padding: 40px 32px 36px;
    text-align: center;
  }

  .rm-face-art {
    width: 100px; height: 100px;
    margin-top: 4px;
  }
  .rm-bracket { stroke: #3b9eff; stroke-width: 2.5; opacity: 0.85; }
  .rm-face-oval { stroke: rgba(59, 158, 255, 0.3); stroke-width: 1.5; stroke-dasharray: 4 3; }
  .rm-eye, .rm-nose, .rm-mouth { stroke: rgba(59, 158, 255, 0.45); stroke-width: 1.5; }
  .rm-dot { fill: #3b9eff; opacity: 0.7; }
  .rm-scanline {
    stroke: #3b9eff; stroke-width: 1.5; opacity: 0.8;
    animation: rm-scan 2.4s ease-in-out infinite alternate;
  }
  @keyframes rm-scan {
    from { transform: translateY(-30px); opacity: 0.2; }
    to   { transform: translateY(30px);  opacity: 0.9; }
  }

  .rm-name-copy { display: flex; flex-direction: column; gap: 6px; }
  .rm-name-title { margin: 0; font-size: 20px; font-weight: 700; color: #e8eaf0; letter-spacing: -0.3px; }
  .rm-name-sub   { margin: 0; font-size: 13px; color: #7a879e; }

  .rm-step-chips {
    display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
  }
  .rm-chip {
    display: flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 99px;
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
  .rm-oval--warn { border-color: rgba(248, 113, 113, 0.4); }

  .rm-oval__scan {
    position: absolute; inset: 0;
    background: linear-gradient(180deg,
      transparent 0%,
      rgba(59, 158, 255, 0.04) 40%,
      rgba(59, 158, 255, 0.12) 50%,
      transparent 60%
    );
    animation: rm-scan-sweep 2s ease-in-out infinite alternate;
  }
  @keyframes rm-scan-sweep {
    from { transform: translateY(-40%); }
    to   { transform: translateY(40%); }
  }

  .rm-dir-arrow {
    position: absolute;
    pointer-events: none;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; font-weight: 700;
    color: #3b9eff;
    filter: drop-shadow(0 0 8px rgba(59, 158, 255, 0.8));
    animation: rm-arrow-pulse 0.9s ease-in-out infinite alternate;
  }
  .rm-dir-arrow--left  { left: 16px; top: 50%; transform: translateY(-50%); }
  .rm-dir-arrow--right { right: 16px; top: 50%; transform: translateY(-50%); }
  .rm-dir-arrow--up    { top: 14px; left: 50%; transform: translateX(-50%); }
  .rm-dir-arrow--down  { bottom: 14px; left: 50%; transform: translateX(-50%); }

  @keyframes rm-arrow-pulse {
    from { opacity: 0.4; }
    to   { opacity: 1; }
  }

  .rm-countdown-ring {
    position: absolute;
    inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    pointer-events: none;
  }
  .rm-countdown-num {
    font-size: 48px; font-weight: 800; color: #22d3a5;
    line-height: 1;
    animation: rm-count-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rm-count-pop {
    from { transform: scale(0.5); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }
  .rm-countdown-sub { font-size: 11px; font-weight: 600; color: #22d3a5; letter-spacing: 0.5px; text-transform: uppercase; }

  .rm-flash-overlay {
    position: absolute; inset: 0;
    background: white;
    pointer-events: none;
    animation: rm-flash-anim 0.7s ease-out forwards;
  }
  @keyframes rm-flash-anim {
    0%   { opacity: 0.85; }
    100% { opacity: 0; }
  }

  .rm-guide {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: background 0.3s, border-color 0.3s;
  }
  .rm-guide--ok {
    background: rgba(34, 211, 165, 0.07);
    border-color: rgba(34, 211, 165, 0.25);
  }
  .rm-guide-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: #7a879e; flex-shrink: 0;
    transition: background 0.3s;
  }
  .rm-guide--ok .rm-guide-dot {
    background: #22d3a5;
    box-shadow: 0 0 6px #22d3a5;
  }
  .rm-guide-text {
    font-size: 13px; font-weight: 500; color: #e8eaf0;
    flex: 1;
  }

  .rm-err-msg {
    font-size: 12px; color: #f87171; text-align: center;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    border-radius: 8px; padding: 6px 12px;
  }

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

interface StepItem {
  id: string;
  label: string;
  instruction: string;
  arrowDir: 'left' | 'right' | 'up' | 'down' | null;
  icon: string;
}

const STEPS: StepItem[] = [
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
function DirectionArrow({ dir }: { dir: 'left' | 'right' | 'up' | 'down' | null }) {
  if (!dir) return null;
  const arrows = { left: '←', right: '→', up: '↑', down: '↓' };
  return (
    <div className={`rm-dir-arrow rm-dir-arrow--${dir}`}>
      <span>{arrows[dir]}</span>
    </div>
  );
}

export default function RegisterModal({ initialName, onClose, onSuccess }: RegisterModalProps) {
  const [phase, setPhase]               = useState<'name' | 'capture' | 'success'>(initialName ? 'capture' : 'name');
  const [name, setName]                 = useState(initialName || '');
  const [nameError, setNameError]       = useState('');
  const [stepIdx, setStepIdx]           = useState(0);
  const [faceStatus, setFaceStatus]     = useState<FaceStatus>({ face_found: false, pose: 'none' });
  const [countdown, setCountdown]       = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [capturing, setCapturing]       = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [captureError, setCaptureError] = useState('');

  const pollingRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
          if (pollingRef.current) clearInterval(pollingRef.current);
          setPhase('success');
        } else {
          setStepIdx(nextIdx);
        }
        isCapturing.current = false;
        setCapturing(false);
      }, 700);
    } catch (err) {
      setCaptureError((err as Error).message || String(err));
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
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [phase]);

  /* ── Auto-capture countdown ─────────────────────────── */
  useEffect(() => {
    if (phase !== 'capture') return;
    if (isCorrectPose && !isCapturing.current) {
      let tick = 2;
      countdownRef.current = setInterval(() => {
        tick -= 1;
        if (tick <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          setCountdown(null);
          doCapture();
        } else {
          setCountdown(tick);
        }
      }, 1000);
    } else if (!isCorrectPose) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      // deferred out of the effect body
      setTimeout(() => setCountdown(null), 0);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
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

              {/* Pip progress */}
              <div className="rm-dots">
                {STEPS.map((s, idx) => (
                  <div
                    key={s.id}
                    className={`rm-dot-pip ${
                      completedSteps.includes(s.id) ? 'rm-dot-pip--done' :
                      idx === stepIdx               ? 'rm-dot-pip--active' : ''
                    }`}
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
              {countdown != null && (
                <div className="rm-countdown-ring">
                  <div className="rm-countdown-num">{countdown}</div>
                  <div className="rm-countdown-sub">Hold Still</div>
                </div>
              )}

              {/* Flash on success */}
              {flashSuccess && <div className="rm-flash-overlay" />}
            </div>

            {/* Smart guide banner */}
            <div className={`rm-guide ${guide.ok ? 'rm-guide--ok' : ''}`}>
              <div className="rm-guide-dot" />
              <div className="rm-guide-text">{guide.text}</div>
            </div>

            {/* Capture error */}
            {captureError && <div className="rm-err-msg">{captureError}</div>}

            {/* Manual capture fallback */}
            <button
              className="rm-manual-btn"
              onClick={doCapture}
              disabled={!faceStatus.face_found || capturing}
            >
              Take photo manually
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

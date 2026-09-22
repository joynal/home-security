import { useState, useEffect, useRef, useCallback, type ComponentType } from 'react';
import { css } from '@emotion/react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  CheckCircle2,
  Crosshair,
  X,
} from 'lucide-react';
import { registerService } from '@/services/register';
import { cameraService } from '@/services/cameras';
import { tokens } from '@/theme/designTokens';
import type { FaceStatus } from '@/types';

export interface RegisterModalProps {
  initialName?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

const modalStyles = css`
  position: fixed;
  inset: 0;
  background: ${tokens.colors.bg.modalOverlay};
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: rm-fade 0.2s ease;

  @keyframes rm-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .rm-panel {
    position: relative;
    width: 100%;
    max-width: 440px;
    background: ${tokens.colors.surface.default};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.xl};
    box-shadow: ${tokens.shadows.modal};
    overflow: hidden;
    animation: rm-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes rm-slide-up {
    from {
      transform: translateY(16px) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  .rm-close {
    position: absolute;
    top: 18px;
    right: 18px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid ${tokens.colors.border.subtle};
    background: ${tokens.colors.surface.subtle};
    color: ${tokens.colors.text.muted};
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    transition:
      background ${tokens.transitions.fast},
      color ${tokens.transitions.fast},
      border-color ${tokens.transitions.fast};
  }
  .rm-close:hover {
    background: ${tokens.colors.surface.raised};
    color: ${tokens.colors.text.primary};
    border-color: ${tokens.colors.border.strong};
  }

  .rm-name-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22px;
    padding: 40px 32px 36px;
    text-align: center;
  }

  .rm-face-art {
    width: 90px;
    height: 90px;
    margin-top: 4px;
    color: ${tokens.colors.accent.primary};
  }
  .rm-bracket {
    stroke: ${tokens.colors.accent.primary};
    stroke-width: 2.5;
    opacity: 0.85;
  }
  .rm-face-oval {
    stroke: ${tokens.colors.accent.primary};
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
    opacity: 0.4;
  }
  .rm-eye,
  .rm-nose,
  .rm-mouth {
    stroke: ${tokens.colors.accent.primary};
    stroke-width: 1.5;
    opacity: 0.5;
  }
  .rm-dot {
    fill: ${tokens.colors.accent.primary};
    opacity: 0.8;
  }
  .rm-scanline {
    stroke: ${tokens.colors.accent.primary};
    stroke-width: 1.5;
    opacity: 0.8;
    animation: rm-scan 2.4s ease-in-out infinite alternate;
  }
  @keyframes rm-scan {
    from {
      transform: translateY(-24px);
      opacity: 0.3;
    }
    to {
      transform: translateY(24px);
      opacity: 0.9;
    }
  }

  .rm-name-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rm-name-title {
    margin: 0;
    font-size: 20px;
    font-weight: ${tokens.fontWeights.bold};
    color: ${tokens.colors.text.primary};
    letter-spacing: -0.3px;
  }
  .rm-name-sub {
    margin: 0;
    font-size: 13px;
    color: ${tokens.colors.text.muted};
  }

  .rm-step-chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .rm-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: ${tokens.radii.full};
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    font-size: 12px;
    color: ${tokens.colors.text.secondary};
  }
  .rm-chip__icon {
    display: flex;
    align-items: center;
    color: ${tokens.colors.accent.primary};
  }
  .rm-chip__label {
    font-weight: ${tokens.fontWeights.medium};
  }

  .rm-field {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
  }
  .rm-field__label {
    font-size: 12px;
    font-weight: ${tokens.fontWeights.semibold};
    letter-spacing: 0.5px;
    color: ${tokens.colors.text.muted};
    text-transform: uppercase;
  }
  .rm-field__input {
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.md};
    padding: 12px 16px;
    font-size: 14.5px;
    font-family: inherit;
    color: ${tokens.colors.text.primary};
    outline: none;
    transition: border-color ${tokens.transitions.fast};
    width: 100%;
    box-sizing: border-box;
  }
  .rm-field__input:focus {
    border-color: ${tokens.colors.accent.primary};
  }
  .rm-field__input--err {
    border-color: ${tokens.colors.status.danger};
  }
  .rm-field__error {
    font-size: 12px;
    color: ${tokens.colors.status.danger};
  }

  .rm-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 13px;
    border-radius: ${tokens.radii.md};
    background: ${tokens.colors.accent.primary};
    font-size: 14.5px;
    font-weight: ${tokens.fontWeights.semibold};
    font-family: inherit;
    color: white;
    border: none;
    cursor: pointer;
    transition:
      background ${tokens.transitions.fast},
      transform 0.1s;
  }
  .rm-cta:hover {
    background: ${tokens.colors.accent.hover};
    transform: translateY(-1px);
  }

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
  .rm-step-header__label {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .rm-step-num {
    font-size: 11px;
    font-weight: ${tokens.fontWeights.bold};
    letter-spacing: 1px;
    color: ${tokens.colors.accent.primary};
    text-transform: uppercase;
  }
  .rm-step-name {
    font-size: 14px;
    font-weight: ${tokens.fontWeights.semibold};
    color: ${tokens.colors.text.primary};
  }

  .rm-dots {
    display: flex;
    gap: 5px;
  }
  .rm-dot-pip {
    width: 24px;
    height: 4px;
    border-radius: ${tokens.radii.full};
    background: ${tokens.colors.surface.raised};
    transition: background 0.3s;
  }
  .rm-dot-pip--active {
    background: ${tokens.colors.accent.primary};
  }
  .rm-dot-pip--done {
    background: ${tokens.colors.status.live};
  }

  .rm-video-wrap {
    position: relative;
    border-radius: ${tokens.radii.lg};
    overflow: hidden;
    background: #000;
    aspect-ratio: 4 / 3;
    border: 2px solid ${tokens.colors.border.subtle};
    transition:
      border-color 0.3s,
      box-shadow 0.3s;
  }
  .rm-video-wrap--ok {
    border-color: ${tokens.colors.status.live};
  }
  .rm-video-wrap--flash {
    border-color: #fff;
  }

  .rm-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .rm-oval {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -52%);
    width: 44%;
    aspect-ratio: 3 / 4;
    border-radius: 50%;
    border: 2px dashed rgba(255, 255, 255, 0.25);
    overflow: hidden;
    transition: border-color 0.3s;
    pointer-events: none;
  }
  .rm-oval--ok {
    border-color: ${tokens.colors.status.live};
    border-style: solid;
  }
  .rm-oval--warn {
    border-color: ${tokens.colors.status.danger};
  }

  .rm-oval__scan {
    position: absolute;
    inset: 0;
    border-bottom: 2px solid ${tokens.colors.accent.primary};
    background: rgba(59, 130, 246, 0.08);
    animation: rm-scan-sweep 2s ease-in-out infinite alternate;
  }
  @keyframes rm-scan-sweep {
    from {
      transform: translateY(-40%);
    }
    to {
      transform: translateY(40%);
    }
  }

  .rm-dir-arrow {
    position: absolute;
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${tokens.colors.accent.primary};
    animation: rm-arrow-pulse 0.9s ease-in-out infinite alternate;
  }
  .rm-dir-arrow--left {
    left: 16px;
    top: 50%;
    transform: translateY(-50%);
  }
  .rm-dir-arrow--right {
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
  }
  .rm-dir-arrow--up {
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
  }
  .rm-dir-arrow--down {
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
  }

  @keyframes rm-arrow-pulse {
    from {
      opacity: 0.4;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1.08);
    }
  }

  .rm-countdown-ring {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
    pointer-events: none;
  }
  .rm-countdown-num {
    font-size: 48px;
    font-weight: ${tokens.fontWeights.bold};
    color: ${tokens.colors.status.live};
    line-height: 1;
    animation: rm-count-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rm-count-pop {
    from {
      transform: scale(0.5);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  .rm-countdown-sub {
    font-size: 11px;
    font-weight: ${tokens.fontWeights.semibold};
    color: ${tokens.colors.status.live};
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .rm-flash-overlay {
    position: absolute;
    inset: 0;
    background: white;
    pointer-events: none;
    animation: rm-flash-anim 0.7s ease-out forwards;
  }
  @keyframes rm-flash-anim {
    0% {
      opacity: 0.85;
    }
    100% {
      opacity: 0;
    }
  }

  .rm-guide {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: ${tokens.radii.md};
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    transition:
      background 0.3s,
      border-color 0.3s;
  }
  .rm-guide--ok {
    background: rgba(34, 197, 94, 0.08);
    border-color: rgba(34, 197, 94, 0.3);
  }
  .rm-guide-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${tokens.colors.text.muted};
    flex-shrink: 0;
    transition: background 0.3s;
  }
  .rm-guide--ok .rm-guide-dot {
    background: ${tokens.colors.status.live};
  }
  .rm-guide-text {
    font-size: 13px;
    font-weight: ${tokens.fontWeights.medium};
    color: ${tokens.colors.text.primary};
    flex: 1;
  }

  .rm-err-msg {
    font-size: 12px;
    color: ${tokens.colors.status.danger};
    text-align: center;
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: ${tokens.radii.sm};
    padding: 6px 12px;
  }

  .rm-manual-btn {
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.md};
    padding: 11px;
    font-size: 13px;
    font-weight: ${tokens.fontWeights.medium};
    font-family: inherit;
    color: ${tokens.colors.text.secondary};
    cursor: pointer;
    transition:
      background ${tokens.transitions.fast},
      color ${tokens.transitions.fast};
  }
  .rm-manual-btn:hover:not(:disabled) {
    background: ${tokens.colors.surface.raised};
    color: ${tokens.colors.text.primary};
  }
  .rm-manual-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .rm-success-phase {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    padding: 56px 36px 48px;
    text-align: center;
  }

  .rm-success-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    color: ${tokens.colors.status.live};
    animation: rm-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  @keyframes rm-pop {
    from {
      transform: scale(0.3);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .rm-success-title {
    margin: 0;
    font-size: 22px;
    font-weight: ${tokens.fontWeights.bold};
    color: ${tokens.colors.text.primary};
    letter-spacing: -0.3px;
  }
  .rm-success-sub {
    margin: 0;
    font-size: 13px;
    color: ${tokens.colors.text.muted};
    max-width: 340px;
    line-height: 1.65;
  }
`;

interface StepItem {
  id: string;
  label: string;
  instruction: string;
  arrowDir: 'left' | 'right' | 'up' | 'down' | null;
  Icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
}

const STEPS: StepItem[] = [
  {
    id: 'center',
    label: 'Center',
    instruction: 'Look directly into the camera',
    arrowDir: null,
    Icon: Crosshair,
  },
  {
    id: 'left',
    label: 'Turn Left',
    instruction: 'Slowly turn your head to the left',
    arrowDir: 'left',
    Icon: ArrowLeft,
  },
  {
    id: 'right',
    label: 'Turn Right',
    instruction: 'Slowly turn your head to the right',
    arrowDir: 'right',
    Icon: ArrowRight,
  },
  {
    id: 'up',
    label: 'Look Up',
    instruction: 'Tilt your head slightly upward',
    arrowDir: 'up',
    Icon: ArrowUp,
  },
  {
    id: 'down',
    label: 'Look Down',
    instruction: 'Tilt your head slightly downward',
    arrowDir: 'down',
    Icon: ArrowDown,
  },
];

/* ── Biometric face illustration for name phase ─────────── */
function FaceScanArt() {
  return (
    <svg
      className="rm-face-art"
      viewBox="0 0 220 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M24 68 L24 24 L68 24"
        className="rm-bracket"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M152 24 L196 24 L196 68"
        className="rm-bracket"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 152 L24 196 L68 196"
        className="rm-bracket"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M152 196 L196 196 L196 152"
        className="rm-bracket"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse cx="110" cy="108" rx="55" ry="68" className="rm-face-oval" />
      <ellipse cx="90" cy="96" rx="7" ry="5" className="rm-eye" />
      <ellipse cx="130" cy="96" rx="7" ry="5" className="rm-eye" />
      <path d="M110 104 L106 118 Q110 121 114 118 L110 104" className="rm-nose" />
      <path d="M96 132 Q110 142 124 132" className="rm-mouth" />
      <circle cx="90" cy="96" r="2.5" className="rm-dot" />
      <circle cx="130" cy="96" r="2.5" className="rm-dot" />
      <circle cx="110" cy="114" r="2.5" className="rm-dot" />
      <circle cx="97" cy="132" r="2.5" className="rm-dot" />
      <circle cx="123" cy="132" r="2.5" className="rm-dot" />
      <line x1="55" y1="110" x2="165" y2="110" className="rm-scanline" />
    </svg>
  );
}

/* ── Direction arrows overlay ─────────────────────────── */
function DirectionArrow({ dir }: { dir: 'left' | 'right' | 'up' | 'down' | null }) {
  if (!dir) return null;
  const renderIcon = () => {
    switch (dir) {
      case 'left':
        return <ArrowLeft size={36} strokeWidth={2.5} />;
      case 'right':
        return <ArrowRight size={36} strokeWidth={2.5} />;
      case 'up':
        return <ArrowUp size={36} strokeWidth={2.5} />;
      case 'down':
        return <ArrowDown size={36} strokeWidth={2.5} />;
    }
  };
  return <div className={`rm-dir-arrow rm-dir-arrow--${dir}`}>{renderIcon()}</div>;
}

export default function RegisterModal({ initialName, onClose, onSuccess }: RegisterModalProps) {
  const [phase, setPhase] = useState<'name' | 'capture' | 'success'>(
    initialName ? 'capture' : 'name',
  );
  const [name, setName] = useState(initialName || '');
  const [nameError, setNameError] = useState('');
  const [stepIdx, setStepIdx] = useState(0);
  const [faceStatus, setFaceStatus] = useState<FaceStatus>({ face_found: false, pose: 'none' });
  const [countdown, setCountdown] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [captureError, setCaptureError] = useState('');

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturing = useRef(false);
  const stepIdxRef = useRef(stepIdx);
  const nameRef = useRef(name);

  useEffect(() => {
    stepIdxRef.current = stepIdx;
  }, [stepIdx]);
  useEffect(() => {
    nameRef.current = name;
  }, [name]);

  const currentStep = STEPS[stepIdx];
  const isCorrectPose = faceStatus.face_found && faceStatus.pose === currentStep?.id;

  /* ── Stable doCapture ───────────────────────────────── */
  // captureAttempt re-triggers the auto-capture countdown after a FAILED
  // capture: a 422 from the backend quality gates (too_small/blurry/too_dark)
  // doesn't change isCorrectPose, so without this bump the countdown effect
  // never re-runs and the wizard silently stalls until the user breaks pose.
  const [captureAttempt, setCaptureAttempt] = useState(0);

  const doCapture = useCallback(async () => {
    if (isCapturing.current) return;
    isCapturing.current = true;
    setCapturing(true);
    setCaptureError('');

    const step = STEPS[stepIdxRef.current];
    const currentName = nameRef.current.trim();

    try {
      await registerService.captureStep(currentName, step.id);
      setFlashSuccess(true);
      setCompletedSteps((prev) => [...prev, step.id]);
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
      setCaptureAttempt((n) => n + 1);
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
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isCorrectPose, phase, doCapture, captureAttempt]);

  /* ── Name form ──────────────────────────────────────── */
  const handleStart = () => {
    const t = name.trim();
    if (!t) return setNameError('Please enter a name.');
    if (!/^[a-zA-Z0-9_-]+$/.test(t)) return setNameError('Letters, numbers, _ or - only.');
    setNameError('');
    setPhase('capture');
  };

  /* ── Guide message ──────────────────────────────────── */
  const guide = (() => {
    if (capturing) return { text: 'Captured!', ok: true };
    if (!faceStatus.face_found) return { text: 'No face detected – move into frame', ok: false };
    if (isCorrectPose)
      return {
        text: countdown != null ? `Hold still… ${countdown}` : 'Perfect! Hold still…',
        ok: true,
      };
    return { text: currentStep?.instruction || '', ok: false };
  })();

  return (
    <div
      css={modalStyles}
      className="rm-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="rm-panel">
        {/* ── Persistent close button ── */}
        <button className="rm-close" onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={2} />
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
              {STEPS.map((s) => {
                const StepIcon = s.Icon;
                return (
                  <div key={s.id} className="rm-chip">
                    <span className="rm-chip__icon">
                      <StepIcon size={12} strokeWidth={2} />
                    </span>
                    <span className="rm-chip__label">{s.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="rm-field">
              <label className="rm-field__label" htmlFor="reg-name">
                Person's name
              </label>
              <input
                id="reg-name"
                className={`rm-field__input ${nameError ? 'rm-field__input--err' : ''}`}
                placeholder="e.g. joynal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                autoFocus
              />
              {nameError && <span className="rm-field__error">{nameError}</span>}
            </div>

            <button className="rm-cta" onClick={handleStart}>
              <span>Begin Scan</span>
              <ArrowRight size={16} strokeWidth={2} />
            </button>
          </div>
        )}

        {/* ════════ PHASE: capture ════════ */}
        {phase === 'capture' && (
          <div className="rm-capture-phase">
            {/* Step header */}
            <div className="rm-step-header">
              <div className="rm-step-header__label">
                <span className="rm-step-num">
                  {stepIdx + 1}/{STEPS.length}
                </span>
                <span className="rm-step-name">{currentStep.label}</span>
              </div>

              {/* Pip progress */}
              <div className="rm-dots">
                {STEPS.map((s, idx) => (
                  <div
                    key={s.id}
                    className={`rm-dot-pip ${
                      completedSteps.includes(s.id)
                        ? 'rm-dot-pip--done'
                        : idx === stepIdx
                          ? 'rm-dot-pip--active'
                          : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Video */}
            <div
              className={`rm-video-wrap ${isCorrectPose ? 'rm-video-wrap--ok' : ''} ${flashSuccess ? 'rm-video-wrap--flash' : ''}`}
            >
              <img
                src={cameraService.getVideoFeedUrl()}
                crossOrigin="use-credentials"
                alt="live"
                className="rm-video"
              />

              {/* Face guide oval */}
              <div
                className={`rm-oval ${isCorrectPose ? 'rm-oval--ok' : ''} ${!faceStatus.face_found ? 'rm-oval--warn' : ''}`}
              >
                <div className="rm-oval__scan" />
              </div>

              {/* Directional arrow */}
              {!isCorrectPose && <DirectionArrow dir={currentStep.arrowDir} />}

              {/* Countdown ring (only while the pose is actually held — a stale
                  value must not ring when the user looks away mid-count) */}
              {isCorrectPose && countdown != null && (
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
              <Camera
                size={14}
                strokeWidth={1.75}
                style={{ verticalAlign: 'middle', marginRight: 6 }}
              />
              Take photo manually
            </button>
          </div>
        )}

        {/* ════════ PHASE: success ════════ */}
        {phase === 'success' && (
          <div className="rm-success-phase">
            <div className="rm-success-circle">
              <CheckCircle2 size={56} strokeWidth={2} />
            </div>
            <h2 className="rm-success-title">Welcome, {name}!</h2>
            <p className="rm-success-sub">
              All 5 angles captured. The AI will recognise you immediately.
            </p>
            <button
              className="rm-cta"
              onClick={() => {
                onSuccess?.();
                onClose();
              }}
            >
              <Check size={16} strokeWidth={2} />
              <span>Done</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

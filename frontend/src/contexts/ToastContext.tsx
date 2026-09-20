import { createContext, useState, useCallback, useId, type ReactNode } from 'react';
import { css } from '@emotion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { tokens } from '@/theme/designTokens';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastContextValue {
  toast: {
    success: (message: string, durationMs?: number) => void;
    error: (message: string, durationMs?: number) => void;
    info: (message: string, durationMs?: number) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toastContainerStyles = css`
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
  max-width: 400px;
  width: calc(100vw - 48px);
`;

const toastCardStyles = (type: ToastType) => {
  const accentColor =
    type === 'success'
      ? tokens.colors.status.online
      : type === 'error'
        ? tokens.colors.status.danger
        : tokens.colors.accent.primary;

  const bgBorder =
    type === 'success'
      ? 'rgba(34, 197, 94, 0.25)'
      : type === 'error'
        ? 'rgba(239, 68, 68, 0.3)'
        : 'rgba(59, 130, 246, 0.3)';

  return css`
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: ${tokens.radii.md};
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid ${bgBorder};
    backdrop-filter: blur(12px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    color: ${tokens.colors.text.primary};
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    animation: toast-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);

    @keyframes toast-slide-in {
      from {
        opacity: 0;
        transform: translateY(12px) scale(0.96);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .toast-icon {
      color: ${accentColor};
      flex-shrink: 0;
    }

    .toast-message {
      flex: 1;
      word-break: break-word;
    }

    .toast-close {
      background: transparent;
      border: none;
      color: ${tokens.colors.text.muted};
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: color 0.15s;

      &:hover {
        color: ${tokens.colors.text.primary};
      }
    }
  `;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idPrefix = useId();

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, durationMs = 3500) => {
      const id = `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, message }]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [idPrefix, removeToast],
  );

  const contextValue: ToastContextValue = {
    toast: {
      success: (msg, duration) => addToast('success', msg, duration),
      error: (msg, duration) => addToast('error', msg, duration),
      info: (msg, duration) => addToast('info', msg, duration),
    },
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div css={toastContainerStyles} aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div key={t.id} css={toastCardStyles(t.type)} role="alert">
            <span className="toast-icon">
              {t.type === 'success' && <CheckCircle2 size={16} strokeWidth={2.2} />}
              {t.type === 'error' && <AlertCircle size={16} strokeWidth={2.2} />}
              {t.type === 'info' && <Info size={16} strokeWidth={2.2} />}
            </span>
            <span className="toast-message">{t.message}</span>
            <button
              className="toast-close"
              onClick={() => removeToast(t.id)}
              aria-label="Close notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export { ToastContext };

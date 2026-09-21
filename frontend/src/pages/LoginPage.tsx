import { useState, type FormEvent } from 'react';
import { css } from '@emotion/react';
import { AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { tokens } from '@/theme/designTokens';

const loginStyles = css`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${tokens.colors.bg.canvas};
  position: relative;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;

  .lp-card {
    position: relative;
    z-index: 1;
    width: min(400px, 92vw);
    background: ${tokens.colors.surface.default};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.xl};
    padding: 44px 36px 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: ${tokens.spacing.xxl};
    backdrop-filter: blur(16px);
    box-shadow: ${tokens.shadows.modal};
    animation: lp-card-in 0.35s cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  @keyframes lp-card-in {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .lp-copy {
    text-align: center;
  }
  .lp-title {
    margin: 0 0 6px;
    font-size: ${tokens.fontSizes.xxl};
    font-weight: ${tokens.fontWeights.bold};
    color: ${tokens.colors.text.primary};
    letter-spacing: -0.4px;
  }
  .lp-sub {
    margin: 0;
    font-size: ${tokens.fontSizes.base};
    color: ${tokens.colors.text.secondary};
    line-height: 1.5;
  }

  .lp-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: ${tokens.spacing.lg};
  }

  .lp-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lp-field__label {
    font-size: ${tokens.fontSizes.sm};
    font-weight: ${tokens.fontWeights.semibold};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: ${tokens.colors.text.muted};
  }
  .lp-field__input {
    background: ${tokens.colors.surface.subtle};
    border: 1px solid ${tokens.colors.border.subtle};
    border-radius: ${tokens.radii.md};
    padding: 13px 16px;
    font-size: ${tokens.fontSizes.md};
    font-family: inherit;
    color: ${tokens.colors.text.primary};
    outline: none;
    transition:
      border-color ${tokens.transitions.slow},
      box-shadow ${tokens.transitions.slow};
    width: 100%;
    box-sizing: border-box;
  }
  .lp-field__input:focus {
    border-color: ${tokens.colors.border.focus};
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
  }
  .lp-field__input::placeholder {
    color: ${tokens.colors.text.muted};
  }

  .lp-error {
    display: flex;
    align-items: center;
    gap: ${tokens.spacing.sm};
    padding: 10px 14px;
    border-radius: ${tokens.radii.sm};
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.25);
    color: ${tokens.colors.status.danger};
    font-size: ${tokens.fontSizes.base};
    font-weight: ${tokens.fontWeights.medium};
  }

  .lp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${tokens.spacing.sm};
    width: 100%;
    padding: 14px;
    border-radius: ${tokens.radii.md};
    background: ${tokens.colors.accent.primary};
    font-size: 15px;
    font-weight: ${tokens.fontWeights.semibold};
    font-family: inherit;
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: ${tokens.shadows.glowPrimary};
    transition:
      background ${tokens.transitions.fast},
      transform 0.1s;
    margin-top: ${tokens.spacing.xs};
  }
  .lp-btn:hover:not(:disabled) {
    background: ${tokens.colors.accent.hover};
    transform: translateY(-1px);
  }
  .lp-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .lp-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255, 255, 255, 0.25);
    border-top-color: white;
    border-radius: ${tokens.radii.full};
    animation: lp-spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes lp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .lp-hint {
    font-size: ${tokens.fontSizes.xs};
    color: ${tokens.colors.text.muted};
    text-align: center;
    margin: 0;
  }
`;

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div css={loginStyles}>
      <div className="lp-card">
        <div className="lp-copy">
          <h1 className="lp-title">Aegis Vision</h1>
          <p className="lp-sub">AI-powered home security — sign in to continue</p>
        </div>

        <form className="lp-form" onSubmit={handleSubmit} noValidate>
          <div className="lp-field">
            <label className="lp-field__label" htmlFor="lp-username">
              Username
            </label>
            <input
              id="lp-username"
              className="lp-field__input"
              type="text"
              autoComplete="username"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="lp-field">
            <label className="lp-field__label" htmlFor="lp-password">
              Password
            </label>
            <input
              id="lp-password"
              className="lp-field__input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="lp-error">
              <AlertCircle size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <button className="lp-btn" type="submit" disabled={loading}>
            {loading ? (
              <span className="lp-spinner" />
            ) : (
              <>
                <span>Sign In</span>
                <LogIn size={15} strokeWidth={2} />
              </>
            )}
          </button>
        </form>

        <p className="lp-hint">Check the backend console for your credentials on first run.</p>
      </div>
    </div>
  );
}

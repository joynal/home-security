import { useState, type FormEvent } from 'react';
import { css } from '@emotion/react';
import { useAuth } from './contexts/useAuth';

const loginStyles = css`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #060910;
  position: relative;
  overflow: hidden;
  font-family: 'Inter', system-ui, sans-serif;

  .lp-card {
    position: relative;
    z-index: 1;
    width: min(400px, 92vw);
    background: rgba(13, 17, 25, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 24px;
    padding: 44px 36px 36px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    backdrop-filter: blur(16px);
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.08);
    animation: lp-card-in 0.35s cubic-bezier(0.34, 1.3, 0.64, 1);
  }
  @keyframes lp-card-in {
    from { opacity: 0; transform: translateY(24px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }

  .lp-copy { text-align: center; }
  .lp-title {
    margin: 0 0 6px;
    font-size: 22px;
    font-weight: 700;
    color: #e8eaf0;
    letter-spacing: -0.4px;
  }
  .lp-sub {
    margin: 0;
    font-size: 13px;
    color: #7a879e;
    line-height: 1.5;
  }

  .lp-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .lp-field { display: flex; flex-direction: column; gap: 6px; }
  .lp-field__label {
    font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    color: #5a6a80;
  }
  .lp-field__input {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 13px 16px;
    font-size: 14px;
    font-family: inherit;
    color: #e8eaf0;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
    width: 100%;
    box-sizing: border-box;
  }
  .lp-field__input:focus {
    border-color: rgba(59, 158, 255, 0.45);
    box-shadow: 0 0 0 3px rgba(59, 158, 255, 0.08);
  }
  .lp-field__input::placeholder { color: #3a4a5c; }

  .lp-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(248, 113, 113, 0.08);
    border: 1px solid rgba(248, 113, 113, 0.2);
    color: #f87171;
    font-size: 13px;
    font-weight: 500;
  }

  .lp-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    background: linear-gradient(135deg, #2563eb, #6366f1);
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
    transition: opacity 0.15s, transform 0.1s;
    margin-top: 4px;
  }
  .lp-btn:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
  .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .lp-spinner {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.25);
    border-top-color: white;
    border-radius: 50%;
    animation: lp-spin 0.7s linear infinite;
    display: inline-block;
  }
  @keyframes lp-spin { to { transform: rotate(360deg); } }

  .lp-hint {
    font-size: 11px;
    color: #3a4a5c;
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
            <label className="lp-field__label" htmlFor="lp-username">Username</label>
            <input
              id="lp-username"
              className="lp-field__input"
              type="text"
              autoComplete="username"
              placeholder="admin"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="lp-field">
            <label className="lp-field__label" htmlFor="lp-password">Password</label>
            <input
              id="lp-password"
              className="lp-field__input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="lp-error">
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor">
                <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
              </svg>
              {error}
            </div>
          )}

          <button className="lp-btn" type="submit" disabled={loading}>
            {loading ? (
              <span className="lp-spinner" />
            ) : (
              <>
                Sign In
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"/>
                </svg>
              </>
            )}
          </button>
        </form>

        <p className="lp-hint">
          Check the backend console for your credentials on first run.
        </p>
      </div>
    </div>
  );
}

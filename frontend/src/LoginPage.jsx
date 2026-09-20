import { useState } from 'react';
import { useAuth } from './contexts/useAuth';
import './LoginPage.css';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-root">

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

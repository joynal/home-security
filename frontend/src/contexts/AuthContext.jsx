/**
 * src/contexts/AuthContext.jsx
 *
 * Provides: { token, username, login, logout }
 * Token is persisted in localStorage so the user stays logged in across page refreshes.
 * All API calls should read `token` from this context and pass it as a Bearer header
 * (or ?token= query param for img src endpoints like /video_feed).
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const API = 'http://localhost:8000';
const STORAGE_KEY = 'aegis_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token,    setToken]    = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [username, setUsername] = useState(() => localStorage.getItem('aegis_user') || null);

  const login = useCallback(async (usr, pwd) => {
    const res = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username: usr, password: pwd }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem(STORAGE_KEY,    data.access_token);
    localStorage.setItem('aegis_user',   data.username);
    setToken(data.access_token);
    setUsername(data.username);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('aegis_user');
    setToken(null);
    setUsername(null);
  }, []);

  /** Convenience: returns headers object with Authorization bearer */
  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const value = useMemo(
    () => ({ token, username, login, logout, authHeaders }),
    [token, username, login, logout, authHeaders],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

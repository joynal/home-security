/**
 * src/contexts/AuthContext.jsx
 *
 * Provides: { token, username, login, logout }
 * Token is persisted in localStorage so the user stays logged in across page refreshes.
 * All API calls should read `token` from this context and pass it as a Bearer header
 * (or ?token= query param for img src endpoints like /video_feed).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './useAuth.jsx';
import { authService } from '../services/auth';
import { STORAGE_KEY, setUnauthorizedHandler } from '../services/core';

function getStoredToken() {
  const t = localStorage.getItem(STORAGE_KEY);
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('aegis_user');
      return null;
    }
  } catch {
    // If decoding fails, let the network interceptor handle it
  }
  return t;
}

export function AuthProvider({ children }) {
  const [token,    setToken]    = useState(getStoredToken);
  const [username, setUsername] = useState(() => localStorage.getItem('aegis_user') || null);

  const logout = useCallback(() => {
    authService.logout().catch(() => {});
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('aegis_user');
    setToken(null);
    setUsername(null);
  }, []);

  // Intercept 401 Unauthorized via the core apiFetch handler to auto-logout
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (usr, pwd) => {
    const data = await authService.login(usr, pwd);
    localStorage.setItem(STORAGE_KEY,    data.access_token);
    localStorage.setItem('aegis_user',   data.username);
    setToken(data.access_token);
    setUsername(data.username);
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


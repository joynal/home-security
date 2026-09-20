/**
 * src/contexts/AuthContext.jsx
 *
 * Provides: { token, username, login, logout }
 * Token is persisted in localStorage so the user stays logged in across page refreshes.
 * All API calls should read `token` from this context and pass it as a Bearer header
 * (or ?token= query param for img src endpoints like /video_feed).
 */

const API = 'http://localhost:8000';
const STORAGE_KEY = 'aegis_token';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthContext } from './useAuth.jsx';

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
    fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('aegis_user');
    setToken(null);
    setUsername(null);
  }, []);

  // Intercept 401 Unauthorized on authenticated requests to auto-logout
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      // Ensure credentials: 'include' for calls to the API
      const input = args[0];
      const init = args[1] || {};
      const url =
        typeof input === 'string'
          ? input
          : input?.url || (input instanceof URL ? input.href : '');

      if (url.startsWith(API) && init.credentials === undefined) {
        init.credentials = 'include';
        args[1] = init;
      }

      const res = await originalFetch(...args);
      if (res.status === 401) {
        if (!url.includes('/auth/login')) {
          logout();
        }
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [logout]);

  const login = useCallback(async (usr, pwd) => {
    const res = await fetch(`${API}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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


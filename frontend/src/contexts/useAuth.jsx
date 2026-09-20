/**
 * useAuth — the consumer hook, split from AuthContext.jsx so the provider
 * file only exports components (react-refresh/only-export-components).
 */
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}

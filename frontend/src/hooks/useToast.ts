import { useContext } from 'react';
import { ToastContext, type ToastContextValue } from '@/contexts/ToastContext';

export function useToast(): ToastContextValue['toast'] {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx.toast;
}

export type { ToastType, ToastItem, ToastContextValue } from '@/contexts/ToastContext';

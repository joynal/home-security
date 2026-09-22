/** Shared time-formatting helpers (Task R11 — deduped from 3 components). */

export function relTime(iso: string, empty = '—'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return empty;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function exactTime(iso: string, withSeconds = true): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' as const } : {}),
  });
}

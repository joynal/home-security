/**
 * Aegis Vision AI — Typed Design Tokens for Emotion & UI styling.
 * Aligned with the Zinc Dark security dashboard palette.
 */

export const spacing = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  xxl: '24px',
  xxxl: '32px',
} as const;

export const radii = {
  sm: '6px',
  default: '10px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  full: '9999px',
} as const;

export const fontSizes = {
  xs: '11px',
  sm: '12px',
  base: '13px',
  md: '14px',
  lg: '16px',
  xl: '18px',
  xxl: '22px',
  hero: '28px',
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const transitions = {
  fast: '120ms ease-out',
  default: '120ms ease-out',
  slow: '200ms ease-out',
} as const;

export const shadows = {
  subtle: '0 2px 8px rgba(0, 0, 0, 0.2)',
  card: '0 4px 20px rgba(0, 0, 0, 0.35)',
  modal: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.07)',
  menu: '0 4px 24px rgba(0, 0, 0, 0.5)',
  glowPrimary: '0 0 24px rgba(59, 130, 246, 0.25)',
  glowAlarm: '0 0 24px rgba(239, 68, 68, 0.3)',
} as const;

export const colors = {
  bg: {
    canvas: '#09090b',
    surface: '#101014',
    surface2: '#18181b',
    surface3: '#27272a',
    card: '#0f172a',
    glass: 'rgba(9, 9, 11, 0.72)',
    modalOverlay: 'rgba(0, 0, 0, 0.75)',
  },
  surface: {
    default: '#101014',
    subtle: '#18181b',
    raised: '#27272a',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.08)',
    strong: '#3f3f46',
    focus: 'rgba(59, 130, 246, 0.45)',
    active: '#3b82f6',
  },
  text: {
    primary: '#fafafa',
    secondary: '#a1a1aa',
    muted: '#71717a',
    inverse: '#09090b',
  },
  accent: {
    primary: '#3b82f6',
    hover: '#60a5fa',
    indigo: '#6366f1',
    cyan: '#06b6d4',
  },
  status: {
    online: '#22c55e',
    live: '#22c55e',
    offline: '#71717a',
    warning: '#f59e0b',
    danger: '#ef4444',
    alert: '#ef4444',
  },
} as const;

export const tokens = {
  spacing,
  radii,
  fontSizes,
  fontWeights,
  transitions,
  shadows,
  colors,
} as const;

export type DesignTokens = typeof tokens;

import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Film,
  Grid,
  LayoutDashboard,
  LogOut,
  ScanFace,
  Search,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { tokens } from '@/theme/designTokens';

const railStyles = {
  width: '56px',
  flexShrink: 0,
  background: tokens.colors.surface.default,
  borderRight: `1px solid ${tokens.colors.border.subtle}`,
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  padding: `${tokens.spacing.md} 0`,
  gap: tokens.spacing.sm,
  zIndex: 100,
  '@media (max-width: 768px)': {
    position: 'fixed' as const,
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
    padding: `0 ${tokens.spacing.sm} env(safe-area-inset-bottom, 0px)`,
    flexDirection: 'row' as const,
    justifyContent: 'space-around',
    borderRight: 'none',
    borderTop: `1px solid ${tokens.colors.border.subtle}`,
    background: 'rgba(16, 16, 20, 0.95)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    gap: 0,
  },
};

const logoStyles = {
  color: tokens.colors.text.primary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  marginBottom: tokens.spacing.sm,
  '@media (max-width: 768px)': {
    display: 'none',
  },
};

const navStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: tokens.spacing.xs,
  flex: 1,
  '@media (max-width: 768px)': {
    flexDirection: 'row' as const,
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    gap: 0,
  },
};

const railItemStyles = {
  position: 'relative' as const,
  width: '36px',
  height: '36px',
  borderRadius: tokens.radii.sm,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: tokens.colors.text.muted,
  transition: `color ${tokens.transitions.default}, background ${tokens.transitions.default}`,
  '&:hover': {
    color: tokens.colors.text.primary,
    background: tokens.colors.surface.subtle,
  },
  '&:focus-visible': {
    outline: `2px solid ${tokens.colors.accent.primary}`,
    outlineOffset: '1px',
  },
  '&.active': {
    color: tokens.colors.accent.primary,
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      left: '-10px',
      top: '8px',
      bottom: '8px',
      width: '2px',
      borderRadius: '1px',
      background: tokens.colors.accent.primary,
      '@media (max-width: 768px)': {
        left: '6px',
        right: '6px',
        top: 'auto',
        bottom: '-6px',
        width: 'auto',
        height: '2px',
      },
    },
  },
};

const avatarStyles = {
  width: '26px',
  height: '26px',
  borderRadius: tokens.radii.full,
  background: tokens.colors.surface.raised,
  color: tokens.colors.text.primary,
  fontSize: tokens.fontSizes.sm,
  fontWeight: tokens.fontWeights.semibold,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const footerStyles = {
  position: 'relative' as const,
  '@media (max-width: 768px)': {
    display: 'flex',
    alignItems: 'center',
  },
};

const menuStyles = {
  position: 'absolute' as const,
  bottom: '44px',
  left: '48px',
  background: tokens.colors.surface.raised,
  border: `1px solid ${tokens.colors.border.subtle}`,
  borderRadius: tokens.radii.default,
  boxShadow: tokens.shadows.menu,
  padding: '6px',
  minWidth: '150px',
  zIndex: 150,
  '@media (max-width: 768px)': {
    bottom: '56px',
    left: 'auto',
    right: '8px',
  },
};

const menuUserStyles = {
  fontSize: tokens.fontSizes.sm,
  fontWeight: tokens.fontWeights.semibold,
  color: tokens.colors.text.primary,
  padding: '6px 8px 8px',
  borderBottom: `1px solid ${tokens.colors.border.subtle}`,
  marginBottom: tokens.spacing.xs,
};

const menuItemStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: tokens.spacing.sm,
  width: '100%',
  padding: '7px 8px',
  borderRadius: tokens.radii.sm,
  fontSize: '12.5px',
  color: tokens.colors.text.secondary,
  '&:hover': {
    color: tokens.colors.text.primary,
    background: 'rgba(255, 255, 255, 0.06)',
  },
};

export default function AppRail() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  const initial = (username || 'A')[0].toUpperCase();

  return (
    <aside css={railStyles} aria-label="Main Navigation">
      <div css={logoStyles} title="Aegis Vision">
        <ShieldCheck size={22} strokeWidth={2.2} color={tokens.colors.accent.primary} />
      </div>

      <nav css={navStyles}>
        <NavLink
          to="/"
          end
          css={railItemStyles}
          className={({ isActive }) => (isActive ? 'active' : '')}
          title="Dashboard"
          aria-label="Dashboard"
        >
          <LayoutDashboard size={19} strokeWidth={1.8} />
        </NavLink>

        <NavLink
          to="/grid"
          css={railItemStyles}
          className={({ isActive }) => (isActive ? 'active' : '')}
          title="Camera Grid"
          aria-label="Camera Grid"
        >
          <Grid size={19} strokeWidth={1.8} />
        </NavLink>

        <NavLink
          to="/playback"
          css={railItemStyles}
          className={({ isActive }) => (isActive ? 'active' : '')}
          title="Playback"
          aria-label="Playback"
        >
          <Film size={19} strokeWidth={1.8} />
        </NavLink>

        <NavLink
          to="/detections"
          css={railItemStyles}
          className={({ isActive }) => (isActive ? 'active' : '')}
          title="Detections"
          aria-label="Detections"
        >
          <Search size={19} strokeWidth={1.8} />
        </NavLink>

        <NavLink
          to="/faces"
          css={railItemStyles}
          className={({ isActive }) => (isActive ? 'active' : '')}
          title="Known people"
          aria-label="Known people"
        >
          <ScanFace size={19} strokeWidth={1.8} />
        </NavLink>

        <NavLink
          to="/settings"
          css={railItemStyles}
          className={({ isActive }) => (isActive ? 'active' : '')}
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={19} strokeWidth={1.8} />
        </NavLink>
      </nav>

      <div css={footerStyles} ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          css={railItemStyles}
          title={username ? `Signed in as ${username}` : 'Account'}
          aria-label="User menu"
          aria-expanded={menuOpen}
        >
          <div css={avatarStyles}>{initial}</div>
        </button>

        {menuOpen && (
          <div css={menuStyles} role="menu">
            <div css={menuUserStyles}>@{username || 'admin'}</div>
            <button css={menuItemStyles} onClick={handleLogout} role="menuitem">
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

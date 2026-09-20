import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Cctv, LogOut, ScanFace, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';

const railStyles = {
  width: '56px',
  flexShrink: 0,
  background: 'var(--surface)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  padding: '12px 0',
  gap: '8px',
};

const logoStyles = {
  color: 'var(--text-1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '36px',
  height: '36px',
  marginBottom: '8px',
};

const navStyles = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '4px',
  flex: 1,
};

const railItemStyles = {
  position: 'relative' as const,
  width: '36px',
  height: '36px',
  borderRadius: 'var(--radius-sm)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-3)',
  transition: 'color var(--transition), background var(--transition)',
  '&:hover': {
    color: 'var(--text-1)',
    background: 'var(--surface-2)',
  },
  '&:focus-visible': {
    outline: '2px solid var(--accent)',
    outlineOffset: '1px',
  },
  '&.active': {
    color: 'var(--accent)',
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      left: '-10px',
      top: '8px',
      bottom: '8px',
      width: '2px',
      borderRadius: '1px',
      background: 'var(--accent)',
    },
  },
};

const avatarStyles = {
  width: '26px',
  height: '26px',
  borderRadius: '50%',
  background: 'var(--surface-3)',
  color: 'var(--text-1)',
  fontSize: '12px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const footerStyles = {
  position: 'relative' as const,
};

const menuStyles = {
  position: 'absolute' as const,
  bottom: '44px',
  left: '48px',
  background: 'var(--surface-3)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
  padding: '6px',
  minWidth: '150px',
  zIndex: 50,
};

const menuUserStyles = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--text-1)',
  padding: '6px 8px 8px',
  borderBottom: '1px solid var(--border)',
  marginBottom: '4px',
};

const menuItemStyles = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '7px 8px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '12.5px',
  color: 'var(--text-2)',
  '&:hover': {
    color: 'var(--text-1)',
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

  return (
    <nav css={railStyles} aria-label="Main navigation">
      <NavLink to="/" css={logoStyles} aria-label="Aegis Vision — home">
        <ShieldCheck size={20} strokeWidth={1.75} />
      </NavLink>

      <div css={navStyles}>
        <NavLink to="/" end css={railItemStyles} aria-label="Live cameras" title="Live">
          <Cctv size={18} strokeWidth={1.75} />
        </NavLink>
        <NavLink to="/events" css={railItemStyles} aria-label="Events" title="Events">
          <Bell size={18} strokeWidth={1.75} />
        </NavLink>
        <NavLink to="/faces" css={railItemStyles} aria-label="Known people" title="People">
          <ScanFace size={18} strokeWidth={1.75} />
        </NavLink>
      </div>

      <div css={footerStyles} ref={menuRef}>
        <button
          css={railItemStyles}
          onClick={() => setMenuOpen(o => !o)}
          aria-label={`Account: ${username ?? ''}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={username ?? undefined}
        >
          <span css={avatarStyles}>{username?.[0]?.toUpperCase() ?? '?'}</span>
        </button>

        {menuOpen && (
          <div css={menuStyles} role="menu">
            <div css={menuUserStyles}>{username}</div>
            <button css={menuItemStyles} onClick={handleLogout} role="menuitem">
              <LogOut size={14} strokeWidth={1.75} /> Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

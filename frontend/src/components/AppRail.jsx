/**
 * AppRail — 56px icon-only navigation (Frigate/PSIM pattern).
 * Logo top · Live/Events/Faces · spacer · user menu bottom.
 * Active item = accent icon + left indicator. No pills.
 */
import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, Cctv, ChevronUp, LogOut, ScanFace, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/useAuth';
import './AppRail.css';

export default function AppRail() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
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
    <nav className="rail" aria-label="Main navigation">
      <NavLink to="/" className="rail__logo" aria-label="Aegis Vision — home">
        <ShieldCheck size={20} strokeWidth={1.75} />
      </NavLink>

      <div className="rail__nav">
        <NavLink to="/" end className="rail__item" aria-label="Live cameras" title="Live">
          <Cctv size={18} strokeWidth={1.75} />
        </NavLink>
        <NavLink to="/events" className="rail__item" aria-label="Events" title="Events">
          <Bell size={18} strokeWidth={1.75} />
        </NavLink>
        <NavLink to="/faces" className="rail__item" aria-label="Known people" title="People">
          <ScanFace size={18} strokeWidth={1.75} />
        </NavLink>
      </div>

      <div className="rail__footer" ref={menuRef}>
        <button
          className="rail__item rail__user"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={`Account: ${username}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={username}
        >
          <span className="rail__avatar">{username?.[0]?.toUpperCase() ?? '?'}</span>
        </button>

        {menuOpen && (
          <div className="rail__menu" role="menu">
            <div className="rail__menu-user">{username}</div>
            <button className="rail__menu-item" onClick={handleLogout} role="menuitem">
              <LogOut size={14} strokeWidth={1.75} /> Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

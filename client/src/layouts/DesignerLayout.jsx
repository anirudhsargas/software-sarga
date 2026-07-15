import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  PenTool, Image, BookOpen, Clock, Settings, LogOut,
  Briefcase, BarChart2, Menu, X, Plus, ChevronRight, Building2
} from 'lucide-react';
import auth from '../services/auth';
import useAuth from '../hooks/useAuth';
import { useBranches } from '../contexts/BranchContext';
import BranchSelect from '../components/ui/BranchSelect';
import '../styles/designer-dashboard.css';

const NAV_ITEMS = [
  {
    to: '/designer',
    end: true,
    icon: PenTool,
    label: 'Dashboard',
    kbd: 'D',
    id: 'nav-dashboard',
    key: 'dashboard',
  },
  {
    to: '/designer/assigned',
    icon: Briefcase,
    label: 'Assigned Jobs',
    kbd: 'A',
    id: 'nav-assigned',
    key: 'jobs',
  },
  {
    to: '/designer/bookings',
    icon: Clock,
    label: 'Design Queue',
    kbd: 'B',
    id: 'nav-bookings',
    key: 'jobs',
  },
  {
    to: '/designer/library',
    icon: Image,
    label: 'Product Library',
    id: 'nav-library',
    key: 'operations',
  },
  {
    to: '/designer/blocks',
    icon: BookOpen,
    label: 'Block Journal',
    id: 'nav-blocks',
    key: 'operations',
  },
  {
    to: '/designer/analytics',
    icon: BarChart2,
    label: 'Analytics',
    id: 'nav-analytics',
    key: 'reports',
  },
];

const PAGE_TITLES = {
  '/designer': 'Dashboard',
  '/designer/assigned': 'Assigned Jobs',
  '/designer/bookings': 'Design Queue',
  '/designer/library': 'Product Library',
  '/designer/blocks': 'Block Journal',
  '/designer/analytics': 'Analytics',
};

const DesignerLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { assignedBranches, selectedBranchId, selectBranch } = useBranches();

  const handleLogout = useCallback(() => {
    logout();
  }, [logout]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'd': e.preventDefault(); navigate('/designer'); closeSidebar(); break;
        case 'a': e.preventDefault(); navigate('/designer/assigned'); closeSidebar(); break;
        case 'b': e.preventDefault(); navigate('/designer/bookings'); closeSidebar(); break;
        case 'u': e.preventDefault(); navigate('/designer/bookings'); closeSidebar(); break;
        case 'j': e.preventDefault(); navigate('/designer/bookings'); closeSidebar(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, closeSidebar]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const pageTitle = PAGE_TITLES[location.pathname] || 'Design Studio';
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'DS';

  return (
    <div className="designer-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      {/* ── Sidebar overlay (mobile) ── */}
      <div
        className={`designer-overlay${sidebarOpen ? ' designer-overlay--visible' : ''}`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* ── Sidebar ── */}
      <aside className={`designer-sidebar${sidebarOpen ? ' designer-sidebar--open' : ''}`} role="navigation" aria-label="Designer Navigation">

        {/* Brand */}
        <div className="designer-sidebar__brand">
          <h2 className="designer-sidebar__logo">Design Studio</h2>
          <div className="designer-sidebar__role">
            {user?.name || 'Designer'} · {user?.role || 'Designer'}
          </div>
        </div>

        {/* Nav */}
        <nav className="designer-sidebar__nav">
          <div className="designer-sidebar__section-label">Navigation</div>

          {useMemo(() => {
            if (!user?.settings) return NAV_ITEMS;
            try {
              const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
              if (settings.sidebar) {
                return NAV_ITEMS.filter(item => settings.sidebar[item.key] !== false);
              }
            } catch (e) {
              console.error('Error parsing designer sidebar settings:', e);
            }
            return NAV_ITEMS;
          }, [user]).map(item => {
            const IconComp = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                id={item.id}
                className={({ isActive }) =>
                  `designer-nav-link${isActive ? ' active' : ''}`
                }
              >
                <span className="designer-nav-link__icon">
                  <IconComp size={18} />
                </span>
                <span className="designer-nav-link__label">{item.label}</span>
                {item.kbd && (
                  <span className="designer-nav-link__kbd">Alt+{item.kbd}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Quick action in sidebar */}
        {useMemo(() => {
          if (!user?.settings) return true;
          try {
            const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
            return settings.sidebar?.jobs !== false;
          } catch {
            return true;
          }
        }, [user]) && (
          <div style={{ padding: '0 10px 12px' }}>
            <button
              className="designer-nav-link quick-action-btn quick-action-btn--primary"
              style={{ width: '100%', justifyContent: 'center', borderRadius: 10 }}
              onClick={() => navigate('/designer/bookings')}
              id="sidebar-new-booking"
            >
              <Plus size={15} /> New Booking
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="designer-sidebar__footer">
          <NavLink
            to="/staff-settings"
            id="nav-settings"
            className={({ isActive }) => `designer-nav-link${isActive ? ' active' : ''}`}
          >
            <span className="designer-nav-link__icon"><Settings size={18} /></span>
            <span className="designer-nav-link__label">Profile & Settings</span>
          </NavLink>

          <button
            className="designer-nav-link"
            style={{ color: 'var(--danger)', width: '100%', marginTop: 4 }}
            onClick={handleLogout}
            id="nav-logout"
          >
            <span className="designer-nav-link__icon"><LogOut size={18} /></span>
            <span className="designer-nav-link__label">Logout</span>
          </button>

          {/* Keyboard shortcut hint */}
          <div style={{ padding: '10px 14px 0', fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong>Shortcuts:</strong><br />
            Alt+D · Alt+A · Alt+B<br />
            Alt+U (Upload) · Alt+J (Job)
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="designer-main">

        {/* Topbar */}
        <header className="designer-topbar">
          {/* Mobile menu button */}
          <button
            className="designer-topbar__menu-btn"
            onClick={() => setSidebarOpen(o => !o)}
            aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-pressed={sidebarOpen}
            id="topbar-menu-btn"
          >
            {sidebarOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>

          {/* Page title */}
          <div className="designer-topbar__title">{pageTitle}</div>

          {/* Top right actions */}
          <div className="designer-topbar__actions">
            {assignedBranches.length > 1 && (
              <div className="designer-branch-switcher">
                <Building2 size={15} aria-hidden="true" />
                <BranchSelect
                  value={selectedBranchId}
                  onChange={(e) => selectBranch(e.target.value)}
                  className="designer-branch-select"
                >
                  {assignedBranches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </BranchSelect>
              </div>
            )}

            {useMemo(() => {
              if (!user?.settings) return true;
              try {
                const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
                return settings.sidebar?.jobs !== false;
              } catch {
                return true;
              }
            }, [user]) && (
              <button
                className="quick-action-btn quick-action-btn--primary"
                onClick={() => navigate('/designer/bookings')}
                id="topbar-new-booking"
                style={{ padding: '7px 14px' }}
              >
                <Plus size={14} /> New
              </button>
            )}

            {/* User avatar */}
            <div
              title={user?.name}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'grid', placeItems: 'center',
                fontSize: 12, fontWeight: 800, color: 'var(--text-heading)',
                cursor: 'default', flexShrink: 0
              }}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="designer-content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DesignerLayout;

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, CheckSquare, LogOut, Settings, Menu, X } from 'lucide-react';
import auth from '../services/auth';

const StaffLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    const closeSidebar = useCallback(() => setSidebarOpen(false), []);
    const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), []);

    const handleLogout = () => {
        auth.logout();
    };

    // Lock body scroll when drawer open on mobile/tablet
    useEffect(() => {
        if (sidebarOpen && window.innerWidth < 1024) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [sidebarOpen]);

    // Focus trap inside drawer
    useEffect(() => {
        if (!sidebarOpen || window.innerWidth >= 1024) return;
        const sidebarEl = document.querySelector('.staff-sidebar');
        if (!sidebarEl) return;
        const focusable = sidebarEl.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const handleTab = (e) => {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) {
                if (document.activeElement === first) { last.focus(); e.preventDefault(); }
            } else {
                if (document.activeElement === last) { first.focus(); e.preventDefault(); }
            }
        };
        sidebarEl.addEventListener('keydown', handleTab);
        first.focus();
        return () => sidebarEl.removeEventListener('keydown', handleTab);
    }, [sidebarOpen]);

    // Escape key closes
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape' && sidebarOpen) closeSidebar();
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [sidebarOpen, closeSidebar]);

    // Close drawer on route change
    useEffect(() => {
        if (window.innerWidth < 1024) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSidebarOpen(false);
        }
    }, [location.pathname]);

    return (
        <div className="dashboard-layout">
            <a href="#main-content" className="skip-link">Skip to main content</a>
            {/* Mobile/tablet overlay */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} aria-hidden="true" />}

            <aside
                className={`sidebar staff-sidebar ${sidebarOpen ? 'sidebar--open' : ''}`}
                role="navigation"
                aria-label="Staff Navigation"
            >
                <div className="sidebar-header">
                    <div className="logo-wrap">
                        <div className="logo-img" style={{ background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800 }}>
                            S
                        </div>
                        <span className="logo-text">Staff Portal</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="sidebar-group-toggle active">Navigation</div>
                    <NavLink to="/staff" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
                        <div className="nav-item-inner">
                            <LayoutDashboard size={20} />
                            <span className="nav-label">Overview</span>
                        </div>
                    </NavLink>
                    <NavLink to="/staff/leaves" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
                        <div className="nav-item-inner">
                            <CalendarDays size={20} />
                            <span className="nav-label">Leave Mgmt</span>
                        </div>
                    </NavLink>
                    <NavLink to="/staff/tasks" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
                        <div className="nav-item-inner">
                            <CheckSquare size={20} />
                            <span className="nav-label">My Tasks</span>
                        </div>
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    <NavLink to="/staff-settings" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`} onClick={closeSidebar}>
                        <div className="nav-item-inner">
                            <Settings size={20} />
                            <span className="nav-label">Settings</span>
                        </div>
                    </NavLink>
                    <button className="nav-item" style={{ color: 'var(--danger)' }} onClick={handleLogout}>
                        <div className="nav-item-inner">
                            <LogOut size={20} />
                            <span className="nav-label">Logout</span>
                        </div>
                    </button>
                </div>
            </aside>

            <div className="main-content">
                <header className="global-appbar">
                    <div className="appbar-left">
                        <button
                            className="appbar-hamburger"
                            aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                            aria-pressed={sidebarOpen}
                            onClick={toggleSidebar}
                        >
                            {sidebarOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
                        </button>
                        <div className="appbar-breadcrumb">
                            <span className="breadcrumb-current">Staff Portal</span>
                        </div>
                    </div>
                    <div className="appbar-right">
                        <NavLink to="/staff-settings" className="appbar-icon-btn" title="Settings" aria-label="Settings" onClick={closeSidebar}>
                            <Settings size={18} aria-hidden="true" />
                        </NavLink>
                    </div>
                </header>
                <main id="main-content" className="content-container">
                    <div className="page-container">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default StaffLayout;

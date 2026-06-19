import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, CheckSquare, LogOut, Settings } from 'lucide-react';
import auth from '../services/auth';

const StaffLayout = () => {
    const handleLogout = () => {
        auth.logout();
    };

    return (
        <div className="dashboard-layout">
            <aside className="sidebar" role="navigation" aria-label="Staff Navigation">
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
                    <NavLink to="/staff" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
                        <div className="nav-item-inner">
                            <LayoutDashboard size={20} />
                            <span className="nav-label">Overview</span>
                        </div>
                    </NavLink>
                    <NavLink to="/staff/leaves" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
                        <div className="nav-item-inner">
                            <CalendarDays size={20} />
                            <span className="nav-label">Leave Mgmt</span>
                        </div>
                    </NavLink>
                    <NavLink to="/staff/tasks" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
                        <div className="nav-item-inner">
                            <CheckSquare size={20} />
                            <span className="nav-label">My Tasks</span>
                        </div>
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    <NavLink to="/staff-settings" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
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
                        <div className="appbar-breadcrumb">
                            <span className="breadcrumb-current">Staff Portal</span>
                        </div>
                    </div>
                    <div className="appbar-right">
                        <NavLink to="/staff-settings" className="appbar-icon-btn" title="Settings" aria-label="Settings">
                            <Settings size={18} />
                        </NavLink>
                    </div>
                </header>
                <main className="content-container">
                    <div className="page-container">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default StaffLayout;
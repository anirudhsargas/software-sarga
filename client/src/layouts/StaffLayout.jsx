import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, CalendarDays, CheckSquare, LogOut, Settings } from 'lucide-react';
import auth from '../services/auth';

const StaffLayout = () => {
    const handleLogout = () => {
        auth.logout();
    };

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar__header">
                    <h2 className="sidebar__logo">Staff Portal</h2>
                </div>
                
                <nav className="sidebar__nav">
                    <NavLink to="/staff" end className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <LayoutDashboard size={20} />
                        <span>Overview</span>
                    </NavLink>
                    <NavLink to="/staff/leaves" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <CalendarDays size={20} />
                        <span>Leave Mgmt</span>
                    </NavLink>
                    <NavLink to="/staff/tasks" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <CheckSquare size={20} />
                        <span>My Tasks</span>
                    </NavLink>
                </nav>

                <div className="sidebar__footer">
                    <NavLink to="/staff/settings" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <Settings size={20} />
                        <span>Settings</span>
                    </NavLink>
                    <button className="sidebar__link btn-text text-danger" onClick={handleLogout}>
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
            
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <header className="content-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Staff Portal</h2>
                </header>
                <main className="content-area" style={{ flex: 1, overflowY: 'auto' }}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default StaffLayout;

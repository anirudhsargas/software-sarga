import { NavLink, Outlet } from 'react-router-dom';
import { PenTool, Image, BookOpen, Clock, Settings, LogOut } from 'lucide-react';
import auth from '../services/auth';

const DesignerLayout = () => {
    const handleLogout = () => {
        auth.logout();
    };

    return (
        <div className="app-layout">
            <aside className="sidebar">
                <div className="sidebar__header">
                    <h2 className="sidebar__logo">Design Studio</h2>
                </div>
                
                <nav className="sidebar__nav">
                    <NavLink to="/designer" end className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <PenTool size={20} />
                        <span>Workspace</span>
                    </NavLink>
                    <NavLink to="/designer/library" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <Image size={20} />
                        <span>Product Library</span>
                    </NavLink>
                    <NavLink to="/designer/bookings" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <Clock size={20} />
                        <span>Design Queue</span>
                    </NavLink>
                    <NavLink to="/designer/blocks" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <BookOpen size={20} />
                        <span>Block Journal</span>
                    </NavLink>
                </nav>

                <div className="sidebar__footer">
                    <NavLink to="/staff-settings" className={({isActive}) => `sidebar__link ${isActive ? 'active' : ''}`}>
                        <Settings size={20} />
                        <span>Profile</span>
                    </NavLink>
                    <button className="sidebar__link btn-text text-danger" onClick={handleLogout}>
                        <LogOut size={20} />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
            
            <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
                <header className="content-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 24px', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Design Studio</h2>
                </header>
                <main className="content-area" style={{ flex: 1, overflowY: 'auto' }}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default DesignerLayout;

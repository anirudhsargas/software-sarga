import React, { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
    Users, ClipboardList, Box, ShieldAlert, Receipt, LogOut, Grid, UserSquare, Building2, ChevronLeft, ChevronRight, Settings, BookOpen, Loader2,
    Brain, Search, FileCheck, Layers, Zap, TrendingUp
} from 'lucide-react';
import useAuth from '../hooks/useAuth';
import api, { API_URL } from '../services/api';
import ImageCropModal from '../components/ImageCropModal';
import SmartSearch from '../components/SmartSearch';
import sargaLogo from '../assets/sarga-logo.png';
import { useConfirm } from '../contexts/ConfirmContext';

// Lazy-loaded pages — each becomes a separate chunk
const StaffManagement = React.lazy(() => import('./StaffManagement'));
const EmployeeDetail = React.lazy(() => import('./EmployeeDetail'));
const Customers = React.lazy(() => import('./Customers'));
const CustomerDetails = React.lazy(() => import('./CustomerDetails'));
const Jobs = React.lazy(() => import('./Jobs'));
const JobDetail = React.lazy(() => import('./JobDetail'));
const ProductLibrary = React.lazy(() => import('./ProductLibrary'));
const IDChangeRequests = React.lazy(() => import('./Requests'));
const Inventory = React.lazy(() => import('./Inventory'));
const Branches = React.lazy(() => import('./Branches'));
const CustomerPayments = React.lazy(() => import('./CustomerPayments'));
const Summary = React.lazy(() => import('./Summary'));
const Billing = React.lazy(() => import('./Billing'));
const FrontOffice = React.lazy(() => import('./FrontOffice'));
const ExpenseManager = React.lazy(() => import('./ExpenseManager'));
const MachineManagement = React.lazy(() => import('./MachineManagement'));
const DailyReport = React.lazy(() => import('./DailyReport'));
const AttendanceSalary = React.lazy(() => import('./AttendanceSalary'));
const AccountantDashboard = React.lazy(() => import('./AccountantDashboard'));
const NotFound = React.lazy(() => import('./NotFound'));
const AIMonitoring = React.lazy(() => import('./AIMonitoring'));
const DesignChecker = React.lazy(() => import('./DesignChecker'));
const PaperLayoutGenerator = React.lazy(() => import('./PaperLayoutGenerator'));
const JobPriority = React.lazy(() => import('./JobPriority'));
const SalesPrediction = React.lazy(() => import('./SalesPrediction'));
import SmartSearchBar from '../components/SmartSearchBar';

const PageLoader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '8px', color: 'var(--text-muted, var(--muted))' }}>
        <Loader2 size={20} className="animate-spin" /> Loading...
    </div>
);

const Dashboard = () => {
    const { user, logout, updateUser } = useAuth();
    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileImage, setProfileImage] = useState(null);
    const [profilePreview, setProfilePreview] = useState('');
    const [profileSaving, setProfileSaving] = useState(false);
    const [cropState, setCropState] = useState(null);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [searchOpen, setSearchOpen] = useState(false);

    const fileBaseUrl = useMemo(() => API_URL.replace(/\/api$/, ''), []);

    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
    const closeSidebar = () => setSidebarOpen(false);

    const menuItems = [
        { name: 'Summary', icon: Grid, path: '/dashboard', roles: ['Admin'] },
        { name: 'Front Office', icon: Grid, path: '/dashboard', roles: ['Front Office'] },
        { name: 'Customers', icon: UserSquare, path: '/dashboard/customers', roles: ['Admin', 'Front Office'] },
        { name: 'Billing', icon: Receipt, path: '/dashboard/billing', roles: ['Front Office'] },
        { name: 'Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Front Office'] },
        { name: 'Customer Payments', icon: Receipt, path: '/dashboard/customer-payments', roles: ['Admin', 'Front Office'] },
        { name: 'Staff', icon: Users, path: '/dashboard/staff', roles: ['Front Office'] },
        { name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Front Office'] },
        { name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Front Office', 'Admin'] },
        { name: 'Staff Management', icon: Users, path: '/dashboard/staff', roles: ['Admin'] },
        { name: 'Branches', icon: Building2, path: '/dashboard/branches', roles: ['Admin'] },
        { name: 'Product Library', icon: Grid, path: '/dashboard/products', roles: ['Admin'] },
        { name: 'Jobs & Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Admin', 'Designer', 'Printer'] },
        { name: 'Attendance & Salary', icon: Receipt, path: '/dashboard/attendance-salary', roles: ['Designer', 'Printer', 'Front Office'] },
        { name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Admin'] },
        { name: 'Requests', icon: ShieldAlert, path: '/dashboard/requests', roles: ['Admin'] },
        { name: 'Machine Management', icon: Settings, path: '/dashboard/machines', roles: ['Admin', 'Front Office', 'Designer', 'Printer'] },
        { name: 'Daily Report', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Admin', 'Front Office'] },
        // Accountant-specific menu items
        { name: 'Dashboard', icon: Grid, path: '/dashboard', roles: ['Accountant'] },
        { name: 'Customers', icon: UserSquare, path: '/dashboard/customers', roles: ['Accountant'] },
        { name: 'Jobs & Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Accountant'] },
        { name: 'Staff Management', icon: Users, path: '/dashboard/staff', roles: ['Accountant'] },
        { name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Accountant'] },
        { name: 'Requests', icon: ShieldAlert, path: '/dashboard/requests', roles: ['Accountant'] },
        { name: 'Daily Report', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Accountant'] },
        // AI Features
        { name: 'AI Monitoring', icon: Brain, path: '/dashboard/ai-monitoring', roles: ['Admin'] },
        { name: 'Design Check', icon: FileCheck, path: '/dashboard/design-check', roles: ['Designer'] },
        { name: 'Paper Layout', icon: Layers, path: '/dashboard/paper-layout', roles: ['Front Office', 'Designer', 'Printer'] },
        { name: 'Sales Prediction', icon: TrendingUp, path: '/dashboard/sales-prediction', roles: ['Admin', 'Accountant'] },
    ];

    const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

    // Ctrl+K / Cmd+K to open smart search
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setSearchOpen(prev => !prev);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const fetchPendingCount = async () => {
        if (user?.role !== 'Admin' && user?.role !== 'Accountant') return;
        try {
            const response = await api.get('/requests/pending-count');
            setPendingRequestsCount(response.data.pending_count);
        } catch (err) {
            console.error('Failed to fetch pending requests count:', err);
        }
    };

    useEffect(() => {
        if (!showProfileModal) return;
        setProfileName(user?.name || '');
        setProfileImage(null);
        setProfilePreview(user?.image_url ? `${fileBaseUrl}${user.image_url}` : '');
    }, [showProfileModal, user, fileBaseUrl]);

    useEffect(() => {
        if (!profileImage) return;
        const url = URL.createObjectURL(profileImage);
        setProfilePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [profileImage]);

    const isAdminOrAccountant = user?.role === 'Admin' || user?.role === 'Accountant';
    usePolling(fetchPendingCount, 60000, isAdminOrAccountant);

    useEffect(() => {
        if (isAdminOrAccountant) {
            fetchPendingCount();

            const handleRefresh = () => fetchPendingCount();
            window.addEventListener('requestReviewed', handleRefresh);

            return () => {
                window.removeEventListener('requestReviewed', handleRefresh);
            };
        }
    }, [user]);

    const handleProfileSave = async (e) => {
        e.preventDefault();
        setProfileSaving(true);
        try {
            const formData = new FormData();
            formData.append('name', profileName);
            if (profileImage) formData.append('image', profileImage);
            const response = await api.put('/staff/me', formData);
            updateUser({
                ...user,
                name: response.data.name,
                image_url: response.data.image_url
            });
            setShowProfileModal(false);
        } catch (err) {
            import('react-hot-toast').then(m => m.default.error(err.response?.data?.message || 'Failed to update profile'));
        } finally {
            setProfileSaving(false);
        }
    };

    const handleRemoveProfileImage = async () => {
        const isConfirmed = await confirm({
            title: 'Remove Profile Photo',
            message: 'Remove your profile photo?',
            confirmText: 'Remove',
            type: 'danger'
        });
        if (!isConfirmed) return;
        setProfileSaving(true);
        try {
            await api.delete('/staff/me/image');
            updateUser({
                ...user,
                image_url: null
            });
            setProfileImage(null);
            setProfilePreview('');
        } catch (err) {
            import('react-hot-toast').then(m => m.default.error(err.response?.data?.message || 'Failed to remove profile photo'));
        } finally {
            setProfileSaving(false);
        }
    };

    const openCropper = (file) => {
        if (!file) return;
        setCropState({ file });
    };

    const DashboardHome = () => {
        if (!user?.role) return <Summary />;
        if (user.role === 'Admin') return <Summary />;
        if (user.role === 'Front Office') return <FrontOffice />;
        if (user.role === 'Accountant') return <AccountantDashboard />;
        return <Jobs />;
    };

    const handleCropCancel = () => {
        setCropState(null);
    };

    const handleCropComplete = (croppedFile) => {
        setProfileImage(croppedFile);
        setCropState(null);
    };

    return (
        <div className={`dashboard-layout ${sidebarCollapsed ? 'dashboard-layout--collapsed' : ''}`}>
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && <div className="modal-backdrop" onClick={closeSidebar} style={{ zIndex: 90 }}></div>}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${sidebarOpen ? 'sidebar--open' : ''}`}>
                <div className="sidebar-header">
                    <div className="row gap-sm items-center">
                        <img src={sargaLogo} alt="Sarga" className="logo-img" />
                        <span className="logo-text">SARGA</span>
                    </div>
                    <button
                        className="sidebar-toggle"
                        onClick={() => setSidebarCollapsed((prev) => !prev)}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {filteredMenu.map(item => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.path === '/dashboard'}
                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                            onClick={closeSidebar}
                        >
                            <div className="nav-item-inner">
                                <item.icon size={20} />
                                <span className="nav-label">{item.name}</span>
                                {item.name === 'Requests' && pendingRequestsCount > 0 && (
                                    <span className="side-badge">{pendingRequestsCount}</span>
                                )}
                            </div>
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div className="user-profile" onClick={() => setShowProfileModal(true)} role="button" tabIndex={0}>
                        <div className="user-avatar">
                            {user?.image_url ? (
                                <img src={`${fileBaseUrl}${user.image_url}`} alt={user.name} className="avatar-img" />
                            ) : (
                                user?.name ? user.name[0] : 'U'
                            )}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{user?.name || 'User'}</div>
                            <div className="user-role">{user?.role || 'Guest'}</div>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn--full mt-16" onClick={handleLogout} style={{ color: 'var(--error)' }}>
                        <LogOut size={18} className="mr-8" /> Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                {/* Mobile Topbar */}
                <div className="topbar mobile-only">
                    <button className="icon-button" onClick={toggleSidebar}>
                        <Grid size={20} />
                    </button>
                    <SmartSearchBar />
                    <div className="logo-text">SARGA</div>
                    <div className="user-avatar avatar-sm" onClick={() => setShowProfileModal(true)}>
                        {user?.image_url ? (
                            <img src={`${fileBaseUrl}${user.image_url}`} alt={user.name} className="avatar-img" />
                        ) : (
                            user?.name ? user.name[0] : 'U'
                        )}
                    </div>
                </div>

                {/* Desktop Content Topbar with Smart Search */}
                <div className="content-topbar">
                    <button className="smart-search-trigger" onClick={() => setSearchOpen(true)}>
                        <Search size={15} /> Search anything... <kbd>Ctrl K</kbd>
                    </button>
                </div>

                <div className="content-container">
                    <Suspense fallback={<PageLoader />}>
                        <Routes>
                            <Route path="" element={<DashboardHome />} />
                            <Route path="billing" element={<Billing />} />
                            <Route path="staff" element={<StaffManagement />} />
                            <Route path="employee/:staffId" element={<EmployeeDetail />} />
                            <Route path="branches" element={<Branches />} />
                            <Route path="customers" element={<Customers />} />
                            <Route path="customers/:id" element={<CustomerDetails />} />
                            <Route path="products" element={<ProductLibrary />} />
                            <Route path="jobs" element={<Jobs />} />
                            <Route path="jobs/:id" element={<JobDetail />} />
                            <Route path="requests" element={<IDChangeRequests />} />
                            <Route path="inventory" element={<Inventory />} />
                            <Route path="customer-payments" element={<CustomerPayments />} />
                            <Route path="expenses" element={<ExpenseManager />} />
                            <Route path="machines" element={<MachineManagement />} />
                            <Route path="daily-report" element={<DailyReport />} />
                            <Route path="attendance-salary" element={<AttendanceSalary />} />
                            <Route path="ai-monitoring" element={<AIMonitoring />} />
                            <Route path="design-check" element={<DesignChecker />} />
                            <Route path="paper-layout" element={<PaperLayoutGenerator />} />
                            <Route path="job-priority" element={<JobPriority />} />
                            <Route path="sales-prediction" element={<SalesPrediction />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                </div>
            </main>

            {/* Smart Search Overlay */}
            <SmartSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

            {showProfileModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '520px' }}>
                        <button className="modal-close" onClick={() => setShowProfileModal(false)}><ChevronRight size={18} /></button>
                        <h2 className="section-title mb-16">Edit Profile</h2>
                        <form onSubmit={handleProfileSave} className="stack-md">
                            <div className="row gap-md items-center">
                                <div className="user-avatar" style={{ width: '72px', height: '72px', borderRadius: '18px' }}>
                                    {profilePreview ? (
                                        <img src={profilePreview} alt="Profile" className="avatar-img" />
                                    ) : (
                                        profileName ? profileName[0] : 'U'
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className="label">Profile Photo</label>
                                    <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        className="input-field"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            if (file) openCropper(file);
                                            e.target.value = '';
                                        }}
                                    />
                                    {profilePreview && (
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm text-error mt-8"
                                            onClick={handleRemoveProfileImage}
                                            disabled={profileSaving}
                                        >
                                            Remove Photo
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    className="input-field"
                                    value={profileName}
                                    onChange={(e) => setProfileName(e.target.value)}
                                    required
                                />
                            </div>
                            <button type="submit" className="btn btn-primary btn--full" disabled={profileSaving}>
                                {profileSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <ImageCropModal
                file={cropState?.file || null}
                title="Crop Profile Photo"
                outputSize={512}
                onCancel={handleCropCancel}
                onComplete={handleCropComplete}
            />
        </div>
    );
};

export default Dashboard;

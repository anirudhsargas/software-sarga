import React, { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
    Users, ClipboardList, Box, ShieldAlert, Receipt, LogOut, Grid, UserSquare, Building2, ChevronLeft, ChevronRight, Settings, BookOpen, Loader2,
    Brain, Search, FileCheck, Layers, Zap, TrendingUp, Camera, X, Sparkles, ScanLine
} from 'lucide-react';
import useAuth from '../hooks/useAuth';
import api, { API_URL } from '../services/api';
import ImageCropModal from '../components/ImageCropModal';
import ScannerModal from '../components/ScannerModal';
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
const PaymentVerification = React.lazy(() => import('./PaymentVerification'));
const NotFound = React.lazy(() => import('./NotFound'));
const AIMonitoring = React.lazy(() => import('./AIMonitoring'));
const DesignChecker = React.lazy(() => import('./DesignChecker'));
const PaperLayoutGenerator = React.lazy(() => import('./PaperLayoutGenerator'));
const JobPriority = React.lazy(() => import('./JobPriority'));
const SalesPrediction = React.lazy(() => import('./SalesPrediction'));
const Accounts = React.lazy(() => import('./Accounts'));
const OrderPredictions = React.lazy(() => import('./OrderPredictions'));
const ProductionTracker = React.lazy(() => import('./ProductionTracker'));
const PlateManagement = React.lazy(() => import('./PlateManagement'));
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
    const [showInventoryScan, setShowInventoryScan] = useState(false);
    const [inventoryScanResult, setInventoryScanResult] = useState(null);
    const [inventoryScanLoading, setInventoryScanLoading] = useState(false);

    const fileBaseUrl = useMemo(() => API_URL.replace(/\/api\/?$/, ''), []);

    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
    const closeSidebar = () => setSidebarOpen(false);

    const menuItems = [
        { name: 'Summary', icon: Grid, path: '/dashboard', roles: ['Admin'], group: 'main' },
        { name: 'Front Office', icon: Grid, path: '/dashboard', roles: ['Front Office'], group: 'main' },
        { name: 'Customers', icon: UserSquare, path: '/dashboard/customers', roles: ['Admin', 'Front Office'], group: 'business' },
        { name: 'Billing', icon: Receipt, path: '/dashboard/billing', roles: ['Front Office'], group: 'business' },
        { name: 'Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Front Office'], group: 'business' },
        { name: 'Customer Payments', icon: Receipt, path: '/dashboard/customer-payments', roles: ['Admin', 'Front Office'], group: 'business' },
        { name: 'Staff', icon: Users, path: '/dashboard/staff', roles: ['Front Office'], group: 'manage' },
        { name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Front Office'], group: 'operations' },
        { name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Front Office'], group: 'business' },
        { name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Admin'], group: 'finance' },
        { name: 'Staff Management', icon: Users, path: '/dashboard/staff', roles: ['Admin'], group: 'manage' },
        { name: 'Branches', icon: Building2, path: '/dashboard/branches', roles: ['Admin'], group: 'manage' },
        { name: 'Product Library', icon: Grid, path: '/dashboard/products', roles: ['Admin'], group: 'operations' },
        { name: 'Jobs & Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Admin', 'Designer', 'Printer'], group: 'business' },
        { name: 'Plate Management', icon: Layers, path: '/dashboard/plates', roles: ['Designer', 'Admin'], group: 'operations' },
        { name: 'Attendance & Salary', icon: Receipt, path: '/dashboard/attendance-salary', roles: ['Designer', 'Printer', 'Front Office'], group: 'finance' },
        { name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Admin'], group: 'operations' },
        { name: 'Requests', icon: ShieldAlert, path: '/dashboard/requests', roles: ['Admin'], group: 'manage' },
        { name: 'Machine Management', icon: Settings, path: '/dashboard/machines', roles: ['Admin', 'Front Office', 'Designer', 'Printer'], group: 'operations' },
        { name: 'Daily Report', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Front Office'], group: 'business' },
        { name: 'Daily Report', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Admin'], group: 'operations' },
        // Accountant-specific menu items
        { name: 'Dashboard', icon: Grid, path: '/dashboard', roles: ['Accountant'] },
        { name: 'Payment Verification', icon: FileCheck, path: '/dashboard/payment-verification', roles: ['Accountant', 'Admin'], group: 'finance' },
        { name: 'Customers', icon: UserSquare, path: '/dashboard/customers', roles: ['Accountant'] },
        { name: 'Jobs & Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Accountant'] },
        { name: 'Staff Management', icon: Users, path: '/dashboard/staff', roles: ['Accountant'] },
        { name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Accountant'] },
        { name: 'Requests', icon: ShieldAlert, path: '/dashboard/requests', roles: ['Accountant'] },
        { name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Accountant'] },
        { name: 'Daily Report', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Accountant'] },
        { name: 'Accounts & GST', icon: Receipt, path: '/dashboard/accounts', roles: ['Accountant', 'Admin'], group: 'finance' },
        // AI Features
        { name: 'Design Check', icon: FileCheck, path: '/dashboard/design-check', roles: ['Designer'] },
        { name: 'Paper Layout', icon: Layers, path: '/dashboard/paper-layout', roles: ['Front Office', 'Designer', 'Printer'], group: 'operations' },
        { name: 'Production Tracker', icon: Layers, path: '/dashboard/production-tracker', roles: ['Admin', 'Front Office', 'Designer', 'Printer'], group: 'operations' },
    ];

    const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

    // Collapsible sidebar groups for Admin
    const sidebarGroupDefs = [
        { key: 'main', label: null },
        { key: 'business', label: 'Business' },
        { key: 'operations', label: 'Operations' },
        { key: 'finance', label: 'Finance' },
        { key: 'manage', label: 'Administration' },
        { key: 'analytics', label: 'Analytics' },
    ];

    const [collapsedGroups, setCollapsedGroups] = useState(() => {
        try {
            const saved = sessionStorage.getItem('sargaSidebarGroups');
            return saved ? new Set(JSON.parse(saved)) : new Set(['manage', 'analytics']);
        } catch { return new Set(['manage', 'analytics']); }
    });

    const toggleGroup = useCallback((groupKey) => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupKey)) next.delete(groupKey);
            else next.add(groupKey);
            sessionStorage.setItem('sargaSidebarGroups', JSON.stringify([...next]));
            return next;
        });
    }, []);

    const groupedMenu = useMemo(() => {
        if (!['Admin', 'Front Office'].includes(user?.role)) return null;
        return sidebarGroupDefs.map(g => ({
            ...g,
            items: filteredMenu.filter(i => i.group === g.key)
        })).filter(g => g.items.length > 0);
    }, [user?.role, filteredMenu]);

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

    // ── Global hardware barcode/QR scanner listener ──────────────────────────
    // Hardware scanners send characters very fast (< 50 ms apart) then Enter.
    // We accumulate keystrokes; if >= 3 chars arrive in < 100 ms total then
    // Enter is pressed, treat it as a scanner event rather than keyboard input.
    useEffect(() => {
        let buffer = '';
        let lastTime = 0;
        const TIMEOUT_MS = 100; // max gap between scanner chars

        const handleScannerKey = (e) => {
            // Ignore events that fire while an input/textarea/select is focused
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            // Ignore modifier-combos (Ctrl+K etc.)
            if (e.ctrlKey || e.metaKey || e.altKey) return;

            const now = Date.now();

            if (e.key === 'Enter') {
                const code = buffer.trim();
                buffer = '';
                lastTime = 0;
                if (code.length >= 3) {
                    // It's a scanner hit — look it up
                    handleInventoryScan(code);
                }
                return;
            }

            // Only accumulate printable single characters
            if (e.key.length === 1) {
                if (now - lastTime > TIMEOUT_MS) {
                    // Gap too large — reset buffer (human typing, not scanner)
                    buffer = '';
                }
                buffer += e.key;
                lastTime = now;
            }
        };

        document.addEventListener('keydown', handleScannerKey);
        return () => document.removeEventListener('keydown', handleScannerKey);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleInventoryScan = async (scannedCode) => {
        setShowInventoryScan(false);
        setInventoryScanLoading(true);
        setInventoryScanResult(null);
        try {
            const normalized = scannedCode.trim().toUpperCase();
            const { data: item } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`);
            setInventoryScanResult(item);
        } catch {
            import('react-hot-toast').then(m => m.default.error(`No inventory item found for: ${scannedCode.trim()}`));
        } finally {
            setInventoryScanLoading(false);
        }
    };

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
                        <img src="/icons/icon-192.png" alt="Sarga" className="logo-img" />
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
                    {['Admin', 'Front Office'].includes(user?.role) && groupedMenu ? (
                        groupedMenu.map(group => {
                            const showLabel = group.label && group.items.length > 1;
                            const isCollapsed = showLabel && collapsedGroups.has(group.key);
                            return (
                                <div key={group.key} className="sidebar-group">
                                    {showLabel && (
                                        <button
                                            className="sidebar-group-toggle"
                                            onClick={() => toggleGroup(group.key)}
                                        >
                                            <span className="sidebar-group-label">{group.label}</span>
                                            <ChevronRight size={14} className={`sidebar-group-chevron ${isCollapsed ? '' : 'sidebar-group-chevron--open'}`} />
                                        </button>
                                    )}
                                    {!isCollapsed && group.items.map(item => (
                                        <NavLink
                                            key={item.name}
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
                                </div>
                            );
                        })
                    ) : (
                        filteredMenu.map(item => (
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
                        ))
                    )}
                    {['Admin', 'Front Office', 'Accountant'].includes(user?.role) && (
                        <button
                            className="nav-item"
                            style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
                            onClick={() => { closeSidebar(); setShowInventoryScan(true); }}
                            title="Scan product QR code"
                        >
                            <div className="nav-item-inner">
                                <Camera size={20} />
                                <span className="nav-label">
                                    {inventoryScanLoading ? 'Looking up…' : 'Scan Item'}
                                </span>
                            </div>
                        </button>
                    )}
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
                    <div className="logo-text">SARGA</div>
                    <div className="user-avatar avatar-sm" onClick={() => setShowProfileModal(true)}>
                        {user?.image_url ? (
                            <img src={`${fileBaseUrl}${user.image_url}`} alt={user.name} className="avatar-img" />
                        ) : (
                            user?.name ? user.name[0] : 'U'
                        )}
                    </div>
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
                            <Route path="payment-verification" element={<PaymentVerification />} />
                            <Route path="expenses" element={<ExpenseManager />} />
                            <Route path="machines" element={<MachineManagement />} />
                            <Route path="daily-report" element={<DailyReport />} />
                            <Route path="attendance-salary" element={<AttendanceSalary />} />
                            <Route path="ai-monitoring" element={<AIMonitoring />} />
                            <Route path="design-check" element={<DesignChecker />} />
                            <Route path="paper-layout" element={<PaperLayoutGenerator />} />
                            <Route path="job-priority" element={<JobPriority />} />
                            <Route path="sales-prediction" element={<SalesPrediction />} />
                            <Route path="accounts" element={<Accounts />} />
                            <Route path="plates" element={<PlateManagement />} />
                            <Route path="order-predictions" element={<OrderPredictions />} />
                            <Route path="production-tracker" element={<ProductionTracker />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                </div>
            </main>

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
                            <button 
                                type="button" 
                                className="btn btn-ghost btn--full text-error"
                                onClick={() => {
                                    setShowProfileModal(false);
                                    logout();
                                }}
                            >
                                <LogOut size={16} /> Logout
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

            {/* Inventory QR Scanner */}
            <ScannerModal
                isOpen={showInventoryScan}
                onClose={() => setShowInventoryScan(false)}
                onScan={handleInventoryScan}
            />

            {/* Loading overlay when hardware scanner fires */}
            {inventoryScanLoading && (
                <div className="modal-backdrop" style={{ zIndex: 1002 }}>
                    <div className="modal" style={{ maxWidth: '300px', width: '90%', textAlign: 'center', padding: '32px 24px' }}>
                        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)', margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>Looking up item…</div>
                        <div className="muted" style={{ fontSize: '13px', marginTop: '4px' }}>Reading scanned code</div>
                    </div>
                </div>
            )}

            {/* Inventory Scan Result */}
            {inventoryScanResult && (
                <div className="modal-backdrop" style={{ zIndex: 1001 }}>
                    <div className="modal" style={{ maxWidth: '400px', width: '90%' }}>
                        <div className="row space-between items-center mb-16">
                            <h2 className="section-title">Product Details</h2>
                            <button className="icon-button" onClick={() => setInventoryScanResult(null)}><X size={20} /></button>
                        </div>
                        <div className="stack-md">
                            {/* SKU — prominently at the top */}
                            {inventoryScanResult.sku && (
                                <div style={{ background: 'var(--primary)', color: '#fff', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.85, whiteSpace: 'nowrap' }}>SKU</span>
                                    <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.04em', flex: 1 }}>{inventoryScanResult.sku}</span>
                                </div>
                            )}
                            <div className="row gap-md items-center">
                                {inventoryScanResult.image_url && (
                                    <img
                                        src={`${fileBaseUrl}${inventoryScanResult.image_url}`}
                                        alt={inventoryScanResult.name}
                                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border)' }}
                                    />
                                )}
                                <div>
                                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{inventoryScanResult.name}</div>
                                    {inventoryScanResult.category && (
                                        <div className="muted" style={{ fontSize: '13px', marginTop: '2px' }}>{inventoryScanResult.category}</div>
                                    )}
                                </div>
                            </div>
                            <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
                                <div style={{ flex: '1', minWidth: '90px', background: 'var(--surface)', borderRadius: '8px', padding: '10px 14px' }}>
                                    <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>MRP</div>
                                    <div style={{ fontWeight: 700, fontSize: '20px', color: 'var(--primary)' }}>₹{inventoryScanResult.mrp}</div>
                                </div>
                                <div style={{ flex: '1', minWidth: '90px', background: 'var(--surface)', borderRadius: '8px', padding: '10px 14px' }}>
                                    <div className="muted" style={{ fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>Qty Available</div>
                                    <div style={{ fontWeight: 700, fontSize: '20px', color: inventoryScanResult.quantity <= (inventoryScanResult.reorder_level || 0) ? 'var(--error)' : 'var(--success)' }}>
                                        {inventoryScanResult.quantity} {inventoryScanResult.unit || ''}
                                    </div>
                                </div>
                            </div>
                            {inventoryScanResult.hsn && (
                                <div style={{ fontSize: '13px' }}>
                                    <span className="muted">HSN: <strong>{inventoryScanResult.hsn}</strong></span>
                                </div>
                            )}
                        </div>
                        <button className="btn btn-ghost btn--full mt-16" onClick={() => setInventoryScanResult(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;

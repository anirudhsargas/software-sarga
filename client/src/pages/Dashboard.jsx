import React, { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
    Users, ClipboardList, Box, ShieldAlert, Receipt, LogOut, Grid, UserSquare, Building2, ChevronLeft, ChevronRight, Settings, BookOpen, Loader2,
    Brain, Search, FileCheck, Layers, Zap, TrendingUp, Camera, X, Sparkles, ScanLine, Package, Tag, Clock
} from 'lucide-react';
import useAuth from '../hooks/useAuth';
import api, { imgUrl } from '../services/api';
import RequiresConnection from '../components/RequiresConnection';
import SecureImage from '../components/SecureImage';
import ImageCropModal from '../components/ImageCropModal';
import ScannerModal from '../components/ScannerModal';
import { useConfirm } from '../contexts/ConfirmContext';
import { useLocation } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar';
import AnomalyPanel from '../components/AnomalyPanel';
import InsightsPanel from '../components/InsightsPanel';

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
const StockVerification = React.lazy(() => import('./StockVerification'));
const StockPlanning = React.lazy(() => import('./StockPlanning'));
const OtherStaffDashboard = React.lazy(() => import('./OtherStaffDashboard'));
const PrinterDashboard = React.lazy(() => import('./PrinterDashboard'));
const DesignerDashboard = React.lazy(() => import('./DesignerDashboard'));
const Reports = React.lazy(() => import('./Reports'));
const CouponManagement = React.lazy(() => import('./CouponManagement'));
const CCTVAttendance = React.lazy(() => import('./CCTVAttendance'));
const CCTVManagement = React.lazy(() => import('./CCTVManagement'));
const ScheduleManagement = React.lazy(() => import('./ScheduleManagement'));
const InternalUsageReport = React.lazy(() => import('./InternalUsageReport'));
const InternalTransfers = React.lazy(() => import('./InternalTransfers'));
const Quotes = React.lazy(() => import('./Quotes'));
const SettingsPage = React.lazy(() => import('./SettingsPage'));
const RecurringInvoices = React.lazy(() => import('./RecurringInvoices'));
const PageLoader = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '8px', color: 'var(--text-muted, var(--muted))' }}>
        <Loader2 size={20} className="animate-spin" /> Loading...
    </div>
);

const Dashboard = () => {
    const { user, logout, updateUser } = useAuth();
    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);

    // Show progress bar on location change
    useEffect(() => {
        setIsNavigating(true);
        const timer = setTimeout(() => setIsNavigating(false), 300);
        return () => clearTimeout(timer);
    }, [location.pathname]);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
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
    const [searchOpen, setSearchOpen] = useState(false);
    const [anomalyCount, setAnomalyCount] = useState(0);

    const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
    const closeSidebar = () => setSidebarOpen(false);

    // On tablets/phones, keep sidebar expanded so labels are always visible.
    useEffect(() => {
        const syncSidebarForViewport = () => {
            if (window.innerWidth <= 1023) {
                setSidebarCollapsed(false);
            }
        };

        syncSidebarForViewport();
        window.addEventListener('resize', syncSidebarForViewport);
        return () => window.removeEventListener('resize', syncSidebarForViewport);
    }, []);

    const menuItems = [
        // Main dashboards
        { name: 'Summary', icon: Grid, path: '/dashboard', roles: ['Admin'], group: 'main' },
        { name: 'Front Office', icon: Grid, path: '/dashboard', roles: ['Front Office'], group: 'main' },
        { name: 'Dashboard', icon: Grid, path: '/dashboard', roles: ['Accountant', 'Other Staff'] },
        // Business operations
        { name: 'Customers', icon: UserSquare, path: '/dashboard/customers', roles: ['Admin', 'Front Office', 'Accountant'], group: 'business' },
        { name: 'Billing', icon: Receipt, path: '/dashboard/billing', roles: ['Front Office'], group: 'business' },
        { name: 'Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Front Office'] },
        { name: 'Jobs & Orders', icon: ClipboardList, path: '/dashboard/jobs', roles: ['Admin', 'Accountant'], group: 'business' },
        { name: 'Customer Payments', icon: Receipt, path: '/dashboard/customer-payments', roles: ['Admin', 'Front Office'], group: 'business' },
        // Inventory & Operations
        { name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Admin', 'Front Office', 'Accountant'], group: 'operations' },
        { name: 'Stock Verification', icon: Box, path: '/dashboard/stock-verification', roles: ['Accountant', 'Admin'], group: 'operations' },
        { name: 'Stock Planning', icon: Package, path: '/dashboard/stock-planning', roles: ['Admin', 'Front Office', 'Accountant'], group: 'operations' },
        { name: 'Product Library', icon: Grid, path: '/dashboard/products', roles: ['Admin', 'Front Office', 'Designer'], group: 'operations' },
        { name: 'Plate Management', icon: Layers, path: '/dashboard/plates', roles: ['Designer', 'Admin'], group: 'operations' },
        { name: 'Machine Management', icon: Settings, path: '/dashboard/machines', roles: ['Admin', 'Front Office'], group: 'operations' },
        { name: 'Paper Layout', icon: Layers, path: '/dashboard/paper-layout', roles: ['Front Office', 'Designer'], group: 'operations' },
        { name: 'Production Tracker', icon: Layers, path: '/dashboard/production-tracker', roles: ['Admin', 'Front Office'], group: 'operations' },
        // Staff & HR
        { name: 'Staff', icon: Users, path: '/dashboard/staff', roles: ['Front Office'], group: 'manage' },
        { name: 'Staff Management', icon: Users, path: '/dashboard/staff', roles: ['Admin', 'Accountant'], group: 'manage' },
        { name: 'Branches', icon: Building2, path: '/dashboard/branches', roles: ['Admin'], group: 'manage' },
        { name: 'Requests', icon: ShieldAlert, path: '/dashboard/requests', roles: ['Admin', 'Accountant'], group: 'manage' },
        { name: 'Coupons', icon: Tag, path: '/dashboard/coupons', roles: ['Admin'], group: 'manage' },
        { name: 'CCTV Attendance', icon: Camera, path: '/dashboard/cctv-attendance', roles: ['Admin', 'Accountant'], group: 'manage' },
        { name: 'CCTV Management', icon: Camera, path: '/dashboard/cctv-management', roles: ['Admin'], group: 'manage' },
        { name: 'Schedules & Time', icon: Clock, path: '/dashboard/schedules', roles: ['Admin', 'Accountant'], group: 'manage' },
        // Finance & Reports
        { name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Admin', 'Front Office', 'Accountant'], group: 'finance' },
        { name: 'Payment Verification', icon: FileCheck, path: '/dashboard/payment-verification', roles: ['Accountant', 'Admin'], group: 'finance' },
        { name: 'Accounts & GST', icon: Receipt, path: '/dashboard/accounts', roles: ['Accountant', 'Admin'], group: 'finance' },
        { name: 'Daily Report', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Front Office', 'Admin', 'Accountant'], group: 'business' },
        { name: 'Internal Usage Report', icon: BookOpen, path: '/dashboard/internal-usage-report', roles: ['Admin', 'Accountant'], group: 'business' },
        { name: 'Internal Transfers', icon: BookOpen, path: '/dashboard/internal-transfers', roles: ['Admin', 'Accountant', 'Front Office'], group: 'finance' },
        // AI Features
        { name: 'Design Check', icon: FileCheck, path: '/dashboard/design-check', roles: ['Designer'] },
        { name: 'Sales Prediction', icon: TrendingUp, path: '/dashboard/sales-prediction', roles: ['Admin', 'Accountant'], group: 'business' },
        { name: 'Seasonal Reports', icon: TrendingUp, path: '/dashboard/reports', roles: ['Admin', 'Accountant'], group: 'business' },
        // Role-specific dashboards
        { name: 'Assigned Jobs', icon: ClipboardList, path: '/dashboard/designer-dashboard', roles: ['Designer'], group: 'business' },
        { name: 'Assigned Jobs', icon: ClipboardList, path: '/dashboard/printer-dashboard', roles: ['Printer'], group: 'business' },
        // ERP Features
        { name: 'Quotes & Estimates', icon: Receipt, path: '/dashboard/quotes', roles: ['Admin', 'Front Office', 'Accountant'], group: 'business' },
        { name: 'Recurring Invoices', icon: ClipboardList, path: '/dashboard/recurring-invoices', roles: ['Admin', 'Accountant'], group: 'finance' },
        { name: 'Settings', icon: Settings, path: '/dashboard/settings', roles: ['Admin'], group: 'manage' },
    ];

    const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

    // Collapsible sidebar groups for Admin
    const sidebarGroupDefs = [
        { key: 'main', label: null },
        { key: 'business', label: 'Business' },
        { key: 'finance', label: 'Finance' },
        { key: 'manage', label: 'Administration' },
        { key: 'analytics', label: 'Analytics' },
        { key: 'operations', label: 'Operations' },
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
        navigate('/login', { replace: true });
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
        setProfilePreview('');
    }, [showProfileModal, user]);

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

    // Fetch anomaly count for header badge (Admin / Accountant / Front Office)
    useEffect(() => {
        if (!['Admin', 'Accountant', 'Front Office'].includes(user?.role)) return;
        let cancelled = false;
        const fetchCount = async () => {
            try {
                const res = await api.get('ai/anomalies');
                if (!cancelled) setAnomalyCount(res.data?.anomalies?.length || 0);
            } catch { /* ignore */ }
        };
        fetchCount();
        const interval = setInterval(fetchCount, 5 * 60 * 1000);
        return () => { cancelled = true; clearInterval(interval); };
    }, [user?.role]);

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
        if (user.role === 'Other Staff') return <OtherStaffDashboard />;
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
            <ProgressBar active={isNavigating} />
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} aria-hidden="true"></div>}

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
                        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
                                    {(!isCollapsed || sidebarCollapsed) && group.items.map(item => (
                                        <NavLink
                                            key={item.name}
                                            to={item.path}
                                            end={item.path === '/dashboard'}
                                            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                                            onClick={closeSidebar}
                                            title={item.name}
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
                                title={item.name}
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
                    <div className="user-profile" onClick={() => setShowProfilePanel(true)} role="button" tabIndex={0}>
                        <div className="user-avatar">
                            {user?.image_url ? (
                                <SecureImage src={user.image_url} alt={user.name} className="avatar-img" />
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
                    <button className="icon-button" aria-label="Open navigation menu" onClick={toggleSidebar}>
                        <Grid size={20} />
                    </button>
                    <div className="logo-text">SARGA</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {anomalyCount > 0 && ['Admin', 'Accountant', 'Front Office'].includes(user?.role) && (
                            <span style={{
                                background: 'var(--error)', color: 'var(--on-accent)', borderRadius: '999px',
                                fontSize: '11px', fontWeight: 700, padding: '2px 7px',
                                lineHeight: '16px', minWidth: '20px', textAlign: 'center',
                            }} title={`${anomalyCount} anomalies detected`}>
                                {anomalyCount > 99 ? '99+' : anomalyCount}
                            </span>
                        )}
                        <div className="user-avatar avatar-sm" onClick={() => setShowProfilePanel(true)}>
                            {user?.image_url ? (
                                <SecureImage src={user.image_url} alt={user.name} className="avatar-img" />
                            ) : (
                                user?.name ? user.name[0] : 'U'
                            )}
                        </div>
                    </div>
                </div>



                {/* AI Panels */}
                {['Admin', 'Accountant', 'Front Office'].includes(user?.role) && (
                    <div style={{ padding: '16px 16px 0' }}>
                        <InsightsPanel />
                        <AnomalyPanel />
                    </div>
                )}

                <div className={`content-container ${isNavigating ? 'page-enter' : 'page-enter-active'}`} key={location.pathname}>
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
                            <Route path="stock-verification" element={<StockVerification />} />
                            <Route path="stock-planning" element={<RequiresConnection feature="Stock Planning"><StockPlanning /></RequiresConnection>} />
                            <Route path="customer-payments" element={<CustomerPayments />} />
                            <Route path="payment-verification" element={<PaymentVerification />} />
                            <Route path="expenses" element={<ExpenseManager />} />
                            <Route path="machines" element={<MachineManagement />} />
                            <Route path="daily-report" element={<DailyReport />} />
                            <Route path="internal-usage-report" element={<InternalUsageReport />} />
                            <Route path="internal-transfers" element={<InternalTransfers />} />
                            <Route path="attendance-salary" element={<AttendanceSalary />} />
                            <Route path="ai-monitoring" element={<RequiresConnection feature="AI Monitoring"><AIMonitoring /></RequiresConnection>} />
                            <Route path="design-check" element={<RequiresConnection feature="Design Checker"><DesignChecker /></RequiresConnection>} />
                            <Route path="paper-layout" element={<RequiresConnection feature="Paper Layout Generator"><PaperLayoutGenerator /></RequiresConnection>} />
                            <Route path="job-priority" element={<JobPriority />} />
                            <Route path="sales-prediction" element={<RequiresConnection feature="Sales Prediction"><SalesPrediction /></RequiresConnection>} />
                            <Route path="accounts" element={<RequiresConnection feature="Accounts & GST"><Accounts /></RequiresConnection>} />
                            <Route path="plates" element={<PlateManagement />} />
                            <Route path="order-predictions" element={<RequiresConnection feature="Order Predictions"><OrderPredictions /></RequiresConnection>} />
                            <Route path="production-tracker" element={<RequiresConnection feature="Production Tracker"><ProductionTracker /></RequiresConnection>} />
                            <Route path="reports" element={<RequiresConnection feature="Seasonal Reports"><Reports /></RequiresConnection>} />
                            <Route path="coupons" element={<CouponManagement />} />
                            <Route path="cctv-attendance" element={<CCTVAttendance />} />
                            <Route path="cctv-management" element={<CCTVManagement />} />
                            <Route path="schedules" element={<ScheduleManagement />} />
                            <Route path="other-staff-dashboard" element={<OtherStaffDashboard />} />
                            <Route path="printer-dashboard" element={<PrinterDashboard />} />
              <Route path="designer-dashboard" element={<DesignerDashboard />} />
                            <Route path="quotes" element={<Quotes />} />
                            <Route path="recurring-invoices" element={<RecurringInvoices />} />
                            <Route path="settings" element={<SettingsPage />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </Suspense>
                </div>
            </main>

            {showProfilePanel && (
                <div className="modal-backdrop" style={{ zIndex: 1003 }}>
                    <div className="modal" style={{ maxWidth: '660px', width: '95%', maxHeight: '90vh', overflowY: 'auto', padding: 0 }}>
                        {/* Profile Header */}
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, background: 'var(--surface, #1e1e2e)', zIndex: 1 }}>
                            <div className="user-avatar" style={{ width: 64, height: 64, borderRadius: 16, fontSize: 24, flexShrink: 0 }}>
                                {user?.image_url ? (
                                    <SecureImage src={user.image_url} alt={user.name} className="avatar-img" />
                                ) : (
                                    user?.name ? user.name[0].toUpperCase() : 'U'
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name || 'User'}</div>
                                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{user?.role || 'Guest'}</div>
                            </div>
                            <button
                                className="btn btn-primary btn-sm"
                                style={{ flexShrink: 0 }}
                                onClick={() => { setShowProfilePanel(false); setShowProfileModal(true); }}
                            >
                                Edit Profile
                            </button>
                            <button className="modal-close" style={{ position: 'static', margin: 0 }} aria-label="Close profile panel" onClick={() => setShowProfilePanel(false)} title="Close"><X size={20} /></button>
                        </div>
                        {/* Attendance & Salary for staff roles */}
                        {['Designer', 'Printer', 'Front Office', 'Other Staff'].includes(user?.role) && (
                            <div style={{ padding: '20px 16px' }}>
                                <Suspense fallback={<PageLoader />}>
                                    <AttendanceSalary />
                                </Suspense>
                            </div>
                        )}
                        {!['Designer', 'Printer', 'Front Office', 'Other Staff'].includes(user?.role) && (
                            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                                Click <strong>Edit Profile</strong> to update your name or photo.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showProfileModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '520px' }}>
                        <button className="modal-close" aria-label="Close profile modal" onClick={() => setShowProfileModal(false)} title="Close"><X size={20} /></button>
                        <h2 className="section-title mb-16">Edit Profile</h2>
                        <form onSubmit={handleProfileSave} className="stack-md">
                            <div className="row gap-md items-center">
                                <div className="user-avatar" style={{ width: '72px', height: '72px', borderRadius: '18px' }}>
                                    {profileImage ? (
                                        <img src={profilePreview} alt="Profile" className="avatar-img" />
                                    ) : user?.image_url ? (
                                        <SecureImage src={user.image_url} alt="Profile" className="avatar-img" />
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
                                    {(user?.image_url || profileImage) && (
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
                            <button className="icon-button" aria-label="Close product details" onClick={() => setInventoryScanResult(null)}><X size={20} /></button>
                        </div>
                        <div className="stack-md">
                            {/* SKU — prominently at the top */}
                            {inventoryScanResult.sku && (
                                <div style={{ background: 'var(--primary)', color: 'var(--on-accent)', borderRadius: '8px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '11px', textTransform: 'uppercase', opacity: 0.85, whiteSpace: 'nowrap' }}>SKU</span>
                                    <span style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '0.04em', flex: 1 }}>{inventoryScanResult.sku}</span>
                                </div>
                            )}
                            <div className="row gap-md items-center">
                                {inventoryScanResult.image_url && (
                                    <SecureImage
                                        src={inventoryScanResult.image_url}
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

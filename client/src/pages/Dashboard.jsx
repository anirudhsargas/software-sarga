import React, { useEffect, useMemo, useState, Suspense, useCallback, useRef } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import usePolling from '../hooks/usePolling';
import { Routes, Route, NavLink, useNavigate, Navigate, useParams, useLocation } from 'react-router-dom';
import {
    Users, ClipboardList, Box, ShieldAlert, Shield, Receipt, LogOut, Grid, UserSquare, Building2, ChevronLeft, ChevronRight, Settings, BookOpen, Loader2, Store, BarChart3,
    Search, FileCheck, Layers, Zap, TrendingUp, Camera, X, Sparkles, ScanLine, Package, Tag, Clock, FileText, Upload,
    Layout, Menu, Database, Award, Lock, Monitor, Sun, Moon, Calculator
} from 'lucide-react';
import useAuth from '../hooks/useAuth';
import SidebarThemeToggle from '../components/SidebarThemeToggle';
import api, {} from '../services/api';
import RequiresConnection from '../components/RequiresConnection';
const ImageCropModal = lazyWithRetry(() => import('../components/ImageCropModal'));
const ScannerModal = lazyWithRetry(() => import('../components/ScannerModal'));
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import ErrorBoundary from '../components/ErrorBoundary';
import { useConfirm } from '../contexts/ConfirmContext';
import { useTheme } from '../theme/ThemeProvider';
const PaperSidePanel = lazyWithRetry(() => import('../components/PaperSidePanel'));
const SmartSearch = lazyWithRetry(() => import('../components/SmartSearch'));
import SkeletonLoader from '../components/SkeletonLoader';
import ProgressBar from '../components/ProgressBar';
import SecureImage from '../components/SecureImage';
import Button from '../components/Button';
import BranchSelect from '../components/ui/BranchSelect';
import useTranslation from '../hooks/useTranslation';
import { useBranches } from '../contexts/BranchContext';
import PermissionDeniedState from '../components/PermissionDeniedState';
import '../styles/profile-edit.css';
import '../styles/dashboard-redesign.css';

// Lazy-loaded pages — each becomes a separate chunk
const StaffManagement = lazyWithRetry(() => import('./StaffManagement'));
const EmployeeDetail = lazyWithRetry(() => import('./EmployeeDetail'));
const Customers = lazyWithRetry(() => import('./Customers'));
const CustomerDetails = lazyWithRetry(() => import('./CustomerDetails'));
const Jobs = lazyWithRetry(() => import('./Jobs'));
const JobDetail = lazyWithRetry(() => import('./JobDetail'));
const ProductLibrary = lazyWithRetry(() => import('./ProductLibrary'));
const ProductRequests = lazyWithRetry(() => import('./ProductRequests'));
const IDChangeRequests = lazyWithRetry(() => import('./Requests'));
const Inventory = lazyWithRetry(() => import('./Inventory'));
const InventoryOverview = lazyWithRetry(() => import('./InventoryOverview'));
const Branches = lazyWithRetry(() => import('./Branches'));
const CustomerPayments = lazyWithRetry(() => import('./CustomerPayments'));
const Summary = lazyWithRetry(() => import('./Summary'));
const FrontOffice = lazyWithRetry(() => import('./FrontOffice'));
const ExpenseManager = lazyWithRetry(() => import('./ExpenseManager'));
const Vendors = lazyWithRetry(() => import('./Vendors'));
const MachineManagement = lazyWithRetry(() => import('./MachineManagement'));
const DailyReport = lazyWithRetry(() => import('./DailyReport'));
const AttendanceSalary = lazyWithRetry(() => import('./AttendanceSalary'));
const AccountantDashboard = lazyWithRetry(() => import('./AccountantDashboard'));
const PaymentVerification = lazyWithRetry(() => import('./PaymentVerification'));
const NotFound = lazyWithRetry(() => import('./NotFound'));
const AIMonitoring = lazyWithRetry(() => import('./AIMonitoring'));
const DesignChecker = lazyWithRetry(() => import('./DesignChecker'));
const PaperLayoutGenerator = lazyWithRetry(() => import('./PaperLayoutGenerator'));
const JobPriority = lazyWithRetry(() => import('./JobPriority'));
const Accounts = lazyWithRetry(() => import('./Accounts'));
const ProductionTracker = lazyWithRetry(() => import('./ProductionTracker'));
const PlateManagement = lazyWithRetry(() => import('./PlateManagement'));
const StockVerification = lazyWithRetry(() => import('./StockVerification'));
const OtherStaffDashboard = lazyWithRetry(() => import('./OtherStaffDashboard'));
const PrinterDashboard = lazyWithRetry(() => import('./PrinterDashboard'));
const DesignerDashboard = lazyWithRetry(() => import('./DesignerDashboard'));
const CouponManagement = lazyWithRetry(() => import('./CouponManagement'));
const CCTVAttendance = lazyWithRetry(() => import('./CCTVAttendance'));
const CCTVManagement = lazyWithRetry(() => import('./CCTVManagement'));
const Reports = lazyWithRetry(() => import('./Reports'));
const ScheduleManagement = lazyWithRetry(() => import('./ScheduleManagement'));
const Invoices = lazyWithRetry(() => import('./Invoices'));
const SalesLayout = lazyWithRetry(() => import('./SalesLayout'));
const InternalTransfers = lazyWithRetry(() => import('./InternalTransfers'));
const StockTransfer = lazyWithRetry(() => import('./StockTransfer'));
const ConsumablesManagement = lazyWithRetry(() => import('./ConsumablesManagement'));
const PaperStockDashboard = lazyWithRetry(() => import('./PaperStockDashboard'));
const PaperInward = lazyWithRetry(() => import('./PaperInward'));
const PaperOutward = lazyWithRetry(() => import('./PaperOutward'));
const PaperMovementHistory = lazyWithRetry(() => import('./PaperMovementHistory'));
const PaperAlerts = lazyWithRetry(() => import('./PaperAlerts'));
const PaperTransfer = lazyWithRetry(() => import('./PaperTransfer'));
const CutTransfer = lazyWithRetry(() => import('./CutTransfer'));
const PendingTransfers = lazyWithRetry(() => import('./PendingTransfers'));
const Quotes = lazyWithRetry(() => import('./Quotes'));
const ScanItem = lazyWithRetry(() => import('./ScanItem'));
const SettingsPage = lazyWithRetry(() => import('./SettingsPage'));
const BackupSettingsPage = lazyWithRetry(() => import('./BackupSettingsPage'));
const UploadBills = lazyWithRetry(() => import('./UploadBills'));
const RecurringInvoices = lazyWithRetry(() => import('./RecurringInvoices'));
const CreateInvoice = lazyWithRetry(() => import('./CreateInvoice'));
const ConnectionLedger = lazyWithRetry(() => import('./ConnectionLedger'));
const ChatbotTraining = lazyWithRetry(() => import('./admin/ChatbotTraining'));
const WebInquiries = lazyWithRetry(() => import('./WebInquiries'));
const ReviewsManagement = lazyWithRetry(() => import('./admin/ReviewsManagement'));
const BlogCMS = lazyWithRetry(() => import('./BlogCMS'));
const ArtworkManager = lazyWithRetry(() => import('./admin/ArtworkManager'));
const PortfolioManager = lazyWithRetry(() => import('./admin/PortfolioManager'));
const PromotionsManager = lazyWithRetry(() => import('./admin/PromotionsManager'));
const PickupBookings = lazyWithRetry(() => import('./admin/PickupBookings'));
const DeliveryRulesManager = lazyWithRetry(() => import('./admin/DeliveryRulesManager'));
const TranslationsManager = lazyWithRetry(() => import('./admin/TranslationsManager'));
const SampleRequestsCMS = lazyWithRetry(() => import('./SampleRequestsCMS'));
const DesignBookingsCMS = lazyWithRetry(() => import('./DesignBookingsCMS'));
const AccessRestricted = lazyWithRetry(() => import('./AccessRestricted'));
const ShortcutsPage = lazyWithRetry(() => import('./ShortcutsPage'));
const AuditTrail = lazyWithRetry(() => import('./admin/AuditTrail'));
const AuditDashboard = lazyWithRetry(() => import('./admin/AuditDashboard'));


const PageLoader = React.memo(() => (
    <div className="page-loader">
        <Loader2 size={20} className="animate-spin" /> Loading...
    </div>
));

const SuspenseFallback = () => {
    const location = useLocation();
    const path = location.pathname || '';

    // Jobs/Orders table skeleton
    if (path.includes('/dashboard/jobs') || path.includes('/dashboard/sales/orders')) {
        const cols = [
            { key: 'jobDetails', header: 'Job Details', width: '2fr', lines: 2 },
            { key: 'customer', header: 'Customer', width: '1.5fr', lines: 2 },
            { key: 'branch', header: 'Branch', width: '1fr' },
            { key: 'status', header: 'Status', width: '1fr', pill: true },
            { key: 'production', header: 'Production', width: '1fr', lines: 2 },
            { key: 'delivery', header: 'Delivery', width: '1fr' },
            { key: 'actions', header: 'Actions', width: '0.8fr' }
        ];
        return (
            <div className="skeleton-wrapper skeleton-wrapper--table">
                <SkeletonLoader type="table" count={6} columns={cols} />
            </div>
        );
    }

    // Customers list skeleton
    if (path.includes('/dashboard/customers') || path.includes('/dashboard/sales/customers')) {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--list">
                <SkeletonLoader type="customer-list" count={8} />
            </div>
        );
    }

    // Billing / invoice creation skeleton
    if (path.includes('/dashboard/billing') || path.includes('/dashboard/sales/invoices')) {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--table">
                <SkeletonLoader type="form" />
            </div>
        );
    }

    // Quotes and Payments table skeleton
    if (path.includes('/dashboard/sales/quotes') || path.includes('/dashboard/sales/payments')) {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--table">
                <SkeletonLoader type="table" count={6} />
            </div>
        );
    }

    // Inventory list skeleton
    if (path.includes('/dashboard/inventory')) {
        const cols = [
            { key: 'select', header: '', width: '0.3fr' },
            { key: 'item', header: 'Item', width: '2fr', lines: 2 },
            { key: 'category', header: 'Category', width: '1.2fr' },
            { key: 'stock', header: 'Stock', width: '1fr' },
            { key: 'cost', header: 'Cost', width: '1fr' },
            { key: 'price', header: 'Price', width: '1fr' },
            { key: 'status', header: 'Status', width: '1fr', pill: true },
            { key: 'actions', header: 'Actions', width: '1.2fr' }
        ];
        return (
            <div className="skeleton-wrapper skeleton-wrapper--table">
                <SkeletonLoader type="table" count={6} columns={cols} />
            </div>
        );
    }

    // Shortcuts page skeleton
    if (path.includes('/dashboard/shortcuts')) {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--list">
                <SkeletonLoader type="cards" count={6} />
            </div>
        );
    }

    // Default dashboard home skeleton
    if (path === '/dashboard' || path === '/dashboard/') {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--list">
                <SkeletonLoader type="cards" count={4} />
            </div>
        );
    }

    return <PageLoader />;
};

const DashboardHome = React.memo(() => {
    const { user } = useAuth();
    if (!user?.role) return <Summary />;
    if (user.role === 'Admin') return <Summary />;
    if (user.role === 'Front Office') return <FrontOffice />;
    if (user.role === 'Accountant') return <AccountantDashboard />;
    if (user.role === 'Other Staff') return <OtherStaffDashboard />;
    if (user.role === 'Designer') return <DesignerDashboard />;
    return <Jobs />;
});

const SidebarNavItem = React.memo(({ item, closeSidebar, pendingRequestsCount, onAction }) => {
    if (item.action === 'scanner') {
        return (
            <button
                className="nav-item"
                onClick={() => { closeSidebar(); onAction?.('scanner'); }}
                title={item.name}
                aria-label={item.name}
            >
                <div className="nav-item-inner">
                    <Camera size={20} aria-hidden="true" />
                    <span className="nav-label">{item.name}</span>
                </div>
            </button>
        );
    }

    return (
        <NavLink
            to={item.path}
            end={item.path === '/dashboard'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeSidebar}
            title={item.name}
            aria-label={item.name}
        >
            <div className="nav-item-inner">
                <item.icon size={20} aria-hidden="true" />
                <span className="nav-label">{item.name}</span>
                {item.name === 'Requests' && pendingRequestsCount > 0 && (
                    <span className="side-badge">{pendingRequestsCount}</span>
                )}
            </div>
        </NavLink>
    );
});

const SidebarGroup = React.memo(({ group, isCollapsed, sidebarCollapsed, toggleGroup, closeSidebar, pendingRequestsCount, onAction }) => {
    const location = useLocation();
    const showLabel = group.label && group.items.length > 1;
    const GroupIcon = group.icon;
    const hasActiveChild = group.items?.some(item => {
        const p = item.path;
        if (p === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/dashboard/';
        return location.pathname.startsWith(p);
    });

    if (!showLabel) {
        return group.items?.map(item => (
            <SidebarNavItem key={item.name} item={item} closeSidebar={closeSidebar} pendingRequestsCount={pendingRequestsCount} onAction={onAction} />
        ));
    }

    return (
        <div className={`sidebar-group ${sidebarCollapsed ? 'sidebar-group--collapsed' : ''}`}>
            <button
                className={`sidebar-group-toggle${hasActiveChild ? ' active' : ''}`}
                onClick={() => !sidebarCollapsed && toggleGroup(group.key)}
                title={group.label}
                aria-label={group.label}
            >
                <div className="nav-item-inner">
                    <GroupIcon size={20} aria-hidden="true" />
                    <span className="nav-label">{group.label}</span>
                </div>
                {!sidebarCollapsed && (
                    <ChevronRight size={14} className={`sidebar-group-chevron ${isCollapsed ? '' : 'sidebar-group-chevron--open'}`} aria-hidden="true" />
                )}
            </button>
            <div className="sidebar-group-items" style={{ display: (isCollapsed || sidebarCollapsed) ? 'none' : 'block' }}>
                {group.items.map(item => (
                    <SidebarNavItem key={item.name} item={item} closeSidebar={closeSidebar} pendingRequestsCount={pendingRequestsCount} onAction={onAction} />
                ))}
            </div>
        </div>
    );
});

const SimpleNavItem = React.memo(({ item, closeSidebar, pendingRequestsCount }) => (
    <NavLink
        to={item.path}
        end={item.path === '/dashboard'}
        className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        onClick={closeSidebar}
        title={item.name}
        aria-label={item.name}
    >
        <div className="nav-item-inner">
            <item.icon size={20} aria-hidden="true" />
            <span className="nav-label">{item.name}</span>
            {item.name === 'Requests' && pendingRequestsCount > 0 && (
                <span className="side-badge">{pendingRequestsCount}</span>
            )}
        </div>
    </NavLink>
));

const sidebarGroupDefs = [
    { key: 'main', label: null, icon: Grid },
    { key: 'sales', label: 'Sales', icon: TrendingUp },
    { key: 'accounts', label: 'Accounts', icon: Receipt },
    { key: 'inventory', label: 'Inventory', icon: Package },
    { key: 'production', label: 'Production', icon: Zap },
    { key: 'branch-ops', label: 'Branch Operations', icon: Building2 },
    { key: 'admin', label: 'Administration', icon: ShieldAlert },
];

const NavigateToJobDetail = () => {
    const { id } = useParams();
    return <Navigate to={`/dashboard/sales/orders/${id}`} replace />;
};

const NavigateToCustomerDetails = () => {
    const { id } = useParams();
    return <Navigate to={`/dashboard/sales/customers/${id}`} replace />;
};

const ProtectedSubRoute = ({ children, roles }) => {
    const { user } = useAuth();
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    const normalizedUserRole = user.role;
    if (roles && !roles.map(r => r.toLowerCase().trim()).includes(normalizedUserRole?.toLowerCase().trim())) {
        return <PermissionDeniedState />;
    }
    return children;
};

const Dashboard = () => {
    const { user, logout, updateUser } = useAuth();
    const normalizedUserRole = useMemo(() => {
        const role = user?.role;
        if (!role) return '';
        const map = {
            'admin': 'Admin',
            'front office': 'Front Office',
            'designer': 'Designer',
            'printer': 'Printer',
            'accountant': 'Accountant',
            'other staff': 'Other Staff'
        };
        return map[role.toLowerCase().trim()] || role;
    }, [user?.role]);

    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const location = useLocation();
    const { branches, assignedBranches, selectedBranchId, selectBranch } = useBranches();
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
        try {
            const saved = localStorage.getItem('sargaSidebarCollapsed');
            return saved ? JSON.parse(saved) : false;
        } catch {
            return false;
        }
    });

    const toggleSidebarCollapsed = useCallback(() => {
        setSidebarCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem('sargaSidebarCollapsed', JSON.stringify(next));
            } catch (e) {
                console.error('Error saving sidebar state:', e);
            }
            return next;
        });
    }, []);

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
    const [profileTab, setProfileTab] = useState('profile');
    const { theme, setTheme, _resolvedTheme } = useTheme();
    const [preferences, setPreferences] = useState(() => {
        try {
            const saved = localStorage.getItem('user_preferences');
            return saved ? JSON.parse(saved) : { notifications: true };
        } catch { return { notifications: true }; }
    });
    const [cropState, setCropState] = useState(null);
    const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
    const [showInventoryScan, setShowInventoryScan] = useState(false);
    const scannerOpenRef = useRef(false);
    useEffect(() => { scannerOpenRef.current = showInventoryScan; }, [showInventoryScan]);
    const [inventoryScanResult, setInventoryScanResult] = useState(null);
    const [inventoryScanLoading, setInventoryScanLoading] = useState(false);
    const [showPaperPanel, setShowPaperPanel] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [anomalyCount, setAnomalyCount] = useState(0);
    const [companyInfo, setCompanyInfo] = useState({ name: 'SARGA', logo: null });

    const sidebarRef = useRef(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    // Toggle sidebar collapsed via "[" key shortcut
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === '[') {
                const tag = document.activeElement?.tagName;
                if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
                    e.preventDefault();
                    toggleSidebarCollapsed();
                }
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [toggleSidebarCollapsed]);

    // Lock body background scroll on mobile/tablet when drawer is open
    useEffect(() => {
        if (sidebarOpen && window.innerWidth < 1024) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [sidebarOpen]);

    // Focus trap inside sidebar drawer on mobile/tablet when opened
    useEffect(() => {
        if (!sidebarOpen || window.innerWidth >= 1024) return;
        const sidebarEl = sidebarRef.current;
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
                if (document.activeElement === first) {
                    last.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === last) {
                    first.focus();
                    e.preventDefault();
                }
            }
        };

        sidebarEl.addEventListener('keydown', handleTab);
        if (first) first.focus();

        return () => {
            sidebarEl.removeEventListener('keydown', handleTab);
        };
    }, [sidebarOpen]);

    // Auto-close mobile/tablet drawer on navigation when below desktop breakpoint
    useEffect(() => {
        if (window.innerWidth < 1024) {
            setSidebarOpen(false);
        }
    }, [location.pathname]);

    const handleTouchStart = useCallback((e) => {
        touchStartX.current = e.targetTouches[0].clientX;
    }, []);

    const handleTouchMove = useCallback((e) => {
        touchEndX.current = e.targetTouches[0].clientX;
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (touchStartX.current - touchEndX.current > 50) {
            // Swiped left (close)
            setSidebarOpen(false);
        }
    }, []);

    const fetchCompanyInfo = useCallback(async () => {
        try {
            const res = await api.get('/company-settings');
            const data = res?.data;
            if (data?.company_name) {
                const name = data.company_name.toUpperCase();
                const logo = data.company_logo_url;
                setCompanyInfo(prev => {
                    if (prev.name === name && prev.logo === logo) return prev;
                    return { name, logo };
                });
            }
        } catch {  }
    }, []);

     const toggleSidebar = useCallback(() => setSidebarOpen(prev => !prev), []);
    const closeSidebar = useCallback(() => setSidebarOpen(false), []);

    const handleHamburgerClick = useCallback(() => {
        if (window.innerWidth >= 1024) {
            toggleSidebarCollapsed();
        } else {
            toggleSidebar();
        }
    }, [toggleSidebarCollapsed, toggleSidebar]);

    const getBreadcrumbs = useCallback(() => {
        const paths = location.pathname.split('/').filter(Boolean);
        return paths.map((path, index) => {
            const routeTo = '/' + paths.slice(0, index + 1).join('/');
            let label = path.charAt(0).toUpperCase() + path.slice(1);
            if (label === 'Sales') label = 'Sales';
            if (label === 'Blog-cms') label = 'Blog CMS';
            if (label === 'Cctv-attendance') label = 'CCTV Attendance';
            if (label === 'Cctv-management') label = 'CCTV Management';
            if (label === 'Daily-report') label = 'Daily Cash Book';
            if (label === 'Payment-verification') label = 'Payment Verification';
            if (label === 'Paper-layout') label = 'Paper Layout';
            if (label === 'Job-priority') label = 'Job Priority';
            if (label === 'Production-tracker') label = 'Production Tracker';
            
            const isLast = index === paths.length - 1;
            return (
                <span key={routeTo} className="breadcrumb-item">
                    {index > 0 && <span className="breadcrumb-separator">/</span>}
                    {isLast ? (
                        <span className="breadcrumb-current">{label}</span>
                    ) : (
                        <span 
                            className="breadcrumb-link" 
                            onClick={() => navigate(routeTo)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter') navigate(routeTo); }}
                        >
                            {label}
                        </span>
                    )}
                </span>
            );
        });
    }, [location.pathname, navigate]);
    const handleNavAction = useCallback((action) => {
        if (action === 'scanner') setShowInventoryScan(true);
    }, []);

    // Sync sidebar state for different viewports
    useEffect(() => {
        const syncSidebarForViewport = () => {
            if (window.innerWidth >= 1024) {
                // Desktop: Restore state from localStorage
                try {
                    const saved = localStorage.getItem('sargaSidebarCollapsed');
                    setSidebarCollapsed(saved ? JSON.parse(saved) : false);
                } catch {
                    setSidebarCollapsed(false);
                }
            } else {
                // Mobile/Tablet: Expanded under overlay drawer
                setSidebarCollapsed(false);
            }
        };

        syncSidebarForViewport();
        window.addEventListener('resize', syncSidebarForViewport);
        return () => window.removeEventListener('resize', syncSidebarForViewport);
    }, []);

    const { t } = useTranslation();

    const menuItems = useMemo(() => [
        // Dashboard
        { key: 'dashboard', name: 'Summary', icon: Grid, path: '/dashboard', roles: ['Admin'], group: 'main' },
        { key: 'dashboard', name: 'Front Office', icon: Grid, path: '/dashboard', roles: ['Front Office'], group: 'main' },
        { key: 'dashboard', name: 'Dashboard', icon: Grid, path: '/dashboard', roles: ['Accountant', 'Other Staff', 'Designer'], group: 'main' },

        // Sales
        { key: 'sales_customers', name: 'Customers', icon: UserSquare, path: '/dashboard/sales/customers', roles: ['Admin', 'Front Office', 'Accountant'], group: 'sales' },
        { key: 'sales_orders', name: 'Orders', icon: ClipboardList, path: '/dashboard/sales/orders', roles: ['Admin', 'Front Office', 'Accountant'], group: 'sales' },
        { key: 'sales_quotes', name: 'Quotations', icon: Receipt, path: '/dashboard/sales/quotes', roles: ['Admin', 'Front Office', 'Accountant'], group: 'sales' },
        { key: 'sales_invoices', name: 'Invoices', icon: FileText, path: '/dashboard/sales/invoices', roles: ['Admin', 'Front Office', 'Accountant'], group: 'sales' },
        { key: 'shortcuts', name: 'Shortcuts', icon: Zap, path: '/dashboard/shortcuts', roles: ['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff'], group: 'sales' },
        { key: 'sales_payments', name: 'Payments', icon: Receipt, path: '/dashboard/sales/payments', roles: ['Admin', 'Front Office', 'Accountant'], group: 'sales' },
        { key: 'jobs', name: 'Assigned Jobs', icon: ClipboardList, path: '/dashboard/designer-dashboard', roles: ['Designer'], group: 'sales' },
        { key: 'jobs', name: 'Assigned Jobs', icon: ClipboardList, path: '/dashboard/printer-dashboard', roles: ['Printer'], group: 'sales' },
        // Inventory
        { key: 'inventory', name: 'Inventory', icon: Box, path: '/dashboard/inventory', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        { key: 'inventory', name: 'Paper Inventory', icon: FileText, path: '/dashboard/paper/stock', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        { key: 'inventory', name: 'Consumables', icon: Package, path: '/dashboard/inventory/consumables', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        { key: 'internal', name: 'Stock Transfer', icon: Package, path: '/dashboard/stock-transfer', roles: ['Admin', 'Accountant', 'Front Office'], group: 'inventory' },
        { key: 'operations', name: 'Stock Verification', icon: Box, path: '/dashboard/stock-verification', roles: ['Accountant', 'Admin'], group: 'inventory' },
        { key: 'scanner', name: 'Scan Item', icon: Camera, path: '/dashboard/inventory/scan', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        // Production
        { key: 'operations', name: 'Product Library', icon: Grid, path: '/dashboard/products', roles: ['Admin', 'Front Office', 'Designer', 'Accountant'], group: 'production' },
        { key: 'operations', name: 'Machine Management', icon: Settings, path: '/dashboard/machines', roles: ['Admin', 'Front Office'], group: 'production' },
        { key: 'operations', name: 'Production Tracker', icon: Layers, path: '/dashboard/production-tracker', roles: ['Admin', 'Front Office'], group: 'production' },
        { key: 'operations', name: 'Paper Layout', icon: Layers, path: '/dashboard/paper-layout', roles: ['Front Office', 'Designer'], group: 'production' },
        { key: 'operations', name: 'Design Check', icon: FileCheck, path: '/dashboard/design-check', roles: ['Designer'], group: 'production' },
        // Branch Operations
        { key: 'operations', name: 'Product Requests', icon: ShieldAlert, path: '/dashboard/product-requests', roles: ['Admin', 'Accountant'], group: 'branch-ops' },
        { key: 'internal', name: 'Internal Transfers', icon: BookOpen, path: '/dashboard/internal-transactions', roles: ['Admin', 'Accountant', 'Front Office'], group: 'branch-ops' },
        // Accounts
        { key: 'reports', name: 'Daily Cash Book', icon: BookOpen, path: '/dashboard/daily-report', roles: ['Front Office', 'Admin', 'Accountant'], group: 'accounts' },
        { key: 'expenses', name: 'Expense Manager', icon: Receipt, path: '/dashboard/expenses', roles: ['Admin', 'Front Office', 'Accountant'], group: 'accounts' },
        { key: 'expenses', name: 'Upload Bills', icon: Upload, path: '/dashboard/expenses/upload-bills', roles: ['Admin', 'Front Office', 'Accountant'], group: 'accounts' },
        { key: 'expenses', name: 'Vendors', icon: Store, path: '/dashboard/vendors', roles: ['Admin', 'Accountant', 'Front Office'], group: 'accounts' },
        { key: 'expenses', name: 'Payment Verification', icon: FileCheck, path: '/dashboard/payment-verification', roles: ['Accountant', 'Admin'], group: 'accounts' },
        { key: 'expenses', name: 'Accounts & GST', icon: Receipt, path: '/dashboard/accounts', roles: ['Accountant', 'Admin'], group: 'accounts' },
        { key: 'finance', name: 'Recurring Invoices', icon: ClipboardList, path: '/dashboard/recurring-invoices', roles: ['Admin', 'Accountant'], group: 'accounts' },
        // Administration
        { key: 'manage', name: 'Staff Management', icon: Users, path: '/dashboard/staff', roles: ['Admin', 'Accountant', 'Front Office'], group: 'admin' },
        { key: 'manage', name: 'Branches', icon: Building2, path: '/dashboard/branches', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'Requests', icon: ShieldAlert, path: '/dashboard/requests', roles: ['Admin', 'Accountant'], group: 'admin' },
        { key: 'manage', name: 'Coupons', icon: Tag, path: '/dashboard/coupons', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'Attendance', icon: Camera, path: '/dashboard/cctv-attendance', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'CCTV', icon: Camera, path: '/dashboard/cctv-management', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'Schedule & Time', icon: Clock, path: '/dashboard/schedules', roles: ['Admin', 'Accountant'], group: 'admin' },
        { key: 'manage', name: 'Settings', icon: Settings, path: '/dashboard/settings', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'Audit Trail', icon: Shield, path: '/dashboard/admin/audit-trail', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'Audit Dashboard', icon: BarChart3, path: '/dashboard/admin/audit-dashboard', roles: ['Admin'], group: 'admin' },
        { key: 'manage', name: 'Google Sheets Backup', icon: Database, path: '/dashboard/backup', roles: ['Admin'], group: 'admin' },
    ], [t]);

    const filteredMenu = useMemo(() => {
        if (!normalizedUserRole) return [];
        let items = menuItems.filter(item => 
            item.roles.map(r => r.toLowerCase().trim()).includes(normalizedUserRole.toLowerCase().trim())
        );
        
        // Accountant role restriction: only finance-related modules
        if (normalizedUserRole === 'Accountant') {
            const accountantAllowedGroups = ['main', 'sales', 'accounts', 'admin', 'inventory', 'production'];
            const accountantAllowedKeys = [
                'dashboard', 'sales_customers', 'sales_orders', 'sales_quotes',
                'sales_invoices', 'sales_payments', 'shortcuts',
                'reports', 'expenses', 'manage', 'finance',
                'sample_requests', 'inventory', 'operations'
            ];
            items = items.filter(item => 
                accountantAllowedGroups.includes(item.group) && 
                accountantAllowedKeys.includes(item.key)
            );
        }
        
        if (user?.settings) {
            try {
                const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
                if (settings.sidebar) {
                    const keyMapping = {
                        sales_customers: 'customers',
                        sales_orders: 'jobs',
                        jobs: 'jobs',
                        sales_quotes: 'billing',
                        sales_invoices: 'billing',
                        sales_payments: 'billing',
                        shortcuts: 'billing',
                        inventory: 'inventory',
                        scanner: 'inventory',
                        operations: 'operations',
                        sample_requests: 'operations',
                        design_bookings: 'operations',
                        finance: 'finance',
                        manage: 'manage',
                        reports: 'reports',
                        internal: 'internal',
                        expenses: 'finance'
                    };
                    items = items.filter(item => {
                        const mappedKey = keyMapping[item.key] || item.key;
                        if (settings.sidebar[mappedKey] === false) return false;
                        if (settings.sidebar[item.key] === false) return false;
                        return true;
                    });
                }
            } catch (e) {
                console.error('Error parsing user settings:', e);
            }
        }
        return items;
    }, [user, menuItems, normalizedUserRole]);

    const [collapsedGroups, setCollapsedGroups] = useState(() => {
        try {
            const saved = sessionStorage.getItem('sargaSidebarGroups');
            return saved ? new Set(JSON.parse(saved)) : new Set(['sales', 'inventory', 'production', 'branch-ops', 'accounts', 'admin']);
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
        if (!['Admin', 'Front Office', 'Accountant'].map(r => r.toLowerCase()).includes(normalizedUserRole.toLowerCase())) return null;
        return sidebarGroupDefs.map(g => ({
            ...g,
            items: filteredMenu.filter(i => i.group === g.key)
        })).filter(g => g.items.length > 0);
    }, [normalizedUserRole, filteredMenu]);

    // Auto-expand group containing active route on path changes
    useEffect(() => {
        if (!groupedMenu) return;
        const activeGroup = groupedMenu.find(group => 
            group.items?.some(item => {
                const p = item.path;
                if (!p) return false;
                if (p === '/dashboard') return location.pathname === '/dashboard' || location.pathname === '/dashboard/';
                return location.pathname.startsWith(p);
            })
        );
        if (activeGroup) {
            setCollapsedGroups(prev => {
                if (prev.has(activeGroup.key)) {
                    const next = new Set(prev);
                    next.delete(activeGroup.key);
                    sessionStorage.setItem('sargaSidebarGroups', JSON.stringify([...next]));
                    return next;
                }
                return prev;
            });
        }
    }, [location.pathname, groupedMenu]);

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
            // Ignore events while ScannerModal is open (manual scan in progress)
            if (scannerOpenRef.current) return;
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

    const handleInventoryScan = useCallback(async (scannedCode) => {
        setShowInventoryScan(false);
        setInventoryScanLoading(true);
        setInventoryScanResult(null);
        try {
            const normalized = scannedCode.trim().toUpperCase();
            const res = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`);
            const item = res?.data;
            if (!item) {
                import('react-hot-toast').then(m => m.default.error(`No inventory item found for: ${scannedCode.trim()}`));
            } else {
                setInventoryScanResult(item);
            }
        } catch {
            import('react-hot-toast').then(m => m.default.error(`No inventory item found for: ${scannedCode.trim()}`));
        } finally {
            setInventoryScanLoading(false);
        }
    }, []);

    const handleLogout = useCallback(async () => {
        const isConfirmed = await confirm({
            title: 'Sign out?',
            message: 'Are you sure you want to sign out?',
            confirmText: 'Logout',
            cancelText: 'Cancel',
            type: 'danger'
        });
        if (isConfirmed) {
            logout();
            navigate('/login', { replace: true });
        }
    }, [confirm, logout, navigate]);

    const fetchPendingCount = useCallback(async () => {
        if (user?.role !== 'Admin' && user?.role !== 'Accountant') return;
        try {
            const response = await api.get('/requests/pending-count', { _noCache: true });
            const pendingCount = response?.data?.pending_count ?? 0;
            setPendingRequestsCount(prev => {
                if (prev === pendingCount) return prev;
                return pendingCount;
            });
        } catch (err) {
            console.error('Failed to fetch pending requests count:', err);
        }
    }, [user?.role]);

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

    // Consolidated initial data fetch on mount with parallel requests
    useEffect(() => {
        const initialFetch = async () => {
            const promises = [];
            promises.push(fetchCompanyInfo());
            if (isAdminOrAccountant) {
                promises.push(fetchPendingCount());
            }
            await Promise.allSettled(promises);
        };
        initialFetch();

        // Event listeners for real-time updates
        const handleRefresh = (e) => {
            if (e?.detail?.decrement) {
                setPendingRequestsCount(prev => Math.max(0, prev - e.detail.decrement));
            }
            fetchPendingCount();
        };
        const handleCompanyUpdate = () => fetchCompanyInfo();
        if (isAdminOrAccountant) {
            window.addEventListener('requestReviewed', handleRefresh);
        }
        window.addEventListener('companySettingsUpdated', handleCompanyUpdate);

        return () => {
            window.removeEventListener('requestReviewed', handleRefresh);
            window.removeEventListener('companySettingsUpdated', handleCompanyUpdate);
        };
    }, [user]);

    // ESC key closes all modals and sidebar overlay
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (showProfileModal) setShowProfileModal(false);
                else if (showProfilePanel) setShowProfilePanel(false);
                else if (inventoryScanResult) setInventoryScanResult(null);
                else if (showInventoryScan) setShowInventoryScan(false);
                else if (sidebarOpen) setSidebarOpen(false);
            }
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [showProfileModal, showProfilePanel, inventoryScanResult, showInventoryScan, sidebarOpen]);

    const handleProfileSave = useCallback(async (e) => {
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
    }, [profileName, profileImage, user, updateUser]);

    const handleRemoveProfileImage = useCallback(async () => {
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
    }, [confirm, user, updateUser]);

    const openCropper = useCallback((file) => {
        if (!file) return;
        setCropState({ file });
    }, []);

    const _handleCropCancel = useCallback(() => {
        setCropState(null);
    }, []);

    const handleCropComplete = useCallback((croppedFile) => {
        setProfileImage(croppedFile);
        setCropState(null);
    }, []);

    const handlePreferenceToggle = useCallback((key, value) => {
        setPreferences(prev => {
            const next = { ...prev, [key]: value };
            localStorage.setItem('user_preferences', JSON.stringify(next));
            return next;
        });
        api.patch('/staff/settings', { settings: { [key]: value } }).catch(() => {});
    }, []);

    return (
        <div className={`dashboard-layout ${sidebarCollapsed ? 'dashboard-layout--collapsed' : ''}`}>
            <a href="#main-content" className="skip-link">Skip to main content</a>
            <ProgressBar active={isNavigating} />
            {/* Mobile/Tablet Sidebar Overlay */}
            {sidebarOpen && <div className="sidebar-overlay sidebar-overlay--visible" onClick={closeSidebar} aria-hidden="true"></div>}

            {/* Sidebar */}
            <aside 
                ref={sidebarRef}
                className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${sidebarOpen ? 'sidebar--open' : ''}`}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                role="navigation"
                aria-label="Sidebar navigation"
            >
                <div className="sidebar-header">
                    <div className="logo-wrap">
                        {companyInfo.logo ? (
                           <img src={companyInfo.logo} alt={companyInfo.name} className="logo-img" width="32" height="32" />
                        ) : (
                           <img src="/icons/icon-48.webp" alt="Sarga" className="logo-img" width="32" height="32" />
                        )}
                        <span className="logo-text">{companyInfo.name}</span>
                    </div>
                    <button
                        className="sidebar-toggle"
                        onClick={toggleSidebarCollapsed}
                        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {sidebarCollapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronLeft size={18} aria-hidden="true" />}
                    </button>
                </div>

                <nav className="sidebar-nav">
                    {['Admin', 'Front Office', 'Accountant'].map(r => r.toLowerCase()).includes(normalizedUserRole.toLowerCase()) && groupedMenu ? (
                        groupedMenu.map(group => {
                            const showLabel = group.label && group.items.length > 1;
                            const isCollapsed = showLabel && collapsedGroups.has(group.key);
                            return (
                                <SidebarGroup key={group.key} group={group} isCollapsed={isCollapsed} sidebarCollapsed={sidebarCollapsed} toggleGroup={toggleGroup} closeSidebar={closeSidebar} pendingRequestsCount={pendingRequestsCount} onAction={handleNavAction} />
                            );
                        })
                    ) : (
                        filteredMenu.map(item => (
                            <SimpleNavItem key={item.path} item={item} closeSidebar={closeSidebar} pendingRequestsCount={pendingRequestsCount} />
                        ))
                    )}
                </nav>

                <div className="sidebar-footer">
                    <SidebarThemeToggle collapsed={sidebarCollapsed} />
                    <div className="user-profile" onClick={() => setShowProfilePanel(true)} role="button" tabIndex={0} aria-label="User profile" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowProfilePanel(true); } }}>
                        <div className="user-avatar">
                            {user?.image_url ? (
                                <SecureImage src={user.image_url} alt={user.name} className="avatar-img" width={40} height={40} />
                            ) : (
                                user?.name ? user.name[0] : 'U'
                            )}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{user?.name || 'User'}</div>
                            <div className="user-role">{user?.role || 'Guest'}</div>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn--full mt-16 btn--danger" onClick={handleLogout}>
                        <LogOut size={18} className="mr-8" aria-hidden="true" /> <span className="logout-text">Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content" id="main-content">
                {/* Global App Bar */}
                <header className="global-appbar">
                    {/* LEFT: Hamburger & Breadcrumb */}
                    <div className="appbar-left">
                        <button
                            className="appbar-hamburger"
                            aria-label="Toggle navigation menu"
                            onClick={handleHamburgerClick}
                        >
                            <Menu size={20} aria-hidden="true" />
                        </button>
                        <div className="appbar-breadcrumb">
                            {getBreadcrumbs()}
                        </div>
                    </div>

                    {/* CENTER: Smart Search */}
                    <div className="appbar-center">
                        <div className="appbar-search" onClick={() => setSearchOpen(true)} role="button" tabIndex={0} aria-label="Search" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSearchOpen(true); } }}>
                            <Search size={16} aria-hidden="true" />
                            <span className="appbar-search-placeholder">Search... <kbd className="appbar-kbd">⌘K</kbd></span>
                        </div>
                    </div>

                    {/* RIGHT: Branch switcher, Notifications, Profile */}
                    <div className="appbar-right">
                        {/* Branch switcher dropdown */}
                        <div className="appbar-branch-switcher">
                            <Building2 size={16} aria-hidden="true" />
                            <BranchSelect
                                value={selectedBranchId}
                                onChange={(e) => selectBranch(e.target.value)}
                                className="appbar-select"
                            >
                                {user?.role === 'Admin' ? (
                                  <>
                                    <option value="">All Branches</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                  </>
                                ) : (
                                  <>
                                    {assignedBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                  </>
                                )}
                            </BranchSelect>
                        </div>

                        {/* Notifications (Anomaly Alerts) */}
                        <button 
                            className="appbar-icon-btn" 
                            onClick={() => navigate('/dashboard/ai-monitoring')}
                            title="Notifications"
                            aria-label={`${anomalyCount} notifications`}
                        >
                            <ShieldAlert size={20} aria-hidden="true" />
                            {anomalyCount > 0 && (
                                <span className="appbar-badge">
                                    {anomalyCount > 99 ? '99+' : anomalyCount}
                                </span>
                            )}
                        </button>

                        {/* Profile Avatar */}
                        <div 
                            className="appbar-profile-trigger" 
                            onClick={() => setShowProfilePanel(true)}
                            role="button"
                            tabIndex={0}
                            aria-label="Open profile panel"
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowProfilePanel(true); } }}
                        >
                            <div className="user-avatar avatar-sm">
                                {user?.image_url ? (
                                    <SecureImage src={user.image_url} alt={user.name} className="avatar-img" width={34} height={34} />
                                ) : (
                                    user?.name ? user.name[0] : 'U'
                                )}
                            </div>
                        </div>
                    </div>
                </header>

                    <div className={`content-container ${isNavigating ? 'page-enter' : 'page-enter-active'}`} key={location.pathname}>

                    <Suspense fallback={<SuspenseFallback />}>
                        <ErrorBoundary>
                        <Routes>
                            <Route path="" element={<DashboardHome />} />
                            {/* Sales Consolidated Workspace */}
                            <Route path="sales" element={<SalesLayout />}>
                                <Route index element={<Navigate to="orders" replace />} />
                                <Route path="overview" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><Summary /></ProtectedSubRoute>} />
                                <Route path="customers" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><Customers /></ProtectedSubRoute>} />
                                <Route path="customers/new" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><Customers /></ProtectedSubRoute>} />
                                <Route path="customers/:id" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><CustomerDetails /></ProtectedSubRoute>} />
                                <Route path="orders" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer']}><Jobs /></ProtectedSubRoute>} />
                                <Route path="orders/:id" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer']}><JobDetail /></ProtectedSubRoute>} />
                                <Route path="quotes" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><Quotes /></ProtectedSubRoute>} />
                                <Route path="invoices" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><Invoices /></ProtectedSubRoute>} />
                                <Route path="invoices/create" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><React.Suspense fallback={<SkeletonLoader rows={4} />}><CreateInvoice /></React.Suspense></ProtectedSubRoute>} />
                                <Route path="payments" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><CustomerPayments /></ProtectedSubRoute>} />
                            </Route>

                            {/* Redirects for legacy/flat routes */}
                            <Route path="billing" element={<Navigate to="/dashboard/sales/invoices/create" replace />} />
                            <Route path="internal-billing" element={<Navigate to="/dashboard/sales/invoices" replace />} />
                            <Route path="customer-payments" element={<Navigate to="/dashboard/sales/payments" replace />} />
                            <Route path="quotes" element={<Navigate to="/dashboard/sales/quotes" replace />} />
                            <Route path="jobs" element={<Navigate to="/dashboard/sales/orders" replace />} />
                            <Route path="jobs/:id" element={<NavigateToJobDetail />} />
                            <Route path="customers" element={<Navigate to="/dashboard/sales/customers" replace />} />
                            <Route path="customers/new" element={<Navigate to="/dashboard/sales/customers" replace />} />
                            <Route path="customers/:id" element={<NavigateToCustomerDetails />} />

                            <Route path="staff" element={<ProtectedSubRoute roles={['Admin', 'Accountant', 'Front Office']}><StaffManagement /></ProtectedSubRoute>} />
                            <Route path="employee/:staffId" element={<ProtectedSubRoute roles={['Admin', 'Accountant', 'Front Office']}><EmployeeDetail /></ProtectedSubRoute>} />
                            <Route path="branches" element={<ProtectedSubRoute roles={['Admin']}><Branches /></ProtectedSubRoute>} />
                            <Route path="products" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Designer', 'Accountant']}><ProductLibrary /></ProtectedSubRoute>} />
                            <Route path="product-requests" element={<ProtectedSubRoute roles={['Admin', 'Accountant']}><ProductRequests /></ProtectedSubRoute>} />
                            <Route path="requests" element={<ProtectedSubRoute roles={['Admin', 'Accountant']}><IDChangeRequests /></ProtectedSubRoute>} />
                            <Route path="inventory" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><Inventory /></ProtectedSubRoute>} />
                            <Route path="inventory/overview" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><InventoryOverview /></ProtectedSubRoute>} />
                            <Route path="inventory/scan" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><ScanItem /></ProtectedSubRoute>} />
                            <Route path="stock-verification" element={<ProtectedSubRoute roles={['Accountant', 'Admin']}><StockVerification /></ProtectedSubRoute>} />
                            <Route path="payment-verification" element={<ProtectedSubRoute roles={['Accountant', 'Admin']}><PaymentVerification /></ProtectedSubRoute>} />
                            <Route path="expenses" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><ExpenseManager /></ProtectedSubRoute>} />
                            <Route path="expenses/upload-bills" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><UploadBills /></ProtectedSubRoute>} />
                            <Route path="utilities/connections/:id" element={<ProtectedSubRoute roles={['Admin', 'Accountant', 'Front Office']}><ConnectionLedger /></ProtectedSubRoute>} />
                            <Route path="vendors/*" element={<ProtectedSubRoute roles={['Admin', 'Accountant', 'Front Office']}><Vendors /></ProtectedSubRoute>} />
                            <Route path="machines" element={<ProtectedSubRoute roles={['Admin', 'Front Office']}><MachineManagement /></ProtectedSubRoute>} />
                            <Route path="daily-report" element={<ProtectedSubRoute roles={['Front Office', 'Admin', 'Accountant']}><DailyReport /></ProtectedSubRoute>} />
                            <Route path="internal-transactions" element={<ProtectedSubRoute roles={['Admin', 'Accountant', 'Front Office']}><InternalTransfers /></ProtectedSubRoute>} />
                            <Route path="stock-transfer" element={<ProtectedSubRoute roles={['Admin', 'Accountant', 'Front Office']}><StockTransfer /></ProtectedSubRoute>} />
                            <Route path="attendance-salary" element={<ProtectedSubRoute roles={['Admin', 'Accountant']}><AttendanceSalary /></ProtectedSubRoute>} />
                            <Route path="ai-monitoring" element={<ProtectedSubRoute roles={['Admin']}><RequiresConnection feature="AI Monitoring"><AIMonitoring /></RequiresConnection></ProtectedSubRoute>} />
                            <Route path="design-check" element={<ProtectedSubRoute roles={['Designer']}><RequiresConnection feature="Design Checker"><DesignChecker /></RequiresConnection></ProtectedSubRoute>} />
                            <Route path="paper-layout" element={<ProtectedSubRoute roles={['Front Office', 'Designer']}><RequiresConnection feature="Paper Layout Generator"><PaperLayoutGenerator /></RequiresConnection></ProtectedSubRoute>} />
                            <Route path="job-priority" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Designer', 'Printer']}><JobPriority /></ProtectedSubRoute>} />
                            <Route path="reports" element={<ProtectedSubRoute roles={['Admin', 'Accountant']}><Reports /></ProtectedSubRoute>} />
                            <Route path="accounts" element={<ProtectedSubRoute roles={['Accountant', 'Admin']}><RequiresConnection feature="Accounts & GST"><Accounts /></RequiresConnection></ProtectedSubRoute>} />
                            <Route path="plates" element={<ProtectedSubRoute roles={['Designer', 'Admin']}><PlateManagement /></ProtectedSubRoute>} />
                            <Route path="production-tracker" element={<ProtectedSubRoute roles={['Admin', 'Front Office']}><RequiresConnection feature="Production Tracker"><ProductionTracker /></RequiresConnection></ProtectedSubRoute>} />
                            <Route path="coupons" element={<ProtectedSubRoute roles={['Admin']}><CouponManagement /></ProtectedSubRoute>} />
                            <Route path="cctv-attendance" element={<ProtectedSubRoute roles={['Admin']}><CCTVAttendance /></ProtectedSubRoute>} />
                            <Route path="cctv-management" element={<ProtectedSubRoute roles={['Admin']}><CCTVManagement /></ProtectedSubRoute>} />
                            <Route path="schedules" element={<ProtectedSubRoute roles={['Admin', 'Accountant']}><ScheduleManagement /></ProtectedSubRoute>} />
                            <Route path="other-staff-dashboard" element={<ProtectedSubRoute roles={['Other Staff']}><OtherStaffDashboard /></ProtectedSubRoute>} />
                            <Route path="printer-dashboard" element={<ProtectedSubRoute roles={['Printer']}><PrinterDashboard /></ProtectedSubRoute>} />
                            <Route path="designer-dashboard" element={<ProtectedSubRoute roles={['Designer']}><DesignerDashboard /></ProtectedSubRoute>} />
                            <Route path="inventory/paper" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperStockDashboard /></ProtectedSubRoute>} />
                            <Route path="paper/stock" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperStockDashboard /></ProtectedSubRoute>} />
                            <Route path="paper/inward" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperInward /></ProtectedSubRoute>} />
                            <Route path="paper/outward" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperOutward /></ProtectedSubRoute>} />
                            <Route path="paper/movements" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperMovementHistory /></ProtectedSubRoute>} />
                            <Route path="paper/alerts" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperAlerts /></ProtectedSubRoute>} />
                            <Route path="paper/transfer" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PaperTransfer /></ProtectedSubRoute>} />
                            <Route path="paper/cut" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><CutTransfer /></ProtectedSubRoute>} />
                            <Route path="paper/pending-transfers" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><PendingTransfers /></ProtectedSubRoute>} />
                            <Route path="inventory/consumables" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><ConsumablesManagement /></ProtectedSubRoute>} />
                            <Route path="recurring-invoices" element={<ProtectedSubRoute roles={['Admin', 'Accountant']}><RecurringInvoices /></ProtectedSubRoute>} />
                            <Route path="settings" element={<ProtectedSubRoute roles={['Admin']}><SettingsPage /></ProtectedSubRoute>} />
                            <Route path="backup" element={<ProtectedSubRoute roles={['Admin']}><BackupSettingsPage /></ProtectedSubRoute>} />
                            <Route path="admin/chatbot-training" element={<ProtectedSubRoute roles={['Admin']}><ChatbotTraining /></ProtectedSubRoute>} />
                            <Route path="admin/reviews" element={<ProtectedSubRoute roles={['Admin']}><ReviewsManagement /></ProtectedSubRoute>} />
                            <Route path="admin/artwork" element={<ProtectedSubRoute roles={['Admin']}><ArtworkManager /></ProtectedSubRoute>} />
                            <Route path="admin/portfolio" element={<ProtectedSubRoute roles={['Admin']}><PortfolioManager /></ProtectedSubRoute>} />
                            <Route path="admin/promotions" element={<ProtectedSubRoute roles={['Admin']}><PromotionsManager /></ProtectedSubRoute>} />
                            <Route path="admin/pickup-bookings" element={<ProtectedSubRoute roles={['Admin']}><PickupBookings /></ProtectedSubRoute>} />
                            <Route path="admin/delivery-rules" element={<ProtectedSubRoute roles={['Admin']}><DeliveryRulesManager /></ProtectedSubRoute>} />
                            <Route path="admin/translations" element={<ProtectedSubRoute roles={['Admin']}><TranslationsManager /></ProtectedSubRoute>} />
                            <Route path="admin/audit-trail" element={<ProtectedSubRoute roles={['Admin']}><AuditTrail /></ProtectedSubRoute>} />
                            <Route path="admin/audit-dashboard" element={<ProtectedSubRoute roles={['Admin']}><AuditDashboard /></ProtectedSubRoute>} />
                            <Route path="web-inquiries" element={<ProtectedSubRoute roles={['Admin', 'Front Office']}><WebInquiries /></ProtectedSubRoute>} />
                            <Route path="blog-cms" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Designer']}><BlogCMS /></ProtectedSubRoute>} />
                            <Route path="sample-requests" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant']}><SampleRequestsCMS /></ProtectedSubRoute>} />
                            <Route path="design-bookings" element={
                                <ProtectedSubRoute roles={['Admin', 'Front Office', 'Designer']}>
                                    <SectionErrorBoundary name="DesignBookings" title="Design Bookings" message="No bookings available">
                                        <DesignBookingsCMS />
                                    </SectionErrorBoundary>
                                </ProtectedSubRoute>
                            } />
                            <Route path="shortcuts" element={<ProtectedSubRoute roles={['Admin', 'Front Office', 'Accountant', 'Designer', 'Printer', 'Other Staff']}><ShortcutsPage /></ProtectedSubRoute>} />
                            <Route path="*" element={<NotFound />} />

                        </Routes>
                        </ErrorBoundary>
                    </Suspense>
                </div>
            </main>

            {showProfilePanel && (
                <div className="modal-backdrop modal-backdrop--high" role="dialog" aria-modal="true" aria-label="Profile panel">
                    <div className="modal modal--profile-panel">
                        {/* Profile Header */}
                        <div className="profile-panel-header">
                            <div className="user-avatar user-avatar--large">
                                {user?.image_url ? (
                                    <SecureImage src={user.image_url} alt={user.name} className="avatar-img" width={120} height={120} />
                                ) : (
                                    user?.name ? user.name[0].toUpperCase() : 'U'
                                )}
                            </div>
                            <div className="profile-panel-info">
                                <div className="profile-panel-name">{user?.name || 'User'}</div>
                                <div className="profile-panel-role">{user?.role || 'Guest'}</div>
                            </div>
                            <button
                                className="btn btn-primary btn-sm btn--shrink"
                                onClick={() => { setShowProfilePanel(false); setShowProfileModal(true); }}
                            >
                                <Settings size={14} aria-hidden="true" /> Edit Profile
                            </button>
                            <button className="modal-close modal-close--static" aria-label="Close profile panel" onClick={() => setShowProfilePanel(false)} title="Close"><X size={18} aria-hidden="true" /></button>
                        </div>
                        {/* Attendance & Salary for staff roles */}
                        {['Designer', 'Printer', 'Front Office', 'Other Staff'].includes(user?.role) && (
                            <div className="profile-panel-content">
                                <Suspense fallback={<PageLoader />}>
                                    <AttendanceSalary />
                                </Suspense>
                            </div>
                        )}
                        {!['Designer', 'Printer', 'Front Office', 'Other Staff'].includes(user?.role) && (
                            <div className="profile-panel-content">
                                <div className="profile-panel-section">
                                    <h4 className="profile-panel-section-title">Active Branch</h4>
                                    <div className="profile-card-item">
                                        <div className="profile-card-icon">
                                            <Building2 size={18} aria-hidden="true" />
                                        </div>
                                        <div className="profile-card-info">
                                            <div className="profile-card-title">{user?.branch_short_name || 'Main Branch'}</div>
                                            <div className="profile-card-subtitle">ID: {user?.branch_id || 'N/A'} • Connected</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="profile-panel-section">
                                    <h4 className="profile-panel-section-title">Quick Overview</h4>
                                    <div className="profile-stats-grid">
                                        <div className="profile-stat-card" onClick={() => { setShowProfilePanel(false); navigate('/settings'); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setShowProfilePanel(false); navigate('/settings'); } }}>
                                            <div className="profile-stat-icon">
                                                <Settings size={15} aria-hidden="true" />
                                            </div>
                                            <div className="profile-stat-label-wrap">
                                                <div className="profile-stat-value">Settings</div>
                                                <div className="profile-stat-label">Configure</div>
                                            </div>
                                        </div>
                                        <div className="profile-stat-card" onClick={() => { setShowProfilePanel(false); setSearchOpen(true); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setShowProfilePanel(false); setSearchOpen(true); } }}>
                                            <div className="profile-stat-icon">
                                                <Search size={15} aria-hidden="true" />
                                            </div>
                                            <div className="profile-stat-label-wrap">
                                                <div className="profile-stat-value">Smart Find</div>
                                                <div className="profile-stat-label">Search DB</div>
                                            </div>
                                        </div>
                                        <div className="profile-stat-card">
                                            <div className="profile-stat-icon">
                                                <Zap size={15} aria-hidden="true" />
                                            </div>
                                            <div className="profile-stat-label-wrap">
                                                <div className="profile-stat-value">Full Access</div>
                                                <div className="profile-stat-label">Role Tier</div>
                                            </div>
                                        </div>
                                        <div className="profile-stat-card" onClick={() => { setShowProfilePanel(false); navigate('/reports'); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setShowProfilePanel(false); navigate('/reports'); } }}>
                                            <div className="profile-stat-icon">
                                                <TrendingUp size={15} aria-hidden="true" />
                                            </div>
                                            <div className="profile-stat-label-wrap">
                                                <div className="profile-stat-value">Analytics</div>
                                                <div className="profile-stat-label">Reports</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showProfileModal && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Edit profile">
                    <div className="modal modal--profile">
                        <div className="modal-header">
                            <h2 className="modal-title">Edit Profile</h2>
                            <button className="modal-close modal-close--static" aria-label="Close profile modal" onClick={() => setShowProfileModal(false)} title="Close"><X size={18} aria-hidden="true" /></button>
                        </div>

                        {/* Tab Navigation */}
                        <div className="profile-tabs">
                            <button className={`profile-tab ${profileTab === 'profile' ? 'profile-tab--active' : ''}`} onClick={() => setProfileTab('profile')}>
                                <UserSquare size={14} aria-hidden="true" /> Profile
                            </button>
                            <button className={`profile-tab ${profileTab === 'account' ? 'profile-tab--active' : ''}`} onClick={() => setProfileTab('account')}>
                                <Settings size={14} aria-hidden="true" /> Account
                            </button>
                            <button className={`profile-tab ${profileTab === 'permissions' ? 'profile-tab--active' : ''}`} onClick={() => setProfileTab('permissions')}>
                                <ShieldAlert size={14} aria-hidden="true" /> Permissions
                            </button>
                            <button className={`profile-tab ${profileTab === 'preferences' ? 'profile-tab--active' : ''}`} onClick={() => setProfileTab('preferences')}>
                                <Sparkles size={14} aria-hidden="true" /> Preferences
                            </button>
                        </div>

                        <form onSubmit={handleProfileSave} className="stack-md">
                            {/* ═══════ PROFILE TAB ═══════ */}
                            {profileTab === 'profile' && (
                                <>
                                    <div className="profile-avatar-section">
                                        <div className="profile-avatar-wrapper" onClick={() => {
                                            const fileInput = document.getElementById('profile-file-input');
                                            if (fileInput) fileInput.click();
                                        }} role="button" tabIndex={0} onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                const fileInput = document.getElementById('profile-file-input');
                                                if (fileInput) fileInput.click();
                                            }
                                        }} aria-label="Change profile photo">
                                            {profileImage ? (
                                                <img src={profilePreview} alt="Profile" className="profile-avatar-img" />
                                            ) : user?.image_url ? (
                                                <SecureImage src={user.image_url} alt="Profile" className="profile-avatar-img" width={84} height={84} />
                                            ) : (
                                                <div className="profile-avatar-placeholder">
                                                    {profileName ? profileName[0].toUpperCase() : 'U'}
                                                </div>
                                            )}
                                            <div className="avatar-upload-overlay">
                                                <Camera size={14} aria-hidden="true" />
                                                <span>Upload</span>
                                            </div>
                                        </div>
                                        <div className="profile-avatar-actions">
                                            <span className="profile-avatar-label">Profile Photo</span>
                                            <div className="profile-avatar-input-wrapper">
                                                <input
                                                    id="profile-file-input"
                                                    type="file"
                                                    accept="image/png,image/jpeg,image/webp"
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0] || null;
                                                        if (file) openCropper(file);
                                                        e.target.value = '';
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => {
                                                        const fileInput = document.getElementById('profile-file-input');
                                                        if (fileInput) fileInput.click();
                                                    }}
                                                >
                                                    Choose Photo
                                                </button>
                                            </div>
                                            <span className="profile-avatar-hint">PNG, JPG or WebP — max 512px</span>
                                            {(user?.image_url || profileImage) && (
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm text-error"
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
                                </>
                            )}

                            {/* ═══════ ACCOUNT TAB ═══════ */}
                            {profileTab === 'account' && (
                                <div className="profile-detail-grid">
                                    <div className="profile-detail-card">
                                        <div className="profile-detail-card-header">
                                            <UserSquare size={13} aria-hidden="true" /> User ID
                                        </div>
                                        <div className="profile-detail-card-value">{user?.user_id || '-'}</div>
                                    </div>
                                    <div className="profile-detail-card">
                                        <div className="profile-detail-card-header">
                                            <Award size={13} aria-hidden="true" /> Role
                                        </div>
                                        <div className="profile-detail-card-value profile-detail-card-value--accent">{user?.role || '-'}</div>
                                    </div>
                                    <div className="profile-detail-card">
                                        <div className="profile-detail-card-header">
                                            <Building2 size={13} aria-hidden="true" /> Branch
                                        </div>
                                        <div className="profile-detail-card-value">{user?.branch_short_name || user?.branch_id || '-'}</div>
                                    </div>
                                    <div className="profile-detail-card">
                                        <div className="profile-detail-card-header">
                                            <Users size={13} aria-hidden="true" /> Employee ID
                                        </div>
                                        <div className="profile-detail-card-value">{user?.id || '-'}</div>
                                    </div>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div className="password-card">
                                            <div className="password-card__info">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Lock size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                                                    <h3>Password</h3>
                                                </div>
                                                <p>Update periodically for security</p>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => window.open('/change-password', '_self')}
                                            >
                                                Change Password
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══════ PERMISSIONS TAB ═══════ */}
                            {profileTab === 'permissions' && (
                                <div>
                                    <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
                                        Your access level is based on the <strong style={{ color: 'var(--text)' }}>{user?.role}</strong> role.
                                    </p>
                                    <div className="permissions-grid">
                                        {[
                                            { label: 'Dashboard Access', desc: 'View main dashboard and analytics', allowed: true, icon: <Grid size={15} aria-hidden="true" /> },
                                            { label: 'Order Management', desc: 'Create and manage customer orders', allowed: ['Admin', 'Accountant', 'Front Office'].includes(user?.role), icon: <ClipboardList size={15} aria-hidden="true" /> },
                                            { label: 'Inventory Control', desc: 'Manage stock, transfers, and verification', allowed: ['Admin', 'Accountant'].includes(user?.role), icon: <Box size={15} aria-hidden="true" /> },
                                            { label: 'Expense Management', desc: 'Record and approve expenses', allowed: ['Admin', 'Accountant'].includes(user?.role), icon: <Receipt size={15} aria-hidden="true" /> },
                                            { label: 'Vendor Management', desc: 'Manage vendors and purchase invoices', allowed: ['Admin', 'Accountant'].includes(user?.role), icon: <Store size={15} aria-hidden="true" /> },
                                            { label: 'Staff Management', desc: 'Manage staff accounts and roles', allowed: user?.role === 'Admin', icon: <Users size={15} aria-hidden="true" /> },
                                            { label: 'Reports & Analytics', desc: 'Access financial and operational reports', allowed: ['Admin', 'Accountant'].includes(user?.role), icon: <TrendingUp size={15} aria-hidden="true" /> },
                                            { label: 'System Settings', desc: 'Configure system-wide settings', allowed: user?.role === 'Admin', icon: <Settings size={15} aria-hidden="true" /> },
                                        ].map((perm, i) => (
                                            <div key={i} className="permission-card">
                                                <div className={`permission-card__icon ${perm.allowed ? 'permission-card__icon--allowed' : 'permission-card__icon--denied'}`}>
                                                    {perm.icon}
                                                </div>
                                                <div className="permission-card__info">
                                                    <div className="permission-card__label">{perm.label}</div>
                                                    <div className="permission-card__desc">{perm.desc}</div>
                                                </div>
                                                <span className={`permission-card__badge ${perm.allowed ? 'permission-card__badge--allowed' : 'permission-card__badge--denied'}`}>
                                                    {perm.allowed ? 'Allowed' : 'Restricted'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* ═══════ PREFERENCES TAB ═══════ */}
                            {profileTab === 'preferences' && (
                                <div>
                                    <div className="preference-section-header">Appearance</div>
                                    <div className="theme-visual-grid">
                                        {[
                                            { id: 'light', label: 'Light', previewClass: 'theme-visual-preview--light', icon: <Sun size={12} aria-hidden="true" />, layout: <><div className="preview-sidebar" /><div className="preview-content" /></> },
                                            { id: 'dark', label: 'Dark', previewClass: 'theme-visual-preview--dark', icon: <Moon size={12} aria-hidden="true" />, layout: <><div className="preview-sidebar" /><div className="preview-content" /></> },
                                            { id: 'system', label: 'System', previewClass: 'theme-visual-preview--system', icon: <Monitor size={12} aria-hidden="true" />, layout: <><div className="preview-split-light" /><div className="preview-split-dark" /></> }
                                        ].map(t => (
                                            <div
                                                key={t.id}
                                                className={`theme-visual-option ${theme === t.id ? 'theme-visual-option--active' : ''}`}
                                                onClick={() => setTheme(t.id)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTheme(t.id); }}
                                            >
                                                <div className={`theme-visual-preview ${t.previewClass}`}>
                                                    {t.layout}
                                                </div>
                                                <div className="theme-visual-label">
                                                    {t.icon} {t.label}
                                                </div>
                                                <div className="theme-visual-check" />
                                            </div>
                                        ))}
                                    </div>

                                    <div className="preference-section-header" style={{ marginTop: 24 }}>System Settings</div>
                                    <div className="preference-row">
                                        <div className="preference-row__info">
                                            <div className="preference-row__label">Notifications</div>
                                            <div className="preference-row__desc">Receive desktop notifications for updates</div>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={preferences.notifications}
                                                onChange={(e) => handlePreferenceToggle('notifications', e.target.checked)}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Footer Actions */}
                            <div className="profile-footer">
                                <button
                                    type="button"
                                    className="btn btn-ghost text-error"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                                    onClick={() => {
                                        setShowProfileModal(false);
                                        logout();
                                    }}
                                >
                                    <LogOut size={16} aria-hidden="true" /> Logout
                                </button>
                                <div className="profile-footer-actions">
                                    <Button variant="ghost" onClick={() => setShowProfileModal(false)} type="button">
                                        Cancel
                                    </Button>
                                    {profileTab === 'profile' && (
                                        <Button variant="primary" type="submit" loading={profileSaving} loadingText="Saving...">
                                            Save Changes
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {cropState?.file && (
                <Suspense fallback={null}>
                    <ImageCropModal
                        file={cropState?.file || null}
                        title="Crop Profile Photo"
                        outputSize={512}
                        onComplete={handleCropComplete}
                        onCancel={() => setCropState({ file: null })}
                    />
                </Suspense>
            )}

            {/* Inventory QR Scanner */}
            <Suspense fallback={null}>
                <ScannerModal
                    isOpen={showInventoryScan}
                    onClose={() => setShowInventoryScan(false)}
                    onScan={handleInventoryScan}
                />
            </Suspense>

            {/* Loading overlay when hardware scanner fires */}
            {inventoryScanLoading && (
                <div className="modal-backdrop modal-backdrop--medium" role="dialog" aria-modal="true" aria-label="Scanning">
                    <div className="modal modal--scan-loading">
                        <Loader2 size={32} className="animate-spin modal-loader-icon" aria-hidden="true" />
                        <div className="modal-loading-title">Looking up item…</div>
                        <div className="muted modal-loading-subtitle">Reading scanned code</div>
                    </div>
                </div>
            )}

            {/* Inventory Scan Result */}
            {inventoryScanResult && (
                <div className="modal-backdrop modal-backdrop--low" role="dialog" aria-modal="true" aria-label="Product details">
                    <div className="modal modal--scan-result">
                        <div className="row space-between items-center mb-16">
                            <h2 className="section-title">Product Details</h2>
                            <button className="icon-button" aria-label="Close product details" onClick={() => setInventoryScanResult(null)}><X size={20} aria-hidden="true" /></button>
                        </div>
                        <div className="stack-md">
                            {/* SKU — prominently at the top */}
                            {inventoryScanResult.sku && (
                                <div className="sku-badge">
                                    <span className="sku-badge__label">SKU</span>
                                    <span className="sku-badge__value">{inventoryScanResult.sku}</span>
                                </div>
                            )}
                            <div className="row gap-md items-center">
                                {inventoryScanResult.image_url && (
                                    <SecureImage
                                        src={inventoryScanResult.image_url}
                                        alt={inventoryScanResult.name}
                                        className="scan-result-image"
                                    />
                                )}
                                <div>
                                    <div className="scan-result-name">{inventoryScanResult.name}</div>
                                    {inventoryScanResult.category && (
                                        <div className="muted scan-result-category">{inventoryScanResult.category}</div>
                                    )}
                                </div>
                            </div>
                            <div className="row gap-md scan-result-stats">
                                <div className="scan-result-stat">
                                    <div className="muted scan-result-stat__label">MRP</div>
                                    <div className="scan-result-stat__value scan-result-stat__value--price">₹{inventoryScanResult.mrp}</div>
                                </div>
                                <div className="scan-result-stat">
                                    <div className="muted scan-result-stat__label">Total Stock</div>
                                    <div className={`scan-result-stat__value ${inventoryScanResult.quantity <= (inventoryScanResult.reorder_level || 0) ? 'scan-result-stat__value--error' : 'scan-result-stat__value--success'}`}>
                                        {inventoryScanResult.quantity} {inventoryScanResult.unit || ''}
                                    </div>
                                </div>
                            </div>

                            {inventoryScanResult.branch_stocks && inventoryScanResult.branch_stocks.length > 0 && (
                                <div className="scan-result-branch-stocks">
                                    <div className="muted scan-result-stat__label" style={{ marginBottom: 6 }}>Stock by Branch</div>
                                    {inventoryScanResult.branch_stocks.map(bs => (
                                        <div key={bs.branch_id} className="scan-result-branch-row">
                                            <span className="scan-result-branch-name">{bs.branch_name}</span>
                                            <span className={`scan-result-branch-qty ${Number(bs.quantity) <= 0 ? 'scan-result-stat__value--error' : ''}`}>
                                                {Number(bs.quantity).toLocaleString()} {inventoryScanResult.unit || ''}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {inventoryScanResult.hsn && (
                                <div className="scan-result-hsn">
                                    <span className="muted">HSN: <strong>{inventoryScanResult.hsn}</strong></span>
                                </div>
                            )}
                        </div>
                        <button className="btn btn-ghost btn--full mt-16" onClick={() => setInventoryScanResult(null)}>Close</button>
                    </div>
                </div>
            )}
            <Suspense fallback={null}>
                <SmartSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
            </Suspense>
            {showPaperPanel && (
                <Suspense fallback={null}>
                    <PaperSidePanel open={showPaperPanel} onClose={() => setShowPaperPanel(false)} />
                </Suspense>
            )}
        </div>
    );
};

export default React.memo(Dashboard);

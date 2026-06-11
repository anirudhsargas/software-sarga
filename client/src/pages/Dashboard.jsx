import React, { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import {
    Users, ClipboardList, Box, ShieldAlert, Receipt, LogOut, Grid, UserSquare, Building2, ChevronLeft, ChevronRight, Settings, BookOpen, Loader2, Store,
    Brain, Search, FileCheck, Layers, Zap, TrendingUp, Camera, X, Sparkles, ScanLine, Package, Tag, Clock, FileText, MessageSquare, Star, Upload,
    Image, Calendar, Truck, Globe, Calculator
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
import PaperSidePanel from '../components/PaperSidePanel';
import useTranslation from '../hooks/useTranslation';
import SkeletonLoader from '../components/SkeletonLoader';

// Lazy-loaded pages — each becomes a separate chunk
const StaffManagement = React.lazy(() => import('./StaffManagement'));
const EmployeeDetail = React.lazy(() => import('./EmployeeDetail'));
const Customers = React.lazy(() => import('./Customers'));
const CustomerDetails = React.lazy(() => import('./CustomerDetails'));
const Jobs = React.lazy(() => import('./Jobs'));
const JobDetail = React.lazy(() => import('./JobDetail'));
const ProductLibrary = React.lazy(() => import('./ProductLibrary'));
const ProductRequests = React.lazy(() => import('./ProductRequests'));
const IDChangeRequests = React.lazy(() => import('./Requests'));
const Inventory = React.lazy(() => import('./Inventory'));
const InventoryOverview = React.lazy(() => import('./InventoryOverview'));
const Branches = React.lazy(() => import('./Branches'));
const CustomerPayments = React.lazy(() => import('./CustomerPayments'));
const Summary = React.lazy(() => import('./Summary'));
const Billing = React.lazy(() => import('./Billing'));
const FrontOffice = React.lazy(() => import('./FrontOffice'));
const ExpenseManager = React.lazy(() => import('./ExpenseManager'));
const Vendors = React.lazy(() => import('./Vendors'));
const VendorDetail = React.lazy(() => import('../components/VendorDetail'));
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
const Accounts = React.lazy(() => import('./Accounts'));
const OrderPredictions = React.lazy(() => import('./OrderPredictions'));
const SalesPrediction = React.lazy(() => import('./SalesPrediction'));
const ProductionTracker = React.lazy(() => import('./ProductionTracker'));
const PlateManagement = React.lazy(() => import('./PlateManagement'));
const StockVerification = React.lazy(() => import('./StockVerification'));
const StockPlanning = React.lazy(() => import('./StockPlanning'));
const OtherStaffDashboard = React.lazy(() => import('./OtherStaffDashboard'));
const PrinterDashboard = React.lazy(() => import('./PrinterDashboard'));
const DesignerDashboard = React.lazy(() => import('./DesignerDashboard'));
const CouponManagement = React.lazy(() => import('./CouponManagement'));
const CCTVAttendance = React.lazy(() => import('./CCTVAttendance'));
const CCTVManagement = React.lazy(() => import('./CCTVManagement'));
const Reports = React.lazy(() => import('./Reports'));
const ScheduleManagement = React.lazy(() => import('./ScheduleManagement'));
const InternalBilling = React.lazy(() => import('./InternalBilling'));
const InternalTransactions = React.lazy(() => import('./InternalTransactions'));
const StockTransfer = React.lazy(() => import('./StockTransfer'));
const ConsumablesManagement = React.lazy(() => import('./ConsumablesManagement'));
const PaperStockDashboard = React.lazy(() => import('./PaperStockDashboard'));
const PaperInward = React.lazy(() => import('./PaperInward'));
const PaperOutward = React.lazy(() => import('./PaperOutward'));
const PaperMovementHistory = React.lazy(() => import('./PaperMovementHistory'));
const PaperAlerts = React.lazy(() => import('./PaperAlerts'));
const PaperTransfer = React.lazy(() => import('./PaperTransfer'));
const Quotes = React.lazy(() => import('./Quotes'));
const SettingsPage = React.lazy(() => import('./SettingsPage'));
const RecurringInvoices = React.lazy(() => import('./RecurringInvoices'));
const ChatbotTraining = React.lazy(() => import('./admin/ChatbotTraining'));
const WebInquiries = React.lazy(() => import('./WebInquiries'));
const ReviewsManagement = React.lazy(() => import('./admin/ReviewsManagement'));
const BlogCMS = React.lazy(() => import('./BlogCMS'));
const ArtworkManager = React.lazy(() => import('./admin/ArtworkManager'));
const PortfolioManager = React.lazy(() => import('./admin/PortfolioManager'));
const PromotionsManager = React.lazy(() => import('./admin/PromotionsManager'));
const PickupBookings = React.lazy(() => import('./admin/PickupBookings'));
const DeliveryRulesManager = React.lazy(() => import('./admin/DeliveryRulesManager'));
const TranslationsManager = React.lazy(() => import('./admin/TranslationsManager'));
const SampleRequestsCMS = React.lazy(() => import('./SampleRequestsCMS'));
const DesignBookingsCMS = React.lazy(() => import('./DesignBookingsCMS'));
const RateCalculator = React.lazy(() => import('./RateCalculator'));
const PageLoader = () => (

    <div className="page-loader">
        <Loader2 size={20} className="animate-spin" /> Loading...
    </div>
);

const SuspenseFallback = () => {
    const location = useLocation();
    const path = location.pathname || '';
    // Jobs table skeleton
    if (path.includes('/dashboard/jobs')) {
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
    if (path.includes('/dashboard/customers')) {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--list">
                <SkeletonLoader type="customer-list" count={8} />
            </div>
        );
    }

    // Billing skeleton
    if (path.includes('/dashboard/billing')) {
        return (
            <div className="skeleton-wrapper skeleton-wrapper--table">
                <SkeletonLoader type="form" />
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

    return PageLoader();
};

const DashboardHome = () => {
    const { user } = useAuth();
    if (!user?.role) return <Summary />;
    if (user.role === 'Admin') return <Summary />;
    if (user.role === 'Front Office') return <FrontOffice />;
    if (user.role === 'Accountant') return <AccountantDashboard />;
    if (user.role === 'Other Staff') return <OtherStaffDashboard />;
    if (user.role === 'Designer') return <DesignerDashboard />;
    return <Jobs />;
};

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
    const [chatbotUnlabeledCount, setChatbotUnlabeledCount] = useState(0);
    const [showInventoryScan, setShowInventoryScan] = useState(false);
    const [inventoryScanResult, setInventoryScanResult] = useState(null);
    const [inventoryScanLoading, setInventoryScanLoading] = useState(false);
    const [showPaperPanel, setShowPaperPanel] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [anomalyCount, setAnomalyCount] = useState(0);
    const [companyInfo, setCompanyInfo] = useState({ name: 'SARGA', logo: null });

    const fetchCompanyInfo = useCallback(async () => {
        try {
            const { data } = await api.get('/company-settings');
            if (data?.company_name) {
                setCompanyInfo({
                    name: data.company_name.toUpperCase(),
                    logo: data.company_logo_url
                });
            }
        } catch (err) { /* ignore */ }
    }, []);

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

    const { t } = useTranslation();

    const menuItems = [
        // Main dashboards
        { key: 'dashboard', name: t('summary', 'Summary'), icon: Grid, path: '/dashboard', roles: ['Admin'], group: 'main' },
        { key: 'dashboard', name: t('front_office', 'Front Office'), icon: Grid, path: '/dashboard', roles: ['Front Office'], group: 'main' },
        { key: 'dashboard', name: t('dashboard', 'Dashboard'), icon: Grid, path: '/dashboard', roles: ['Accountant', 'Other Staff'] },
        // Business operations
        { key: 'customers', name: t('customers', 'Customers'), icon: UserSquare, path: '/dashboard/customers', roles: ['Admin', 'Front Office', 'Accountant'], group: 'business' },
        { key: 'billing', name: t('billing', 'Billing'), icon: Receipt, path: '/dashboard/billing', roles: ['Front Office'], group: 'business' },
        { key: 'jobs', name: t('orders', 'Orders'), icon: ClipboardList, path: '/dashboard/jobs', roles: ['Front Office'] },
        { key: 'jobs', name: t('jobs_orders', 'Jobs & Orders'), icon: ClipboardList, path: '/dashboard/jobs', roles: ['Admin', 'Accountant'], group: 'business' },
        { key: 'customers', name: t('customer_payments', 'Customer Payments'), icon: Receipt, path: '/dashboard/customer-payments', roles: ['Admin', 'Front Office'], group: 'business' },
        // Inventory & Operations
        { key: 'inventory', name: t('inventory', 'Inventory'), icon: Box, path: '/dashboard/inventory', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        { key: 'inventory', name: t('paper_inventory', 'Paper Inventory'), icon: FileText, path: '/dashboard/paper/stock', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        { key: 'inventory', name: t('inventory', 'Consumables Inventory'), icon: Package, path: '/dashboard/inventory/consumables', roles: ['Admin', 'Front Office', 'Accountant'], group: 'inventory' },
        { key: 'operations', name: t('stock_verification', 'Stock Verification'), icon: Box, path: '/dashboard/stock-verification', roles: ['Accountant', 'Admin'], group: 'operations' },
        { key: 'operations', name: t('stock_planning', 'Stock Planning'), icon: Package, path: '/dashboard/stock-planning', roles: ['Admin', 'Front Office', 'Accountant'], group: 'operations' },
        { key: 'operations', name: t('product_library', 'Product Library'), icon: Grid, path: '/dashboard/products', roles: ['Admin', 'Front Office', 'Designer'], group: 'operations' },
        { key: 'operations', name: 'Product Requests', icon: ShieldAlert, path: '/dashboard/product-requests', roles: ['Admin', 'Accountant'], group: 'operations' },
        { key: 'operations', name: t('plate_management', 'Plate Management'), icon: Layers, path: '/dashboard/plates', roles: ['Designer', 'Admin'], group: 'operations' },
        { key: 'operations', name: t('machine_management', 'Machine Management'), icon: Settings, path: '/dashboard/machines', roles: ['Admin', 'Front Office'], group: 'operations' },
        { key: 'operations', name: t('paper_layout', 'Paper Layout'), icon: Layers, path: '/dashboard/paper-layout', roles: ['Front Office', 'Designer'], group: 'operations' },
        { key: 'operations', name: t('production_tracker', 'Production Tracker'), icon: Layers, path: '/dashboard/production-tracker', roles: ['Admin', 'Front Office'], group: 'operations' },
        { key: 'operations', name: 'Rate Calculator', icon: Calculator, path: '/dashboard/rate-calculator', roles: ['Admin', 'Front Office', 'Accountant'], group: 'operations' },
        // Staff & HR
        { key: 'manage', name: t('staff', 'Staff'), icon: Users, path: '/dashboard/staff', roles: ['Front Office'], group: 'manage' },
        { key: 'manage', name: t('staff_management', 'Staff Management'), icon: Users, path: '/dashboard/staff', roles: ['Admin', 'Accountant'], group: 'manage' },
        { key: 'manage', name: t('branches', 'Branches'), icon: Building2, path: '/dashboard/branches', roles: ['Admin'], group: 'manage' },
        { key: 'manage', name: t('requests', 'Requests'), icon: ShieldAlert, path: '/dashboard/requests', roles: ['Admin', 'Accountant'], group: 'manage' },
        { key: 'manage', name: t('manage', 'Coupons'), icon: Tag, path: '/dashboard/coupons', roles: ['Admin'], group: 'manage' },
        { key: 'manage', name: t('manage', 'CCTV Attendance'), icon: Camera, path: '/dashboard/cctv-attendance', roles: ['Admin', 'Accountant'], group: 'manage' },
        { key: 'manage', name: t('manage', 'CCTV Management'), icon: Camera, path: '/dashboard/cctv-management', roles: ['Admin'], group: 'manage' },
        { key: 'manage', name: t('manage', 'Schedules & Time'), icon: Clock, path: '/dashboard/schedules', roles: ['Admin', 'Accountant'], group: 'manage' },
        // Finance & Reports
        { key: 'expenses', name: t('expense_manager', 'Expense Manager'), icon: Receipt, path: '/dashboard/expenses', roles: ['Admin', 'Front Office', 'Accountant'], group: 'finance' },
        { key: 'expenses', name: t('vendors', 'Vendors'), icon: Store, path: '/dashboard/vendors', roles: ['Admin', 'Accountant', 'Front Office'], group: 'finance' },
        { key: 'expenses', name: t('finance', 'Payment Verification'), icon: FileCheck, path: '/dashboard/payment-verification', roles: ['Accountant', 'Admin'], group: 'finance' },
        { key: 'expenses', name: t('finance', 'Accounts & GST'), icon: Receipt, path: '/dashboard/accounts', roles: ['Accountant', 'Admin'], group: 'finance' },
        { key: 'reports', name: t('daily_report', 'Daily Report'), icon: BookOpen, path: '/dashboard/daily-report', roles: ['Front Office', 'Admin', 'Accountant'], group: 'business' },
        { key: 'internal', name: t('internal_transactions', 'Internal Transactions'), icon: BookOpen, path: '/dashboard/internal-transactions', roles: ['Admin', 'Accountant', 'Front Office'], group: 'internal' },
        { key: 'internal', name: t('internal', 'Stock Transfer'), icon: Package, path: '/dashboard/stock-transfer', roles: ['Admin', 'Accountant', 'Front Office'], group: 'internal' },
        { key: 'internal', name: t('internal', 'Internal Billing'), icon: Receipt, path: '/dashboard/internal-billing', roles: ['Admin', 'Accountant', 'Front Office'], group: 'internal' },
        // AI Features
        { key: 'operations', name: t('design_check', 'Design Check'), icon: FileCheck, path: '/dashboard/design-check', roles: ['Designer'] },
        // Role-specific dashboards
        { key: 'jobs', name: t('assigned_jobs', 'Assigned Jobs'), icon: ClipboardList, path: '/dashboard/designer-dashboard', roles: ['Designer'], group: 'business' },
        { key: 'jobs', name: t('assigned_jobs', 'Assigned Jobs'), icon: ClipboardList, path: '/dashboard/printer-dashboard', roles: ['Printer'], group: 'business' },
        // ERP Features
        { key: 'billing', name: t('quotes_estimates', 'Quotes & Estimates'), icon: Receipt, path: '/dashboard/quotes', roles: ['Admin', 'Front Office', 'Accountant'], group: 'business' },
        { key: 'finance', name: t('recurring_invoices', 'Recurring Invoices'), icon: ClipboardList, path: '/dashboard/recurring-invoices', roles: ['Admin', 'Accountant'], group: 'finance' },
        { key: 'manage', name: t('settings', 'Settings'), icon: Settings, path: '/dashboard/settings', roles: ['Admin'], group: 'manage' },
        { key: 'manage', name: 'Chatbot Training', icon: Brain, path: '/dashboard/admin/chatbot-training', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Reviews', icon: Star, path: '/dashboard/admin/reviews', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Artwork Uploads', icon: Upload, path: '/dashboard/admin/artwork', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Portfolio', icon: Image, path: '/dashboard/admin/portfolio', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Promotions', icon: Tag, path: '/dashboard/admin/promotions', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Pickup Bookings', icon: Calendar, path: '/dashboard/admin/pickup-bookings', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Delivery Rules', icon: Truck, path: '/dashboard/admin/delivery-rules', roles: ['Admin'], group: 'website' },
        { key: 'manage', name: 'Translations', icon: Globe, path: '/dashboard/admin/translations', roles: ['Admin'], group: 'website' },
        { key: 'operations', name: 'Web Inquiries', icon: MessageSquare, path: '/dashboard/web-inquiries', roles: ['Admin', 'Front Office'], group: 'website' },
        { key: 'operations', name: 'Blog Journal CMS', icon: BookOpen, path: '/dashboard/blog-cms', roles: ['Admin', 'Front Office', 'Designer'], group: 'website' },
        { key: 'sample_requests', name: 'Sample Requests', icon: FileCheck, path: '/dashboard/sample-requests', roles: ['Admin', 'Front Office', 'Accountant'], group: 'website' },
        { key: 'design_bookings', name: 'Design Bookings', icon: ClipboardList, path: '/dashboard/design-bookings', roles: ['Admin', 'Front Office', 'Designer'], group: 'website' },
    ];

    const filteredMenu = useMemo(() => {
        let items = menuItems.filter(item => item.roles.includes(user?.role));
        
        if (user?.settings) {
            try {
                const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
                if (settings.sidebar) {
                    items = items.filter(item => {
                        // If setting exists for this key and is false, hide it
                        if (settings.sidebar[item.key] === false) return false;
                        return true;
                    });
                }
            } catch (e) {
                console.error('Error parsing user settings:', e);
            }
        }
        return items;
    }, [user, t]);

    // Collapsible sidebar groups for Admin
    const sidebarGroupDefs = [
        { key: 'main', label: null },
        { key: 'business', label: 'Business' },
        { key: 'inventory', label: 'Inventory' },
        { key: 'internal', label: 'Internal' },
        { key: 'finance', label: 'Finance' },
        { key: 'manage', label: 'Administration' },
        { key: 'analytics', label: 'Analytics' },
        { key: 'operations', label: 'Operations' },
        { key: 'website', label: 'Website' },
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

    const fetchChatbotCounts = async () => {
        if (user?.role !== 'Admin') return;
        try {
            const res = await api.get('chatbot/model-status');
            setChatbotUnlabeledCount(res.data.unlabeled || 0);
        } catch (e) {
            // ignore
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
    usePolling(fetchChatbotCounts, 60000, user?.role === 'Admin');

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

    // Fetch and listen for company settings updates
    useEffect(() => {
        fetchCompanyInfo();
        window.addEventListener('companySettingsUpdated', fetchCompanyInfo);
        return () => window.removeEventListener('companySettingsUpdated', fetchCompanyInfo);
    }, [fetchCompanyInfo]);

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
                        {companyInfo.logo ? (
                           <img src={companyInfo.logo} alt={companyInfo.name} className="logo-img" />
                        ) : (
                           <img src="/icons/icon-192.png" alt="Sarga" className="logo-img" />
                        )}
                        <span className="logo-text">{companyInfo.name}</span>
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
                                                    {item.path === '/dashboard/admin/chatbot-training' && chatbotUnlabeledCount > 0 && (
                                                        <span className="side-badge">{chatbotUnlabeledCount}</span>
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
                            className="nav-item nav-item--button"
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
                    {/* Removed duplicate Paper Inventory quick button to avoid sidebar duplication. */}
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
                    <button className="btn btn-ghost btn--full mt-16 btn--danger" onClick={handleLogout}>
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
                    <div className="logo-text">{companyInfo.name}</div>
                    <div className="topbar-actions">
                        {anomalyCount > 0 && ['Admin', 'Accountant', 'Front Office'].includes(user?.role) && (
                            <span className="anomaly-badge" title={`${anomalyCount} anomalies detected`}>
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
                    <div className="ai-panels">
                        <InsightsPanel />
                        <AnomalyPanel />
                    </div>
                )}

                    <div className={`content-container ${isNavigating ? 'page-enter' : 'page-enter-active'}`} key={location.pathname}>
                    <Suspense fallback={<SuspenseFallback />}>
                        <Routes>
                            <Route path="" element={<DashboardHome />} />
                            <Route path="billing" element={<Billing />} />
                            <Route path="staff" element={<StaffManagement />} />
                            <Route path="employee/:staffId" element={<EmployeeDetail />} />
                            <Route path="branches" element={<Branches />} />
                            <Route path="customers" element={<Customers />} />
                            <Route path="customers/:id" element={<CustomerDetails />} />
                            <Route path="products" element={<ProductLibrary />} />
                            <Route path="product-requests" element={<ProductRequests />} />
                            <Route path="jobs" element={<Jobs />} />
                            <Route path="jobs/:id" element={<JobDetail />} />
                            <Route path="requests" element={<IDChangeRequests />} />
                            <Route path="inventory" element={<Inventory />} />
                            <Route path="inventory/overview" element={<InventoryOverview />} />
                            <Route path="stock-verification" element={<StockVerification />} />
                            <Route path="stock-planning" element={<RequiresConnection feature="Stock Planning"><StockPlanning /></RequiresConnection>} />
                            <Route path="customer-payments" element={<CustomerPayments />} />
                            <Route path="payment-verification" element={<PaymentVerification />} />
                            <Route path="expenses" element={<ExpenseManager />} />
                            <Route path="vendors/*" element={<Vendors />} />
                            <Route path="machines" element={<MachineManagement />} />
                            <Route path="daily-report" element={<DailyReport />} />
                            <Route path="internal-transactions" element={<InternalTransactions />} />
                            <Route path="internal-billing" element={<InternalBilling />} />
                            <Route path="stock-transfer" element={<StockTransfer />} />
                            <Route path="attendance-salary" element={<AttendanceSalary />} />
                            <Route path="ai-monitoring" element={<RequiresConnection feature="AI Monitoring"><AIMonitoring /></RequiresConnection>} />
                            <Route path="design-check" element={<RequiresConnection feature="Design Checker"><DesignChecker /></RequiresConnection>} />
                            <Route path="paper-layout" element={<RequiresConnection feature="Paper Layout Generator"><PaperLayoutGenerator /></RequiresConnection>} />
                            <Route path="job-priority" element={<JobPriority />} />
                                <Route path="sales-prediction" element={<RequiresConnection feature="Sales Prediction"><SalesPrediction /></RequiresConnection>} />
                                <Route path="reports" element={<Reports />} />
                            <Route path="accounts" element={<RequiresConnection feature="Accounts & GST"><Accounts /></RequiresConnection>} />
                            <Route path="plates" element={<PlateManagement />} />
                            <Route path="order-predictions" element={<RequiresConnection feature="Order Predictions"><OrderPredictions /></RequiresConnection>} />
                            <Route path="predictions" element={<RequiresConnection feature="Sales Prediction"><SalesPrediction /></RequiresConnection>} />
                            <Route path="production-tracker" element={<RequiresConnection feature="Production Tracker"><ProductionTracker /></RequiresConnection>} />
                            <Route path="rate-calculator" element={<RateCalculator />} />
                            <Route path="coupons" element={<CouponManagement />} />
                            <Route path="cctv-attendance" element={<CCTVAttendance />} />
                            <Route path="cctv-management" element={<CCTVManagement />} />
                            <Route path="schedules" element={<ScheduleManagement />} />
                            <Route path="other-staff-dashboard" element={<OtherStaffDashboard />} />
                            <Route path="printer-dashboard" element={<PrinterDashboard />} />
              <Route path="designer-dashboard" element={<DesignerDashboard />} />
                            <Route path="quotes" element={<Quotes />} />
                            <Route path="inventory/paper" element={<PaperStockDashboard />} />
                            <Route path="paper/stock" element={<PaperStockDashboard />} />
                            <Route path="paper/inward" element={<PaperInward />} />
                            <Route path="paper/outward" element={<PaperOutward />} />
                            <Route path="paper/movements" element={<PaperMovementHistory />} />
                            <Route path="paper/alerts" element={<PaperAlerts />} />
                            <Route path="paper/transfer" element={<PaperTransfer />} />
                            <Route path="inventory/consumables" element={<ConsumablesManagement />} />
                            <Route path="recurring-invoices" element={<RecurringInvoices />} />
                            <Route path="settings" element={<SettingsPage />} />
                            <Route path="admin/chatbot-training" element={<ChatbotTraining />} />
                            <Route path="admin/reviews" element={<ReviewsManagement />} />
                            <Route path="admin/artwork" element={<ArtworkManager />} />
                            <Route path="admin/portfolio" element={<PortfolioManager />} />
                            <Route path="admin/promotions" element={<PromotionsManager />} />
                            <Route path="admin/pickup-bookings" element={<PickupBookings />} />
                            <Route path="admin/delivery-rules" element={<DeliveryRulesManager />} />
                            <Route path="admin/translations" element={<TranslationsManager />} />
                            <Route path="web-inquiries" element={<WebInquiries />} />
                            <Route path="blog-cms" element={<BlogCMS />} />
                            <Route path="sample-requests" element={<SampleRequestsCMS />} />
                            <Route path="design-bookings" element={<DesignBookingsCMS />} />
                            <Route path="*" element={<NotFound />} />

                        </Routes>
                    </Suspense>
                </div>
            </main>

            {showProfilePanel && (
                <div className="modal-backdrop modal-backdrop--high">
                    <div className="modal modal--profile-panel">
                        {/* Profile Header */}
                        <div className="profile-panel-header">
                            <div className="user-avatar user-avatar--large">
                                {user?.image_url ? (
                                    <SecureImage src={user.image_url} alt={user.name} className="avatar-img" />
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
                                Edit Profile
                            </button>
                            <button className="modal-close modal-close--static" aria-label="Close profile panel" onClick={() => setShowProfilePanel(false)} title="Close"><X size={20} /></button>
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
                            <div className="profile-panel-empty">
                                Click <strong>Edit Profile</strong> to update your name or photo.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showProfileModal && (
                <div className="modal-backdrop">
                    <div className="modal modal--profile">
                        <button className="modal-close" aria-label="Close profile modal" onClick={() => setShowProfileModal(false)} title="Close"><X size={20} /></button>
                        <h2 className="section-title mb-16">Edit Profile</h2>
                        <form onSubmit={handleProfileSave} className="stack-md">
                            <div className="row gap-md items-center">
                                <div className="user-avatar user-avatar--medium">
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
                <div className="modal-backdrop modal-backdrop--medium">
                    <div className="modal modal--scan-loading">
                        <Loader2 size={32} className="animate-spin modal-loader-icon" />
                        <div className="modal-loading-title">Looking up item…</div>
                        <div className="muted modal-loading-subtitle">Reading scanned code</div>
                    </div>
                </div>
            )}

            {/* Inventory Scan Result */}
            {inventoryScanResult && (
                <div className="modal-backdrop modal-backdrop--low">
                    <div className="modal modal--scan-result">
                        <div className="row space-between items-center mb-16">
                            <h2 className="section-title">Product Details</h2>
                            <button className="icon-button" aria-label="Close product details" onClick={() => setInventoryScanResult(null)}><X size={20} /></button>
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
                                    <div className="muted scan-result-stat__label">Qty Available</div>
                                    <div className={`scan-result-stat__value ${inventoryScanResult.quantity <= (inventoryScanResult.reorder_level || 0) ? 'scan-result-stat__value--error' : 'scan-result-stat__value--success'}`}>
                                        {inventoryScanResult.quantity} {inventoryScanResult.unit || ''}
                                    </div>
                                </div>
                            </div>
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
            {showPaperPanel && (
                <PaperSidePanel open={showPaperPanel} onClose={() => setShowPaperPanel(false)} />
            )}
        </div>
    );
};

export default Dashboard;

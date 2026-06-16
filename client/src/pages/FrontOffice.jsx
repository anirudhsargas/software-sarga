import { useSEO } from '../hooks/useSEO';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import usePolling from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import {
    ShoppingBag, Clock, CheckCircle2, IndianRupee, TrendingUp, Truck,
    Search, Plus, UserPlus, Phone, ArrowRight, Calendar, AlertTriangle,
    Receipt, Printer, MessageSquare, RefreshCw, ChevronRight, ChevronLeft, Loader2,
    Wallet, Users, Package, Eye, CreditCard, X, Edit3, Check, ChevronDown, ChevronUp, List, LayoutGrid, Monitor
} from 'lucide-react';
import api from '../services/api';
import { whatsappUrl, dueCollectionMessage, paymentReminderMessage } from '../utils/whatsapp';
import localDb from '../services/localDb';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/formatters';

import { serverNow, serverToday } from '../services/serverTime';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import QuickActionsDashboard from '../components/quickbilling/QuickActionsDashboard';

const OPENING_TABS = [
    { key: 'Offset', label: 'Offset', color: 'var(--accent)' },
    { key: 'Laser',  label: 'Laser',  color: 'var(--accent)' },
    { key: 'Other',  label: 'Other',  color: 'var(--success)' },
];

const FrontOffice = () => {
    useSEO('Front Office');

    const navigate = useNavigate();
    const user = auth.getUser();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [showSearchResults, setShowSearchResults] = useState(false);
    const [activeTab, setActiveTab] = useState('queue');
    const searchRef = useRef(null);
    const searchTimeout = useRef(null);

    // Completed work state
    const [completedJobs, setCompletedJobs] = useState([]);
    const [completedLoading, setCompletedLoading] = useState(false);
    const [completedView, setCompletedView] = useState('grouped'); // 'list' | 'grouped'
    const [completedPage, setCompletedPage] = useState(1);
    const [completedTotal, setCompletedTotal] = useState(0);
    const [completedTotalPages, setCompletedTotalPages] = useState(1);
    const PAGE_SIZE = 50;

    // Active Jobs pagination state
    const [activeJobs, setActiveJobs] = useState([]);
    const [activeLoading, setActiveLoading] = useState(false);
    const [activePage, setActivePage] = useState(1);
    const [activeTotal, setActiveTotal] = useState(0);
    const [activeTotalPages, setActiveTotalPages] = useState(1);

    // Due Collection pagination state
    const [dueCustomers, setDueCustomers] = useState([]);
    const [dueLoading, setDueLoading] = useState(false);
    const [duePage, setDuePage] = useState(1);
    const [dueTotal, setDueTotal] = useState(0);
    const [dueTotalPages, setDueTotalPages] = useState(1);

    // Overdue pagination state
    const [overdueJobs, setOverdueJobs] = useState([]);
    const [overdueLoading, setOverdueLoading] = useState(false);
    const [overduePage, setOverduePage] = useState(1);
    const [overdueTotal, setOverdueTotal] = useState(0);
    const [overdueTotalPages, setOverdueTotalPages] = useState(1);

    // Recent Payments pagination state
    const [recentPayments, setRecentPayments] = useState([]);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [paymentsPage, setPaymentsPage] = useState(1);
    const [paymentsTotal, setPaymentsTotal] = useState(0);
    const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);

    // Delivered Jobs pagination state
    const [deliveredJobs, setDeliveredJobs] = useState([]);
    const [deliveredLoading, setDeliveredLoading] = useState(false);
    const [deliveredPage, setDeliveredPage] = useState(1);
    const [deliveredTotal, setDeliveredTotal] = useState(0);
    const [deliveredTotalPages, setDeliveredTotalPages] = useState(1);

    // Opening balance prompt
    const [showOpeningPrompt, setShowOpeningPrompt] = useState(false);
    const [promptBalances, setPromptBalances] = useState({ Offset: '', Laser: '', Other: '' });
    const [promptMachines, setPromptMachines] = useState([]);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [prevClosing, setPrevClosing] = useState({ Offset: 0, Laser: 0, Other: 0 });

    const [expandedCustomers, setExpandedCustomers] = useState(new Set());
    const [editingWorkName, setEditingWorkName] = useState(null); // job id being edited
    const [workNameInput, setWorkNameInput] = useState('');
    const [savingWorkName, setSavingWorkName] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [attendanceReminder, setAttendanceReminder] = useState(null);

    // ─── Data Fetch ──────────────────────────────────────────────
    // --- Optimized Dashboard Loader: cache-first, then background refresh ---
    const loadDashboard = useCallback(async () => {
        // Fetch fresh data
        try {
            const fresh = await api.get('/front-office/dashboard');
            const serverData = fresh.data;

            // Include local pending bills in stats
            try {
                const pendingBills = await localDb.getJobs();
                const localBills = pendingBills.filter(j => j._isLocal && j.syncStatus === 'pending');
                const today = new Date().toDateString();
                const todayLocalBills = localBills.filter(j => 
                    j.created_at && new Date(j.created_at).toDateString() === today
                );

                // Merge local bills into stats
                const mergedData = {
                    ...serverData,
                    stats: {
                        ...serverData.stats,
                        today_orders: (serverData.stats?.today_orders || 0) + todayLocalBills.length,
                        in_progress: (serverData.stats?.in_progress || 0) + localBills.filter(j => j.status === 'pending').length
                    }
                };
                setData(mergedData);
            } catch (localErr) {
                console.error('Failed to load local bills for dashboard:', localErr);
                // Fallback to server data only
                setData(serverData);
            }
            setError('');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    }, []);

    // We can still poll locally just to refresh the UI if background sync updated something
    usePolling(() => loadDashboard(), 30000);

    const fetchAttendanceReminder = useCallback(async () => {
        if (!['Front Office', 'front office'].includes(user?.role)) return;
        try {
            const res = await api.get('/front-office/attendance-reminder');
            setAttendanceReminder(res.data || null);
        } catch (err) {
            void err;
            setAttendanceReminder(null);
        }
    }, [user?.role]);

    useEffect(() => {
        if (!['Front Office', 'front office'].includes(user?.role)) return;
        fetchAttendanceReminder();
        const id = setInterval(fetchAttendanceReminder, 60 * 1000);
        return () => clearInterval(id);
    }, [fetchAttendanceReminder, user?.role]);

    // ─── Opening Balance Check (Front Office only) ────────────────
    useEffect(() => {
        const user = auth.getUser();
        if (user?.role !== 'Front Office') return;
        const today = serverToday();
        (async () => {
            try {
                // Fetch which cash books this staff is assigned to
                let assignedBooks = [];
                try {
                    const booksRes = await api.get('/machines/my-books');
                    assignedBooks = booksRes.data || [];
                } catch (err) { void err; assignedBooks = []; }

                const res = await api.get('/daily-report/opening-balance', { params: { date: today } });
                const balances = res.data.balances || res.data;
                const locked = res.data.locked || {};
                const relevantBooks = assignedBooks.length > 0 ? assignedBooks : [];
                const anyEntered = relevantBooks.some(b => Number(balances[b]) > 0);
                const anyLocked = relevantBooks.some(b => locked[b]);

                // Use laser-live to get assigned digital machines + their has_reading status for today
                // This is the authoritative source — no dependency on previous-closing field
                let myMachines = [];
                let machineHasReading = {}; // { machine_id: true/false }
                try {
                    const laserRes = await api.get('/daily-report/laser-live', { params: { date: today } });
                    myMachines = laserRes.data.machines || [];
                    myMachines.forEach(m => { machineHasReading[m.id] = !!m.has_reading; });
                } catch (err) { void err; }

                // Fetch previous closing for pre-filling counter values
                let prevData = { Offset: 0, Laser: 0, Other: 0, machines: {} };
                try {
                    const prevRes = await api.get('/daily-report/previous-closing', { params: { date: today } });
                    prevData = prevRes.data;
                } catch (err) { void err; }

                // Machines that don't yet have a reading today
                const unenteredMachines = myMachines.filter(m => !machineHasReading[m.id]);

                const needsBalances = relevantBooks.length > 0 && !anyEntered && !anyLocked;
                const needsMachines = unenteredMachines.length > 0;

                if (needsBalances || needsMachines) {
                    setPrevClosing({ Offset: prevData.Offset || 0, Laser: prevData.Laser || 0, Other: prevData.Other || 0 });
                    setPromptMachines(unenteredMachines.map(m => ({
                        id: m.id, machine_name: m.machine_name, location: m.location,
                        opening_count: prevData.machines?.[m.id] !== undefined ? String(prevData.machines[m.id]) : '',
                        error: null
                    })));
                    // Only include books that actually need to be entered (not already saved/locked)
                    const newBalances = {};
                    if (needsBalances) {
                        relevantBooks.forEach(b => {
                            newBalances[b] = prevData[b] > 0 ? String(prevData[b]) : '';
                        });
                    }
                    setPromptBalances(newBalances);
                    setShowOpeningPrompt(true);
                }
            } catch (err) { console.error('Opening balance check error:', err); }
        })();
    }, []);

    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        const today = serverToday();
        try {
            // Save opening balances — ignore 403 (already locked from a previous attempt)
            const books = Object.keys(promptBalances);
            for (const bookType of books) {
                try {
                    await api.put('/daily-report/opening-balance', {
                        date: today, book_type: bookType, cash_opening: parseFloat(promptBalances[bookType]) || 0
                    });
                } catch (err) {
                    if (err.response?.status !== 403) throw err; // only ignore "already locked"
                }
            }

            // Save machine readings — handle each individually, keep prompt open if any fail
            let updatedMachines = [...promptMachines];
            let hasErrors = false;
            for (let i = 0; i < updatedMachines.length; i++) {
                const m = updatedMachines[i];
                const val = m.opening_count;
                if (val === '' || val === null) {
                    updatedMachines[i] = { ...m, error: 'Please enter a counter reading' };
                    hasErrors = true;
                    continue;
                }
                try {
                    await api.post(`/machines/${m.id}/readings`, {
                        reading_date: today, opening_count: parseInt(val) || 0
                    });
                    updatedMachines[i] = { ...m, error: null };
                } catch (err) {
                    if (err.response?.status === 403) {
                        // Already locked — treat as saved, remove from prompt
                        updatedMachines[i] = { ...m, error: null };
                    } else {
                        updatedMachines[i] = { ...m, error: err.response?.data?.error || `Failed to save ${m.machine_name}` };
                        hasErrors = true;
                    }
                }
            }

            if (hasErrors) {
                setPromptMachines(updatedMachines);
                setSavingPrompt(false);
                return; // keep prompt open so user can fix errors
            }

            toast.success('Opening values saved!');
            setShowOpeningPrompt(false);
        } catch (err) {
            console.error('Save opening prompt error:', err);
            toast.error(err.response?.data?.error || 'Failed to save opening values');
        } finally {
            setSavingPrompt(false);
        }
    };

    // Fetch completed jobs when tab is active
    const fetchCompleted = useCallback(async (pg) => {
        setCompletedLoading(true);
        try {
            const res = await api.get(`front-office/completed?page=${pg}&limit=${PAGE_SIZE}`);
            const d = res.data;
            setCompletedJobs(d.data || []);
            setCompletedTotal(d.total || 0);
            setCompletedTotalPages(d.totalPages || 1);
        } catch {
            toast.error('Failed to load completed work');
        } finally {
            setCompletedLoading(false);
        }
    }, []); 


    useEffect(() => {
        if (activeTab === 'completed') fetchCompleted(completedPage);
    }, [activeTab, completedPage, fetchCompleted]);

    // Fetch active jobs
    const fetchActiveJobs = useCallback(async (pg) => {
        setActiveLoading(true);
        try {
            const res = await api.get(`front-office/active-jobs?page=${pg}&limit=${PAGE_SIZE}`);
            const d = res.data;
            let serverJobs = d.data || [];

            // Include local pending bills as jobs
            try {
                const pendingBills = await localDb.getJobs({ status: 'pending' });
                const localJobs = pendingBills.filter(j => j._isLocal && j.syncStatus === 'pending');
                // Merge local jobs with server jobs, sort by created_at
                const allJobs = [...localJobs, ...serverJobs].sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                );
                setActiveJobs(allJobs);
                setActiveTotal(allJobs.length);
                setActiveTotalPages(Math.ceil(allJobs.length / PAGE_SIZE));
            } catch (localErr) {
                console.error('Failed to load local jobs:', localErr);
                // Fallback to server jobs only
                setActiveJobs(serverJobs);
                setActiveTotal(d.total || 0);
                setActiveTotalPages(d.totalPages || 1);
            }
        } catch { toast.error('Failed to load active jobs'); }
        finally { setActiveLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'queue') fetchActiveJobs(activePage);
    }, [activeTab, activePage, fetchActiveJobs]);

    // Fetch due customers
    const fetchDueCustomers = useCallback(async (pg) => {
        setDueLoading(true);
        try {
            const res = await api.get(`front-office/due-customers?page=${pg}&limit=${PAGE_SIZE}`);
            const d = res.data;
            setDueCustomers(d.data || []);
            setDueTotal(d.total || 0);
            setDueTotalPages(d.totalPages || 1);
        } catch { toast.error('Failed to load due customers'); }
        finally { setDueLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'dues') fetchDueCustomers(duePage);
    }, [activeTab, duePage, fetchDueCustomers]);

    // Fetch overdue jobs
    const fetchOverdueJobs = useCallback(async (pg) => {
        setOverdueLoading(true);
        try {
            const res = await api.get(`front-office/overdue-jobs?page=${pg}&limit=${PAGE_SIZE}`);
            const d = res.data;
            setOverdueJobs(d.data || []);
            setOverdueTotal(d.total || 0);
            setOverdueTotalPages(d.totalPages || 1);
        } catch { toast.error('Failed to load overdue jobs'); }
        finally { setOverdueLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'overdue') fetchOverdueJobs(overduePage);
    }, [activeTab, overduePage, fetchOverdueJobs]);

    // Fetch recent payments
    const fetchRecentPayments = useCallback(async (pg) => {
        setPaymentsLoading(true);
        try {
            const res = await api.get(`front-office/recent-payments?page=${pg}&limit=${PAGE_SIZE}`);
            const d = res.data;
            setRecentPayments(d.data || []);
            setPaymentsTotal(d.total || 0);
            setPaymentsTotalPages(d.totalPages || 1);
        } catch { toast.error('Failed to load recent payments'); }
        finally { setPaymentsLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'payments') fetchRecentPayments(paymentsPage);
    }, [activeTab, paymentsPage, fetchRecentPayments]);

    // Fetch delivered jobs
    const fetchDeliveredJobs = useCallback(async (pg) => {
        setDeliveredLoading(true);
        try {
            const res = await api.get(`front-office/delivered?page=${pg}&limit=${PAGE_SIZE}`);
            const d = res.data;
            setDeliveredJobs(d.data || []);
            setDeliveredTotal(d.total || 0);
            setDeliveredTotalPages(d.totalPages || 1);
        } catch { toast.error('Failed to load delivered jobs'); }
        finally { setDeliveredLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'delivered') fetchDeliveredJobs(deliveredPage);
    }, [activeTab, deliveredPage, fetchDeliveredJobs]);

    // Group completed jobs by customer
    const groupedCompleted = useMemo(() => {
        const map = new Map();
        completedJobs.forEach(job => {
            const key = job.customer_id || 'walk-in';
            if (!map.has(key)) {
                map.set(key, {
                    customer_id: job.customer_id,
                    customer_name: job.customer_name,
                    customer_mobile: job.customer_mobile,
                    jobs: [],
                    total_amount: 0,
                    total_balance: 0
                });
            }
            const group = map.get(key);
            group.jobs.push(job);
            group.total_amount += Number(job.total_amount || 0);
            group.total_balance += Number(job.balance_amount || 0);
        });
        return Array.from(map.values()).sort((a, b) => b.jobs.length - a.jobs.length);
    }, [completedJobs]);

    const toggleCustomerExpand = (customerId) => {
        setExpandedCustomers(prev => {
            const next = new Set(prev);
            if (next.has(customerId)) next.delete(customerId);
            else next.add(customerId);
            return next;
        });
    };

    const startEditWorkName = (job) => {
        setEditingWorkName(job.id);
        setWorkNameInput(job.description || '');
    };

    const saveWorkName = async (jobId) => {
        setSavingWorkName(true);
        try {
            await api.patch(`/front-office/jobs/${jobId}/work-name`, { work_name: workNameInput });
            setCompletedJobs(prev => prev.map(j => j.id === jobId ? { ...j, description: workNameInput.trim() } : j));
            setEditingWorkName(null);
            toast.success('Work name saved');
        } catch {
            toast.error('Failed to save work name');
        } finally {
            setSavingWorkName(false);
        }
    };

    useEffect(() => {
        loadDashboard();
        const handlePaymentUpdate = () => {
            loadDashboard();
        };
        window.addEventListener('paymentRecorded', handlePaymentUpdate);
        return () => {
            window.removeEventListener('paymentRecorded', handlePaymentUpdate);
        };
    }, [loadDashboard]);

    // ─── Customer Search ─────────────────────────────────────────
    const handleSearch = (val) => {
        setSearch(val);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (val.length < 2) {
            setSearchResults([]);
            setShowSearchResults(false);
            return;
        }
        searchTimeout.current = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const results = await localDb.searchCustomersLocal(val);
                setSearchResults(results);
                setShowSearchResults(true);
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 150);
    };

    // Close search dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSearchResults(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ─── Keyboard Shortcuts ──────────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            const key = e.key.toLowerCase();
            const isMod = e.ctrlKey || e.metaKey;

            // Ctrl+K or Cmd+K → focus search
            if (isMod && key === 'k') {
                e.preventDefault();
                document.getElementById('fo-search')?.focus();
            }
            // Alt+N → new order (billing)
            if (e.altKey && key === 'n') {
                e.preventDefault();
                e.stopImmediatePropagation();
                navigate('/dashboard/sales/invoices', { state: { action: 'create' } });
            }
            // Alt+P → customer payments
            if (e.altKey && key === 'p') {
                e.preventDefault();
                e.stopImmediatePropagation();
                navigate('/dashboard/sales/payments');
            }
        };
        // Use capture phase to intercept before browser defaults if possible
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [navigate]);

    // ─── Helpers ─────────────────────────────────────────────────
    const fmt = (v) => { const n = Number(v); return (v !== null && v !== undefined && v !== '' && !isNaN(n)) ? formatCurrency(n) : '—'; };
    const fmtDate = (d) => {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    };
    const daysUntil = (d) => {
        if (!d) return null;
        const diff = Math.ceil((new Date(d) - serverNow()) / (1000 * 60 * 60 * 24));
        return diff;
    };

    const getStatusBadge = (status) => {
        const map = {
            Pending: 'badge--warning',
            Processing: 'badge--info',
            Completed: 'badge--success',
            Delivered: 'badge--primary',
            Cancelled: 'badge--error'
        };
        return map[status] || '';
    };

    const matchesCategory = (categoryValue) => {
        if (!categoryFilter) return true;
        const cat = String(categoryValue || '').trim().toUpperCase();
        if (categoryFilter === 'OTHER') {
            return !cat || !['OFFSET', 'LASER'].includes(cat);
        }
        return cat === categoryFilter;
    };

    const { stats, status_counts } = data || {};
    const activeQueueJobs = useMemo(
        () => (activeJobs || []).filter(job => !['Completed', 'Delivered', 'Cancelled'].includes(job.status)),
        [activeJobs]
    );
    const completedCount = Number(status_counts?.Completed || 0);

    // ─── Render ──────────────────────────────────────────────────
    // Don't block the entire page while loading dashboard values.
    // Render the layout immediately and show skeletons only for stats.

    // --- Virtualize job list (install @tanstack/react-virtual and use for job tables) ---
    // Example:
    // import { useVirtualizer } from '@tanstack/react-virtual';
    // const rowVirtualizer = useVirtualizer({ count: jobs.length, ... });
    // Only render visible rows for large lists

    // --- Loading Priority Example ---
    // 1. Load stats cards (tiny payload) — show immediately
    // 2. First 20 jobs — show list quickly
    // 3. Load remaining jobs in background
    // 4. Load chart data last (not critical)
    //
    // async function loadInPriority() {
    //   const stats = await api.get('/front-office/stats-only');
    //   setStats(stats.data);
    //   const jobs = await api.get('/front-office/jobs?page=1&limit=20');
    //   setJobs(jobs.data);
    //   setLoading(false);
    //   loadRemainingData(); // Non-blocking
    // }

    if (error && !data) {
        return <ServerError onRetry={() => loadDashboard()} message={error} />;
    }

    return (
        <>
        <div className="fo-dashboard">
            {/* ──── Header Bar ──── */}
            <div className="fo-header">
                <div className="fo-header__left">
                    <h1 className="fo-title">Front Office</h1>
                    <span className="fo-date">{serverNow().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
                <div className="fo-header__actions">
                </div>
            </div>

            {attendanceReminder?.should_remind && (
                <div className="panel panel--tight" style={{ marginBottom: 14, borderColor: 'var(--warning)', background: 'var(--surface-2)' }}>
                    <div className="row items-center gap-sm" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                                    Attendance pending for {attendanceReminder.missing_count} staff
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                    Shop timing is 9 to 8. Please add attendance before 11 AM.
                                </div>
                            </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard/daily-report')}>
                            Add Attendance
                        </button>
                    </div>
                </div>
            )}

            {/* ──── Toolbar: Search + Actions ──── */}
            <div className="fo-toolbar" ref={searchRef}>
                <div className="fo-search-bar">
                    <div className="fo-search-input-wrap">
                        <Search size={16} className="fo-search-icon" />
                        <input
                            id="fo-search"
                            type="text"
                            className="fo-search-input"
                            placeholder="Search customers, orders, jobs..."
                            value={search}
                            onChange={(e) => handleSearch(e.target.value)}
                            autoComplete="off"
                        />
                        {search && (
                            <button className="fo-search-clear" aria-label="Clear search" onClick={() => { setSearch(''); setSearchResults([]); setShowSearchResults(false); }}>
                                <X size={16} />
                            </button>
                        )}
                        {searchLoading && <Loader2 size={16} className="spin fo-search-spinner" />}
                    </div>
                    {showSearchResults && (
                        <div className="fo-search-dropdown">
                            {searchResults.length === 0 ? (
                                <div className="fo-search-empty">
                                    <p>No customers found</p>
                                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard/customers')}>
                                        <UserPlus size={14} /> Add New Customer
                                    </button>
                                </div>
                            ) : (
                                searchResults.map(c => (
                                    <button
                                        key={c.id}
                                        className="fo-search-result"
                                        onClick={() => {
                                            setShowSearchResults(false);
                                            setSearch('');
                                            navigate(`/dashboard/customers/${c.id}`);
                                        }}
                                    >
                                        <div className="fo-search-result__info">
                                            <span className="fo-search-result__name">{c.name}</span>
                                            <span className="fo-search-result__mobile">{c.mobile}</span>
                                        </div>
                                        <div className="fo-search-result__meta">
                                            <span className="fo-search-result__jobs">{c.job_count} jobs</span>
                                            {c.due_amount > 0 && (
                                                <span className="fo-search-result__due">{fmt(c.due_amount)} due</span>
                                            )}
                                        </div>
                                        <ChevronRight size={16} />
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="fo-toolbar__actions">
                    <button className="fo-toolbar-btn fo-toolbar-btn--primary" onClick={() => navigate('/dashboard/sales/invoices', { state: { action: 'create' } })}>
                        <Plus size={16} />
                        <span>New Order</span>
                    </button>
                    <button className="fo-toolbar-btn fo-toolbar-btn--secondary" onClick={() => navigate('/dashboard/sales/payments')}>
                        <Wallet size={16} />
                        <span>Take Payment</span>
                    </button>
                    <button className="fo-toolbar-btn fo-toolbar-btn--secondary" onClick={() => navigate('/dashboard/staff')}>
                        <Calendar size={16} />
                        <span>Attendance</span>
                    </button>
                    <button className="fo-toolbar-btn fo-toolbar-btn--secondary" onClick={() => navigate('/dashboard/customers')}>
                        <Users size={16} />
                        <span>Customers</span>
                    </button>
                </div>
            </div>

            {/* ──── Quick Actions Dashboard ──── */}
            <QuickActionsDashboard />

            {/* ──── Stats Cards ──── */}
            <h2 className="sr-only">Dashboard Summary</h2>
            <div className="fo-stats-grid">
                {loading ? (
                    <SkeletonLoader type="cards" count={6} />
                ) : (
                    <>
                    <div className="fo-stat-card fo-stat-card--blue">
                        <div className="fo-stat-card__icon"><ShoppingBag size={20} /></div>
                        <div className="fo-stat-card__body">
                            <span className="fo-stat-card__value">{stats?.today_orders ?? 0}</span>
                            <span className="fo-stat-card__label">Today's Orders</span>
                        </div>
                    </div>
                    <div className="fo-stat-card fo-stat-card--amber">
                        <div className="fo-stat-card__icon"><Clock size={20} /></div>
                        <div className="fo-stat-card__body">
                            <span className="fo-stat-card__value">{stats?.in_progress ?? 0}</span>
                            <span className="fo-stat-card__label">In Progress</span>
                        </div>
                    </div>
                    <div className="fo-stat-card fo-stat-card--green">
                        <div className="fo-stat-card__icon"><CheckCircle2 size={20} /></div>
                        <div className="fo-stat-card__body">
                            <span className="fo-stat-card__value">{stats?.ready_pickup ?? 0}</span>
                            <span className="fo-stat-card__label">Ready for Pickup</span>
                        </div>
                    </div>
                    <div className="fo-stat-card fo-stat-card--red">
                        <div className="fo-stat-card__icon"><IndianRupee size={20} /></div>
                        <div className="fo-stat-card__body">
                            <span className="fo-stat-card__value">{fmt(stats?.total_due)}</span>
                            <span className="fo-stat-card__label">Total Due</span>
                        </div>
                    </div>
                    <div className="fo-stat-card fo-stat-card--teal">
                        <div className="fo-stat-card__icon"><TrendingUp size={20} /></div>
                        <div className="fo-stat-card__body">
                            <span className="fo-stat-card__value">{fmt(stats?.today_collections)}</span>
                            <span className="fo-stat-card__label">Today's Collection</span>
                        </div>
                    </div>
                    <div className="fo-stat-card fo-stat-card--purple">
                        <div className="fo-stat-card__icon"><Truck size={20} /></div>
                        <div className="fo-stat-card__body">
                            <span className="fo-stat-card__value">{stats?.delivered_today ?? 0}</span>
                            <span className="fo-stat-card__label">Delivered Today</span>
                        </div>
                    </div>
                    </>
                )}
            </div>

            {/* ──── Tab Switcher ──── */}
            <h2 className="sr-only">Recent Activity</h2>
            <div className="fo-tabs">
                <button className={`fo-tab ${activeTab === 'queue' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('queue')}>
                    <Package size={16} /> Active Jobs{activeTotal > 0 && <span className="fo-tab-count">{activeTotal}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'dues' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('dues')}>
                    <IndianRupee size={16} /> Due Collection{dueTotal > 0 && <span className="fo-tab-count">{dueTotal}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'overdue' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('overdue')}>
                    <AlertTriangle size={16} /> Overdue{overdueTotal > 0 && <span className="fo-tab-count fo-tab-count--red">{overdueTotal}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'completed' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('completed')}>
                    <CheckCircle2 size={16} /> Completed Jobs{completedCount > 0 && <span className="fo-tab-count">{completedCount}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'payments' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('payments')}>
                    <Receipt size={16} /> Recent Payments{paymentsTotal > 0 && <span className="fo-tab-count">{paymentsTotal}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'delivered' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('delivered')}>
                    <Truck size={16} /> Delivered{deliveredTotal > 0 && <span className="fo-tab-count">{deliveredTotal}</span>}
                </button>
            </div>

            {/* ──── Category Filter Row ──── */}
            <div className="fo-category-filter">
                <div className="fo-category-filter__chips">
                    <button onClick={() => setCategoryFilter('')} className={`fo-category-chip ${categoryFilter === '' ? 'fo-category-chip--active' : ''}`}>All</button>
                    <button onClick={() => setCategoryFilter('OFFSET')} className={`fo-category-chip ${categoryFilter === 'OFFSET' ? 'fo-category-chip--active' : ''}`}>Offset</button>
                    <button onClick={() => setCategoryFilter('LASER')} className={`fo-category-chip ${categoryFilter === 'LASER' ? 'fo-category-chip--active' : ''}`}>Laser</button>
                    <button onClick={() => setCategoryFilter('OTHER')} className={`fo-category-chip ${categoryFilter === 'OTHER' ? 'fo-category-chip--active' : ''}`}>Others</button>
                </div>
            </div>

            {/* ──── Tab Content ──── */}
            <div className="fo-tab-content">
                {/* Active Jobs Queue */}
                {activeTab === 'queue' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'space-between', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            {activeTotal > 0 && (
                                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                    {((activePage - 1) * PAGE_SIZE) + 1}–{Math.min(activePage * PAGE_SIZE, activeTotal)} of {activeTotal.toLocaleString()}
                                </span>
                            )}
                            <div className="row gap-sm items-center" style={{ flexWrap: 'nowrap' }}>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setActivePage(p => Math.max(1, p - 1))} disabled={activePage <= 1 || activeLoading} title="Previous page"><ChevronLeft size={16} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setActivePage(p => Math.min(activeTotalPages, p + 1))} disabled={activePage >= activeTotalPages || activeLoading} title="Next page"><ChevronRight size={16} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => fetchActiveJobs(activePage)} disabled={activeLoading}>
                                    {activeLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                                </button>
                            </div>
                        </div>
                        {activeLoading ? (
                            <div className="fo-empty"><Loader2 size={30} className="spin" /><p>Loading active jobs...</p></div>
                        ) : (() => {
                            const filteredJobs = activeQueueJobs.filter(job => matchesCategory(job.category));
                            return filteredJobs.length === 0 ? (
                                <div className="fo-empty"><Package size={40} /><p>{categoryFilter ? 'No jobs in this category' : 'No active jobs right now'}</p></div>
                            ) : (
                                <>
                                <div className="fo-table-wrap">
                                    <table className="fo-table">
                                        <thead>
                                            <tr>
                                                <th>Job</th>
                                                <th>Customer</th>
                                                <th>Status</th>
                                                <th>Amount</th>
                                                <th>Due</th>
                                                <th>Delivery</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredJobs.map(job => {
                                                const due = daysUntil(job.delivery_date);
                                                const overdue = due !== null && due < 0;
                                                const dueToday = due === 0;
                                                const balance = Number(job.balance_amount ?? job.balance ?? 0);
                                                return (
                                                    <tr
                                                        key={job.id}
                                                        className={overdue ? 'fo-row--overdue' : dueToday ? 'fo-row--due-today' : ''}
                                                        style={{ cursor: 'pointer' }}
                                                        onDoubleClick={() => navigate(`/dashboard/jobs/${job.id}`)}
                                                    >
                                                        <td>
                                                            <div className="fo-job-cell">
                                                                <span className="fo-job-number">{job.job_number}</span>
                                                                <span className="fo-job-name">{job.job_name}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="fo-customer-cell">
                                                                <span>{job.customer_name}</span>
                                                                {job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`fo-badge ${getStatusBadge(job.status)}`}>{job.status}</span>
                                                        </td>
                                                        <td className="fo-amount">{fmt(job.total_amount)}</td>
                                                        <td>
                                                            {balance > 0 ? (
                                                                <span className="fo-due-amount">{fmt(balance)}</span>
                                                            ) : (
                                                                <span className="fo-paid-tag"><CheckCircle2 size={14} /> Paid</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div className={`fo-delivery ${overdue ? 'fo-delivery--overdue' : dueToday ? 'fo-delivery--today' : ''}`}>
                                                                {job.delivery_date ? (
                                                                    <>
                                                                        <Calendar size={13} />
                                                                        <span>{fmtDate(job.delivery_date)}</span>
                                                                        {overdue && <span className="fo-overdue-tag">Overdue</span>}
                                                                        {dueToday && <span className="fo-today-tag">Today</span>}
                                                                    </>
                                                                ) : '—'}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <button
                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                aria-label="View job details"
                                                                onClick={() => navigate(`/dashboard/jobs/${job.id}`)}
                                                                title="View"
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Due Collection */}
                {activeTab === 'dues' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'space-between', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            {dueTotal > 0 && (
                                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                    {((duePage - 1) * PAGE_SIZE) + 1}–{Math.min(duePage * PAGE_SIZE, dueTotal)} of {dueTotal.toLocaleString()}
                                </span>
                            )}
                            <div className="row gap-sm items-center" style={{ flexWrap: 'nowrap' }}>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setDuePage(p => Math.max(1, p - 1))} disabled={duePage <= 1 || dueLoading} title="Previous page"><ChevronLeft size={16} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setDuePage(p => Math.min(dueTotalPages, p + 1))} disabled={duePage >= dueTotalPages || dueLoading} title="Next page"><ChevronRight size={16} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => fetchDueCustomers(duePage)} disabled={dueLoading}>
                                    {dueLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                                </button>
                            </div>
                        </div>
                        {dueLoading ? (
                            <div className="fo-empty"><Loader2 size={30} className="spin" /><p>Loading due collection...</p></div>
                        ) : (() => {
                            const filteredDues = (!dueCustomers || dueCustomers.length === 0) ? [] : dueCustomers;
                            return filteredDues.length === 0 ? (
                                <div className="fo-empty"><CheckCircle2 size={40} /><p>{categoryFilter ? 'No pending dues in this category' : 'No pending dues — all clear!'}</p></div>
                            ) : (
                                <>
                                <div className="fo-due-list">
                                    {filteredDues.map(c => (
                                        <div key={c.id} className="fo-due-card">
                                            <div className="fo-due-card__info">
                                                <span className="fo-due-card__name">{c.name}</span>
                                                <span className="fo-due-card__mobile">
                                                    <Phone size={13} /> {c.mobile}
                                                </span>
                                                <span className="fo-due-card__jobs">{c.job_count} job{c.job_count > 1 ? 's' : ''}</span>
                                            </div>
                                            <div className="fo-due-card__amounts">
                                                <div className="fo-due-card__billed">
                                                    <span className="fo-due-card__label">Billed</span>
                                                    <span>{fmt(c.total_billed)}</span>
                                                </div>
                                                <div className="fo-due-card__paid">
                                                    <span className="fo-due-card__label">Paid</span>
                                                    <span>{fmt(c.total_paid)}</span>
                                                </div>
                                                <div className="fo-due-card__due">
                                                    <span className="fo-due-card__label">Due</span>
                                                    <span className="fo-due-amount">{fmt(c.due_amount)}</span>
                                                </div>
                                            </div>
                                            <div className="fo-due-card__actions">
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() => navigate(`/dashboard/customer-payments?customer=${c.id}`)}
                                                >
                                                    <CreditCard size={14} /> Collect
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => navigate(`/dashboard/customers/${c.id}`)}
                                                >
                                                    <Eye size={14} /> View
                                                </button>
                                                {c.mobile && (
                                                    <a
                                                        href={`tel:${c.mobile}`}
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        aria-label="Call customer"
                                                        title="Call"
                                                    >
                                                        <Phone size={14} />
                                                    </a>
                                                )}
                                                {c.mobile && (
                                                    <a
                                                        href={whatsappUrl(c.mobile, dueCollectionMessage({ customerName: c.name, totalDue: c.due_amount, jobCount: c.job_count }))}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-ghost btn-sm btn-icon"
                                                        aria-label="WhatsApp customer"
                                                        title="WhatsApp Payment Reminder"
                                                        style={{ color: 'var(--color-success)' }}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Overdue Jobs */}
                {activeTab === 'overdue' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'space-between', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            {overdueTotal > 0 && (
                                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                    {((overduePage - 1) * PAGE_SIZE) + 1}–{Math.min(overduePage * PAGE_SIZE, overdueTotal)} of {overdueTotal.toLocaleString()}
                                </span>
                            )}
                            <div className="row gap-sm items-center" style={{ flexWrap: 'nowrap' }}>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setOverduePage(p => Math.max(1, p - 1))} disabled={overduePage <= 1 || overdueLoading} title="Previous page"><ChevronLeft size={16} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setOverduePage(p => Math.min(overdueTotalPages, p + 1))} disabled={overduePage >= overdueTotalPages || overdueLoading} title="Next page"><ChevronRight size={16} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => fetchOverdueJobs(overduePage)} disabled={overdueLoading}>
                                    {overdueLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                                </button>
                            </div>
                        </div>
                        {overdueLoading ? (
                            <div className="fo-empty"><Loader2 size={30} className="spin" /><p>Loading overdue jobs...</p></div>
                        ) : (() => {
                            const filteredOverdue = (!overdueJobs || overdueJobs.length === 0) ? [] : overdueJobs.filter(job => matchesCategory(job.category));
                            return filteredOverdue.length === 0 ? (
                                <div className="fo-empty"><CheckCircle2 size={40} /><p>{categoryFilter ? 'No overdue jobs in this category! 🎉' : 'No overdue jobs! 🎉'}</p></div>
                            ) : (
                                <>
                                <div className="fo-table-wrap">
                                    <table className="fo-table">
                                        <thead>
                                            <tr>
                                                <th>Job</th>
                                                <th>Customer</th>
                                                <th>Status</th>
                                                <th>Delivery Was</th>
                                                <th>Overdue By</th>
                                                <th>Balance</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredOverdue.map(job => {
                                                const days = Math.abs(daysUntil(job.delivery_date));
                                                const balance = Number(job.balance_amount ?? job.balance ?? 0);
                                                return (
                                                    <tr key={job.id} className="fo-row--overdue">
                                                        <td>
                                                            <div className="fo-job-cell">
                                                                <span className="fo-job-number">{job.job_number}</span>
                                                                <span className="fo-job-name">{job.job_name}</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div className="fo-customer-cell">
                                                                <span>{job.customer_name}</span>
                                                                {job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}
                                                            </div>
                                                        </td>
                                                        <td><span className={`fo-badge ${getStatusBadge(job.status)}`}>{job.status}</span></td>
                                                        <td>{fmtDate(job.delivery_date)}</td>
                                                        <td><span className="fo-overdue-days">{days} day{days > 1 ? 's' : ''}</span></td>
                                                        <td>{balance > 0 ? <span className="fo-due-amount">{fmt(balance)}</span> : <span className="fo-paid-tag"><CheckCircle2 size={14} /> Paid</span>}</td>
                                                        <td>
                                                            {job.customer_mobile && (
                                                                <a href={`tel:${job.customer_mobile}`} className="btn btn-ghost btn-icon btn-sm" aria-label="Call customer" title="Call">
                                                                    <Phone size={16} />
                                                                </a>
                                                            )}
                                                            {job.customer_mobile && (
                                                                <a
                                                                    href={whatsappUrl(job.customer_mobile, paymentReminderMessage({ customerName: job.customer_name, jobNumber: job.job_number, jobName: job.job_name, totalAmount: job.total_amount, balance: (job.total_amount - (job.total_paid || 0)), dueDate: job.delivery_date }))}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    aria-label="WhatsApp customer"
                                                                    title="WhatsApp Payment Reminder"
                                                                    style={{ color: 'var(--color-success)' }}
                                                                >
                                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                                </a>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Completed Jobs */}
                {activeTab === 'completed' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'space-between', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            <div className="row gap-sm items-center">
                                <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>View</span>
                                <button
                                    className={`btn btn-sm ${completedView === 'grouped' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setCompletedView('grouped')}
                                >
                                    <LayoutGrid size={14} /> Grouped
                                </button>
                                <button
                                    className={`btn btn-sm ${completedView === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setCompletedView('list')}
                                >
                                    <List size={14} /> List
                                </button>
                            </div>
                            <div className="row gap-sm items-center" style={{ flexWrap: 'wrap' }}>
                                {completedTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                        {((completedPage - 1) * PAGE_SIZE) + 1}–{Math.min(completedPage * PAGE_SIZE, completedTotal)} of {completedTotal.toLocaleString()}
                                    </span>
                                )}
                                <div className="row gap-sm items-center" style={{ flexWrap: 'nowrap' }}>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label="Previous page"
                                        onClick={() => setCompletedPage(p => Math.max(1, p - 1))}
                                        disabled={completedPage <= 1 || completedLoading}
                                        title="Previous page"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-icon btn-sm"
                                        aria-label="Next page"
                                        onClick={() => setCompletedPage(p => Math.min(completedTotalPages, p + 1))}
                                        disabled={completedPage >= completedTotalPages || completedLoading}
                                        title="Next page"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => fetchCompleted(completedPage)} disabled={completedLoading}>
                                        {completedLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                                    </button>
                                </div>
                            </div>
                        </div>

                        {completedLoading ? (
                            <div className="fo-empty"><Loader2 size={30} className="spin" /><p>Loading completed jobs...</p></div>
                        ) : (() => {
                            const filteredCompleted = (!completedJobs || completedJobs.length === 0) ? [] : completedJobs.filter(job => matchesCategory(job.category));
                            return filteredCompleted.length === 0 ? (
                                <div className="fo-empty"><CheckCircle2 size={40} /><p>{categoryFilter ? 'No completed jobs in this category' : 'No completed jobs yet'}</p></div>
                            ) : completedView === 'list' ? (
                                <div className="fo-table-wrap">
                                    <table className="fo-table">
                                        <thead>
                                            <tr>
                                                <th>Job</th>
                                                <th>Customer</th>
                                                <th>Status</th>
                                                <th>Amount</th>
                                                <th>Balance</th>
                                                <th>Updated</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCompleted.map(job => (
                                                <tr key={job.id} style={{ cursor: 'pointer' }} onDoubleClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                                                    <td>
                                                        <div className="fo-job-cell">
                                                            <span className="fo-job-number">{job.job_number}</span>
                                                            <span className="fo-job-name">{job.job_name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="fo-customer-cell">
                                                            <span>{job.customer_name}</span>
                                                            {job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}
                                                        </div>
                                                    </td>
                                                    <td><span className={`fo-badge ${getStatusBadge(job.status)}`}>{job.status}</span></td>
                                                    <td className="fo-amount">{fmt(job.total_amount)}</td>
                                                    <td>{(Number(job.balance_amount ?? job.balance ?? 0)) > 0 ? <span className="fo-due-amount">{fmt(Number(job.balance_amount ?? job.balance ?? 0))}</span> : <span className="fo-paid-tag"><CheckCircle2 size={14} /> Paid</span>}</td>
                                                    <td>{fmtDate(job.updated_at || job.delivery_date)}</td>
                                                    <td>
                                                        <button className="btn btn-ghost btn-icon btn-sm" aria-label="View job details" onClick={() => navigate(`/dashboard/jobs/${job.id}`)} title="View">
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="stack-md">
                                    {groupedCompleted.map(group => {
                                        const customerKey = group.customer_id || `walkin-${group.customer_name}`;
                                        const isExpanded = expandedCustomers.has(customerKey);
                                        // Filter jobs by category
                                        const filteredGroupJobs = group.jobs.filter(j => matchesCategory(j.category));
                                        if (filteredGroupJobs.length === 0) return null;
                                        return (
                                            <div key={customerKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', transition: 'all 0.3s ease', boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.1)' : '0 2px 6px rgba(0,0,0,0.05)' }}>
                                                <button
                                                    className="row items-center"
                                                    style={{ width: '100%', justifyContent: 'space-between', padding: '16px 18px', border: 'none', background: 'var(--surface)', cursor: 'pointer', transition: 'background 0.2s ease' }}
                                                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--surface-hover)'}
                                                    onMouseOut={(e) => e.currentTarget.style.background = 'var(--surface)'}
                                                    onClick={() => toggleCustomerExpand(customerKey)}
                                                >
                                                    <div className="stack-xs" style={{ alignItems: 'flex-start' }}>
                                                        <strong style={{ fontSize: '15px', color: 'var(--text)', marginBottom: 2 }}>{group.customer_name || 'Walk-in'}</strong>
                                                        <span className="muted" style={{ fontSize: 12 }}>
                                                            {filteredGroupJobs.length} completed job{filteredGroupJobs.length > 1 ? 's' : ''} • Total {fmt(filteredGroupJobs.reduce((sum, j) => sum + j.total_amount, 0))}
                                                        </span>
                                                    </div>
                                                    <div className="row gap-sm items-center">
                                                        <span className="fo-badge badge--success">Completed</span>
                                                        {isExpanded ? <ChevronUp size={18} style={{ color: 'var(--accent)' }} /> : <ChevronDown size={18} style={{ color: 'var(--muted)' }} />}
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
                                                        {filteredGroupJobs.map(job => (
                                                            <div key={job.id} className="row gap-sm items-center" style={{ padding: '14px 18px', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', transition: 'background 0.2s ease' }}>
                                                                <div className="stack-xs" style={{ flex: 1, minWidth: 0 }}>
                                                                    <strong style={{ fontSize: 13, color: 'var(--text)' }}>{job.job_number} - {job.job_name}</strong>
                                                                    {editingWorkName === job.id ? (
                                                                        <div className="row gap-xs" style={{ marginTop: 6 }}>
                                                                            <input
                                                                                className="input-field"
                                                                                style={{ height: 32, fontSize: '12px' }}
                                                                                value={workNameInput}
                                                                                onChange={(e) => setWorkNameInput(e.target.value)}
                                                                                placeholder="Work name"
                                                                            />
                                                                            <button className="btn btn-primary btn-sm" onClick={() => saveWorkName(job.id)} disabled={savingWorkName} style={{ padding: '6px 10px' }}>
                                                                                <Check size={14} />
                                                                            </button>
                                                                            <button className="btn btn-ghost btn-sm" aria-label="Cancel work name edit" onClick={() => setEditingWorkName(null)} style={{ padding: '6px 10px' }}>
                                                                                <X size={14} />
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="row gap-xs items-center">
                                                                            <span className="muted" style={{ fontSize: 12 }}>{job.description || 'No work name'}</span>
                                                                            <button className="btn btn-ghost btn-icon btn-sm" aria-label="Edit work name" onClick={() => startEditWorkName(job)} title="Edit work name" style={{ padding: '4px' }}>
                                                                                <Edit3 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="row gap-sm items-center">
                                                                    <span className="muted" style={{ fontSize: 12, minWidth: 'fit-content' }}>{fmtDate(job.updated_at || job.delivery_date)}</span>
                                                                    <span style={{ fontWeight: 700, fontSize: '13px', minWidth: 'fit-content', color: 'var(--accent)' }}>{fmt(job.total_amount)}</span>
                                                                    <button className="btn btn-ghost btn-icon btn-sm" aria-label="View job details" onClick={() => navigate(`/dashboard/jobs/${job.id}`)} title="View" style={{ padding: '4px' }}>
                                                                        <Eye size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }).filter(x => x !== null)}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Recent Payments */}
                {activeTab === 'payments' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'space-between', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            {paymentsTotal > 0 && (
                                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                    {((paymentsPage - 1) * PAGE_SIZE) + 1}–{Math.min(paymentsPage * PAGE_SIZE, paymentsTotal)} of {paymentsTotal.toLocaleString()}
                                </span>
                            )}
                            <div className="row gap-sm items-center" style={{ flexWrap: 'nowrap' }}>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setPaymentsPage(p => Math.max(1, p - 1))} disabled={paymentsPage <= 1 || paymentsLoading} title="Previous page"><ChevronLeft size={16} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setPaymentsPage(p => Math.min(paymentsTotalPages, p + 1))} disabled={paymentsPage >= paymentsTotalPages || paymentsLoading} title="Next page"><ChevronRight size={16} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => fetchRecentPayments(paymentsPage)} disabled={paymentsLoading}>
                                    {paymentsLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                                </button>
                            </div>
                        </div>
                        {paymentsLoading ? (
                            <div className="fo-empty"><Loader2 size={30} className="spin" /><p>Loading payments...</p></div>
                        ) : (!recentPayments || recentPayments.length === 0) ? (
                            <div className="fo-empty"><Receipt size={40} /><p>No recent payments</p></div>
                        ) : (
                            <div className="fo-payments-list">
                                {recentPayments.map(p => (
                                    <div key={p.id} className="fo-payment-item">
                                        <div className="fo-payment-item__icon">
                                            <Wallet size={18} />
                                        </div>
                                        <div className="fo-payment-item__info">
                                            <span className="fo-payment-item__name">{p.customer_name}</span>
                                            <span className="fo-payment-item__method">{p.payment_method} • {fmtDate(p.payment_date)}</span>
                                        </div>
                                        <span className="fo-payment-item__amount">+ {fmt(p.amount)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Delivered Jobs */}
                {activeTab === 'delivered' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'space-between', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            {deliveredTotal > 0 && (
                                <span className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                    {((deliveredPage - 1) * PAGE_SIZE) + 1}–{Math.min(deliveredPage * PAGE_SIZE, deliveredTotal)} of {deliveredTotal.toLocaleString()}
                                </span>
                            )}
                            <div className="row gap-sm items-center" style={{ flexWrap: 'nowrap' }}>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setDeliveredPage(p => Math.max(1, p - 1))} disabled={deliveredPage <= 1 || deliveredLoading} title="Previous page"><ChevronLeft size={16} /></button>
                                <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setDeliveredPage(p => Math.min(deliveredTotalPages, p + 1))} disabled={deliveredPage >= deliveredTotalPages || deliveredLoading} title="Next page"><ChevronRight size={16} /></button>
                                <button className="btn btn-ghost btn-sm" onClick={() => fetchDeliveredJobs(deliveredPage)} disabled={deliveredLoading}>
                                    {deliveredLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                                </button>
                            </div>
                        </div>
                        {deliveredLoading ? (
                            <div className="fo-empty"><Loader2 size={30} className="spin" /><p>Loading delivered jobs...</p></div>
                        ) : (() => {
                            const filteredDelivered = (deliveredJobs || []).filter(job => matchesCategory(job.category));
                            return filteredDelivered.length === 0 ? (
                                <div className="fo-empty"><Truck size={40} /><p>{categoryFilter ? 'No delivered jobs in this category' : 'No delivered jobs yet'}</p></div>
                            ) : (
                                <div className="fo-table-wrap">
                                    <table className="fo-table">
                                        <thead>
                                            <tr>
                                                <th>Job</th>
                                                <th>Customer</th>
                                                <th>Amount</th>
                                                <th>Balance</th>
                                                <th>Delivery Date</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredDelivered.map(job => (
                                                <tr key={job.id} style={{ cursor: 'pointer' }} onDoubleClick={() => navigate(`/dashboard/jobs/${job.id}`)}>
                                                    <td>
                                                        <div className="fo-job-cell">
                                                            <span className="fo-job-number">{job.job_number}</span>
                                                            <span className="fo-job-name">{job.job_name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="fo-customer-cell">
                                                            <span>{job.customer_name}</span>
                                                            {job.customer_mobile && <span className="fo-mobile">{job.customer_mobile}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="fo-amount">{fmt(job.total_amount)}</td>
                                                    <td>{(Number(job.balance_amount ?? job.balance ?? 0)) > 0 ? <span className="fo-due-amount">{fmt(Number(job.balance_amount ?? job.balance ?? 0))}</span> : <span className="fo-paid-tag"><CheckCircle2 size={14} /> Paid</span>}</td>
                                                    <td>{fmtDate(job.delivery_date || job.updated_at)}</td>
                                                    <td>
                                                        <button className="btn btn-ghost btn-icon btn-sm" aria-label="View job details" onClick={() => navigate(`/dashboard/jobs/${job.id}`)} title="View">
                                                            <Eye size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* ──── Status Pipeline ──── */}
            <div className="fo-pipeline">
                <h2 className="fo-section-title">Job Pipeline</h2>
                <div className="fo-pipeline-bar">
                    {['Pending', 'Processing', 'Completed', 'Delivered'].map(status => {
                        const count = status_counts?.[status] || 0;
                        return (
                            <div key={status} className={`fo-pipeline-stage fo-pipeline-stage--${status.toLowerCase()}${count > 0 ? ' fo-pipeline-stage--active' : ''}`}>
                                <span className="fo-pipeline-stage__count">{count}</span>
                                <span className="fo-pipeline-stage__label">{status}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

            {/* ──── Opening Balance Prompt Modal ──── */}
            {showOpeningPrompt && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-primary)', display: 'grid', placeItems: 'center' }}>
                                <IndianRupee size={20} style={{ color: 'var(--accent)' }} />
                            </div>
                            <div>
                                <h2 className="section-title" style={{ marginBottom: 0 }}>Good Morning!</h2>
                                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Set opening values for today</p>
                            </div>
                        </div>

                        <div className="stack-md" style={{ marginTop: 20 }}>
                            {Object.keys(promptBalances).length > 0 && (
                                <div className="panel panel--tight" style={{ background: 'var(--surface-2)' }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                                        <Wallet size={14} /> CASH OPENING BALANCES
                                    </h3>
                                    <div className="stack-sm">
                                        {OPENING_TABS.filter(tab => Object.prototype.hasOwnProperty.call(promptBalances, tab.key)).map(tab => (
                                            <div key={tab.key} className="row gap-md items-center" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                                <div style={{ width: 80, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                                                    <div style={{ width: 8, height: 8, borderRadius: 3, background: tab.color }} />
                                                    {tab.label}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 180 }}>
                                                    <input type="number" className="input-field"
                                                        value={promptBalances[tab.key]}
                                                        onChange={(e) => setPromptBalances(prev => ({ ...prev, [tab.key]: e.target.value }))}
                                                        placeholder="₹ 0.00" step="0.01" style={{ width: '100%' }}
                                                    />
                                                    {prevClosing[tab.key] > 0 && (
                                                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                                                            prev: ₹{Number(prevClosing[tab.key]).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {promptMachines.length > 0 && (
                                <div className="panel panel--tight" style={{ background: 'var(--surface-2)' }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                                        <Monitor size={14} /> MACHINE OPENING COUNTS
                                    </h3>
                                    <div className="stack-sm">
                                        {promptMachines.map((m, idx) => (
                                            <div key={m.id} className="stack-sm" style={{ marginBottom: 4 }}>
                                                <div className="row gap-md items-center">
                                                    <div style={{ flex: 1, minWidth: 120 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.machine_name}</div>
                                                        {m.location && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.location}</div>}
                                                    </div>
                                                    <input type="number" className="input-field"
                                                        value={m.opening_count}
                                                        onChange={(e) => {
                                                            const updated = [...promptMachines];
                                                            updated[idx] = { ...updated[idx], opening_count: e.target.value, error: null };
                                                            setPromptMachines(updated);
                                                        }}
                                                        placeholder="Counter reading"
                                                        style={{ width: 160, minWidth: 160, borderColor: m.error ? 'var(--error, #dc2626)' : 'var(--border)', lineHeight: 1.4 }}
                                                    />
                                                </div>
                                                {m.error && <div style={{ fontSize: 12, color: 'var(--error, #dc2626)', textAlign: 'right' }}>{m.error}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="row gap-sm justify-end" style={{ marginTop: 20 }}>
                            <button className="btn btn-ghost" onClick={() => { setShowOpeningPrompt(false); }}>
                                Skip for now
                            </button>
                            <button className="btn btn-primary" onClick={handleSavePrompt} disabled={savingPrompt}>
                                <Check size={16} /> {savingPrompt ? 'Saving...' : 'Save & Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default FrontOffice;

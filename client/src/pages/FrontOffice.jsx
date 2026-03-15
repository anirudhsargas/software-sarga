import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import usePolling from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import {
    ShoppingBag, Clock, CheckCircle2, IndianRupee, TrendingUp, Truck,
    Search, Plus, UserPlus, Phone, ArrowRight, Calendar, AlertTriangle,
    Receipt, Printer, MessageSquare, RefreshCw, ChevronRight, ChevronLeft, Loader2,
    Wallet, Users, Package, Eye, CreditCard, X, Edit3, Check, ChevronDown, ChevronUp, List, LayoutGrid, Monitor
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';

import { serverNow, serverToday } from '../services/serverTime';
import './FrontOffice.css';

const OPENING_TABS = [
    { key: 'Offset', label: 'Offset', color: 'var(--accent)' },
    { key: 'Laser',  label: 'Laser',  color: 'var(--accent)' },
    { key: 'Other',  label: 'Other',  color: 'var(--success)' },
];

const FrontOffice = () => {
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
    const [refreshing, setRefreshing] = useState(false);
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
    const [promptDone, setPromptDone] = useState(false);
    const [prevClosing, setPrevClosing] = useState({ Offset: 0, Laser: 0, Other: 0 });
    const [myBooks, setMyBooks] = useState(null); // null = loading, [] = not assigned to any

    const [expandedCustomers, setExpandedCustomers] = useState(new Set());
    const [editingWorkName, setEditingWorkName] = useState(null); // job id being edited
    const [workNameInput, setWorkNameInput] = useState('');
    const [savingWorkName, setSavingWorkName] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [attendanceReminder, setAttendanceReminder] = useState(null);

    // ─── Data Fetch ──────────────────────────────────────────────
    const fetchDashboard = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await api.get('/front-office/dashboard');
            setData(res.data);
            setError('');
        } catch (err) {
            setError('Failed to load dashboard');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    usePolling(() => fetchDashboard(true), 60000);

    const fetchAttendanceReminder = useCallback(async () => {
        if (!['Front Office', 'front office'].includes(user?.role)) return;
        try {
            const res = await api.get('/front-office/attendance-reminder');
            setAttendanceReminder(res.data || null);
        } catch (_) {
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
                } catch { assignedBooks = []; }
                setMyBooks(assignedBooks);

                const res = await api.get('/daily-report/opening-balance', { params: { date: today } });
                const balances = res.data.balances || res.data;
                const locked = res.data.locked || {};
                // Only check books this user is assigned to
                const relevantBooks = assignedBooks.length > 0 ? assignedBooks : [];
                const anyEntered = relevantBooks.some(b => Number(balances[b]) > 0);
                const anyLocked = relevantBooks.some(b => locked[b]);
                // Also fetch assigned machines (always check for machine count)
                let myMachines = [];
                try {
                    const machRes = await api.get('/machines');
                    myMachines = (machRes.data || []).filter(m => m.machine_type === 'Digital');
                } catch { }
                if ((!anyEntered && !anyLocked) || myMachines.length > 0) {
                    let prevData = { Offset: 0, Laser: 0, Other: 0, machines: {} };
                    try {
                        const prevRes = await api.get('/daily-report/previous-closing', { params: { date: today } });
                        prevData = prevRes.data;
                    } catch { }
                    setPrevClosing({ Offset: prevData.Offset || 0, Laser: prevData.Laser || 0, Other: prevData.Other || 0 });
                    setPromptMachines(myMachines.map(m => ({
                        id: m.id, machine_name: m.machine_name, location: m.location,
                        opening_count: prevData.machines?.[m.id] !== undefined ? String(prevData.machines[m.id]) : ''
                    })));
                    const newBalances = {};
                    relevantBooks.forEach(b => {
                        newBalances[b] = prevData[b] > 0 ? String(prevData[b]) : '';
                    });
                    setPromptBalances(newBalances);
                    // Only show prompt if there are books to enter OR machines to count
                    if (relevantBooks.length > 0 || myMachines.length > 0) {
                        setShowOpeningPrompt(true);
                    }
                }
            } catch (err) { console.error('Opening balance check error:', err); }
        })();
    }, []);

    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        const today = serverToday();
        try {
            const books = Object.keys(promptBalances);
            const balancePromises = books.map(bookType =>
                api.put('/daily-report/opening-balance', {
                    date: today, book_type: bookType, cash_opening: parseFloat(promptBalances[bookType]) || 0
                })
            );
            const machinePromises = promptMachines
                .filter(m => m.opening_count !== '' && m.opening_count !== null)
                .map(m => api.post(`/machines/${m.id}/readings`, {
                    reading_date: today, opening_count: parseInt(m.opening_count) || 0
                }));
            await Promise.all([...balancePromises, ...machinePromises]);
            setShowOpeningPrompt(false);
            setPromptDone(true);
            toast.success('Opening values saved!');
        } catch (err) {
            console.error('Save opening prompt error:', err);
            toast.error('Failed to save opening values');
        } finally {
            setSavingPrompt(false);
        }
    };

    // Fetch completed jobs when tab is active
    const fetchCompleted = useCallback(async (pg) => {
        setCompletedLoading(true);
        try {
            const res = await api.get(`/front-office/completed?page=${pg || 1}`);
            const resData = res.data;
            // Handle both paginated { data, total, totalPages } and legacy flat array
            if (Array.isArray(resData)) {
                setCompletedJobs(resData);
                setCompletedTotal(resData.length);
                setCompletedTotalPages(Math.ceil(resData.length / PAGE_SIZE) || 1);
            } else {
                setCompletedJobs(resData.data || []);
                setCompletedTotal(resData.total || 0);
                setCompletedTotalPages(resData.totalPages || 1);
            }
        } catch {
            toast.error('Failed to load completed work');
        } finally {
            setCompletedLoading(false);
        }
    }, []); // stable — uses only the pg parameter

    useEffect(() => {
        if (activeTab === 'completed') fetchCompleted(completedPage);
    }, [activeTab, completedPage, fetchCompleted]);

    // Fetch active jobs
    const fetchActiveJobs = useCallback(async (pg) => {
        setActiveLoading(true);
        try {
            const res = await api.get(`/front-office/active-jobs?page=${pg || 1}`);
            setActiveJobs(res.data.data || []);
            setActiveTotal(res.data.total || 0);
            setActiveTotalPages(res.data.totalPages || 1);
        } catch { /* dashboard fallback handles it */ }
        finally { setActiveLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'queue') fetchActiveJobs(activePage);
    }, [activeTab, activePage, fetchActiveJobs]);

    // Fetch due customers
    const fetchDueCustomers = useCallback(async (pg) => {
        setDueLoading(true);
        try {
            const res = await api.get(`/front-office/due-customers?page=${pg || 1}`);
            setDueCustomers(res.data.data || []);
            setDueTotal(res.data.total || 0);
            setDueTotalPages(res.data.totalPages || 1);
        } catch { /* dashboard fallback handles it */ }
        finally { setDueLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'dues') fetchDueCustomers(duePage);
    }, [activeTab, duePage, fetchDueCustomers]);

    // Fetch overdue jobs
    const fetchOverdueJobs = useCallback(async (pg) => {
        setOverdueLoading(true);
        try {
            const res = await api.get(`/front-office/overdue-jobs?page=${pg || 1}`);
            setOverdueJobs(res.data.data || []);
            setOverdueTotal(res.data.total || 0);
            setOverdueTotalPages(res.data.totalPages || 1);
        } catch { /* dashboard fallback handles it */ }
        finally { setOverdueLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'overdue') fetchOverdueJobs(overduePage);
    }, [activeTab, overduePage, fetchOverdueJobs]);

    // Fetch recent payments
    const fetchRecentPayments = useCallback(async (pg) => {
        setPaymentsLoading(true);
        try {
            const res = await api.get(`/front-office/recent-payments?page=${pg || 1}`);
            setRecentPayments(res.data.data || []);
            setPaymentsTotal(res.data.total || 0);
            setPaymentsTotalPages(res.data.totalPages || 1);
        } catch { /* dashboard fallback handles it */ }
        finally { setPaymentsLoading(false); }
    }, []);

    useEffect(() => {
        if (activeTab === 'payments') fetchRecentPayments(paymentsPage);
    }, [activeTab, paymentsPage, fetchRecentPayments]);

    // Fetch delivered jobs
    const fetchDeliveredJobs = useCallback(async (pg) => {
        setDeliveredLoading(true);
        try {
            const res = await api.get(`/front-office/delivered?page=${pg || 1}`);
            setDeliveredJobs(res.data.data || []);
            setDeliveredTotal(res.data.total || 0);
            setDeliveredTotalPages(res.data.totalPages || 1);
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
            group.total_amount += job.total_amount;
            group.total_balance += job.balance;
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
        fetchDashboard();

        const handlePaymentUpdate = () => {
            fetchDashboard(true);
        };
        window.addEventListener('paymentRecorded', handlePaymentUpdate);

        return () => {
            window.removeEventListener('paymentRecorded', handlePaymentUpdate);
        };
    }, [fetchDashboard]);

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
                const res = await api.get(`/front-office/search?q=${encodeURIComponent(val)}`);
                setSearchResults(res.data);
                setShowSearchResults(true);
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 300);
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
                navigate('/dashboard/billing');
            }
            // Alt+P → customer payments
            if (e.altKey && key === 'p') {
                e.preventDefault();
                e.stopImmediatePropagation();
                navigate('/dashboard/customer-payments');
            }
        };
        // Use capture phase to intercept before browser defaults if possible
        window.addEventListener('keydown', handler, true);
        return () => window.removeEventListener('keydown', handler, true);
    }, [navigate]);

    // ─── Helpers ─────────────────────────────────────────────────
    const fmt = (v) => typeof v === 'number' ? `₹${v.toLocaleString('en-IN')}` : '—';
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

    const getPaymentBadge = (status) => {
        const map = { Paid: 'badge--success', Partial: 'badge--warning', Unpaid: 'badge--error' };
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
    if (loading) {
        return (
            <div className="fo-loading">
                <Loader2 size={32} className="spin" />
                <p>Loading dashboard...</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="fo-error">
                <AlertTriangle size={32} />
                <p>{error}</p>
                <button className="btn btn-primary" onClick={() => fetchDashboard()}>Retry</button>
            </div>
        );
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
                                    Shop timing is 9 to 6. Please add attendance before {attendanceReminder.reminder_until} AM.
                                </div>
                            </div>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate('/dashboard/daily-report')}>
                            Add Attendance
                        </button>
                    </div>
                </div>
            )}

            {/* ──── Search Bar ──── */}
            <div className="fo-search-bar" ref={searchRef}>
                <div className="fo-search-input-wrap">
                    <Search size={18} className="fo-search-icon" />
                    <input
                        id="fo-search"
                        type="text"
                        className="fo-search-input"
                        placeholder="Search customer by name or mobile... (Ctrl+K)"
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

            {/* ──── Quick Action Buttons ──── */}
            <div className="fo-quick-actions">
                <button className="fo-action-btn fo-action-btn--primary" onClick={() => navigate('/dashboard/billing')}>
                    <Plus size={20} />
                    <span>New Order</span>
                    <kbd>Alt+N</kbd>
                </button>
                <button className="fo-action-btn fo-action-btn--success" onClick={() => navigate('/dashboard/customer-payments')}>
                    <Wallet size={20} />
                    <span>Take Payment</span>
                    <kbd>Alt+P</kbd>
                </button>
                <button className="fo-action-btn fo-action-btn--accent" onClick={() => navigate('/dashboard/customers')}>
                    <Users size={20} />
                    <span>Customers</span>
                </button>
                <button className="fo-action-btn fo-action-btn--default" onClick={() => navigate('/dashboard/jobs')}>
                    <Package size={20} />
                    <span>All Orders</span>
                </button>
            </div>

            {/* ──── Stats Cards ──── */}
            <div className="fo-stats-grid">
                <div className="fo-stat-card fo-stat-card--blue">
                    <div className="fo-stat-card__icon"><ShoppingBag size={22} /></div>
                    <div className="fo-stat-card__body">
                        <span className="fo-stat-card__value">{stats?.today_orders ?? 0}</span>
                        <span className="fo-stat-card__label">Today's Orders</span>
                    </div>
                </div>
                <div className="fo-stat-card fo-stat-card--amber">
                    <div className="fo-stat-card__icon"><Clock size={22} /></div>
                    <div className="fo-stat-card__body">
                        <span className="fo-stat-card__value">{stats?.in_progress ?? 0}</span>
                        <span className="fo-stat-card__label">In Progress</span>
                    </div>
                </div>
                <div className="fo-stat-card fo-stat-card--green">
                    <div className="fo-stat-card__icon"><CheckCircle2 size={22} /></div>
                    <div className="fo-stat-card__body">
                        <span className="fo-stat-card__value">{stats?.ready_pickup ?? 0}</span>
                        <span className="fo-stat-card__label">Ready for Pickup</span>
                    </div>
                </div>
                <div className="fo-stat-card fo-stat-card--red">
                    <div className="fo-stat-card__icon"><IndianRupee size={22} /></div>
                    <div className="fo-stat-card__body">
                        <span className="fo-stat-card__value">{fmt(stats?.total_due)}</span>
                        <span className="fo-stat-card__label">Total Due</span>
                    </div>
                </div>
                <div className="fo-stat-card fo-stat-card--teal">
                    <div className="fo-stat-card__icon"><TrendingUp size={22} /></div>
                    <div className="fo-stat-card__body">
                        <span className="fo-stat-card__value">{fmt(stats?.today_collections)}</span>
                        <span className="fo-stat-card__label">Today's Collection</span>
                    </div>
                </div>
                <div className="fo-stat-card fo-stat-card--purple">
                    <div className="fo-stat-card__icon"><Truck size={22} /></div>
                    <div className="fo-stat-card__body">
                        <span className="fo-stat-card__value">{stats?.delivered_today ?? 0}</span>
                        <span className="fo-stat-card__label">Delivered Today</span>
                    </div>
                </div>
            </div>

            {/* ──── Tab Switcher ──── */}
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
            <div style={{ display: 'flex', gap: 8, padding: '16px 0', marginBottom: 20, fontSize: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 'fit-content', fontSize: '13px', marginRight: 8 }}>Filter by Type:</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => setCategoryFilter('')} style={{ padding: '8px 18px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', background: categoryFilter === '' ? 'var(--accent)' : 'var(--surface)', color: categoryFilter === '' ? '#000' : '#888', border: categoryFilter === '' ? '2px solid var(--accent)' : '2px solid #555', borderRadius: 20, transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: categoryFilter === '' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none' }}>All</button>
                    <button onClick={() => setCategoryFilter('OFFSET')} style={{ padding: '8px 18px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', background: categoryFilter === 'OFFSET' ? 'var(--accent)' : 'var(--surface)', color: categoryFilter === 'OFFSET' ? '#000' : '#888', border: categoryFilter === 'OFFSET' ? '2px solid var(--accent)' : '2px solid #555', borderRadius: 20, transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: categoryFilter === 'OFFSET' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none' }}>Offset</button>
                    <button onClick={() => setCategoryFilter('LASER')} style={{ padding: '8px 18px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', background: categoryFilter === 'LASER' ? 'var(--accent)' : 'var(--surface)', color: categoryFilter === 'LASER' ? '#000' : '#888', border: categoryFilter === 'LASER' ? '2px solid var(--accent)' : '2px solid #555', borderRadius: 20, transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: categoryFilter === 'LASER' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none' }}>Laser</button>
                    <button onClick={() => setCategoryFilter('OTHER')} style={{ padding: '8px 18px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', background: categoryFilter === 'OTHER' ? 'var(--accent)' : 'var(--surface)', color: categoryFilter === 'OTHER' ? '#000' : '#888', border: categoryFilter === 'OTHER' ? '2px solid var(--accent)' : '2px solid #555', borderRadius: 20, transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: categoryFilter === 'OTHER' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none' }}>Others</button>
                </div>
            </div>

            {/* ──── Tab Content ──── */}
            <div className="fo-tab-content">
                {/* Active Jobs Queue */}
                {activeTab === 'queue' && (
                    <div className="fo-panel">
                        <div className="row gap-sm items-center" style={{ justifyContent: 'flex-end', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            <div className="row gap-sm items-center">
                                {activeTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        {((activePage - 1) * PAGE_SIZE) + 1}–{Math.min(activePage * PAGE_SIZE, activeTotal)} of {activeTotal.toLocaleString()}
                                    </span>
                                )}
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
                                                const balance = job.balance < 1 ? 0 : job.balance;
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
                        <div className="row gap-sm items-center" style={{ justifyContent: 'flex-end', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            <div className="row gap-sm items-center">
                                {dueTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        {((duePage - 1) * PAGE_SIZE) + 1}–{Math.min(duePage * PAGE_SIZE, dueTotal)} of {dueTotal.toLocaleString()}
                                    </span>
                                )}
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
                        <div className="row gap-sm items-center" style={{ justifyContent: 'flex-end', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            <div className="row gap-sm items-center">
                                {overdueTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        {((overduePage - 1) * PAGE_SIZE) + 1}–{Math.min(overduePage * PAGE_SIZE, overdueTotal)} of {overdueTotal.toLocaleString()}
                                    </span>
                                )}
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
                                                const balance = job.balance < 1 ? 0 : job.balance;
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
                            <div className="row gap-sm items-center">
                                {completedTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        {((completedPage - 1) * PAGE_SIZE) + 1}–{Math.min(completedPage * PAGE_SIZE, completedTotal)} of {completedTotal.toLocaleString()}
                                    </span>
                                )}
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
                                                    <td>{job.balance > 0 ? <span className="fo-due-amount">{fmt(job.balance)}</span> : <span className="fo-paid-tag"><CheckCircle2 size={14} /> Paid</span>}</td>
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
                        <div className="row gap-sm items-center" style={{ justifyContent: 'flex-end', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            <div className="row gap-sm items-center">
                                {paymentsTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        {((paymentsPage - 1) * PAGE_SIZE) + 1}–{Math.min(paymentsPage * PAGE_SIZE, paymentsTotal)} of {paymentsTotal.toLocaleString()}
                                    </span>
                                )}
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
                        <div className="row gap-sm items-center" style={{ justifyContent: 'flex-end', marginBottom: 18, paddingTop: 16, paddingBottom: 14, paddingLeft: 16, paddingRight: 16, borderBottom: '1px solid var(--border)' }}>
                            <div className="row gap-sm items-center">
                                {deliveredTotal > 0 && (
                                    <span className="muted" style={{ fontSize: 13 }}>
                                        {((deliveredPage - 1) * PAGE_SIZE) + 1}–{Math.min(deliveredPage * PAGE_SIZE, deliveredTotal)} of {deliveredTotal.toLocaleString()}
                                    </span>
                                )}
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
                                                    <td>{job.balance > 0 ? <span className="fo-due-amount">{fmt(job.balance)}</span> : <span className="fo-paid-tag"><CheckCircle2 size={14} /> Paid</span>}</td>
                                                    <td>{fmtDate(job.delivery_date)}</td>
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
                <h3 className="fo-section-title">Job Pipeline</h3>
                <div className="fo-pipeline-bar">
                    {['Pending', 'Processing', 'Completed', 'Delivered'].map(status => (
                        <div key={status} className={`fo-pipeline-stage fo-pipeline-stage--${status.toLowerCase()}`}>
                            <span className="fo-pipeline-stage__count">{status_counts?.[status] || 0}</span>
                            <span className="fo-pipeline-stage__label">{status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

            {/* ──── Opening Balance Prompt Modal ──── */}
            {showOpeningPrompt && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.1)', display: 'grid', placeItems: 'center' }}>
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
                                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                                        <Wallet size={14} /> CASH OPENING BALANCES
                                    </h4>
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
                                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                                        <Monitor size={14} /> MACHINE OPENING COUNTS
                                    </h4>
                                    <div className="stack-sm">
                                        {promptMachines.map((m, idx) => (
                                            <div key={m.id} className="row gap-md items-center">
                                                <div style={{ flex: 1, minWidth: 120 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.machine_name}</div>
                                                    {m.location && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.location}</div>}
                                                </div>
                                                <input type="number" className="input-field"
                                                    value={m.opening_count}
                                                    onChange={(e) => {
                                                        const updated = [...promptMachines];
                                                        updated[idx] = { ...updated[idx], opening_count: e.target.value };
                                                        setPromptMachines(updated);
                                                    }}
                                                    placeholder="Counter reading"
                                                    style={{ width: 160, minWidth: 160, borderColor: 'var(--border)', lineHeight: 1.4 }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="row gap-sm justify-end" style={{ marginTop: 20 }}>
                            <button className="btn btn-ghost" onClick={() => { setShowOpeningPrompt(false); setPromptDone(true); }}>
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

import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import usePolling from '../hooks/usePolling';
import { Search, FileText, Loader2, Plus, Trash2, IndianRupee, RotateCcw, Zap, ChevronDown, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import auth from '../services/auth';
import api from '../services/api';
import localDb from '../services/localDb';
import Pagination from '../components/Pagination';
import toast from 'react-hot-toast';
import './Jobs.css';
import { useOptimistic } from '../hooks/useOptimistic';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import { formatForDisplay } from '../utils/phone';
import { formatCurrency, formatCurrencyDecimal } from '../utils/formatters';
import PageContainer from '../components/ui/PageContainer';

// ── Priority helpers ──
const URGENCY_CONFIG = {
    critical: { label: 'Critical', color: 'var(--error)', bg: 'var(--destructive)', border: 'var(--destructive)', icon: '🔴' },
    high: { label: 'High', color: 'var(--warning)', bg: 'var(--warning)', border: 'var(--warning)', icon: '🟠' },
    medium: { label: 'Medium', color: 'var(--muted)', bg: 'var(--muted-foreground)', border: 'var(--muted-foreground)', icon: '🟡' },
    low: { label: 'Low', color: 'var(--success)', bg: 'var(--muted-foreground)', border: 'var(--muted-foreground)', icon: '🟢' },
};

function computeClientPriority(job) {
    let score = 0;
    const now = new Date();
    // Delivery urgency (0-60)
    if (job.delivery_date) {
        const hrs = (new Date(job.delivery_date) - now) / 36e5;
        score += hrs <= 0 ? 60 : hrs <= 3 ? 55 : hrs <= 6 ? 50 : hrs <= 12 ? 40 : hrs <= 24 ? 30 : hrs <= 48 ? 20 : hrs <= 72 ? 10 : 5;
    } else { score += 15; }
    // Amount (0-20)
    const amt = Number(job.total_amount) || 0;
    score += amt >= 10000 ? 20 : amt >= 5000 ? 15 : amt >= 1000 ? 10 : 5;
    // Priority override (0-25)
    const p = (job.priority || 'Medium').toLowerCase();
    score += p === 'urgent' ? 25 : p === 'high' ? 18 : p === 'medium' ? 10 : 3;
    // Payment (0-10)
    score += job.payment_status === 'Paid' ? 10 : job.payment_status === 'Partial' ? 5 : 0;
    // Age (0-10)
    if (job.created_at) {
        const age = (now - new Date(job.created_at)) / 36e5;
        score += age > 72 ? 10 : age > 48 ? 7 : age > 24 ? 4 : 0;
    }
    const urgency = score >= 100 ? 'critical' : score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
    return { score, urgency };
}

const UrgencyBadge = ({ urgency }) => {
    const c = URGENCY_CONFIG[urgency] || URGENCY_CONFIG.medium;
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: 'nowrap' }}>
            {c.icon} {c.label}
        </span>
    );
};

const formatRupee = (value) => formatCurrencyDecimal(value, 2);

const getStatusColor = (status) => {
    const colors = {
        'Pending': 'badge--warning',
        'Processing': 'badge--info',
        'Approval Pending': 'badge--warning',
        'Completed': 'badge--success',
        'Delivered': 'badge--primary',
        'Cancelled': 'badge--danger'
    };
    return colors[status] || 'badge--default';
};

const canManageOrderStatus = (role) => ['Admin', 'Front Office', 'front office'].includes(role);
const canDeleteOrder = (role) => ['Admin', 'Accountant'].includes(role);
const isFinanceRole = (role) => ['Admin', 'Accountant', 'Front Office', 'front office'].includes(role);
const getTableColumnCount = (sortByPriority, financialsVisible) => 8 + (sortByPriority ? 1 : 0) + (financialsVisible ? 1 : 0);

const getDisplayJobs = (items, sortByPriority) => {
    if (!sortByPriority) return items;
    return [...items]
        .map(j => {
            const { score, urgency } = computeClientPriority(j);
            return { ...j, _score: score, _urgency: urgency };
        })
        .sort((a, b) => b._score - a._score);
};

const getRenderItems = (displayJobs) => {
    const groupMap = new Map();
    const standalones = [];
    displayJobs.forEach(j => {
        if (j.payment_id) {
            if (!groupMap.has(j.payment_id)) groupMap.set(j.payment_id, []);
            groupMap.get(j.payment_id).push(j);
        } else {
            standalones.push(j);
        }
    });
    const seen = new Set();
    const renderList = [];
    displayJobs.forEach(j => {
        if (!j.payment_id) {
            renderList.push({ type: 'single', job: j });
        } else if (!seen.has(j.payment_id)) {
            seen.add(j.payment_id);
            const grpJobs = groupMap.get(j.payment_id);
            if (grpJobs.length === 1) {
                renderList.push({ type: 'single', job: grpJobs[0] });
            } else {
                renderList.push({ type: 'group', paymentId: j.payment_id, jobs: grpJobs });
            }
        }
    });
    return renderList;
};

const Jobs = () => {
    useSEO('Jobs');

    const navigate = useNavigate();
    const { data: jobs, setData: setJobs, optimisticUpdate } = useOptimistic([]);
    const [loading, setLoading] = useState(true);
    const [filterInput, setFilterInput] = useState({ search: '', branch: '', status: '', category: '' });
    const [debouncedFilterInput, setDebouncedFilterInput] = useState(filterInput);
    const [branches, setBranches] = useState([]);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('active'); // active, completed, delivered, due, overdue, payments
    const [sortByPriority, setSortByPriority] = useState(false);
    const [deliveryDueModal, setDeliveryDueModal] = useState({
        isOpen: false,
        job: null,
        remaining: 0,
        message: ''
    });
    const [creditRequesting, setCreditRequesting] = useState(false);
    const [expandedPayments, setExpandedPayments] = useState(new Set());
    const [page, setPage] = useState(1);
    const pageRef = useRef(page);
    const visibleRef = useRef(true);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const LIMIT = 20;
    const PAGE_SIZE = 20;
    const FILTER_DEBOUNCE_MS = 280;

    const userRole = auth.getUser()?.role;
    const isFinancialsVisible = isFinanceRole(userRole);
    const statuses = ['Pending', 'Processing', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled'];
    const searchQuery = debouncedFilterInput.search;
    const statusFilter = debouncedFilterInput.status;
    const branchFilter = debouncedFilterInput.branch;
    const categoryFilter = debouncedFilterInput.category;

    const fetchJobs = useCallback(async (pageNum = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.append('page', pageNum);
            params.append('limit', PAGE_SIZE);

            // Filters
            if (debouncedFilterInput.search) params.append('search', debouncedFilterInput.search);
            if (debouncedFilterInput.status && debouncedFilterInput.status !== 'all') params.append('status', debouncedFilterInput.status);
            if (debouncedFilterInput.branch) params.append('branch_id', debouncedFilterInput.branch);
            if (debouncedFilterInput.category) params.append('category', debouncedFilterInput.category);

            // Tab support (for backend server-side filtering)
            const isFrontOffice = isFinanceRole(userRole);
            if (isFrontOffice) {
                params.append('tab', activeTab);
            } else {
                // For staff, adjust tab if needed (backend handles staff visibility)
                params.append('tab', activeTab === 'active' ? 'active' : 'history');
            }

            const response = await api.get(`/jobs?${params.toString()}`);
            const res = response.data;

            if (res.data && res.total !== undefined) {
                setJobs(res.data);
                setTotal(res.total);
                setTotalPages(res.totalPages || Math.ceil(res.total / PAGE_SIZE));
            } else if (Array.isArray(res)) {
                setJobs(res);
                setTotal(res.length);
                setTotalPages(1);
            } else {
                setJobs([]);
                setTotal(0);
                setTotalPages(1);
            }

            setPage(pageNum);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            console.error('Failed to fetch jobs:', err);
            setError('Failed to load jobs from server');
            setJobs([]);
        } finally {
            setLoading(false);
        }
    }, [activeTab, debouncedFilterInput.branch, debouncedFilterInput.category, debouncedFilterInput.search, debouncedFilterInput.status, setJobs, userRole]);

    const goToPage = useCallback((pageNum) => {
        if (pageNum < 1 || pageNum > totalPages) return;
        fetchJobs(pageNum);
    }, [fetchJobs, totalPages]);

    const updateFilter = useCallback((key, value) => {
        setFilterInput(prev => prev[key] === value ? prev : { ...prev, [key]: value });
    }, []);

    const toggleExpandedPayment = useCallback((paymentId) => {
        setExpandedPayments(prev => {
            const next = new Set(prev);
            next.has(paymentId) ? next.delete(paymentId) : next.add(paymentId);
            return next;
        });
    }, []);

    const fetchBranches = useCallback(async () => {
        try {
            const data = await localDb.getBranches();
            setBranches(data || []);
        } catch (error) {
            console.error('Error fetching branches:', error);
        }
    }, []);

    useEffect(() => {
        const id = window.setTimeout(() => {
            setDebouncedFilterInput(filterInput);
        }, FILTER_DEBOUNCE_MS);
        return () => window.clearTimeout(id);
    }, [filterInput]);

    useEffect(() => {
        const init = () => {
            fetchBranches();
            fetchJobs(1);
        };
        if (window.requestIdleCallback) {
            requestIdleCallback(init, { timeout: 1500 });
        } else {
            init();
        }
    }, [fetchBranches, fetchJobs]);

    // bfcache: reconnect on page show / cleanup on hide
    useEffect(() => {
        const handlePageShow = (e) => {
            if (e.persisted) fetchJobs(pageRef.current);
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, [fetchJobs]);

    useEffect(() => {
        fetchJobs(1);
    }, [debouncedFilterInput.branch, debouncedFilterInput.category, debouncedFilterInput.search, debouncedFilterInput.status, activeTab, fetchJobs]);

    useEffect(() => {
        pageRef.current = page;
    }, [page]);

    useEffect(() => {
        const handlePaymentUpdate = () => {
            if (visibleRef.current) fetchJobs(pageRef.current);
        };
        window.addEventListener('paymentRecorded', handlePaymentUpdate);
        return () => window.removeEventListener('paymentRecorded', handlePaymentUpdate);
    }, [fetchJobs]);

    useEffect(() => {
        const handleVisibility = () => {
            const visible = document.visibilityState === 'visible';
            visibleRef.current = visible;
            if (visible) fetchJobs(pageRef.current);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [fetchJobs]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && deliveryDueModal.isOpen) {
                closeDeliveryDueModal();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deliveryDueModal.isOpen]);

    const handleUpdateStatus = async (job, newStatus) => {
        const balance = Number(job.balance_amount) || 0;
        if (newStatus === 'Delivered' && balance > 0) {
            setDeliveryDueModal({
                isOpen: true,
                job,
                remaining: balance,
                message: 'Full payment is required before marking this order as Delivered.'
            });
            return;
        }

        await optimisticUpdate({
            updateFn: (prev) => prev.map(j => 
                j.id === job.id ? { ...j, status: newStatus, _updating: true } : j
            ),
            serverFn: async () => {
                await api.put(`/jobs/${job.id}`, { status: newStatus });
            },
            rollbackFn: () => fetchJobs(page),
            successMsg: `Job status updated to ${newStatus}`,
            errorMsg: 'Failed to update job status'
        });
        
        // Re-fetch so server-side tab filtering removes the job from the current tab
        fetchJobs(page);
    };

    const closeDeliveryDueModal = () => {
        setDeliveryDueModal({ isOpen: false, job: null, remaining: 0, message: '' });
    };

    const handlePayRemainingDue = () => {
        const job = deliveryDueModal.job;
        if (!job) return;
        closeDeliveryDueModal();
        navigate('/dashboard/customer-payments', {
            state: {
                customer_id: job.customer_id || null,
                job_id: job.id,
                amount: Number(deliveryDueModal.remaining) || Number(job.balance_amount) || 0
            }
        });
    };

    const handleRequestAdminCredit = async () => {
        const job = deliveryDueModal.job;
        if (!job) return;
        const totalAmt = Number(job.total_amount) || 0;
        const remaining = Number(deliveryDueModal.remaining) || Number(job.balance_amount) || 0;
        const percent = totalAmt > 0 ? Math.min(100, Math.max(0.1, (remaining / totalAmt) * 100)) : 1;

        setCreditRequesting(true);
        try {
            await api.post('/requests/discount', {
                discount_percent: Number(percent.toFixed(2)),
                total_amount: totalAmt,
                customer_name: job.customer_name || 'Walk-in',
                reason: `Credit request for delivery: Job ${job.job_number}, pending due Rs. ${remaining.toFixed(2)}.`
            });
            toast.success('Credit request sent to Admin/Accountant for approval.');
            closeDeliveryDueModal();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to send credit request');
        } finally {
            setCreditRequesting(false);
        }
    };

    const handleRepeatOrder = async (jobId) => {
        try {
            const res = await api.post(`/jobs/${jobId}/repeat`);
            toast.success(res.data.message || 'Order repeated!');
            fetchJobs(1);
            navigate(`/dashboard/jobs/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to repeat order');
        }
    };

    const handleDeleteJob = async (e, jobId) => {
        e.stopPropagation();
        if (!window.confirm('Delete this job permanently?\n\nThis will also delete all associated payments, proofs, staff assignments, and other linked records.\n\nThis cannot be undone.')) return;
        // Optimistic UI Update
        setJobs(prev => prev.filter(job => job.id !== jobId));
        setTotal(prev => Math.max(0, prev - 1));
        try {
            await api.delete(`/jobs/${jobId}`);
            toast.success('Job and all associated records deleted');
            fetchJobs(page);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete job');
            fetchJobs(page);
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'Pending': 'badge--warning',
            'Processing': 'badge--info',
            'Approval Pending': 'badge--warning',
            'Completed': 'badge--success',
            'Delivered': 'badge--primary',
            'Cancelled': 'badge--danger'
        };
        return colors[status] || 'badge--default';
    };

    const displayJobs = useMemo(() => getDisplayJobs(jobs, sortByPriority), [jobs, sortByPriority]);
    const renderItems = useMemo(() => getRenderItems(displayJobs), [displayJobs]);
    const visibleRenderItems = useMemo(() => renderItems.slice(0, PAGE_SIZE), [renderItems]);
    const tableColumnCount = useMemo(() => getTableColumnCount(sortByPriority, isFinancialsVisible), [sortByPriority, isFinancialsVisible]);

    return (
        <PageContainer>
            <header className="page-header flex justify-between items-center flex-wrap gap-md p-12 rounded-lg shadow-sm">
                <div className="flex items-center gap-sm">
                    <h1 className="page-title">
                        <FileText className="text-heading" size={20} aria-hidden="true" /> Jobs & Work Orders
                    </h1>
                </div>
                <div className="flex gap-sm flex-wrap">
                    <button className="btn btn-primary" onClick={() => navigate('/dashboard/sales/orders/create')}>
                        <Plus size={18} aria-hidden="true" /> Create Job
                    </button>
                </div>
            </header>

            <div className="flex flex-wrap gap-sm items-center p-3 rounded-lg border" style={{ background: 'var(--surface)' }}>
                <div className="relative flex-1 min-w-[200px]" style={{ maxWidth: '400px' }}>
                    <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                    <label htmlFor="job-search" className="sr-only">Search jobs</label>
                    <input
                        id="job-search"
                        type="text"
                        placeholder="Search by Job No, Name, or Customer..."
                        value={filterInput.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        className="input-field"
                        style={{ paddingLeft: 36, width: '100%', height: 36, fontSize: 14 }}
                    />
                </div>
                <button
                    onClick={() => setSortByPriority(v => !v)}
                    title={sortByPriority ? 'Sort by date (default)' : 'Sort by priority'}
                    className={`btn btn-sm ${sortByPriority ? 'btn-primary' : 'btn-ghost'}`}
                >
                    <Zap size={14} /> Priority
                </button>
                <div className="relative flex-1" style={{ maxWidth: 180, minWidth: 140 }}>
                    <Building2 size={16} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
                    <label htmlFor="job-branch-filter" className="sr-only">Filter by branch</label>
                    <select
                        id="job-branch-filter"
                        value={filterInput.branch}
                        onChange={(e) => updateFilter('branch', e.target.value)}
                        className="input-field"
                        style={{ paddingLeft: 32, width: '100%', height: 36, fontSize: 14, appearance: 'none' }}
                        aria-label="Filter by branch"
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="flex flex-wrap gap-sm p-3 rounded-lg border" style={{ background: 'var(--surface)' }}>
                <span className="text-sm text-muted" style={{ fontWeight: 700, minWidth: 'fit-content' }}>Type:</span>
                <button onClick={() => updateFilter('category', '')} className={`btn btn-chip ${categoryFilter === '' ? 'active' : ''}`}>All</button>
                <button onClick={() => updateFilter('category', 'OFFSET')} className={`btn btn-chip ${categoryFilter === 'OFFSET' ? 'active' : ''}`}>Offset</button>
                <button onClick={() => updateFilter('category', 'LASER')} className={`btn btn-chip ${categoryFilter === 'LASER' ? 'active' : ''}`}>Laser</button>
                <button onClick={() => updateFilter('category', 'OTHER')} className={`btn btn-chip ${categoryFilter === 'OTHER' ? 'active' : ''}`}>Others</button>
            </div>

            <div className="flex justify-between items-center text-sm text-muted" style={{ padding: '8px 0' }}>
                <span>{loading ? 'Loading...' : `Showing ${((page-1)*LIMIT)+1}–${Math.min(page*LIMIT, total)} of ${total} jobs`}</span>
                <span>{totalPages} pages total</span>
            </div>

            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th scope="col">Job Details</th>
                                <th scope="col">Customer</th>
                                <th scope="col">Branch</th>
                                <th scope="col">Status</th>
                                {sortByPriority && <th scope="col">Priority</th>}
                                <th scope="col">Production</th>
                                {isFinancialsVisible && <th scope="col">Amount</th>}
                                {isFinancialsVisible && <th scope="col">Balance</th>}
                                <th scope="col">Delivery</th>
                                <th scope="col">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let displayJobs = [...jobs];
                                if (sortByPriority) {
                                    displayJobs = displayJobs.map(j => {
                                        const { score, urgency } = computeClientPriority(j);
                                        return { ...j, _score: score, _urgency: urgency };
                                    }).sort((a, b) => b._score - a._score);
                                }

                                if (loading && jobs.length === 0) {
                                    const cols = [
                                      { key: 'jobDetails', header: 'Job Details', width: '2fr', lines: 2 },
                                      { key: 'customer', header: 'Customer', width: '1.5fr', lines: 2 },
                                      { key: 'branch', header: 'Branch', width: '1fr' },
                                      { key: 'status', header: 'Status', width: '1fr', pill: true },
                                      ...(sortByPriority ? [{ key: 'priority', header: 'Priority', width: '0.8fr', pill: true }] : []),
                                      { key: 'production', header: 'Production', width: '1fr', lines: 2 },
                                      ...(isFinancialsVisible ? [
                                        { key: 'amount', header: 'Amount', width: '0.8fr' },
                                        { key: 'balance', header: 'Balance', width: '0.8fr' }
                                      ] : []),
                                      { key: 'delivery', header: 'Delivery', width: '1fr' },
                                      { key: 'actions', header: 'Actions', width: '0.8fr' }
                                    ];
                                    return (
                                        <tr>
                                            <td colSpan={cols.length} style={{ textAlign: 'center', padding: '20px' }}>
                                                <SkeletonLoader type="table" count={6} columns={cols} />
                                            </td>
                                        </tr>
                                    );
                                }
                                if (error && jobs.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan="9" style={{ textAlign: 'center', padding: '20px' }}>
                                                <ServerError onRetry={() => fetchJobs(1)} message={error} />
                                            </td>
                                        </tr>
                                    );
                                }
                                // Group jobs by payment_id (null = standalone)
                                const groupMap = new Map(); // payment_id -> [jobs]
                                const standalones = [];
                                displayJobs.forEach(j => {
                                    if (j.payment_id) {
                                        if (!groupMap.has(j.payment_id)) groupMap.set(j.payment_id, []);
                                        groupMap.get(j.payment_id).push(j);
                                    } else {
                                        standalones.push(j);
                                    }
                                });
                                // Build ordered render list: preserve original order, show group once at first occurrence
                                const seen = new Set();
                                const renderList = []; // [{type:'single',job} | {type:'group',paymentId,jobs}]
                                displayJobs.forEach(j => {
                                    if (!j.payment_id) {
                                        renderList.push({ type: 'single', job: j });
                                    } else if (!seen.has(j.payment_id)) {
                                        seen.add(j.payment_id);
                                        const grpJobs = groupMap.get(j.payment_id);
                                        if (grpJobs.length === 1) {
                                            renderList.push({ type: 'single', job: grpJobs[0] });
                                        } else {
                                            renderList.push({ type: 'group', paymentId: j.payment_id, jobs: grpJobs });
                                        }
                                    }
                                });

                                const renderJobRow = (j, opts = {}) => {
                                    const { isSubRow = false, isSummaryRow = false, groupJobs = null } = opts;
                                    const totalCols = 6 + (sortByPriority ? 1 : 0) + (isFinancialsVisible ? 2 : 0);
                                    return (
                                        <tr
                                            key={j.id}
                                            onDoubleClick={() => !isSummaryRow && navigate(`/dashboard/jobs/${j.id}`)}
                                            style={{
                                                cursor: 'pointer',
                                                ...(isSubRow ? { background: 'var(--surface2, rgba(255,255,255,0.03))' } : {}),
                                            }}
                                        >
                                            <td>
                                                <div className="stack-xs" style={isSubRow ? { paddingLeft: 18, borderLeft: '3px solid var(--border)' } : {}}>
                                                    {isSummaryRow ? (
                                                        <>
                                                            <div className="row items-center gap-xs">
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    style={{ padding: '2px 4px', minWidth: 0 }}
                                                                    title={expandedPayments.has(j.payment_id) ? 'Collapse' : 'Expand'}
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        setExpandedPayments(prev => {
                                                                            const next = new Set(prev);
                                                                            next.has(j.payment_id) ? next.delete(j.payment_id) : next.add(j.payment_id);
                                                                            return next;
                                                                        });
                                                                    }}
                                                                >
                                                                    <ChevronDown size={14} style={{ transform: expandedPayments.has(j.payment_id) ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
                                                                </button>
                                                                <span className="font-bold text-sm">{groupJobs.map(g => g.job_number).join(', ')}</span>
                                                            </div>
                                                            <span className="text-xs muted">{groupJobs.length} jobs · single bill</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="row items-center gap-xs">
                                                                <span className="font-bold text-sm">{j.job_number}</span>
                                                                <span className="text-xs muted" style={{ opacity: 0.7 }}>• {j.product_name || 'Service'}</span>
                                                            </div>
                                                            <span className="text-sm font-medium">{j.job_name}</span>
                                                            
                                                            {/* Extra Tags for Dashboard List */}
                                                            {j.description && (
                                                                <div className="row wrap gap-xs mt-4" style={{ marginTop: 4 }}>
                                                                    {j.description.split(' | ').filter(p => p && p.trim()).map((part, i) => {
                                                                        const isTagged = part.includes(':');
                                                                        const [label, ...rest] = isTagged ? part.split(':') : ['', part];
                                                                        const value = isTagged ? rest.join(':').trim() : part.trim();
                                                                        const tagLabel = isTagged ? label.trim().toLowerCase() : '';
                                                                        
                                                                        // Color coding for common tags
                                                                        const isColour = tagLabel === 'colour' || tagLabel === 'color';
                                                                        const isNumbering = tagLabel === 'numbering' || tagLabel.includes('from') || tagLabel.includes('to');
                                                                        const isMatter = tagLabel === 'matter';
                                                                        
                                                                        return (
                                                                            <span key={i} style={{
                                                                                fontSize: '10px',
                                                                                padding: '1px 6px',
                                                                                borderRadius: '4px',
                                                                                background: isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)',
                                                                                color: isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--text-muted)',
                                                                                border: `1px solid ${isColour ? 'var(--destructive)' : isNumbering ? 'var(--primary)' : isMatter ? 'var(--primary)' : 'var(--muted-foreground)'}`,
                                                                                fontWeight: 600,
                                                                                maxWidth: '120px',
                                                                                overflow: 'hidden',
                                                                                textOverflow: 'ellipsis',
                                                                                whiteSpace: 'nowrap'
                                                                            }}>
                                                                                {isColour && '🎨 '}
                                                                                {isNumbering && '🔢 '}
                                                                                {isMatter && '📝 '}
                                                                                {tagLabel && <span style={{ textTransform: 'capitalize' }}>{tagLabel}: </span>}
                                                                                {value}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                    
                                                                    {/* Applied Extras Badge count */}
                                                                    {(() => {
                                                                        try {
                                                                            const extras = typeof j.applied_extras === 'string' ? JSON.parse(j.applied_extras) : j.applied_extras;
                                                                            if (Array.isArray(extras) && extras.length > 0) {
                                                                                return (
                                                                                    <span style={{ fontSize: '9px', color: 'var(--accent)', fontWeight: 700, background: 'var(--accent-soft)', padding: '1px 4px', borderRadius: '4px' }}>
                                                                                        +{extras.length} Extras
                                                                                    </span>
                                                                                );
                                                                            }
                                                                        } catch {}
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="stack-xs">
                                                    <span className="text-sm font-medium">{j.customer_name}</span>
                                                    <span className="text-xs muted">{formatForDisplay(j.customer_mobile)}</span>
                                                </div>
                                            </td>
                                            <td className="text-sm">
                                                {j.branch_name || 'Main'}
                                            </td>
                                            <td>
                                                {isSummaryRow ? (
                                                    <div className="stack-xs">
                                                        {[...new Set(groupJobs.map(g => g.status))].map(s => (
                                                            <span key={s} className={`badge ${getStatusColor(s)}`} style={{ fontSize: 10 }}>{s}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {['Admin', 'Front Office', 'front office'].includes(userRole) ? (
                                                            <select
                                                                className={`badge ${getStatusColor(j.status)}`}
                                                                style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
                                                                value={j.status}
                                                                onChange={(e) => handleUpdateStatus(j, e.target.value)}
                                                                aria-label={`Change order status for ${j.job_number}`}
                                                            >
                                                                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                                            </select>
                                                        ) : (
                                                            <span className={`badge ${getStatusColor(j.status)}`}>{j.status}</span>
                                                        )}
                                                        {j._updating && <Loader2 size={12} className="animate-spin ml-4 inline-block" style={{ verticalAlign: 'middle' }} />}
                                                    </>
                                                )}
                                            </td>
                                            {sortByPriority && (
                                                <td>
                                                    <UrgencyBadge urgency={j._urgency || 'medium'} />
                                                </td>
                                            )}
                                            <td>
                                                {Number(j.used_sheets) > 0 ? (() => {
                                                    const req = Number(j.required_sheets) || 0;
                                                    const used = Number(j.used_sheets) || 0;
                                                    const waste = req > 0 ? Math.max(0, used - req) : 0;
                                                    const pct = req > 0 ? ((waste / req) * 100).toFixed(0) : null;
                                                    const color = pct === null ? 'var(--muted)' : Number(pct) <= 3 ? 'var(--success)' : Number(pct) <= 8 ? 'var(--warning)' : 'var(--text-muted)';
                                                    return (
                                                        <div className="stack-xs">
                                                            <span style={{ fontSize: '11px', fontWeight: 600, color }}>
                                                                {used} / {req} sheets
                                                            </span>
                                                            {pct !== null && (
                                                                <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                                                                    {pct}% waste
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                })() : (
                                                    <span className="muted text-xs">—</span>
                                                )}
                                            </td>
                                            {isFinancialsVisible && (
                                                <td>
                                                    <div className="row items-center gap-xs text-sm">
                                                        <IndianRupee size={12} />
                                                        {isSummaryRow
                                                            ? groupJobs.reduce((s, g) => s + (Number(g.total_amount) || 0), 0).toFixed(2)
                                                            : j.total_amount}
                                                    </div>
                                                </td>
                                            )}
                                            {isFinancialsVisible && (
                                                <td>
                                                    {isSummaryRow ? (() => {
                                                        const bal = groupJobs.reduce((s, g) => s + (Number(g.balance_amount) || 0), 0);
                                                        return (
                                                            <div className={`row items-center gap-xs text-sm font-bold ${bal > 0 ? 'text-danger' : 'text-success'}`}>
                                                                <IndianRupee size={12} />{bal.toFixed(2)}
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div className={`row items-center gap-xs text-sm font-bold ${j.balance_amount > 0 ? 'text-danger' : 'text-success'}`}>
                                                            <IndianRupee size={12} />
                                                            {j.balance_amount}
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                            <td className="text-sm muted">
                                                {j.delivery_date ? new Date(j.delivery_date).toLocaleDateString() : 'Not Set'}
                                            </td>
                                            <td>
                                                {isSummaryRow ? (
                                                    <span className="text-xs muted">expand ↑↓</span>
                                                ) : (
                                                    <div className="row gap-sm">
                                                        <button
                                                            className="btn btn-ghost btn-danger touch-target"
                                                            title="View Details"
                                                            aria-label={`View details for job ${j.job_number}`}
                                                            onClick={() => navigate(`/dashboard/jobs/${j.id}`)}
                                                        >
                                                            <FileText size={16} />
                                                        </button>
                                                        {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                                                            <button
                                                                className="btn btn-ghost touch-target"
                                                                style={{ color: 'var(--accent)' }}
                                                                title="Repeat Order"
                                                                aria-label={`Repeat order ${j.job_number}`}
                                                                onClick={(e) => { e.stopPropagation(); handleRepeatOrder(j.id); }}
                                                            >
                                                                <RotateCcw size={16} />
                                                            </button>
                                                        )}
                                                        {['Admin', 'Accountant'].includes(userRole) && (
                                                            <button
                                                                className="btn btn-ghost touch-target"
                                                                style={{ color: 'var(--error)' }}
                                                                title="Delete Job"
                                                                aria-label={`Delete job ${j.job_number}`}
                                                                onClick={(e) => handleDeleteJob(e, j.id)}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                };

                                return renderList.flatMap(item => {
                                    if (item.type === 'single') {
                                        return [renderJobRow(item.job)];
                                    }
                                    // Group: summary row + optional sub-rows
                                    const rep = item.jobs[0];
                                    const isExpanded = expandedPayments.has(item.paymentId);
                                    const rows = [renderJobRow(rep, { isSummaryRow: true, groupJobs: item.jobs })];
                                    if (isExpanded) {
                                        item.jobs.forEach(gj => rows.push(renderJobRow(gj, { isSubRow: true })));
                                    }
                                    return rows;
                                });
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={LIMIT}
                onPageChange={goToPage}
                loading={loading}
            />

            {deliveryDueModal.isOpen && (
                <div className="modal-backdrop" style={{ zIndex: 1000 }}>
                    <div className="modal" style={{ maxWidth: 520, width: '94%' }}>
                        <h2 className="section-title" style={{ marginBottom: 8 }}>Payment Pending</h2>
                        <p className="section-subtitle" style={{ marginBottom: 16 }}>{deliveryDueModal.message}</p>

                        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                                <span className="muted">Job</span>
                                <strong>{deliveryDueModal.job?.job_number} - {deliveryDueModal.job?.job_name}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                                <span className="muted">Customer</span>
                                <strong>{deliveryDueModal.job?.customer_name || 'Walk-in'}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                                <span className="muted">Total Amount</span>
                                <strong>Rs. {(Number(deliveryDueModal.job?.total_amount) || 0).toFixed(2)}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                                <span className="muted">Paid So Far</span>
                                <strong>Rs. {(Number(deliveryDueModal.job?.advance_paid) || 0).toFixed(2)}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between' }}>
                                <span className="muted">Remaining Due</span>
                                <strong style={{ color: 'var(--warning)' }}>Rs. {(Number(deliveryDueModal.remaining) || 0).toFixed(2)}</strong>
                            </div>
                        </div>

                        <div className="row gap-sm" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost" onClick={closeDeliveryDueModal}>Close</button>
                            <button className="btn btn-secondary" onClick={handleRequestAdminCredit} disabled={creditRequesting}>
                                {creditRequesting ? <Loader2 size={14} className="animate-spin" /> : null}
                                <span>Request Admin to Credit</span>
                            </button>
                            <button className="btn btn-primary" onClick={handlePayRemainingDue}>Pay Remaining Due</button>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default Jobs;

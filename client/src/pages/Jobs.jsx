import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Search, FileText, Loader2, Plus, Trash2, IndianRupee, RotateCcw, Zap, ChevronDown, Building2, Users, Eye, Download, FileSpreadsheet } from 'lucide-react';
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
import EmptyState from '../components/EmptyState';
import { formatForDisplay } from '../utils/phone';
import {formatCurrencyDecimal} from '../utils/formatters';
import PageContainer from '../components/ui/PageContainer';

// ── Priority helpers ──
const URGENCY_CONFIG = {
    critical: { label: 'Critical', color: 'urgency-badge--critical' },
    high: { label: 'High', color: 'urgency-badge--high' },
    medium: { label: 'Medium', color: 'urgency-badge--medium' },
    low: { label: 'Low', color: 'urgency-badge--low' },
};

function computeClientPriority(job) {
    let score = 0;
    const now = new Date();
    if (job.delivery_date) {
        const hrs = (new Date(job.delivery_date) - now) / 36e5;
        score += hrs <= 0 ? 60 : hrs <= 3 ? 55 : hrs <= 6 ? 50 : hrs <= 12 ? 40 : hrs <= 24 ? 30 : hrs <= 48 ? 20 : hrs <= 72 ? 10 : 5;
    } else { score += 15; }
    const amt = Number(job.total_amount) || 0;
    score += amt >= 10000 ? 20 : amt >= 5000 ? 15 : amt >= 1000 ? 10 : 5;
    const p = (job.priority || 'Medium').toLowerCase();
    score += p === 'urgent' ? 25 : p === 'high' ? 18 : p === 'medium' ? 10 : 3;
    score += job.payment_status === 'Paid' ? 10 : job.payment_status === 'Partial' ? 5 : 0;
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
        <span className={`urgency-badge ${c.color}`}>
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="3" /></svg>
            {c.label}
        </span>
    );
};

const _formatRupee = (value) => formatCurrencyDecimal(value, 2);

const _getStatusColor = (status) => {
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

const _canManageOrderStatus = (role) => ['Admin', 'Front Office', 'front office'].includes(role);
const _canDeleteOrder = (role) => ['Admin', 'Accountant'].includes(role);
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

const JOB_STATUSES = ['Pending', 'Processing', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled'];

const Jobs = () => {
    useSEO('Jobs');

    const navigate = useNavigate();
    const { data: jobs, setData: setJobs, optimisticUpdate } = useOptimistic([]);
    const [loading, setLoading] = useState(true);
    const [filterInput, setFilterInput] = useState({ search: '', branch: '', status: '', category: '', customerType: '' });
    const [debouncedFilterInput, setDebouncedFilterInput] = useState(filterInput);
    const [branches, setBranches] = useState([]);
    const [error, setError] = useState('');
    const [activeTab, _setActiveTab] = useState('active');
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

    const [exportFilter, setExportFilter] = useState('active');
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportRef = useRef(null);

    // Close export dropdown when clicking outside
    useEffect(() => {
        if (!showExportMenu) return;
        const handler = (e) => {
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showExportMenu]);

    const fetchAllJobsForExport = async (filterType) => {
        try {
            const params = new URLSearchParams();
            params.append('export', '1');
            if (debouncedFilterInput.search) params.append('search', debouncedFilterInput.search);
            if (debouncedFilterInput.branch) params.append('branch_id', debouncedFilterInput.branch);
            if (debouncedFilterInput.category) params.append('category', debouncedFilterInput.category);
            if (debouncedFilterInput.customerType) params.append('customer_type', debouncedFilterInput.customerType);

            // Use the selected export filter type
            params.append('tab', filterType || 'active');

            const response = await api.get(`/jobs?${params.toString()}`);
            return Array.isArray(response.data) ? response.data : [];
        } catch (err) {
            console.error('Failed to fetch jobs for export:', err);
            toast.error('Failed to fetch orders data for export.');
            return [];
        }
    };

    const getExportTitle = () => {
        const parts = ['Orders Report'];
        if (exportFilter) parts.push(`Type: ${exportFilter.toUpperCase()}`);
        if (debouncedFilterInput.search) parts.push(`Search: "${debouncedFilterInput.search}"`);
        return parts.join(' | ');
    };

    const exportToPDF = async () => {
        const toastId = toast.loading('Preparing PDF...');
        try {
            const allJobs = await fetchAllJobsForExport(exportFilter);
            if (allJobs.length === 0) {
                toast.error('No orders to export', { id: toastId });
                return;
            }

            const [{ default: jsPDF }, autotable] = await Promise.all([
                import('jspdf'),
                import('jspdf-autotable'),
            ]);
            toast.success('Generating PDF...', { id: toastId });

            const doc = new jsPDF('l', 'mm', 'a4');
            const title = getExportTitle();

            const tableColumn = [
                'Order No', 
                'Date',
                'Job Name', 
                'Category', 
                'Customer Name', 
                'Phone', 
                'Branch', 
                'Status', 
                'Sheets (Used/Req)',
                ...(isFinancialsVisible ? ['Total Amount', 'Balance'] : [])
            ];

            const tableRows = allJobs.map(j => [
                j.job_number || '',
                j.created_at ? new Date(j.created_at).toLocaleDateString('en-IN') : '',
                j.job_name || '',
                j.category || '',
                j.customer_name || 'Walk-in',
                j.customer_mobile ? String(j.customer_mobile).replace(/^\+/, '') : '',
                j.branch_name || 'Main',
                j.status || '',
                `${j.used_sheets || 0}/${j.required_sheets || 0}`,
                ...(isFinancialsVisible ? [
                    `Rs. ${Number(j.total_amount || 0).toFixed(2)}`,
                    `Rs. ${Number(j.balance_amount || 0).toFixed(2)}`
                ] : [])
            ]);

            doc.setFontSize(16);
            doc.text(title, 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated: ${new Date().toLocaleString('en-IN')} | Total Orders: ${allJobs.length}`, 14, 22);
            
            doc.autoTable({
                head: [tableColumn],
                body: tableRows,
                startY: 28,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [79, 70, 229], fontSize: 8, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 245, 250] }
            });

            doc.save(`orders-${new Date().toISOString().split('T')[0]}.pdf`);
            setShowExportMenu(false);
            toast.dismiss(toastId);
        } catch (error) {
            console.error('PDF Export failed:', error);
            toast.error('PDF Export failed', { id: toastId });
        }
    };

    const exportToExcel = async () => {
        const toastId = toast.loading('Preparing CSV...');
        try {
            const allJobs = await fetchAllJobsForExport(exportFilter);
            if (allJobs.length === 0) {
                toast.error('No orders to export', { id: toastId });
                return;
            }
            toast.success('Generating CSV...', { id: toastId });

            const headers = [
                'Order No', 
                'Date',
                'Job Name', 
                'Description',
                'Category', 
                'Customer Name', 
                'Customer Phone', 
                'Customer Type',
                'Branch', 
                'Status', 
                'Payment Status',
                'Required Sheets',
                'Used Sheets',
                ...(isFinancialsVisible ? ['Total Amount', 'Balance'] : []),
                'Delivery Date'
            ];

            const rows = allJobs.map(j => [
                j.job_number || '',
                j.created_at ? new Date(j.created_at).toLocaleString('en-IN') : '',
                j.job_name || '',
                j.description || '',
                j.category || '',
                j.customer_name || 'Walk-in',
                j.customer_mobile ? String(j.customer_mobile) : '',
                j.customer_type || 'Walk-in',
                j.branch_name || 'Main',
                j.status || '',
                j.payment_status || '',
                Number(j.required_sheets || 0),
                Number(j.used_sheets || 0),
                ...(isFinancialsVisible ? [
                    Number(j.total_amount || 0),
                    Number(j.balance_amount || 0)
                ] : []),
                j.delivery_date ? new Date(j.delivery_date).toLocaleString('en-IN') : ''
            ]);

            const title = getExportTitle();
            const csvContent = [['Report: ' + title], headers, ...rows]
                .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            setShowExportMenu(false);
            toast.dismiss(toastId);
        } catch (error) {
            console.error('CSV Export failed:', error);
            toast.error('CSV Export failed', { id: toastId });
        }
    };

    const userRole = auth.getUser()?.role;
    const isFinancialsVisible = isFinanceRole(userRole);
    const _searchQuery = debouncedFilterInput.search;
    const _statusFilter = debouncedFilterInput.status;
    const _branchFilter = debouncedFilterInput.branch;
    const categoryFilter = debouncedFilterInput.category;

    const fetchJobs = useCallback(async (pageNum = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.append('page', pageNum);
            params.append('limit', PAGE_SIZE);

            if (debouncedFilterInput.search) params.append('search', debouncedFilterInput.search);
            if (debouncedFilterInput.status && debouncedFilterInput.status !== 'all') params.append('status', debouncedFilterInput.status);
            if (debouncedFilterInput.branch) params.append('branch_id', debouncedFilterInput.branch);
            if (debouncedFilterInput.category) params.append('category', debouncedFilterInput.category);
            if (debouncedFilterInput.customerType) params.append('customer_type', debouncedFilterInput.customerType);

            const isFrontOffice = isFinanceRole(userRole);
            if (isFrontOffice) {
                params.append('tab', activeTab);
            } else {
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
    }, [activeTab, debouncedFilterInput.branch, debouncedFilterInput.category, debouncedFilterInput.customerType, debouncedFilterInput.search, debouncedFilterInput.status, setJobs, userRole]);

    const goToPage = useCallback((pageNum) => {
        if (pageNum < 1 || pageNum > totalPages) return;
        fetchJobs(pageNum);
    }, [fetchJobs, totalPages]);

    const updateFilter = useCallback((key, value) => {
        setFilterInput(prev => prev[key] === value ? prev : { ...prev, [key]: value });
    }, []);

    const _toggleExpandedPayment = useCallback((paymentId) => {
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

    useEffect(() => {
        const handlePageShow = (e) => {
            if (e.persisted) fetchJobs(pageRef.current);
        };
        window.addEventListener('pageshow', handlePageShow);
        return () => window.removeEventListener('pageshow', handlePageShow);
    }, [fetchJobs]);

    useEffect(() => {
        fetchJobs(1);
    }, [debouncedFilterInput.branch, debouncedFilterInput.category, debouncedFilterInput.customerType, debouncedFilterInput.search, debouncedFilterInput.status, activeTab, fetchJobs]);

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
        
        fetchJobs(page);
    };

    function closeDeliveryDueModal() {
        setDeliveryDueModal({ isOpen: false, job: null, remaining: 0, message: '' });
    }

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
            navigate(`/dashboard/sales/orders/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to repeat order');
        }
    };

    const handleDeleteJob = async (e, jobId) => {
        e.stopPropagation();
        if (!window.confirm('Delete this job permanently?\n\nThis will also delete all associated payments, proofs, staff assignments, and other linked records.\n\nThis cannot be undone.')) return;
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

    const getStatusCssClass = (status) => {
        const m = {
            'Pending': 'job-status--pending',
            'Processing': 'job-status--processing',
            'Approval Pending': 'job-status--approval-pending',
            'Completed': 'job-status--completed',
            'Delivered': 'job-status--delivered',
            'Cancelled': 'job-status--cancelled'
        };
        return m[status] || 'job-status--pending';
    };

    const displayJobs = useMemo(() => getDisplayJobs(jobs, sortByPriority), [jobs, sortByPriority]);
    const renderItems = useMemo(() => getRenderItems(displayJobs), [displayJobs]);
    const _visibleRenderItems = useMemo(() => renderItems.slice(0, PAGE_SIZE), [renderItems]);
    const tableColumnCount = useMemo(() => getTableColumnCount(sortByPriority, isFinancialsVisible), [sortByPriority, isFinancialsVisible]);

    return (
        <PageContainer>
            {/* ── Premium Header ── */}
            <header className="jobs-header">
                <div className="jobs-header-left">
                    <div className="jobs-header-icon">
                        <FileText size={24} aria-hidden="true" />
                    </div>
                    <div className="jobs-header-text">
                        <h1>Jobs & Work Orders</h1>
                        <p>Manage and track all production jobs</p>
                    </div>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/dashboard/sales/invoices/create')}>
                    <Plus size={18} aria-hidden="true" /> Create Job
                </button>
            </header>

            {/* ── Filter Toolbar ── */}
            <div className="jobs-filters">
                <div className="jobs-search">
                    <Search size={16} className="jobs-search-icon" aria-hidden="true" />
                    <label htmlFor="job-search" className="sr-only">Search jobs</label>
                    <input
                        id="job-search"
                        type="text"
                        placeholder="Search by Job No, Name, or Customer..."
                        value={filterInput.search}
                        onChange={(e) => updateFilter('search', e.target.value)}
                        className="jobs-search-input"
                    />
                </div>

                <button
                    onClick={() => setSortByPriority(v => !v)}
                    title={sortByPriority ? 'Sort by date (default)' : 'Sort by priority'}
                    className={`btn-priority ${sortByPriority ? 'btn-priority--active' : ''}`}
                >
                    <Zap size={14} />
                    <span>Priority</span>
                </button>

                <div className="filter-select">
                    <Building2 size={14} className="filter-select-icon" />
                    <select
                        value={filterInput.branch}
                        onChange={(e) => updateFilter('branch', e.target.value)}
                        aria-label="Filter by branch"
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <ChevronDown size={12} className="filter-select-icon" />
                </div>

                <div className="filter-select">
                    <Users size={14} className="filter-select-icon" />
                    <select
                        value={filterInput.customerType}
                        onChange={(e) => updateFilter('customerType', e.target.value)}
                        aria-label="Filter by customer type"
                    >
                        <option value="">All Customers</option>
                        <option value="Walk-in">Walk-in</option>
                        <option value="Retail">Retail</option>
                        <option value="Offset">Offset</option>
                    </select>
                    <ChevronDown size={12} className="filter-select-icon" />
                </div>

                <div className="export-dropdown-wrapper" ref={exportRef}>
                    <button className="toolbar-btn toolbar-btn--icon" title="Export Orders" onClick={() => setShowExportMenu(prev => !prev)}>
                        <Download size={14} />
                    </button>
                    {showExportMenu && (
                        <div className="export-dropdown-menu">
                            <div className="export-filter-group">
                                {[
                                    { value: 'active', label: 'Active Orders' },
                                    { value: 'completed', label: 'Completed' },
                                    { value: 'delivered', label: 'Delivered' },
                                    { value: 'due', label: 'With Due' },
                                    { value: 'overdue', label: 'Overdue' },
                                    { value: 'all', label: 'All Orders' },
                                ].map(opt => (
                                    <label key={opt.value} className={`export-filter-option ${exportFilter === opt.value ? 'active' : ''}`}>
                                        <input
                                            type="radio"
                                            name="exportFilter"
                                            value={opt.value}
                                            checked={exportFilter === opt.value}
                                            onChange={() => setExportFilter(opt.value)}
                                        />
                                        <span>{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="export-dropdown-divider" />
                            <button className="export-dropdown-item" onClick={exportToPDF}>
                                <FileText size={14} /> Export as PDF
                            </button>
                            <button className="export-dropdown-item" onClick={exportToExcel}>
                                <FileSpreadsheet size={14} /> Export as Excel (CSV)
                            </button>
                        </div>
                    )}
                </div>
            </div>



            {/* ── Data Summary ── */}
            <div className="jobs-summary">
                <span>{loading ? 'Loading...' : <><span className="jobs-summary-count">{total}</span> jobs &middot; page {page} of {totalPages}</>}</span>
            </div>

            {/* ── Table Card ── */}
            <div className="jobs-table-card">
                <div className="table-scroll">
                    <table className="jobs-table">
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
                                            <td colSpan={tableColumnCount} style={{ textAlign: 'center', padding: '20px' }}>
                                                <ServerError onRetry={() => fetchJobs(1)} message={error} />
                                            </td>
                                        </tr>
                                    );
                                }
                                if (!loading && !error && displayJobs.length === 0) {
                                    return (
                                        <tr>
                                            <td colSpan={tableColumnCount} style={{ textAlign: 'center', padding: '20px' }}>
                                                <EmptyState
                                                    icon={FileText}
                                                    title={total > 0 ? 'No matching jobs' : 'No jobs yet'}
                                                    description={total > 0
                                                        ? 'Try adjusting your search or filter criteria.'
                                                        : 'Create your first job to get started with order management.'}
                                                    variant={total > 0 ? 'search' : 'default'}
                                                    size="sm"
                                                />
                                            </td>
                                        </tr>
                                    );
                                }
                                // Group jobs by payment_id (null = standalone)
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

                                const renderJobRow = (j, opts = {}) => {
                                    const { isSubRow = false, isSummaryRow = false, groupJobs = null } = opts;
                                    const _totalCols = 6 + (sortByPriority ? 1 : 0) + (isFinancialsVisible ? 2 : 0);
                                    return (
                                        <tr
                                            key={j.id}
                                            onDoubleClick={() => !isSummaryRow && navigate(`/dashboard/sales/orders/${j.id}`)}
                                            className={isSummaryRow ? 'job-summary-row' : ''}
                                            style={{
                                                cursor: 'pointer',
                                                ...(isSubRow ? { background: 'var(--surface-alt)' } : {}),
                                            }}
                                        >
                                            <td>
                                                <div className="job-details-cell" style={isSubRow ? { paddingLeft: 18, borderLeft: '3px solid var(--border)' } : {}}>
                                                    {isSummaryRow ? (
                                                        <>
                                                            <div className="job-number-line">
                                                                <button
                                                                    className="btn btn-ghost"
                                                                    style={{ padding: '2px 4px', minWidth: 0, height: 'auto' }}
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
                                                                    <ChevronDown size={14} style={{ transform: expandedPayments.has(j.payment_id) ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden="true" />
                                                                </button>
                                                                <span className="job-number">{groupJobs.map(g => g.job_number).join(', ')}</span>
                                                            </div>
                                                            <span className="job-product">{groupJobs.length} jobs &middot; single bill</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="job-number-line">
                                                                <span className="job-number">{j.job_number}</span>
                                                                <span className="job-product">{j.product_name || 'Service'}</span>
                                                            </div>
                                                            <span className="job-name">{j.job_name}</span>
                                                            
                                                            {j.description && (
                                                                <div className="job-tags">
                                                                    {j.description.split(' | ').filter(p => p && p.trim()).map((part, i) => {
                                                                        const isTagged = part.includes(':');
                                                                        const [label, ...rest] = isTagged ? part.split(':') : ['', part];
                                                                        const value = isTagged ? rest.join(':').trim() : part.trim();
                                                                        const tagLabel = isTagged ? label.trim().toLowerCase() : '';
                                                                        
                                                                        const isColour = tagLabel === 'colour' || tagLabel === 'color';
                                                                        const isNumbering = tagLabel === 'numbering' || tagLabel.includes('from') || tagLabel.includes('to');
                                                                        const isMatter = tagLabel === 'matter';
                                                                        
                                                                        const tagClass = isColour ? 'job-tag--colour' : isNumbering ? 'job-tag--numbering' : isMatter ? 'job-tag--matter' : 'job-tag--default';
                                                                        
                                                                        return (
                                                                            <span key={i} className={`job-tag ${tagClass}`}>
                                                                                {isNumbering && '#'}
                                                                                {tagLabel && <span style={{ textTransform: 'capitalize' }}>{tagLabel}: </span>}
                                                                                {value}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                    
                                                                    {(() => {
                                                                        try {
                                                                            const extras = typeof j.applied_extras === 'string' ? JSON.parse(j.applied_extras) : j.applied_extras;
                                                                            if (Array.isArray(extras) && extras.length > 0) {
                                                                                return (
                                                                                    <span className="job-tag job-tag--default" style={{ background: 'var(--accent-alpha)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
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
                                                <div className="job-customer">
                                                    {j.customer_id ? (
                                                        <span
                                                            className="job-customer-name job-customer-link"
                                                            role="link"
                                                            tabIndex={0}
                                                            title="Open customer dashboard"
                                                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/customers/${j.customer_id}`); }}
                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); navigate(`/dashboard/customers/${j.customer_id}`); } }}
                                                        >
                                                            {j.customer_name}
                                                        </span>
                                                    ) : (
                                                        <span className="job-customer-name">{j.customer_name}</span>
                                                    )}
                                                    <span className="job-customer-phone">{formatForDisplay(j.customer_mobile)}</span>
                                                </div>
                                            </td>
                                            <td className="job-branch">
                                                {j.branch_name || 'Main'}
                                            </td>
                                            <td>
                                                {isSummaryRow ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        {[...new Set(groupJobs.map(g => g.status))].map(s => (
                                                            <span key={s} className={`job-status ${getStatusCssClass(s)}`}>
                                                                <span className="job-status-dot" />
                                                                {s}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <>
                                                        {['Admin', 'Front Office', 'front office'].includes(userRole) ? (
                                                            <select
                                                                className={`job-status job-status-select ${getStatusCssClass(j.status)}`}
                                                                value={j.status}
                                                                onChange={(e) => handleUpdateStatus(j, e.target.value)}
                                                                aria-label={`Change order status for ${j.job_number}`}
                                                            >
                                                                {JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                                            </select>
                                                        ) : (
                                                            <span className={`job-status ${getStatusCssClass(j.status)}`}>
                                                                <span className="job-status-dot" />
                                                                {j.status}
                                                            </span>
                                                        )}
                                                        {j._updating && <Loader2 size={12} className="animate-spin" style={{ verticalAlign: 'middle', marginLeft: 4 }} aria-hidden="true" />}
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
                                                    return (
                                                        <div className="job-production">
                                                            <span className={`job-sheets ${pct === null ? 'job-sheets--bad' : Number(pct) <= 3 ? 'job-sheets--good' : Number(pct) <= 8 ? 'job-sheets--warn' : 'job-sheets--bad'}`}>
                                                                {used} / {req} sheets
                                                            </span>
                                                            {pct !== null && (
                                                                <span className="job-waste">{pct}% waste</span>
                                                            )}
                                                        </div>
                                                    );
                                                })() : (
                                                    <span className="job-waste">—</span>
                                                )}
                                            </td>
                                            {isFinancialsVisible && (
                                                <td>
                                                    <span className="job-amount job-amount--positive">
                                                        <IndianRupee size={12} aria-hidden="true" />
                                                        {isSummaryRow
                                                            ? groupJobs.reduce((s, g) => s + (Number(g.total_amount) || 0), 0).toFixed(2)
                                                            : j.total_amount}
                                                    </span>
                                                </td>
                                            )}
                                            {isFinancialsVisible && (
                                                <td>
                                                    {isSummaryRow ? (() => {
                                                        const bal = groupJobs.reduce((s, g) => s + (Number(g.balance_amount) || 0), 0);
                                                        return (
                                                            <span className={`job-amount ${bal > 0 ? 'job-amount--danger' : 'job-amount--success'}`}>
                                                                <IndianRupee size={12} aria-hidden="true" />{bal.toFixed(2)}
                                                            </span>
                                                        );
                                                    })() : (
                                                        <span className={`job-amount ${j.balance_amount > 0 ? 'job-amount--danger' : 'job-amount--success'}`}>
                                                            <IndianRupee size={12} aria-hidden="true" />
                                                            {j.balance_amount}
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                            <td>
                                                <span className={`job-delivery ${!j.delivery_date ? 'job-delivery--empty' : ''}`}>
                                                    {j.delivery_date ? new Date(j.delivery_date).toLocaleDateString() : 'Not Set'}
                                                </span>
                                            </td>
                                            <td>
                                                {isSummaryRow ? (
                                                    <span className="job-waste">expand &uarr;&darr;</span>
                                                ) : (
                                                    <div className="job-actions">
                                                        <button
                                                            className="btn-view"
                                                            title="View Details"
                                                            aria-label={`View details for job ${j.job_number}`}
                                                            onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/jobs/${j.id}`); }}
                                                        >
                                                            <Eye size={14} aria-hidden="true" />
                                                            <span>View</span>
                                                        </button>
                                                        {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                                                            <button
                                                                className="btn-job-action btn-job-action--repeat"
                                                                title="Repeat Order"
                                                                aria-label={`Repeat order ${j.job_number}`}
                                                                onClick={(e) => { e.stopPropagation(); handleRepeatOrder(j.id); }}
                                                            >
                                                                <RotateCcw size={14} aria-hidden="true" />
                                                            </button>
                                                        )}
                                                        {['Admin', 'Accountant'].includes(userRole) && (
                                                            <button
                                                                className="btn-job-action btn-job-action--danger"
                                                                title="Delete Job"
                                                                aria-label={`Delete job ${j.job_number}`}
                                                                onClick={(e) => handleDeleteJob(e, j.id)}
                                                            >
                                                                <Trash2 size={14} aria-hidden="true" />
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
                                <span className="text-muted">Job</span>
                                <strong>{deliveryDueModal.job?.job_number} - {deliveryDueModal.job?.job_name}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                                <span className="text-muted">Total Amount</span>
                                <strong>Rs. {(Number(deliveryDueModal.job?.total_amount) || 0).toFixed(2)}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                                <span className="text-muted">Paid So Far</span>
                                <strong>Rs. {(Number(deliveryDueModal.job?.advance_paid) || 0).toFixed(2)}</strong>
                            </div>
                            <div className="row" style={{ justifyContent: 'space-between' }}>
                                <span className="text-muted">Remaining Due</span>
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

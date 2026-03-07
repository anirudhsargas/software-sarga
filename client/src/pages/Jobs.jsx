import React, { useState, useEffect, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { Clock, Search, FileText, User, Loader2, Plus, X, Edit2, Trash2, Filter, IndianRupee, Calendar, CheckCircle2, Building2, RotateCcw, ArrowUpDown, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import auth from '../services/auth';
import api from '../services/api';
import Pagination from '../components/Pagination';
import toast from 'react-hot-toast';
import './Jobs.css';

// ── Priority helpers ──
const URGENCY_CONFIG = {
    critical: { label: 'Critical', color: 'var(--error)', bg: 'rgba(176,58,46,0.10)', border: 'rgba(176,58,46,0.25)', icon: '🔴' },
    high: { label: 'High', color: 'var(--warning)', bg: 'rgba(179,107,0,0.10)', border: 'rgba(179,107,0,0.25)', icon: '🟠' },
    medium: { label: 'Medium', color: 'var(--muted)', bg: 'rgba(108,112,119,0.10)', border: 'rgba(108,112,119,0.25)', icon: '🟡' },
    low: { label: 'Low', color: 'var(--success)', bg: 'rgba(47,125,74,0.10)', border: 'rgba(47,125,74,0.25)', icon: '🟢' },
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

const Jobs = () => {
    const navigate = useNavigate();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    const [branches, setBranches] = useState([]);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [activeTab, setActiveTab] = useState('active');
    const [sortByPriority, setSortByPriority] = useState(false);

    const userRole = auth.getUser()?.role;
    const isFinancialsVisible = ['Admin', 'Accountant', 'Front Office', 'front office'].includes(userRole);

    const statuses = ['Pending', 'Processing', 'Approval Pending', 'Completed', 'Delivered', 'Cancelled'];

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchJobs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`/jobs?page=${page}&search=${searchQuery}&status=${statusFilter}&branch_id=${branchFilter}`);
            setJobs(res.data.data || []);
            setTotalPages(res.data.total_pages || 1);
            setTotal(res.data.total || 0);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load jobs');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [page, searchQuery, statusFilter, branchFilter]);

    usePolling(fetchJobs, 30000);

    useEffect(() => {
        fetchJobs();
        const handlePaymentUpdate = () => {
            fetchJobs();
        };
        window.addEventListener('paymentRecorded', handlePaymentUpdate);

        return () => {
            window.removeEventListener('paymentRecorded', handlePaymentUpdate);
        };
    }, [fetchJobs]);

    useEffect(() => {
        fetchJobs();
    }, [page, statusFilter, branchFilter]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch (error) {
            console.error('Error fetching branches:', error);
        }
    };

    const handleUpdateStatus = async (jobId, newStatus) => {
        try {
            await api.put(`/jobs/${jobId}`, { status: newStatus });
            fetchJobs();
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error(error.response?.data?.message || 'Failed to update status');
        }
    };

    const handleRepeatOrder = async (jobId) => {
        try {
            const res = await api.post(`/jobs/${jobId}/repeat`);
            toast.success(res.data.message || 'Order repeated!');
            fetchJobs();
            navigate(`/dashboard/jobs/${res.data.id}`);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to repeat order');
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'Pending': 'badge--warning',
            'Processing': 'badge--info',
            'Approval Pending': 'badge--warning',
            'Completed': 'badge--success',
            'Delivered': 'badge--primary',
            'Cancelled': 'badge--error'
        };
        return colors[status] || 'badge--default';
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Jobs & Work Orders</h1>
                    <p className="section-subtitle">Track and manage all print jobs and their statuses.</p>
                </div>
                <div className="jobs-filter-row row gap-md items-center justify-between wrap">
                    <div className="search-box glass-card" style={{ maxWidth: '400px', flex: 1 }}>
                        <Search size={18} className="muted" />
                        <input
                            type="text"
                            placeholder="Search by Job No, Name, or Customer..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '8px' }}
                        />
                    </div>
                    <div className="jobs-filter-group row gap-sm">
                        <button
                            onClick={() => setSortByPriority(v => !v)}
                            title={sortByPriority ? 'Sort by date (default)' : 'Sort by priority'}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                                borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                                border: sortByPriority ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: sortByPriority ? 'var(--accent-soft)' : 'var(--surface)',
                                color: sortByPriority ? 'var(--accent)' : 'var(--text)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <Zap size={14} /> Priority
                        </button>
                        <div className="select-box glass-card row items-center gap-xs" style={{ padding: '0 12px' }}>
                            <Building2 size={16} className="muted" />
                            <select
                                value={branchFilter}
                                onChange={(e) => setBranchFilter(e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', padding: '8px', flex: 1 }}
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs for non-Front Office staff */}
            {!['Admin', 'Accountant', 'Front Office', 'front office'].includes(userRole) && (
                <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--border)', marginBottom: 0 }}>
                    <button
                        onClick={() => setActiveTab('active')}
                        style={{
                            padding: '10px 24px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            background: 'none', border: 'none',
                            borderBottom: activeTab === 'active' ? '3px solid var(--accent)' : '3px solid transparent',
                            color: activeTab === 'active' ? 'var(--accent)' : 'var(--muted)',
                            transition: 'all 0.2s'
                        }}
                    >
                        Active Jobs
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        style={{
                            padding: '10px 24px', fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                            background: 'none', border: 'none',
                            borderBottom: activeTab === 'history' ? '3px solid var(--accent)' : '3px solid transparent',
                            color: activeTab === 'history' ? 'var(--accent)' : 'var(--muted)',
                            transition: 'all 0.2s'
                        }}
                    >
                        Completed / Cancelled
                    </button>
                </div>
            )}
            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Job Details</th>
                                <th>Customer</th>
                                <th>Branch</th>
                                <th>Status</th>
                                {sortByPriority && <th>Priority</th>}
                                {isFinancialsVisible && <th>Amount</th>}
                                {isFinancialsVisible && <th>Balance</th>}
                                <th>Delivery</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                let filtered = jobs.filter(j => {
                                    const isFrontOffice = ['Admin', 'Accountant', 'Front Office', 'front office'].includes(userRole);
                                    if (isFrontOffice) return j.status !== 'Delivered';
                                    const myStatus = j.my_assignment_status;
                                    if (activeTab === 'active') return myStatus !== 'Completed' && j.status !== 'Cancelled';
                                    return myStatus === 'Completed' || j.status === 'Cancelled';
                                });
                                if (sortByPriority) {
                                    filtered = filtered.map(j => {
                                        const { score, urgency } = computeClientPriority(j);
                                        return { ...j, _score: score, _urgency: urgency };
                                    }).sort((a, b) => b._score - a._score);
                                }
                                return filtered.map((j) => (
                                    <tr key={j.id} onDoubleClick={() => navigate(`/dashboard/jobs/${j.id}`)} style={{ cursor: 'pointer' }}>
                                        <td>
                                            <div className="stack-xs">
                                                <span className="font-bold text-sm">{j.job_number}</span>
                                                <span className="text-sm">{j.job_name}</span>
                                                {Number(j.used_sheets) > 0 && (() => {
                                                    const req = Number(j.required_sheets) || 0;
                                                    const used = Number(j.used_sheets) || 0;
                                                    const waste = req > 0 ? Math.max(0, used - req) : 0;
                                                    const pct = req > 0 ? ((waste / req) * 100).toFixed(0) : null;
                                                    const color = pct === null ? 'var(--muted)' : Number(pct) <= 3 ? 'var(--success)' : Number(pct) <= 8 ? 'var(--warning)' : 'var(--error)';
                                                    return (
                                                        <span style={{ fontSize: '10px', fontWeight: 600, color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
                                                            {used} sheets{pct !== null ? ` · ${pct}% waste` : ''}
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="stack-xs">
                                                <span className="text-sm font-medium">{j.customer_name}</span>
                                                <span className="text-xs muted">+91 {j.customer_mobile}</span>
                                            </div>
                                        </td>
                                        <td className="text-sm">
                                            {j.branch_name || 'Main'}
                                        </td>
                                        <td>
                                            {['Admin', 'Front Office', 'front office'].includes(userRole) ? (
                                                <select
                                                    className={`badge ${getStatusColor(j.status)}`}
                                                    style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
                                                    value={j.status}
                                                    onChange={(e) => handleUpdateStatus(j.id, e.target.value)}
                                                >
                                                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            ) : (
                                                <span className={`badge ${getStatusColor(j.status)}`}>{j.status}</span>
                                            )}
                                        </td>
                                        {sortByPriority && (
                                            <td>
                                                <UrgencyBadge urgency={j._urgency || 'medium'} />
                                            </td>
                                        )}
                                        {isFinancialsVisible && (
                                            <td>
                                                <div className="row items-center gap-xs text-sm">
                                                    <IndianRupee size={12} />
                                                    {j.total_amount}
                                                </div>
                                            </td>
                                        )}
                                        {isFinancialsVisible && (
                                            <td>
                                                <div className={`row items-center gap-xs text-sm font-bold ${j.balance_amount > 0 ? 'text-danger' : 'text-success'}`}>
                                                    <IndianRupee size={12} />
                                                    {j.balance_amount}
                                                </div>
                                            </td>
                                        )}
                                        <td className="text-sm muted">
                                            {j.delivery_date ? new Date(j.delivery_date).toLocaleDateString() : 'Not Set'}
                                        </td>
                                        <td>
                                            <div className="row gap-sm">
                                                <button
                                                    className="btn btn-ghost btn-danger"
                                                    style={{ padding: '6px' }}
                                                    title="View Details"
                                                    onClick={() => navigate(`/dashboard/jobs/${j.id}`)}
                                                >
                                                    <FileText size={16} />
                                                </button>
                                                {['Admin', 'Front Office', 'front office'].includes(userRole) && (
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '6px', color: 'var(--accent)' }}
                                                        title="Repeat Order"
                                                        onClick={(e) => { e.stopPropagation(); handleRepeatOrder(j.id); }}
                                                    >
                                                        <RotateCcw size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </div>
    );
};

export default Jobs;

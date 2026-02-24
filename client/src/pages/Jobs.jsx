import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Search, FileText, User, Loader2, Plus, X, Edit2, Trash2, Filter, IndianRupee, Calendar, CheckCircle2, Building2 } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import Pagination from '../components/Pagination';

const Jobs = () => {
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

    const statuses = ['Pending', 'Processing', 'Completed', 'Delivered', 'Cancelled'];

    useEffect(() => {
        fetchBranches();
    }, []);

    useEffect(() => {
        fetchJobs();
    }, [page, statusFilter, branchFilter]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchJobs();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches', {
                headers: auth.getAuthHeader()
            });
            setBranches(response.data);
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const fetchJobs = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page, limit: 20 });
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            if (statusFilter) params.append('status', statusFilter);
            if (branchFilter) params.append('branch_id', branchFilter);
            const response = await api.get(`/jobs?${params}`, {
                headers: auth.getAuthHeader()
            });
            const res = response.data;
            setJobs(res.data);
            setTotal(res.total);
            setTotalPages(res.totalPages);
        } catch (err) {
            setError('Failed to fetch jobs');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (id, newStatus) => {
        if (!window.confirm(`Change job status to "${newStatus}"?${newStatus === 'Cancelled' ? '\n\nThis cannot be undone!' : ''}`)) return;
        try {
            await api.put(`/jobs/${id}`, { status: newStatus }, {
                headers: auth.getAuthHeader()
            });
            fetchJobs();
        } catch (err) {
            setError('Failed to update status');
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Pending': return 'badge--warning';
            case 'Processing': return 'badge--type-retail';
            case 'Completed': return 'badge--success';
            case 'Delivered': return 'badge--type-offset';
            case 'Cancelled': return 'badge--type-walk-in';
            default: return '';
        }
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Jobs & Work Orders</h1>
                    <p className="section-subtitle">Track and manage all print jobs and their statuses.</p>
                </div>
            </div>

            <div className="row gap-md wrap items-center mb-16">
                <div className="input-group" style={{ maxWidth: '400px' }}>
                    <div className="input-icon">
                        <Search size={18} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by Job #, Name or Customer..."
                        className="input-field input-field--icon"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="row gap-sm items-center">
                    <Filter size={18} className="muted" />
                    <select
                        className="input-field"
                        style={{ padding: '8px 12px', minWidth: '150px' }}
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="row gap-sm items-center">
                    <Building2 size={18} className="muted" />
                    <select
                        className="input-field"
                        style={{ padding: '8px 12px', minWidth: '150px' }}
                        value={branchFilter}
                        onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Job Details</th>
                                <th>Customer</th>
                                <th>Branch</th>
                                <th>Status</th>
                                <th>Amount</th>
                                <th>Balance</th>
                                <th>Delivery</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" className="text-center muted table-empty">
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : jobs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center muted table-empty">
                                        No jobs found.
                                    </td>
                                </tr>
                            ) : (
                                jobs.map((j) => (
                                    <tr key={j.id}>
                                        <td>
                                            <div className="stack-xs">
                                                <span className="font-bold text-sm">{j.job_number}</span>
                                                <span className="text-sm">{j.job_name}</span>
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
                                            <select
                                                className={`badge ${getStatusColor(j.status)}`}
                                                style={{ border: 'none', cursor: 'pointer', outline: 'none' }}
                                                value={j.status}
                                                onChange={(e) => handleUpdateStatus(j.id, e.target.value)}
                                            >
                                                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <div className="row items-center gap-xs text-sm">
                                                <IndianRupee size={12} />
                                                {j.total_amount}
                                            </div>
                                        </td>
                                        <td>
                                            <div className={`row items-center gap-xs text-sm font-bold ${j.balance_amount > 0 ? 'text-danger' : 'text-success'}`}>
                                                <IndianRupee size={12} />
                                                {j.balance_amount}
                                            </div>
                                        </td>
                                        <td className="text-sm muted">
                                            {j.delivery_date ? new Date(j.delivery_date).toLocaleDateString() : 'Not Set'}
                                        </td>
                                        <td>
                                            <div className="row gap-sm">
                                                <button className="btn btn-ghost btn-danger" style={{ padding: '6px' }} title="View Details">
                                                    <FileText size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
        </div>
    );
};

export default Jobs;

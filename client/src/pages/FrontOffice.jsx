import React, { useEffect, useState, useRef, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import {
    ShoppingBag, Clock, CheckCircle2, IndianRupee, TrendingUp, Truck,
    Search, Plus, UserPlus, Phone, ArrowRight, Calendar, AlertTriangle,
    Receipt, Printer, MessageSquare, RefreshCw, ChevronRight, Loader2,
    Wallet, Users, Package, Eye, CreditCard, X
} from 'lucide-react';
import api from '../services/api';

import { serverNow } from '../services/serverTime';
import './FrontOffice.css';

const FrontOffice = () => {
    const navigate = useNavigate();
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

    const { stats, active_jobs, overdue_jobs, due_customers, recent_payments, status_counts } = data || {};

    return (
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
                        <button className="fo-search-clear" onClick={() => { setSearch(''); setSearchResults([]); setShowSearchResults(false); }}>
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
                    <Package size={16} /> Active Jobs{active_jobs?.length > 0 && <span className="fo-tab-count">{active_jobs.length}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'dues' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('dues')}>
                    <IndianRupee size={16} /> Due Collection{due_customers?.length > 0 && <span className="fo-tab-count">{due_customers.length}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'overdue' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('overdue')}>
                    <AlertTriangle size={16} /> Overdue{overdue_jobs?.length > 0 && <span className="fo-tab-count fo-tab-count--red">{overdue_jobs.length}</span>}
                </button>
                <button className={`fo-tab ${activeTab === 'payments' ? 'fo-tab--active' : ''}`} onClick={() => setActiveTab('payments')}>
                    <Receipt size={16} /> Recent Payments
                </button>
            </div>

            {/* ──── Tab Content ──── */}
            <div className="fo-tab-content">
                {/* Active Jobs Queue */}
                {activeTab === 'queue' && (
                    <div className="fo-panel">
                        {(!active_jobs || active_jobs.length === 0) ? (
                            <div className="fo-empty"><Package size={40} /><p>No active jobs right now</p></div>
                        ) : (
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
                                        {active_jobs.map(job => {
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
                        )}
                    </div>
                )}

                {/* Due Collection */}
                {activeTab === 'dues' && (
                    <div className="fo-panel">
                        {(!due_customers || due_customers.length === 0) ? (
                            <div className="fo-empty"><CheckCircle2 size={40} /><p>No pending dues — all clear!</p></div>
                        ) : (
                            <div className="fo-due-list">
                                {due_customers.map(c => (
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
                                                    title="Call"
                                                >
                                                    <Phone size={14} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Overdue Jobs */}
                {activeTab === 'overdue' && (
                    <div className="fo-panel">
                        {(!overdue_jobs || overdue_jobs.length === 0) ? (
                            <div className="fo-empty"><CheckCircle2 size={40} /><p>No overdue jobs! 🎉</p></div>
                        ) : (
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
                                        {overdue_jobs.map(job => {
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
                                                            <a href={`tel:${job.customer_mobile}`} className="btn btn-ghost btn-icon btn-sm" title="Call">
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
                        )}
                    </div>
                )}

                {/* Recent Payments */}
                {activeTab === 'payments' && (
                    <div className="fo-panel">
                        {(!recent_payments || recent_payments.length === 0) ? (
                            <div className="fo-empty"><Receipt size={40} /><p>No recent payments</p></div>
                        ) : (
                            <div className="fo-payments-list">
                                {recent_payments.map(p => (
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
    );
};

export default FrontOffice;

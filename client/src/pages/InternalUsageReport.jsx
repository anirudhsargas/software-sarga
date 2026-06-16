import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Building2, Hash, FileText, Calendar, Filter } from 'lucide-react';
import api from '../services/api';

const DEPARTMENTS = [
    { value: 'all', label: 'All Departments' },
    { value: 'offset', label: 'Sarga Offset' },
    { value: 'digital', label: 'Sarga Digital' },
    { value: 'admin', label: 'Sarga Admin' },
];

const DEPT_LABEL = { offset: 'Sarga Offset', digital: 'Sarga Digital', admin: 'Sarga Admin' };
const DEPT_COLOR = { offset: 'var(--color-info)', digital: 'var(--color-info)', admin: 'var(--color-success)' };

const formatNum = (n) => (typeof n === 'number' ? n.toLocaleString() : '—');
const fmtDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const todayStr = () => new Date().toISOString().split('T')[0];
const firstOfMonth = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
};

const InternalUsageReport = () => {
    useSEO('Internal Usage Report');

    const [bills, setBills] = useState([]);
    const [summary, setSummary] = useState({});
    const [trend, setTrend] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [filters, setFilters] = useState({
        from: firstOfMonth(),
        to: todayStr(),
        department: 'all',
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ from: filters.from, to: filters.to });
            if (filters.department !== 'all') params.set('department', filters.department);
            const res = await api.get(`/daily-report/internal-usage?${params}`);
            setBills(res.data.bills || []);
            setSummary(res.data.summary || {});
            setTrend(res.data.trend || []);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to fetch data');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalPrints = bills.reduce((s, b) => s + (b.prints || 0), 0);
    const totalJobs = bills.length;

    // Build trend months list for the bar chart (last 6 months order)
    const trendMonths = [...new Set(trend.map(t => t.month))].sort();
    const trendByMonth = trendMonths.map(month => {
        const depts = {};
        trend.filter(t => t.month === month).forEach(t => {
            depts[t.department] = { prints: Number(t.prints) || 0, jobs: Number(t.jobs) || 0 };
        });
        return { month, depts };
    });
    const maxPrintsInTrend = Math.max(1, ...trendByMonth.map(m => Object.values(m.depts).reduce((s, d) => s + d.prints, 0)));

    return (
        <div className="page-container" style={{ maxWidth: 1100 }}>
            {/* Header */}
            <div className="page-header" style={{ marginBottom: 24 }}>
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        🏠 Internal Usage Report
                    </h1>
                    <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                        Track internal department print usage — Offset, Digital &amp; Admin
                    </p>
                </div>
                <button
                    className="btn btn--outline btn--sm"
                    onClick={fetchData}
                    disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh
                </button>
            </div>

            {/* Filter Bar */}
            <div className="panel" style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Filter size={14} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>Filters</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>FROM</label>
                    <input
                        type="date"
                        className="input input--sm"
                        value={filters.from}
                        max={filters.to}
                        onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                        style={{ fontSize: 13 }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>TO</label>
                    <input
                        type="date"
                        className="input input--sm"
                        value={filters.to}
                        min={filters.from}
                        onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                        style={{ fontSize: 13 }}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>DEPARTMENT</label>
                    <select
                        className="input input--sm"
                        value={filters.department}
                        onChange={e => setFilters(f => ({ ...f, department: e.target.value }))}
                        style={{ fontSize: 13 }}
                    >
                        {DEPARTMENTS.map(d => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {error && (
                <div className="panel" style={{ color: 'var(--error)', textAlign: 'center', marginBottom: 16 }}>
                    {error}
                </div>
            )}

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
                {/* Total card */}
                <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                        <Hash size={13} /> TOTAL PRINTS
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{formatNum(totalPrints)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatNum(totalJobs)} jobs</div>
                </div>

                {/* Per-department cards */}
                {Object.entries(summary).map(([dept, data]) => (
                    <div key={dept} className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderLeft: `3px solid ${DEPT_COLOR[dept] || 'var(--color-info)'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: DEPT_COLOR[dept] || 'var(--color-info)' }}>
                            <Building2 size={13} />
                            {DEPT_LABEL[dept] || dept.toUpperCase()}
                        </div>
                        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)' }}>{formatNum(data.prints)}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{data.jobs} job{data.jobs !== 1 ? 's' : ''}</div>
                    </div>
                ))}
            </div>

            {/* Monthly Trend */}
            {trendByMonth.length > 0 && (
                <div className="panel" style={{ marginBottom: 24 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={14} style={{ color: 'var(--muted)' }} /> Monthly Trend (Last 6 Months)
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', overflowX: 'auto', paddingBottom: 4 }}>
                        {trendByMonth.map(({ month, depts }) => {
                            const total = Object.values(depts).reduce((s, d) => s + d.prints, 0);
                            const [year, mon] = month.split('-');
                            const label = new Date(Number(year), Number(mon) - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
                            return (
                                <div key={month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 60 }}>
                                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{formatNum(total)}</div>
                                    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
                                        {Object.entries(depts).map(([dept, data]) => {
                                            const h = Math.max(2, Math.round((data.prints / maxPrintsInTrend) * 80));
                                            return (
                                                <div
                                                    key={dept}
                                                    title={`${DEPT_LABEL[dept] || dept}: ${data.prints} prints`}
                                                    style={{
                                                        width: 14,
                                                        height: h,
                                                        background: DEPT_COLOR[dept] || 'var(--color-info)',
                                                        borderRadius: 3,
                                                        opacity: 0.85,
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
                                </div>
                            );
                        })}
                    </div>
                    {/* Legend */}
                    <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                        {Object.entries(DEPT_COLOR).map(([dept, color]) => (
                            <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
                                <span style={{ color: 'var(--muted)' }}>{DEPT_LABEL[dept] || dept}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} style={{ color: 'var(--muted)' }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Usage Records</span>
                    {!loading && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>({bills.length} entries)</span>}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 8, color: 'var(--muted)' }}>
                        <Loader2 size={18} className="animate-spin" /> Loading...
                    </div>
                ) : bills.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 14 }}>
                        No internal usage records found for the selected period.
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Department</th>
                                    <th>Customer / Description</th>
                                    <th style={{ textAlign: 'right' }}>Sheets</th>
                                    <th style={{ textAlign: 'right' }}>Prints</th>
                                    <th>Added By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bills.map(bill => (
                                    <tr key={bill.id}>
                                        <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{fmtDate(bill.date)}</td>
                                        <td>
                                            <span
                                                className="badge"
                                                style={{
                                                    fontSize: 11,
                                                    background: `rgba(${DEPT_COLOR[bill.department] ? hexToRgb(DEPT_COLOR[bill.department]) : '99,102,241'}, 0.12)`,
                                                    color: DEPT_COLOR[bill.department] || 'var(--color-info)',
                                                }}
                                            >
                                                {DEPT_LABEL[bill.department] || bill.department || '—'}
                                            </span>
                                        </td>
                                        <td style={{ maxWidth: 280, fontSize: 13 }}>
                                            <div style={{ fontWeight: 500 }}>{bill.customer_name}</div>
                                            {bill.description && (
                                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                                                    {bill.description}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13 }}>
                                            {bill.sheets > 0 ? formatNum(bill.sheets) : '—'}
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 600 }}>
                                            {bill.prints > 0 ? formatNum(bill.prints) : '—'}
                                        </td>
                                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{bill.added_by}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: 'var(--surface-2, var(--bg))', fontWeight: 700 }}>
                                    <td colSpan={3} style={{ textAlign: 'right', fontSize: 13, paddingRight: 12 }}>Total</td>
                                    <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif" }}>
                                        {formatNum(bills.reduce((s, b) => s + (b.sheets || 0), 0))}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: "'Space Grotesk', sans-serif" }}>
                                        {formatNum(totalPrints)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper: convert hex (#6366f1) to "r,g,b" string for rgba()
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return '99,102,241';
    return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`;
}

export default InternalUsageReport;

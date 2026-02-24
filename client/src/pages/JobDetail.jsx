import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Briefcase, IndianRupee, User, Clock, AlertCircle,
    Loader2, CheckCircle2, Calendar, Building2, Package, Phone,
    Mail, MapPin, Hash, FileText, Users, CreditCard, Activity
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';

const statusColors = {
    Pending: '#f59e0b',
    Processing: '#3b82f6',
    Completed: '#10b981',
    Delivered: '#8b5cf6',
    Cancelled: '#ef4444',
};

const paymentColors = {
    Paid: '#10b981',
    Partial: '#f59e0b',
    Unpaid: '#ef4444',
};

const Badge = ({ label, color }) => (
    <span style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        background: color + '22',
        color: color,
        border: `1px solid ${color}44`,
    }}>{label}</span>
);

const InfoRow = ({ icon: Icon, label, value }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border, #e5e7eb)' }}>
        <Icon size={16} style={{ marginTop: 2, color: 'var(--muted, #6b7280)', flexShrink: 0 }} />
        <span style={{ color: 'var(--muted, #6b7280)', fontSize: '13px', minWidth: 130 }}>{label}</span>
        <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>{value || '—'}</span>
    </div>
);

const Section = ({ title, icon: Icon, children }) => (
    <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: '20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Icon size={18} style={{ color: 'var(--accent, #6366f1)' }} />
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>{title}</h3>
        </div>
        {children}
    </div>
);

const JobDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchJob = async () => {
            try {
                setLoading(true);
                const res = await api.get(`/jobs/${id}`, { headers: auth.getAuthHeader() });
                setData(res.data);
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to load job details');
            } finally {
                setLoading(false);
            }
        };
        fetchJob();
    }, [id]);

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
                <Loader2 size={28} className="animate-spin" />
                <span>Loading job details...</span>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ padding: 24 }}>
                <button onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #6366f1)', marginBottom: 16 }}>
                    <ArrowLeft size={18} /> Back
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', padding: 16, background: '#fee2e2', borderRadius: 8 }}>
                    <AlertCircle size={20} />
                    <span>{error || 'Job not found'}</span>
                </div>
            </div>
        );
    }

    const { job, assignments, payments, statusHistory } = data;
    const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const balance = Number(job.balance_amount || 0);
    const statusColor = statusColors[job.status] || '#6b7280';
    const payColor = paymentColors[job.payment_status] || '#6b7280';

    return (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 0 40px' }}>
            {/* Back button */}
            <button
                onClick={() => navigate(-1)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent, #6366f1)', marginBottom: 20, padding: '8px 0', fontSize: 14 }}
            >
                <ArrowLeft size={18} /> Back
            </button>

            {/* Header Card */}
            <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: '24px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                            <Briefcase size={20} style={{ color: 'var(--accent, #6366f1)' }} />
                            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>{job.job_name}</h1>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', color: 'var(--muted, #6b7280)', fontFamily: 'monospace', background: 'var(--bg, #f3f4f6)', padding: '2px 8px', borderRadius: 4 }}>
                                #{job.job_number}
                            </span>
                            <Badge label={job.status} color={statusColor} />
                            <Badge label={job.payment_status} color={payColor} />
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent, #6366f1)' }}>{fmt(job.total_amount)}</div>
                        {balance > 0 ? (
                            <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>Balance: {fmt(balance)}</div>
                        ) : (
                            <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={14} /> Fully Paid
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Job Details */}
                <Section title="Job Details" icon={FileText}>
                    <InfoRow icon={Hash} label="Job Number" value={job.job_number} />
                    <InfoRow icon={Package} label="Product" value={job.product_name} />
                    <InfoRow icon={Building2} label="Branch" value={job.branch_name || 'Main'} />
                    <InfoRow icon={Clock} label="Quantity" value={job.quantity} />
                    <InfoRow icon={IndianRupee} label="Unit Price" value={fmt(job.unit_price)} />
                    <InfoRow icon={Calendar} label="Delivery Date" value={fmtDate(job.delivery_date)} />
                    <InfoRow icon={Calendar} label="Created" value={fmtDateTime(job.created_at)} />
                    {job.description && (
                        <div style={{ marginTop: 10, padding: '10px', background: 'var(--bg, #f9fafb)', borderRadius: 6 }}>
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted, #6b7280)' }}>Description</p>
                            <p style={{ margin: '4px 0 0', fontSize: '13px' }}>{job.description}</p>
                        </div>
                    )}
                </Section>

                {/* Customer Info */}
                <Section title="Customer" icon={User}>
                    <InfoRow icon={User} label="Name" value={job.customer_name} />
                    {job.customer_mobile && (
                        <InfoRow
                            icon={Phone}
                            label="Mobile"
                            value={
                                <a href={`tel:${job.customer_mobile}`} style={{ color: 'var(--accent, #6366f1)', textDecoration: 'none' }}>
                                    {job.customer_mobile}
                                </a>
                            }
                        />
                    )}
                    {job.customer_email && <InfoRow icon={Mail} label="Email" value={job.customer_email} />}
                    {job.customer_address && <InfoRow icon={MapPin} label="Address" value={job.customer_address} />}

                    {/* Payment Summary */}
                    <div style={{ marginTop: 16, padding: '12px', background: 'var(--bg, #f9fafb)', borderRadius: 8 }}>
                        <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600 }}>Payment Summary</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: 4 }}>
                            <span style={{ color: 'var(--muted, #6b7280)' }}>Total Amount</span>
                            <span style={{ fontWeight: 600 }}>{fmt(job.total_amount)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: 4 }}>
                            <span style={{ color: 'var(--muted, #6b7280)' }}>Advance Paid</span>
                            <span style={{ fontWeight: 600, color: '#10b981' }}>{fmt(job.advance_paid)}</span>
                        </div>
                        <div style={{ height: 1, background: 'var(--border, #e5e7eb)', margin: '8px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                            <span style={{ fontWeight: 600 }}>Balance</span>
                            <span style={{ fontWeight: 700, color: balance > 0 ? '#ef4444' : '#10b981' }}>{fmt(balance)}</span>
                        </div>
                    </div>
                </Section>
            </div>

            {/* Staff Assignments */}
            {assignments && assignments.length > 0 && (
                <Section title="Staff Assignments" icon={Users}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        {assignments.map((a, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'var(--bg, #f3f4f6)', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 600 }}>
                                    {a.staff_name?.[0] || '?'}
                                </div>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{a.staff_name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted, #6b7280)' }}>{a.staff_role}</div>
                                </div>
                                <Badge label={a.status || 'Assigned'} color={a.status === 'Completed' ? '#10b981' : '#3b82f6'} />
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Payment History */}
            {payments && payments.length > 0 && (
                <Section title="Payment History" icon={CreditCard}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--border, #e5e7eb)' }}>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Date</th>
                                    <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Amount</th>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Method</th>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Reference</th>
                                    <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted, #6b7280)', fontWeight: 600 }}>Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map((p, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border, #e5e7eb)' }}>
                                        <td style={{ padding: '8px 12px' }}>{fmtDate(p.payment_date)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{fmt(p.amount)}</td>
                                        <td style={{ padding: '8px 12px' }}>{p.payment_method || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--muted, #6b7280)' }}>{p.reference_number || '—'}</td>
                                        <td style={{ padding: '8px 12px', color: 'var(--muted, #6b7280)' }}>{p.notes || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}

            {/* Status History */}
            {statusHistory && statusHistory.length > 0 && (
                <Section title="Status History" icon={Activity}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {statusHistory.map((h, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < statusHistory.length - 1 ? '1px solid var(--border, #e5e7eb)' : 'none' }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColors[h.status] || '#6b7280', marginTop: 4, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Badge label={h.status} color={statusColors[h.status] || '#6b7280'} />
                                        {h.staff_name && <span style={{ fontSize: '12px', color: 'var(--muted, #6b7280)' }}>by {h.staff_name}</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--muted, #6b7280)', marginTop: 4 }}>{fmtDateTime(h.changed_at)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Applied Extras */}
            {job.applied_extras && (() => {
                try {
                    const extras = typeof job.applied_extras === 'string' ? JSON.parse(job.applied_extras) : job.applied_extras;
                    if (Array.isArray(extras) && extras.length > 0) {
                        return (
                            <Section title="Applied Extras" icon={Package}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {extras.map((e, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border, #e5e7eb)', fontSize: '13px' }}>
                                            <span>{e.name || e.label || `Extra ${i + 1}`}</span>
                                            <span style={{ fontWeight: 600 }}>{fmt(e.price || e.amount || 0)}</span>
                                        </div>
                                    ))}
                                </div>
                            </Section>
                        );
                    }
                } catch (e) { /* invalid JSON */ }
                return null;
            })()}
        </div>
    );
};

export default JobDetail;

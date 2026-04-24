import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Edit2, Trash2, Play, Pause, Loader2, Calendar, Clock, AlertCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function RecurringInvoices() {
    const [items, setItems] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({
        customer_id: '', customer_name: '', customer_mobile: '', customer_email: '',
        description: '', total: 0, subtotal: 0, frequency: 'monthly',
        next_date: new Date().toISOString().split('T')[0], end_date: '', payment_method: 'Cash',
        is_active: true
    });

    const fetch = useCallback(async () => {
        try {
            const [{ data }, { data: custs }] = await Promise.all([
                api.get('/recurring-invoices'),
                api.get('/customers?limit=1000')
            ]);
            setItems(data);
            setCustomers(Array.isArray(custs) ? custs : (custs.data || []));
        } catch (err) {
            console.error('Fetch error:', err);
            toast.error('Failed to load data');
        }
        setLoading(false);
    }, []);
    useEffect(() => { fetch(); }, [fetch]);

    const handleSave = async () => {
        if (!form.customer_id || !form.total) return toast.error('Customer and amount required');
        try {
            const payload = { ...form, subtotal: form.total }; // Simple mapping for now
            if (editingId) { await api.put(`/recurring-invoices/${editingId}`, payload); }
            else { await api.post('/recurring-invoices', payload); }
            toast.success('Saved');
            setShowForm(false); setEditingId(null); fetch();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    };

    const handleEdit = (r) => {
        setForm({
            customer_id: r.customer_id, customer_name: r.customer_name || '',
            customer_mobile: r.customer_mobile || '', customer_email: r.customer_email || '',
            description: r.description || '', total: r.total || 0, subtotal: r.subtotal || 0,
            frequency: r.frequency, next_date: r.next_date?.split('T')[0] || '',
            end_date: r.end_date?.split('T')[0] || '', payment_method: r.payment_method || 'Cash',
            is_active: !!r.is_active
        });
        setEditingId(r.id); setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this recurring invoice?')) return;
        try { await api.delete(`/recurring-invoices/${id}`); toast.success('Deleted'); fetch(); }
        catch { toast.error('Failed'); }
    };

    const toggleActive = async (r) => {
        try {
            await api.put(`/recurring-invoices/${r.id}`, { ...r, is_active: r.is_active ? 0 : 1 });
            toast.success(r.is_active ? 'Paused' : 'Activated'); fetch();
        } catch { toast.error('Failed'); }
    };

    const processNow = async () => {
        setProcessing(true);
        try {
            const { data } = await api.post('/recurring-invoices/process');
            toast.success(`Processed: ${data.processed} invoices created`); fetch();
        } catch { toast.error('Processing failed'); }
        finally { setProcessing(false); }
    };

    const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 12 };
    const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface))', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' };
    const btnStyle = (bg = '#6366f1') => ({ background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 });

    const freqLabel = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
    const getCustomerName = (id) => (Array.isArray(customers) ? customers : []).find(c => String(c.id) === String(id))?.name || `#${id}`;

    if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Loader2 size={28} className="animate-spin" /></div>;

    return (
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><RefreshCw size={22} /> Recurring Invoices</h2>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={processNow} disabled={processing} style={btnStyle('#22c55e')}>
                        {processing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Process Due
                    </button>
                    <button onClick={() => { 
                        setForm({ 
                            customer_id: '', customer_name: '', customer_mobile: '', customer_email: '',
                            description: '', total: 0, subtotal: 0, frequency: 'monthly', 
                            next_date: new Date().toISOString().split('T')[0], end_date: '', payment_method: 'Cash',
                            is_active: true 
                        }); 
                        setEditingId(null); 
                        setShowForm(true); 
                    }} style={btnStyle()}>
                        <Plus size={16} /> New Recurring
                    </button>
                </div>
            </div>

            {items.length === 0 && !showForm && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <RefreshCw size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
                    <p>No recurring invoices yet. Create one to automate billing.</p>
                </div>
            )}

            {items.map(r => (
                <div key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: r.is_active ? 1 : 0.5 }}>
                    <div>
                        <strong>{r.customer_name || getCustomerName(r.customer_id)}</strong>
                        <span style={{ margin: '0 10px', fontSize: 20, fontWeight: 700 }}>₹{Number(r.total || 0).toLocaleString()}</span>
                        <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600 }}>{freqLabel[r.frequency]}</span>
                        {!r.is_active && <span style={{ marginLeft: 8, background: '#fef2f2', color: '#ef4444', padding: '2px 8px', borderRadius: 8, fontSize: 11 }}>Paused</span>}
                        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4, display: 'flex', gap: 16 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> Next: {r.next_run_date?.split('T')[0] || 'N/A'}</span>
                            {r.end_date && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Ends: {r.end_date?.split('T')[0]}</span>}
                            {r.description && <span>{r.description}</span>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => toggleActive(r)} style={btnStyle(r.is_active ? '#f59e0b' : '#22c55e')} title={r.is_active ? 'Pause' : 'Activate'}>
                            {r.is_active ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button onClick={() => handleEdit(r)} style={btnStyle('#374151')}><Edit2 size={14} /></button>
                        <button onClick={() => handleDelete(r.id)} style={btnStyle('#ef4444')}><Trash2 size={14} /></button>
                    </div>
                </div>
            ))}

            {showForm && (
                <div style={cardStyle}>
                    <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit' : 'New'} Recurring Invoice</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Customer *</label>
                            <select 
                                value={form.customer_id} 
                                onChange={e => {
                                    const id = e.target.value;
                                    const c = customers.find(cust => String(cust.id) === String(id));
                                    setForm(f => ({ 
                                        ...f, 
                                        customer_id: id,
                                        customer_name: c?.name || '',
                                        customer_mobile: c?.mobile || '',
                                        customer_email: c?.email || ''
                                    }));
                                }} 
                                style={inputStyle}
                            >
                                <option value="">Select customer</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Amount (₹) *</label>
                            <input type="number" value={form.total} onChange={e => setForm(f => ({ ...f, total: Number(e.target.value) }))} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Frequency</label>
                            <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))} style={inputStyle}>
                                {Object.entries(freqLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Next Run Date</label>
                            <input type="date" value={form.next_date} onChange={e => setForm(f => ({ ...f, next_date: e.target.value }))} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>End Date (optional)</label>
                            <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Payment Method</label>
                            <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} style={inputStyle}>
                                <option>Cash</option><option>UPI</option><option>Bank Transfer</option><option>Cheque</option><option>Credit</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 13, fontWeight: 600 }}>Description</label>
                        <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Monthly design services" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowForm(false)} style={btnStyle('#374151')}>Cancel</button>
                        <button onClick={handleSave} style={btnStyle()}>Save</button>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Edit2, Trash2, Send, ArrowRight, Search, X, ChevronDown, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const statusColors = {
    draft: '#6b7280', sent: '#3b82f6', accepted: '#22c55e', rejected: '#ef4444',
    expired: '#f59e0b', converted: '#8b5cf6'
};

export default function Quotes() {
    const [quotes, setQuotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [customers, setCustomers] = useState([]);
    const [form, setForm] = useState(emptyForm());

    function emptyForm() {
        return {
            customer_id: '', customer_name: '', customer_mobile: '', customer_email: '',
            customer_address: '', customer_gst: '', date: new Date().toISOString().slice(0, 10),
            valid_until: '', notes: '', discount_percent: 0, tax_rate: 18, items: [{ item_name: '', description: '', quantity: 1, unit_price: 0 }]
        };
    }

    const fetchQuotes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);
            const { data } = await api.get(`/quotes?${params}`);
            setQuotes(data.data || data);
        } catch { toast.error('Failed to load quotes'); }
        finally { setLoading(false); }
    }, [search, statusFilter]);

    useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

    useEffect(() => {
        api.get('/customers?limit=500').then(r => setCustomers(r.data?.data || r.data || [])).catch(() => {});
    }, []);

    const selectCustomer = (c) => {
        setForm(f => ({ ...f, customer_id: c.id, customer_name: c.name, customer_mobile: c.mobile, customer_email: c.email || '', customer_address: c.address || '', customer_gst: c.gst || '' }));
    };

    const addItem = () => setForm(f => ({ ...f, items: [...f.items, { item_name: '', description: '', quantity: 1, unit_price: 0 }] }));
    const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
    const updateItem = (i, field, val) => setForm(f => {
        const items = [...f.items];
        items[i] = { ...items[i], [field]: val };
        return { ...f, items };
    });

    const subtotal = form.items.reduce((s, it) => s + (it.quantity || 0) * (it.unit_price || 0), 0);
    const discountAmt = subtotal * ((form.discount_percent || 0) / 100);
    const afterDiscount = subtotal - discountAmt;
    const taxAmt = afterDiscount * ((form.tax_rate || 0) / 100);
    const total = afterDiscount + taxAmt;

    const handleSave = async () => {
        if (!form.customer_name) return toast.error('Customer name is required');
        if (!form.items.length || !form.items[0].item_name) return toast.error('At least one item is required');
        try {
            if (editing) {
                await api.put(`/quotes/${editing}`, form);
                toast.success('Quote updated');
            } else {
                await api.post('/quotes', form);
                toast.success('Quote created');
            }
            setShowForm(false); setEditing(null); setForm(emptyForm()); fetchQuotes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to save quote'); }
    };

    const handleEdit = async (id) => {
        try {
            const { data } = await api.get(`/quotes/${id}`);
            setForm({ ...data, items: data.items || [] });
            setEditing(id); setShowForm(true);
        } catch { toast.error('Failed to load quote'); }
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this quote?')) return;
        try { await api.delete(`/quotes/${id}`); toast.success('Deleted'); fetchQuotes(); }
        catch { toast.error('Failed to delete'); }
    };

    const handleConvert = async (id) => {
        if (!confirm('Convert this quote to an invoice? This action cannot be undone.')) return;
        try {
            const { data } = await api.post(`/quotes/${id}/convert`);
            toast.success(`Converted! Invoice #${data.invoice_id} created`);
            fetchQuotes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to convert'); }
    };

    const handleSendQuote = async (quote) => {
        const email = quote.customer_email || prompt('Enter customer email:');
        if (!email) return;
        try {
            await api.post(`/quotes/${quote.id}/send-email`, {
                email,
                subject: `Quotation ${quote.quote_number}`,
            });
            toast.success('Quote sent!'); fetchQuotes();
        } catch (err) { toast.error(err.response?.data?.message || 'Failed to send'); }
    };

    const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 };
    const btnStyle = (bg = '#6366f1') => ({ background: bg, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 });
    const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface))', color: 'var(--text)', fontSize: 14 };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}><FileText size={22} /> Quotes & Estimates</h2>
                <button style={btnStyle()} onClick={() => { setForm(emptyForm()); setEditing(null); setShowForm(true); }}><Plus size={16} /> New Quote</button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search size={16} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
                    <input placeholder="Search quotes..." value={search} onChange={e => setSearch(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: 32 }} />
                </div>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 140 }}>
                    <option value="">All Statuses</option>
                    {['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
            </div>

            {/* Quote List */}
            {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={24} className="animate-spin" /></div> : (
                <div>
                    {(Array.isArray(quotes) ? quotes : []).length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No quotes found. Create your first quote!</div>
                    ) : (Array.isArray(quotes) ? quotes : []).map(q => (
                        <div key={q.id} style={cardStyle}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                        <strong style={{ fontSize: 16 }}>{q.quote_number}</strong>
                                        <span style={{ background: statusColors[q.status] || '#666', color: '#fff', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>
                                            {q.status}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>{q.customer_name} {q.customer_mobile ? `• ${q.customer_mobile}` : ''}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Date: {q.date?.slice(0, 10)} {q.valid_until ? `• Valid until: ${q.valid_until?.slice(0, 10)}` : ''}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700 }}>₹{Number(q.total || 0).toLocaleString('en-IN')}</div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        {q.status !== 'converted' && (
                                            <>
                                                <button onClick={() => handleEdit(q.id)} style={btnStyle('#374151')} title="Edit"><Edit2 size={14} /></button>
                                                <button onClick={() => handleSendQuote(q)} style={btnStyle('#3b82f6')} title="Send"><Send size={14} /></button>
                                                <button onClick={() => handleConvert(q.id)} style={btnStyle('#22c55e')} title="Convert to Invoice"><ArrowRight size={14} /> Invoice</button>
                                            </>
                                        )}
                                        <button onClick={() => handleDelete(q.id)} style={btnStyle('#ef4444')} title="Delete"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showForm && (
                <div className="modal-backdrop" style={{ zIndex: 1003 }} onClick={() => setShowForm(false)}>
                    <div className="modal" style={{ maxWidth: 800, width: '95%', maxHeight: '90vh', overflowY: 'auto', padding: 24 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>{editing ? 'Edit Quote' : 'New Quote'}</h3>
                            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>

                        {/* Customer Selection */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: 'block' }}>Customer</label>
                            <select value={form.customer_id} onChange={e => { const c = customers.find(c => c.id === Number(e.target.value)); if (c) selectCustomer(c); }}
                                style={inputStyle}>
                                <option value="">Select or type below</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Name *</label><input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} style={inputStyle} /></div>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Mobile</label><input value={form.customer_mobile} onChange={e => setForm(f => ({ ...f, customer_mobile: e.target.value }))} style={inputStyle} /></div>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Email</label><input value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} style={inputStyle} /></div>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>GST</label><input value={form.customer_gst} onChange={e => setForm(f => ({ ...f, customer_gst: e.target.value }))} style={inputStyle} /></div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} /></div>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Valid Until</label><input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} style={inputStyle} /></div>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Discount %</label><input type="number" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))} style={inputStyle} /></div>
                            <div><label style={{ fontSize: 13, fontWeight: 600 }}>Tax %</label><input type="number" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))} style={inputStyle} /></div>
                        </div>

                        {/* Items */}
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <label style={{ fontSize: 14, fontWeight: 600 }}>Items</label>
                                <button onClick={addItem} style={btnStyle('#374151')}><Plus size={14} /> Add Item</button>
                            </div>
                            {form.items.map((item, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, marginBottom: 8 }}>
                                    <input placeholder="Item name *" value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)} style={inputStyle} />
                                    <input placeholder="Desc" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} style={inputStyle} />
                                    <input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} style={inputStyle} />
                                    <input type="number" placeholder="Price" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} style={inputStyle} />
                                    <button onClick={() => removeItem(i)} style={{ ...btnStyle('#ef4444'), padding: '8px' }}><Trash2 size={14} /></button>
                                </div>
                            ))}
                        </div>

                        {/* Totals */}
                        <div style={{ background: 'var(--bg, #111)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
                            {form.discount_percent > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#ef4444' }}><span>Discount ({form.discount_percent}%)</span><span>-₹{discountAmt.toLocaleString('en-IN')}</span></div>}
                            {form.tax_rate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Tax ({form.tax_rate}%)</span><span>₹{taxAmt.toLocaleString('en-IN')}</span></div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 18, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8 }}><span>Total</span><span>₹{total.toLocaleString('en-IN')}</span></div>
                        </div>

                        {/* Notes */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Notes</label>
                            <textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={inputStyle} />
                        </div>

                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowForm(false)} style={btnStyle('#374151')}>Cancel</button>
                            <button onClick={handleSave} style={btnStyle()}>{editing ? 'Update' : 'Create'} Quote</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

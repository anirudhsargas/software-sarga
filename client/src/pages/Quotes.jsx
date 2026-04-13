import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Edit2, Trash2, Send, ArrowRight, Search, X, ChevronDown, Loader2, UserSquare, Package, Clock } from 'lucide-react';
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

    const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, marginBottom: 20, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.05)' };
    const btnStyle = (bg = '#6366f1') => ({ background: bg, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, minHeight: 42 });
    const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface))', color: 'var(--text)', fontSize: 14, minHeight: 42, boxSizing: 'border-box' };

    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <style>{`
                .quote-item-card {
                    display: grid !important;
                    grid-template-columns: repeat(4, 1fr) !important;
                    gap: 12px !important;
                }
                @media (max-width: 960px) {
                    .quote-item-card {
                        grid-template-columns: repeat(2, 1fr) !important;
                    }
                    .quote-item-card > div:nth-child(1),
                    .quote-item-card > div:nth-child(2) {
                        grid-column: span 2 !important;
                    }
                }
                @media (max-width: 640px) {
                    .quote-item-card {
                        grid-template-columns: repeat(1, 1fr) !important;
                    }
                    .quote-item-card > div {
                        grid-column: span 1 !important;
                    }
                }
            `}</style>
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                                <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                                        <strong style={{ fontSize: 16 }}>{q.quote_number}</strong>
                                        <span style={{ background: statusColors[q.status] || '#666', color: '#fff', padding: '4px 12px', borderRadius: 14, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                            {q.status}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.customer_name} {q.customer_mobile ? `• ${q.customer_mobile}` : ''}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>{q.date?.slice(0, 10)} {q.valid_until ? `• Valid until: ${q.valid_until?.slice(0, 10)}` : ''}</div>
                                </div>
                                <div style={{ textAlign: 'right', minWidth: 180, flex: '0 0 auto' }}>
                                    <div style={{ fontSize: 20, fontWeight: 700 }}>₹{Number(q.total || 0).toLocaleString('en-IN')}</div>
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
                    <div className="modal" style={{ maxWidth: 900, width: '100%', maxHeight: '92vh', overflowX: 'hidden', padding: 0, borderRadius: 18, display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(15, 23, 42, 0.18)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{editing ? 'Edit Quote' : 'Create New Quote'}</h3>
                            <button onClick={() => setShowForm(false)} style={{ background: 'var(--bg-3)', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
                        </div>

                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                            {/* Customer Section */}
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'var(--primary)' }}>
                                    <UserSquare size={18} />
                                    <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Customer Information</span>
                                </div>
                                
                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block', color: 'var(--text-muted)' }}>Quick Select Existing Customer</label>
                                    <select value={form.customer_id} onChange={e => { const c = customers.find(c => c.id === Number(e.target.value)); if (c) selectCustomer(c); }}
                                        style={{ ...inputStyle, height: 42 }}>
                                        <option value="">Select or type manually below</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.mobile})</option>)}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Customer Name *</label><input placeholder="Enter name" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} style={{ ...inputStyle, height: 42 }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Mobile Number</label><input placeholder="Enter mobile" value={form.customer_mobile} onChange={e => setForm(f => ({ ...f, customer_mobile: e.target.value }))} style={{ ...inputStyle, height: 42 }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>Email Address</label><input placeholder="Enter email" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} style={{ ...inputStyle, height: 42 }} /></div>
                                    <div><label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: 'block' }}>GST Number</label><input placeholder="GSTIN (Optional)" value={form.customer_gst} onChange={e => setForm(f => ({ ...f, customer_gst: e.target.value }))} style={{ ...inputStyle, height: 42 }} /></div>
                                </div>
                            </div>

                            {/* Quote Details */}
                            <div style={{ marginBottom: 24, padding: '20px', background: 'var(--bg-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'var(--primary)' }}>
                                    <Clock size={18} />
                                    <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quote Details</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
                                    <div><label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Quote Date</label><input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ ...inputStyle, height: 40 }} /></div>
                                    <div><label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Valid Until</label><input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))} style={{ ...inputStyle, height: 40 }} /></div>
                                    <div><label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Discount %</label><input type="number" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: Number(e.target.value) }))} style={{ ...inputStyle, height: 40 }} /></div>
                                    <div><label style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' }}>Tax Rate %</label><input type="number" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: Number(e.target.value) }))} style={{ ...inputStyle, height: 40 }} /></div>
                                </div>
                            </div>

                            {/* Items Section */}
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
                                        <Package size={18} />
                                        <span style={{ fontWeight: 600, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Items & Pricing</span>
                                    </div>
                                    <button onClick={addItem} style={{ ...btnStyle('var(--primary)'), padding: '6px 12px', fontSize: 13 }}><Plus size={14} /> Add Item</button>
                                </div>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {form.items.map((item, i) => (
                                        <div key={i} className="quote-item-card" style={{ 
                                            padding: 18, 
                                            borderRadius: 16, 
                                            border: '1px solid var(--border)', 
                                            background: 'var(--surface)',
                                            position: 'relative',
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                                            gap: 14
                                        }}>
                                            <div style={{ gridColumn: 'span 4' }}>
                                                <input placeholder="Item name *" value={item.item_name} onChange={e => updateItem(i, 'item_name', e.target.value)} style={{ ...inputStyle, fontWeight: 600 }} />
                                            </div>
                                            <div style={{ gridColumn: 'span 4' }}>
                                                <input placeholder="Description (Optional)" value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} style={{ ...inputStyle, fontSize: 13 }} />
                                            </div>
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <label style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>Quantity</label>
                                                <input type="number" placeholder="Qty" value={item.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} style={inputStyle} />
                                            </div>
                                            <div style={{ gridColumn: 'span 1' }}>
                                                <label style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--text-muted)' }}>Unit Price</label>
                                                <input type="number" placeholder="Price" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', Number(e.target.value))} style={inputStyle} />
                                            </div>
                                            <div style={{ gridColumn: 'span 1', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                                                <button onClick={() => removeItem(i)} style={{ background: 'var(--error-bg)', color: 'var(--error)', border: 'none', borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Trash2 size={16} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Summary & Notes */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, alignItems: 'start' }}>
                                <div>
                                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: 'block' }}>Notes / Terms & Conditions</label>
                                    <textarea placeholder="Any specific requirements or validity notes..." value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'none' }} />
                                </div>
                                <div style={{ background: 'var(--primary)', color: 'var(--on-accent)', borderRadius: 16, padding: 20, boxShadow: '0 8px 24px rgba(99, 102, 241, 0.2)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, opacity: 0.9 }}>
                                        <span style={{ fontSize: 13 }}>Subtotal</span>
                                        <span style={{ fontWeight: 600 }}>₹{subtotal.toLocaleString('en-IN')}</span>
                                    </div>
                                    {form.discount_percent > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, color: '#fecaca' }}>
                                            <span style={{ fontSize: 13 }}>Discount ({form.discount_percent}%)</span>
                                            <span style={{ fontWeight: 600 }}>-₹{discountAmt.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    {form.tax_rate > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, opacity: 0.9 }}>
                                            <span style={{ fontSize: 13 }}>Tax ({form.tax_rate}%)</span>
                                            <span style={{ fontWeight: 600 }}>₹{taxAmt.toLocaleString('en-IN')}</span>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 22, borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 12 }}>
                                        <span>Total</span>
                                        <span>₹{total.toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '20px 24px', background: 'var(--surface-lowest)', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowForm(false)} style={{ ...btnStyle('transparent'), color: 'var(--text-muted)', fontWeight: 500 }}>Cancel</button>
                            <button onClick={handleSave} style={{ ...btnStyle('var(--primary)'), padding: '10px 24px', fontWeight: 600, boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)' }}>{editing ? 'Update Quotation' : 'Create Quotation'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

import React, { useEffect, useState } from 'react';
import { Receipt, Building2, Plus, X, Loader2 } from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';

const BOOK_TYPES = [
  { key: 'Offset', label: 'Offset' },
  { key: 'Laser', label: 'Laser' },
  { key: 'Other', label: 'Other' }
];

const InternalBilling = () => {
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(isAdmin ? '' : user.branch_id);
  const [internalCustomers, setInternalCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [bookType, setBookType] = useState('Offset');
  const [lines, setLines] = useState([{ id: Date.now(), description: '', quantity: 1, sheets: 0, amount: 0 }]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    if (isAdmin) fetchBranches();
    fetchInternalCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchInternalCustomers(); }, [branchId]);

  const fetchBranches = async () => {
    try {
      const res = await api.get('/branches');
      setBranches(res.data || []);
    } catch (err) {
      console.error('Failed to load branches', err);
    }
  };

  const fetchInternalCustomers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/customers', { params: { cross_branch: 1, limit: 500 } });
      const list = res.data?.data || res.data || [];
      const filtered = list.filter(c => c.client_type === 'internal' && (branchId ? String(c.branch_id) === String(branchId) : true));
      setInternalCustomers(filtered);
      // If only one customer and none selected, select it
      if (!selectedCustomerId && filtered.length === 1) setSelectedCustomerId(String(filtered[0].id));
    } catch (err) {
      console.error('Failed to load internal customers', err);
      setInternalCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const term = String(searchTerm || '').trim();
    if (!term) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const promises = [
        api.get('/customers', { params: { search: term, cross_branch: 1, limit: 50 } }),
        api.get('/invoices', { params: { limit: 500 } })
      ];

      if (/^\d+$/.test(term)) {
        promises.push(api.get(`/customers/${term}`));
      }

      const results = await Promise.allSettled(promises);

      const customers = [];
      const invoices = [];

      const custListRes = results[0];
      if (custListRes && custListRes.status === 'fulfilled') {
        const list = custListRes.value.data?.data || custListRes.value.data || [];
        for (const c of list) {
          if (c.client_type === 'internal') customers.push({ type: 'customer', id: c.id, label: `${c.name} ${c.mobile ? `(${c.mobile})` : ''}`, payload: c });
        }
      }

      const invRes = results[1];
      if (invRes && invRes.status === 'fulfilled') {
        const invList = invRes.value.data?.data || invRes.value.data || [];
        const lc = term.toLowerCase();
        for (const inv of invList) {
          const invNum = String(inv.invoice_number || '').toLowerCase();
          const custName = String(inv.customer_name || '').toLowerCase();
          if (invNum.includes(lc) || custName.includes(lc)) {
            invoices.push({ type: 'invoice', id: inv.id, label: `${inv.invoice_number} — ${inv.customer_name || 'N/A'}`, payload: inv });
          }
        }
      }

      if (results.length > 2 && results[2] && results[2].status === 'fulfilled') {
        const c = results[2].value.data;
        if (c && c.id) {
          if (c.client_type === 'internal') customers.unshift({ type: 'customer', id: c.id, label: `${c.name} ${c.mobile ? `(${c.mobile})` : ''}`, payload: c });
        }
      }

      setSearchResults([...customers, ...invoices]);
    } catch (err) {
      console.error('Search failed', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectResult = async (item) => {
    if (!item) return;
    if (item.type === 'customer') {
      setSelectedCustomerId(String(item.id));
      if (!internalCustomers.find(c => String(c.id) === String(item.id))) {
        const c = item.payload || (await api.get(`/customers/${item.id}`)).data;
        if (c) setInternalCustomers(prev => [...prev, c]);
      }
    } else if (item.type === 'invoice') {
      const inv = item.payload;
      if (!inv) return;
      setSelectedCustomerId(String(inv.customer_id || ''));
      const amt = Number(inv.total_amount || inv.net_amount || 0) || 0;
      setLines([{ id: Date.now(), description: inv.invoice_number ? `Invoice ${inv.invoice_number}` : 'Invoice', quantity: 1, sheets: 0, amount: amt }]);
    }
    setSearchResults([]);
    setSearchTerm('');
  };

  const addLine = () => setLines(prev => [...prev, { id: Date.now() + Math.random(), description: '', quantity: 1, sheets: 0, amount: 0 }]);
  const removeLine = (id) => setLines(prev => prev.filter(l => l.id !== id));
  const updateLine = (id, field, value) => {
    setLines(prev => prev.map(l => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomerId) { toast.error('Select an internal customer'); return; }
    if (lines.length === 0) { toast.error('Add at least one line'); return; }

    const cust = internalCustomers.find(c => String(c.id) === String(selectedCustomerId));
    if (!cust) { toast.error('Selected customer not found'); return; }

    const order_lines = lines.map(l => ({
      product_name: l.description || 'Item',
      quantity: Number(l.quantity) || 0,
      sheets: Number(l.sheets) || 0,
      unit_price: l.unit_price ? Number(l.unit_price) : null,
      total_amount: Number(l.amount) || 0,
      description: l.description || ''
    }));

    const internalDept = cust.internal_branch || `${bookType}-${branchId || cust.branch_id || ''}`;

    const payload = {
      customer_id: cust.id,
      customer_name: cust.name || 'Internal',
      customer_mobile: cust.mobile || null,
      total_amount: Number(total) || 0,
      bill_amount: Number(total) || 0,
      net_amount: Number(total) || 0,
      sgst_amount: 0,
      cgst_amount: 0,
      discount_percent: null,
      discount_amount: null,
      advance_paid: 0,
      payment_method: 'Internal',
      cash_amount: 0,
      upi_amount: 0,
      cheque_amount: 0,
      account_transfer_amount: 0,
      reference_number: null,
      description: order_lines.map(l => l.product_name).join(', '),
      payment_date: new Date().toISOString().slice(0, 10),
      order_lines,
      book_type: bookType,
      is_internal: 1,
      internal_department: internalDept
    };

    setSaving(true);
    try {
      await api.post('/customer-payments', payload);
      toast.success('Internal bill recorded');
      // Reset form
      setLines([{ id: Date.now(), description: '', quantity: 1, sheets: 0, amount: 0 }]);
    } catch (err) {
      console.error('Failed to create internal bill', err);
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to create internal bill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Receipt size={18} />
        <h2 style={{ margin: 0 }}>Internal Billing</h2>
      </div>

      <form onSubmit={handleSubmit} className="stack-md" style={{ marginTop: 12 }}>
        {isAdmin && (
          <div>
            <label className="label">Branch</label>
            <select className="input-field" value={branchId || ''} onChange={e => setBranchId(e.target.value)}>
              <option value="">Select Branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">Search (bill no / customer no / name)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="input-field" placeholder="Enter bill number, customer number or name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <button type="button" className="btn" onClick={handleSearch} disabled={searching}>{searching ? 'Searching...' : 'Search'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setSearchTerm(''); setSearchResults([]); }}>Clear</button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {searchResults.map(r => (
                <div key={`${r.type}-${r.id}`} onClick={() => handleSelectResult(r)} style={{ padding: '6px 8px', border: '1px solid var(--border)', marginBottom: 6, cursor: 'pointer', borderRadius: 6 }}>
                  <strong>{r.label}</strong> <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{r.type}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <label className="label">Internal Customer</label>
            <select className="input-field" value={selectedCustomerId || ''} onChange={e => setSelectedCustomerId(e.target.value)}>
              <option value="">Select internal customer</option>
              {internalCustomers.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.branch_id ? `(${c.branch_id})` : ''}</option>
              ))}
            </select>
            {loading && <div style={{ marginTop: 8 }}><Loader2 className="animate-spin" size={14} /> Loading customers…</div>}
          </div>
        </div>

        <div>
          <label className="label">Book Type</label>
          <select className="input-field" value={bookType} onChange={e => setBookType(e.target.value)}>
            {BOOK_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Line Items</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lines.map((l) => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 110px 40px', gap: 8, alignItems: 'center' }}>
                <input className="input-field" placeholder="Description" value={l.description} onChange={e => updateLine(l.id, 'description', e.target.value)} />
                <input className="input-field" type="number" min="0" value={l.quantity} onChange={e => updateLine(l.id, 'quantity', e.target.value)} />
                <input className="input-field" type="number" min="0" value={l.sheets} onChange={e => updateLine(l.id, 'sheets', e.target.value)} />
                <input className="input-field" type="number" min="0" step="0.01" value={l.amount} onChange={e => updateLine(l.id, 'amount', e.target.value)} />
                <button type="button" className="btn btn-ghost" onClick={() => removeLine(l.id)}><X size={14} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={addLine}><Plus size={14} /> Add line</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ fontWeight: 700 }}>Total: ₹{Number(total).toFixed(2)}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create Internal Bill'}</button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default InternalBilling;

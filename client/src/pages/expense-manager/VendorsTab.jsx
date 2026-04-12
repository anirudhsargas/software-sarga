import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebounce } from '../../hooks/useDebounce';
import {
  Store, IndianRupee, ChevronDown, ChevronUp, ArrowLeft,
  Phone, MapPin, FileText, User, TrendingUp, TrendingDown,
  Search, Package, Loader2, Plus, Pencil, Trash2, X, ShoppingCart, Calendar
} from 'lucide-react';
import api from '../../services/api';
import localDb from '../../services/localDb';
import auth from '../../services/auth';
import { fmt, fmtDate } from './constants';
import { serverToday } from '../../services/serverTime';
import { useConfirm } from '../../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import FullBillModal from './FullBillModal';

const emptyVendorForm = { name: '', type: 'Vendor', contact_person: '', phone: '', address: '', gstin: '', order_link: '' };

// Memoized transaction row
const TransactionRow = React.memo(({ r, openFullBillFromTransaction }) => (
  <tr>
    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.payment_date || r.bill_date || r._date)}</td>
    <td>
      <span style={{
        padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
        background: r._entry_type === 'Purchase' ? '#fef3c7' : '#dcfce7',
        color: r._entry_type === 'Purchase' ? '#92400e' : '#166534'
      }}>
        {r._entry_type}
      </span>
    </td>
    <td>{r.reference_number || r.bill_number || '—'}</td>
    <td>{r.description || r.payee_name || '—'}</td>
    <td style={{ textAlign: 'right', fontWeight: 600, color: r._entry_type === 'Purchase' ? 'var(--error)' : 'var(--success)' }}>
      {r._entry_type === 'Purchase' ? '-' : '+'}₹{fmt(Number(r.amount || r.total_amount || 0))}
    </td>
    <td style={{ textAlign: 'center' }}>
      {r._entry_type === 'Purchase' && r.bill_number ? (
        <button className="btn btn-ghost btn-xs" onClick={() => openFullBillFromTransaction(r)}>
          <FileText size={14} />
        </button>
      ) : '—'}
    </td>
  </tr>
));

// Virtualized transaction table body
const VirtualTransactionTable = ({ rows, openFullBillFromTransaction }) => {
  const parentRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 8,
  });

  if (rows.length === 0) return (
    <tbody>
      <tr>
        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
          No transactions found for this vendor
        </td>
      </tr>
    </tbody>
  );

  return (
    <tbody ref={parentRef} style={{ display: 'block', height: 320, overflowY: 'auto' }}>
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const r = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <table className="em-table" style={{ tableLayout: 'fixed', width: '100%', margin: 0 }}>
                <tbody>
                  <TransactionRow r={r} openFullBillFromTransaction={openFullBillFromTransaction} />
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </tbody>
  );
};

const VendorsTab = ({ onPayment, onRefreshVendors }) => {
  const { confirm } = useConfirm();
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearchTerm = useDebounce(searchInput, 300);
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [vendorLedger, setVendorLedger] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [fullBillState, setFullBillState] = useState({ open: false, vendorBillId: null });
  // Pagination state
  const [paginatedVendors, setPaginatedVendors] = useState([]);
  const [page, setPage] = useState(1);
  const limit = 20;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingVendors, setLoadingVendors] = useState(false);

  // Admin CRUD state
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [vendorForm, setVendorForm] = useState(emptyVendorForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Front office request state
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyVendorForm);
  const [requestReason, setRequestReason] = useState('');
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');

  // Purchase recording state
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({ vendor_id: '', amount: '', bill_number: '', bill_date: serverToday(), description: '' });
  const [purchaseSaving, setPurchaseSaving] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseSuccess, setPurchaseSuccess] = useState('');

  // Itemized bill state
  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm] = useState({ vendor_id: '', bill_number: '', bill_date: serverToday() });
  const [billItems, setBillItems] = useState([{ inventory_item_id: '', item_name: '', quantity: 1, unit_cost: 0, total_cost: 0 }]);
  const [billSaving, setBillSaving] = useState(false);
  const [billError, setBillError] = useState('');
  const [billSuccess, setBillSuccess] = useState('');
  const [inventoryOptions, setInventoryOptions] = useState([]);
  const [, setNewItemsAdded] = useState([]);

  // Vendor items (aggregated) + selection for reorder/download
  const [vendorItems, setVendorItems] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);

  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

  // Fetch vendors paginated
  const fetchVendors = useCallback(async (pageNum = 1, search = '') => {
    setLoadingVendors(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pageNum);
      params.append('limit', limit);
      if (search) params.append('search', search);
      const r = await api.get(`/vendors?${params.toString()}`);
      setPaginatedVendors(r.data.data || []);
      setTotal(r.data.total || 0);
      setTotalPages(r.data.totalPages || 1);
      setPage(r.data.page || 1);
    } catch {
      setPaginatedVendors([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoadingVendors(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchVendors(page, debouncedSearchTerm);
    // eslint-disable-next-line
  }, [page, debouncedSearchTerm, limit]);

  const openVendorDetail = useCallback(async (v) => {
    setSelectedVendor(v);
    setLoadingLedger(true);
    try {
      // TODO: Switch to API if available, else fallback to localDb
      // const ledger = await api.get(`/vendors/${v.id}/statement`);
      // setVendorLedger(ledger.data);
      setVendorLedger({ rows: [], payments: [], purchases: [] });
      // fetch aggregated items purchased from this vendor
      try {
        const ir = await api.get(`/vendors/${v.id}/items`);
        setVendorItems(ir.data.items || []);
        setSelectedItemIds(new Set());
        setSelectAll(false);
      } catch (e) {
        setVendorItems([]);
      }
    } catch {
      setVendorLedger({ rows: [], payments: [], purchases: [] });
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  const openFullBillFromTransaction = (row) => {
    if (row?._entry_type !== 'Purchase' || !row?.id) return;
    setFullBillState({ open: true, vendorBillId: row.id });
  };

  /* ── Admin CRUD ── */
  const openAddForm = () => {
    setEditingVendor(null);
    setVendorForm(emptyVendorForm);
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (v) => {
    setEditingVendor(v);
    setVendorForm({ name: v.name || '', type: v.type || 'Vendor', contact_person: v.contact_person || '', phone: v.phone || '', address: v.address || '', gstin: v.gstin || '', order_link: v.order_link || '' });
    setFormError('');
    setShowForm(true);
  };

  const handleSaveVendor = async (e) => {
    e.preventDefault();
    if (!vendorForm.name.trim()) { setFormError('Name is required'); return; }
    setSaving(true); setFormError('');
    try {
      await localDb.saveVendor({ ...vendorForm, id: editingVendor?.id });
      setShowForm(false);
      toast.success(editingVendor ? 'Vendor updated locally' : 'Vendor added locally');
      if (onRefreshVendors) onRefreshVendors();
    } catch {
      setFormError('Failed to save vendor locally');
    } finally { setSaving(false); }
  };

  const handleDeleteVendor = async (v) => {
    const isConfirmed = await confirm({
      title: 'Delete Vendor',
      message: `Are you sure you want to delete vendor "${v.name}"? This cannot be undone.`,
      confirmText: 'Delete',
      type: 'danger'
    });
    if (!isConfirmed) return;

    try {
      await localDb.deleteVendor(v.id);
      toast.success('Vendor deleted locally');
      if (onRefreshVendors) onRefreshVendors();
    } catch {
      toast.error('Cannot delete this vendor locally');
    }
  };

  const openRequestForm = () => {
    setRequestForm(emptyVendorForm);
    setRequestReason('');
    setRequestError('');
    setShowRequestForm(true);
  };

  const submitVendorRequest = async (e) => {
    e.preventDefault();
    if (!requestForm.name.trim()) { setRequestError('Name is required'); return; }
    setRequestSaving(true);
    try {
      await localDb.saveVendorRequest({
        request_type: 'Vendor',
        name: requestForm.name.trim(),
        contact_person: requestForm.contact_person || null,
        phone: requestForm.phone || null,
        address: requestForm.address || null,
        gstin: requestForm.gstin || null,
        request_reason: requestReason || null
      });
      setShowRequestForm(false);
      toast.success('Vendor request submitted locally');
    } catch {
      setRequestError('Failed to submit request locally');
    } finally { setRequestSaving(false); }
  };

  /* ── Purchase submit ── */
  const openPurchaseForm = (v) => {
    setPurchaseForm({ vendor_id: v.id, amount: '', bill_number: '', bill_date: serverToday(), description: '' });
    setPurchaseError('');
    setPurchaseSuccess('');
    setShowPurchaseForm(true);
  };

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    setPurchaseSaving(true);
    setPurchaseError('');
    try {
      await localDb.createVendorBill({
        vendor_id: purchaseForm.vendor_id,
        bill_number: purchaseForm.bill_number || null,
        bill_date: purchaseForm.bill_date,
        total_amount: Number(purchaseForm.amount),
        description: purchaseForm.description
      });
      setPurchaseSuccess('Purchase recorded locally!');
      setTimeout(() => {
        setShowPurchaseForm(false);
        setPurchaseSuccess('');
        if (selectedVendor) openVendorDetail(selectedVendor);
        if (onRefreshVendors) onRefreshVendors();
      }, 1000);
    } catch {
      setPurchaseError('Failed to record purchase locally');
    } finally { setPurchaseSaving(false); }
  };

  /* ── Itemized Bill ── */
  const openBillForm = async (v) => {
    setBillForm({ vendor_id: v.id, bill_number: '', bill_date: serverToday() });
    setBillItems([{ inventory_item_id: '', item_name: '', quantity: 1, unit_cost: 0, total_cost: 0 }]);
    setBillError('');
    setBillSuccess('');
    setNewItemsAdded([]);
    setShowBillForm(true);
    try {
      const res = await localDb.getInventory();
      setInventoryOptions(res.data || []);
    } catch { setInventoryOptions([]); }
  };

  const updateBillItem = (idx, field, value) => {
    setBillItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === 'inventory_item_id') {
        const inv = inventoryOptions.find(o => o.id === Number(value));
        if (inv) {
          updated.item_name = inv.name;
          updated.unit_cost = Number(inv.cost_price) || 0;
          updated.total_cost = updated.quantity * (Number(inv.cost_price) || 0);
        }
      }
      if (field === 'quantity' || field === 'unit_cost') {
        updated.total_cost = (Number(updated.quantity) || 0) * (Number(updated.unit_cost) || 0);
      }
      return updated;
    }));
  };

  const addBillItemRow = () => {
    setBillItems(prev => [...prev, { inventory_item_id: '', item_name: '', quantity: 1, unit_cost: 0, total_cost: 0 }]);
  };

  const removeBillItemRow = (idx) => {
    setBillItems(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  const handleBillSubmit = async (e) => {
    e.preventDefault();
    const validItems = billItems.filter(i => i.inventory_item_id && Number(i.quantity) > 0);
    if (!validItems.length) { setBillError('Add at least one item with inventory link'); return; }
    setBillSaving(true);
    setBillError('');
    try {
      await localDb.createVendorBill({
        vendor_id: billForm.vendor_id,
        bill_number: billForm.bill_number || null,
        bill_date: billForm.bill_date,
        items: validItems.map(i => ({
          inventory_item_id: Number(i.inventory_item_id),
          quantity: Number(i.quantity),
          unit_cost: Number(i.unit_cost),
          total_cost: Number(i.total_cost)
        }))
      });
      setBillSuccess(`Bill recorded & inventory updated locally!`);
      toast.success(`Bill saved locally! Inventory updated.`, { duration: 4000 });
      setTimeout(() => {
        setShowBillForm(false);
        setBillSuccess('');
        if (selectedVendor) openVendorDetail(selectedVendor);
        if (onRefreshVendors) onRefreshVendors();
      }, 2000);
    } catch {
      setBillError('Failed to record bill locally');
    } finally { setBillSaving(false); }
  };

  /* ── Vendor items helpers (selection, download, whatsapp, reorder) ── */
  const toggleSelectItem = (inventoryId) => {
    setSelectedItemIds(prev => {
      const s = new Set(prev);
      if (s.has(inventoryId)) s.delete(inventoryId); else s.add(inventoryId);
      setSelectAll(s.size === vendorItems.length && vendorItems.length > 0);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (!selectAll) {
      setSelectedItemIds(new Set(vendorItems.map(i => i.inventory_id)));
      setSelectAll(true);
    } else {
      setSelectedItemIds(new Set());
      setSelectAll(false);
    }
  };

  const downloadSelected = () => {
    const items = vendorItems.filter(i => selectedItemIds.has(i.inventory_id));
    if (!items.length) { toast.error('Select items to download'); return; }
    const lines = [`Purchase List — ${selectedVendor?.name || ''}`, ''];
    items.forEach(it => {
      lines.push(`${it.item_name || ''} ${it.sku ? `(${it.sku})` : ''} x ${it.total_purchased || 0} @ ${it.last_unit_cost != null ? '₹' + it.last_unit_cost : '—'}`);
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase-list-${selectedVendor?.id || 'vendor'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('Download started');
  };

  const sendWhatsApp = () => {
    const items = vendorItems.filter(i => selectedItemIds.has(i.inventory_id));
    if (!items.length) { toast.error('Select items to send'); return; }
    let text = `Purchase list for ${selectedVendor?.name || ''}\n\n`;
    items.forEach(it => {
      text += `- ${it.item_name || ''} ${it.sku ? `(${it.sku})` : ''} x ${it.total_purchased || 0} @ ${it.last_unit_cost != null ? '₹' + it.last_unit_cost : ''}\n`;
    });
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const orderSelected = async (sameQty = false) => {
    const items = vendorItems.filter(i => selectedItemIds.has(i.inventory_id));
    if (!items.length) { toast.error('Select items to order'); return; }
    const mapped = items.map(it => ({
      inventory_item_id: Number(it.inventory_id),
      item_name: it.item_name,
      quantity: Number(sameQty ? (it.total_purchased || 1) : (it.total_purchased || 1)),
      unit_cost: Number(it.last_unit_cost || 0),
      total_cost: Number((it.last_unit_cost || 0) * (it.total_purchased || 1))
    }));
    try {
      const inv = await localDb.getInventory();
      setInventoryOptions(inv.data || []);
    } catch (e) {
      setInventoryOptions([]);
    }
    setBillForm({ vendor_id: selectedVendor.id, bill_number: '', bill_date: serverToday() });
    setBillItems(mapped.map(m => ({ inventory_item_id: m.inventory_item_id, item_name: m.item_name, quantity: m.quantity, unit_cost: m.unit_cost, total_cost: m.total_cost })));
    setShowBillForm(true);
  };

  const viewLastBill = (billId) => {
    if (!billId) { toast.error('No bill available'); return; }
    setFullBillState({ open: true, vendorBillId: billId });
  };



  /* ── Vendor Detail Dashboard ── */
  if (selectedVendor) {
    const v = selectedVendor;
    const rows = vendorLedger?.rows || [];
    const purchases = vendorLedger?.purchases || [];
    const payments = vendorLedger?.payments || [];
    const totalPurchases = purchases.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const totalPaid = payments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const balance = totalPurchases - totalPaid;

    return (
      <div className="em-section">
        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedVendor(null); setVendorLedger(null); }}>
          <ArrowLeft size={16} /> Back to Vendors
        </button>

        {/* Vendor Profile Card */}
        <div className="em-vendor-profile">
          <div className="em-vendor-profile__avatar"><Store size={32} /></div>
          <div className="em-vendor-profile__info">
            <h2 className="em-vendor-profile__name">{v.name}</h2>
            <div className="em-vendor-profile__meta">
              <span className="em-type-badge em-type-badge--vendor">{v.type || 'Vendor'}</span>
              {v.phone && <span className="em-vendor-profile__tag"><Phone size={12} /> {v.phone}</span>}
              {v.address && <span className="em-vendor-profile__tag"><MapPin size={12} /> {v.address}</span>}
              {v.contact_person && <span className="em-vendor-profile__tag"><User size={12} /> {v.contact_person}</span>}
              {v.gstin && <span className="em-vendor-profile__tag"><FileText size={12} /> GSTIN: {v.gstin}</span>}
            </div>
          </div>
          <div className="em-vendor-profile__actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" style={{ background: 'var(--warning)', color: 'var(--on-accent)' }} onClick={() => openPurchaseForm(v)}>
              <ShoppingCart size={14} /> Quick Purchase
            </button>
            <button className="btn btn-sm" style={{ background: 'var(--info, #2563eb)', color: 'var(--on-accent)' }} onClick={() => openBillForm(v)}>
              <Package size={14} /> Bill with Items
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => onPayment({ type: 'Vendor', vendor_id: v.id, payee_name: v.name })}>
              <IndianRupee size={14} /> Make Payment
            </button>
          </div>
        </div>

        {/* Financial Summary KPIs */}
        <div className="em-kpi-grid em-kpi-grid--3">
          <div className="em-kpi-card em-kpi-card--blue">
            <div className="em-kpi-card__icon"><Package size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Purchases</div>
              <div className="em-kpi-card__value">₹{fmt(totalPurchases)}</div>
            </div>
          </div>
          <div className="em-kpi-card em-kpi-card--green">
            <div className="em-kpi-card__icon"><TrendingUp size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Total Paid</div>
              <div className="em-kpi-card__value">₹{fmt(totalPaid)}</div>
            </div>
          </div>
          <div className="em-kpi-card" style={{ borderLeft: `4px solid ${balance > 0 ? 'var(--error)' : 'var(--success)'}` }}>
            <div className="em-kpi-card__icon"><TrendingDown size={22} /></div>
            <div className="em-kpi-card__body">
              <div className="em-kpi-card__label">Balance Due</div>
              <div className="em-kpi-card__value" style={{ color: balance > 0 ? 'var(--error)' : 'var(--success)' }}>₹{fmt(Math.abs(balance))}</div>
              {balance > 0 && <div className="em-kpi-card__sub em-kpi-card__sub--warn">Outstanding</div>}
            </div>
          </div>
        </div>

        {/* Transaction History */}
        <div className="em-card">
          <div className="em-card__title"><FileText size={16} /> Transaction History</div>
          {loadingLedger ? <div className="em-loading"><Loader2 className="spin" size={20} /> Loading...</div> : rows.length > 0 ? (
            <div className="em-table-wrap">
              <table className="em-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Ref</th>
                    <th>Description</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'center', width: 40 }}>Bill</th>
                  </tr>
                </thead>
                <VirtualTransactionTable rows={rows} openFullBillFromTransaction={openFullBillFromTransaction} />
              </table>
            </div>
          ) : (
            <div className="em-empty-inline">
              <FileText size={32} strokeWidth={1} />
              <p>No transactions found for this vendor</p>
            </div>
          )}
        </div>
        {/* Items Purchased From Vendor */}
        <div className="em-card">
          <div className="em-card__title"><Package size={16} /> Items Purchased</div>
          {vendorItems.length === 0 ? (
            <div className="em-empty-inline">
              <Package size={32} strokeWidth={1} />
              <p>No purchase item history for this vendor</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} /> Select all</label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={downloadSelected}><FileText size={14} /> Download</button>
                  <button className="btn btn-ghost btn-sm" onClick={sendWhatsApp}>WhatsApp</button>
                  <button className="btn btn-primary btn-sm" onClick={() => orderSelected(false)}>Order Same Qty</button>
                  <button className="btn btn-sm" style={{ background: 'var(--info, #2563eb)', color: 'var(--on-accent)' }} onClick={() => orderSelected(true)}>Order & Edit</button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="em-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Item</th>
                      <th>SKU</th>
                      <th style={{ textAlign: 'right' }}>Total Purchased</th>
                      <th style={{ textAlign: 'right' }}>Last Unit Cost</th>
                      <th>Last Purchase</th>
                      <th style={{ textAlign: 'center', width: 140 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorItems.map(it => (
                      <tr key={it.inventory_id}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={selectedItemIds.has(it.inventory_id)} onChange={() => toggleSelectItem(it.inventory_id)} />
                        </td>
                        <td>{it.item_name}</td>
                        <td>{it.sku || '—'}</td>
                        <td style={{ textAlign: 'right' }}>{it.total_purchased || 0}</td>
                        <td style={{ textAlign: 'right' }}>{it.last_unit_cost != null ? `₹${Number(it.last_unit_cost).toFixed(2)}` : '—'}</td>
                        <td>{it.last_bill_date ? fmtDate(it.last_bill_date) : '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => viewLastBill(it.last_bill_id)} title="View last bill"><FileText size={14} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedItemIds(prev => new Set(prev).add(it.inventory_id)); orderSelected(true); }} title="Order this item">Order</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <FullBillModal
          open={fullBillState.open}
          vendorBillId={fullBillState.vendorBillId}
          onClose={() => setFullBillState({ open: false, vendorBillId: null })}
        />
      </div>
    );
  }

  /* ── Vendor List ── */
  return (
    <div className="em-section">
      <div className="em-filter-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div className="em-section-title"><Store size={18} /> Vendor Management</div>
        <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
          <div className="em-search-wrap" style={{ maxWidth: 220 }}>
            <Search size={16} className="em-search-icon" />
            <input className="em-input" style={{ paddingLeft: 36 }} placeholder="Search vendors..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>
          {isAdmin ? (
            <button className="btn btn-primary btn-sm" onClick={openAddForm}>
              <Plus size={15} /> Add Vendor
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={openRequestForm}>
              <Plus size={15} /> Request Vendor
            </button>
          )}
        </div>
      </div>


      {loadingVendors ? (
        <div className="em-loading"><Loader2 className="spin" size={20} /> Loading vendors...</div>
      ) : paginatedVendors.length === 0 ? (
        <div className="em-empty-state">
          <div className="em-empty-state__icon"><Store size={48} strokeWidth={1.5} /></div>
          <h3 className="em-empty-state__title">No Vendors Yet</h3>
          <p className="em-empty-state__desc">Add vendors to track purchases and payments.</p>
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={openAddForm}><Plus size={15} /> Add First Vendor</button>
          )}
        </div>
      ) : (
        <>
          <div className="em-vendor-list">
            {paginatedVendors.map(v => (
              <div key={v.id} className="em-vendor-card" onDoubleClick={() => openVendorDetail(v)}>
                <div className="em-vendor-card__header" onClick={() => setExpandedVendor(expandedVendor === v.id ? null : v.id)}>
                  <div className="em-vendor-card__avatar"><Store size={18} /></div>
                  <div className="em-vendor-card__info">
                    <div className="em-vendor-card__name">{v.name}</div>
                    <div className="em-vendor-card__meta">{v.type} · {v.phone || 'No phone'}</div>
                  </div>
                  <div className="em-vendor-card__actions">
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openVendorDetail(v); }}>View</button>
                    <button className="btn btn-sm" style={{ background: 'var(--warning)', color: 'var(--on-accent)', border: 'none' }} onClick={(e) => { e.stopPropagation(); openPurchaseForm(v); }}>
                      <ShoppingCart size={14} /> Purchase
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onPayment({ type: 'Vendor', vendor_id: v.id, payee_name: v.name }); }}>
                      <IndianRupee size={14} /> Pay
                    </button>
                    {isAdmin && (
                      <>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={(e) => { e.stopPropagation(); openEditForm(v); }}><Pencil size={14} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteVendor(v); }}><Trash2 size={14} /></button>
                      </>
                    )}
                    {expandedVendor === v.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
                {expandedVendor === v.id && (
                  <div className="em-vendor-card__body">
                    <div className="em-vendor-card__details-grid">
                      {v.address && <div className="em-vendor-detail-item"><MapPin size={14} /><span>{v.address}</span></div>}
                      {v.gstin && <div className="em-vendor-detail-item"><FileText size={14} /><span>GSTIN: {v.gstin}</span></div>}
                      <div className="em-vendor-detail-item"><User size={14} /><span>Contact: {v.contact_person || '—'}</span></div>
                      {v.phone && <div className="em-vendor-detail-item"><Phone size={14} /><span>{v.phone}</span></div>}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openVendorDetail(v)}>View Full Dashboard →</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '8px 0' }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Previous page" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Next page" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={16} /></button>
            </div>
          )}
        </>
      )}

      {/* ── Add/Edit Vendor Modal ── */}
      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveVendor}>
              <div className="em-modal__body">
                {formError && <div className="em-error" style={{ marginBottom: 12 }}>{formError}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Vendor Name *</label>
                    <input className="em-input" value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="em-form-group">
                    <label>Type</label>
                    <select className="em-input" value={vendorForm.type} onChange={e => setVendorForm(p => ({ ...p, type: e.target.value }))}>
                      <option value="Vendor">Vendor</option>
                      <option value="Paper Supplier">Paper Supplier</option>
                      <option value="Ink Supplier">Ink Supplier</option>
                      <option value="Machine Vendor">Machine Vendor</option>
                      <option value="Service Provider">Service Provider</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="em-form-group">
                    <label>Contact Person</label>
                    <input className="em-input" value={vendorForm.contact_person} onChange={e => setVendorForm(p => ({ ...p, contact_person: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Phone</label>
                    <input className="em-input" value={vendorForm.phone} onChange={e => setVendorForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Address</label>
                    <input className="em-input" value={vendorForm.address} onChange={e => setVendorForm(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>GSTIN</label>
                    <input className="em-input" value={vendorForm.gstin} onChange={e => setVendorForm(p => ({ ...p, gstin: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Order Link</label>
                    <input className="em-input" value={vendorForm.order_link} onChange={e => setVendorForm(p => ({ ...p, order_link: e.target.value }))} placeholder="https://..." />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : (editingVendor ? 'Update Vendor' : 'Add Vendor')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Vendor Request Modal (Front Office) ── */}
      {showRequestForm && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRequestForm(false); }}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <div className="em-modal__header">
              <h2>Request Vendor</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRequestForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={submitVendorRequest}>
              <div className="em-modal__body">
                {requestError && <div className="em-error" style={{ marginBottom: 12 }}>{requestError}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Vendor Name *</label>
                    <input className="em-input" value={requestForm.name} onChange={e => setRequestForm(p => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="em-form-group">
                    <label>Contact Person</label>
                    <input className="em-input" value={requestForm.contact_person} onChange={e => setRequestForm(p => ({ ...p, contact_person: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>Phone</label>
                    <input className="em-input" value={requestForm.phone} onChange={e => setRequestForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="em-form-group">
                    <label>GSTIN</label>
                    <input className="em-input" value={requestForm.gstin} onChange={e => setRequestForm(p => ({ ...p, gstin: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Address</label>
                    <input className="em-input" value={requestForm.address} onChange={e => setRequestForm(p => ({ ...p, address: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Reason / Notes</label>
                    <input className="em-input" value={requestReason} onChange={e => setRequestReason(e.target.value)} placeholder="Why is this vendor needed?" />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowRequestForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={requestSaving}>{requestSaving ? 'Submitting...' : 'Submit Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Purchase Recording Modal */}
      {showPurchaseForm && (
        <div className="em-modal-backdrop" onClick={() => setShowPurchaseForm(false)}>
          <div className="em-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handlePurchaseSubmit}>
              <div className="em-modal__header">
                <h3><ShoppingCart size={18} /> Record Purchase — {purchaseForm.vendor_name}</h3>
                <button type="button" className="em-modal__close" onClick={() => setShowPurchaseForm(false)}>×</button>
              </div>
              <div className="em-modal__body">
                {purchaseError && <div className="em-alert em-alert--danger">{purchaseError}</div>}
                {purchaseSuccess && <div className="em-alert em-alert--success">{purchaseSuccess}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Amount (₹) *</label>
                    <input className="em-input" type="number" step="0.01" min="0" required value={purchaseForm.amount} onChange={e => setPurchaseForm(p => ({ ...p, amount: e.target.value }))} placeholder="Enter purchase amount" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Number</label>
                    <input className="em-input" value={purchaseForm.bill_number} onChange={e => setPurchaseForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g. INV-001" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Date</label>
                    <input className="em-input" type="date" value={purchaseForm.bill_date} onChange={e => setPurchaseForm(p => ({ ...p, bill_date: e.target.value }))} />
                  </div>
                  <div className="em-form-group em-form-group--full">
                    <label>Description</label>
                    <textarea className="em-input" rows={3} value={purchaseForm.description} onChange={e => setPurchaseForm(p => ({ ...p, description: e.target.value }))} placeholder="What was purchased?" />
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPurchaseForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={purchaseSaving}>{purchaseSaving ? 'Saving...' : 'Record Purchase'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Itemized Bill Modal */}
      {showBillForm && (
        <div className="em-modal-overlay" onClick={() => setShowBillForm(false)}>
          <div className="em-modal" style={{ maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <form onSubmit={handleBillSubmit}>
              <div className="em-modal__header">
                <h3><Package size={18} /> Record Bill with Items</h3>
                <button type="button" className="em-modal__close" onClick={() => setShowBillForm(false)}><X size={18} /></button>
              </div>
              <div className="em-modal__body">
                {billError && <div className="em-alert em-alert--danger">{billError}</div>}
                {billSuccess && <div className="em-alert em-alert--success">{billSuccess}</div>}
                <div className="em-form-grid">
                  <div className="em-form-group">
                    <label>Bill Number</label>
                    <input className="em-input" value={billForm.bill_number} onChange={e => setBillForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g. INV-001" />
                  </div>
                  <div className="em-form-group">
                    <label>Bill Date</label>
                    <input className="em-input" type="date" value={billForm.bill_date} onChange={e => setBillForm(p => ({ ...p, bill_date: e.target.value }))} />
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontWeight: 600 }}>Line Items</label>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={addBillItemRow}><Plus size={14} /> Add Row</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="em-table" style={{ minWidth: 600 }}>
                      <thead>
                        <tr>
                          <th>Inventory Item *</th>
                          <th style={{ width: 80 }}>Qty</th>
                          <th style={{ width: 100 }}>Unit Cost</th>
                          <th style={{ width: 100 }}>Total</th>
                          <th style={{ width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {billItems.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <select className="em-input" value={item.inventory_item_id} onChange={e => updateBillItem(idx, 'inventory_item_id', e.target.value)} style={{ minWidth: 200 }}>
                                <option value="">Select item...</option>
                                {inventoryOptions.map(inv => (
                                  <option key={inv.id} value={inv.id}>{inv.name} {inv.sku ? `(${inv.sku})` : ''}</option>
                                ))}
                              </select>
                            </td>
                            <td><input className="em-input" type="number" min="1" value={item.quantity} onChange={e => updateBillItem(idx, 'quantity', e.target.value)} /></td>
                            <td><input className="em-input" type="number" step="0.01" min="0" value={item.unit_cost} onChange={e => updateBillItem(idx, 'unit_cost', e.target.value)} /></td>
                            <td style={{ fontWeight: 600 }}>₹{(Number(item.total_cost) || 0).toFixed(2)}</td>
                            <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => removeBillItemRow(idx)} title="Remove"><Trash2 size={14} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700 }}>Total:</td>
                          <td style={{ fontWeight: 700 }}>₹{billItems.reduce((s, i) => s + (Number(i.total_cost) || 0), 0).toFixed(2)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
              <div className="em-modal__footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowBillForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={billSaving}>{billSaving ? 'Saving...' : 'Save Bill & Update Stock'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FullBillModal
        open={fullBillState.open}
        vendorBillId={fullBillState.vendorBillId}
        onClose={() => setFullBillState({ open: false, vendorBillId: null })}
      />
    </div>
  );
};

export default VendorsTab;

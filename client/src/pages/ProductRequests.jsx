import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { X, Check, Eye, Loader2, Search, Save, Send, History, ArrowRight, Clock, AlertTriangle, FileText } from 'lucide-react';
import { useConfirm } from '../contexts/ConfirmContext';

const STATUS_CONFIG = {
    Draft: { color: 'var(--text-muted)', bg: 'var(--surface-2)', label: 'Draft' },
    Pending: { color: 'var(--warning)', bg: 'var(--warning-bg)', label: 'Pending' },
    Approved: { color: 'var(--success)', bg: 'var(--success-bg)', label: 'Approved' },
    Rejected: { color: 'var(--error)', bg: 'var(--error-bg)', label: 'Rejected' },
};

const FIELDS = [
    { key: 'name', label: 'Name' },
    { key: 'product_code', label: 'Product Code' },
    { key: 'company_name', label: 'Company' },
    { key: 'size', label: 'Size' },
    { key: 'calculation_type', label: 'Calc Type' },
    { key: 'description', label: 'Description' },
    { key: 'sell_price', label: 'Sell Price' },
    { key: 'cost_price', label: 'Cost Price' },
];

const ProductRequests = () => {
    useSEO('Product Requests');

    const { confirm } = useConfirm();
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [selected, setSelected] = useState(null);
    const [reviewing, setReviewing] = useState(false);

    // New request workflow
    const [showNewRequest, setShowNewRequest] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const [productResults, setProductResults] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [proposedChanges, setProposedChanges] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [searching, setSearching] = useState(false);
    const [requestPriority, setRequestPriority] = useState('Medium');
    const [requestNotes, setRequestNotes] = useState('');

    useEffect(() => {
        fetchRequests();
    }, [page, limit]);

    useEffect(() => {
        if (!showNewRequest) {
            setSelectedProduct(null);
            setProposedChanges({});
            setProductSearch('');
            setRequestPriority('Medium');
            setRequestNotes('');
        }
    }, [showNewRequest]);

    useEffect(() => {
        if (!productSearch.trim() || !showNewRequest) {
            setProductResults([]);
            return;
        }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.get('/products', { params: { search: productSearch, limit: 10 } });
                setProductResults(res.data?.data || res.data || []);
            } catch { setProductResults([]); }
            finally { setSearching(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [productSearch, showNewRequest]);

    const fetchRequests = async (status) => {
        setLoading(true);
        try {
            const params = { page, limit };
            if (status) params.status = status;
            const res = await api.get('/products/update-requests', { params });
            setRequests(Array.isArray(res.data) ? res.data : res.data?.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    const open = (r) => setSelected(r);
    const close = () => setSelected(null);

    const review = async (id, action) => {
        const msg = action === 'approve' ? 'Apply this update to the product now?' : 'Reject this request?';
        const isConfirmed = await confirm({
            title: action === 'approve' ? 'Approve update' : 'Reject update',
            message: msg,
            confirmText: action === 'approve' ? 'Approve' : 'Reject',
            type: action === 'approve' ? 'primary' : 'danger'
        });
        if (!isConfirmed) return;
        setReviewing(true);
        try {
            await api.patch(`/products/update-requests/${id}`, { action });
            toast.success(action === 'approve' ? 'Approved and applied' : 'Rejected');
            fetchRequests();
            close();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to review');
        } finally {
            setReviewing(false);
        }
    };

    const selectProduct = (product) => {
        setSelectedProduct(product);
        const changes = {};
        FIELDS.forEach(f => { changes[f.key] = product[f.key] || ''; });
        setProposedChanges(changes);
        setProductSearch(product.name);
        setProductResults([]);
    };

    const handleChange = (key, value) => {
        setProposedChanges(prev => ({ ...prev, [key]: value }));
    };

    const hasChanges = useMemo(() => {
        if (!selectedProduct) return false;
        return FIELDS.some(f => String(proposedChanges[f.key] || '') !== String(selectedProduct[f.key] || ''));
    }, [selectedProduct, proposedChanges]);

    const submitRequest = async (status) => {
        if (!selectedProduct || !hasChanges) {
            toast.error(!selectedProduct ? 'Select a product first' : 'No changes to submit');
            return;
        }
        setSubmitting(true);
        try {
            const payload = {
                product_id: selectedProduct.id,
                current_data: FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: selectedProduct[f.key] }), {}),
                proposed_data: proposedChanges,
                priority: requestPriority,
                notes: requestNotes,
                status,
            };
            await api.post('/products/update-requests', payload);
            toast.success(status === 'Draft' ? 'Draft saved' : 'Request submitted for approval');
            setShowNewRequest(false);
            fetchRequests();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    const canNext = requests.length === limit;

    const changedFields = useMemo(() => {
        if (!selectedProduct) return [];
        return FIELDS.filter(f => String(proposedChanges[f.key] || '') !== String(selectedProduct[f.key] || ''));
    }, [selectedProduct, proposedChanges]);

    const filterTabs = ['all', 'Draft', 'Pending', 'Approved', 'Rejected'];
    const [filterStatus, setFilterStatus] = useState('all');

    return (
        <div className="stack-lg">
            {/* Header */}
            <div className="row space-between items-center flex-wrap gap-md mb-16">
                <div>
                    <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={22} /> Product Update Request
                    </h2>
                    <p className="muted text-sm">Request product changes — review and approve with full change tracking</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowNewRequest(true); }}>
                    <Send size={16} /> New Request
                </button>
            </div>

            {/* Status filter tabs */}
            <div className="row gap-xs mb-16" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                {filterTabs.map(st => (
                    <button
                        key={st}
                        className={`btn btn-sm ${filterStatus === st ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => { setFilterStatus(st); setPage(1); }}
                    >
                        {st === 'all' ? 'All' : st}
                        {st !== 'all' && (
                            <span className="badge" style={{
                                background: STATUS_CONFIG[st]?.bg || 'var(--surface-2)',
                                color: STATUS_CONFIG[st]?.color || 'var(--text-muted)',
                                marginLeft: 4
                            }}>
                                {requests.filter(r => r.status === st).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Requests list */}
            {loading ? (
                <div className="card p-20 flex-center"><Loader2 className="animate-spin" size={20} /> Loading…</div>
            ) : (
                <div className="panel">
                    {requests.length === 0 ? (
                        <div className="p-32 text-center muted">
                            <FileText size={36} style={{ opacity: 0.4, marginBottom: 8 }} />
                            <div>No requests found</div>
                        </div>
                    ) : (
                        <div className="table-scroll">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Product</th>
                                        <th>Requested By</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.filter(r => filterStatus === 'all' || r.status === filterStatus).map(r => {
                                        const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.Draft;
                                        return (
                                            <tr key={r.id}>
                                                <td className="text-sm">#{r.id}</td>
                                                <td><span className="font-semibold">{r.product_name || `#${r.product_id}`}</span></td>
                                                <td className="text-sm">{r.requested_by_name || r.requested_by}</td>
                                                <td className="text-sm">{new Date(r.requested_at).toLocaleString()}</td>
                                                <td>
                                                    <span className="badge" style={{ background: sc.bg, color: sc.color, fontWeight: 600 }}>
                                                        {sc.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="row gap-xs">
                                                        <button className="btn btn-ghost btn-sm" onClick={() => open(r)} title="View Details"><Eye size={14} /></button>
                                                        {r.status === 'Pending' && (
                                                            <>
                                                                <button className="btn btn-ghost btn-sm text-error" onClick={() => review(r.id, 'reject')}><X size={14} /> Reject</button>
                                                                <button className="btn btn-primary btn-sm" onClick={() => review(r.id, 'approve')}><Check size={14} /> Approve</button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="row space-between items-center p-12 border-top">
                        <div className="row gap-sm items-center">
                            <button className="btn btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>Prev</button>
                            <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={!canNext || loading}>Next</button>
                            <span className="muted text-sm ml-8">Page {page}</span>
                        </div>
                        <div className="row gap-sm items-center">
                            <label className="muted text-sm">Per page:</label>
                            <select className="input-field" style={{ width: 80 }} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Detail Modal */}
            {selected && (
                <div className="modal-backdrop" onClick={close}>
                    <div className="modal" style={{ maxWidth: 900 }} onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={close}><X size={20} /></button>
                        <div className="modal-header">
                            <h3 className="section-title">Request #{selected.id}</h3>
                            <span className="badge" style={{
                                background: (STATUS_CONFIG[selected.status] || STATUS_CONFIG.Draft).bg,
                                color: (STATUS_CONFIG[selected.status] || STATUS_CONFIG.Draft).color,
                                fontWeight: 600
                            }}>
                                {(STATUS_CONFIG[selected.status] || STATUS_CONFIG.Draft).label}
                            </span>
                        </div>

                        <div className="row gap-sm mt-12 mb-16 text-sm" style={{ color: 'var(--text-muted)' }}>
                            <span><Clock size={13} style={{ verticalAlign: 'middle' }} /> Requested: {new Date(selected.requested_at).toLocaleString()}</span>
                            <span>· By: {selected.requested_by_name || selected.requested_by}</span>
                            {selected.priority && <span>· Priority: {selected.priority}</span>}
                        </div>

                        <div className="stack-md">
                            <div className="panel p-16">
                                <h4 className="font-semibold mb-12">Changes</h4>
                                <table className="table" style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: '25%' }}>Field</th>
                                            <th style={{ width: '35%' }}>Current Value</th>
                                            <th style={{ width: '5%' }}></th>
                                            <th style={{ width: '35%' }}>New Value</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {FIELDS.map(f => {
                                            const curr = selected.current_data?.[f.key];
                                            const prop = selected.proposed_data?.[f.key];
                                            const changed = String(curr || '') !== String(prop || '');
                                            if (!changed && !prop) return null;
                                            return (
                                                <tr key={f.key}>
                                                    <td className="font-semibold">{f.label}</td>
                                                    <td style={{ color: changed ? 'var(--text-muted)' : 'var(--text)' }}>
                                                        {curr || '—'}
                                                    </td>
                                                    <td>{changed && <ArrowRight size={14} style={{ color: 'var(--warning)' }} />}</td>
                                                    <td style={{ color: changed ? 'var(--success)' : 'var(--text)' }}>
                                                        {changed ? (prop || '—') : (curr || '—')}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {selected.notes && (
                                <div className="panel p-16">
                                    <h4 className="font-semibold mb-4">Notes</h4>
                                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.notes}</p>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer row gap-sm justify-end mt-16">
                            {selected.status === 'Pending' && (
                                <>
                                    <button className="btn btn-ghost" onClick={() => review(selected.id, 'reject')} disabled={reviewing}>
                                        <X size={14} /> Reject
                                    </button>
                                    <button className="btn btn-primary" onClick={() => review(selected.id, 'approve')} disabled={reviewing}>
                                        {reviewing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                        Approve & Apply
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* New Request Modal */}
            {showNewRequest && (
                <div className="modal-backdrop" onClick={() => !submitting && setShowNewRequest(false)}>
                    <div className="modal" style={{ maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setShowNewRequest(false)}><X size={20} /></button>
                        <div className="modal-header">
                            <h3 className="section-title">New Product Update Request</h3>
                            <span className="text-sm muted">Requested by you · {new Date().toLocaleDateString()}</span>
                        </div>

                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                            <div className="stack-md">
                                {/* Product Selection */}
                                <div className="panel p-16">
                                    <label className="label font-semibold mb-4">Select Product</label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        <input
                                            className="input-field"
                                            style={{ paddingLeft: 32, width: '100%' }}
                                            placeholder="Search by name or code..."
                                            value={productSearch}
                                            onChange={e => { setProductSearch(e.target.value); setSelectedProduct(null); setProposedChanges({}); }}
                                        />
                                        {searching && <Loader2 size={15} className="animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }} />}
                                    </div>
                                    {productResults.length > 0 && !selectedProduct && (
                                        <div className="dropdown mt-4" style={{ maxHeight: 200, overflowY: 'auto' }}>
                                            {productResults.map(p => (
                                                <div key={p.id} className="dropdown-item" role="button" tabIndex={0} onClick={() => selectProduct(p)}>
                                                    <div className="font-semibold text-sm">{p.name}</div>
                                                    <div className="muted text-xs">{p.product_code} · {p.company_name || '—'}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {selectedProduct && (
                                        <div className="mt-8 p-12" style={{ background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                            <div className="row space-between items-center">
                                                <div>
                                                    <span className="font-semibold">{selectedProduct.name}</span>
                                                    <span className="muted text-sm ml-8">({selectedProduct.product_code})</span>
                                                </div>
                                                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedProduct(null); setProposedChanges({}); setProductSearch(''); }}>
                                                    <X size={13} /> Change
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Priority + Notes */}
                                {selectedProduct && (
                                    <div className="row gap-sm">
                                        <div className="flex-1">
                                            <label className="label">Priority</label>
                                            <select className="input-field" value={requestPriority} onChange={e => setRequestPriority(e.target.value)} style={{ width: '100%' }}>
                                                <option value="Low">Low</option>
                                                <option value="Medium">Medium</option>
                                                <option value="High">High</option>
                                                <option value="Urgent">Urgent</option>
                                            </select>
                                        </div>
                                        <div className="flex-1">
                                            <label className="label">Notes (Optional)</label>
                                            <input className="input-field" value={requestNotes} onChange={e => setRequestNotes(e.target.value)} placeholder="Reason for change..." style={{ width: '100%' }} />
                                        </div>
                                    </div>
                                )}

                                {/* Edit Fields */}
                                {selectedProduct && (
                                    <div className="panel p-16">
                                        <div className="row space-between items-center mb-12">
                                            <h4 className="font-semibold">Edit Fields</h4>
                                            {changedFields.length > 0 && (
                                                <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 600 }}>
                                                    {changedFields.length} change{changedFields.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                        <div className="table-scroll">
                                            <table className="table" style={{ width: '100%' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '20%' }}>Field</th>
                                                        <th style={{ width: '35%' }}>Current</th>
                                                        <th style={{ width: '10%', textAlign: 'center' }}></th>
                                                        <th style={{ width: '35%' }}>New Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {FIELDS.map(f => {
                                                        const curr = selectedProduct[f.key];
                                                        const newVal = proposedChanges[f.key];
                                                        const changed = String(curr || '') !== String(newVal || '');
                                                        return (
                                                            <tr key={f.key}>
                                                                <td className="font-semibold text-sm">{f.label}</td>
                                                                <td style={{ color: 'var(--text-muted)' }}>{curr || '—'}</td>
                                                                <td style={{ textAlign: 'center' }}>
                                                                    {changed && <ArrowRight size={14} style={{ color: 'var(--warning)' }} />}
                                                                </td>
                                                                <td>
                                                                    <input
                                                                        className="input-field"
                                                                        style={{
                                                                            width: '100%',
                                                                            borderColor: changed ? 'var(--warning)' : 'var(--border)',
                                                                            background: changed ? 'var(--warning-bg)' : 'var(--surface)'
                                                                        }}
                                                                        value={newVal || ''}
                                                                        onChange={e => handleChange(f.key, e.target.value)}
                                                                    />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                        {!hasChanges && selectedProduct && (
                                            <div className="mt-8 p-12 text-center muted text-sm" style={{ background: 'var(--surface-2)', borderRadius: 8 }}>
                                                No changes yet — edit values above to submit a request
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedProduct && (
                            <div className="modal-footer row gap-sm justify-end border-top pt-12 mt-12">
                                <button className="btn btn-ghost" onClick={() => submitRequest('Draft')} disabled={submitting || !hasChanges}>
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save Draft
                                </button>
                                <button className="btn btn-primary" onClick={() => submitRequest('Pending')} disabled={submitting || !hasChanges}>
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit for Approval
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductRequests;
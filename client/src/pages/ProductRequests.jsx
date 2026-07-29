import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { X, Check, Eye, Loader2, Search, Save, Send, History, ArrowRight, Clock, AlertTriangle, FileText, AlertCircle, HelpCircle } from 'lucide-react';
import { useConfirm } from '../contexts/ConfirmContext';
import PageContainer from '../components/ui/PageContainer';
import useAuth from '../hooks/useAuth';

const STATUS_CONFIG = {
    draft: { color: 'var(--text-muted)', bg: 'var(--surface-2)', label: 'Draft', icon: FileText },
    pending: { color: 'var(--warning)', bg: 'var(--warning-bg)', label: 'Pending', icon: Clock },
    approved: { color: 'var(--success)', bg: 'var(--success-bg)', label: 'Approved', icon: Check },
    rejected: { color: 'var(--error)', bg: 'var(--error-bg)', label: 'Rejected', icon: X },
};

const FILTER_TABS = ['all', 'draft', 'pending', 'approved', 'rejected'];

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

    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin';
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
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        fetchRequests(filterStatus);
    }, [page, limit, filterStatus]);

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
            } catch (err) { setProductResults([]); }
            finally { setSearching(false); }
        }, 300);
        return () => clearTimeout(timer);
    }, [productSearch, showNewRequest]);

    const fetchRequests = async (status = 'all') => {
        setLoading(true);
        try {
            const params = { page, limit, status };
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

    const filteredRequests = useMemo(() =>
        requests.filter(r => filterStatus === 'all' || r.status === filterStatus),
        [requests, filterStatus]
    );

    return (
        <PageContainer>
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
                {FILTER_TABS.map(st => {
                    const isActive = filterStatus === st;
                    const sc = st !== 'all' ? STATUS_CONFIG[st] : null;
                    const Icon = sc?.icon || null;
                    const count = st === 'all' ? requests.length : requests.filter(r => r.status === st).length;
                    return (
                        <button
                            key={st}
                            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => { setFilterStatus(st); setPage(1); }}
                            style={{ position: 'relative' }}
                        >
                            {Icon && <Icon size={13} style={{ marginRight: 4 }} />}
                            {st === 'all' ? 'All' : sc.label}
                            <span className="badge" style={{
                                background: isActive ? 'rgba(255,255,255,0.2)' : (sc?.bg || 'var(--surface-2)'),
                                color: isActive ? '#fff' : (sc?.color || 'var(--text-muted)'),
                                marginLeft: 6,
                                fontSize: 11,
                                padding: '1px 6px'
                            }}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Requests list */}
            {loading ? (
                <div className="panel p-20 stack-sm">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="row gap-md items-center" style={{ padding: '12px 0', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
                            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ width: '40%', height: 14, borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 6 }} />
                                <div style={{ width: '25%', height: 12, borderRadius: 4, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            </div>
                            <div style={{ width: 70, height: 24, borderRadius: 12, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ width: 100, height: 28, borderRadius: 6, background: 'var(--surface-2)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="panel">
                    {filteredRequests.length === 0 ? (
                        <div className="p-32 text-center">
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                    {filterStatus === 'pending' ? <Clock size={28} style={{ opacity: 0.3 }} /> :
                                     filterStatus === 'approved' ? <Check size={28} style={{ opacity: 0.3 }} /> :
                                     filterStatus === 'rejected' ? <X size={28} style={{ opacity: 0.3 }} /> :
                                     filterStatus === 'draft' ? <FileText size={28} style={{ opacity: 0.3 }} /> :
                                 <FileText size={28} style={{ opacity: 0.3 }} />}
                            </div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                {filterStatus === 'all' ? 'No requests yet' : `No ${filterStatus.toLowerCase()} requests`}
                            </div>
                            <p className="muted text-sm" style={{ maxWidth: 300, margin: '0 auto' }}>
                                {filterStatus === 'all' ? 'Product update requests submitted by staff will appear here for review.' : `No requests with "${filterStatus}" status at the moment.`}
                            </p>
                            {filterStatus === 'all' && (
                                <button className="btn btn-primary mt-16" onClick={() => { setShowNewRequest(true); }}>
                                    <Send size={14} /> New Request
                                </button>
                            )}
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
                                    {filteredRequests.map(r => {
                                        const sc = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
                                        const StatusIcon = sc.icon;
                                        return (
                                            <tr key={r.id} className="table-row-hover">
                                                <td className="text-sm" style={{ color: 'var(--text-muted)' }}>#{r.id}</td>
                                                <td>
                                                    <span className="font-semibold">{r.product_name || `Product #${r.product_id}`}</span>
                                                    {r.priority && ['High', 'Urgent'].includes(r.priority) && (
                                                        <span className="badge ml-8" style={{ background: 'var(--error-bg)', color: 'var(--error)', fontSize: 10, padding: '1px 6px' }}>
                                                            {r.priority}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-sm">{r.requested_by_name || `Staff #${r.requested_by}`}</td>
                                                <td className="text-sm" style={{ whiteSpace: 'nowrap' }}>{new Date(r.requested_at).toLocaleString()}</td>
                                                <td>
                                                    <span className="badge row gap-4" style={{ background: sc.bg, color: sc.color, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                                                        <StatusIcon size={12} />
                                                        {sc.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="row gap-xs">
                                                        <button className="btn btn-ghost btn-sm" onClick={() => open(r)} title="View Details"><Eye size={14} /></button>
                                                        {isAdmin && r.status === 'Pending' && (
                                                            <>
                                                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }} onClick={() => review(r.id, 'reject')}><X size={14} /> Reject</button>
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
                    <div className="row space-between items-center p-12 border-top flex-wrap gap-sm">
                        <div className="row gap-xs items-center">
                            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>
                                Prev
                            </button>
                            <span className="muted text-sm px-8" style={{ fontWeight: 500 }}>{page}</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => p + 1)} disabled={!canNext || loading}>
                                Next
                            </button>
                            <span className="muted text-xs ml-4">({filteredRequests.length} shown)</span>
                        </div>
                        <div className="row gap-xs items-center">
                            <label className="muted text-xs">Per page:</label>
                            <select className="input-field" style={{ width: 72, padding: '4px 8px', fontSize: 12 }} value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}>
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
                    <div className="modal" style={{ maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div>
                                <h3 className="section-title">Request #{selected.id}</h3>
                                <span className="text-sm muted">{selected.product_name || `Product #${selected.product_id}`}</span>
                            </div>
                            <div className="row gap-sm items-center">
                                {(() => {
                                    const sc = STATUS_CONFIG[selected.status] || STATUS_CONFIG.draft;
                                    const Si = sc.icon;
                                    return (
                                        <span className="badge row gap-4" style={{ background: sc.bg, color: sc.color, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                                            <Si size={13} /> {sc.label}
                                        </span>
                                    );
                                })()}
                                <button className="modal-close" onClick={close}><X size={20} /></button>
                            </div>
                        </div>

                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>
                            <div className="row gap-md mt-16 mb-16 text-sm flex-wrap" style={{ color: 'var(--text-muted)' }}>
                                <span><Clock size={13} style={{ verticalAlign: 'middle' }} /> {new Date(selected.requested_at).toLocaleString()}</span>
                                <span>· By: {selected.requested_by_name || selected.requested_by}</span>
                                {selected.priority && (
                                    <span>· Priority: <span style={{
                                        color: selected.priority === 'Urgent' ? 'var(--error)' : selected.priority === 'High' ? 'var(--warning)' : 'inherit',
                                        fontWeight: 600
                                    }}>{selected.priority}</span></span>
                                )}
                                {selected.reviewed_by && <span>· Reviewed by: {selected.reviewed_by}</span>}
                            </div>

                            <div className="stack-md">
                                <div className="panel p-16">
                                    <div className="row space-between items-center mb-12">
                                        <h4 className="font-semibold">Changes</h4>
                                        {(() => {
                                            const changedCount = FIELDS.filter(f => {
                                                const curr = selected.current_data?.[f.key];
                                                const prop = selected.proposed_data?.[f.key];
                                                return String(curr || '') !== String(prop || '');
                                            }).length;
                                            return changedCount > 0 ? (
                                                <span className="badge" style={{ background: 'var(--warning-bg)', color: 'var(--warning)', fontWeight: 600 }}>
                                                    {changedCount} change{changedCount > 1 ? 's' : ''}
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>
                                    <div className="table-scroll">
                                        <table className="table" style={{ width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '20%' }}>Field</th>
                                                    <th style={{ width: '35%' }}>Current</th>
                                                    <th style={{ width: '10%' }}></th>
                                                    <th style={{ width: '35%' }}>Proposed</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {FIELDS.map(f => {
                                                    const curr = selected.current_data?.[f.key];
                                                    const prop = selected.proposed_data?.[f.key];
                                                    const changed = String(curr ?? '') !== String(prop ?? '');
                                                    if (!changed && !prop) return null;
                                                    return (
                                                        <tr key={f.key}>
                                                            <td className="font-semibold text-sm">{f.label}</td>
                                                            <td style={{ color: changed ? 'var(--text-muted)' : 'var(--text)' }}>
                                                                {curr ?? '—'}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                {changed && <ArrowRight size={14} style={{ color: 'var(--warning)' }} />}
                                                            </td>
                                                            <td style={{ color: changed ? 'var(--success)' : 'var(--text)', fontWeight: changed ? 600 : 400 }}>
                                                                {changed ? (prop ?? '—') : (curr ?? '—')}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {selected.notes && (
                                    <div className="panel p-16">
                                        <h4 className="font-semibold mb-4">Request Notes</h4>
                                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.notes}</p>
                                    </div>
                                )}

                                {selected.admin_note && (
                                    <div className="panel p-16" style={{ borderLeft: '3px solid var(--primary)' }}>
                                        <h4 className="font-semibold mb-4">Admin Response</h4>
                                        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.admin_note}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            {isAdmin && selected.status === 'Pending' && (
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
                                                <div key={p.id} className="dropdown-item" role="button" tabIndex={0} onClick={() => selectProduct(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProduct(p); } }}>
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
                                                                        background: changed ? 'var(--warning-bg)' : 'var(--surface)',
                                                                        transition: 'border-color var(--transition-fast), background var(--transition-fast)'
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
                            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
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
        </PageContainer>
    );
};

export default ProductRequests;
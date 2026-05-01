import React, { useEffect, useState } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { X, Check, Eye, Loader2 } from 'lucide-react';
import SecureImage from '../components/SecureImage';
import { useConfirm } from '../contexts/ConfirmContext';

const ProductRequests = () => {
    const { confirm } = useConfirm();
    const [loading, setLoading] = useState(false);
    const [requests, setRequests] = useState([]);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [selected, setSelected] = useState(null);
    const [reviewing, setReviewing] = useState(false);

    useEffect(() => {
        fetchRequests();
    }, [page, limit]);

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const res = await api.get('/products/update-requests', { params: { status: 'pending', page, limit } });
            setRequests(Array.isArray(res.data) ? res.data : res.data?.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load requests');
        } finally {
            setLoading(false);
        }
    };

    const open = (r) => setSelected(r);
    const close = () => setSelected(null);

    const review = async (id, action, note) => {
        const confirmObj = await confirm({
            title: action === 'approve' ? 'Approve update' : 'Reject update',
            message: action === 'approve' ? 'Apply this update to the product now?' : 'Reject this request?',
            confirmText: action === 'approve' ? 'Approve' : 'Reject',
            type: action === 'approve' ? 'primary' : 'danger'
        });
        if (!confirmObj) return;
        setReviewing(true);
        try {
            await api.patch(`/products/update-requests/${id}`, { action, note });
            toast.success(action === 'approve' ? 'Approved and applied' : 'Rejected');
            fetchRequests();
            close();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to review');
        } finally {
            setReviewing(false);
        }
    };

    const canNext = requests.length === limit;

    return (
        <div>
            <div className="row space-between items-center mb-12">
                <h2 className="section-title">Product Update Requests</h2>
            </div>

            {loading ? (
                <div className="card p-16"><Loader2 className="animate-spin" /> Loading…</div>
            ) : (
                <div className="card p-0">
                    {requests.length === 0 ? (
                        <div className="p-16 muted">No pending requests.</div>
                    ) : (
                        <div>
                            <div className="table">
                                <div className="table-row table-row--head">
                                    <div className="table-cell">ID</div>
                                    <div className="table-cell">Product</div>
                                    <div className="table-cell">Requested By</div>
                                    <div className="table-cell">Requested At</div>
                                    <div className="table-cell">Actions</div>
                                </div>
                                {requests.map(r => (
                                    <div className="table-row" key={r.id}>
                                        <div className="table-cell">{r.id}</div>
                                        <div className="table-cell">{r.product_name || `#${r.product_id}`}</div>
                                        <div className="table-cell">{r.requested_by_name || r.requested_by}</div>
                                        <div className="table-cell">{new Date(r.requested_at).toLocaleString()}</div>
                                        <div className="table-cell">
                                            <div className="row gap-sm">
                                                <button className="btn btn-ghost btn-sm" onClick={() => open(r)} title="View"><Eye size={14} /></button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => review(r.id, 'reject')}><X size={14} /> Reject</button>
                                                <button className="btn btn-primary btn-sm" onClick={() => review(r.id, 'approve')}><Check size={14} /> Approve</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Pagination controls */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}>
                                <div className="row gap-sm" style={{ alignItems: 'center' }}>
                                    <button className="btn btn-ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1 || loading}>Prev</button>
                                    <button className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={!canNext || loading}>Next</button>
                                    <div className="muted text-sm" style={{ marginLeft: 8 }}>Page {page}</div>
                                </div>
                                <div className="row gap-sm" style={{ alignItems: 'center' }}>
                                    <label className="muted text-sm">Per page:</label>
                                    <select className="input" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                    <div className="muted text-sm">{requests.length} shown</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selected && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: 900 }}>
                        <button className="modal-close" onClick={close}><X size={20} /></button>
                        <h3 className="section-title">Request #{selected.id} — {selected.product_name || `#${selected.product_id}`}</h3>
                        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                            <div style={{ flex: 1 }}>
                                <strong>Current</strong>
                                <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>{JSON.stringify(selected.current_data, null, 2)}</pre>
                            </div>
                            <div style={{ flex: 1 }}>
                                <strong>Proposed</strong>
                                <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>{JSON.stringify(selected.proposed_data, null, 2)}</pre>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button className="btn btn-ghost" onClick={() => review(selected.id, 'reject')}>Reject</button>
                            <button className="btn btn-primary" onClick={() => review(selected.id, 'approve')}>Approve & Apply</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductRequests;

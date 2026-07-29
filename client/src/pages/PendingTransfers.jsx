import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle, X, RefreshCcw, Search, AlertCircle } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';
import auth from '../services/auth';

const PendingTransfers = () => {
    useSEO('Pending Transfers');

    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
    const myBranchId = user?.branch_id;

    const [loading, setLoading] = useState(true);
    const [receiving, setReceiving] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [filterBranch, setFilterBranch] = useState(isAdmin ? '' : myBranchId);
    const [receiveQty, setReceiveQty] = useState({});

    const fetchTransfers = async () => {
        setLoading(true);
        try {
            const params = { status: 'in_transit', limit: 100 };
            if (filterBranch) params.branch_id = filterBranch;
            const [transfersRes, branchesRes] = await Promise.all([
                api.get('/stock-transfers', { params }),
                api.get('/branches')
            ]);
            setTransfers(transfersRes.data.data || []);
            setBranches(branchesRes.data);
        } catch {
            toast.error('Failed to load transfers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransfers();
    }, [filterBranch]);

    const handleReceive = async (transfer) => {
        const qty = receiveQty[transfer.id] !== undefined ? receiveQty[transfer.id] : transfer.qty_dispatched;
        if (!qty || Number(qty) <= 0) {
            return toast.error('Enter a valid received quantity');
        }
        setReceiving(transfer.id);
        try {
            const res = await api.post(`/stock-transfers/${transfer.id}/receive`, {
                qty_received: Number(qty)
            });
            if (res.data.discrepancy) {
                toast.success(`Received with discrepancy (dispatch: ${res.data.qty_dispatched}, received: ${res.data.qty_received})`);
            } else {
                toast.success('Transfer received successfully');
            }
            fetchTransfers();
            setReceiveQty(prev => ({ ...prev, [transfer.id]: undefined }));
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to confirm receipt');
        } finally {
            setReceiving(null);
        }
    };

    const canReceive = (transfer) => {
        if (!transfer) return false;
        if (isAdmin) return true;
        return Number(myBranchId) === Number(transfer.to_branch_id);
    };

    return (
        <PageContainer>
            <div className="row items-center gap-md">
                <div>
                    <h1 className="section-title">Pending Transfers</h1>
                    <p className="section-subtitle">Transfers awaiting receipt confirmation.</p>
                </div>
                <div className="ml-auto row gap-xs items-center">
                    <div className="inv-chip">
                        <select className="input-field"
                            value={filterBranch}
                            onChange={e => setFilterBranch(e.target.value)}>
                            <option value="">All Branches</option>
                            {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={fetchTransfers}>
                        <RefreshCcw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center p-xl">
                    <RefreshCcw className="animate-spin muted" size={32} />
                </div>
            ) : transfers.length === 0 ? (
                <div className="panel text-center p-xl muted">
                    <Truck size={40} className="mb-md" style={{ opacity: 0.3 }} />
                    <div>No pending transfers found.</div>
                </div>
            ) : (
                <div className="stack-md">
                    {transfers.map(transfer => (
                        <div key={transfer.id} className="panel">
                            <div className="row space-between items-start">
                                <div className="stack-xs">
                                    <div className="row items-center gap-sm">
                                        <span className="font-bold">Transfer #{transfer.id}</span>
                                        <span className={`inv-pill ${transfer.status === 'in_transit' ? 'inv-pill--low' : 'inv-pill--ok'}`}>
                                            {transfer.status}
                                        </span>
                                    </div>
                                    <div className="text-sm muted">
                                        {transfer.size_name} {transfer.gsm ? `${transfer.gsm} GSM` : ''} ({transfer.category})
                                    </div>
                                    <div className="text-sm">
                                        <strong>{Number(transfer.qty_dispatched).toLocaleString()}</strong> sheets dispatched
                                        {transfer.from_branch_name && (
                                            <> from <strong>{transfer.from_branch_name}</strong></>
                                        )}
                                        {transfer.to_branch_name && (
                                            <> to <strong>{transfer.to_branch_name}</strong>
                                        </>)}
                                    </div>
                                    {transfer.dispatched_at && (
                                        <div className="text-xs muted">
                                            Dispatched: {new Date(transfer.dispatched_at).toLocaleString()}
                                            {transfer.dispatched_by_name && <> by {transfer.dispatched_by_name}</>}
                                        </div>
                                    )}
                                </div>

                                {canReceive(transfer) && (
                                    <div className="stack-xs" style={{ minWidth: 200, textAlign: 'right' }}>
                                        <div className="row gap-xs items-center">
                                            <input type="number" step="any" min="0"
                                                className="input-field"
                                                style={{ width: 120 }}
                                                placeholder={`Received qty`}
                                                value={receiveQty[transfer.id] !== undefined ? receiveQty[transfer.id] : transfer.qty_dispatched}
                                                onChange={e => setReceiveQty(prev => ({ ...prev, [transfer.id]: e.target.value }))} />
                                            <button className="btn btn-primary btn-sm"
                                                disabled={receiving === transfer.id}
                                                onClick={() => handleReceive(transfer)}>
                                                {receiving === transfer.id
                                                    ? <RefreshCcw className="animate-spin" size={14} />
                                                    : <CheckCircle size={14} />}
                                                Confirm
                                            </button>
                                        </div>
                                        {receiveQty[transfer.id] !== undefined && Number(receiveQty[transfer.id]) !== Number(transfer.qty_dispatched) && (
                                            <div className="text-xs text-warning mt-4 row items-center gap-xs justify-end">
                                                <AlertCircle size={12} />
                                                Dispatched: {Number(transfer.qty_dispatched)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </PageContainer>
    );
};

export default PendingTransfers;

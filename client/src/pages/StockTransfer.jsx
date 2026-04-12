import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, ArrowRight, Building2, Search, History, Loader2, 
  ChevronRight, AlertCircle, CheckCircle2, QrCode, SendIcon, 
  Inbox, Clock, CheckCircle, XCircle, Plus, ArrowDownLeft, ArrowUpRight, 
  Truck, CheckSquare
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';

const StockTransfer = () => {
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
    const myBranchId = user?.branch_id;

    const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history' | 'requests'
    const [transferMode, setTransferMode] = useState(isAdmin ? 'direct' : 'request');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Master data
    const [branches, setBranches] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [history, setHistory] = useState([]);
    const [requests, setRequests] = useState([]); // All active/pending requests

    // Form state
    const [selectedItem, setSelectedItem] = useState(null);
    const [fromBranchId, setFromBranchId] = useState(isAdmin ? '' : myBranchId);
    const [toBranchId, setToBranchId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Availability data
    const [branchStockMap, setBranchStockMap] = useState({});

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const [branchRes, invRes] = await Promise.all([
                api.get('/branches'),
                api.get('/inventory', { params: { limit: 1000 } })
            ]);
            setBranches(branchRes.data || []);
            setInventory(invRes.data?.data || invRes.data || []);
        } catch (err) {
            toast.error('Failed to load initial data');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllData = async () => {
        try {
            const res = await api.get('/stock-requests'); 
            const data = res.data || [];
            setHistory(data);
            // Requests tab only shows non-finalized ones
            setRequests(data.filter(r => r.status !== 'Received' && r.status !== 'Rejected'));
        } catch (err) {
            console.error('Data fetch failed', err);
        }
    };

    useEffect(() => {
        if (activeTab === 'history' || activeTab === 'requests') fetchAllData();
    }, [activeTab]);

    useEffect(() => {
        if (selectedItem) {
            fetchBranchAvailability(selectedItem.id);
        } else {
            setBranchStockMap({});
        }
    }, [selectedItem]);

    const fetchBranchAvailability = async (itemId) => {
        try {
            const res = await api.get(`/branch-stock/${itemId}`);
            const map = res.data.reduce((acc, curr) => {
                acc[curr.branch_id] = curr.quantity;
                return acc;
            }, {});
            setBranchStockMap(map);
        } catch (err) {
            console.error('Failed to fetch branch stock', err);
        }
    };

    const filteredInventory = useMemo(() => {
        if (!searchQuery) return [];
        return inventory.filter(item => 
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()))
        ).slice(0, 10);
    }, [inventory, searchQuery]);

    const handleAction = async () => {
        if (!selectedItem) { toast.error('Please select an item'); return; }
        if (!toBranchId) { toast.error('Please select destination branch'); return; }
        if (transferMode === 'direct' && !fromBranchId) { toast.error('Please select source branch'); return; }
        if (transferMode === 'direct' && fromBranchId === toBranchId) { toast.error('Source and destination cannot be the same'); return; }
        if (!quantity || Number(quantity) <= 0) { toast.error('Enter a valid quantity'); return; }

        if (transferMode === 'direct') {
            const availableAtSource = branchStockMap[fromBranchId] || 0;
            if (Number(quantity) > availableAtSource) {
                toast.error(`Insufficient stock at source. Available: ${availableAtSource}`);
                return;
            }
        }

        setSaving(true);
        try {
            if (transferMode === 'direct') {
                await api.post('/inventory/transfer', {
                    inventory_item_id: selectedItem.id,
                    from_branch_id: fromBranchId,
                    to_branch_id: toBranchId,
                    quantity: Number(quantity),
                    notes
                });
                toast.success('Stock transferred successfully');
            } else {
                await api.post('/stock-requests', {
                    inventory_item_id: selectedItem.id,
                    to_branch_id: toBranchId,
                    quantity: Number(quantity),
                    notes
                });
                toast.success('Stock request initiated');
            }
            
            // Reset form
            setSelectedItem(null);
            setSearchQuery('');
            setQuantity('');
            setNotes('');
            setActiveTab('requests');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Operation failed');
        } finally {
            setSaving(false);
        }
    };

    // Request Processing Actions
    const approveRequest = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/approve`, { action: 'approve' });
            toast.success('Request approved');
            fetchAllData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to approve'); }
    }

    const rejectRequest = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/approve`, { action: 'reject' });
            toast.success('Request rejected');
            fetchAllData();
        } catch (e) { toast.error('Failed to reject'); }
    }

    const sendStock = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/send`);
            toast.success('Goods dispatched. Source stock updated.');
            fetchAllData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to send goods'); }
    }

    const receiveStock = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/receive`);
            toast.success('Goods received. Destination stock updated.');
            fetchAllData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to receive goods'); }
    }

    if (loading) return <div className="panel flex-center" style={{ minHeight: 400 }}><Loader2 className="animate-spin" size={32} /></div>;

    const inboundReqs = requests.filter(r => String(r.to_branch_id) === String(myBranchId));
    const outboundReqs = requests.filter(r => String(r.from_branch_id) === String(myBranchId));

    const getStatusBadge = (status) => {
        let color = 'var(--muted)';
        if (status === 'Pending') color = 'var(--warning)';
        if (status === 'Approved') color = 'var(--primary)';
        if (status === 'Sent') color = '#6366f1';
        if (status === 'Received') color = 'var(--success)';
        if (status === 'Rejected') color = 'var(--danger)';
        
        return <div className="badge" style={{ backgroundColor: color, color: 'white', fontWeight: 700 }}>{status}</div>;
    };

    return (
        <div className="stack-lg">
            <div className="panel appearance-none" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none', padding: '24px 32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="stack-xs">
                        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 14 }}>
                            <Package size={32} /> Stock Hub
                        </h1>
                        <p style={{ opacity: 0.9, margin: 0, fontSize: '1rem' }}>Request, Transfer and track inventory across all branches</p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 12, backgroundColor: 'var(--bg-secondary)', padding: 6, borderRadius: 16, width: 'fit-content', border: '1px solid var(--border)' }}>
                <button 
                    className={`btn ${activeTab === 'new' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 12, padding: '10px 24px', flex: 1, minWidth: 150, display: 'flex', gap: 10, fontWeight: 700 }}
                    onClick={() => setActiveTab('new')}
                >
                    <Plus size={18} /> New Movement
                </button>
                <button 
                    className={`btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 12, padding: '10px 24px', flex: 1, minWidth: 150, display: 'flex', gap: 10, fontWeight: 700 }}
                    onClick={() => setActiveTab('requests')}
                >
                    <Inbox size={18} /> Requests 
                    {(inboundReqs.length + outboundReqs.length) > 0 && <span className="side-badge" style={{ position: 'static', marginLeft: 4 }}>{inboundReqs.length + outboundReqs.length}</span>}
                </button>
                <button 
                    className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'}`} 
                    style={{ borderRadius: 12, padding: '10px 24px', flex: 1, minWidth: 150, display: 'flex', gap: 10, fontWeight: 700 }}
                    onClick={() => setActiveTab('history')}
                >
                    <History size={18} /> History
                </button>
            </div>

            {activeTab === 'new' ? (
                <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>
                    <div className="stack-md">
                        <div className="panel stack-md" style={{ borderTop: '4px solid var(--primary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Search size={18} /> Select Item
                                </h3>
                                
                                <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', padding: 4, borderRadius: 10, gap: 4 }}>
                                    <button 
                                        className={`btn btn-xs ${transferMode === 'request' ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => setTransferMode('request')}
                                    >
                                        Initiate Request
                                    </button>
                                    {isAdmin && (
                                        <button 
                                            className={`btn btn-xs ${transferMode === 'direct' ? 'btn-primary' : 'btn-ghost'}`}
                                            onClick={() => setTransferMode('direct')}
                                        >
                                            Instant Transfer
                                        </button>
                                    )}
                                </div>
                            </div>
                            
                            <div style={{ position: 'relative' }}>
                                <input 
                                    className="input-field" 
                                    style={{ paddingLeft: 40, height: 48, fontSize: '1rem' }}
                                    placeholder="Search by name or SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <Search size={20} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                            </div>

                            {searchQuery && !selectedItem && (
                                <div className="panel stack-xs" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    {filteredInventory.length === 0 ? (
                                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)' }}>No items found</div>
                                    ) : filteredInventory.map(item => (
                                        <div 
                                            key={item.id} 
                                            className="nav-item-inner" 
                                            style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                                            onClick={() => { setSelectedItem(item); setSearchQuery(item.name); }}
                                        >
                                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>SKU: {item.sku || 'N/A'} • Global: {item.quantity} {item.unit}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedItem && (
                                <div className="stack-md fade-in">
                                    <div className="panel appearance-none" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--primary)', padding: 16 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <div>
                                                <div className="badge badge-primary" style={{ marginBottom: 6 }}>{selectedItem.sku || 'NO SKU'}</div>
                                                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{selectedItem.name}</div>
                                            </div>
                                            <button className="btn btn-ghost btn-icon" onClick={() => setSelectedItem(null)}><XCircle size={16} /></button>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                        <div className="stack-xs" style={{ opacity: transferMode === 'request' ? 0.6 : 1 }}>
                                            <label className="label">Source Branch</label>
                                            <select 
                                                className="input-field" 
                                                value={fromBranchId} 
                                                onChange={e => setFromBranchId(e.target.value)}
                                                disabled={!isAdmin || transferMode === 'request'}
                                            >
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name} (Qty: {branchStockMap[b.id] || 0})</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="stack-xs">
                                            <label className="label">{transferMode === 'direct' ? 'Destination Branch' : 'Request From Branch'}</label>
                                            <select 
                                                className="input-field" 
                                                value={toBranchId} 
                                                onChange={e => setToBranchId(e.target.value)}
                                            >
                                                <option value="">Select branch...</option>
                                                {branches.filter(b => String(b.id) !== String(myBranchId)).map(b => (
                                                    <option key={b.id} value={b.id}>{b.name} (Avail: {branchStockMap[b.id] || 0})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 20 }}>
                                        <div className="stack-xs">
                                            <label className="label">Quantity</label>
                                            <input type="number" className="input-field" style={{ height: 48, fontSize: '1.1rem', fontWeight: 700 }} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
                                        </div>
                                        <div className="stack-xs">
                                            <label className="label">Description / Purpose</label>
                                            <input className="input-field" style={{ height: 48 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for transfer..." />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="stack-md" style={{ position: 'sticky', top: 20 }}>
                        <div className="panel stack-md" style={{ borderTop: '4px solid var(--primary)' }}>
                             <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Summary</h3>
                             {!selectedItem ? (
                                 <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)' }}><Package size={40} style={{ opacity: 0.2, marginBottom: 12 }} /><div>Select item to proceed</div></div>
                             ) : (
                                 <div className="stack-md">
                                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                                         <div style={{ textAlign: 'center', flex: 1 }}>
                                             <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>{transferMode === 'direct' ? 'FORM' : 'REQUESTER'}</div>
                                             <div style={{ fontWeight: 700 }}>{branches.find(b => String(b.id) === String(myBranchId))?.short_name || '...'}</div>
                                         </div>
                                         <ArrowRight size={20} style={{ opacity: 0.5, transform: transferMode === 'request' ? 'rotate(180deg)' : 'none' }} />
                                         <div style={{ textAlign: 'center', flex: 1 }}>
                                             <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)' }}>{transferMode === 'direct' ? 'TARGET' : 'SOURCE'}</div>
                                             <div style={{ fontWeight: 700 }}>{branches.find(b => String(b.id) === String(toBranchId))?.short_name || '...'}</div>
                                         </div>
                                     </div>
                                     <button 
                                         className={`btn ${transferMode === 'direct' ? 'btn-primary' : 'btn-warning'}`} 
                                         style={{ width: '100%', height: 52, fontWeight: 700 }}
                                         disabled={saving || !selectedItem || !toBranchId || !quantity}
                                         onClick={handleAction}
                                     >
                                         {saving ? <Loader2 className="animate-spin" /> : (transferMode === 'direct' ? <CheckCircle2 size={18} /> : <SendIcon size={18} />)}
                                         <span style={{ marginLeft: 8 }}>{transferMode === 'direct' ? 'Execute Instant Transfer' : 'Submit Stock Request'}</span>
                                     </button>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'requests' ? (
                <div className="stack-lg fade-in">
                    {/* Inbound Section */}
                    <div className="panel stack-md" style={{ borderLeft: '4px solid var(--primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <ArrowDownLeft size={24} style={{ color: 'var(--primary)' }} />
                                <h3 style={{ margin: 0 }}>Incoming Requests (Action Required)</h3>
                            </div>
                            <div className="badge badge-primary">{inboundReqs.length} Pending</div>
                        </div>
                        
                        <div className="table-scroll">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Item</th><th>From Branch</th><th>Qty</th><th>Status</th><th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inboundReqs.length === 0 ? (
                                        <tr><td colSpan="5" className="text-center muted">No incoming requests from other branches</td></tr>
                                    ) : inboundReqs.map(req => (
                                        <tr key={req.id}>
                                            <td><div style={{ fontWeight: 600 }}>{req.item_name}</div><div className="text-xs muted">{req.item_sku}</div></td>
                                            <td><div className="badge badge-ghost">{req.from_branch_name}</div></td>
                                            <td style={{ fontWeight: 700 }}>{req.quantity}</td>
                                            <td>{getStatusBadge(req.status)}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    {req.status === 'Pending' && (
                                                        <>
                                                            <button className="btn btn-xs btn-primary" onClick={() => approveRequest(req.id)}>Accept</button>
                                                            <button className="btn btn-xs btn-ghost text-error" onClick={() => rejectRequest(req.id)}>Reject</button>
                                                        </>
                                                    )}
                                                    {req.status === 'Approved' && (
                                                        <button className="btn btn-xs btn-warning" onClick={() => sendStock(req.id)} style={{ display: 'flex', gap: 4 }}>
                                                            <Truck size={14} /> Send Goods
                                                        </button>
                                                    )}
                                                    {req.status === 'Sent' && <span className="text-xs muted">Waiting for delivery confirmation...</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Outbound Section */}
                    <div className="panel stack-md" style={{ borderLeft: '4px solid var(--warning)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                             <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <ArrowUpRight size={24} style={{ color: 'var(--warning)' }} />
                                <h3 style={{ margin: 0 }}>Outgoing Requests (Sent by You)</h3>
                             </div>
                             <div className="badge badge-warning">{outboundReqs.length} Sent</div>
                        </div>

                        <div className="table-scroll">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Item</th><th>To Branch</th><th>Qty</th><th>Status</th><th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {outboundReqs.length === 0 ? (
                                        <tr><td colSpan="5" className="text-center muted">You haven't requested any stock recently</td></tr>
                                    ) : outboundReqs.map(req => (
                                        <tr key={req.id}>
                                            <td><div style={{ fontWeight: 600 }}>{req.item_name}</div><div className="text-xs muted">{req.item_sku}</div></td>
                                            <td><div className="badge badge-ghost">{req.to_branch_name}</div></td>
                                            <td style={{ fontWeight: 700 }}>{req.quantity}</td>
                                            <td>{getStatusBadge(req.status)}</td>
                                            <td>
                                                {req.status === 'Sent' ? (
                                                    <button className="btn btn-xs btn-success" onClick={() => receiveStock(req.id)} style={{ display: 'flex', gap: 4 }}>
                                                        <CheckSquare size={14} /> Confirm Receipt
                                                    </button>
                                                ) : <span className="text-xs muted">Awaiting {req.status === 'Pending' ? 'Approval' : 'Dispatch'}...</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="panel stack-md fade-in">
                    <h3 style={{ margin: 0 }}>Movement History (Finalized)</h3>
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr><th>Date</th><th>Item</th><th>Path</th><th>Qty</th><th>Final State</th><th>In-Charge</th></tr>
                            </thead>
                            <tbody>
                                {history.length === 0 ? (
                                    <tr><td colSpan="6" className="text-center muted">No transaction history found</td></tr>
                                ) : history.map(item => (
                                    <tr key={item.id}>
                                        <td className="text-sm">{new Date(item.created_at).toLocaleDateString()}</td>
                                        <td><div style={{ fontWeight: 600 }}>{item.item_name}</div></td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.85rem' }}>
                                                <span className="badge badge-ghost" style={{ background: 'var(--bg-secondary)' }}>{item.to_branch_short_name || item.to_branch_name}</span>
                                                <ArrowRight size={12} />
                                                <span className="badge badge-ghost" style={{ background: 'var(--bg-secondary)' }}>{item.from_branch_short_name || item.from_branch_name}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 700 }}>{item.quantity}</td>
                                        <td>{getStatusBadge(item.status)}</td>
                                        <td className="text-sm">{item.created_by_name}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockTransfer;

import { useSEO } from '../hooks/useSEO';
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
import './StockTransfer.css';

import BranchSelect from '../components/ui/BranchSelect';
const StockTransfer = () => {
    useSEO('Stock Transfer');

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
        if (status === 'Sent') color = 'var(--primary)';
        if (status === 'Received') color = 'var(--success)';
        if (status === 'Rejected') color = 'var(--danger)';
        
        return <div className="badge" style={{ backgroundColor: color, color: 'white', fontWeight: 700 }}>{status}</div>;
    };

    return (
        <div className="stack-lg">
            <div className="stock-hub-header">
                <div className="stock-hub-header__content">
                    <h1><Package size={32} /> Stock Hub</h1>
                    <p>Request, Transfer and track inventory across all branches</p>
                </div>
            </div>

            <div className="stock-hub-tabs">
                <button 
                    className={`btn ${activeTab === 'new' ? 'btn-primary' : 'btn-ghost'} stock-hub-tab`} 
                    onClick={() => setActiveTab('new')}
                >
                    <Plus size={18} /> New Movement
                </button>
                <button 
                    className={`btn ${activeTab === 'requests' ? 'btn-primary' : 'btn-ghost'} stock-hub-tab`} 
                    onClick={() => setActiveTab('requests')}
                >
                    <Inbox size={18} /> Requests 
                    {(inboundReqs.length + outboundReqs.length) > 0 && <span className="side-badge side-badge--static">{inboundReqs.length + outboundReqs.length}</span>}
                </button>
                <button 
                    className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-ghost'} stock-hub-tab`} 
                    onClick={() => setActiveTab('history')}
                >
                    <History size={18} /> History
                </button>
            </div>

            {activeTab === 'new' ? (
                <div className="fade-in stock-hub-grid">
                    <div className="stack-md">
                        <div className="panel stack-md panel--primary-border">
                            <div className="panel-header panel-header--with-actions">
                                <h3><Search size={18} /> Select Item</h3>
                                
                                <div className="mode-switch">
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
                            
                            <div className="search-input-wrapper">
                                <input 
                                    className="input-field input-field--with-icon" 
                                    placeholder="Search by name or SKU..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <Search size={20} className="search-input-icon" />
                            </div>

                            {searchQuery && !selectedItem && (
                                <div className="panel stack-xs panel--dropdown">
                                    {filteredInventory.length === 0 ? (
                                        <div className="empty-state">No items found</div>
                                    ) : filteredInventory.map(item => (
                                        <div role="button" tabIndex={0} key={item.id} 
                                            className="dropdown-item"
                                            onClick={() => { setSelectedItem(item); setSearchQuery(item.name); }}
                                        >
                                            <div className="dropdown-item__name">{item.name}</div>
                                            <div className="dropdown-item__meta">SKU: {item.sku || 'N/A'} • Global: {item.quantity} {item.unit}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {selectedItem && (
                                <div className="stack-md fade-in">
                                    <div className="panel panel--selected-item">
                                        <div className="selected-item-header">
                                            <div>
                                                <div className="badge badge-primary">{selectedItem.sku || 'NO SKU'}</div>
                                                <div className="selected-item-name">{selectedItem.name}</div>
                                            </div>
                                            <button className="btn btn-ghost btn-icon" onClick={() => setSelectedItem(null)}><XCircle size={16} /></button>
                                        </div>
                                    </div>

                                    <div className="form-row form-row--2">
                                        <div className="stack-xs" style={{ opacity: transferMode === 'request' ? 0.6 : 1 }}>
                                            <label className="label">Source Branch</label>
                                            <BranchSelect 
                                                className="input-field" 
                                                value={fromBranchId} 
                                                onChange={e => setFromBranchId(e.target.value)}
                                                disabled={!isAdmin || transferMode === 'request'}
                                            >
                                                {branches.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name} (Qty: {branchStockMap[b.id] || 0})</option>
                                                ))}
                                            </BranchSelect>
                                        </div>

                                        <div className="stack-xs">
                                            <label className="label">{transferMode === 'direct' ? 'Destination Branch' : 'Request From Branch'}</label>
                                            <BranchSelect 
                                                className="input-field" 
                                                value={toBranchId} 
                                                onChange={e => setToBranchId(e.target.value)}
                                            >
                                                <option value="">Select branch...</option>
                                                {branches.filter(b => String(b.id) !== String(myBranchId)).map(b => (
                                                    <option key={b.id} value={b.id}>{b.name} (Avail: {branchStockMap[b.id] || 0})</option>
                                                ))}
                                            </BranchSelect>
                                        </div>
                                    </div>

                                    <div className="form-row form-row--quantity">
                                        <div className="stack-xs">
                                            <label className="label">Quantity</label>
                                            <input type="number" className="input-field input-field--quantity" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
                                        </div>
                                        <div className="stack-xs">
                                            <label className="label">Description / Purpose</label>
                                            <input className="input-field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for transfer..." />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="stack-md summary-panel">
                        <div className="panel stack-md panel--primary-border">
                             <h3>Summary</h3>
                             {!selectedItem ? (
                                 <div className="summary-empty"><Package size={40} /><div>Select item to proceed</div></div>
                             ) : (
                                 <div className="stack-md">
                                     <div className="transfer-path">
                                         <div className="transfer-path__node">
                                             <div className="transfer-path__label">{transferMode === 'direct' ? 'FROM' : 'REQUESTER'}</div>
                                             <div className="transfer-path__value">{branches.find(b => String(b.id) === String(myBranchId))?.short_name || '...'}</div>
                                         </div>
                                         <ArrowRight size={20} className="transfer-path__arrow" style={{ transform: transferMode === 'request' ? 'rotate(180deg)' : 'none' }} />
                                         <div className="transfer-path__node">
                                             <div className="transfer-path__label">{transferMode === 'direct' ? 'TARGET' : 'SOURCE'}</div>
                                             <div className="transfer-path__value">{branches.find(b => String(b.id) === String(toBranchId))?.short_name || '...'}</div>
                                         </div>
                                     </div>
                                     <button 
                                         className={`btn ${transferMode === 'direct' ? 'btn-primary' : 'btn-warning'} btn--full btn--large`} 
                                         disabled={saving || !selectedItem || !toBranchId || !quantity}
                                         onClick={handleAction}
                                     >
                                         {saving ? <Loader2 className="animate-spin" /> : (transferMode === 'direct' ? <CheckCircle2 size={18} /> : <SendIcon size={18} />)}
                                         <span>{transferMode === 'direct' ? 'Execute Instant Transfer' : 'Submit Stock Request'}</span>
                                     </button>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'requests' ? (
                <div className="stack-lg fade-in">
                    {/* Inbound Section */}
                    <div className="panel stack-md panel--left-border-primary">
                        <div className="panel-header panel-header--with-badge">
                            <div className="panel-header__left">
                                <ArrowDownLeft size={24} className="icon-primary" />
                                <h3>Incoming Requests (Action Required)</h3>
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
                                        <tr><td colSpan={5} className="text-center muted">No incoming requests from other branches</td></tr>
                                    ) : inboundReqs.map(req => (
                                        <tr key={req.id}>
                                            <td><div className="font-semibold">{req.item_name}</div><div className="text-xs muted">{req.item_sku}</div></td>
                                            <td><div className="badge badge-ghost">{req.from_branch_name}</div></td>
                                            <td className="font-bold">{req.quantity}</td>
                                            <td>{getStatusBadge(req.status)}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    {req.status === 'Pending' && (
                                                        <>
                                                            <button className="btn btn-xs btn-primary" onClick={() => approveRequest(req.id)}>Accept</button>
                                                            <button className="btn btn-xs btn-ghost text-error" onClick={() => rejectRequest(req.id)}>Reject</button>
                                                        </>
                                                    )}
                                                    {req.status === 'Approved' && (
                                                        <button className="btn btn-xs btn-warning btn-with-icon" onClick={() => sendStock(req.id)}>
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
                    <div className="panel stack-md panel--left-border-warning">
                        <div className="panel-header panel-header--with-badge">
                             <div className="panel-header__left">
                                <ArrowUpRight size={24} className="icon-warning" />
                                <h3>Outgoing Requests (Sent by You)</h3>
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
                                        <tr><td colSpan={5} className="text-center muted">You haven't requested any stock recently</td></tr>
                                    ) : outboundReqs.map(req => (
                                        <tr key={req.id}>
                                            <td><div className="font-semibold">{req.item_name}</div><div className="text-xs muted">{req.item_sku}</div></td>
                                            <td><div className="badge badge-ghost">{req.to_branch_name}</div></td>
                                            <td className="font-bold">{req.quantity}</td>
                                            <td>{getStatusBadge(req.status)}</td>
                                            <td>
                                                {req.status === 'Sent' ? (
                                                    <button className="btn btn-xs btn-success btn-with-icon" onClick={() => receiveStock(req.id)}>
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
                    <h3>Movement History (Finalized)</h3>
                    <div className="table-scroll">
                        <table className="table">
                            <thead>
                                <tr><th>Date</th><th>Item</th><th>Path</th><th>Qty</th><th>Final State</th><th>In-Charge</th></tr>
                            </thead>
                            <tbody>
                                {history.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center muted">No transaction history found</td></tr>
                                ) : history.map(item => (
                                    <tr key={item.id}>
                                        <td className="text-sm">{new Date(item.created_at).toLocaleDateString()}</td>
                                        <td><div className="font-semibold">{item.item_name}</div></td>
                                        <td>
                                            <div className="transfer-path-inline">
                                                <span className="badge badge-ghost badge--bg-secondary">{item.to_branch_short_name || item.to_branch_name}</span>
                                                <ArrowRight size={12} />
                                                <span className="badge badge-ghost badge--bg-secondary">{item.from_branch_short_name || item.from_branch_name}</span>
                                            </div>
                                        </td>
                                        <td className="font-bold">{item.quantity}</td>
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

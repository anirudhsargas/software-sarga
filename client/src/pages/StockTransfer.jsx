import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  Package, ArrowRight, Search, History, Loader2, 
  CheckCircle2, SendIcon, 
  Inbox, Trash2, ArrowDownLeft, ArrowUpRight, 
  Truck, CheckSquare, Plus, Minus, FileText
} from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import './StockTransfer.css';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
import InventoryImage from '../components/InventoryImage';

const StockTransfer = () => {
    useSEO('Stock Transfer');
    const location = useLocation();

    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
    const myBranchId = user?.branch_id;

    const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history' | 'requests'
    const [transferMode, setTransferMode] = useState(isAdmin ? 'direct' : 'request');
    const [loading, setLoading] = useState(false);
    const [tabLoading, setTabLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // Master data
    const [branches, setBranches] = useState([]);
    const [inventory, setInventory] = useState([]);
    const [history, setHistory] = useState([]);
    const [requests, setRequests] = useState([]);

    // Invoice-Style Line Items State
    const [transferItems, setTransferItems] = useState([]); // [{ item, quantity, notes }]
    const [fromBranchId, setFromBranchId] = useState(isAdmin ? '' : myBranchId);
    const [toBranchId, setToBranchId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isFocused, setIsFocused] = useState(false);

    // Branch availability maps by itemId -> branchStockMap[branch_id]
    const [branchStockMaps, setBranchStockMaps] = useState({});

    useEffect(() => {
        fetchInitialData();
    }, []);

    // Prefill item if navigated from Inventory page
    useEffect(() => {
        if (location.state?.item && inventory.length > 0) {
            const prefillItem = location.state.item;
            addItemToTransfer(prefillItem);
        }
    }, [location.state, inventory]);

    async function fetchInitialData() {
        try {
            setLoading(true);
            const [branchRes, invRes] = await Promise.all([
                api.get('/branches'),
                api.get('/inventory', { params: { no_pagination: '1' } })
            ]);
            setBranches(branchRes.data || []);
            setInventory(invRes.data?.data || invRes.data || []);
        } catch {
            toast.error('Failed to load initial data');
        } finally {
            setLoading(false);
        }
    }

    const fetchAllData = async () => {
        setTabLoading(true);
        try {
            const res = await api.get('/stock-requests'); 
            const data = res.data || [];
            setHistory(data);
            setRequests(data.filter(r => r.status !== 'Received' && r.status !== 'Rejected'));
        } catch (err) {
            console.error('Data fetch failed', err);
            toast.error('Failed to load requests');
        } finally {
            setTabLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'history' || activeTab === 'requests') fetchAllData();
    }, [activeTab]);

    // Fetch availability for all items currently in transfer list
    useEffect(() => {
        transferItems.forEach(line => {
            if (line.item?.id && !branchStockMaps[line.item.id]) {
                fetchBranchAvailability(line.item.id);
            }
        });
    }, [transferItems]);

    async function fetchBranchAvailability(itemId) {
        try {
            const res = await api.get(`/branch-stock/${itemId}`);
            const map = (res.data || []).reduce((acc, curr) => {
                acc[curr.branch_id] = curr.quantity;
                return acc;
            }, {});
            setBranchStockMaps(prev => ({ ...prev, [itemId]: map }));
        } catch (err) {
            console.error('Failed to fetch branch stock', err);
        }
    }

    const filteredInventory = useMemo(() => {
        const q = (searchQuery || '').trim().toLowerCase();
        if (!q) return inventory.slice(0, 25);
        return inventory.filter(item => 
            (item.name || '').toLowerCase().includes(q) || 
            (item.sku || '').toLowerCase().includes(q) ||
            (item.category || item.product_subcategory_name || '').toLowerCase().includes(q)
        ).slice(0, 50);
    }, [inventory, searchQuery]);

    const totalTransferQty = useMemo(() => {
        return transferItems.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    }, [transferItems]);

    // Add item to invoice line items list
    const addItemToTransfer = (item) => {
        setTransferItems(prev => {
            const existingIdx = prev.findIndex(line => line.item.id === item.id);
            if (existingIdx >= 0) {
                const updated = [...prev];
                updated[existingIdx].quantity += 1;
                return updated;
            }
            return [...prev, { item, quantity: 1, notes: '' }];
        });
        setSearchQuery('');
        setIsFocused(false);
        fetchBranchAvailability(item.id);
    };

    const updateItemQuantity = (index, qty) => {
        const val = Math.max(1, parseInt(qty, 10) || 1);
        setTransferItems(prev => {
            const updated = [...prev];
            updated[index].quantity = val;
            return updated;
        });
    };

    const updateItemNotes = (index, notes) => {
        setTransferItems(prev => {
            const updated = [...prev];
            updated[index].notes = notes;
            return updated;
        });
    };

    const removeItemFromTransfer = (index) => {
        setTransferItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleAction = async () => {
        if (transferItems.length === 0) { toast.error('Please add at least one item'); return; }
        if (!toBranchId) { toast.error('Please select destination branch'); return; }
        if (transferMode === 'direct' && !fromBranchId) { toast.error('Please select source branch'); return; }
        if (transferMode === 'direct' && String(fromBranchId) === String(toBranchId)) { 
            toast.error('Source and destination cannot be the same branch'); 
            return; 
        }

        // Validate stock levels for direct transfer
        if (transferMode === 'direct') {
            for (const line of transferItems) {
                const availMap = branchStockMaps[line.item.id] || {};
                const availableAtSource = availMap[fromBranchId] !== undefined ? availMap[fromBranchId] : (line.item.quantity || 0);
                if (Number(line.quantity) > availableAtSource) {
                    toast.error(`Insufficient stock for "${line.item.name}" at source. Available: ${availableAtSource}`);
                    return;
                }
            }
        }

        setSaving(true);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const line of transferItems) {
                try {
                    if (transferMode === 'direct') {
                        await api.post('/inventory/transfer', {
                            inventory_item_id: line.item.id,
                            from_branch_id: fromBranchId,
                            to_branch_id: toBranchId,
                            quantity: Number(line.quantity),
                            notes: line.notes || undefined
                        });
                    } else {
                        await api.post('/stock-requests', {
                            inventory_item_id: line.item.id,
                            to_branch_id: toBranchId,
                            quantity: Number(line.quantity),
                            notes: line.notes || undefined
                        });
                    }
                    successCount++;
                } catch (err) {
                    failCount++;
                    console.error('Line item transfer error:', err);
                }
            }

            if (successCount > 0) {
                toast.success(
                    transferMode === 'direct' 
                        ? `Transferred ${successCount} item(s) successfully` 
                        : `Stock request initiated for ${successCount} item(s)`
                );
                setTransferItems([]);
                setSearchQuery('');
                setActiveTab('requests');
                fetchInitialData();
            }
            if (failCount > 0) {
                toast.error(`Failed to process ${failCount} item(s)`);
            }
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
            fetchInitialData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to approve'); }
    };

    const rejectRequest = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/approve`, { action: 'reject' });
            toast.success('Request rejected');
            fetchAllData();
            fetchInitialData();
        } catch { toast.error('Failed to reject'); }
    };

    const sendStock = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/send`);
            toast.success('Goods dispatched. Source stock updated.');
            fetchAllData();
            fetchInitialData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to send goods'); }
    };

    const receiveStock = async (id) => {
        try {
            await api.put(`/stock-requests/${id}/receive`);
            toast.success('Goods received. Destination stock updated.');
            fetchAllData();
            fetchInitialData();
        } catch (e) { toast.error(e.response?.data?.message || 'Failed to receive goods'); }
    };

    if (loading) return <div className="panel flex-center" style={{ minHeight: 400 }}><Loader2 className="animate-spin" size={32} /></div>;

    const inboundReqs = requests.filter(r => {
        if (myBranchId) {
            return String(r.to_branch_id) === String(myBranchId);
        }
        return isAdmin;
    });
    const outboundReqs = requests.filter(r => {
        if (myBranchId) {
            return String(r.from_branch_id) === String(myBranchId);
        }
        return false;
    });

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
        <PageContainer>
            <div className="stock-hub-header">
                <div className="stock-hub-header__content">
                    <h1><Package size={32} /> Stock Hub</h1>
                    <p>Request, transfer and track inventory items across branches</p>
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
                        {/* Branch Configuration Card */}
                        <div className="panel stack-sm panel--primary-border">
                            <div className="panel-header panel-header--with-actions mb-8">
                                <h3><FileText size={18} /> Transfer Setup</h3>
                                
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
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </BranchSelect>
                                </div>

                                <div className="stack-xs">
                                    <label className="label">{transferMode === 'direct' ? 'Destination Branch' : 'Request From Branch'}</label>
                                    <BranchSelect 
                                        unrestricted
                                        className="input-field" 
                                        value={toBranchId} 
                                        onChange={e => setToBranchId(e.target.value)}
                                    >
                                        <option value="">Select branch...</option>
                                        {branches.filter(b => String(b.id) !== String(myBranchId)).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </BranchSelect>
                                </div>
                            </div>
                        </div>

                        {/* Invoice-Style Item Picker & Line Items Table */}
                        <div className="panel stack-md panel--primary-border">
                            <div className="panel-header">
                                <h3><Search size={18} /> Line Items</h3>
                                <span className="text-xs muted">{transferItems.length} item(s) selected</span>
                            </div>

                            {/* Product Search Input Bar */}
                            <div className="search-input-wrapper">
                                <input 
                                    className="input-field input-field--with-icon" 
                                    placeholder="Search product by name, SKU, or category to add..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onFocus={() => setIsFocused(true)}
                                    onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                                />
                                <Search size={20} className="search-input-icon" />

                                {(isFocused || searchQuery) && (
                                    <div className="panel stack-xs panel--dropdown stock-dropdown-invoice">
                                        {filteredInventory.length === 0 ? (
                                            <div className="empty-state">No matching items found</div>
                                        ) : filteredInventory.map(item => (
                                            <div role="button" tabIndex={0} key={item.id} 
                                                className="dropdown-item stock-dropdown-item"
                                                onClick={() => addItemToTransfer(item)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addItemToTransfer(item); } }}
                                            >
                                                <div className="stock-item-cell">
                                                    <InventoryImage item={item} size={36} />
                                                    <div className="stock-item-info">
                                                        <div className="stock-item-name">{item.name}</div>
                                                        <div className="stock-item-meta">
                                                            <span>SKU: {item.sku || 'N/A'}</span>
                                                            <span className="stock-meta-sep">•</span>
                                                            <span>₹{Number(item.sell_price || 0).toFixed(2)}</span>
                                                            <span className="stock-meta-sep">•</span>
                                                            <span className="stock-avail-pill">Stock: {item.quantity} {item.unit}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <button className="btn btn-ghost btn-xs btn-icon" title="Add item">
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Invoice-Style Line Items Table */}
                            {transferItems.length === 0 ? (
                                <div className="summary-empty" style={{ padding: '32px 16px' }}>
                                    <Package size={36} />
                                    <div>Search or click items above to add to transfer list</div>
                                </div>
                            ) : (
                                <div className="stock-invoice-table-wrapper">
                                    <table className="inv-table stock-invoice-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: 40 }}>#</th>
                                                <th>Item Details</th>
                                                <th style={{ width: 110 }}>Source Avail</th>
                                                <th style={{ width: 110 }}>Dest Avail</th>
                                                <th style={{ width: 130 }}>Transfer Qty</th>
                                                <th>Notes / Purpose</th>
                                                <th style={{ width: 50, textAlign: 'center' }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transferItems.map((line, idx) => {
                                                const availMap = branchStockMaps[line.item.id] || {};
                                                const srcStock = fromBranchId ? (availMap[fromBranchId] !== undefined ? availMap[fromBranchId] : line.item.quantity) : line.item.quantity;
                                                const dstStock = toBranchId ? (availMap[toBranchId] !== undefined ? availMap[toBranchId] : '—') : '—';
                                                
                                                return (
                                                    <tr key={`${line.item.id}-${idx}`}>
                                                        <td className="text-center font-bold muted">{idx + 1}</td>
                                                        <td>
                                                            <div className="stock-item-cell">
                                                                <InventoryImage item={line.item} size={40} />
                                                                <div className="stock-item-info">
                                                                    <span className="stock-item-name">{line.item.name}</span>
                                                                    <div className="stock-item-meta">
                                                                        <span className="badge badge--default">{line.item.sku || 'NO SKU'}</span>
                                                                        <span className="text-muted text-xs">{line.item.category || line.item.product_subcategory_name || 'General'}</span>
                                                                        <span className="font-semibold text-xs text-accent">₹{Number(line.item.sell_price || 0).toFixed(2)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span className={`stock-badge ${Number(srcStock) > 0 ? 'stock-badge--ok' : 'stock-badge--low'}`}>
                                                                {srcStock} {line.item.unit || 'pcs'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className="stock-badge stock-badge--default">
                                                                {dstStock} {dstStock !== '—' ? (line.item.unit || 'pcs') : ''}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className="stock-qty-input-group">
                                                                <button 
                                                                    type="button" 
                                                                    className="btn btn-ghost btn-icon btn-xs"
                                                                    onClick={() => updateItemQuantity(idx, line.quantity - 1)}
                                                                >
                                                                    <Minus size={12} />
                                                                </button>
                                                                <input 
                                                                    type="number" 
                                                                    min="1"
                                                                    className="input-field stock-qty-field" 
                                                                    value={line.quantity}
                                                                    onChange={(e) => updateItemQuantity(idx, e.target.value)}
                                                                />
                                                                <button 
                                                                    type="button" 
                                                                    className="btn btn-ghost btn-icon btn-xs"
                                                                    onClick={() => updateItemQuantity(idx, line.quantity + 1)}
                                                                >
                                                                    <Plus size={12} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <input 
                                                                type="text" 
                                                                className="input-field stock-notes-field"
                                                                placeholder="Reason / Ref..."
                                                                value={line.notes}
                                                                onChange={(e) => updateItemNotes(idx, e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="text-center">
                                                            <button 
                                                                type="button"
                                                                className="btn btn-ghost btn-icon btn-xs text-danger"
                                                                onClick={() => removeItemFromTransfer(idx)}
                                                                title="Remove Item"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary & Submit Card */}
                    <div className="stack-md summary-panel">
                        <div className="panel stack-md panel--primary-border">
                             <h3>Transfer Summary</h3>
                             {transferItems.length === 0 ? (
                                 <div className="summary-empty">
                                     <Package size={40} />
                                     <div>Add items to proceed</div>
                                 </div>
                             ) : (
                                 <div className="stack-md">
                                     <div className="transfer-summary-box">
                                         <div className="transfer-summary-row">
                                             <span className="muted">Total Line Items:</span>
                                             <span className="font-bold">{transferItems.length}</span>
                                         </div>
                                         <div className="transfer-summary-row">
                                             <span className="muted">Total Quantity:</span>
                                             <span className="font-bold text-accent">{totalTransferQty} units</span>
                                         </div>
                                     </div>

                                     <div className="transfer-path">
                                         <div className="transfer-path__node">
                                             <div className="transfer-path__label">{transferMode === 'direct' ? 'FROM' : 'REQUESTER'}</div>
                                             <div className="transfer-path__value">{branches.find(b => String(b.id) === String(myBranchId))?.short_name || 'Current Branch'}</div>
                                         </div>
                                         <ArrowRight size={20} className="transfer-path__arrow" style={{ transform: transferMode === 'request' ? 'rotate(180deg)' : 'none' }} />
                                         <div className="transfer-path__node">
                                             <div className="transfer-path__label">{transferMode === 'direct' ? 'TARGET' : 'SOURCE'}</div>
                                             <div className="transfer-path__value">{branches.find(b => String(b.id) === String(toBranchId))?.short_name || 'Select Branch'}</div>
                                         </div>
                                     </div>

                                     <button 
                                         className={`btn ${transferMode === 'direct' ? 'btn-primary' : 'btn-warning'} btn--full btn--large`} 
                                         disabled={saving || transferItems.length === 0 || !toBranchId}
                                         onClick={handleAction}
                                     >
                                         {saving ? <Loader2 className="animate-spin" /> : (transferMode === 'direct' ? <CheckCircle2 size={18} /> : <SendIcon size={18} />)}
                                         <span>{transferMode === 'direct' ? `Transfer ${transferItems.length} Item(s)` : `Submit Request (${transferItems.length})`}</span>
                                     </button>
                                 </div>
                             )}
                        </div>
                    </div>
                </div>
            ) : activeTab === 'requests' ? (
                tabLoading ? (
                    <div className="panel flex-center" style={{ minHeight: 300 }}>
                        <Loader2 className="animate-spin" size={28} />
                    </div>
                ) : (
                <div className="stack-lg fade-in">
                    {/* Inbound Section */}
                    <div className="panel stack-md panel--left-border-primary">
                        <div className="panel-header panel-header--with-badge">
                            <div className="panel-header__left">
                                <ArrowDownLeft size={24} className="icon-primary" />
                                <h3>Incoming Requests (Action Required)</h3>
                            </div>
                            <div className="badge badge--primary">{inboundReqs.length} Pending</div>
                        </div>
                        
                        <div className="table-scroll">
                            <table className="table stock-invoice-table">
                                <thead>
                                    <tr>
                                        <th>Item Details</th><th>From Branch</th><th>Qty</th><th>Status</th><th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {inboundReqs.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center muted">No incoming requests from other branches</td></tr>
                                    ) : inboundReqs.map(req => {
                                        const matchedInvItem = inventory.find(i => String(i.id) === String(req.inventory_item_id));
                                        return (
                                            <tr key={req.id}>
                                                <td>
                                                    <div className="stock-item-cell">
                                                        <InventoryImage item={matchedInvItem || { name: req.item_name, sku: req.item_sku }} size={38} />
                                                        <div className="stock-item-info">
                                                            <div className="font-semibold">{req.item_name}</div>
                                                            <div className="text-xs muted">SKU: {req.item_sku || 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><div className="badge badge--default">{req.from_branch_name}</div></td>
                                                <td className="font-bold text-accent">{req.quantity}</td>
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
                                                        {req.status === 'Sent' && (
                                                            (isAdmin || String(req.from_branch_id) === String(myBranchId)) ? (
                                                                <button className="btn btn-xs btn-success btn-with-icon" onClick={() => receiveStock(req.id)}>
                                                                    <CheckSquare size={14} /> Confirm Receipt
                                                                </button>
                                                            ) : (
                                                                <span className="text-xs muted">Waiting for delivery confirmation...</span>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
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
                             <div className="badge badge--warning">{outboundReqs.length} Sent</div>
                        </div>

                        <div className="table-scroll">
                            <table className="table stock-invoice-table">
                                <thead>
                                    <tr>
                                        <th>Item Details</th><th>To Branch</th><th>Qty</th><th>Status</th><th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {outboundReqs.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center muted">You haven't requested any stock recently</td></tr>
                                    ) : outboundReqs.map(req => {
                                        const matchedInvItem = inventory.find(i => String(i.id) === String(req.inventory_item_id));
                                        return (
                                            <tr key={req.id}>
                                                <td>
                                                    <div className="stock-item-cell">
                                                        <InventoryImage item={matchedInvItem || { name: req.item_name, sku: req.item_sku }} size={38} />
                                                        <div className="stock-item-info">
                                                            <div className="font-semibold">{req.item_name}</div>
                                                            <div className="text-xs muted">SKU: {req.item_sku || 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td><div className="badge badge--default">{req.to_branch_name}</div></td>
                                                <td className="font-bold text-accent">{req.quantity}</td>
                                                <td>{getStatusBadge(req.status)}</td>
                                                <td>
                                                    {req.status === 'Sent' ? (
                                                        <button className="btn btn-xs btn-success btn-with-icon" onClick={() => receiveStock(req.id)}>
                                                            <CheckSquare size={14} /> Confirm Receipt
                                                        </button>
                                                    ) : <span className="text-xs muted">Awaiting {req.status === 'Pending' ? 'Approval' : 'Dispatch'}...</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                    )
                ) : (
                <div className="panel stack-md fade-in">
                    <h3>Movement History (Finalized)</h3>
                    <div className="table-scroll">
                        <table className="table stock-invoice-table">
                            <thead>
                                <tr><th>Date</th><th>Item Details</th><th>Path</th><th>Qty</th><th>Final State</th><th>In-Charge</th></tr>
                            </thead>
                            <tbody>
                                {history.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center muted">No transaction history found</td></tr>
                                ) : history.map(item => {
                                    const matchedInvItem = inventory.find(i => String(i.id) === String(item.inventory_item_id));
                                    return (
                                        <tr key={item.id}>
                                            <td className="text-sm">{new Date(item.created_at).toLocaleDateString()}</td>
                                            <td>
                                                <div className="stock-item-cell">
                                                    <InventoryImage item={matchedInvItem || { name: item.item_name, sku: item.item_sku }} size={38} />
                                                    <div className="stock-item-info">
                                                        <div className="font-semibold">{item.item_name}</div>
                                                        <div className="text-xs muted">SKU: {item.item_sku || 'N/A'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="transfer-path-inline">
                                                    <span className="badge badge--default">{item.to_branch_short_name || item.to_branch_name}</span>
                                                    <ArrowRight size={12} />
                                                    <span className="badge badge--default">{item.from_branch_short_name || item.from_branch_name}</span>
                                                </div>
                                            </td>
                                            <td className="font-bold text-accent">{item.quantity}</td>
                                            <td>{getStatusBadge(item.status)}</td>
                                            <td className="text-sm">{item.created_by_name}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default StockTransfer;

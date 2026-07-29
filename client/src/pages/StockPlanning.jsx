import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useRef } from 'react';
import { Package, AlertTriangle, CheckCircle, ShoppingCart, Download, Loader2, RefreshCw, X, Plus, Search, BarChart3, Cpu } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';

const STATUS_CONFIG = {
    critical: { color: 'var(--error)', bg: 'var(--error-bg)', label: 'Critical', icon: '🔴' },
    low:      { color: 'var(--warning)', bg: 'var(--warning-bg)', label: 'Low',      icon: '🟡' },
    ok:       { color: 'var(--success)', bg: 'var(--success-bg)', label: 'OK',       icon: '🟢' },
};

const TABS = [
    { key: 'ai', label: 'AI Analysis', icon: Cpu },
    { key: 'manual', label: 'Manual Analysis', icon: BarChart3 },
];

const StockPlanning = () => {
    useSEO('Stock Planning');

    const [activeTab, setActiveTab] = useState('ai');

    // AI tab state
    const [stockStatus, setStockStatus] = useState([]);
    const [purchaseList, setPurchaseList] = useState([]);
    const [totalCost, setTotalCost] = useState(0);
    const [generatedAt, setGeneratedAt] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [approving, setApproving] = useState(false);
    const [sortField, setSortField] = useState('days_to_stockout');
    const [sortDir, setSortDir] = useState('asc');
    const [editableList, setEditableList] = useState([]);
    const [isMlDisabled, setIsMlDisabled] = useState(false);
    const modalContentRef = useRef(null);

    const [showAddItem, setShowAddItem] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [manualItem, setManualItem] = useState({
        name: '', material_id: '', suggested_qty: 1, unit: 'pcs',
        estimated_cost: 0, vendor_name: '', urgency: 'normal', notes: ''
    });
    const searchTimer = useRef(null);

    // Manual tab state
    const [manualSummary, setManualSummary] = useState([]);
    const [manualLoading, setManualLoading] = useState(false);
    const [manualSortField, setManualSortField] = useState('status');
    const [manualSortDir, setManualSortDir] = useState('asc');
    const [analysisPeriod, setAnalysisPeriod] = useState(90);

    // Sync editableList when purchaseList changes
    useEffect(() => {
        if (showModal && purchaseList.length > 0) {
            setEditableList(purchaseList.map(item => ({ ...item, _edited: false })));
        }
    }, [showModal, purchaseList]);

    const handleEditItem = (index, field, value) => {
        setEditableList(prev => prev.map((item, i) =>
            i === index ? { ...item, [field]: value, _edited: true } : item
        ));
    };

    const recalcTotal = (list) =>
        list.reduce((sum, item) => sum + (Number(item.estimated_cost) || 0), 0);

    const fetchStockStatus = async (refresh = false) => {
        try {
            if (refresh) setRefreshing(true); else setLoading(true);
            const res = await api.get('/ai/stock-planning/stock-status', { params: refresh ? { refresh: 'true' } : {} });
            if (res.data.enabled === false) {
                setIsMlDisabled(true);
            } else {
                setStockStatus(res.data.stock_status || []);
                setGeneratedAt(res.data.generated_at || '');
            }
        } catch {
            toast.error('Failed to load stock status');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const fetchPurchaseList = async () => {
        try {
            const res = await api.get('/ai/stock-planning/purchase-list');
            setPurchaseList(res.data.purchase_list || []);
            setTotalCost(res.data.total_estimated_cost || 0);
        } catch {
            toast.error('Failed to load purchase list');
        }
    };

    const fetchManualSummary = async () => {
        setManualLoading(true);
        try {
            const res = await api.get('/ai/stock-planning/normal-summary', {
                params: { days: analysisPeriod }
            });
            setManualSummary(res.data.summary || []);
        } catch {
            toast.error('Failed to load manual stock summary');
        } finally {
            setManualLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'ai') {
            fetchStockStatus();
        } else {
            fetchManualSummary();
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'manual') {
            fetchManualSummary();
        }
    }, [analysisPeriod]);

    const handleGeneratePurchaseList = async () => {
        await fetchPurchaseList();
        setShowModal(true);
    };

    const handleApprove = async () => {
        const finalList = editableList.length > 0 ? editableList : purchaseList;
        if (finalList.length === 0) return;
        setApproving(true);
        try {
            const res = await api.post('/ai/stock-planning/approve-purchase-list', {
                items: finalList,
                notes: `Auto-generated stock planning order`,
            });
            toast.success(`Purchase order #${res.data.order_id} created with ${res.data.item_count} items`);
            setShowModal(false);
        } catch {
            toast.error('Failed to approve purchase order');
        } finally {
            setApproving(false);
        }
    };

    const handleDownloadPDF = () => {
        if (!modalContentRef.current) return;
        const finalList = editableList.length > 0 ? editableList : purchaseList;
        const finalCost = finalList.reduce((sum, item) => sum + (Number(item.estimated_cost) || 0), 0);
        const printWin = window.open('', '_blank');
        if (!printWin) { toast.error('Pop-up blocked. Please allow pop-ups.'); return; }
        printWin.document.write(`<!DOCTYPE html><html><head><title>Purchase List</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .meta { font-size: 12px; color: #888; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f5f5f5; }
            .urgent { color: #dc2626; font-weight: 600; }
            .total { font-size: 16px; font-weight: 700; margin-top: 16px; text-align: right; }
        </style></head><body>
        <h1>Sarga Prints — Purchase List</h1>
        <div class="meta">Generated: ${generatedAt ? new Date(generatedAt).toLocaleString() : new Date().toLocaleString()}</div>
        <table><thead><tr>
            <th>#</th><th>Material</th><th>Qty</th><th>Unit</th>
            <th>Est. Cost</th><th>Vendor</th><th>Urgency</th>
        </tr></thead><tbody>
        ${finalList.map((item, i) => `<tr>
            <td>${i + 1}</td>
            <td>${item.name}</td>
            <td>${item.suggested_qty}</td>
            <td>${item.unit}</td>
            <td>₹${(Number(item.estimated_cost) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>${item.vendor_name || '—'}</td>
            <td class="${(item.urgency === 'immediate' || item.urgency === 'critical') ? 'urgent' : ''}">${(item.urgency === 'immediate' || item.urgency === 'critical') ? 'Immediate' : 'This Week'}</td>
        </tr>`).join('')}
        </tbody></table>
        <div class="total">Total Estimated Cost: ₹${finalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </body></html>`);
        printWin.document.close();
        printWin.focus();
        printWin.print();
    };

    const handleSearchProducts = (query) => {
        setSearchQuery(query);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!query.trim()) { setSearchResults([]); return; }
        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.get('/products', { params: { search: query, limit: 10 } });
                setSearchResults(res.data?.data || res.data || []);
            } catch { setSearchResults([]); }
            finally { setSearching(false); }
        }, 300);
    };

    const handleAddManualItem = () => {
        if (!manualItem.name.trim()) { toast.error('Item name is required'); return; }
        const newItem = {
            ...manualItem,
            material_id: manualItem.material_id || `manual_${Date.now()}`,
            name: manualItem.name.trim(),
            suggested_qty: Number(manualItem.suggested_qty) || 1,
            estimated_cost: Number(manualItem.estimated_cost) || 0,
            _edited: true
        };
        setEditableList(prev => [...prev, newItem]);
        setManualItem({ name: '', material_id: '', suggested_qty: 1, unit: 'pcs', estimated_cost: 0, vendor_name: '', urgency: 'normal', notes: '' });
        setSearchQuery('');
        setSearchResults([]);
        setShowAddItem(false);
        toast.success('Item added to purchase list');
    };

    // Sorting
    const sorted = [...stockStatus].sort((a, b) => {
        let av = a[sortField], bv = b[sortField];
        if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const manualSorted = [...manualSummary].sort((a, b) => {
        let av = a[manualSortField], bv = b[manualSortField];
        if (manualSortField === 'status') {
            const order = { critical: 0, low: 1, ok: 2 };
            av = order[av] ?? 2; bv = order[bv] ?? 2;
        }
        if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
        if (av < bv) return manualSortDir === 'asc' ? -1 : 1;
        if (av > bv) return manualSortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const toggleManualSort = (field) => {
        if (manualSortField === field) setManualSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setManualSortField(field); setManualSortDir('asc'); }
    };

    const criticalCount = stockStatus.filter(s => s.status === 'critical').length;
    const lowCount = stockStatus.filter(s => s.status === 'low').length;
    const okCount = stockStatus.filter(s => s.status === 'ok').length;

    // Manual section KPIs
    const manualCritical = manualSummary.filter(s => s.status === 'critical').length;
    const manualLow = manualSummary.filter(s => s.status === 'low').length;
    const manualHighReorder = manualSummary.filter(s => s.reorder_count >= 3).length;

    const tabStyle = (key) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        fontSize: 14,
        fontWeight: 600,
        border: 'none',
        borderBottom: activeTab === key ? '2px solid var(--primary)' : '2px solid transparent',
        color: activeTab === key ? 'var(--primary)' : 'var(--text-muted)',
        background: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s',
    });

    if (isMlDisabled && activeTab === 'ai') {
        return (
            <PageContainer>
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <h1 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
                        Stock Planning
                    </h1>
                    <p style={{ fontSize: '14px' }}>AI features temporarily unavailable. Switch to Manual Analysis.</p>
                </div>
            </PageContainer>
        );
    }

    return (
        <PageContainer>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
                {TABS.map(tab => (
                    <button key={tab.key} style={tabStyle(tab.key)} onClick={() => setActiveTab(tab.key)}>
                        <tab.icon size={16} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* ────────── AI Analysis Tab ────────── */}
            {activeTab === 'ai' && (
                <>
                    {/* Header */}
                    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h1 className="section-title">AI-Powered Analysis</h1>
                            <p className="section-subtitle" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                ML-based stock analysis &amp; purchase recommendations
                                {generatedAt && <> · Updated {new Date(generatedAt).toLocaleString()}</>}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost" onClick={() => fetchStockStatus(true)} disabled={refreshing}>
                                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                            </button>
                            <button className="btn btn-ghost" onClick={() => setShowAddItem(true)}>
                                <Plus size={16} /> Add Item
                            </button>
                            <button className="btn btn-primary" onClick={handleGeneratePurchaseList}>
                                <ShoppingCart size={16} /> Generate Purchase List
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: 8, color: 'var(--text-muted, var(--muted))' }}>
                            <Loader2 size={20} className="animate-spin" /> Analysing stock levels…
                        </div>
                    ) : (
                        <>
                            {/* KPI Tiles */}
                            <div className="summary-grid summary-grid--tiles">
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--error)' }}>
                                    <div className="summary-tile__label">Critical</div>
                                    <div className="summary-tile__value" style={{ color: 'var(--error)' }}>{criticalCount}</div>
                                </div>
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--warning)' }}>
                                    <div className="summary-tile__label">Low Stock</div>
                                    <div className="summary-tile__value" style={{ color: 'var(--warning)' }}>{lowCount}</div>
                                </div>
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--success)' }}>
                                    <div className="summary-tile__label">OK</div>
                                    <div className="summary-tile__value" style={{ color: 'var(--success)' }}>{okCount}</div>
                                </div>
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--primary)' }}>
                                    <div className="summary-tile__label">Total Materials</div>
                                    <div className="summary-tile__value">{stockStatus.length}</div>
                                </div>
                            </div>

                            {/* Traffic-light Table */}
                            <div className="panel">
                                <div className="table-wrapper">
                                    <table className="data-table" style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <th>Status</th>
                                                <SortTh field="name" current={sortField} dir={sortDir} onClick={toggleSort}>Material</SortTh>
                                                <SortTh field="current_stock" current={sortField} dir={sortDir} onClick={toggleSort}>Stock</SortTh>
                                                <th>Unit</th>
                                                <SortTh field="avg_daily_consumption" current={sortField} dir={sortDir} onClick={toggleSort}>Avg Daily Use</SortTh>
                                                <SortTh field="days_to_stockout" current={sortField} dir={sortDir} onClick={toggleSort}>Days to Stockout</SortTh>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sorted.length === 0 && (
                                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No inventory data found</td></tr>
                                            )}
                                            {sorted.map(item => {
                                                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.ok;
                                                const barWidth = item.days_to_stockout >= 30 ? 100 : Math.max(3, (item.days_to_stockout / 30) * 100);
                                                return (
                                                    <tr key={item.material_id}>
                                                        <td>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                padding: '2px 10px', borderRadius: 12,
                                                                background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 600
                                                            }}>
                                                                {cfg.icon} {cfg.label}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                        <td>{item.current_stock}</td>
                                                        <td>{item.unit}</td>
                                                        <td>{item.avg_daily_consumption}</td>
                                                        <td style={{ minWidth: 160 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <div style={{
                                                                    flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden'
                                                                }}>
                                                                    <div style={{
                                                                        width: `${barWidth}%`, height: '100%', borderRadius: 4,
                                                                        background: cfg.color, transition: 'width 0.3s ease'
                                                                    }} />
                                                                </div>
                                                                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
                                                                    {item.days_to_stockout >= 9999 ? '∞' : item.days_to_stockout}d
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Purchase List Modal */}
                    {showModal && (
                        <div role="button" tabIndex={0} className="modal-backdrop" onClick={() => setShowModal(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowModal(false); } }}>
                            <div role="button" tabIndex={0} className="modal" style={{ maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                                onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                                <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                                <h2 className="section-title mb-16">Purchase List</h2>

                                <div ref={modalContentRef} style={{ flex: 1, overflowY: 'auto' }}>
                                    {editableList.length === 0 && purchaseList.length === 0 ? (
                                        <p style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                                            All stock levels are OK — no purchases needed.
                                        </p>
                                    ) : (
                                        <table className="data-table" style={{ width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Material</th>
                                                    <th>Qty</th>
                                                    <th>Unit</th>
                                                    <th>Est. Cost (₹)</th>
                                                    <th>Vendor</th>
                                                    <th>Urgency</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(editableList.length > 0 ? editableList : purchaseList).map((item, i) => (
                                                    <tr key={item.material_id || i}>
                                                        <td>{i + 1}</td>
                                                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="input-field"
                                                                style={{ width: 64, padding: '4px 8px', fontSize: 13 }}
                                                                value={item.suggested_qty}
                                                                onChange={(e) => handleEditItem(i, 'suggested_qty', e.target.value)}
                                                                min="0"
                                                            />
                                                        </td>
                                                        <td>{item.unit}</td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="input-field"
                                                                style={{ width: 100, padding: '4px 8px', fontSize: 13 }}
                                                                value={item.estimated_cost || ''}
                                                                onChange={(e) => {
                                                                    handleEditItem(i, 'estimated_cost', e.target.value);
                                                                    const updated = [...editableList];
                                                                    updated[i].estimated_cost = e.target.value;
                                                                    setTotalCost(recalcTotal(updated));
                                                                }}
                                                                min="0"
                                                                step="0.01"
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="text"
                                                                className="input-field"
                                                                style={{ width: 120, padding: '4px 8px', fontSize: 13 }}
                                                                value={item.vendor_name || ''}
                                                                onChange={(e) => handleEditItem(i, 'vendor_name', e.target.value)}
                                                                placeholder="Vendor"
                                                            />
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                                background: (item.urgency === 'immediate' || item.urgency === 'critical') ? 'var(--error-bg)' : 'var(--warning-bg)',
                                                                color: (item.urgency === 'immediate' || item.urgency === 'critical') ? 'var(--error)' : 'var(--warning)',
                                                            }}>
                                                                {(item.urgency === 'immediate' || item.urgency === 'critical') ? 'Immediate' : 'This Week'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {/* Total + Actions */}
                                <div style={{
                                    borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 16,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                                }}>
                                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                                        Total: ₹{(editableList.length > 0 ? recalcTotal(editableList) : totalCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {editableList.some(i => i._edited) && (
                                            <button className="btn btn-ghost" onClick={() => setEditableList(purchaseList.map(item => ({ ...item, _edited: false })))}>
                                                <RefreshCw size={14} /> Reset
                                            </button>
                                        )}
                                        <button className="btn btn-ghost" onClick={handleDownloadPDF} disabled={purchaseList.length === 0}>
                                            <Download size={16} /> Download as PDF
                                        </button>
                                        <button className="btn btn-primary" onClick={handleApprove}
                                            disabled={approving || purchaseList.length === 0}>
                                            {approving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Approve & Save Order'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Add Item Modal */}
                    {showAddItem && (
                        <div className="modal-backdrop" onClick={() => setShowAddItem(false)}>
                            <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
                                <button className="modal-close" onClick={() => setShowAddItem(false)}><X size={20} /></button>
                                <h2 className="section-title mb-16">Add Item to Purchase List</h2>

                                <div className="stack-md">
                                    <div>
                                        <label className="label" htmlFor="add-item-search">Search Existing Products</label>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input id="add-item-search" className="input-field" style={{ paddingLeft: 32 }}
                                                placeholder="Type product name..."
                                                value={searchQuery}
                                                onChange={e => handleSearchProducts(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        {searching && <div className="muted text-sm" style={{ marginTop: 4 }}>Searching...</div>}
                                        {searchResults.length > 0 && (
                                            <div style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto' }}>
                                                {searchResults.map(p => (
                                                    <div key={p.id} role="button" tabIndex={0} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                        onClick={() => {
                                                            setManualItem(prev => ({ ...prev, name: p.name, material_id: p.id, unit: p.unit || 'pcs' }));
                                                            setSearchQuery(p.name);
                                                            setSearchResults([]);
                                                        }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setManualItem(prev => ({ ...prev, name: p.name, material_id: p.id, unit: p.unit || 'pcs' })); setSearchQuery(p.name); setSearchResults([]); } }}>
                                                        <span style={{ fontWeight: 500 }}>{p.name}</span>
                                                        <span className="muted text-sm">{p.unit || 'pcs'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div>
                                            <label className="label" htmlFor="add-item-name">Product Name</label>
                                            <input id="add-item-name" className="input-field" value={manualItem.name}
                                                onChange={e => setManualItem(prev => ({ ...prev, name: e.target.value }))}
                                                placeholder="e.g. Ink Cartridge" />
                                        </div>
                                        <div>
                                            <label className="label" htmlFor="add-item-qty">Required Qty</label>
                                            <input id="add-item-qty" className="input-field" type="number" min={1} value={manualItem.suggested_qty}
                                                onChange={e => setManualItem(prev => ({ ...prev, suggested_qty: e.target.value }))} />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                        <div>
                                            <label className="label" htmlFor="add-item-unit">Unit</label>
                                            <select id="add-item-unit" className="input-field" value={manualItem.unit}
                                                onChange={e => setManualItem(prev => ({ ...prev, unit: e.target.value }))}>
                                                <option value="pcs">Pieces</option>
                                                <option value="kg">Kg</option>
                                                <option value="liter">Liter</option>
                                                <option value="meter">Meter</option>
                                                <option value="ream">Ream</option>
                                                <option value="roll">Roll</option>
                                                <option value="pack">Pack</option>
                                                <option value="box">Box</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label" htmlFor="add-item-cost">Est. Cost (₹)</label>
                                            <input id="add-item-cost" className="input-field" type="number" min={0} step="0.01" value={manualItem.estimated_cost}
                                                onChange={e => setManualItem(prev => ({ ...prev, estimated_cost: e.target.value }))} />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="label" htmlFor="add-item-vendor">Vendor</label>
                                        <input id="add-item-vendor" className="input-field" value={manualItem.vendor_name}
                                            onChange={e => setManualItem(prev => ({ ...prev, vendor_name: e.target.value }))}
                                            placeholder="Vendor name (optional)" />
                                    </div>

                                    <div>
                                        <label className="label" htmlFor="add-item-notes">Notes</label>
                                        <textarea id="add-item-notes" className="input-field" style={{ minHeight: 60, resize: 'vertical' }} value={manualItem.notes}
                                            onChange={e => setManualItem(prev => ({ ...prev, notes: e.target.value }))}
                                            placeholder="Optional notes..." />
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                        <button className="btn btn-ghost" onClick={() => setShowAddItem(false)}>Cancel</button>
                                        <button className="btn btn-primary" onClick={handleAddManualItem}>Add to List</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* ────────── Manual Analysis Tab ────────── */}
            {activeTab === 'manual' && (
                <>
                    {/* Header */}
                    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h1 className="section-title">Manual Analysis</h1>
                            <p className="section-subtitle" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                Reorder frequency, consumption &amp; sales-based stock planning
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <label style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Analysis Period:</label>
                            <select className="input-field" style={{ width: 'auto', padding: '6px 12px' }}
                                value={analysisPeriod} onChange={e => setAnalysisPeriod(Number(e.target.value))}>
                                <option value={30}>Last 30 days</option>
                                <option value={60}>Last 60 days</option>
                                <option value={90}>Last 90 days</option>
                                <option value={180}>Last 180 days</option>
                                <option value={365}>Last 1 year</option>
                            </select>
                            <button className="btn btn-ghost" onClick={fetchManualSummary} disabled={manualLoading}>
                                <RefreshCw size={16} className={manualLoading ? 'animate-spin' : ''} /> Refresh
                            </button>
                        </div>
                    </div>

                    {manualLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: 8, color: 'var(--text-muted, var(--muted))' }}>
                            <Loader2 size={20} className="animate-spin" /> Analysing stock history…
                        </div>
                    ) : (
                        <>
                            {/* KPI Tiles */}
                            <div className="summary-grid summary-grid--tiles">
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--error)' }}>
                                    <div className="summary-tile__label">Critical</div>
                                    <div className="summary-tile__value" style={{ color: 'var(--error)' }}>{manualCritical}</div>
                                </div>
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--warning)' }}>
                                    <div className="summary-tile__label">Low Stock</div>
                                    <div className="summary-tile__value" style={{ color: 'var(--warning)' }}>{manualLow}</div>
                                </div>
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--primary)' }}>
                                    <div className="summary-tile__label">High Reorder (3+)</div>
                                    <div className="summary-tile__value" style={{ color: 'var(--primary)' }}>{manualHighReorder}</div>
                                </div>
                                <div className="summary-tile" style={{ borderLeft: '4px solid var(--success)' }}>
                                    <div className="summary-tile__label">Total Items</div>
                                    <div className="summary-tile__value">{manualSummary.length}</div>
                                </div>
                            </div>

                            {/* Data Table */}
                            <div className="panel">
                                <div className="table-wrapper">
                                    <table className="data-table" style={{ width: '100%' }}>
                                        <thead>
                                            <tr>
                                                <SortTh field="status" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Status</SortTh>
                                                <SortTh field="name" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Material</SortTh>
                                                <SortTh field="current_stock" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Stock</SortTh>
                                                <th>Unit</th>
                                                <SortTh field="reorder_count" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Times Reordered</SortTh>
                                                <SortTh field="total_consumed" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Total Consumed</SortTh>
                                                <SortTh field="avg_monthly_consumption" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Avg Monthly</SortTh>
                                                <SortTh field="days_to_stockout" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Days Left</SortTh>
                                                <SortTh field="suggested_reorder_qty" current={manualSortField} dir={manualSortDir} onClick={toggleManualSort}>Suggested Reorder</SortTh>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {manualSorted.length === 0 && (
                                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No inventory data found</td></tr>
                                            )}
                                            {manualSorted.map(item => {
                                                const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.ok;
                                                return (
                                                    <tr key={item.material_id}>
                                                        <td>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                padding: '2px 10px', borderRadius: 12,
                                                                background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 600
                                                            }}>
                                                                {cfg.icon} {cfg.label}
                                                            </span>
                                                        </td>
                                                        <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                        <td>
                                                            <span style={{
                                                                fontWeight: 600,
                                                                color: item.current_stock <= item.reorder_level ? 'var(--error)' : 'inherit'
                                                            }}>
                                                                {item.current_stock}
                                                            </span>
                                                            {item.reorder_level > 0 && (
                                                                <span className="muted text-sm" style={{ marginLeft: 4 }}>
                                                                    (min: {item.reorder_level})
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>{item.unit}</td>
                                                        <td>
                                                            <span style={{
                                                                fontWeight: 600,
                                                                color: item.reorder_count >= 3 ? 'var(--warning)' : 'inherit'
                                                            }}>
                                                                {item.reorder_count}x
                                                            </span>
                                                            {item.last_reorder_date && (
                                                                <span className="muted text-sm" style={{ marginLeft: 4, fontSize: 11 }}>
                                                                    · {new Date(item.last_reorder_date).toLocaleDateString()}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {item.total_consumed > 0 ? (
                                                                <span>{item.total_consumed} {item.unit}</span>
                                                            ) : (
                                                                <span className="muted text-sm">No data</span>
                                                            )}
                                                            {item.consumption_events > 0 && (
                                                                <span className="muted text-sm" style={{ marginLeft: 4, fontSize: 11 }}>
                                                                    ({item.consumption_events} events)
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            {item.avg_monthly_consumption > 0
                                                                ? <span>{item.avg_monthly_consumption} /mo</span>
                                                                : <span className="muted text-sm">—</span>
                                                            }
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                fontWeight: 600,
                                                                color: item.days_to_stockout < 7 ? 'var(--error)' : item.days_to_stockout < 30 ? 'var(--warning)' : 'inherit'
                                                            }}>
                                                                {item.days_to_stockout >= 9999 ? '∞' : `${item.days_to_stockout}d`}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                                                                {item.suggested_reorder_qty} {item.unit}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </PageContainer>
    );
};

/** Sortable table header */
const SortTh = ({ field, current, dir, onClick, children }) => (
    <th onClick={() => onClick(field)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {children} {current === field ? (dir === 'asc' ? '▲' : '▼') : ''}
    </th>
);

export default StockPlanning;
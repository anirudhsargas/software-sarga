import React, { useEffect, useState, useRef } from 'react';
import { Package, AlertTriangle, CheckCircle, ShoppingCart, Download, Loader2, RefreshCw, X } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
    critical: { color: 'var(--error)', bg: 'var(--error-bg)', label: 'Critical', icon: '🔴' },
    low:      { color: 'var(--warning)', bg: 'var(--warning-bg)', label: 'Low',      icon: '🟡' },
    ok:       { color: 'var(--success)', bg: 'var(--success-bg)', label: 'OK',       icon: '🟢' },
};

const StockPlanning = () => {
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
    const modalContentRef = useRef(null);

    const fetchStockStatus = async (refresh = false) => {
        try {
            if (refresh) setRefreshing(true); else setLoading(true);
            const res = await api.get('/ai/stock-planning/stock-status', { params: refresh ? { refresh: 'true' } : {} });
            setStockStatus(res.data.stock_status || []);
            setGeneratedAt(res.data.generated_at || '');
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

    useEffect(() => { fetchStockStatus(); }, []);

    const handleGeneratePurchaseList = async () => {
        await fetchPurchaseList();
        setShowModal(true);
    };

    const handleApprove = async () => {
        if (purchaseList.length === 0) return;
        setApproving(true);
        try {
            const res = await api.post('/ai/stock-planning/approve-purchase-list', {
                items: purchaseList,
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
        ${purchaseList.map((item, i) => `<tr>
            <td>${i + 1}</td>
            <td>${item.name}</td>
            <td>${item.suggested_qty}</td>
            <td>${item.unit}</td>
            <td>₹${(item.estimated_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td>${item.vendor_name || '—'}</td>
            <td class="${item.urgency === 'immediate' ? 'urgent' : ''}">${item.urgency === 'immediate' ? 'Immediate' : 'This Week'}</td>
        </tr>`).join('')}
        </tbody></table>
        <div class="total">Total Estimated Cost: ₹${totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </body></html>`);
        printWin.document.close();
        printWin.focus();
        printWin.print();
    };

    // Sorting
    const sorted = [...stockStatus].sort((a, b) => {
        let av = a[sortField], bv = b[sortField];
        if (typeof av === 'string') { av = av.toLowerCase(); bv = (bv || '').toLowerCase(); }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const toggleSort = (field) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const criticalCount = stockStatus.filter(s => s.status === 'critical').length;
    const lowCount = stockStatus.filter(s => s.status === 'low').length;
    const okCount = stockStatus.filter(s => s.status === 'ok').length;

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: 8, color: 'var(--text-muted, var(--muted))' }}>
                <Loader2 size={20} className="animate-spin" /> Analysing stock levels…
            </div>
        );
    }

    return (
        <div className="stack-lg">
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 className="section-title">Stock Planning</h1>
                    <p className="section-subtitle" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        AI-powered stock analysis &amp; purchase recommendations
                        {generatedAt && <> · Updated {new Date(generatedAt).toLocaleString()}</>}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => fetchStockStatus(true)} disabled={refreshing}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /> Refresh
                    </button>
                    <button className="btn btn-primary" onClick={handleGeneratePurchaseList}>
                        <ShoppingCart size={16} /> Generate Purchase List
                    </button>
                </div>
            </div>

            {/* KPI Tiles */}
            <div className="summary-grid summary-grid--tiles">
                <div className="summary-tile" style={{ borderLeft: '4px solid #ef4444' }}>
                    <div className="summary-tile__label">Critical</div>
                    <div className="summary-tile__value" style={{ color: '#ef4444' }}>{criticalCount}</div>
                </div>
                <div className="summary-tile" style={{ borderLeft: '4px solid #f59e0b' }}>
                    <div className="summary-tile__label">Low Stock</div>
                    <div className="summary-tile__value" style={{ color: '#f59e0b' }}>{lowCount}</div>
                </div>
                <div className="summary-tile" style={{ borderLeft: '4px solid #22c55e' }}>
                    <div className="summary-tile__label">OK</div>
                    <div className="summary-tile__value" style={{ color: '#22c55e' }}>{okCount}</div>
                </div>
                <div className="summary-tile" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <div className="summary-tile__label">Total Materials</div>
                    <div className="summary-tile__value">{stockStatus.length}</div>
                </div>
            </div>

            {/* Traffic-light Table */}
            <div className="panel">
                <div style={{ overflowX: 'auto' }}>
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
                                                    flex: 1, height: 8, borderRadius: 4, background: '#e5e7eb', overflow: 'hidden'
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

            {/* Purchase List Modal */}
            {showModal && (
                <div className="modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="modal" style={{ maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        <h2 className="section-title mb-16">Purchase List</h2>

                        <div ref={modalContentRef} style={{ flex: 1, overflowY: 'auto' }}>
                            {purchaseList.length === 0 ? (
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
                                            <th>Est. Cost</th>
                                            <th>Vendor</th>
                                            <th>Urgency</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {purchaseList.map((item, i) => (
                                            <tr key={item.material_id}>
                                                <td>{i + 1}</td>
                                                <td style={{ fontWeight: 500 }}>{item.name}</td>
                                                <td>{item.suggested_qty}</td>
                                                <td>{item.unit}</td>
                                                <td>₹{(item.estimated_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                <td>{item.vendor_name || '—'}</td>
                                                <td>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                                                        background: item.urgency === 'immediate' ? '#fef2f2' : '#fffbeb',
                                                        color: item.urgency === 'immediate' ? '#dc2626' : '#d97706',
                                                    }}>
                                                        {item.urgency === 'immediate' ? 'Immediate' : 'This Week'}
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
                                Total: ₹{totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
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
        </div>
    );
};

/** Sortable table header */
const SortTh = ({ field, current, dir, onClick, children }) => (
    <th onClick={() => onClick(field)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {children} {current === field ? (dir === 'asc' ? '▲' : '▼') : ''}
    </th>
);

export default StockPlanning;

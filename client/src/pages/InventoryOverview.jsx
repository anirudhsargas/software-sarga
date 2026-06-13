import React, { useEffect, useMemo, useState } from 'react';
import { File, FileText, Package, Inbox, AlertTriangle, Search, RefreshCcw } from 'lucide-react';
import api, { devFallback } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const InventoryOverview = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [productsTotal, setProductsTotal] = useState(0);
    const [productsLowCount, setProductsLowCount] = useState(0);
    const [paperTotal, setPaperTotal] = useState(0);
    const [paperLowCount, setPaperLowCount] = useState(0);
    const [consumablesTotal, setConsumablesTotal] = useState(0);
    const [consumablesLowCount, setConsumablesLowCount] = useState(0);
    const [lowStockRows, setLowStockRows] = useState([]);

    const fetchOverview = async () => {
        setLoading(true);
        try {
            // Products summary: use paginated endpoint to get total SKUs
            const prodSummary = await api.get('/inventory', { params: { limit: 1, page: 1 } });
            let prodTotal = 0;
            if (prodSummary && prodSummary.data) {
                // server-side paginated response
                if (Array.isArray(prodSummary.data)) prodTotal = prodSummary.data.length;
                else prodTotal = Number(prodSummary.data.total) || 0;
            }

            // Products low-stock list
            const prodLowResp = await api.get('/inventory', { params: { status: 'low', limit: 1000, page: 1 } });
            let prodLowList = prodLowResp?.data?.data ?? prodLowResp?.data ?? [];
            if (!Array.isArray(prodLowList) && prodLowResp?.data && Array.isArray(prodLowResp.data)) prodLowList = prodLowResp.data;

            // Paper
            const paperResp = await api.get('/inventory/paper');
            const paperList = Array.isArray(paperResp.data) ? paperResp.data : (paperResp.data?.data || []);
            const paperLowResp = await api.get('/inventory/paper/low-stock');
            const paperLowList = Array.isArray(paperLowResp.data) ? paperLowResp.data : (paperLowResp.data?.data || []);

            // Consumables
            const consResp = await api.get(devFallback('/inventory/consumables'));
            const consList = Array.isArray(consResp.data) ? consResp.data : (consResp.data?.data || []);
            const consLowResp = await api.get(devFallback('/inventory/consumables/low-stock'));
            const consLowList = Array.isArray(consLowResp.data) ? consLowResp.data : (consLowResp.data?.data || []);

            setProductsTotal(prodTotal);
            setProductsLowCount(Array.isArray(prodLowList) ? prodLowList.length : 0);
            setPaperTotal(Array.isArray(paperList) ? paperList.length : 0);
            setPaperLowCount(Array.isArray(paperLowList) ? paperLowList.length : 0);
            setConsumablesTotal(Array.isArray(consList) ? consList.length : 0);
            setConsumablesLowCount(Array.isArray(consLowList) ? consLowList.length : 0);

            // Normalize low stock rows into unified shape
            const normalized = [];

            if (Array.isArray(prodLowList)) {
                prodLowList.forEach((p) => {
                    normalized.push({
                        id: `prod-${p.id}`,
                        name: p.name || p.sku || 'Unnamed',
                        type: 'Product',
                        stockLeft: p.quantity ?? 0,
                        reorderLevel: p.reorder_level ?? 0,
                        branch: p.branch || '-'
                    });
                });
            }

            if (Array.isArray(paperLowList)) {
                paperLowList.forEach((p) => {
                    normalized.push({
                        id: `paper-${p.id}`,
                        name: p.paper_name || 'Paper',
                        type: 'Paper',
                        stockLeft: p.ream_count ?? 0,
                        reorderLevel: p.reorder_level_reams ?? 0,
                        branch: p.branch || '-'
                    });
                });
            }

            if (Array.isArray(consLowList)) {
                consLowList.forEach((c) => {
                    normalized.push({
                        id: `cons-${c.id}`,
                        name: c.name || 'Consumable',
                        type: 'Consumable',
                        stockLeft: c.quantity_in_stock ?? 0,
                        reorderLevel: c.reorder_level ?? 0,
                        branch: c.branch || '-'
                    });
                });
            }

            // Sort by type then stockLeft ascending
            normalized.sort((a, b) => {
                if (a.type === b.type) return Number(a.stockLeft) - Number(b.stockLeft);
                return a.type.localeCompare(b.type);
            });

            setLowStockRows(normalized);
        } catch (err) {
            console.error('Overview fetch error:', err);
            toast.error('Failed to load inventory overview');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverview();
    }, []);

    const cards = useMemo(() => ([
        {
            key: 'products',
            title: 'Products',
            icon: File,
            total: productsTotal,
            low: productsLowCount,
            href: '/dashboard/inventory'
        },
        {
            key: 'paper',
            title: 'Paper',
            icon: FileText,
            total: paperTotal,
            low: paperLowCount,
            href: '/dashboard/inventory/paper'
        },
        {
            key: 'consumables',
            title: 'Consumables',
            icon: Package,
            total: consumablesTotal,
            low: consumablesLowCount,
            href: '/dashboard/inventory/consumables'
        }
    ]), [productsTotal, productsLowCount, paperTotal, paperLowCount, consumablesTotal, consumablesLowCount]);

    return (
        <div className="stack-lg p-md">
            <div className="row space-between items-center">
                <div>
                    <h1 className="section-title">Inventory Overview</h1>
                    <p className="section-subtitle">Consolidated stock summary across Products, Paper, and Consumables.</p>
                </div>
                <div className="row gap-sm">
                    <button className="btn btn-ghost" onClick={() => fetchOverview()} disabled={loading}>
                        <RefreshCcw size={16} /> Refresh
                    </button>
                </div>
            </div>

            <div className="grid grid--3 mt-md">
                {cards.map((c) => (
                    <div key={c.key} className="panel stack-xs" style={{ cursor: 'pointer' }} onClick={() => navigate(c.href)}>
                        <div className="row items-center gap-sm">
                            <c.icon size={28} className="text-primary" />
                            <div>
                                <div className="muted text-xs uppercase">{c.title}</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{c.total}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                            <div className="text-xs muted">Low stock: <span className="text-danger font-bold">{c.low}</span></div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="panel mt-md">
                <div className="row space-between items-center mb-sm">
                    <div>
                        <h2 className="section-title" style={{ fontSize: 18 }}>Low Stock Alerts</h2>
                        <div className="muted text-xs">Items below reorder level across all inventory types.</div>
                    </div>
                </div>

                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Type</th>
                                <th>Stock Left</th>
                                <th>Reorder Level</th>
                                <th>Branch</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="text-center p-xl"><RefreshCcw className="animate-spin muted" size={28} /></td>
                                </tr>
                            ) : lowStockRows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center p-xl muted">No low stock alerts</td>
                                </tr>
                            ) : (
                                lowStockRows.map((r) => (
                                    <tr key={r.id} style={{ borderLeft: '4px solid var(--danger)', backgroundColor: 'rgba(var(--error-rgb), 0.04)' }}>
                                        <td>{r.name}</td>
                                        <td>{r.type}</td>
                                        <td className="font-bold text-danger">{r.stockLeft}</td>
                                        <td>{r.reorderLevel}</td>
                                        <td>{r.branch}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default InventoryOverview;

import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useMemo, useState } from 'react';
import {
    Package, AlertTriangle, Plus, Search, RefreshCcw,
    Edit2, Trash2, X, ArrowUp, ArrowDown, MapPin,
    Download, Layers, ShoppingCart, IndianRupee,
    History, TrendingUp, Tag, FileText, Building2, DollarSign, Eye
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { devFallback } from '../services/api';
import toast from 'react-hot-toast';
import auth from '../services/auth';
import './InventoryModern.css';
import PageContainer from '../components/ui/PageContainer';

const CATEGORY_TABS = [
    { label: 'All', value: 'all' },
    { label: 'Ink', value: 'ink' },
    { label: 'Chemical', value: 'chemical' },
    { label: 'Plate', value: 'plate' },
    { label: 'Spare Part', value: 'spare_part' },
    { label: 'Paper', value: 'paper' },
    { label: 'Binding', value: 'binding' },
    { label: 'Packaging', value: 'packaging' },
    { label: 'Other', value: 'other' }
];

const UNIT_OPTIONS = ['litre', 'kg', 'piece', 'box', 'set', 'sheet', 'roll', 'meter', 'pair', 'pack'];

const emptyForm = {
    name: '', category: 'other', unit: 'piece',
    gsm: '', size_name: '', brand: '', finish: '', color: '',
    quantity_in_stock: 0, reorder_level: 0, min_stock_level: '', max_stock_level: '', location: '',
    unit_cost: '', supplier_name: '', supplier_id: '', sku: '', branch: 'Perambra', notes: ''
};

const toDisplayCategory = (category) => {
    if (!category) return '-';
    if (category === 'spare_part') return 'Spare Part';
    return category.charAt(0).toUpperCase() + category.slice(1);
};

const csvEscape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const ConsumablesManagement = () => {
    useSEO('Consumables Management');
    const user = auth.getUser();
    const isManager = ['Admin', 'Accountant'].includes(user?.role);
    const navigate = useNavigate();

    const [tabCounts, setTabCounts] = useState({ general: 0, paper: 0, consumables: 0 });
    const [consumables, setConsumables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState('All');
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('add');
    const [selectedItem, setSelectedItem] = useState(null);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustData, setAdjustData] = useState({ id: null, name: '', quantity_delta: '', reason: '', adjustment_type: 'INWARD' });
    const [formData, setFormData] = useState(emptyForm);
    // Detail panel states
    const [detailItem, setDetailItem] = useState(null);
    const [detailTab, setDetailTab] = useState('details');
    const [rateHistory, setRateHistory] = useState([]);
    const [purchaseHistory, setPurchaseHistory] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);
    // Add rate modal
    const [showAddRateModal, setShowAddRateModal] = useState(false);
    const [newRate, setNewRate] = useState({ rate: '', effective_date: new Date().toISOString().split('T')[0], supplier_name: '', notes: '' });

    useEffect(() => {
        let isMounted = true;
        const fetchTabCounts = async () => {
            try {
                const [genRes, paperRes, consRes] = await Promise.all([
                    api.get('/inventory', { params: { limit: 1 } }),
                    api.get('/paperInventory/stock'),
                    api.get('/inventory/consumables')
                ]);
                if (!isMounted) return;
                setTabCounts({
                    general: genRes.data?.total || (Array.isArray(genRes.data) ? genRes.data.length : 0),
                    paper: Array.isArray(paperRes.data) ? paperRes.data.length : 0,
                    consumables: Array.isArray(consRes.data) ? consRes.data.length : 0
                });
            } catch { }
        };
        fetchTabCounts();
        return () => { isMounted = false; };
    }, []);

    const fetchConsumables = async () => {
        setLoading(true);
        try {
            const res = await api.get(devFallback('/inventory/consumables'), {
                params: { category: categoryFilter, branch: branchFilter, search: searchTerm || undefined }
            });
            setItems(res.data || []);
        } catch (err) {
            if (err.response?.status === 401) {
                toast.error('Authentication required');
                window.dispatchEvent(new CustomEvent('navigate', { detail: { path: '/login' } }));
                return;
            }
            toast.error('Failed to load consumables');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchConsumables(); }, [categoryFilter, branchFilter, searchTerm]);

    const stats = useMemo(() => {
        const lowStock = items.filter(i => Number(i.quantity_in_stock) <= Number(i.reorder_level || 0));
        const totalValue = items.reduce((acc, curr) => acc + (Number(curr.quantity_in_stock) * Number(curr.unit_cost || 0)), 0);
        return { totalItems: items.length, lowStock: lowStock.length, totalValue };
    }, [items]);

    const handleOpenAdd = () => {
        setModalMode('add');
        setSelectedItem(null);
        setFormData({ ...emptyForm, branch: user?.branch_name || 'Perambra' });
        setShowModal(true);
    };

    const handleOpenEdit = (item) => {
        setModalMode('edit');
        setSelectedItem(item);
        setFormData({
            name: item.name || '', category: item.category || 'other', unit: item.unit || 'piece',
            gsm: item.gsm || '', size_name: item.size_name || '', brand: item.brand || '',
            finish: item.finish || '', color: item.color || '',
            quantity_in_stock: Number(item.quantity_in_stock) || 0, reorder_level: Number(item.reorder_level) || 0,
            min_stock_level: item.min_stock_level || '', max_stock_level: item.max_stock_level || '',
            location: item.location || '',
            unit_cost: item.unit_cost || '', supplier_name: item.supplier_name || '',
            supplier_id: item.supplier_id || '', sku: item.sku || '',
            branch: item.branch || 'Perambra', notes: item.notes || ''
        });
        setShowModal(true);
    };

    const handleOpenDetail = async (item) => {
        setDetailItem(item);
        setDetailTab('details');
        setDetailLoading(true);
        try {
            const [ratesRes, purchasesRes] = await Promise.all([
                api.get(`/inventory/consumables/${item.id}/rates`),
                api.get(`/inventory/consumables/${item.id}/purchases`)
            ]);
            setRateHistory(ratesRes.data || []);
            setPurchaseHistory(purchasesRes.data || []);
        } catch {
            setRateHistory([]);
            setPurchaseHistory([]);
        } finally {
            setDetailLoading(false);
        }
    };

    const getStockLevel = (item) => {
        const qty = Number(item.quantity_in_stock);
        const reorder = Number(item.reorder_level || 0);
        const min = Number(item.min_stock_level || 0);
        const max = Number(item.max_stock_level || 0);
        if (qty <= 0) return 'critical';
        if (qty <= reorder && reorder > 0) return 'low';
        if (max > 0 && qty >= max) return 'overstock';
        return 'normal';
    };

    const getStockBarWidth = (item) => {
        const qty = Number(item.quantity_in_stock);
        const max = Number(item.max_stock_level || 0) || Number(item.reorder_level || 0) * 2 || 100;
        return Math.min((qty / max) * 100, 100);
    };

    const handleOpenAdjust = (item) => {
        setAdjustData({ id: item.id, name: item.name, quantity_delta: '', reason: '', adjustment_type: 'INWARD' });
        setShowAdjustModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this consumable item?')) return;
        try {
            await api.delete(`/inventory/consumables/${id}`);
            toast.success('Consumable deleted');
            fetchConsumables();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'add') {
                await api.post('/inventory/consumables', formData);
                toast.success('Consumable added');
            } else {
                await api.put(`/inventory/consumables/${selectedItem.id}`, formData);
                toast.success('Consumable updated');
            }
            setShowModal(false);
            fetchConsumables();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
            fetchConsumables();
        }
    };

    const handleAdjustSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/inventory/consumables/${adjustData.id}/adjust`, {
                quantity_delta: Number(adjustData.quantity_delta),
                reason: adjustData.reason,
                adjustment_type: adjustData.adjustment_type
            });
            toast.success('Stock adjusted');
            setShowAdjustModal(false);
            fetchConsumables();
            if (detailItem?.id === adjustData.id) handleOpenDetail(detailItem);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to adjust stock');
        }
    };

    const handleAddRate = async () => {
        if (!newRate.rate || newRate.rate <= 0) { toast.error('Valid rate required'); return; }
        try {
            await api.post(`/inventory/consumables/${detailItem.id}/rates`, {
                rate: Number(newRate.rate),
                effective_date: newRate.effective_date,
                supplier_name: newRate.supplier_name || undefined,
                notes: newRate.notes || undefined
            });
            toast.success('Rate added');
            setShowAddRateModal(false);
            setNewRate({ rate: '', effective_date: new Date().toISOString().split('T')[0], supplier_name: '', notes: '' });
            // Refresh
            const ratesRes = await api.get(`/inventory/consumables/${detailItem.id}/rates`);
            setRateHistory(ratesRes.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add rate');
        }
    };

    const handleExportCsv = () => {
        if (!items.length) { toast.error('No data to export'); return; }
        const headers = ['Name', 'Category', 'Unit', 'GSM', 'Size', 'Brand', 'Finish', 'Color', 'Stock', 'Reorder', 'Min Stock', 'Max Stock', 'Location', 'Unit Cost', 'Supplier', 'SKU', 'Branch', 'Notes'];
        const rows = items.map(item => [
            item.name, toDisplayCategory(item.category), item.unit, item.gsm || '',
            item.size_name || '', item.brand || '', item.finish || '', item.color || '',
            item.quantity_in_stock, item.reorder_level, item.min_stock_level || '',
            item.max_stock_level || '', item.location || '', item.unit_cost,
            item.supplier_name || '', item.sku || '', item.branch, item.notes || ''
        ]);
        const csv = [headers, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `consumables_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    return (
        <PageContainer>
            <div className="inv-header">
                <div className="inv-header-left">
                    <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Inventory / Consumables</div>
                    <h1 className="inv-header-title">Consumables Inventory</h1>
                    <p className="inv-header-desc">Track ink, chemicals, plates, paper, bindings, and other print consumables with rate history.</p>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="inv-tabs">
                <div onClick={() => navigate('/dashboard/inventory')} className="inv-tab">
                    <div className="inv-tab-icon"><Package size={20} /></div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">General Inventory</span>
                        <span className="inv-tab-count">{tabCounts.general.toLocaleString()} Items</span>
                    </div>
                </div>
                <div onClick={() => navigate('/dashboard/inventory/paper')} className="inv-tab">
                    <div className="inv-tab-icon"><Layers size={20} /></div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">Paper Stock</span>
                        <span className="inv-tab-count">{tabCounts.paper.toLocaleString()} Types</span>
                    </div>
                </div>
                <div onClick={() => navigate('/dashboard/inventory/consumables')} className="inv-tab inv-tab--active">
                    <div className="inv-tab-icon"><ShoppingCart size={20} /></div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">Consumables</span>
                        <span className="inv-tab-count">{tabCounts.consumables.toLocaleString()} Items</span>
                    </div>
                </div>
            </div>

            {/* KPI Row */}
            <div className="inv-kpi-row">
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Package size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">{stats.totalItems}</span>
                        <span className="inv-kpi-label">Total Items</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><AlertTriangle size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value" style={{ color: stats.lowStock > 0 ? 'var(--error)' : 'var(--text)' }}>{stats.lowStock}</span>
                        <span className="inv-kpi-label">Low Stock</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><IndianRupee size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">₹{stats.totalValue.toLocaleString()}</span>
                        <span className="inv-kpi-label">Estimated Value</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Tag size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">{new Set(items.map(i => i.category)).size}</span>
                        <span className="inv-kpi-label">Categories</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="inv-toolbar">
                <div className="inv-toolbar-row">
                    <div className="inv-search">
                        <span className="inv-search-icon"><Search size={16} /></span>
                        <input type="text" className="inv-search-input" placeholder="Search by name, brand, SKU, size..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        {searchTerm && <button className="inv-search-clear" onClick={() => setSearchTerm('')}><X size={14} /></button>}
                    </div>
                    {isManager && (
                        <button className="btn btn-primary" onClick={handleOpenAdd}><Plus size={18} /> Add Consumable</button>
                    )}
                </div>
                <div className="inv-toolbar-row justify-between wrap gap-sm">
                    <div className="inv-chips">
                        <div className="inv-chip">
                            <MapPin size={12} className="muted" style={{ marginRight: 4 }} />
                            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
                                <option value="All">All Branches</option>
                                <option value="Perambra">Perambra</option>
                                <option value="Meppayur">Meppayur</option>
                            </select>
                        </div>
                        <div className="inv-chip">
                            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                                <option value="all">All Categories</option>
                                {CATEGORY_TABS.filter(c => c.value !== 'all').map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                        </div>
                        {(searchTerm || categoryFilter !== 'all' || branchFilter !== 'All') && (
                            <button className="inv-chip-clear" onClick={() => { setSearchTerm(''); setCategoryFilter('all'); setBranchFilter('All'); }}>
                                <X size={12} /> Clear
                            </button>
                        )}
                    </div>
                    <div className="row gap-xs items-center">
                        <button className="btn btn-ghost btn-sm" onClick={handleExportCsv}><Download size={14} /> Export CSV</button>
                    </div>
                </div>
            </div>

            {/* Main content area with side panel */}
            <div className="inv-flex-row">
                {/* Table */}
                <div className="inv-table-container" style={{ flex: 1, minWidth: 0 }}>
                    <div className="inv-table-scroll">
                        <table className="inv-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '30%' }}>Name / Specs</th>
                                    <th>Category</th>
                                    <th>Stock</th>
                                    <th>Rate</th>
                                    <th>Supplier</th>
                                    <th style={{ textAlign: 'right', width: 120 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan="6" className="text-center p-xl"><RefreshCcw className="animate-spin muted" size={30} /></td></tr>
                                ) : items.length === 0 ? (
                                    <tr><td colSpan="6" className="text-center p-xl muted">
                                        <Package size={44} style={{ opacity: 0.2, marginBottom: 12 }} />
                                        <div>No consumables found.</div>
                                    </td></tr>
                                ) : (
                                    items.map(item => {
                                        const level = getStockLevel(item);
                                        const barWidth = getStockBarWidth(item);
                                        return (
                                            <tr key={item.id} onClick={() => handleOpenDetail(item)} style={{ cursor: 'pointer' }}>
                                                <td>
                                                    <div className="font-bold">{item.name}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                                        <span className={`inv-cat-badge inv-cat-badge--${item.category || 'other'}`}>{toDisplayCategory(item.category)}</span>
                                                        {[item.brand, item.size_name, item.gsm ? `${item.gsm} GSM` : '', item.color, item.finish].filter(Boolean).slice(0, 2).join(' • ') || ''}
                                                        {item.sku && <span style={{ fontFamily: 'monospace', opacity: 0.6 }}>#{item.sku}</span>}
                                                    </div>
                                                    <div className="inv-stock-vis">
                                                        <div className="inv-stock-bar-track">
                                                            <div className={`inv-stock-bar-fill inv-stock-bar-fill--${level === 'critical' ? 'critical' : level === 'low' ? 'low' : level === 'overstock' ? 'overstock' : 'normal'}`}
                                                                style={{ width: `${barWidth}%` }} />
                                                        </div>
                                                        <div className="inv-stock-bar-labels">
                                                            <span>{item.quantity_in_stock} {item.unit}</span>
                                                            {item.reorder_level > 0 && <span>min: {item.reorder_level}</span>}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td data-label="Category">
                                                    <span className={`inv-cat-badge inv-cat-badge--${item.category || 'other'}`}>{toDisplayCategory(item.category)}</span>
                                                </td>
                                                <td data-label="Stock">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span className={`inv-status-dot inv-status-dot--${level === 'critical' ? 'critical' : level === 'low' ? 'low' : 'ok'}`} />
                                                        <span className="font-bold">{item.quantity_in_stock}</span>
                                                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.unit}</span>
                                                    </div>
                                                </td>
                                                <td data-label="Rate">
                                                    <span style={{ fontWeight: 500 }}>₹{Number(item.unit_cost || 0).toLocaleString()}</span>
                                                    {item.current_rate_id && <History size={12} style={{ marginLeft: 4, verticalAlign: 'middle', color: 'var(--muted)' }} />}
                                                </td>
                                                <td data-label="Supplier">{item.supplier_name || '-'}</td>
                                                <td data-label="Actions" style={{ textAlign: 'right' }}>
                                                    <div className="inv-actions justify-end">
                                                        {isManager && (
                                                            <>
                                                                <button className="inv-action-btn" title="Quick Adjust" onClick={(e) => { e.stopPropagation(); handleOpenAdjust(item); }}>
                                                                    <ArrowUp size={12} style={{ marginRight: -4 }} /><ArrowDown size={12} />
                                                                </button>
                                                                <button className="inv-action-btn" title="Edit" onClick={(e) => { e.stopPropagation(); handleOpenEdit(item); }}>
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button className="inv-action-btn inv-action-btn--danger" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Detail Panel */}
                {detailItem && (
                    <div className="inv-detail-panel">
                        <div className="inv-detail-header">
                            <h3 className="inv-detail-title">{detailItem.name}</h3>
                            <button className="inv-action-btn" onClick={() => setDetailItem(null)}><X size={16} /></button>
                        </div>
                        <div className="inv-detail-tabs">
                            {['details', 'rates', 'purchases'].map(tab => (
                                <button key={tab}
                                    onClick={() => setDetailTab(tab)}
                                    className={`inv-detail-tab ${detailTab === tab ? 'inv-detail-tab--active' : ''}`}
                                >
                                    {tab === 'details' ? <><FileText size={12} />Details</> :
                                     tab === 'rates' ? <><TrendingUp size={12} />Rates</> :
                                     <><ShoppingCart size={12} />Purchases</>}
                                </button>
                            ))}
                        </div>
                        <div className="inv-detail-body">
                            {detailTab === 'details' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div className="inv-spec-grid">
                                        <div className="inv-spec-item">
                                            <span className="inv-spec-label">Category</span>
                                            <span className="inv-spec-value">{toDisplayCategory(detailItem.category)}</span>
                                        </div>
                                        <div className="inv-spec-item">
                                            <span className="inv-spec-label">Unit</span>
                                            <span className="inv-spec-value">{detailItem.unit}</span>
                                        </div>
                                        {detailItem.gsm && <div className="inv-spec-item">
                                            <span className="inv-spec-label">GSM</span>
                                            <span className="inv-spec-value">{detailItem.gsm}</span>
                                        </div>}
                                        {detailItem.size_name && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Size</span>
                                            <span className="inv-spec-value">{detailItem.size_name}</span>
                                        </div>}
                                        {detailItem.brand && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Brand</span>
                                            <span className="inv-spec-value">{detailItem.brand}</span>
                                        </div>}
                                        {detailItem.finish && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Finish</span>
                                            <span className="inv-spec-value">{detailItem.finish}</span>
                                        </div>}
                                        {detailItem.color && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Color</span>
                                            <span className="inv-spec-value">{detailItem.color}</span>
                                        </div>}
                                        {detailItem.sku && <div className="inv-spec-item">
                                            <span className="inv-spec-label">SKU</span>
                                            <span className="inv-spec-value" style={{ fontFamily: 'monospace' }}>{detailItem.sku}</span>
                                        </div>}
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Stock Level</span>
                                            <span className="inv-detail-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className={`inv-status-dot inv-status-dot--${getStockLevel(detailItem) === 'critical' ? 'critical' : getStockLevel(detailItem) === 'low' ? 'low' : 'ok'}`} />
                                                {detailItem.quantity_in_stock} {detailItem.unit}
                                            </span>
                                        </div>
                                        <div className="inv-stock-vis" style={{ margin: '4px 0 8px' }}>
                                            <div className="inv-stock-bar-track">
                                                <div className={`inv-stock-bar-fill inv-stock-bar-fill--${getStockLevel(detailItem) === 'critical' ? 'critical' : getStockLevel(detailItem) === 'low' ? 'low' : getStockLevel(detailItem) === 'overstock' ? 'overstock' : 'normal'}`}
                                                    style={{ width: `${getStockBarWidth(detailItem)}%` }} />
                                            </div>
                                            <div className="inv-stock-bar-labels">
                                                {detailItem.min_stock_level && <span>min: {detailItem.min_stock_level}</span>}
                                                {detailItem.max_stock_level && <span>max: {detailItem.max_stock_level}</span>}
                                                {detailItem.reorder_level > 0 && <span>reorder: {detailItem.reorder_level}</span>}
                                            </div>
                                        </div>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Reorder Level</span>
                                            <span className="inv-detail-value">{detailItem.reorder_level}</span>
                                        </div>
                                        {detailItem.min_stock_level && <div className="inv-detail-row">
                                            <span className="inv-detail-label">Min Stock</span>
                                            <span className="inv-detail-value">{detailItem.min_stock_level}</span>
                                        </div>}
                                        {detailItem.max_stock_level && <div className="inv-detail-row">
                                            <span className="inv-detail-label">Max Stock</span>
                                            <span className="inv-detail-value">{detailItem.max_stock_level}</span>
                                        </div>}
                                        {detailItem.location && <div className="inv-detail-row">
                                            <span className="inv-detail-label">Location</span>
                                            <span className="inv-detail-value">{detailItem.location}</span>
                                        </div>}
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Current Rate</span>
                                            <span className="inv-detail-value" style={{ fontSize: 16, color: 'var(--accent)' }}>₹{Number(detailItem.unit_cost || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Supplier</span>
                                            <span className="inv-detail-value">{detailItem.supplier_name || '-'}</span>
                                        </div>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Branch</span>
                                            <span className="inv-detail-value">{detailItem.branch}</span>
                                        </div>
                                        {detailItem.notes && <div className="inv-detail-row">
                                            <span className="inv-detail-label">Notes</span>
                                            <span className="inv-detail-value" style={{ maxWidth: 200, textAlign: 'right' }}>{detailItem.notes}</span>
                                        </div>}
                                    </div>
                                    <button className="btn btn-secondary btn-sm btn--full" style={{ marginTop: 8 }} onClick={() => setShowAddRateModal(true)}>
                                        <TrendingUp size={14} /> Update Rate
                                    </button>
                                </div>
                            )}
                            {detailTab === 'rates' && (
                                <div>
                                    <div className="inv-section-header">
                                        <span className="inv-section-label">Rate change history</span>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAddRateModal(true)}><Plus size={14} /> Add Rate</button>
                                    </div>
                                    {detailLoading ? <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>Loading...</div> :
                                     rateHistory.length === 0 ? <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>No rate history</div> :
                                     rateHistory.map(r => (
                                        <div key={r.id} className={`inv-rate-item ${r.id === detailItem.current_rate_id ? 'inv-rate-item--active' : ''}`}>
                                            <div>
                                                <div className="inv-rate-amount">₹{Number(r.rate).toLocaleString()}</div>
                                                <div className="inv-rate-meta">
                                                    {r.effective_date ? new Date(r.effective_date).toLocaleDateString() : '-'}
                                                    {r.supplier_name && ` • ${r.supplier_name}`}
                                                </div>
                                            </div>
                                            <div>
                                                {r.id === detailItem.current_rate_id && (
                                                    <span className="inv-rate-badge">ACTIVE</span>
                                                )}
                                            </div>
                                        </div>
                                     ))}
                                </div>
                            )}
                            {detailTab === 'purchases' && (
                                <div>
                                    {detailLoading ? <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>Loading...</div> :
                                     purchaseHistory.length === 0 ? <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>No purchase history</div> :
                                     purchaseHistory.map(p => (
                                        <div key={p.id} className="inv-purchase-item">
                                            <div className="inv-purchase-top">
                                                <span className="inv-purchase-amount">₹{Number(p.total_amount).toLocaleString()}</span>
                                                <span className="inv-purchase-date">{p.purchase_date ? new Date(p.purchase_date).toLocaleDateString() : '-'}</span>
                                            </div>
                                            <div className="inv-purchase-detail">
                                                {p.quantity} × ₹{Number(p.unit_price).toLocaleString()}
                                                {p.supplier_name && ` • ${p.supplier_name}`}
                                            </div>
                                            {p.invoice_ref && <div className="inv-purchase-ref">Ref: {p.invoice_ref}</div>}
                                        </div>
                                     ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '750px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">{modalMode === 'add' ? 'Add Consumable' : 'Edit Consumable'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="stack-md">
                            <div className="grid grid--3 gap-md">
                                <div className="span-3"><label className="label">Name *</label>
                                    <input className="input-field" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                                </div>
                                <div><label className="label">Category</label>
                                    <select className="input-field" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                                        {CATEGORY_TABS.filter(c => c.value !== 'all').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div><label className="label">Unit</label>
                                    <select className="input-field" value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                                        {UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
                                    </select>
                                </div>
                                <div><label className="label">GSM</label>
                                    <input type="number" className="input-field" value={formData.gsm} onChange={e => setFormData({ ...formData, gsm: e.target.value })} placeholder="e.g. 80" />
                                </div>
                                <div><label className="label">Size</label>
                                    <input className="input-field" value={formData.size_name} onChange={e => setFormData({ ...formData, size_name: e.target.value })} placeholder="e.g. A4, 8.5x11" />
                                </div>
                                <div><label className="label">Brand</label>
                                    <input className="input-field" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                                </div>
                                <div><label className="label">Finish</label>
                                    <input className="input-field" value={formData.finish} onChange={e => setFormData({ ...formData, finish: e.target.value })} placeholder="e.g. Glossy, Matte" />
                                </div>
                                <div><label className="label">Color</label>
                                    <input className="input-field" value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} />
                                </div>
                                <div><label className="label">SKU</label>
                                    <input className="input-field" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })} />
                                </div>
                                <div><label className="label">Quantity *</label>
                                    <input type="number" step="0.001" className="input-field" value={formData.quantity_in_stock} onChange={e => setFormData({ ...formData, quantity_in_stock: e.target.value })} />
                                </div>
                                <div><label className="label">Reorder Level</label>
                                    <input type="number" step="0.001" className="input-field" value={formData.reorder_level} onChange={e => setFormData({ ...formData, reorder_level: e.target.value })} />
                                </div>
                                <div><label className="label">Min Stock</label>
                                    <input type="number" step="0.001" className="input-field" value={formData.min_stock_level} onChange={e => setFormData({ ...formData, min_stock_level: e.target.value })} />
                                </div>
                                <div><label className="label">Max Stock</label>
                                    <input type="number" step="0.001" className="input-field" value={formData.max_stock_level} onChange={e => setFormData({ ...formData, max_stock_level: e.target.value })} />
                                </div>
                                <div><label className="label">Location</label>
                                    <input className="input-field" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Rack A, Shelf 3" />
                                </div>
                                <div><label className="label">Unit Cost (₹)</label>
                                    <input type="number" step="0.01" className="input-field" value={formData.unit_cost} onChange={e => setFormData({ ...formData, unit_cost: e.target.value })} />
                                </div>
                                <div><label className="label">Supplier</label>
                                    <input className="input-field" value={formData.supplier_name} onChange={e => setFormData({ ...formData, supplier_name: e.target.value })} />
                                </div>
                                <div><label className="label">Branch *</label>
                                    <select className="input-field" value={formData.branch} onChange={e => setFormData({ ...formData, branch: e.target.value })}>
                                        <option value="Perambra">Perambra</option>
                                        <option value="Meppayur">Meppayur</option>
                                    </select>
                                </div>
                                <div className="span-3"><label className="label">Notes</label>
                                    <textarea className="input-field" rows="2" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} />
                                </div>
                            </div>
                            <div className="row justify-end gap-sm mt-md">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{modalMode === 'add' ? 'Create Item' : 'Save Changes'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Adjust Modal */}
            {showAdjustModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">Quick Adjust</h2>
                            <button className="modal-close" onClick={() => setShowAdjustModal(false)}><X size={20} /></button>
                        </div>
                        <div className="stack-md">
                            <div className="font-bold" style={{ padding: '0 16px' }}>{adjustData.name}</div>
                            <div className="inv-adjust-current" style={{ margin: '0 16px' }}>
                                <span className="inv-adjust-current-label">Current Stock</span>
                                <span className="inv-adjust-current-value">
                                    {(() => {
                                        const item = items.find(i => i.id === adjustData.id);
                                        return item ? `${item.quantity_in_stock} ${item.unit}` : '-';
                                    })()}
                                </span>
                            </div>
                            {adjustData.quantity_delta && Number(adjustData.quantity_delta) !== 0 && (() => {
                                const item = items.find(i => i.id === adjustData.id);
                                const currentQty = item ? Number(item.quantity_in_stock) : 0;
                                const delta = Number(adjustData.quantity_delta);
                                const sign = adjustData.adjustment_type === 'INWARD' ? 1 : adjustData.adjustment_type === 'OUTWARD' ? -1 : adjustData.adjustment_type === 'RETURN' ? 1 : -1;
                                const newQty = currentQty + (delta * sign);
                                const isInward = adjustData.adjustment_type === 'INWARD' || adjustData.adjustment_type === 'RETURN';
                                return (
                                    <div className={`inv-adjust-preview inv-adjust-preview--${isInward ? 'inward' : 'outward'}`} style={{ margin: '0 16px' }}>
                                        <span className="inv-adjust-current-label">After adjustment</span>
                                        <span className="inv-adjust-current-value" style={{ color: isInward ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)' }}>
                                            {newQty.toLocaleString()} {item?.unit || ''}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>
                        <form onSubmit={handleAdjustSubmit} className="stack-md" style={{ padding: '0 16px 16px' }}>
                            <div>
                                <label className="label">Adjustment Type</label>
                                <select className="input-field" value={adjustData.adjustment_type}
                                    onChange={e => setAdjustData({ ...adjustData, adjustment_type: e.target.value })}>
                                    <option value="INWARD">Inward (Add Stock)</option>
                                    <option value="OUTWARD">Outward (Remove Stock)</option>
                                    <option value="WASTE">Waste</option>
                                    <option value="RETURN">Return</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">Quantity *</label>
                                <input type="number" step="0.001" className="input-field" required autoFocus
                                    value={adjustData.quantity_delta}
                                    onChange={e => setAdjustData({ ...adjustData, quantity_delta: e.target.value })}
                                    placeholder="e.g. 2 or 0.5" />
                            </div>
                            <div>
                                <label className="label">Reason *</label>
                                <input className="input-field" required
                                    value={adjustData.reason}
                                    onChange={e => setAdjustData({ ...adjustData, reason: e.target.value })}
                                    placeholder="e.g. Received from supplier, damaged unit" />
                            </div>
                            <div className="row justify-end gap-sm">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!adjustData.quantity_delta || !adjustData.reason}>Confirm</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Rate Modal */}
            {showAddRateModal && detailItem && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">Update Rate: {detailItem.name}</h2>
                            <button className="modal-close" onClick={() => setShowAddRateModal(false)}><X size={20} /></button>
                        </div>
                        <div className="stack-md" style={{ padding: 16 }}>
                            <div>
                                <label className="label">New Rate (₹) *</label>
                                <input type="number" step="0.01" className="input-field" required autoFocus
                                    value={newRate.rate}
                                    onChange={e => setNewRate({ ...newRate, rate: e.target.value })}
                                    placeholder="Enter new rate" />
                            </div>
                            <div>
                                <label className="label">Effective Date</label>
                                <input type="date" className="input-field"
                                    value={newRate.effective_date}
                                    onChange={e => setNewRate({ ...newRate, effective_date: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Supplier (optional)</label>
                                <input className="input-field" value={newRate.supplier_name}
                                    onChange={e => setNewRate({ ...newRate, supplier_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Notes (optional)</label>
                                <input className="input-field" value={newRate.notes}
                                    onChange={e => setNewRate({ ...newRate, notes: e.target.value })} />
                            </div>
                            <div className="row justify-end gap-sm">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddRateModal(false)}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={handleAddRate}>Add Rate</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default ConsumablesManagement;

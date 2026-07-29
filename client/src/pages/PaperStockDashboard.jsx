import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { 
    Package, AlertTriangle, TrendingUp, 
    Search, MapPin, Layers, RefreshCcw, Plus, Minus, History, Repeat, ShoppingCart, X,
    IndianRupee, FileText, Tag, Eye, Scissors, Truck
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import './InventoryModern.css';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';

const PaperStockDashboard = () => {
    useSEO('Paper Stock Dashboard');

    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stock, setStock] = useState([]);
    const [branches, setBranches] = useState([]);
    const [filters, setFilters] = useState({
        branch_id: '',
        category: '',
        search: ''
    });

    const [tabCounts, setTabCounts] = useState({ general: 0, paper: 0, consumables: 0 });

    // Detail panel
    const [detailItem, setDetailItem] = useState(null);
    const [detailTab, setDetailTab] = useState('details');
    const [rateHistory, setRateHistory] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // Add rate modal
    const [showAddRateModal, setShowAddRateModal] = useState(false);
    const [newRate, setNewRate] = useState({ rate: '', effective_date: new Date().toISOString().split('T')[0], unit_type: 'Reams', supplier_name: '', notes: '' });

    // Add paper type modal
    const [showAddPaperModal, setShowAddPaperModal] = useState(false);
    const [newPaper, setNewPaper] = useState({ category: 'OFFSET', size_name: '', width_mm: '', height_mm: '', gsm: '', brand: '' });
    const [addingPaper, setAddingPaper] = useState(false);

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
                
                const generalCount = genRes.data?.total || (Array.isArray(genRes.data) ? genRes.data.length : 0);
                const paperCount = Array.isArray(paperRes.data) ? paperRes.data.length : 0;
                const consumablesCount = Array.isArray(consRes.data) ? consRes.data.length : 0;

                setTabCounts({
                    general: generalCount,
                    paper: paperCount,
                    consumables: consumablesCount
                });
            } catch (err) {
                console.error('Error fetching tab counts:', err);
            }
        };
        fetchTabCounts();
        return () => { isMounted = false; };
    }, []);

    const fetchStock = async () => {
        setLoading(true);
        try {
            const [stockRes, branchesRes] = await Promise.all([
                api.get('/paperInventory/stock', { params: filters }),
                api.get('/branches')
            ]);
            setStock(stockRes.data);
            setBranches(branchesRes.data);
        } catch {
            toast.error('Failed to load stock data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStock();
    }, [filters]);

    const handleOpenDetail = async (item) => {
        setDetailItem(item);
        setDetailTab('details');
        setDetailLoading(true);
        try {
            const ratesRes = await api.get(`/paperInventory/types/${item.paper_type_id}/rates`);
            setRateHistory(ratesRes.data || []);
        } catch {
            setRateHistory([]);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleAddRate = async () => {
        if (!newRate.rate || newRate.rate <= 0) { toast.error('Valid rate required'); return; }
        try {
            await api.post(`/paperInventory/types/${detailItem.paper_type_id}/rates`, {
                rate: Number(newRate.rate),
                effective_date: newRate.effective_date,
                unit_type: newRate.unit_type,
                supplier_name: newRate.supplier_name || undefined,
                notes: newRate.notes || undefined
            });
            toast.success('Rate added');
            setShowAddRateModal(false);
            setNewRate({ rate: '', effective_date: new Date().toISOString().split('T')[0], unit_type: 'Reams', supplier_name: '', notes: '' });
            const ratesRes = await api.get(`/paperInventory/types/${detailItem.paper_type_id}/rates`);
            setRateHistory(ratesRes.data || []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add rate');
        }
    };

    const handleAddPaper = async (e) => {
        e.preventDefault();
        setAddingPaper(true);
        try {
            await api.post('/paperInventory/types', {
                category: newPaper.category,
                size_name: newPaper.size_name,
                width_mm: Number(newPaper.width_mm) || null,
                height_mm: Number(newPaper.height_mm) || null,
                gsm: Number(newPaper.gsm) || null,
                brand: newPaper.brand || null
            });
            toast.success('Paper type added successfully');
            setShowAddPaperModal(false);
            setNewPaper({ category: 'OFFSET', size_name: '', width_mm: '', height_mm: '', gsm: '', brand: '' });
            fetchStock();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to add paper type');
        } finally {
            setAddingPaper(false);
        }
    };

    // Deduplicate stock items by paper_type_id for the detail view
    const uniquePaperTypes = stock.reduce((acc, item) => {
        if (!acc.find(a => a.paper_type_id === item.paper_type_id)) {
            acc.push(item);
        }
        return acc;
    }, []);

    const stats = {
        totalSheets: stock.reduce((acc, item) => acc + Number(item.current_sheets), 0),
        lowStockCount: stock.filter(item => Number(item.current_sheets) < Number(item.reorder_level)).length,
        totalSkus: uniquePaperTypes.length
    };

    return (
        <PageContainer>
            {/* ─── Header ─── */}
            <div className="inv-header">
                <div className="inv-header-left">
                    <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Inventory System / Paper Stock</div>
                    <h1 className="inv-header-title">Inventory</h1>
                    <p className="inv-header-desc">Real-time substrate tracking and management.</p>
                </div>
            </div>

            {/* ─── Segmented Tab Navigation ─── */}
            <div className="inv-tabs">
                <div 
                    onClick={() => navigate('/dashboard/inventory')}
                    className="inv-tab"
                >
                    <div className="inv-tab-icon">
                        <Package size={20} />
                    </div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">General Inventory</span>
                        <span className="inv-tab-count">{tabCounts.general.toLocaleString()} Items</span>
                    </div>
                </div>
                <div 
                    onClick={() => navigate('/dashboard/inventory/paper')}
                    className="inv-tab inv-tab--active"
                >
                    <div className="inv-tab-icon">
                        <Layers size={20} />
                    </div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">Paper Stock</span>
                        <span className="inv-tab-count">{tabCounts.paper.toLocaleString()} Types</span>
                    </div>
                </div>
                <div 
                    onClick={() => navigate('/dashboard/inventory/consumables')}
                    className="inv-tab"
                >
                    <div className="inv-tab-icon">
                        <ShoppingCart size={20} />
                    </div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">Consumables</span>
                        <span className="inv-tab-count">{tabCounts.consumables.toLocaleString()} Items</span>
                    </div>
                </div>
            </div>

            {/* ─── KPI Row ─── */}
            <div className="inv-kpi-row">
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Layers size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">{stats.totalSheets.toLocaleString()}</span>
                        <span className="inv-kpi-label">Total Sheets</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><AlertTriangle size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value" style={{ color: stats.lowStockCount > 0 ? 'var(--error)' : 'var(--text)' }}>{stats.lowStockCount}</span>
                        <span className="inv-kpi-label">Low Stock Alerts</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Package size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">{stats.totalSkus}</span>
                        <span className="inv-kpi-label">Active Paper Types</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><MapPin size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">{branches.length}</span>
                        <span className="inv-kpi-label">Active Branches</span>
                    </div>
                </div>
            </div>

            {/* ─── Toolbar ─── */}
            <div className="inv-toolbar">
                <div className="inv-toolbar-row">
                    <div className="inv-search">
                        <span className="inv-search-icon"><Search size={16} /></span>
                        <input 
                            className="inv-search-input" 
                            placeholder="Search paper size or brand..." 
                            value={filters.search}
                            onChange={(e) => setFilters({...filters, search: e.target.value})}
                        />
                        {filters.search && (
                            <button className="inv-search-clear" onClick={() => setFilters({...filters, search: ''})}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary" onClick={() => setShowAddPaperModal(true)}>
                            <Plus size={16} /> Add Paper Type
                        </button>
                        <button className="btn btn-primary" onClick={() => navigate('/dashboard/paper/inward')}>
                            <Plus size={18} /> Inward Stock
                        </button>
                    </div>
                </div>

                <div className="inv-toolbar-row justify-between wrap gap-sm">
                    <div className="inv-chips">
                        <div className="inv-chip">
                            <BranchSelect 
                                value={filters.branch_id}
                                onChange={(e) => setFilters({...filters, branch_id: e.target.value})}
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </BranchSelect>
                        </div>
                        <div className="inv-chip">
                            <select 
                                value={filters.category}
                                onChange={(e) => setFilters({...filters, category: e.target.value})}
                            >
                                <option value="">All Categories</option>
                                <option value="LASER">Laser</option>
                                <option value="OFFSET">Offset</option>
                                <option value="BOTH">Laser & Offset (Both)</option>
                            </select>
                        </div>
                        {(filters.branch_id || filters.category || filters.search) && (
                            <button className="inv-chip-clear" onClick={() => setFilters({branch_id: '', category: '', search: ''})}>
                                <X size={12} /> Clear
                            </button>
                        )}
                    </div>

                    <div className="row gap-xs items-center">
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/paper/outward')}>
                            <Minus size={14} /> Outward Stock
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/paper/cut')}>
                            <Scissors size={14} /> Cut & Transfer
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/paper/transfer')}>
                            <Repeat size={14} /> Transfer
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/paper/pending-transfers')}>
                            <Truck size={14} /> Pending Transfers
                        </button>
                        <Link to="/dashboard/paper/movements" className="btn btn-ghost btn-sm">
                            <History size={14} /> History
                        </Link>
                    </div>
                </div>
            </div>

            {/* ─── Main content with detail panel ─── */}
            <div className="inv-flex-row">
                {/* Stock List */}
                <div className="inv-table-container" style={{ flex: 1, minWidth: 0 }}>
                    <div className="inv-table-scroll">
                        <table className="inv-table">
                            <thead>
                                <tr>
                                    <th>Paper Type</th>
                                    <th>Branch</th>
                                    <th>Category</th>
                                    <th>Current Stock</th>
                                    <th>Unit Equivalent</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'right', width: 80 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="text-center p-xl">
                                            <RefreshCcw className="animate-spin muted" size={32} />
                                        </td>
                                    </tr>
                                ) : stock.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="text-center p-xl muted">
                                            No paper stock found.
                                        </td>
                                    </tr>
                                ) : (
                                    stock.map(item => {
                                        const currentSheets = Number(item.current_sheets || 0);
                                        const reorderLevel = Number(item.reorder_level || 0);
                                        const isZero = currentSheets === 0;
                                        const isLow = !isZero && reorderLevel > 0 && currentSheets < reorderLevel;
                                        let unitEquivalent = '-';
                                        if (item.category === 'LASER' || item.category === 'BOTH') {
                                            const reams = Math.floor(currentSheets / 500);
                                            const extra = currentSheets % 500;
                                            unitEquivalent = `${reams} Reams ${extra > 0 ? `+ ${extra} Sh` : ''}`;
                                        }

                                        return (
                                            <tr key={`${item.paper_type_id}-${item.branch_id || 0}`} onClick={() => handleOpenDetail(item)} style={{ cursor: 'pointer' }}>
                                                <td>
                                                    <div className="font-bold">{item.size_name}</div>
                                                    <div className="text-xs muted">{item.gsm ? `${item.gsm} GSM` : ''} {item.brand ? `• ${item.brand}` : ''}</div>
                                                </td>
                                                <td>
                                                    <div className="row items-center gap-xs">
                                                        <MapPin size={14} className="muted" />
                                                        {item.branch_name || 'Main Branch'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`inv-pill ${item.category === 'LASER' ? 'inv-pill--ok' : (item.category === 'BOTH' ? 'inv-pill--info' : 'inv-pill--low')}`} style={{ textTransform: 'uppercase' }}>
                                                        {item.category === 'BOTH' ? 'LASER & OFFSET' : item.category}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ fontSize: '14px', fontWeight: 700, color: isZero ? 'var(--text-muted)' : (isLow ? 'var(--error)' : 'inherit') }}>
                                                        {currentSheets.toLocaleString()} <span className="text-xs font-normal muted">Sheets</span>
                                                    </div>
                                                </td>
                                                <td className="muted text-sm">{unitEquivalent}</td>
                                                <td>
                                                    <span className={`inv-pill ${isZero ? 'inv-pill--low' : (isLow ? 'inv-pill--low' : 'inv-pill--ok')}`} style={{ opacity: isZero ? 0.7 : 1 }}>
                                                        {isZero ? 'No Stock' : (isLow ? 'Low Stock' : 'Good')}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <div className="inv-actions justify-end">
                                                        <button 
                                                            className="inv-action-btn" 
                                                            title="Quick Inward"
                                                            onClick={(e) => { e.stopPropagation(); navigate('/dashboard/paper/inward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } }); }}
                                                        >
                                                            <Plus size={14} />
                                                        </button>
                                                        <button 
                                                            className="inv-action-btn" 
                                                            title="Quick Outward"
                                                            onClick={(e) => { e.stopPropagation(); navigate('/dashboard/paper/outward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } }); }}
                                                        >
                                                            <Minus size={14} />
                                                        </button>
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
                            <h3 className="inv-detail-title">{detailItem.size_name}</h3>
                            <button className="inv-action-btn" onClick={() => setDetailItem(null)}><X size={16} /></button>
                        </div>
                        <div className="inv-detail-tabs">
                            {['details', 'rates'].map(tab => (
                                <button key={tab}
                                    onClick={() => setDetailTab(tab)}
                                    className={`inv-detail-tab ${detailTab === tab ? 'inv-detail-tab--active' : ''}`}
                                >
                                    {tab === 'details' ? <><FileText size={12} />Details</> : <><TrendingUp size={12} />Rates</>}
                                </button>
                            ))}
                        </div>
                        <div className="inv-detail-body">
                            {detailTab === 'details' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <div className="inv-spec-grid">
                                        <div className="inv-spec-item">
                                            <span className="inv-spec-label">Size</span>
                                            <span className="inv-spec-value">{detailItem.size_name}</span>
                                        </div>
                                        {detailItem.gsm && <div className="inv-spec-item">
                                            <span className="inv-spec-label">GSM</span>
                                            <span className="inv-spec-value">{detailItem.gsm}</span>
                                        </div>}
                                        {detailItem.brand && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Brand</span>
                                            <span className="inv-spec-value">{detailItem.brand}</span>
                                        </div>}
                                        <div className="inv-spec-item">
                                            <span className="inv-spec-label">Category</span>
                                            <span className="inv-spec-value">{detailItem.category}</span>
                                        </div>
                                        {detailItem.width_mm && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Width</span>
                                            <span className="inv-spec-value">{detailItem.width_mm} mm</span>
                                        </div>}
                                        {detailItem.height_mm && <div className="inv-spec-item">
                                            <span className="inv-spec-label">Height</span>
                                            <span className="inv-spec-value">{detailItem.height_mm} mm</span>
                                        </div>}
                                    </div>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Current Stock</span>
                                            <span className="inv-detail-value" style={{ fontWeight: 700 }}>
                                                {Number(detailItem.current_sheets).toLocaleString()} Sheets
                                            </span>
                                        </div>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Reorder Level</span>
                                            <span className="inv-detail-value">{detailItem.reorder_level || 0} Sheets</span>
                                        </div>
                                        <div className="inv-detail-row">
                                            <span className="inv-detail-label">Branch</span>
                                            <span className="inv-detail-value">{detailItem.branch_name}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {detailTab === 'rates' && (
                                <div>
                                    <div className="inv-section-header">
                                        <span className="inv-section-label">Rate change history</span>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAddRateModal(true)}><Plus size={14} /> Add Rate</button>
                                    </div>
                                    {detailLoading ? (
                                        <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>Loading...</div>
                                    ) : rateHistory.length === 0 ? (
                                        <div className="muted" style={{ fontSize: 12, textAlign: 'center', padding: 16 }}>No rate history recorded. Add a rate or record an inward entry with a rate.</div>
                                    ) : (
                                        rateHistory.map(r => (
                                            <div key={r.id} className={`inv-rate-item ${r.id === detailItem.current_rate_id ? 'inv-rate-item--active' : ''}`}>
                                                <div>
                                                    <div className="inv-rate-amount">₹{Number(r.rate).toLocaleString()}/{r.unit_type || 'Reams'}</div>
                                                    <div className="inv-rate-meta">
                                                        {r.effective_date ? new Date(r.effective_date).toLocaleDateString() : '-'}
                                                        {r.supplier_name && ` • ${r.supplier_name}`}
                                                    </div>
                                                    {r.notes && <div className="inv-rate-meta" style={{ fontSize: 11 }}>{r.notes}</div>}
                                                </div>
                                                <div>
                                                    {r.id === detailItem.current_rate_id && (
                                                        <span className="inv-rate-badge">ACTIVE</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Rate Modal */}
            {showAddRateModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">Add Paper Rate</h2>
                            <button className="modal-close" onClick={() => setShowAddRateModal(false)}><X size={20} /></button>
                        </div>
                        <div className="stack-md" style={{ padding: '0 16px 16px' }}>
                            <div className="inv-detail-row" style={{ padding: '8px 0' }}>
                                <span className="inv-detail-label">Paper</span>
                                <span className="inv-detail-value font-bold">{detailItem?.size_name} {detailItem?.gsm ? `${detailItem.gsm} GSM` : ''}</span>
                            </div>
                            <div>
                                <label className="label">Rate (₹) *</label>
                                <input type="number" step="0.01" className="input-field" required autoFocus
                                    value={newRate.rate}
                                    onChange={e => setNewRate({ ...newRate, rate: e.target.value })}
                                    placeholder="e.g. 450.00" />
                            </div>
                            <div>
                                <label className="label">Per Unit</label>
                                <select className="input-field" value={newRate.unit_type}
                                    onChange={e => setNewRate({ ...newRate, unit_type: e.target.value })}>
                                    <option value="Reams">Ream (500 sheets)</option>
                                    <option value="Packets">Packet (100 sheets)</option>
                                    <option value="Sheets">Sheet</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">Effective Date</label>
                                <input type="date" className="input-field"
                                    value={newRate.effective_date}
                                    onChange={e => setNewRate({ ...newRate, effective_date: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Supplier Name</label>
                                <input className="input-field" placeholder="e.g. ABC Paper Mill"
                                    value={newRate.supplier_name}
                                    onChange={e => setNewRate({ ...newRate, supplier_name: e.target.value })} />
                            </div>
                            <div>
                                <label className="label">Notes</label>
                                <input className="input-field" placeholder="Optional notes"
                                    value={newRate.notes}
                                    onChange={e => setNewRate({ ...newRate, notes: e.target.value })} />
                            </div>
                            <div className="row justify-end gap-sm">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddRateModal(false)}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={handleAddRate}>Save Rate</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Add Paper Type Modal */}
            {showAddPaperModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '480px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">Add Paper Type</h2>
                            <button className="modal-close" onClick={() => setShowAddPaperModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleAddPaper} className="stack-md" style={{ padding: 16 }}>
                            <div>
                                <label className="label">Category *</label>
                                <select
                                    className="input-field"
                                    value={newPaper.category}
                                    onChange={e => setNewPaper({ ...newPaper, category: e.target.value })}
                                >
                                    <option value="OFFSET">OFFSET</option>
                                    <option value="LASER">LASER</option>
                                    <option value="BOTH">BOTH (LASER & OFFSET)</option>
                                </select>
                            </div>

                            <div>
                                <label className="label">Size / Name *</label>
                                <input
                                    className="input-field"
                                    required
                                    placeholder="e.g. A4, A3, 12x18, 23x36, Royal"
                                    value={newPaper.size_name}
                                    onChange={e => setNewPaper({ ...newPaper, size_name: e.target.value })}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="label">Width (mm)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        placeholder="e.g. 210"
                                        value={newPaper.width_mm}
                                        onChange={e => setNewPaper({ ...newPaper, width_mm: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="label">Height (mm)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        placeholder="e.g. 297"
                                        value={newPaper.height_mm}
                                        onChange={e => setNewPaper({ ...newPaper, height_mm: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label className="label">GSM</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        placeholder="e.g. 300, 130, 80"
                                        value={newPaper.gsm}
                                        onChange={e => setNewPaper({ ...newPaper, gsm: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="label">Brand / Mill</label>
                                    <input
                                        className="input-field"
                                        placeholder="e.g. Century, BILT"
                                        value={newPaper.brand}
                                        onChange={e => setNewPaper({ ...newPaper, brand: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="row justify-end gap-sm" style={{ marginTop: 12 }}>
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAddPaperModal(false)} disabled={addingPaper}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={addingPaper}>
                                    {addingPaper ? 'Adding...' : 'Add Paper Type'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default PaperStockDashboard;

import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { 
    Package, ArrowRight, ArrowLeft, AlertTriangle, TrendingUp, 
    Search, Filter, MapPin, Layers, RefreshCcw, Plus, Minus, History, Repeat, ShoppingCart, X
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

    const stats = {
        totalSheets: stock.reduce((acc, item) => acc + Number(item.current_sheets), 0),
        lowStockCount: stock.filter(item => Number(item.current_sheets) < Number(item.reorder_level)).length,
        totalSkus: stock.length
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
                {/* Row 1: Search and Primary Action */}
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
                    <button className="btn btn-primary" onClick={() => navigate('/dashboard/paper/inward')}>
                        <Plus size={18} /> Inward Stock
                    </button>
                </div>

                {/* Row 2: Filters and Secondary Actions */}
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
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/paper/transfer')}>
                            <Repeat size={14} /> Transfer
                        </button>
                        <Link to="/dashboard/paper/movements" className="btn btn-ghost btn-sm">
                            <History size={14} /> History
                        </Link>
                    </div>
                </div>
            </div>

            {/* Stock List */}
            <div className="inv-table-container">
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
                                    const isLow = Number(item.current_sheets) < Number(item.reorder_level);
                                    // Calculate reams/packets for laser
                                    let unitEquivalent = '-';
                                    if (item.category === 'LASER') {
                                        const reams = Math.floor(item.current_sheets / 500);
                                        const extra = item.current_sheets % 500;
                                        unitEquivalent = `${reams} Reams ${extra > 0 ? `+ ${extra} Sh` : ''}`;
                                    }

                                    return (
                                        <tr key={`${item.paper_type_id}-${item.branch_id}`}>
                                            <td>
                                                <div className="font-bold">{item.size_name}</div>
                                                <div className="text-xs muted">{item.gsm ? `${item.gsm} GSM` : ''} {item.brand ? `• ${item.brand}` : ''}</div>
                                            </td>
                                            <td>
                                                <div className="row items-center gap-xs">
                                                    <MapPin size={14} className="muted" />
                                                    {item.branch_name}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`inv-pill ${item.category === 'LASER' ? 'inv-pill--ok' : 'inv-pill--low'}`} style={{ textTransform: 'uppercase' }}>
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '14px', fontWeight: 700, color: isLow ? 'var(--error)' : 'inherit' }}>
                                                    {Number(item.current_sheets).toLocaleString()} <span className="text-xs font-normal muted">Sheets</span>
                                                </div>
                                            </td>
                                            <td className="muted text-sm">{unitEquivalent}</td>
                                            <td>
                                                <span className={`inv-pill ${isLow ? 'inv-pill--low' : 'inv-pill--ok'}`}>
                                                    {isLow ? 'Low Stock' : 'Good'}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="inv-actions justify-end">
                                                    <button 
                                                        className="inv-action-btn" 
                                                        title="Quick Inward"
                                                        onClick={() => navigate('/dashboard/paper/inward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } })}
                                                    >
                                                        <Plus size={14} />
                                                    </button>
                                                    <button 
                                                        className="inv-action-btn" 
                                                        title="Quick Outward"
                                                        onClick={() => navigate('/dashboard/paper/outward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } })}
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
        </PageContainer>
    );
};

export default PaperStockDashboard;

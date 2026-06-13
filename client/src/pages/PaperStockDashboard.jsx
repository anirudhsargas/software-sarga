import React, { useState, useEffect } from 'react';
import { 
    Package, ArrowRight, ArrowLeft, AlertTriangle, TrendingUp, 
    Search, Filter, MapPin, Layers, RefreshCcw, Plus, Minus, History, Repeat
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const PaperStockDashboard = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stock, setStock] = useState([]);
    const [branches, setBranches] = useState([]);
    const [filters, setFilters] = useState({
        branch_id: '',
        category: '',
        search: ''
    });

    const fetchStock = async () => {
        setLoading(true);
        try {
            const [stockRes, branchesRes] = await Promise.all([
                api.get('/paperInventory/stock', { params: filters }),
                api.get('/branches')
            ]);
            setStock(stockRes.data);
            setBranches(branchesRes.data);
        } catch (err) {
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
        <div className="stack-lg p-md">
            {/* Header */}
            <div className="row space-between items-center wrap gap-md">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Layers size={32} className="text-primary" /> Paper Inventory
                    </h1>
                    <p className="section-subtitle">Real-time substrate tracking and management.</p>
                </div>
                <div className="row gap-sm">
                    <button className="btn btn-primary" onClick={() => navigate('/dashboard/paper/inward')}>
                        <Plus size={18} /> Inward Stock
                    </button>
                    <button className="btn btn-warning" onClick={() => navigate('/dashboard/paper/outward')}>
                        <Minus size={18} /> Outward Stock
                    </button>
                    <button className="btn btn-ghost" onClick={() => navigate('/dashboard/paper/transfer')}>
                        <Repeat size={18} /> Transfer
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid--3 gap-md">
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <span className="muted text-xs font-bold uppercase">Total Sheets</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{stats.totalSheets.toLocaleString()}</span>
                        <TrendingUp size={24} className="text-primary" />
                    </div>
                </div>
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--error)' }}>
                    <span className="muted text-xs font-bold uppercase">Low Stock Alerts</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--error)' }}>{stats.lowStockCount}</span>
                        <AlertTriangle size={24} className="text-error" />
                    </div>
                </div>
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--success)' }}>
                    <span className="muted text-xs font-bold uppercase">Active Paper Types</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{stats.totalSkus}</span>
                        <Package size={24} className="text-success" />
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="panel row gap-md items-center wrap">
                <div className="flex-1 min-w-[200px]" style={{ position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
                    <input 
                        className="input-field" 
                        style={{ paddingLeft: 40 }} 
                        placeholder="Search paper size or brand..." 
                        value={filters.search}
                        onChange={(e) => setFilters({...filters, search: e.target.value})}
                    />
                </div>
                <div className="row gap-sm wrap">
                    <select 
                        className="input-field" 
                        style={{ width: 160 }}
                        value={filters.branch_id}
                        onChange={(e) => setFilters({...filters, branch_id: e.target.value})}
                    >
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select 
                        className="input-field" 
                        style={{ width: 140 }}
                        value={filters.category}
                        onChange={(e) => setFilters({...filters, category: e.target.value})}
                    >
                        <option value="">All Categories</option>
                        <option value="LASER">Laser</option>
                        <option value="OFFSET">Offset</option>
                    </select>
                    <Link to="/dashboard/paper/movements" className="btn btn-ghost">
                        <History size={18} /> History
                    </Link>
                </div>
            </div>

            {/* Stock List */}
            <div className="panel p-0 overflow-hidden">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Paper Type</th>
                                <th>Branch</th>
                                <th>Category</th>
                                <th>Current Stock</th>
                                <th>Unit Equivalent</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
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
                                                <span className={`badge ${item.category === 'LASER' ? 'badge-primary' : 'badge-secondary'}`}>
                                                    {item.category}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: isLow ? 'var(--error)' : 'inherit' }}>
                                                    {Number(item.current_sheets).toLocaleString()} <span className="text-xs font-normal muted">Sheets</span>
                                                </div>
                                            </td>
                                            <td className="muted text-sm">{unitEquivalent}</td>
                                            <td>
                                                {isLow ? (
                                                    <span className="badge badge-error row items-center gap-xs">
                                                        <AlertTriangle size={12} /> Low Stock
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-success">Good</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="row gap-xs justify-end">
                                                    <button 
                                                        className="btn btn-ghost btn-sm" 
                                                        title="Quick Inward"
                                                        onClick={() => navigate('/dashboard/paper/inward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } })}
                                                    >
                                                        <Plus size={16} />
                                                    </button>
                                                    <button 
                                                        className="btn btn-ghost btn-sm" 
                                                        title="Quick Outward"
                                                        onClick={() => navigate('/dashboard/paper/outward', { state: { paper_type_id: item.paper_type_id, branch_id: item.branch_id } })}
                                                    >
                                                        <Minus size={16} />
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
        </div>
    );
};

export default PaperStockDashboard;

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Package, AlertTriangle, TrendingUp, Plus, 
  Search, RefreshCcw, Layout, FileSearch, ArrowRight,
  Filter, Layers, Scale, Move
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const PaperManagement = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [paperStock, setPaperStock] = useState([]);
    const [stats, setStats] = useState({
        totalTypes: 0,
        lowStockItems: 0,
        totalSheets: 0,
        reorderValue: 0
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGsm, setFilterGsm] = useState('');
    const [filterSize, setFilterSize] = useState('');

    const fetchPaperStock = async () => {
        setLoading(true);
        try {
            // Fetch all inventory items that might be paper
            const res = await api.get('/inventory', { 
                params: { 
                    limit: 1000,
                    category: 'Paper' // Assuming 'Paper' is a category
                } 
            });
            
            const items = res.data.data || [];
            setPaperStock(items);

            // Calculate stats
            const low = items.filter(i => Number(i.quantity) <= Number(i.reorder_level || 0));
            const sheets = items.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
            
            setStats({
                totalTypes: items.length,
                lowStockItems: low.length,
                totalSheets: sheets,
                reorderValue: low.length * 10 // Mock value
            });
        } catch (err) {
            toast.error('Failed to load paper inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPaperStock();
    }, []);

    const filteredStock = useMemo(() => {
        return paperStock.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesGsm = filterGsm ? item.name.includes(filterGsm) : true;
            const matchesSize = filterSize ? item.name.toLowerCase().includes(filterSize.toLowerCase()) : true;
            return matchesSearch && matchesGsm && matchesSize;
        });
    }, [paperStock, searchTerm, filterGsm, filterSize]);

    const gsmOptions = ['70', '80', '100', '130', '170', '210', '250', '300'];
    const sizeOptions = ['A4', 'A3', '12x18', '13x19', 'Legal'];

    if (loading) return <div className="panel flex-center" style={{ minHeight: 400 }}><RefreshCcw className="animate-spin" /></div>;

    return (
        <div className="stack-lg p-md">
            {/* Header */}
            <div className="row space-between items-center">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FileText size={32} className="text-primary" /> Paper Management
                    </h1>
                    <p className="section-subtitle">Monitor stock levels, sizes, and gsm for publication and printing.</p>
                </div>
                <div className="row gap-sm">
                    <button className="btn btn-secondary" onClick={() => navigate('/dashboard/paper-layout')}>
                        <Layout size={18} /> Plan Layout
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/dashboard/inventory')}>
                        <Plus size={18} /> Update Stock
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid--4 mt-md">
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Total Paper Types</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.totalTypes}</span>
                        <div className="badge badge-primary">Active</div>
                    </div>
                </div>
                
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--danger)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Critical Stock</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--danger)' }}>{stats.lowStockItems}</span>
                        <AlertTriangle size={20} className="text-danger" />
                    </div>
                    <span className="text-xs text-danger">Needs ordering</span>
                </div>

                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--success)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Total Sheets Available</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.totalSheets.toLocaleString()}</span>
                        <TrendingUp size={20} className="text-success" />
                    </div>
                </div>

                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Quick Actions</span>
                    <div className="stack-xs mt-xs">
                        <button className="btn btn-ghost btn-sm btn--full text-left" onClick={() => navigate('/dashboard/quotation')}>
                            <ArrowRight size={14} /> Estimate Job Paper
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="panel stack-md">
                <div className="row gap-md items-center">
                    <div className="flex-1" style={{ position: 'relative' }}>
                        <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
                        <input 
                            className="input-field" 
                            style={{ paddingLeft: 40 }} 
                            placeholder="Search paper by name, brand or SKU..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="row gap-sm items-center">
                        <Filter size={18} className="muted" />
                        <select className="input-field" style={{ width: 140 }} value={filterGsm} onChange={(e) => setFilterGsm(e.target.value)}>
                            <option value="">Any GSM</option>
                            {gsmOptions.map(g => <option key={g} value={g}>{g} GSM</option>)}
                        </select>
                        <select className="input-field" style={{ width: 140 }} value={filterSize} onChange={(e) => setFilterSize(e.target.value)}>
                            <option value="">Any Size</option>
                            {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                </div>

                <div className="table-scroll" style={{ maxHeight: '500px' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Paper Name</th>
                                <th>Category</th>
                                <th>Available Stock</th>
                                <th>Reorder Level</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStock.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center p-xl muted">
                                        <Package size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                                        <div>No paper items matching your filters. Ensure items are tagged under 'Paper' category in Inventory.</div>
                                    </td>
                                </tr>
                            ) : (
                                filteredStock.map(item => {
                                    const isLow = Number(item.quantity) <= Number(item.reorder_level || 0);
                                    return (
                                        <tr key={item.id} className={isLow ? 'bg-danger-light' : ''}>
                                            <td>
                                                <div className="stack-xs">
                                                    <span className="font-bold">{item.name}</span>
                                                    <span className="text-xs muted">{item.sku}</span>
                                                </div>
                                            </td>
                                            <td><span className="badge">{item.category}</span></td>
                                            <td>
                                                <span className={`font-bold ${isLow ? 'text-danger' : ''}`} style={{ fontSize: '1.1rem' }}>
                                                    {item.quantity} {item.unit}
                                                </span>
                                            </td>
                                            <td>{item.reorder_level || 0}</td>
                                            <td>
                                                <div className={`badge ${isLow ? 'badge--danger' : 'badge--success'}`}>
                                                    {isLow ? 'Critical' : 'Good'}
                                                </div>
                                            </td>
                                            <td>
                                                <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/dashboard/inventory?search=${item.sku}`)}>
                                                    View in Inventory
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Layout Reference Grid */}
            <div className="stack-md mt-md">
                <h3 className="section-title" style={{ fontSize: '1.25rem' }}>Common Paper Standards</h3>
                <div className="grid grid--5">
                    {[
                        { name: 'Art Board', desc: 'Glossy coating for premium covers', gsm: '250-300' },
                        { name: 'Bond Paper', desc: 'Standard office and form paper', gsm: '70-90' },
                        { name: 'Maplitho', desc: 'Standard book publication paper', gsm: '60-80' },
                        { name: 'Gloss Art', desc: 'Magazine and brochure inner pages', gsm: '100-170' },
                        { name: 'Sunlit', desc: 'Premium white copier paper', gsm: '75-80' }
                    ].map(p => (
                        <div key={p.name} className="panel stack-xs bg-surface-2">
                            <span className="font-bold">{p.name}</span>
                            <span className="text-xs muted">{p.desc}</span>
                            <div className="badge badge-ghost mt-xs">{p.gsm} GSM Typical</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PaperManagement;

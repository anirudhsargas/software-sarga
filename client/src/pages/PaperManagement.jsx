import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Package, AlertTriangle, TrendingUp, Plus, 
  Search, RefreshCcw, Layout, FileSearch, ArrowRight,
  Filter, Layers, Scale, Move, Edit2, Trash2, Check, X,
  ArrowUp, ArrowDown, History, ChevronRight, MapPin
} from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import auth from '../services/auth';

const PaperManagement = () => {
    const navigate = useNavigate();
    const user = auth.getUser();
    const isAdmin = ['Admin', 'Accountant'].includes(user?.role);
    
    const [loading, setLoading] = useState(true);
    const [paperStock, setPaperStock] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterGsm, setFilterGsm] = useState('');
    const [filterSize, setFilterSize] = useState('');
    const [filterBranch, setFilterBranch] = useState('All');
    
    // Modal states
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
    const [selectedItem, setSelectedItem] = useState(null);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustData, setAdjustData] = useState({ id: null, name: '', change: '', reason: '' });
    
    const [formData, setFormData] = useState({
        paper_name: '',
        size: '',
        gsm: '',
        ream_count: 0,
        sheets_per_ream: 500,
        reorder_level_reams: 0,
        supplier_name: '',
        purchase_price_per_ream: '',
        branch: 'Perambra',
        notes: ''
    });

    const fetchPaperStock = async () => {
        setLoading(true);
        try {
            const res = await api.get('/inventory/paper', {
                params: {
                    branch: filterBranch,
                    gsm: filterGsm || undefined,
                    size: filterSize || undefined,
                    search: searchTerm || undefined
                }
            });
            setPaperStock(res.data || []);
        } catch (err) {
            toast.error('Failed to load paper inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPaperStock();
    }, [filterBranch, filterGsm, filterSize, searchTerm]);

    const stats = useMemo(() => {
        const items = paperStock;
        const low = items.filter(i => Number(i.ream_count) <= Number(i.reorder_level_reams || 0));
        const totalSheets = items.reduce((acc, curr) => acc + (Number(curr.total_sheets) || 0), 0);
        const totalValue = items.reduce((acc, curr) => acc + (Number(curr.ream_count) * Number(curr.purchase_price_per_ream || 0)), 0);
        
        return {
            totalTypes: items.length,
            lowStockItems: low.length,
            totalSheets,
            totalValue
        };
    }, [paperStock]);

    const handleOpenAdd = () => {
        setModalMode('add');
        setFormData({
            paper_name: '',
            size: '',
            gsm: '',
            ream_count: 0,
            sheets_per_ream: 500,
            reorder_level_reams: 0,
            supplier_name: '',
            purchase_price_per_ream: '',
            branch: user?.branch_name || 'Perambra',
            notes: ''
        });
        setShowModal(true);
    };

    const handleOpenEdit = (item) => {
        setModalMode('edit');
        setSelectedItem(item);
        setFormData({
            paper_name: item.paper_name,
            size: item.size || '',
            gsm: item.gsm || '',
            ream_count: item.ream_count,
            sheets_per_ream: item.sheets_per_ream,
            reorder_level_reams: item.reorder_level_reams,
            supplier_name: item.supplier_name || '',
            purchase_price_per_ream: item.purchase_price_per_ream || '',
            branch: item.branch,
            notes: item.notes || ''
        });
        setShowModal(true);
    };

    const handleOpenAdjust = (item) => {
        setAdjustData({ id: item.id, name: item.paper_name, change: '', reason: '' });
        setShowAdjustModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this paper item?')) return;
        // Optimistic UI Update
        setPaperStock(prev => prev.filter(item => item.id !== id));
        try {
            await api.delete(`/inventory/paper/${id}`);
            toast.success('Deleted successfully');
            fetchPaperStock();
        } catch (err) {
            toast.error('Failed to delete');
            fetchPaperStock();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'add') {
                await api.post('/inventory/paper', formData);
                toast.success('Paper item added');
            } else {
                // Optimistic UI Update for edit
                const prevPaperStock = [...paperStock];
                setPaperStock(prev => prev.map(p => p.id === selectedItem.id ? { ...p, ...formData } : p));
                await api.put(`/inventory/paper/${selectedItem.id}`, formData);
                toast.success('Paper item updated');
            }
            setShowModal(false);
            fetchPaperStock();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save');
            fetchPaperStock();
        }
    };

    const handleAdjustSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/inventory/paper/${adjustData.id}/adjust`, {
                change_reams: Number(adjustData.change),
                reason: adjustData.reason
            });
            toast.success('Stock adjusted');
            setShowAdjustModal(false);
            fetchPaperStock();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to adjust');
        }
    };

    const gsmOptions = ['70', '80', '100', '130', '170', '210', '250', '300'];
    const sizeOptions = ['A4', 'A3', 'SRA3', '12x18', '13x19', 'Legal', 'Custom'];

    return (
        <div className="stack-lg p-md">
            {/* Header */}
            <div className="row space-between items-center">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FileText size={32} className="text-primary" /> Paper Inventory
                    </h1>
                    <p className="section-subtitle">Real-time stock tracking for printing substrates across branches.</p>
                </div>
                <div className="row gap-sm">
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={handleOpenAdd}>
                            <Plus size={18} /> Add Paper
                        </button>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid--4 mt-md">
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--primary)', background: 'linear-gradient(to right, var(--primary-light), transparent)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Active Stocks</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{stats.totalTypes}</span>
                        <div className="badge badge-primary">SKUs</div>
                    </div>
                </div>
                
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--danger)', background: 'linear-gradient(to right, var(--error-light), transparent)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Low Stock</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--danger)' }}>{stats.lowStockItems}</span>
                        <AlertTriangle size={24} className="text-danger" />
                    </div>
                    <span className="text-xs text-danger font-medium">Items below reorder level</span>
                </div>

                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--success)', background: 'linear-gradient(to right, var(--success-light), transparent)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Total Sheets</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2.2rem', fontWeight: 800 }}>{stats.totalSheets.toLocaleString()}</span>
                        <TrendingUp size={24} className="text-success" />
                    </div>
                    <span className="text-xs muted">Available across all reams</span>
                </div>

                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--warning)', background: 'linear-gradient(to right, var(--warning-light), transparent)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Estimated Value</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2rem', fontWeight: 800 }}>₹{stats.totalValue.toLocaleString()}</span>
                    </div>
                    <span className="text-xs muted">Based on purchase price</span>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="panel stack-md">
                <div className="row gap-md items-center wrap">
                    <div className="flex-1 min-w-[200px]" style={{ position: 'relative' }}>
                        <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
                        <input 
                            className="input-field" 
                            style={{ paddingLeft: 40 }} 
                            placeholder="Search paper by name or size..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    
                    <div className="row gap-sm items-center wrap">
                        <div className="row gap-xs items-center mr-8">
                            <MapPin size={16} className="muted" />
                            <select className="input-field py-xs" style={{ width: 140 }} value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
                                <option value="All">All Branches</option>
                                <option value="Perambra">Perambra</option>
                                <option value="Meppayur">Meppayur</option>
                            </select>
                        </div>

                        <div className="row gap-xs items-center">
                            <Layers size={16} className="muted" />
                            <select className="input-field py-xs" style={{ width: 120 }} value={filterGsm} onChange={(e) => setFilterGsm(e.target.value)}>
                                <option value="">Any GSM</option>
                                {gsmOptions.map(g => <option key={g} value={g}>{g} GSM</option>)}
                            </select>
                        </div>

                        <div className="row gap-xs items-center">
                            <Layout size={16} className="muted" />
                            <select className="input-field py-xs" style={{ width: 120 }} value={filterSize} onChange={(e) => setFilterSize(e.target.value)}>
                                <option value="">Any Size</option>
                                {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <button className="btn btn-ghost" onClick={() => { setSearchTerm(''); setFilterGsm(''); setFilterSize(''); setFilterBranch('All'); }}>
                            Reset
                        </button>
                    </div>
                </div>

                <div className="table-scroll" style={{ minHeight: '300px' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Paper Name</th>
                                <th>Size</th>
                                <th>GSM</th>
                                <th>Branch</th>
                                <th>Reams in Stock</th>
                                <th>Total Sheets</th>
                                <th>Reorder Level</th>
                                <th>Price/Ream</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="text-center p-xl">
                                        <RefreshCcw className="animate-spin muted" size={32} />
                                    </td>
                                </tr>
                            ) : paperStock.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="text-center p-xl muted">
                                        <Package size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                                        <div>No paper items found matching your criteria.</div>
                                    </td>
                                </tr>
                            ) : (
                                paperStock.map(item => {
                                    const isLow = Number(item.ream_count) <= Number(item.reorder_level_reams || 0);
                                    return (
                                        <tr key={item.id} style={{ borderLeft: isLow ? '4px solid var(--danger)' : 'none', backgroundColor: isLow ? 'rgba(var(--error-rgb), 0.05)' : 'transparent' }}>
                                            <td>
                                                <div className="font-bold">{item.paper_name}</div>
                                                {item.notes && <div className="text-xs muted truncate" style={{ maxWidth: 200 }}>{item.notes}</div>}
                                            </td>
                                            <td><span className="badge badge-ghost">{item.size}</span></td>
                                            <td>{item.gsm}</td>
                                            <td>
                                                <div className="row items-center gap-xs">
                                                    <span className={`dot ${item.branch === 'Perambra' ? 'bg-primary' : 'bg-warning'}`} style={{ width: 8, height: 8 }}></span>
                                                    {item.branch}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="row items-center gap-sm">
                                                    <span className={`font-bold ${isLow ? 'text-danger' : ''}`} style={{ fontSize: '1.1rem' }}>
                                                        {item.ream_count}
                                                    </span>
                                                    {isAdmin && (
                                                        <button className="btn btn-ghost btn-sm p-4" title="Quick Adjust" onClick={() => handleOpenAdjust(item)}>
                                                            <Plus size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="muted">{item.total_sheets.toLocaleString()}</td>
                                            <td>{item.reorder_level_reams}</td>
                                            <td>₹{item.purchase_price_per_ream}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="row gap-xs justify-end">
                                                    <button className="btn btn-ghost btn-sm" onClick={() => handleOpenEdit(item)} title="Edit">
                                                        <Edit2 size={16} />
                                                    </button>
                                                    {isAdmin && (
                                                        <button className="btn btn-ghost btn-sm text-error" onClick={() => handleDelete(item.id)} title="Delete">
                                                            <Trash2 size={16} />
                                                        </button>
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

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">{modalMode === 'add' ? 'Add New Paper' : 'Edit Paper Details'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="stack-md">
                            <div className="grid grid--2 gap-md">
                                <div className="span-2">
                                    <label className="label">Paper Name *</label>
                                    <input 
                                        className="input-field" 
                                        required 
                                        value={formData.paper_name} 
                                        onChange={e => setFormData({...formData, paper_name: e.target.value})} 
                                        placeholder="e.g. Sona Magic White"
                                    />
                                </div>
                                <div>
                                    <label className="label">Size</label>
                                    <select className="input-field" value={formData.size} onChange={e => setFormData({...formData, size: e.target.value})}>
                                        <option value="">Select Size</option>
                                        {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">GSM</label>
                                    <input 
                                        type="number" 
                                        className="input-field" 
                                        value={formData.gsm} 
                                        onChange={e => setFormData({...formData, gsm: e.target.value})} 
                                        placeholder="e.g. 170"
                                    />
                                </div>
                                <div>
                                    <label className="label">Branch *</label>
                                    <select className="input-field" required value={formData.branch} onChange={e => setFormData({...formData, branch: e.target.value})}>
                                        <option value="Perambra">Perambra</option>
                                        <option value="Meppayur">Meppayur</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Price per Ream (₹)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        className="input-field" 
                                        value={formData.purchase_price_per_ream} 
                                        onChange={e => setFormData({...formData, purchase_price_per_ream: e.target.value})} 
                                        placeholder="0.00"
                                    />
                                </div>
                                <div>
                                    <label className="label">Initial Reams in Stock</label>
                                    <input 
                                        type="number" 
                                        className="input-field" 
                                        value={formData.ream_count} 
                                        onChange={e => setFormData({...formData, ream_count: Number(e.target.value)})} 
                                    />
                                </div>
                                <div>
                                    <label className="label">Sheets per Ream</label>
                                    <input 
                                        type="number" 
                                        className="input-field" 
                                        value={formData.sheets_per_ream} 
                                        onChange={e => setFormData({...formData, sheets_per_ream: Number(e.target.value)})} 
                                    />
                                </div>
                                <div>
                                    <label className="label">Reorder Level (Reams)</label>
                                    <input 
                                        type="number" 
                                        className="input-field" 
                                        value={formData.reorder_level_reams} 
                                        onChange={e => setFormData({...formData, reorder_level_reams: Number(e.target.value)})} 
                                    />
                                </div>
                                <div>
                                    <label className="label">Supplier Name</label>
                                    <input 
                                        className="input-field" 
                                        value={formData.supplier_name} 
                                        onChange={e => setFormData({...formData, supplier_name: e.target.value})} 
                                        placeholder="e.g. ABC Paper House"
                                    />
                                </div>
                                <div className="span-2">
                                    <label className="label">Notes</label>
                                    <textarea 
                                        className="input-field" 
                                        rows="2" 
                                        value={formData.notes} 
                                        onChange={e => setFormData({...formData, notes: e.target.value})}
                                    ></textarea>
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

            {/* Quick Adjust Modal */}
            {showAdjustModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">Adjust Stock</h2>
                            <button className="modal-close" onClick={() => setShowAdjustModal(false)}><X size={20} /></button>
                        </div>
                        <div className="mb-16">
                            <div className="font-bold">{adjustData.name}</div>
                            <div className="text-xs muted">Enter positive value to add, negative to subtract reams.</div>
                        </div>
                        <form onSubmit={handleAdjustSubmit} className="stack-md">
                            <div>
                                <label className="label">Reams Change *</label>
                                <div className="row items-center gap-sm">
                                    <input 
                                        type="number" 
                                        className="input-field" 
                                        required 
                                        autoFocus
                                        value={adjustData.change} 
                                        onChange={e => setAdjustData({...adjustData, change: e.target.value})} 
                                        placeholder="e.g. 5 or -2"
                                    />
                                    <div className={`badge ${Number(adjustData.change) >= 0 ? 'badge--success' : 'badge--danger'}`}>
                                        {Number(adjustData.change) >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="label">Reason *</label>
                                <input 
                                    className="input-field" 
                                    required 
                                    value={adjustData.reason} 
                                    onChange={e => setAdjustData({...adjustData, reason: e.target.value})} 
                                    placeholder="e.g. New purchase, Damage, etc."
                                />
                            </div>
                            <div className="row justify-end gap-sm mt-md">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={!adjustData.change || !adjustData.reason}>Confirm Adjustment</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaperManagement;

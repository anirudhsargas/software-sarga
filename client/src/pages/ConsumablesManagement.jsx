import React, { useEffect, useMemo, useState } from 'react';
import {
    Package,
    AlertTriangle,
    Plus,
    Search,
    RefreshCcw,
    Edit2,
    Trash2,
    X,
    ArrowUp,
    ArrowDown,
    MapPin,
    Download
} from 'lucide-react';
import api, { devFallback } from '../services/api';
import toast from 'react-hot-toast';
import auth from '../services/auth';

const CATEGORY_TABS = [
    { label: 'All', value: 'all' },
    { label: 'Ink', value: 'ink' },
    { label: 'Chemical', value: 'chemical' },
    { label: 'Plate', value: 'plate' },
    { label: 'Spare Part', value: 'spare_part' },
    { label: 'Other', value: 'other' }
];

const UNIT_OPTIONS = ['litre', 'kg', 'piece', 'box', 'set'];

const emptyForm = {
    name: '',
    category: 'other',
    unit: 'piece',
    quantity_in_stock: 0,
    reorder_level: 0,
    unit_cost: '',
    supplier_name: '',
    branch: 'Perambra',
    notes: ''
};

const toDisplayCategory = (category) => {
    if (!category) return '-';
    if (category === 'spare_part') return 'Spare Part';
    return category.charAt(0).toUpperCase() + category.slice(1);
};

const csvEscape = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
};

const ConsumablesManagement = () => {
    const user = auth.getUser();
    const isManager = ['Admin', 'Accountant'].includes(user?.role);

    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState('All');
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('add');
    const [selectedItem, setSelectedItem] = useState(null);
    const [showAdjustModal, setShowAdjustModal] = useState(false);
    const [adjustData, setAdjustData] = useState({ id: null, name: '', quantity_delta: '', reason: '' });
    const [formData, setFormData] = useState(emptyForm);

    const fetchConsumables = async () => {
        setLoading(true);
        try {
            const res = await api.get(devFallback('/inventory/consumables'), {
                params: {
                    category: categoryFilter,
                    branch: branchFilter,
                    search: searchTerm || undefined
                }
            });
            setItems(res.data || []);
        } catch (err) {
            if (err.response?.status === 401) {
                toast.error('Authentication required — please login');
                window.location.href = '/login';
                return;
            }
            toast.error('Failed to load consumables inventory');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConsumables();
    }, [categoryFilter, branchFilter, searchTerm]);

    const stats = useMemo(() => {
        const lowStock = items.filter((i) => Number(i.quantity_in_stock) <= Number(i.reorder_level || 0));
        const totalValue = items.reduce((acc, curr) => acc + (Number(curr.quantity_in_stock) * Number(curr.unit_cost || 0)), 0);
        return {
            totalItems: items.length,
            lowStock: lowStock.length,
            totalValue
        };
    }, [items]);

    const handleOpenAdd = () => {
        setModalMode('add');
        setSelectedItem(null);
        setFormData({
            ...emptyForm,
            branch: user?.branch_name || 'Perambra'
        });
        setShowModal(true);
    };

    const handleOpenEdit = (item) => {
        setModalMode('edit');
        setSelectedItem(item);
        setFormData({
            name: item.name || '',
            category: item.category || 'other',
            unit: item.unit || 'piece',
            quantity_in_stock: Number(item.quantity_in_stock) || 0,
            reorder_level: Number(item.reorder_level) || 0,
            unit_cost: item.unit_cost || '',
            supplier_name: item.supplier_name || '',
            branch: item.branch || 'Perambra',
            notes: item.notes || ''
        });
        setShowModal(true);
    };

    const handleOpenAdjust = (item) => {
        setAdjustData({ id: item.id, name: item.name, quantity_delta: '', reason: '' });
        setShowAdjustModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this consumable item?')) return;
        try {
            await api.delete(`/inventory/consumables/${id}`);
            toast.success('Consumable deleted');
            fetchConsumables();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to delete consumable');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalMode === 'add') {
                await api.post('/inventory/consumables', formData);
                toast.success('Consumable item added');
            } else {
                // Optimistic UI Update for edit
                const prevConsumables = [...consumables];
                setConsumables(prev => prev.map(c => c.id === selectedItem.id ? { ...c, ...formData } : c));
                await api.put(`/inventory/consumables/${selectedItem.id}`, formData);
                toast.success('Consumable item updated');
            }
            setShowModal(false);
            fetchConsumables();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save consumable item');
            fetchConsumables();
        }
    };

    const handleAdjustSubmit = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/inventory/consumables/${adjustData.id}/adjust`, {
                quantity_delta: Number(adjustData.quantity_delta),
                reason: adjustData.reason
            });
            toast.success('Stock adjusted');
            setShowAdjustModal(false);
            fetchConsumables();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to adjust stock');
        }
    };

    const handleExportCsv = () => {
        if (!items.length) {
            toast.error('No data to export');
            return;
        }

        const headers = ['Name', 'Category', 'Unit', 'Stock', 'Reorder Level', 'Unit Cost', 'Supplier', 'Branch', 'Notes'];
        const rows = items.map((item) => [
            item.name,
            toDisplayCategory(item.category),
            item.unit,
            item.quantity_in_stock,
            item.reorder_level,
            item.unit_cost,
            item.supplier_name || '',
            item.branch,
            item.notes || ''
        ]);

        const csv = [headers, ...rows]
            .map((row) => row.map(csvEscape).join(','))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `consumables_inventory_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    return (
        <div className="stack-lg p-md">
            <div className="row space-between items-center wrap gap-sm">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Package size={32} className="text-primary" /> Consumables Inventory
                    </h1>
                    <p className="section-subtitle">Track ink, chemicals, plates, and other print consumables by branch.</p>
                </div>
                <div className="row gap-sm">
                    <button className="btn btn-ghost" onClick={handleExportCsv}>
                        <Download size={16} /> Export CSV
                    </button>
                    {isManager && (
                        <button className="btn btn-primary" onClick={handleOpenAdd}>
                            <Plus size={18} /> Add Consumable
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid--3 mt-md">
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--primary)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Items</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.totalItems}</span>
                </div>
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--danger)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Low Stock</span>
                    <div className="row items-center gap-sm">
                        <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--danger)' }}>{stats.lowStock}</span>
                        <AlertTriangle size={22} className="text-danger" />
                    </div>
                </div>
                <div className="panel stack-xs" style={{ borderLeft: '4px solid var(--warning)' }}>
                    <span className="muted text-xs font-bold uppercase tracking-wider">Estimated Value</span>
                    <span style={{ fontSize: '2rem', fontWeight: 800 }}>₹{stats.totalValue.toLocaleString()}</span>
                </div>
            </div>

            <div className="panel stack-md">
                <div className="row gap-md items-center wrap">
                    <div className="flex-1 min-w-[220px]" style={{ position: 'relative' }}>
                        <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} size={18} />
                        <input
                            className="input-field"
                            style={{ paddingLeft: 40 }}
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="row gap-xs items-center">
                        <MapPin size={16} className="muted" />
                        <select className="input-field py-xs" style={{ width: 160 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                            <option value="All">All Branches</option>
                            <option value="Perambra">Perambra</option>
                            <option value="Meppayur">Meppayur</option>
                        </select>
                    </div>
                </div>

                <div className="row gap-xs wrap">
                    {CATEGORY_TABS.map((tab) => {
                        const active = categoryFilter === tab.value;
                        return (
                            <button
                                key={tab.value}
                                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setCategoryFilter(tab.value)}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                            setSearchTerm('');
                            setCategoryFilter('all');
                            setBranchFilter('All');
                        }}
                    >
                        Reset
                    </button>
                </div>

                <div className="table-scroll" style={{ minHeight: '300px' }}>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Unit</th>
                                <th>Stock</th>
                                <th>Reorder Level</th>
                                <th>Unit Cost</th>
                                <th>Supplier</th>
                                <th>Branch</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="9" className="text-center p-xl">
                                        <RefreshCcw className="animate-spin muted" size={30} />
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="text-center p-xl muted">
                                        <Package size={44} style={{ opacity: 0.2, marginBottom: 12 }} />
                                        <div>No consumables found.</div>
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => {
                                    const isLow = Number(item.quantity_in_stock) <= Number(item.reorder_level || 0);
                                    return (
                                        <tr
                                            key={item.id}
                                            style={{
                                                borderLeft: isLow ? '4px solid var(--danger)' : 'none',
                                                backgroundColor: isLow ? 'rgba(var(--error-rgb), 0.06)' : 'transparent'
                                            }}
                                        >
                                            <td>
                                                <div className="font-bold">{item.name}</div>
                                                {isLow && <div className="text-xs text-danger font-medium">Low Stock</div>}
                                            </td>
                                            <td><span className="badge badge-ghost">{toDisplayCategory(item.category)}</span></td>
                                            <td>{item.unit}</td>
                                            <td className={isLow ? 'text-danger font-bold' : 'font-bold'}>{item.quantity_in_stock}</td>
                                            <td>{item.reorder_level}</td>
                                            <td>₹{Number(item.unit_cost || 0).toLocaleString()}</td>
                                            <td>{item.supplier_name || '-'}</td>
                                            <td>{item.branch}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="row gap-xs justify-end">
                                                    <button className="btn btn-ghost btn-sm" title="Quick Adjust" onClick={() => handleOpenAdjust(item)}>
                                                        <ArrowUp size={14} />
                                                        <ArrowDown size={14} />
                                                    </button>
                                                    <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => handleOpenEdit(item)}>
                                                        <Edit2 size={15} />
                                                    </button>
                                                    {isManager && (
                                                        <button className="btn btn-ghost btn-sm text-error" title="Delete" onClick={() => handleDelete(item.id)}>
                                                            <Trash2 size={15} />
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

            {showModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '650px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">{modalMode === 'add' ? 'Add Consumable' : 'Edit Consumable'}</h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit} className="stack-md">
                            <div className="grid grid--2 gap-md">
                                <div className="span-2">
                                    <label className="label">Name *</label>
                                    <input
                                        className="input-field"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="label">Category *</label>
                                    <select className="input-field" value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                                        {CATEGORY_TABS.filter((c) => c.value !== 'all').map((c) => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="label">Unit *</label>
                                    <select className="input-field" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })}>
                                        {UNIT_OPTIONS.map((u) => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="label">Quantity in Stock *</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="input-field"
                                        value={formData.quantity_in_stock}
                                        onChange={(e) => setFormData({ ...formData, quantity_in_stock: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="label">Reorder Level *</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="input-field"
                                        value={formData.reorder_level}
                                        onChange={(e) => setFormData({ ...formData, reorder_level: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="label">Unit Cost (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="input-field"
                                        value={formData.unit_cost}
                                        onChange={(e) => setFormData({ ...formData, unit_cost: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="label">Branch *</label>
                                    <select className="input-field" value={formData.branch} onChange={(e) => setFormData({ ...formData, branch: e.target.value })}>
                                        <option value="Perambra">Perambra</option>
                                        <option value="Meppayur">Meppayur</option>
                                    </select>
                                </div>

                                <div className="span-2">
                                    <label className="label">Supplier Name</label>
                                    <input
                                        className="input-field"
                                        value={formData.supplier_name}
                                        onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                                    />
                                </div>

                                <div className="span-2">
                                    <label className="label">Notes</label>
                                    <textarea
                                        className="input-field"
                                        rows="2"
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    />
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

            {showAdjustModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2 className="section-title">Quick Adjust</h2>
                            <button className="modal-close" onClick={() => setShowAdjustModal(false)}><X size={20} /></button>
                        </div>
                        <div className="mb-16">
                            <div className="font-bold">{adjustData.name}</div>
                            <div className="text-xs muted">Use positive number to add stock and negative number to reduce.</div>
                        </div>
                        <form onSubmit={handleAdjustSubmit} className="stack-md">
                            <div>
                                <label className="label">Quantity Delta *</label>
                                <div className="row items-center gap-sm">
                                    <input
                                        type="number"
                                        step="0.001"
                                        className="input-field"
                                        required
                                        autoFocus
                                        value={adjustData.quantity_delta}
                                        onChange={(e) => setAdjustData({ ...adjustData, quantity_delta: e.target.value })}
                                        placeholder="e.g. 2 or -0.5"
                                    />
                                    <div className={`badge ${Number(adjustData.quantity_delta) >= 0 ? 'badge--success' : 'badge--danger'}`}>
                                        {Number(adjustData.quantity_delta) >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="label">Reason *</label>
                                <input
                                    className="input-field"
                                    required
                                    value={adjustData.reason}
                                    onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                                    placeholder="e.g. Received from supplier, damaged unit"
                                />
                            </div>
                            <div className="row justify-end gap-sm mt-md">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowAdjustModal(false)}>Cancel</button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={!adjustData.quantity_delta || !adjustData.reason}
                                >
                                    Confirm
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsumablesManagement;

import React, { useEffect, useState } from 'react';
import { Plus, X, Package, Edit2, Trash2, Loader2 } from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import Pagination from '../components/Pagination';

const emptyItem = {
    name: '',
    sku: '',
    category: '',
    unit: 'pcs',
    quantity: '',
    reorder_level: '',
    cost_price: '',
    sell_price: ''
};

const Inventory = () => {
    const isAdmin = auth.getUser()?.role === 'Admin';
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [newItem, setNewItem] = useState(emptyItem);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        fetchInventory();
    }, [page]);

    const fetchInventory = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/inventory?page=${page}&limit=20`, { headers: auth.getAuthHeader() });
            const res = response.data;
            setItems(res.data);
            setTotal(res.total);
            setTotalPages(res.totalPages);
        } catch (err) {
            setError('Failed to fetch inventory');
        } finally {
            setLoading(false);
        }
    };

    const normalizeItem = (item) => ({
        ...item,
        quantity: item.quantity === null ? '' : String(item.quantity),
        reorder_level: item.reorder_level === null ? '' : String(item.reorder_level),
        cost_price: item.cost_price === null ? '' : String(item.cost_price),
        sell_price: item.sell_price === null ? '' : String(item.sell_price)
    });

    const handleAddItem = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await api.post('/inventory', {
                ...newItem,
                quantity: Number(newItem.quantity) || 0,
                reorder_level: Number(newItem.reorder_level) || 0,
                cost_price: Number(newItem.cost_price) || 0,
                sell_price: Number(newItem.sell_price) || 0
            }, { headers: auth.getAuthHeader() });
            setShowAddModal(false);
            setNewItem(emptyItem);
            fetchInventory();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add item');
        }
    };

    const handleUpdateItem = async (e) => {
        e.preventDefault();
        if (!selectedItem) return;
        setError('');
        try {
            await api.put(`/inventory/${selectedItem.id}`, {
                ...selectedItem,
                quantity: Number(selectedItem.quantity) || 0,
                reorder_level: Number(selectedItem.reorder_level) || 0,
                cost_price: Number(selectedItem.cost_price) || 0,
                sell_price: Number(selectedItem.sell_price) || 0
            }, { headers: auth.getAuthHeader() });
            setShowEditModal(false);
            setSelectedItem(null);
            fetchInventory();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update item');
        }
    };

    const handleDeleteItem = async (id) => {
        if (!window.confirm('Delete this inventory item?')) return;
        try {
            await api.delete(`/inventory/${id}`, { headers: auth.getAuthHeader() });
            fetchInventory();
        } catch (err) {
            setError('Failed to delete item');
        }
    };

    const getStatus = (item) => {
        if (Number(item.quantity) <= Number(item.reorder_level || 0)) return 'low';
        return 'ok';
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Inventory</h1>
                    <p className="section-subtitle">Manage stock, prices, and reorder levels.</p>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        <Plus size={18} />
                        <span>Add Item</span>
                    </button>
                )}
            </div>

            {error && (
                <div className="alert alert--error">
                    <span>{error}</span>
                </div>
            )}

            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>SKU</th>
                                <th>Category</th>
                                <th>Qty</th>
                                <th>Unit</th>
                                <th>Reorder</th>
                                <th>Cost</th>
                                <th>Sell</th>
                                <th>Status</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={isAdmin ? 10 : 9} className="text-center muted table-empty">
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={isAdmin ? 10 : 9} className="text-center muted table-empty">
                                        No inventory items found.
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="row gap-sm">
                                                <div className="user-avatar avatar-sm">
                                                    <Package size={16} />
                                                </div>
                                                <span className="user-name">{item.name}</span>
                                            </div>
                                        </td>
                                        <td className="text-sm">{item.sku || '-'}</td>
                                        <td className="text-sm">{item.category || '-'}</td>
                                        <td className="text-sm">{item.quantity}</td>
                                        <td className="text-sm">{item.unit}</td>
                                        <td className="text-sm">{item.reorder_level}</td>
                                        <td className="text-sm">{Number(item.cost_price).toFixed(2)}</td>
                                        <td className="text-sm">{Number(item.sell_price).toFixed(2)}</td>
                                        <td>
                                            <span className={`badge ${getStatus(item) === 'low' ? 'badge--warn' : 'badge--ok'}`}>
                                                {getStatus(item) === 'low' ? 'Low' : 'OK'}
                                            </span>
                                        </td>
                                        {isAdmin && (
                                            <td>
                                                <div className="row gap-sm">
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => {
                                                            setSelectedItem(normalizeItem(item));
                                                            setShowEditModal(true);
                                                        }}
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-danger"
                                                        onClick={() => handleDeleteItem(item.id)}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

            {showAddModal && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" onClick={() => setShowAddModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Add Inventory Item</h2>
                        <form onSubmit={handleAddItem} className="stack-md">
                            <div>
                                <label className="label">Item Name</label>
                                <input
                                    className="input-field"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">SKU (optional)</label>
                                <input
                                    className="input-field"
                                    value={newItem.sku}
                                    onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Category</label>
                                <input
                                    className="input-field"
                                    value={newItem.category}
                                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                                />
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Quantity</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={newItem.quantity}
                                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Unit</label>
                                    <input
                                        className="input-field"
                                        value={newItem.unit}
                                        onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Reorder Level</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={newItem.reorder_level}
                                        onChange={(e) => setNewItem({ ...newItem, reorder_level: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Cost Price</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="input-field"
                                        value={newItem.cost_price}
                                        onChange={(e) => setNewItem({ ...newItem, cost_price: e.target.value })}
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Sell Price</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input-field"
                                    value={newItem.sell_price}
                                    onChange={(e) => setNewItem({ ...newItem, sell_price: e.target.value })}
                                    min="0"
                                />
                            </div>

                            <button type="submit" className="btn btn-primary btn--full">
                                Create Item
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && selectedItem && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button
                            className="modal-close"
                            onClick={() => {
                                setShowEditModal(false);
                                setSelectedItem(null);
                            }}
                        >
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Edit Inventory Item</h2>
                        <form onSubmit={handleUpdateItem} className="stack-md">
                            <div>
                                <label className="label">Item Name</label>
                                <input
                                    className="input-field"
                                    value={selectedItem.name}
                                    onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">SKU (optional)</label>
                                <input
                                    className="input-field"
                                    value={selectedItem.sku || ''}
                                    onChange={(e) => setSelectedItem({ ...selectedItem, sku: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Category</label>
                                <input
                                    className="input-field"
                                    value={selectedItem.category || ''}
                                    onChange={(e) => setSelectedItem({ ...selectedItem, category: e.target.value })}
                                />
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Quantity</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={selectedItem.quantity}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, quantity: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Unit</label>
                                    <input
                                        className="input-field"
                                        value={selectedItem.unit || ''}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, unit: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Reorder Level</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={selectedItem.reorder_level}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, reorder_level: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Cost Price</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="input-field"
                                        value={selectedItem.cost_price}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, cost_price: e.target.value })}
                                        min="0"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Sell Price</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input-field"
                                    value={selectedItem.sell_price}
                                    onChange={(e) => setSelectedItem({ ...selectedItem, sell_price: e.target.value })}
                                    min="0"
                                />
                            </div>

                            <button type="submit" className="btn btn-primary btn--full">
                                Save Changes
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Inventory;

import React, { useEffect, useState, useMemo } from 'react';
import { Plus, X, Package, Edit2, Trash2, Loader2, Printer, Check, Minus, Search, Link } from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import Pagination from '../components/Pagination';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';

const emptyItem = {
    name: '',
    sku: '',
    category: '',
    unit: 'pcs',
    quantity: '',
    reorder_level: '',
    cost_price: '',
    sell_price: '',
    hsn: '',
    discount: '0',
    gst_rate: '0',
    product_id: ''
};

const Inventory = () => {
    const { confirm } = useConfirm();
    const isAdmin = ['Admin', 'Accountant'].includes(auth.getUser()?.role);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [newItem, setNewItem] = useState(emptyItem);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [hierarchy, setHierarchy] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [productSearch, setProductSearch] = useState('');

    const [selectedIds, setSelectedIds] = useState([]);
    const [printQuantities, setPrintQuantities] = useState({}); // { id: qty }
    const [printingLabel, setPrintingLabel] = useState(false);

    useEffect(() => {
        fetchInventory();
        fetchHierarchy();
    }, [page]);

    const fetchInventory = async () => {
        setLoading(true);
        try {
            const res = await api.get('/inventory?page=' + page);
            // Handle paginated response structure
            if (res.data && res.data.data) {
                setItems(res.data.data);
                setTotal(res.data.total);
                setTotalPages(res.data.totalPages); // Assuming totalPages is also nested
            } else {
                setItems(Array.isArray(res.data) ? res.data : []);
                setTotal(res.headers['x-total-count'] || (Array.isArray(res.data) ? res.data.length : 0));
                setTotalPages(1); // Default to 1 if not paginated or totalPages not provided
            }
        } catch (err) {
            setError('Failed to fetch inventory');
        } finally {
            setLoading(false);
        }
    };

    const fetchHierarchy = async () => {
        try {
            const res = await api.get('/product-hierarchy');
            setHierarchy(res.data);

            // Flatten products for easy selection
            const products = [];
            res.data.forEach(cat => {
                cat.subcategories.forEach(sub => {
                    sub.products.forEach(p => {
                        products.push({
                            ...p,
                            category_name: cat.name,
                            subcategory_name: sub.name
                        });
                    });
                });
            });
            setAllProducts(products);
        } catch (err) {
            console.error("Fetch hierarchy error:", err);
        }
    };

    const filteredProducts = useMemo(() => {
        if (!productSearch) return [];
        return allProducts.filter(p =>
            p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            (p.product_code && p.product_code.toLowerCase().includes(productSearch.toLowerCase()))
        ).slice(0, 5);
    }, [productSearch, allProducts]);

    const selectProduct = (p, isEdit = false) => {
        const updater = isEdit ? setSelectedItem : setNewItem;
        const current = isEdit ? selectedItem : newItem;

        updater({
            ...current,
            name: p.name,
            sku: p.product_code || '',
            category: p.subcategory_name || '',
            product_id: p.id
        });
        setProductSearch('');
    };

    const normalizeItem = (item) => ({
        ...item,
        quantity: item.quantity === null ? '' : String(item.quantity),
        reorder_level: item.reorder_level === null ? '' : String(item.reorder_level),
        cost_price: item.cost_price === null ? '' : String(item.cost_price),
        sell_price: item.sell_price === null ? '' : String(item.sell_price),
        hsn: item.hsn || '',
        discount: item.discount === null ? '0' : String(item.discount),
        gst_rate: item.gst_rate === null ? '0' : String(item.gst_rate),
        product_id: item.linked_product_id || ''
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
                sell_price: Number(newItem.sell_price) || 0,
                discount: Number(newItem.discount) || 0,
                gst_rate: Number(newItem.gst_rate) || 0,
                product_id: newItem.product_id || null
            });
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
                sell_price: Number(selectedItem.sell_price) || 0,
                discount: Number(selectedItem.discount) || 0,
                gst_rate: Number(selectedItem.gst_rate) || 0,
                product_id: selectedItem.product_id || null
            });
            setShowEditModal(false);
            setSelectedItem(null);
            fetchInventory();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update item');
        }
    };

    const handleDeleteItem = async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Inventory Item',
            message: 'Are you sure you want to delete this inventory item?',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.delete(`/inventory/${id}`);
            fetchInventory();
        } catch (err) {
            setError('Failed to delete item');
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handlePrintLabels = async () => {
        if (selectedIds.length === 0) return;

        // Initialize print quantities with 1 for all selected
        const initialQtys = {};
        selectedIds.forEach(id => {
            initialQtys[id] = 1;
        });
        setPrintQuantities(initialQtys);
        setShowPrintModal(true);
    };

    const generatePDF = async () => {
        setPrintingLabel(true);
        try {
            const itemsToPrint = selectedIds.map(id => ({
                id,
                quantity_to_print: printQuantities[id] || 1
            }));

            const response = await api.post('/inventory/generate-labels',
                { items: itemsToPrint },
                { responseType: 'blob' }
            );

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `labels_${new Date().getTime()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

            setShowPrintModal(false);
            setSelectedIds([]);
        } catch (err) {
            toast.error('Failed to generate labels');
        } finally {
            setPrintingLabel(false);
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
                <div className="row gap-sm">
                    {selectedIds.length > 0 && (
                        <button className="btn btn-ghost" onClick={handlePrintLabels}>
                            <Printer size={18} />
                            <span>Print Labels ({selectedIds.length})</span>
                        </button>
                    )}
                    {isAdmin && (
                        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                            <Plus size={18} />
                            <span>Add Item</span>
                        </button>
                    )}
                </div>
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
                                <th style={{ width: '40px' }}>
                                    <input
                                        type="checkbox"
                                        onChange={(e) => {
                                            if (e.target.checked) setSelectedIds(items.map(i => i.id));
                                            else setSelectedIds([]);
                                        }}
                                        checked={items.length > 0 && selectedIds.length === items.length}
                                    />
                                </th>
                                <th>Item</th>
                                <th>SKU</th>
                                <th>Category</th>
                                <th>Qty</th>
                                <th>Unit</th>
                                <th>Cost</th>
                                <th>GST %</th>
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
                                    <tr key={item.id} className={selectedIds.includes(item.id) ? 'row-selected' : ''}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(item.id)}
                                                onChange={() => toggleSelect(item.id)}
                                            />
                                        </td>
                                        <td>
                                            <div className="row gap-sm">
                                                <div className="user-avatar avatar-sm">
                                                    {item.linked_product_id ? <Link size={14} className="text-primary" /> : <Package size={16} />}
                                                </div>
                                                <span className="user-name">{item.name}</span>
                                            </div>
                                        </td>
                                        <td className="text-sm">{item.sku || '-'}</td>
                                        <td className="text-sm">{item.category || '-'}</td>
                                        <td className="text-sm">{item.quantity}</td>
                                        <td className="text-sm">{item.unit}</td>
                                        <td className="text-sm">{Number(item.cost_price).toFixed(2)}</td>
                                        <td className="text-sm">{item.gst_rate}%</td>
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

                        <div className="mb-16">
                            <label className="label">Match with Product Library (Optional)</label>
                            <div className="search-input-container">
                                <Search size={18} className="search-icon" />
                                <input
                                    className="input-field"
                                    placeholder="Search product from library..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                />
                            </div>
                            {filteredProducts.length > 0 && (
                                <div className="dropdown mt-4">
                                    {filteredProducts.map(p => (
                                        <div key={p.id} className="dropdown-item" onClick={() => selectProduct(p)}>
                                            <div className="text-sm font-medium">{p.name}</div>
                                            <div className="muted text-xs">{p.category_name} &rsaquo; {p.subcategory_name}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleAddItem} className="stack-md">
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Item Name</label>
                                    <input
                                        className="input-field"
                                        value={newItem.name}
                                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">SKU</label>
                                    <input
                                        className="input-field"
                                        value={newItem.sku}
                                        onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Category</label>
                                    <select
                                        className="input-field"
                                        value={newItem.category}
                                        onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                                    >
                                        <option value="">Select Category</option>
                                        {hierarchy.map(cat => (
                                            <optgroup key={cat.id} label={cat.name}>
                                                {cat.subcategories.map(sub => (
                                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="label">HSN Code</label>
                                    <input
                                        className="input-field"
                                        value={newItem.hsn}
                                        onChange={(e) => setNewItem({ ...newItem, hsn: e.target.value })}
                                    />
                                </div>
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
                            </div>
                            <div className="row gap-sm">
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
                                <div className="flex-1">
                                    <label className="label">GST Rate %</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={newItem.gst_rate}
                                        onChange={(e) => setNewItem({ ...newItem, gst_rate: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Discount %</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={newItem.discount}
                                        onChange={(e) => setNewItem({ ...newItem, discount: e.target.value })}
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

                        <div className="mb-16">
                            <label className="label">Rematch with Product Library (Optional)</label>
                            <div className="search-input-container">
                                <Search size={18} className="search-icon" />
                                <input
                                    className="input-field"
                                    placeholder="Search product from library..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                />
                            </div>
                            {filteredProducts.length > 0 && (
                                <div className="dropdown mt-4">
                                    {filteredProducts.map(p => (
                                        <div key={p.id} className="dropdown-item" onClick={() => selectProduct(p, true)}>
                                            <div className="text-sm font-medium">{p.name}</div>
                                            <div className="muted text-xs">{p.category_name} &rsaquo; {p.subcategory_name}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleUpdateItem} className="stack-md">
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Item Name</label>
                                    <input
                                        className="input-field"
                                        value={selectedItem.name}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">SKU</label>
                                    <input
                                        className="input-field"
                                        value={selectedItem.sku || ''}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, sku: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Category</label>
                                    <select
                                        className="input-field"
                                        value={selectedItem.category}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, category: e.target.value })}
                                    >
                                        <option value="">Select Category</option>
                                        {hierarchy.map(cat => (
                                            <optgroup key={cat.id} label={cat.name}>
                                                {cat.subcategories.map(sub => (
                                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="label">HSN Code</label>
                                    <input
                                        className="input-field"
                                        value={selectedItem.hsn || ''}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, hsn: e.target.value })}
                                    />
                                </div>
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
                            </div>
                            <div className="row gap-sm">
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
                                <div className="flex-1">
                                    <label className="label">GST Rate %</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={selectedItem.gst_rate}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, gst_rate: e.target.value })}
                                        min="0"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Discount %</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={selectedItem.discount}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, discount: e.target.value })}
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

            {showPrintModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setShowPrintModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-8">Label Quantities</h2>
                        <p className="section-subtitle mb-16">Specify how many labels to print for each item.</p>

                        <div className="stack-md mb-24" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                            {items.filter(i => selectedIds.includes(i.id)).map(item => (
                                <div key={item.id} className="row items-center justify-between panel panel--tight pb-8 pt-8">
                                    <div className="flex-1 mr-16">
                                        <div className="user-name text-sm">{item.name}</div>
                                        <div className="muted text-xs">SKU: {item.sku || 'N/A'}</div>
                                    </div>
                                    <div className="row items-center gap-sm">
                                        <button
                                            className="icon-button icon-button--sm"
                                            onClick={() => setPrintQuantities(prev => ({
                                                ...prev,
                                                [item.id]: Math.max(1, (prev[item.id] || 1) - 1)
                                            }))}
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            className="input-field text-center"
                                            style={{ width: '60px', padding: '4px' }}
                                            value={printQuantities[item.id] || 1}
                                            onChange={(e) => setPrintQuantities(prev => ({
                                                ...prev,
                                                [item.id]: Number(e.target.value) || 1
                                            }))}
                                        />
                                        <button
                                            className="icon-button icon-button--sm"
                                            onClick={() => setPrintQuantities(prev => ({
                                                ...prev,
                                                [item.id]: (prev[item.id] || 1) + 1
                                            }))}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            className="btn btn-primary btn--full"
                            onClick={generatePDF}
                            disabled={printingLabel}
                        >
                            {printingLabel ? <Loader2 className="animate-spin mr-8" size={18} /> : <Printer size={18} className="mr-8" />}
                            <span>Generate Label Sheet (PDF)</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Inventory;

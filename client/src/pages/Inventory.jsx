import React, { useEffect, useState, useMemo, useRef } from 'react';
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
    product_id: '',
    source_code: '',
    model_name: '',
    size_code: '',
    item_type: 'Retail',
    vendor_name: '',
    vendor_contact: '',
    purchase_link: ''
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
    const [saving, setSaving] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const [hierarchy, setHierarchy] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [productSearch, setProductSearch] = useState('');

    const [selectedIds, setSelectedIds] = useState([]);
    const [printQuantities, setPrintQuantities] = useState({}); // { id: qty }
    const [printingLabel, setPrintingLabel] = useState(false);

    // Consumables actions state
    const [showConsumeModal, setShowConsumeModal] = useState(false);
    const [consumeData, setConsumeData] = useState({ id: null, quantity: '', notes: '' });
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [restockData, setRestockData] = useState({ id: null, quantity: '', cost: '', notes: '' });

    // Bill Upload OCR state
    const [processingBill, setProcessingBill] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [extractedBillData, setExtractedBillData] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchInventory();
        fetchHierarchy();
    }, [page]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showAddModal) setShowAddModal(false);
                else if (showEditModal) setShowEditModal(false);
                else if (showPrintModal) setShowPrintModal(false);
                else if (showConsumeModal) setShowConsumeModal(false);
                else if (showRestockModal) setShowRestockModal(false);
                else if (showReviewModal) setShowReviewModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAddModal, showEditModal, showPrintModal, showConsumeModal, showRestockModal, showReviewModal]);

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
        product_id: item.linked_product_id || '',
        source_code: item.source_code || '',
        model_name: item.model_name || '',
        size_code: item.size_code || ''
    });

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setProcessingBill(true);
        const formData = new FormData();
        formData.append('bill_file', file);

        try {
            const res = await api.post('/inventory/extract-bill', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setExtractedBillData(res.data);
            setShowReviewModal(true);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to process bill');
        } finally {
            setProcessingBill(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleBatchSaveBill = async () => {
        if (!extractedBillData || !extractedBillData.items || extractedBillData.items.length === 0) {
            toast.error("No items to save.");
            return;
        }

        try {
            for (const item of extractedBillData.items) {
                await api.post('/inventory', {
                    ...emptyItem,
                    ...item,
                    vendor_name: extractedBillData.vendor_name || '',
                    vendor_contact: extractedBillData.vendor_contact || '',
                    item_type: 'Retail',
                });
            }
            toast.success("All extracted items added successfully!");
            setShowReviewModal(false);
            setExtractedBillData(null);
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to save items');
        }
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await api.post('/inventory', {
                ...newItem,
                quantity: Number(newItem.quantity) || 0,
                reorder_level: Number(newItem.reorder_level) || 0,
                cost_price: Number(newItem.cost_price) || 0,
                sell_price: Number(newItem.sell_price) || 0,
                discount: Number(newItem.discount) || 0,
                gst_rate: Number(newItem.gst_rate) || 0,
                product_id: newItem.product_id || null,
                source_code: newItem.source_code || null,
                model_name: newItem.model_name || null,
                size_code: newItem.size_code || null
            });
            setShowAddModal(false);
            setNewItem(emptyItem);
            toast.success('Inventory item added successfully');
            fetchInventory();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add item');
        } finally {
            setSaving(false);
        }
    };

    const handleUpdateItem = async (e) => {
        e.preventDefault();
        if (!selectedItem) return;
        setError('');
        setSaving(true);
        try {
            await api.put(`/inventory/${selectedItem.id}`, {
                ...selectedItem,
                quantity: Number(selectedItem.quantity) || 0,
                reorder_level: Number(selectedItem.reorder_level) || 0,
                cost_price: Number(selectedItem.cost_price) || 0,
                sell_price: Number(selectedItem.sell_price) || 0,
                discount: Number(selectedItem.discount) || 0,
                gst_rate: Number(selectedItem.gst_rate) || 0,
                product_id: selectedItem.product_id || null,
                source_code: selectedItem.source_code || null,
                model_name: selectedItem.model_name || null,
                size_code: selectedItem.size_code || null
            });
            setShowEditModal(false);
            setSelectedItem(null);
            toast.success('Inventory item updated successfully');
            fetchInventory();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update item');
        } finally {
            setSaving(false);
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
            toast.success('Inventory item deleted successfully');
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
            // Try to read the real error from the blob response
            let msg = 'Failed to generate labels';
            try {
                if (err.response?.data instanceof Blob) {
                    const text = await err.response.data.text();
                    const parsed = JSON.parse(text);
                    msg = parsed.message || parsed.error || msg;
                } else if (err.response?.data?.message) {
                    msg = err.response.data.message;
                } else if (err.message) {
                    msg = err.message;
                }
            } catch { /* ignore parse error */ }
            console.error('Label generation error:', err);
            toast.error(msg);
        } finally {
            setPrintingLabel(false);
        }
    };

    const handleConsume = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/inventory/${consumeData.id}/consume`, {
                quantity_consumed: consumeData.quantity,
                notes: consumeData.notes
            });
            toast.success('Stock consumed successfully');
            setShowConsumeModal(false);
            setConsumeData({ id: null, quantity: '', notes: '' });
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error consuming stock');
        } finally {
            setSaving(false);
        }
    };

    const handleRestock = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await api.post(`/inventory/${restockData.id}/restock`, {
                quantity_received: restockData.quantity,
                cost_price: restockData.cost || undefined,
                notes: restockData.notes
            });
            toast.success(`Restocked successfully. Gap: ${res.data.days_since_last_reorder ?? 'N/A'} days`);
            setShowRestockModal(false);
            setRestockData({ id: null, quantity: '', cost: '', notes: '' });
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error restocking item');
        } finally {
            setSaving(false);
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
                        <>
                            <input
                                type="file"
                                accept=".jpg,.jpeg,.png,.pdf"
                                style={{ display: 'none' }}
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                            />
                            <button
                                className="btn btn-secondary"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={processingBill}
                            >
                                {processingBill ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                                <span>{processingBill ? 'Processing...' : 'Scan Bill'}</span>
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                <Plus size={18} />
                                <span>Add Item</span>
                            </button>
                        </>
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
                                                    {item.item_type === 'Consumable' && (
                                                        <>
                                                            <button
                                                                className="btn btn-ghost"
                                                                title="Consume Stock"
                                                                onClick={() => {
                                                                    setConsumeData({ id: item.id, quantity: '', notes: '' });
                                                                    setShowConsumeModal(true);
                                                                }}
                                                            >
                                                                <Minus size={16} className="text-danger" />
                                                            </button>
                                                            <button
                                                                className="btn btn-ghost"
                                                                title="Restock"
                                                                onClick={() => {
                                                                    setRestockData({ id: item.id, quantity: '', cost: item.cost_price, notes: '' });
                                                                    setShowRestockModal(true);
                                                                }}
                                                            >
                                                                <Plus size={16} className="text-primary" />
                                                            </button>
                                                        </>
                                                    )}
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
                </div >
            </div >
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

            {
                showAddModal && (
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
                                <div className="mb-16 panel panel--tight" style={{ background: 'var(--surface-alt)' }}>
                                    <label className="label">Item Type</label>
                                    <div className="row gap-md mt-4">
                                        <label className="row items-center gap-sm cursor-pointer">
                                            <input type="radio" name="add_item_type" value="Retail" checked={newItem.item_type === 'Retail'} onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })} />
                                            <span>Retail Product</span>
                                        </label>
                                        <label className="row items-center gap-sm cursor-pointer">
                                            <input type="radio" name="add_item_type" value="Consumable" checked={newItem.item_type === 'Consumable'} onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })} />
                                            <span>Internal Consumable</span>
                                        </label>
                                    </div>
                                </div>
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
                                    {newItem.item_type === 'Retail' && (
                                        <div className="flex-1">
                                            <label className="label">SKU (Unique Code)</label>
                                            <input
                                                className="input-field"
                                                style={{ fontWeight: 700, letterSpacing: '0.5px' }}
                                                value={newItem.sku}
                                                onChange={(e) => setNewItem({ ...newItem, sku: e.target.value.toUpperCase() })}
                                                placeholder="AUTOGENERATED"
                                            />
                                        </div>
                                    )}
                                </div>

                                {newItem.item_type === 'Retail' && (
                                    <>
                                        <div className="row gap-sm panel panel--tight" style={{ background: 'var(--surface-alt)', border: '1px dashed var(--border)' }}>
                                            <div style={{ width: '80px' }}>
                                                <label className="label">Source</label>
                                                <input
                                                    className="input-field"
                                                    maxLength={3}
                                                    placeholder="ABC"
                                                    value={newItem.source_code}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${val}-${newItem.model_name}-${newItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        setNewItem({ ...newItem, source_code: val, sku: newSku });
                                                    }}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="label">Model Name</label>
                                                <input
                                                    className="input-field"
                                                    placeholder="Model"
                                                    value={newItem.model_name}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${newItem.source_code}-${val}-${newItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        setNewItem({ ...newItem, model_name: val, sku: newSku });
                                                    }}
                                                />
                                            </div>
                                            <div style={{ width: '80px' }}>
                                                <label className="label">Size</label>
                                                <input
                                                    className="input-field"
                                                    maxLength={10}
                                                    placeholder="L"
                                                    value={newItem.size_code}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${newItem.source_code}-${newItem.model_name}-${val}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        setNewItem({ ...newItem, size_code: val, sku: newSku });
                                                    }}
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
                                    </>
                                )}
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
                                    {newItem.item_type === 'Retail' && (
                                        <>
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
                                        </>
                                    )}
                                </div>
                                {newItem.item_type === 'Retail' && (
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
                                )}
                                <div className="row gap-sm">
                                    <div className="flex-1">
                                        <label className="label">Vendor Name</label>
                                        <input
                                            className="input-field"
                                            placeholder="Where do we buy this?"
                                            value={newItem.vendor_name}
                                            onChange={(e) => setNewItem({ ...newItem, vendor_name: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="label">Vendor Contact</label>
                                        <input
                                            className="input-field"
                                            placeholder="Phone or Email"
                                            value={newItem.vendor_contact}
                                            onChange={(e) => setNewItem({ ...newItem, vendor_contact: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Purchase Link</label>
                                    <input
                                        className="input-field"
                                        placeholder="https://amazon.in/..."
                                        value={newItem.purchase_link}
                                        onChange={(e) => setNewItem({ ...newItem, purchase_link: e.target.value })}
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary btn--full" disabled={saving}>
                                    {saving ? 'Creating...' : 'Create Item'}
                                </button>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                showEditModal && selectedItem && (
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
                                <div className="mb-16 panel panel--tight" style={{ background: 'var(--surface-alt)' }}>
                                    <label className="label">Item Type</label>
                                    <div className="row gap-md mt-4">
                                        <label className="row items-center gap-sm cursor-pointer">
                                            <input type="radio" name="edit_item_type" value="Retail" checked={selectedItem.item_type === 'Retail'} onChange={(e) => setSelectedItem({ ...selectedItem, item_type: e.target.value })} />
                                            <span>Retail Product</span>
                                        </label>
                                        <label className="row items-center gap-sm cursor-pointer">
                                            <input type="radio" name="edit_item_type" value="Consumable" checked={selectedItem.item_type === 'Consumable'} onChange={(e) => setSelectedItem({ ...selectedItem, item_type: e.target.value })} />
                                            <span>Internal Consumable</span>
                                        </label>
                                    </div>
                                </div>
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
                                    {selectedItem.item_type === 'Retail' && (
                                        <div className="flex-1">
                                            <label className="label">SKU (Unique Code)</label>
                                            <input
                                                className="input-field"
                                                style={{ fontWeight: 700, letterSpacing: '0.5px' }}
                                                value={selectedItem.sku || ''}
                                                onChange={(e) => setSelectedItem({ ...selectedItem, sku: e.target.value.toUpperCase() })}
                                                placeholder="AUTOGENERATED"
                                            />
                                        </div>
                                    )}
                                </div>

                                {selectedItem.item_type === 'Retail' && (
                                    <>
                                        <div className="row gap-sm panel panel--tight" style={{ background: 'var(--surface-alt)', border: '1px dashed var(--border)' }}>
                                            <div style={{ width: '80px' }}>
                                                <label className="label">Source</label>
                                                <input
                                                    className="input-field"
                                                    maxLength={3}
                                                    placeholder="ABC"
                                                    value={selectedItem.source_code || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${val}-${selectedItem.model_name}-${selectedItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        setSelectedItem({ ...selectedItem, source_code: val, sku: newSku });
                                                    }}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="label">Model Name</label>
                                                <input
                                                    className="input-field"
                                                    placeholder="Model"
                                                    value={selectedItem.model_name || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${selectedItem.source_code}-${val}-${selectedItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        setSelectedItem({ ...selectedItem, model_name: val, sku: newSku });
                                                    }}
                                                />
                                            </div>
                                            <div style={{ width: '80px' }}>
                                                <label className="label">Size</label>
                                                <input
                                                    className="input-field"
                                                    maxLength={10}
                                                    placeholder="L"
                                                    value={selectedItem.size_code || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${selectedItem.source_code}-${selectedItem.model_name}-${val}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        setSelectedItem({ ...selectedItem, size_code: val, sku: newSku });
                                                    }}
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
                                    </>
                                )}
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
                                    {selectedItem.item_type === 'Retail' && (
                                        <>
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
                                        </>
                                    )}
                                </div>
                                {selectedItem.item_type === 'Retail' && (
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
                                )}
                                <div className="row gap-sm">
                                    <div className="flex-1">
                                        <label className="label">Vendor Name</label>
                                        <input
                                            className="input-field"
                                            placeholder="Where do we buy this?"
                                            value={selectedItem.vendor_name || ''}
                                            onChange={(e) => setSelectedItem({ ...selectedItem, vendor_name: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="label">Vendor Contact</label>
                                        <input
                                            className="input-field"
                                            placeholder="Phone or Email"
                                            value={selectedItem.vendor_contact || ''}
                                            onChange={(e) => setSelectedItem({ ...selectedItem, vendor_contact: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Purchase Link</label>
                                    <input
                                        className="input-field"
                                        placeholder="https://amazon.in/..."
                                        value={selectedItem.purchase_link || ''}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, purchase_link: e.target.value })}
                                    />
                                </div>

                                <button type="submit" className="btn btn-primary btn--full" disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                showPrintModal && (
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

            {showConsumeModal && consumeData.id && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '400px' }}>
                        <button className="modal-close" onClick={() => setShowConsumeModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Consume Stock</h2>
                        <form onSubmit={handleConsume} className="stack-md">
                            <div>
                                <label className="label">Quantity Consumed</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    min="1"
                                    required
                                    value={consumeData.quantity}
                                    onChange={e => setConsumeData({ ...consumeData, quantity: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Notes (Optional)</label>
                                <textarea
                                    className="input-field"
                                    placeholder="e.g., Taken for Designer desk"
                                    value={consumeData.notes}
                                    onChange={e => setConsumeData({ ...consumeData, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary btn--full" disabled={saving} style={{ background: 'var(--danger)' }}>
                                {saving ? 'Consuming...' : 'Consume Item'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showRestockModal && restockData.id && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '400px' }}>
                        <button className="modal-close" onClick={() => setShowRestockModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Restock Supply</h2>
                        <form onSubmit={handleRestock} className="stack-md">
                            <div>
                                <label className="label">Quantity Received</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    min="1"
                                    required
                                    value={restockData.quantity}
                                    onChange={e => setRestockData({ ...restockData, quantity: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">New Cost Price (Optional)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="input-field"
                                    value={restockData.cost}
                                    onChange={e => setRestockData({ ...restockData, cost: e.target.value })}
                                />
                                <div className="text-xs muted mt-4">Leave empty to keep current cost.</div>
                            </div>
                            <div>
                                <label className="label">Notes (Optional)</label>
                                <textarea
                                    className="input-field"
                                    placeholder="e.g., Delivery delayed by 2 days"
                                    value={restockData.notes}
                                    onChange={e => setRestockData({ ...restockData, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary btn--full" disabled={saving}>
                                {saving ? 'Restocking...' : 'Log Restock'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showReviewModal && extractedBillData && (
                <div className="modal-backdrop" style={{ zIndex: 1000 }}>
                    <div className="modal" style={{ maxWidth: '800px', width: '100%' }}>
                        <button className="modal-close" onClick={() => setShowReviewModal(false)}><X size={22} /></button>
                        <h2 className="section-title mb-16">Review Extracted Bill details</h2>
                        <div className="alert alert--info mb-16">
                            <span>Please review the data extracted by the OCR system. You may edit any field before saving to inventory. Items with existing Names/Categories will be merged automatically.</span>
                        </div>

                        <div className="row gap-md mb-16">
                            <div className="flex-1">
                                <label className="label">Vendor Name</label>
                                <input className="input-field" value={extractedBillData.vendor_name || ''} onChange={(e) => setExtractedBillData({ ...extractedBillData, vendor_name: e.target.value })} />
                            </div>
                            <div className="flex-1">
                                <label className="label">Vendor Contact</label>
                                <input className="input-field" value={extractedBillData.vendor_contact || ''} onChange={(e) => setExtractedBillData({ ...extractedBillData, vendor_contact: e.target.value })} />
                            </div>
                        </div>

                        <div className="panel panel--tight table-scroll mb-16">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Item Name</th>
                                        <th>Qty</th>
                                        <th>Unit Cost</th>
                                        <th style={{ width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {extractedBillData.items.map((item, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <input className="input-field" style={{ padding: '4px 8px', height: '30px' }} value={item.name} onChange={(e) => {
                                                    const newItems = [...extractedBillData.items];
                                                    newItems[idx].name = e.target.value;
                                                    setExtractedBillData({ ...extractedBillData, items: newItems });
                                                }} />
                                            </td>
                                            <td>
                                                <input type="number" className="input-field" style={{ padding: '4px 8px', height: '30px', width: '70px' }} value={item.quantity} onChange={(e) => {
                                                    const newItems = [...extractedBillData.items];
                                                    newItems[idx].quantity = e.target.value;
                                                    setExtractedBillData({ ...extractedBillData, items: newItems });
                                                }} />
                                            </td>
                                            <td>
                                                <input type="number" step="0.01" className="input-field" style={{ padding: '4px 8px', height: '30px', width: '100px' }} value={item.cost_price} onChange={(e) => {
                                                    const newItems = [...extractedBillData.items];
                                                    newItems[idx].cost_price = e.target.value;
                                                    setExtractedBillData({ ...extractedBillData, items: newItems });
                                                }} />
                                            </td>
                                            <td>
                                                <button className="btn btn-ghost" onClick={() => {
                                                    const newItems = extractedBillData.items.filter((_, i) => i !== idx);
                                                    setExtractedBillData({ ...extractedBillData, items: newItems });
                                                }}>
                                                    <Trash2 size={16} className="text-danger" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {extractedBillData.items.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="text-center muted table-empty">
                                                No items extracted. The image might have been too blurry or layout not recognized.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            <button className="btn btn-ghost mt-4 w-full" onClick={() => {
                                setExtractedBillData({
                                    ...extractedBillData,
                                    items: [...extractedBillData.items, { name: 'New Item', quantity: 1, cost_price: 0 }]
                                });
                            }}>
                                <Plus size={16} /> Add Missing Row
                            </button>
                        </div>

                        <div className="row justify-end gap-sm">
                            <button className="btn btn-secondary" onClick={() => setShowReviewModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleBatchSaveBill}>Save All to Inventory</button>
                        </div>

                        {extractedBillData.raw_text && (
                            <details className="mt-16 muted text-xs">
                                <summary className="cursor-pointer">Show Raw OCR Text (Debug)</summary>
                                <pre style={{ maxHeight: '150px', overflow: 'auto', background: 'var(--surface-alt)', padding: '8px', border: '1px solid var(--border)', marginTop: '8px' }}>
                                    {extractedBillData.raw_text}
                                </pre>
                            </details>
                        )}
                    </div>
                </div>
            )}
        </div >
    );
};

export default Inventory;

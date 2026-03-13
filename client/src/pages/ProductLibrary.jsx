import React, { useEffect, useState } from 'react';
import api, { imgUrl } from '../services/api';
import SecureImage from '../components/SecureImage';
import useAuth from '../hooks/useAuth';

import { Plus, Trash2, ChevronRight, ChevronDown, Package, Layers, Grid, Save, X, PlusCircle, ArrowUp, ArrowDown, RotateCcw, Edit2, GripVertical, Copy, Eye, EyeOff } from 'lucide-react';
import { isTouchDevice } from '../services/utils';
import { useConfirm } from '../contexts/ConfirmContext';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
import ImageCropModal from '../components/ImageCropModal';

const SortableItem = ({ id, children, className, disabled, ...props }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.6 : 1,
        cursor: 'default',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={className}
            {...props}
        >
            {!disabled && <div {...attributes} {...listeners} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}></div>}
            <div style={{ position: 'relative', zIndex: 1 }}>
                {children}
            </div>
        </div>
    );
};

const ProductLibrary = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin';
    const { confirm } = useConfirm();
    const [hierarchy, setHierarchy] = useState([]);
    const [loading, setLoading] = useState(true);
    // Navigation state: [] = categories, [catId] = subcategories, [catId, subId] = products
    const [viewPath, setViewPath] = useState([]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // Avoid accidental drags on clicks
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const [showCatModal, setShowCatModal] = useState(false);
    const [showSubModal, setShowSubModal] = useState(false);
    const [showProdModal, setShowProdModal] = useState(false);

    const [selectedCatId, setSelectedCatId] = useState(null);
    const [selectedSubId, setSelectedSubId] = useState(null);

    const [newCatName, setNewCatName] = useState('');
    const [newSubName, setNewSubName] = useState('');
    const [productImage, setProductImage] = useState(null);
    const [productImagePreview, setProductImagePreview] = useState('');
    const [cropState, setCropState] = useState(null);
    const [savingOrder, setSavingOrder] = useState(false);
    const [catImage, setCatImage] = useState(null);
    const [catImagePreview, setCatImagePreview] = useState('');
    const [catImageUrl, setCatImageUrl] = useState('');
    const [subImage, setSubImage] = useState(null);
    const [subImagePreview, setSubImagePreview] = useState('');
    const [subImageUrl, setSubImageUrl] = useState('');

    const [isEditing, setIsEditing] = useState(false);
    const [editId, setEditId] = useState(null);

    const [newProduct, setNewProduct] = useState({
        name: '',
        product_code: '',
        calculation_type: 'Normal',
        description: '',
        has_paper_rate: false,
        paper_rate: 0,
        has_double_side_rate: false,
        slabs: [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
        extras: [],
        isPhysicalProduct: false // Checklist: show in inventory
    });



    useEffect(() => {
        fetchHierarchy();
    }, []);

    useEffect(() => {
        if (!productImage) {
            if (!isEditing) setProductImagePreview('');
            return;
        }
        const url = URL.createObjectURL(productImage);
        setProductImagePreview(url);
        return () => URL.revokeObjectURL(url);
    }, [productImage]);

    const fetchHierarchy = async () => {
        try {
            const res = await api.get('/product-hierarchy');
            setHierarchy(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Fetch hierarchy error:", err);
            toast.error(err.response?.data?.message || err.message || 'Failed to load product library');
            setLoading(false);
        }
    };

    const toggleCat = (id) => {
        setViewPath([id]);
    };

    const toggleSub = (subId) => {
        // Find category for this sub
        const cat = hierarchy.find(c => c.subcategories.some(s => s.id === subId));
        if (cat) setViewPath([cat.id, subId]);
    };

    const navigateBack = (index) => {
        if (index === -1) setViewPath([]);
        else setViewPath(viewPath.slice(0, index + 1));
    };

    const getCurrentViewInfo = () => {
        if (viewPath.length === 0) {
            return { type: 'root', items: hierarchy, title: 'Categories' };
        }
        const [catId, subId] = viewPath;
        const category = hierarchy.find(c => c.id === catId);

        if (viewPath.length === 1) {
            return {
                type: 'category',
                parent: category,
                items: category?.subcategories || [],
                title: category?.name || 'Sub-categories'
            };
        }

        const subcategory = category?.subcategories.find(s => s.id === subId);
        return {
            type: 'subcategory',
            parent: subcategory,
            grandParent: category,
            items: subcategory?.products || [],
            title: subcategory?.name || 'Products'
        };
    };

    const viewInfo = getCurrentViewInfo();
    const availableSubcategories = selectedCatId
        ? hierarchy.find(c => c.id === selectedCatId)?.subcategories || []
        : [];

    const resetProductForm = () => {
        setNewProduct({
            name: '',
            product_code: '',
            calculation_type: 'Normal',
            description: '',
            has_paper_rate: false,
            paper_rate: 0,
            has_double_side_rate: false,
            slabs: [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
            extras: [],
            isPhysicalProduct: false
        });
        setProductImage(null);
        setProductImagePreview('');
        setIsEditing(false);
        setEditId(null);
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        try {
            const formData = new FormData();
            formData.append('name', newCatName);
            if (catImage) formData.append('image', catImage);
            else formData.append('image_url', catImageUrl);
            if (isEditing) {
                await api.put(`/product-categories/${editId}`, formData);
            } else {
                await api.post('/product-categories', formData);
            }
            setNewCatName('');
            setCatImage(null);
            setCatImagePreview('');
            setCatImageUrl('');
            setIsEditing(false);
            setEditId(null);
            setShowCatModal(false);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving category');
        }
    };

    const handleSaveSubcategory = async (e) => {
        e.preventDefault();
        try {
            const formData = new FormData();
            formData.append('category_id', selectedCatId);
            formData.append('name', newSubName);
            if (subImage) formData.append('image', subImage);
            else formData.append('image_url', subImageUrl);
            if (isEditing) {
                await api.put(`/product-subcategories/${editId}`, formData);
            } else {
                await api.post('/product-subcategories', formData);
            }
            setNewSubName('');
            setSubImage(null);
            setSubImagePreview('');
            setSubImageUrl('');
            setIsEditing(false);
            setEditId(null);
            setShowSubModal(false);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving subcategory');
        }
    };

    const handleSaveProduct = async (e) => {
        e.preventDefault();
        if (!isAdmin) return;
        if (!selectedSubId) {
            toast.success('Please select a sub-category for this product.');
            return;
        }
        try {
            const formData = new FormData();
            formData.append('subcategory_id', selectedSubId);
            formData.append('name', newProduct.name);
            formData.append('product_code', newProduct.product_code || '');
            formData.append('calculation_type', newProduct.calculation_type);
            formData.append('description', newProduct.description || '');
            formData.append('has_paper_rate', newProduct.has_paper_rate);
            formData.append('paper_rate', newProduct.paper_rate);
            formData.append('has_double_side_rate', newProduct.has_double_side_rate);
            formData.append('slabs', JSON.stringify(newProduct.slabs));
            formData.append('extras', JSON.stringify(newProduct.extras));
            formData.append('isPhysicalProduct', newProduct.isPhysicalProduct ? 1 : 0);
            if (productImage) formData.append('image', productImage);
            else if (isEditing && newProduct.image_url) formData.append('image_url', newProduct.image_url);

            if (isEditing) {
                await api.put(`/products/${editId}`, formData);
            } else {
                await api.post('/products', formData);
            }
            resetProductForm();
            setShowProdModal(false);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving product');
        }
    };

    const handleRemoveProductImage = async () => {
        if (!isEditing || !editId) return;

        const isConfirmed = await confirm({
            title: 'Remove Image',
            message: 'Are you sure you want to remove this product image?',
            confirmText: 'Remove',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.delete(`/products/${editId}/image`);
            setProductImage(null);
            setProductImagePreview('');
            setNewProduct({ ...newProduct, image_url: null });
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to remove product image');
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const info = getCurrentViewInfo();
        const oldIndex = info.items.findIndex(item => item.id === active.id);
        const newIndex = info.items.findIndex(item => item.id === over.id);

        const newItems = arrayMove(info.items, oldIndex, newIndex);

        // Update local state first for instant feedback
        if (info.type === 'root') {
            setHierarchy(newItems);
            // Sync to backend
            const updates = newItems.map((cat, idx) => ({ id: cat.id, position: idx }));
            try {
                await api.put('/product-positions', { type: 'category', updates });
            } catch (err) { console.error("Error reordering categories:", err); fetchHierarchy(); }
        } else if (info.type === 'category') {
            const updatedHierarchy = hierarchy.map(cat => {
                if (cat.id === info.parent.id) return { ...cat, subcategories: newItems };
                return cat;
            });
            setHierarchy(updatedHierarchy);
            // Sync to backend
            const updates = newItems.map((sub, idx) => ({ id: sub.id, position: idx }));
            try {
                await api.put('/product-positions', { type: 'subcategory', updates });
            } catch (err) { console.error("Error reordering subcategories:", err); fetchHierarchy(); }
        } else if (info.type === 'subcategory') {
            const updatedHierarchy = hierarchy.map(cat => {
                if (cat.id === info.grandParent.id) {
                    return {
                        ...cat,
                        subcategories: cat.subcategories.map(s => {
                            if (s.id === info.parent.id) return { ...s, products: newItems };
                            return s;
                        })
                    };
                }
                return cat;
            });
            setHierarchy(updatedHierarchy);
            // Sync to backend
            const updates = newItems.map((prod, idx) => ({ id: prod.id, position: idx }));
            try {
                await api.put('/product-positions', { type: 'product', updates });
            } catch (err) { console.error("Error reordering products:", err); fetchHierarchy(); }
        }
    };

    const handleDelete = async (type, id, name) => {
        const isConfirmed = await confirm({
            title: `Delete ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            message: `Are you sure you want to delete this ${type}: "${name}"?`,
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            const endpoint = type === 'category' ? `/product-categories/${id}` : type === 'subcategory' ? `/product-subcategories/${id}` : `/products/${id}`;
            await api.delete(endpoint);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || `Error deleting ${type}`);
        }
    };

    const startEditCategory = (cat) => {
        setIsEditing(true);
        setEditId(cat.id);
        setNewCatName(cat.name);
        setCatImage(null);
        setCatImageUrl(cat.image_url || '');
        setCatImagePreview(cat.image_url ? imgUrl(cat.image_url) : '');
        setShowCatModal(true);
    };

    const startEditSubcategory = (sub) => {
        setIsEditing(true);
        setEditId(sub.id);
        setSelectedCatId(sub.category_id);
        setNewSubName(sub.name);
        setSubImage(null);
        setSubImageUrl(sub.image_url || '');
        setSubImagePreview(sub.image_url ? imgUrl(sub.image_url) : '');
        setShowSubModal(true);
    };

    const startEditProduct = async (prodId) => {
        try {
            const res = await api.get(`/products/${prodId}`);
            const prod = res.data;
            const parentCategory = hierarchy.find(c => c.subcategories.some(s => s.id === prod.subcategory_id));
            setIsEditing(true);
            setEditId(prod.id);
            setSelectedSubId(prod.subcategory_id);
            setSelectedCatId(parentCategory?.id || null);
            setNewProduct({
                name: prod.name,
                product_code: prod.product_code || '',
                calculation_type: prod.calculation_type,
                description: prod.description || '',
                has_paper_rate: !!prod.has_paper_rate,
                paper_rate: prod.paper_rate,
                has_double_side_rate: !!prod.has_double_side_rate,
                inventory_item_id: prod.inventory_item_id || '',
                slabs: prod.slabs && prod.slabs.length > 0 ? prod.slabs : [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
                extras: prod.extras || [],
                image_url: prod.image_url,
                isPhysicalProduct: prod.is_physical_product === 1 || prod.is_physical_product === true
            });
            setProductImagePreview(prod.image_url ? imgUrl(prod.image_url) : '');
            setShowProdModal(true);
        } catch (err) {
            toast.error('Error fetching product details');
        }
    };

    const handleToggleProduct = async (prod) => {
        const isActive = prod.is_active === 1 || prod.is_active === true;
        try {
            await api.patch(`/products/${prod.id}/toggle-active`);
            toast.success(isActive ? `"${prod.name}" disabled` : `"${prod.name}" enabled`);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating product status');
        }
    };

    const handleToggleCategory = async (cat) => {
        const isActive = cat.is_active === 1 || cat.is_active === true;
        try {
            await api.patch(`/product-categories/${cat.id}/toggle-active`);
            toast.success(isActive ? `"${cat.name}" disabled` : `"${cat.name}" enabled`);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating category status');
        }
    };

    const handleToggleSubcategory = async (sub) => {
        const isActive = sub.is_active === 1 || sub.is_active === true;
        try {
            await api.patch(`/product-subcategories/${sub.id}/toggle-active`);
            toast.success(isActive ? `"${sub.name}" disabled` : `"${sub.name}" enabled`);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating subcategory status');
        }
    };

    const handleDuplicateProduct = async (prodId) => {
        const isConfirmed = await confirm({
            title: 'Duplicate Product',
            message: 'Are you sure you want to duplicate this product? This will pre-fill the form with its details.',
            confirmText: 'Duplicate',
            type: 'primary'
        });
        if (!isConfirmed) return;

        try {
            const res = await api.get(`/products/${prodId}`);
            const prod = res.data;
            const parentCategory = hierarchy.find(c => c.subcategories.some(s => s.id === prod.subcategory_id));

            setIsEditing(false); // Mode is create
            setEditId(null);
            setSelectedSubId(prod.subcategory_id);
            setSelectedCatId(parentCategory?.id || null);

            setNewProduct({
                name: `${prod.name} (Copy)`,
                product_code: '',
                calculation_type: prod.calculation_type,
                description: prod.description || '',
                has_paper_rate: !!prod.has_paper_rate,
                paper_rate: prod.paper_rate,
                has_double_side_rate: !!prod.has_double_side_rate,
                inventory_item_id: prod.inventory_item_id || '',
                slabs: prod.slabs && prod.slabs.length > 0 ? prod.slabs.map(s => ({ ...s, id: undefined })) : [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
                extras: prod.extras ? prod.extras.map(e => ({ ...e, id: undefined })) : [],
                image_url: prod.image_url // Retain image ref if possible, or leave blank if we want fresh upload. Usually better to copy.
            });
            // For duplicate, we might not want to carry over the image unless user explicitly re-uploads or we backend supports copying. 
            // For now, let's keep it simple and NOT copy the image file itself to avoid complexity, but we can show it as "current" if we wanted.
            // Actually, best to perform a clean start for image to avoid confusion.
            setProductImagePreview('');
            setProductImage(null);

            setShowProdModal(true);
        } catch (err) {
            console.error("Duplicate error:", err);
            toast.error('Error duplicating product');
        }
    };

    const addSlab = () => {
        if (newProduct.calculation_type === 'Range') {
            const lastSlab = newProduct.slabs[newProduct.slabs.length - 1];
            const lastMax = lastSlab?.max_qty;
            const nextMin = lastMax !== '' && lastMax !== null && lastMax !== undefined
                ? Number(lastMax) + 1
                : 0;
            setNewProduct({
                ...newProduct,
                slabs: [...newProduct.slabs, { min_qty: nextMin, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }]
            });
            return;
        }
        // Slab logic (Smart Suggestion)
        let nextMin = 0;
        const slabs = newProduct.slabs;
        if (slabs.length >= 2) {
            const last = slabs[slabs.length - 1];
            const secondLast = slabs[slabs.length - 2];
            const diff = (Number(last.min_qty) || 0) - (Number(secondLast.min_qty) || 0);
            nextMin = (Number(last.min_qty) || 0) + diff;
            if (nextMin < 0) nextMin = 0; // prevent negative
        } else if (slabs.length === 1) {
            const lastMin = Number(slabs[0].min_qty) || 0;
            // If first is reasonable (e.g. 100), suggest next like 200? Or just +1?
            // Let's just default to lastMin + 100 if > 0, else 100?
            // Actually, simplest is just 0 or let user type.
            // But if user has [100], next probably > 100.
            nextMin = lastMin > 0 ? lastMin * 2 : 100;
        }

        setNewProduct({
            ...newProduct,
            slabs: [...newProduct.slabs, { min_qty: nextMin, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }]
        });
    };

    const removeSlab = (index) => {
        setNewProduct({
            ...newProduct,
            slabs: newProduct.slabs.filter((_, i) => i !== index)
        });
    };

    const addExtra = () => {
        setNewProduct({
            ...newProduct,
            extras: [...newProduct.extras, { purpose: '', amount: 0 }]
        });
    };

    const moveSlabFocus = (rowIndex, colIndex, direction) => {
        const nextRow = rowIndex + direction;
        if (nextRow < 0) return;
        const selector = `[data-slab-row="${nextRow}"][data-slab-col="${colIndex}"]`;
        const target = document.querySelector(selector);
        if (target && typeof target.focus === 'function') target.focus();
    };

    const removeExtra = (index) => {
        setNewProduct({
            ...newProduct,
            extras: newProduct.extras.filter((_, i) => i !== index)
        });
    };

    const openCropper = (file) => {
        if (!file) return;
        setCropState({ file });
    };

    const handleCropCancel = () => {
        setCropState(null);
    };

    const handleCropComplete = (croppedFile) => {
        setProductImage(croppedFile);
        setCropState(null);
    };

    const getPositionValue = (item, fallback) => {
        const value = Number(item?.position);
        if (Number.isFinite(value) && value > 0) return value;
        return fallback;
    };

    const updatePositions = async (type, updates) => {
        if (!updates.length) return;
        setSavingOrder(true);
        try {
            await api.put('/product-positions', { type, updates });
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to update order');
        } finally {
            setSavingOrder(false);
        }
    };

    const moveItem = async (type, items, index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= items.length) return;
        const current = items[index];
        const target = items[targetIndex];
        const currentPos = getPositionValue(current, index + 1);
        const targetPos = getPositionValue(target, targetIndex + 1);
        await updatePositions(type, [
            { id: current.id, position: targetPos },
            { id: target.id, position: currentPos }
        ]);
    };

    const handleResetUsage = async () => {
        const isConfirmed = await confirm({
            title: 'Reset Usage Order',
            message: 'Are you sure you want to reset usage-based ordering for all staff?',
            confirmText: 'Reset',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.post('/product-usage/reset', {});
            toast.success('Usage order reset to default.');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to reset usage order');
        }
    };

    if (loading) return <div className="p-20 text-center">Loading Library...</div>;

    return (
        <div className="stack-lg">
            <header className="stack-sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                        <h1 className="page-title" style={{ margin: 0 }}>Product & Rate Library</h1>
                        <p className="muted" style={{ margin: '2px 0 0' }}>Manage your printing categories, products, and pricing slabs.</p>
                    </div>
                    {isAdmin && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} onClick={handleResetUsage}>
                            <RotateCcw size={15} /> Reset Usage Order
                        </button>
                        {viewInfo.type === 'root' && (
                            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} onClick={() => { setIsEditing(false); setNewCatName(''); setShowCatModal(true); }}>
                                <Plus size={16} /> New Category
                            </button>
                        )}
                        {viewInfo.type === 'category' && (
                            <>
                                <button className="btn btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} onClick={() => { setSelectedCatId(viewInfo.parent.id); setIsEditing(false); resetProductForm(); setSelectedSubId(viewInfo.items[0]?.id || null); setShowProdModal(true); }}>
                                    <Plus size={16} /> New Product
                                </button>
                                <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} onClick={() => { setSelectedCatId(viewInfo.parent.id); setIsEditing(false); setNewSubName(''); setShowSubModal(true); }}>
                                    <Plus size={16} /> New Sub-category
                                </button>
                            </>
                        )}
                        {viewInfo.type === 'subcategory' && (
                            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }} onClick={() => { setSelectedCatId(viewInfo.grandParent?.id || null); setSelectedSubId(viewInfo.parent.id); setIsEditing(false); resetProductForm(); setShowProdModal(true); }}>
                                <Plus size={16} /> New Product
                            </button>
                        )}
                    </div>
                    )}
                </div>

                {/* Breadcrumbs */}
                <nav className="breadcrumbs row gap-xs items-center text-sm py-8">
                    <span
                        className={`breadcrumb-item pointer ${viewPath.length === 0 ? 'font-bold text-accent' : 'muted hover-text-accent'}`}
                        onClick={() => navigateBack(-1)}
                    >
                        Library
                    </span>
                    {viewPath.length > 0 && (
                        <>
                            <ChevronRight size={14} className="muted" />
                            <span
                                className={`breadcrumb-item pointer ${viewPath.length === 1 ? 'font-bold text-accent' : 'muted hover-text-accent'}`}
                                onClick={() => navigateBack(0)}
                            >
                                {hierarchy.find(c => c.id === viewPath[0])?.name || 'Category'}
                            </span>
                        </>
                    )}
                    {viewPath.length > 1 && (
                        <>
                            <ChevronRight size={14} className="muted" />
                            <span className="breadcrumb-item font-bold text-accent">
                                {hierarchy.find(c => c.id === viewPath[0])?.subcategories.find(s => s.id === viewPath[1])?.name || 'Sub-category'}
                            </span>
                        </>
                    )}
                </nav>
            </header>

            <div className="grid-container">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={viewInfo.items.map(i => i.id)}
                        strategy={rectSortingStrategy}
                    >
                        <div className="product-grid">
                            {viewInfo.items.length === 0 && (
                                <div className="p-40 text-center muted italic border-dashed border-radius-lg flex-1" style={{ gridColumn: '1 / -1' }}>
                                    No {viewInfo.title.toLowerCase()} found in this section.
                                </div>
                            )}

                            {viewInfo.type === 'root' && viewInfo.items.map((cat, idx) => (
                                <SortableItem key={cat.id} id={cat.id} disabled={!isAdmin} className={`product-card pointer${cat.is_active === 0 || cat.is_active === false ? ' product-card--disabled' : ''}`}>
                                    {isAdmin && (
                                    <div className="product-card__actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); startEditCategory(cat); }} title="Edit Category">
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            className={`product-card__btn${cat.is_active === 0 || cat.is_active === false ? ' product-card__btn--enable' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleCategory(cat); }}
                                            title={cat.is_active === 0 || cat.is_active === false ? 'Enable Category' : 'Disable Category'}
                                        >
                                            {cat.is_active === 0 || cat.is_active === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button className="product-card__btn product-card__btn--delete" onClick={(e) => { e.stopPropagation(); handleDelete('category', cat.id, cat.name); }} title="Delete Category">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    )}
                                    <div className="product-card__image-wrap" onClick={() => toggleCat(cat.id)}>
                                        {cat.image_url ? (
                                            <SecureImage src={cat.image_url} alt={cat.name} className="product-card__img" />
                                        ) : (
                                            <div className="product-card__placeholder">
                                                <Grid size={48} style={{ color: 'var(--accent-2)' }} />
                                            </div>
                                        )}
                                        <div className="drag-indicator">
                                            <GripVertical size={16} />
                                        </div>
                                    </div>
                                    <div className="product-card__content" onClick={() => toggleCat(cat.id)}>
                                        <div className="product-card__name">{cat.name}</div>
                                        <div className="product-card__meta">
                                            {cat.subcategories?.length || 0} Sub-categories
                                        </div>
                                    </div>
                                </SortableItem>
                            ))}

                            {viewInfo.type === 'category' && viewInfo.items.map((sub, idx) => (
                                <SortableItem key={sub.id} id={sub.id} disabled={!isAdmin} className={`product-card pointer${sub.is_active === 0 || sub.is_active === false ? ' product-card--disabled' : ''}`}>
                                    {isAdmin && (
                                    <div className="product-card__actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); startEditSubcategory(sub); }} title="Edit Sub-category">
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            className={`product-card__btn${sub.is_active === 0 || sub.is_active === false ? ' product-card__btn--enable' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleSubcategory(sub); }}
                                            title={sub.is_active === 0 || sub.is_active === false ? 'Enable Sub-category' : 'Disable Sub-category'}
                                        >
                                            {sub.is_active === 0 || sub.is_active === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button className="product-card__btn product-card__btn--delete" onClick={(e) => { e.stopPropagation(); handleDelete('subcategory', sub.id, sub.name); }} title="Delete Sub-category">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    )}
                                    <div className="product-card__image-wrap" onClick={() => setViewPath([viewPath[0], sub.id])}>
                                        {sub.image_url ? (
                                            <SecureImage src={sub.image_url} alt={sub.name} className="product-card__img" />
                                        ) : (
                                            <div className="product-card__placeholder">
                                                <Layers size={48} style={{ color: 'var(--accent-1)' }} />
                                            </div>
                                        )}
                                        <div className="drag-indicator">
                                            <GripVertical size={16} />
                                        </div>
                                    </div>
                                    <div className="product-card__content" onClick={() => setViewPath([viewPath[0], sub.id])}>
                                        <div className="product-card__name">{sub.name}</div>
                                        <div className="product-card__meta">
                                            {sub.products?.length || 0} Products
                                        </div>
                                    </div>
                                </SortableItem>
                            ))}

                            {viewInfo.type === 'subcategory' && viewInfo.items.map((prod, idx) => (
                                <SortableItem
                                    key={prod.id}
                                    id={prod.id}
                                    className={`product-card${prod.is_active === 0 || prod.is_active === false ? ' product-card--disabled' : ''}`}
                                    disabled={!isAdmin}
                                    {...(isTouchDevice()
                                        ? { onClick: () => startEditProduct(prod.id) }
                                        : { onDoubleClick: () => startEditProduct(prod.id) }
                                    )}
                                    title={isTouchDevice() ? (isAdmin ? 'Click to edit' : 'Click to view rates') : (isAdmin ? 'Double click to edit' : 'Double click to view rates')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {isAdmin && (
                                    <div className="product-card__actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); startEditProduct(prod.id); }} title="Edit Product">
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); handleDuplicateProduct(prod.id); }} title="Duplicate Product">
                                            <Copy size={14} />
                                        </button>
                                        <button
                                            className={`product-card__btn${prod.is_active === 0 || prod.is_active === false ? ' product-card__btn--enable' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleProduct(prod); }}
                                            title={prod.is_active === 0 || prod.is_active === false ? 'Enable Product' : 'Disable Product'}
                                        >
                                            {prod.is_active === 0 || prod.is_active === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button className="product-card__btn product-card__btn--delete" onClick={(e) => { e.stopPropagation(); handleDelete('product', prod.id, prod.name); }} title="Delete Product">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    )}
                                    <div className="product-card__image-wrap">
                                        <div className="drag-indicator top-left">
                                            <GripVertical size={16} />
                                        </div>
                                        {prod.image_url ? (
                                            <SecureImage src={prod.image_url} alt={prod.name} className="product-card__img" />
                                        ) : (
                                            <div className="product-card__placeholder">
                                                <Package size={48} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="product-card__content">
                                        <div className="product-card__name">{prod.name}</div>
                                        <div className="product-card__meta">
                                            <span className="badge badge--sm">{prod.calculation_type}</span>
                                        </div>
                                        {prod.description && <p className="text-xs muted mb-8 line-clamp-2">{prod.description}</p>}
                                    </div>
                                </SortableItem>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Modals for Cat/Sub/Prod */}
            {showCatModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '420px' }}>
                        <h2 className="section-title mb-16">{isEditing ? 'Edit Category' : 'New Category'}</h2>
                        <form onSubmit={handleSaveCategory} className="stack-md">
                            <div>
                                <label className="label">Category Name</label>
                                <input
                                    className="input-field"
                                    placeholder="e.g. Paper Printing"
                                    value={newCatName}
                                    onChange={e => setNewCatName(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Image (Optional)</label>
                                {catImagePreview && (
                                    <div className="row gap-sm items-center mb-8">
                                        <img src={catImagePreview} alt="Preview" className="thumb-img" />
                                        <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => { setCatImage(null); setCatImagePreview(''); setCatImageUrl(''); }}>Remove</button>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="input-field"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        if (file) { setCatImage(file); setCatImagePreview(URL.createObjectURL(file)); }
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                            <div className="row gap-md">
                                <button type="button" className="btn btn-ghost flex-1" onClick={() => { setShowCatModal(false); setCatImage(null); setCatImagePreview(''); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary flex-1">{isEditing ? 'Update' : 'Add'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showSubModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '420px' }}>
                        <h2 className="section-title mb-16">{isEditing ? 'Edit Sub-category' : 'New Sub-category'}</h2>
                        <form onSubmit={handleSaveSubcategory} className="stack-md">
                            <div>
                                <label className="label">Sub-category Name</label>
                                <input
                                    className="input-field"
                                    placeholder="e.g. Business Cards"
                                    value={newSubName}
                                    onChange={e => setNewSubName(e.target.value)}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Image (Optional)</label>
                                {subImagePreview && (
                                    <div className="row gap-sm items-center mb-8">
                                        <img src={subImagePreview} alt="Preview" className="thumb-img" />
                                        <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => { setSubImage(null); setSubImagePreview(''); setSubImageUrl(''); }}>Remove</button>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="input-field"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        if (file) { setSubImage(file); setSubImagePreview(URL.createObjectURL(file)); }
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                            <div className="row gap-md">
                                <button type="button" className="btn btn-ghost flex-1" onClick={() => { setShowSubModal(false); setSubImage(null); setSubImagePreview(''); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary flex-1">{isEditing ? 'Update' : 'Add'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showProdModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <button className="modal-close" onClick={() => { setShowProdModal(false); setIsEditing(false); }}><X size={20} /></button>
                        <h2 className="section-title mb-4">{isEditing ? (isAdmin ? 'Edit Product' : 'View Product Rates') : 'Add New Product'}</h2>
                        {isAdmin && <p className="muted mb-16 text-sm">Define pricing rules and default extras.</p>}

                        <form onSubmit={handleSaveProduct} className="stack-md">
                            <fieldset disabled={!isAdmin} style={{border:'none',padding:0,margin:0}}>
                            <div>
                                <label className="label">Sub-category</label>
                                <select
                                    className="input-field"
                                    value={selectedSubId || ''}
                                    onChange={(e) => setSelectedSubId(e.target.value ? Number(e.target.value) : null)}
                                    required
                                    disabled={availableSubcategories.length === 0}
                                >
                                    <option value="" disabled>
                                        {availableSubcategories.length === 0 ? 'No sub-categories available' : 'Select Sub-category'}
                                    </option>
                                    {availableSubcategories.map((sub) => (
                                        <option key={sub.id} value={sub.id}>{sub.name}</option>
                                    ))}
                                </select>
                            </div>
                            {isAdmin && (
                            <div>
                                <label className="label">Product Image (Optional)</label>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="input-field"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        if (file) openCropper(file);
                                        e.target.value = '';
                                    }}
                                />
                                {productImagePreview && (
                                    <div className="row gap-sm" style={{ marginTop: '8px' }}>
                                        <img src={productImagePreview} alt="Preview" className="thumb-img" />
                                        <span className="text-sm muted">Preview</span>
                                        {isEditing && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm text-error"
                                                onClick={handleRemoveProductImage}
                                            >
                                                Remove Image
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            )}
                            <div>
                                <label className="label">Product Name</label>
                                <input
                                    className="input-field"
                                    value={newProduct.name}
                                    onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                                    required
                                />
                            </div>
                            {isAdmin && (
                            <div>
                                <label className="label row items-center gap-xs">
                                    <input
                                        type="checkbox"
                                        checked={newProduct.isPhysicalProduct}
                                        onChange={e => setNewProduct({ ...newProduct, isPhysicalProduct: e.target.checked })}
                                    />
                                    This is a physical product (show in inventory)
                                </label>
                            </div>
                            )}
                            {isAdmin && (
                            <div>
                                <label className="label">Product Code (for QR)</label>
                                <input
                                    className="input-field"
                                    value={newProduct.product_code}
                                    onChange={e => setNewProduct({ ...newProduct, product_code: e.target.value.trim() })}
                                    placeholder="e.g. ABC-FLEX-12X18"
                                />
                            </div>
                            )}

                            {isAdmin && (
                            <div className="row gap-md">
                                <div className="flex-1">
                                    <label className="label">Calculation Method</label>
                                    <select
                                        className="input-field"
                                        value={newProduct.calculation_type}
                                        onChange={e => setNewProduct({ ...newProduct, calculation_type: e.target.value })}
                                    >
                                        <option value="Normal">Normal (Qty * Rate)</option>
                                        <option value="Slab">Slab (Interpolation)</option>
                                        <option value="Range">Range (Qty * Rate)</option>
                                    </select>
                                </div>
                                {newProduct.calculation_type === 'Slab' && (
                                    <div className="flex-1">
                                        <label className="label row items-center gap-xs">
                                            <input
                                                type="checkbox"
                                                checked={newProduct.has_paper_rate}
                                                onChange={e => setNewProduct({ ...newProduct, has_paper_rate: e.target.checked })}
                                            />
                                            Enable Paper Rate Add-on
                                        </label>
                                        {newProduct.has_paper_rate && (
                                            <input
                                                type="number"
                                                step="any"
                                                className="input-field"
                                                placeholder="Rate per unit"
                                                value={newProduct.paper_rate !== undefined ? newProduct.paper_rate : ''}
                                                onChange={e => setNewProduct({ ...newProduct, paper_rate: e.target.value === '' ? '' : Number(e.target.value) })}
                                                onWheel={e => e.preventDefault()}
                                            />
                                        )}
                                    </div>
                                )}
                                <div className="flex-1">
                                    <label className="label row items-center gap-xs">
                                        <input
                                            type="checkbox"
                                            checked={newProduct.has_double_side_rate}
                                            onChange={e => setNewProduct({ ...newProduct, has_double_side_rate: e.target.checked })}
                                        />
                                        Enable Double Side Rate
                                    </label>

                                </div>
                            </div>
                            )}

                            <div className="stack-sm">
                                <div className="row space-between items-center gap-md">
                                    <label className="label mb-0">Pricing Rules</label>
                                    {isAdmin && newProduct.calculation_type !== 'Normal' && (
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={addSlab}>
                                            <Plus size={14} /> Add Slab
                                        </button>
                                    )}
                                </div>

                                {newProduct.calculation_type === 'Normal' ? (
                                    <div className={`grid ${newProduct.has_double_side_rate ? 'grid-cols-3' : 'grid-cols-2'} gap-md bg-light p-12 rounded border`}>
                                        <div>
                                            <label className="text-xs muted font-bold uppercase mb-4 block">Retail Unit Rate (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                placeholder="e.g. 5.50"
                                                step="any"
                                                value={newProduct.slabs[0]?.unit_rate !== undefined ? newProduct.slabs[0]?.unit_rate : ''}
                                                onChange={e => {
                                                    const slabs = [...newProduct.slabs];
                                                    if (slabs.length === 0) slabs.push({ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 });
                                                    slabs[0].unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                    setNewProduct({ ...newProduct, slabs });
                                                }}
                                                onWheel={e => e.preventDefault()}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs muted font-bold uppercase mb-4 block">Offset Unit Rate (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                placeholder="e.g. 3.20"
                                                step="any"
                                                value={newProduct.slabs[0]?.offset_unit_rate !== undefined ? newProduct.slabs[0]?.offset_unit_rate : ''}
                                                onChange={e => {
                                                    const slabs = [...newProduct.slabs];
                                                    if (slabs.length === 0) slabs.push({ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 });
                                                    slabs[0].offset_unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                    setNewProduct({ ...newProduct, slabs });
                                                }}
                                                onWheel={e => e.preventDefault()}
                                            />
                                        </div>
                                        {newProduct.has_double_side_rate && (
                                            <div>
                                                <label className="text-xs muted font-bold uppercase mb-4 block">Double Side Rate (₹)</label>
                                                <input
                                                    type="number"
                                                    className="input-field"
                                                    placeholder="e.g. 7.00"
                                                    step="any"
                                                    value={newProduct.slabs[0]?.double_side_unit_rate !== undefined ? newProduct.slabs[0]?.double_side_unit_rate : ''}
                                                    onChange={e => {
                                                        const slabs = [...newProduct.slabs];
                                                        if (slabs.length === 0) slabs.push({ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 });
                                                        slabs[0].double_side_unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                        setNewProduct({ ...newProduct, slabs });
                                                    }}
                                                    onWheel={e => e.preventDefault()}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="stack-sm bg-light p-16 rounded border overflow-x-auto">
                                        <div className="row gap-md px-4 pb-8 text-xs muted font-bold uppercase min-w-[500px]" style={{ borderBottom: '1px solid var(--border)' }}>
                                            <div className="flex-1">Min Qty</div>
                                            {newProduct.calculation_type === 'Range' && <div className="flex-1">Max Qty</div>}
                                            {newProduct.calculation_type === 'Slab' && <div className="flex-1">Base Value (Total ₹)</div>}
                                            {newProduct.calculation_type === 'Slab' && newProduct.has_double_side_rate && <div className="flex-1">Double Side Rate (₹)</div>}
                                            {newProduct.calculation_type === 'Range' && <div className="flex-1">Retail Rate (₹)</div>}
                                            {newProduct.calculation_type === 'Range' && <div className="flex-1">Offset Rate (₹)</div>}
                                            {newProduct.calculation_type === 'Range' && newProduct.has_double_side_rate && <div className="flex-1">Double Side Rate (₹)</div>}
                                            <div style={{ width: '36px' }}></div>
                                        </div>
                                        {newProduct.slabs.map((slab, idx) => (
                                            <div key={idx} className="row gap-sm items-center min-w-[500px]">
                                                <input
                                                    type="number" className="input-field text-sm"
                                                    placeholder="Min Qty"
                                                    value={slab.min_qty}
                                                    data-slab-row={idx}
                                                    data-slab-col={0}
                                                    onChange={e => {
                                                        const slabs = [...newProduct.slabs];
                                                        slabs[idx].min_qty = Number(e.target.value);
                                                        setNewProduct({ ...newProduct, slabs });
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                            e.preventDefault();
                                                            moveSlabFocus(idx, 0, e.key === 'ArrowUp' ? -1 : 1);
                                                        }
                                                    }}
                                                    onWheel={e => e.preventDefault()}
                                                />
                                                {newProduct.calculation_type === 'Range' && (
                                                    <input
                                                        type="number" className="input-field text-sm"
                                                        placeholder="Max Qty"
                                                        value={slab.max_qty}
                                                        data-slab-row={idx}
                                                        data-slab-col={1}
                                                        onChange={e => {
                                                            const slabs = [...newProduct.slabs];
                                                            const nextValue = e.target.value === '' ? '' : Number(e.target.value);
                                                            slabs[idx].max_qty = nextValue;

                                                            const nextIndex = idx + 1;
                                                            if (newProduct.calculation_type === 'Range' && slabs[nextIndex]) {
                                                                const suggestedMin = nextValue === '' ? 0 : Number(nextValue) + 1;
                                                                const currentNextMin = slabs[nextIndex].min_qty;
                                                                if (currentNextMin === '' || currentNextMin === 0 || Number(currentNextMin) <= Number(nextValue || 0)) {
                                                                    slabs[nextIndex].min_qty = suggestedMin;
                                                                }
                                                            }
                                                            setNewProduct({ ...newProduct, slabs });
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                                e.preventDefault();
                                                                moveSlabFocus(idx, 1, e.key === 'ArrowUp' ? -1 : 1);
                                                            }
                                                        }}
                                                        onWheel={e => e.preventDefault()}
                                                    />
                                                )}
                                                {newProduct.calculation_type === 'Slab' && (
                                                    <input
                                                        type="number" className="input-field text-sm"
                                                        placeholder="Base Value"
                                                        step="any"
                                                        value={slab.base_value !== undefined ? slab.base_value : ''}
                                                        data-slab-row={idx}
                                                        data-slab-col={1}
                                                        onChange={e => {
                                                            const slabs = [...newProduct.slabs];
                                                            slabs[idx].base_value = e.target.value === '' ? '' : Number(e.target.value);
                                                            setNewProduct({ ...newProduct, slabs });
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                addSlab();
                                                            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                                e.preventDefault();
                                                                moveSlabFocus(idx, 1, e.key === 'ArrowUp' ? -1 : 1);
                                                            }
                                                        }}
                                                        onWheel={e => e.preventDefault()}
                                                    />
                                                )}
                                                {newProduct.calculation_type === 'Slab' && newProduct.has_double_side_rate && (
                                                    <input
                                                        type="number" className="input-field text-sm"
                                                        placeholder="Double Side Rate"
                                                        step="any"
                                                        value={slab.double_side_unit_rate !== undefined ? slab.double_side_unit_rate : ''}
                                                        data-slab-row={idx}
                                                        data-slab-col={2}
                                                        onChange={e => {
                                                            const slabs = [...newProduct.slabs];
                                                            slabs[idx].double_side_unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                            setNewProduct({ ...newProduct, slabs });
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                addSlab();
                                                            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                                e.preventDefault();
                                                                moveSlabFocus(idx, 2, e.key === 'ArrowUp' ? -1 : 1);
                                                            }
                                                        }}
                                                        onWheel={e => e.preventDefault()}
                                                    />
                                                )}
                                                {newProduct.calculation_type === 'Range' && (
                                                    <>
                                                        <input
                                                            type="number" className="input-field text-sm"
                                                            placeholder="Retail Rate"
                                                            step="any"
                                                            value={slab.unit_rate !== undefined ? slab.unit_rate : ''}
                                                            data-slab-row={idx}
                                                            data-slab-col={2}
                                                            onChange={e => {
                                                                const slabs = [...newProduct.slabs];
                                                                slabs[idx].unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                                setNewProduct({ ...newProduct, slabs });
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                                    e.preventDefault();
                                                                    moveSlabFocus(idx, 2, e.key === 'ArrowUp' ? -1 : 1);
                                                                }
                                                            }}
                                                            onWheel={e => e.preventDefault()}
                                                        />
                                                        <input
                                                            type="number" className="input-field text-sm"
                                                            placeholder="Offset Rate"
                                                            step="any"
                                                            value={slab.offset_unit_rate !== undefined ? slab.offset_unit_rate : ''}
                                                            data-slab-row={idx}
                                                            data-slab-col={3}
                                                            onChange={e => {
                                                                const slabs = [...newProduct.slabs];
                                                                slabs[idx].offset_unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                                setNewProduct({ ...newProduct, slabs });
                                                            }}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    addSlab();
                                                                } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                                    e.preventDefault();
                                                                    moveSlabFocus(idx, 3, e.key === 'ArrowUp' ? -1 : 1);
                                                                }
                                                            }}
                                                            onWheel={e => e.preventDefault()}
                                                        />
                                                        {newProduct.has_double_side_rate && (
                                                            <input
                                                                type="number" className="input-field text-sm"
                                                                placeholder="Double Side Rate"
                                                                step="any"
                                                                value={slab.double_side_unit_rate !== undefined ? slab.double_side_unit_rate : ''}
                                                                data-slab-row={idx}
                                                                data-slab-col={4}
                                                                onChange={e => {
                                                                    const slabs = [...newProduct.slabs];
                                                                    slabs[idx].double_side_unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                                    setNewProduct({ ...newProduct, slabs });
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                                                        e.preventDefault();
                                                                        moveSlabFocus(idx, 4, e.key === 'ArrowUp' ? -1 : 1);
                                                                    }
                                                                }}
                                                                onWheel={e => e.preventDefault()}
                                                            />
                                                        )}
                                                    </>
                                                )}
                                                {isAdmin && (
                                                <button type="button" className="btn btn-ghost btn-sm text-error" style={{ flexShrink: 0 }} onClick={() => removeSlab(idx)}>
                                                    <Trash2 size={14} />
                                                </button>
                                                )}
                                            </div>
                                        ))}
                                        {isAdmin && (
                                        <div className="pt-8" style={{ borderTop: '1px solid var(--border)' }}>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={addSlab}>
                                                <Plus size={14} /> Add Slab
                                            </button>
                                        </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="stack-sm">
                                <div className="row space-between items-center gap-md">
                                    <label className="label mb-0">Default Extra Charges</label>
                                    {isAdmin && <button type="button" className="btn btn-ghost btn-sm" onClick={addExtra}><Plus size={14} /> Add Extra</button>}
                                </div>
                                <div className="stack-sm bg-light p-16 rounded border">
                                    {newProduct.extras.length === 0 && <p className="muted text-xs">No template extras defined.</p>}
                                    {newProduct.extras.map((ex, idx) => (
                                        <div key={idx} className="row gap-sm items-center">
                                            <input
                                                placeholder="Purpose (e.g. Lamination)"
                                                className="input-field text-sm flex-2"
                                                value={ex.purpose}
                                                onChange={e => {
                                                    const extras = [...newProduct.extras];
                                                    extras[idx].purpose = e.target.value;
                                                    setNewProduct({ ...newProduct, extras });
                                                }}
                                            />
                                            <input
                                                type="number"
                                                placeholder="Amount"
                                                className="input-field text-sm flex-1"
                                                value={ex.amount}
                                                onChange={e => {
                                                    const extras = [...newProduct.extras];
                                                    extras[idx].amount = Number(e.target.value);
                                                    setNewProduct({ ...newProduct, extras });
                                                }}
                                                onWheel={e => e.preventDefault()}
                                            />
                                            {isAdmin && <button type="button" className="btn btn-ghost btn-sm text-error" style={{ flexShrink: 0 }} onClick={() => removeExtra(idx)}><Trash2 size={14} /></button>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            </fieldset>
                            {isAdmin && <button type="submit" className="btn btn-primary btn--full mt-8">{isEditing ? 'Update Product Details' : 'Save Product to Library'}</button>}
                        </form>
                    </div>
                </div>
            )}

            <ImageCropModal
                file={cropState?.file || null}
                title="Crop Product Image"
                outputSize={512}
                onCancel={handleCropCancel}
                onComplete={handleCropComplete}
            />
        </div>
    );
};

export default ProductLibrary;

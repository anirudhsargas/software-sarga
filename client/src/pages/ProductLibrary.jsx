import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import api, { imgUrl } from '../services/api';
import SecureImage from '../components/SecureImage';
import useAuth from '../hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';

import { Plus, Trash2, ChevronRight, ChevronDown, Package, Layers, Grid, Save, X, PlusCircle, ArrowUp, ArrowDown, RotateCcw, Edit2, GripVertical, Copy, Eye, EyeOff, Upload, Image as ImageIcon, ChevronLeft, Search, Filter, Link as LinkIcon, ExternalLink, Loader2 } from 'lucide-react';
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

const SortableItem = React.memo(({ id, children, className, disabled, index, ...props }) => {
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
            role="listitem"
            aria-roledescription="draggable item"
            aria-label={`Reorder item`}
            {...props}
        >
            {!disabled && <div {...attributes} {...listeners} aria-label="Drag to reorder" role="button" tabIndex={0} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}></div>}
            <div style={{ position: 'relative', zIndex: 1 }}>
                {children}
            </div>
        </div>
    );
});

const ProductLibrary = () => {
    useSEO('Product Library');

    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
    const isPrivileged = ['Admin', 'Accountant'].includes(user?.role);
    const isDesigner = user?.role === 'Designer';
    const canRequestImageUpdate = isDesigner;
    const { confirm } = useConfirm();
    const [hierarchy, setHierarchy] = useState([]);
    const [loading, setLoading] = useState(true);
    // Navigation state: [] = categories, [catId] = subcategories, [catId, subId] = products
    const [viewPath, setViewPath] = useState([]);
    // Pagination & filtering for products view
    const PRODUCTS_PER_PAGE = 24;
    const [productPage, setProductPage] = useState(1);
    const [productSearch, setProductSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const searchTimer = useRef(null);
    const filterVendorRef = useRef('all');
    const filterCalcTypeRef = useRef('all');
    const [filterVendor, setFilterVendor] = useState('all');
    const [filterCalcType, setFilterCalcType] = useState('all');
    const [selectedProductIds, setSelectedProductIds] = useState([]);

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
    const [editLoading, setEditLoading] = useState(null);
    const [saveLoading, setSaveLoading] = useState(false);
    const [imageRequestSubmitting, setImageRequestSubmitting] = useState(false);
    const [pendingImageRequests, setPendingImageRequests] = useState([]);
    const [loadingPendingImageRequests, setLoadingPendingImageRequests] = useState(false);
    const [pendingUpdateRequests, setPendingUpdateRequests] = useState([]);
    const [loadingPendingUpdateRequests, setLoadingPendingUpdateRequests] = useState(false);
    const [showUpdateRequestModal, setShowUpdateRequestModal] = useState(false);
    const [activeUpdateRequest, setActiveUpdateRequest] = useState(null);
    const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
    const [vendors, setVendors] = useState([]);

    const [showAdvancedInventory, setShowAdvancedInventory] = useState(false);
    const [originalProduct, setOriginalProduct] = useState(null);

    const [newProduct, setNewProduct] = useState({
        name: '',
        product_code: '',
        company_name: '',
        company_code: '',
        size: '',
        calculation_type: 'Normal',
        description: '',
        has_paper_rate: false,
        paper_rate: 0,
        has_double_side_rate: false,
        slabs: [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
        extras: [],
        links: [],
        isPhysicalProduct: false, // Checklist: show in inventory
        isManualCompanyCode: false,
        extraInv: {
            hsn: '',
            quantity: '',
            unit: 'pcs',
            gst_rate: '0',
            cost_price: '',
            sell_price: '',
            vendor_name: ''
        }
    });



    // Pause background work when page is hidden
    useEffect(() => {
        const handleVisibility = () => {
            if (document.hidden) return;
            fetchHierarchy();
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    useEffect(() => {
        fetchHierarchy();
        fetchVendors();
    }, []);

    const fetchVendors = async () => {
        try {
            const res = await api.get('/vendors?limit=1000'); // Get more for autocomplete
            setVendors(res.data?.data || []);
        } catch (err) {
            console.error('Failed to fetch vendors for autocomplete:', err);
        }
    };

    useEffect(() => {
        if (!isPrivileged) return;
        fetchPendingImageRequests();
        fetchPendingUpdateRequests();
    }, [isPrivileged]);

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

    const fetchPendingImageRequests = async () => {
        if (!isPrivileged) return;
        setLoadingPendingImageRequests(true);
        try {
            const res = await api.get('/products/image-update-requests', { params: { status: 'pending' } });
            setPendingImageRequests(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load pending image requests');
        } finally {
            setLoadingPendingImageRequests(false);
        }
    };

    const fetchPendingUpdateRequests = async () => {
        if (!isPrivileged) return;
        setLoadingPendingUpdateRequests(true);
        try {
            const res = await api.get('/products/update-requests', { params: { status: 'pending' } });
            setPendingUpdateRequests(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to load pending update requests');
        } finally {
            setLoadingPendingUpdateRequests(false);
        }
    };

    // Debounce search input to avoid re-rendering on every keystroke
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setDebouncedSearch(productSearch);
        }, 250);
        return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }, [productSearch]);

    const resetProductFilters = () => {
        setProductPage(1);
        setProductSearch('');
        setDebouncedSearch('');
        setFilterVendor('all');
        setFilterCalcType('all');
        setSelectedProductIds([]);
    };

    useEffect(() => {
        // Clear selection when navigating between views or when hierarchy changes
        setSelectedProductIds([]);
    }, [viewPath.join('-'), hierarchy]);

    const toggleSelectProduct = (id) => {
        setSelectedProductIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const exportSelectedCSV = () => {
        const fields = ['id', 'name', 'product_code', 'company_name', 'size', 'calculation_type', 'description'];
        const selected = (filteredProducts || []).filter(p => selectedProductIds.includes(p.id));
        if (!selected.length) return toast.error('No products selected');
        const csv = [fields.join(',')].concat(selected.map(p => fields.map(f => `"${String(p[f] || '').replace(/"/g, '""')}"`).join(','))).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products_export_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const bulkDeleteSelected = async () => {
        if (!selectedProductIds.length) return;
        const isConfirmed = await confirm({
            title: 'Delete products',
            message: `Are you sure you want to delete ${selectedProductIds.length} product(s)? This cannot be undone.`,
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        // Optimistic UI Update
        setHierarchy(prev => prev.map(c => ({
            ...c,
            subcategories: c.subcategories?.map(s => ({
                ...s,
                products: s.products?.filter(p => !selectedProductIds.includes(p.id))
            }))
        })));

        try {
            const results = await Promise.allSettled(selectedProductIds.map(id => api.delete(`/products/${id}`)));
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed === 0) toast.success('Deleted selected products');
            else toast.success(`Deleted ${selectedProductIds.length - failed} products. ${failed} failed.`);
            setSelectedProductIds([]);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error deleting selected products');
        }
    };

    const bulkToggleActive = async () => {
        if (!selectedProductIds.length) return;
        const selected = (filteredProducts || []).filter(p => selectedProductIds.includes(p.id));
        const anyActive = selected.some(p => p.is_active === 1 || p.is_active === true);
        const isConfirmed = await confirm({
            title: anyActive ? 'Disable products' : 'Enable products',
            message: `Are you sure you want to ${anyActive ? 'disable' : 'enable'} ${selectedProductIds.length} product(s)?`,
            confirmText: anyActive ? 'Disable' : 'Enable',
            type: anyActive ? 'danger' : 'primary'
        });
        if (!isConfirmed) return;

        // Optimistic UI Update
        setHierarchy(prev => prev.map(c => ({
            ...c,
            subcategories: c.subcategories?.map(s => ({
                ...s,
                products: s.products?.map(p => {
                    if (selectedProductIds.includes(p.id)) {
                        return { ...p, is_active: anyActive ? 0 : 1 };
                    }
                    return p;
                })
            }))
        })));

        try {
            await Promise.allSettled(selectedProductIds.map(id => api.patch(`/products/${id}/toggle-active`)));
            toast.success(`${anyActive ? 'Disabled' : 'Enabled'} selected products`);
            setSelectedProductIds([]);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating products');
        }
    };

    const toggleCat = (id) => {
        setViewPath([id]);
        resetProductFilters();
    };

    const toggleSub = (subId) => {
        // Find category for this sub
        const cat = hierarchy.find(c => c.subcategories.some(s => s.id === subId));
        if (cat) setViewPath([cat.id, subId]);
        resetProductFilters();
    };

    const navigateBack = (index) => {
        if (index === -1) setViewPath([]);
        else setViewPath(viewPath.slice(0, index + 1));
        resetProductFilters();
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

    // Filter + pagination derived values (only for products/subcategory view)
    const allProducts = viewInfo.type === 'subcategory' ? viewInfo.items : [];

    // Unique vendor list for dropdown
    const vendorOptions = useMemo(() => viewInfo.type === 'subcategory'
        ? [...new Set(allProducts.map(p => p.company_name).filter(Boolean))].sort()
        : [], [viewInfo.type, allProducts]);
    // Unique calc types for dropdown
    const calcTypeOptions = useMemo(() => viewInfo.type === 'subcategory'
        ? [...new Set(allProducts.map(p => p.calculation_type).filter(Boolean))].sort()
        : [], [viewInfo.type, allProducts]);

    const filteredProducts = useMemo(() => allProducts.filter(p => {
        const q = debouncedSearch.trim().toLowerCase();
        const matchSearch = !q ||
            (p.name || '').toLowerCase().includes(q) ||
            (p.product_code || '').toLowerCase().includes(q) ||
            (p.company_name || '').toLowerCase().includes(q) ||
            (p.size || '').toLowerCase().includes(q);
        const matchVendor = filterVendor === 'all' || (p.company_name || '') === filterVendor;
        const matchCalc = filterCalcType === 'all' || (p.calculation_type || '') === filterCalcType;
        return matchSearch && matchVendor && matchCalc;
    }), [debouncedSearch, allProducts, filterVendor, filterCalcType]);

    const totalProducts = filteredProducts.length;
    const totalProductPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
    const pagedProducts = useMemo(() => filteredProducts.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE), [filteredProducts, productPage, PRODUCTS_PER_PAGE]);
    const hasActiveFilters = debouncedSearch.trim() !== '' || filterVendor !== 'all' || filterCalcType !== 'all';

    const availableSubcategories = selectedCatId
        ? hierarchy.find(c => c.id === selectedCatId)?.subcategories || []
        : [];

    // Build a deduplicated list of known companies from the whole hierarchy + vendors
    const knownCompanies = React.useMemo(() => {
        const map = new Map();
        
        // 1. Collect from existing product hierarchy
        hierarchy.forEach(cat =>
            cat.subcategories?.forEach(sub =>
                sub.products?.forEach(p => {
                    if (p.company_name && !map.has(p.company_name.toUpperCase())) {
                        map.set(p.company_name.toUpperCase(), {
                            name: p.company_name,
                            code: p.company_code || ''
                        });
                    }
                })
            )
        );

        // 2. Collect from global vendors (e.g. from Expense Manager)
        vendors.forEach(v => {
            const name = (v.name || '').trim();
            if (name && !map.has(name.toUpperCase())) {
                // If it's a new brand from the vendor list, we can suggest a code
                const guessCode = name.replace(/[^A-Z0-9]/g, '').substring(0, 3).toUpperCase();
                map.set(name.toUpperCase(), {
                    name: name,
                    code: guessCode
                });
            }
        });

        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [hierarchy, vendors]);

    const buildAutoSku = (companyCode, productName, size) => {
        const c = (companyCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const p = (productName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        const s = (size || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        return [c, p, s].filter(Boolean).join('-');
    };

    const getImageId = (url) => {
        if (!url) return null;
        try {
            const parts = String(url).split('/');
            const last = parts[parts.length - 1] || url;
            return String(last).split('?')[0];
        } catch (e) {
            return url;
        }
    };

    // Debounced unique company code fetcher
    const codeTimerRef = useRef(null);
    const fetchUniqueCode = useCallback((companyName, currentProduct) => {
        if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
        const cleaned = (companyName || '').replace(/[^A-Z0-9]/gi, '');
        if (cleaned.length < 2) return;
        codeTimerRef.current = setTimeout(async () => {
            try {
                const res = await api.get('/unique-company-code', { params: { name: companyName } });
                const uniqueCode = res.data.code || cleaned.substring(0, 3).toUpperCase();
                setNewProduct(prev => {
                    if (prev.isManualCompanyCode) return prev;
                    return {
                        ...prev,
                        company_code: uniqueCode,
                        product_code: buildAutoSku(uniqueCode, prev.name, prev.size)
                    };
                });
            } catch (err) {
                // Fallback: just use first 3 letters
                const fallback = cleaned.substring(0, 3).toUpperCase();
                setNewProduct(prev => {
                    if (prev.isManualCompanyCode) return prev;
                    return {
                        ...prev,
                        company_code: fallback,
                        product_code: buildAutoSku(fallback, prev.name, prev.size)
                    };
                });
            }
        }, 400);
    }, []);

    const hasProductChanges = () => {
        if (!isEditing || !originalProduct) return true;
        
        // Check all fields for changes
        return JSON.stringify(newProduct) !== JSON.stringify(originalProduct) || productImage !== null;
    };

    const resetProductForm = () => {
        setOriginalProduct(null);
        setNewProduct({
            name: '',
            product_code: '',
            company_name: '',
            company_code: '',
            size: '',
            calculation_type: 'Normal',
            description: '',
            has_paper_rate: false,
            paper_rate: 0,
            has_double_side_rate: false,
            slabs: [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
            extras: [],
            links: [],
            isPhysicalProduct: false,
            isManualCompanyCode: false,
            extraInv: {
                hsn: '',
                quantity: '',
                unit: 'pcs',
                gst_rate: '0',
                cost_price: '',
                sell_price: '',
                vendor_name: ''
            }
        });
        setProductImage(null);
        setProductImagePreview('');
        setIsEditing(false);
        setEditId(null);
        setSaveLoading(false);
        setImageRequestSubmitting(false);
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
        if (!isPrivileged) return;
        if (!selectedSubId) {
            toast.success('Please select a sub-category for this product.');
            return;
        }
        setSaveLoading(true);
        try {
            const formData = new FormData();
            formData.append('subcategory_id', selectedSubId);
            formData.append('name', newProduct.name);
            formData.append('product_code', newProduct.product_code || '');
            formData.append('company_name', newProduct.company_name || '');
            formData.append('company_code', newProduct.company_code || '');
            formData.append('size', newProduct.size || '');
            formData.append('calculation_type', newProduct.calculation_type);
            formData.append('description', newProduct.description || '');
            formData.append('has_paper_rate', newProduct.has_paper_rate);
            formData.append('paper_rate', newProduct.paper_rate);
            formData.append('has_double_side_rate', newProduct.has_double_side_rate);
            formData.append('slabs', JSON.stringify(newProduct.slabs));
            formData.append('extras', JSON.stringify(newProduct.extras));
            // Ensure links have a name (fallback to URL) so backend will persist them
            const linksPayload = (newProduct.links || []).map(l => ({ name: (l.name || l.url || '').trim(), url: (l.url || '').trim() }));
            formData.append('links', JSON.stringify(linksPayload));
            formData.append('isPhysicalProduct', newProduct.isPhysicalProduct ? 1 : 0);
            formData.append('extraInv', JSON.stringify(newProduct.extraInv || {}));
            if (newProduct.inventory_item_id) {
                formData.append('inventory_item_id', newProduct.inventory_item_id);
            }
            if (productImage) formData.append('image', productImage);
            else if (isEditing && newProduct.image_url) formData.append('image_url', newProduct.image_url);

            if (isEditing) {
                await api.put(`/products/${editId}`, formData);
                toast.success('Product updated successfully');
            } else {
                await api.post('/products', formData);
                toast.success('Product added successfully');
            }
            resetProductForm();
            setShowProdModal(false);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error saving product');
        } finally {
            setSaveLoading(false);
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

    const handleSubmitProductImageRequest = async (e) => {
        e.preventDefault();
        if (!canRequestImageUpdate || !isEditing || !editId) return;
        if (!productImage) {
            toast.error('Please select an image first');
            return;
        }

        setImageRequestSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('image', productImage);
            await api.post(`/products/${editId}/image-update-requests`, formData);
            toast.success('Image update request sent to admin for approval');
            setShowProdModal(false);
            setProductImage(null);
            setProductImagePreview('');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit image request');
        } finally {
            setImageRequestSubmitting(false);
        }
    };

    const handleSubmitProductUpdateRequest = async (e) => {
        e.preventDefault();
        if (isPrivileged) return; // Admin path uses save
        if (!isEditing || !editId) return;

        setSaveLoading(true);
        try {
            const formData = new FormData();
            formData.append('subcategory_id', selectedSubId);
            formData.append('name', newProduct.name);
            formData.append('product_code', newProduct.product_code || '');
            formData.append('company_name', newProduct.company_name || '');
            formData.append('company_code', newProduct.company_code || '');
            formData.append('size', newProduct.size || '');
            formData.append('calculation_type', newProduct.calculation_type);
            formData.append('description', newProduct.description || '');
            formData.append('has_paper_rate', newProduct.has_paper_rate);
            formData.append('paper_rate', newProduct.paper_rate);
            formData.append('has_double_side_rate', newProduct.has_double_side_rate);
            formData.append('slabs', JSON.stringify(newProduct.slabs));
            formData.append('extras', JSON.stringify(newProduct.extras));
            const linksPayload = (newProduct.links || []).map(l => ({ name: (l.name || l.url || '').trim(), url: (l.url || '').trim() }));
            formData.append('links', JSON.stringify(linksPayload));
            formData.append('is_physical_product', newProduct.isPhysicalProduct ? 1 : 0);
            formData.append('extraInv', JSON.stringify(newProduct.extraInv || {}));
            if (newProduct.inventory_item_id) formData.append('inventory_item_id', newProduct.inventory_item_id);
            if (productImage) formData.append('image', productImage);
            else if (newProduct.image_url) formData.append('image_url', newProduct.image_url);

            await api.post(`/products/${editId}/update-requests`, formData);
            toast.success('Update request sent to admin for approval');
            setShowProdModal(false);
            setProductImage(null);
            setProductImagePreview('');
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit update request');
        } finally {
            setSaveLoading(false);
        }
    };

    const handleReviewImageRequest = async (requestId, action) => {
        if (!isPrivileged) return;
        const isApprove = action === 'approve';
        const isConfirmed = await confirm({
            title: isApprove ? 'Approve Image Update' : 'Reject Image Update',
            message: isApprove
                ? 'Approve this image and make it live immediately?'
                : 'Reject this submitted image update?',
            confirmText: isApprove ? 'Approve' : 'Reject',
            type: isApprove ? 'primary' : 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.patch(`/products/image-update-requests/${requestId}`, { action });
            toast.success(isApprove ? 'Image approved and live now' : 'Image request rejected');
            fetchPendingImageRequests();
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to review image request');
        }
    };

    const openUpdateRequestModal = (req) => {
        setActiveUpdateRequest(req);
        setShowUpdateRequestModal(true);
    };

    const closeUpdateRequestModal = () => {
        setActiveUpdateRequest(null);
        setShowUpdateRequestModal(false);
    };

    const handleReviewUpdateRequest = async (requestId, action, adminNote) => {
        if (!isPrivileged) return;
        const isApprove = action === 'approve';
        const isConfirmed = await confirm({
            title: isApprove ? 'Approve Update Request' : 'Reject Update Request',
            message: isApprove ? 'Approve this product update and apply changes now?' : 'Reject this submitted product update? This will discard the proposed changes.',
            confirmText: isApprove ? 'Approve' : 'Reject',
            type: isApprove ? 'primary' : 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.patch(`/products/update-requests/${requestId}`, { action, note: adminNote });
            toast.success(isApprove ? 'Update approved and applied' : 'Update request rejected');
            fetchPendingUpdateRequests();
            fetchHierarchy();
            closeUpdateRequestModal();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to review update request');
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
        // Prevent deleting virtual subcategories
        if (type === 'subcategory' && typeof id === 'string' && id.startsWith('inv-sub-')) {
            toast.error('Virtual subcategories cannot be deleted. Delete individual inventory items instead.');
            return;
        }
        const isConfirmed = await confirm({
            title: `Delete ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            message: `Are you sure you want to delete this ${type}: "${name}"?`,
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        // Optimistic UI Update
        if (type === 'category') {
            setHierarchy(prev => prev.filter(c => c.id !== id));
        } else if (type === 'subcategory') {
            setHierarchy(prev => prev.map(c => ({ ...c, subcategories: c.subcategories?.filter(s => s.id !== id) })));
        } else if (type === 'product') {
            setHierarchy(prev => prev.map(c => ({
                ...c,
                subcategories: c.subcategories?.map(s => ({
                    ...s,
                    products: s.products?.filter(p => p.id !== id)
                }))
            })));
        }

        try {
            const endpoint = type === 'category' ? `/product-categories/${id}` : type === 'subcategory' ? `/product-subcategories/${id}` : `/products/${id}`;
            await api.delete(endpoint);
            fetchHierarchy();
        } catch (err) {
            toast.error(err.response?.data?.message || `Error deleting ${type}`);
            fetchHierarchy(); // Revert on error
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
        setEditLoading(prodId);
        setSaveLoading(false);
        setImageRequestSubmitting(false);
        try {
            const res = await api.get(`/products/${prodId}`);
            const prod = res.data;
            const parentCategory = hierarchy.find(c => c.subcategories.some(s => s.id === prod.subcategory_id));
            setIsEditing(true);
            setEditId(prod.id);
            setSelectedSubId(prod.subcategory_id);
            setSelectedCatId(parentCategory?.id || null);
            const productData = {
                name: prod.name,
                product_code: prod.product_code || '',
                company_name: prod.company_name || '',
                company_code: prod.company_code || (prod.company_name || '').replace(/[^A-Z0-9]/gi, '').substring(0, 3).toUpperCase(),
                size: prod.size || '',
                calculation_type: prod.calculation_type,
                description: prod.description || '',
                has_paper_rate: !!prod.has_paper_rate,
                paper_rate: prod.paper_rate,
                has_double_side_rate: !!prod.has_double_side_rate,
                inventory_item_id: prod.inventory_item_id || '',
                slabs: prod.slabs && prod.slabs.length > 0 ? prod.slabs : [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
                extras: prod.extras || [],
                links: prod.links || [],
                image_url: prod.image_url,
                isPhysicalProduct: prod.is_physical_product === 1 || prod.is_physical_product === true,
                isManualCompanyCode: !!prod.company_code,
                extraInv: prod.extraInv || { hsn: '', quantity: '', unit: 'pcs', gst_rate: '0', cost_price: '', sell_price: '', vendor_name: '' }
            };
            setOriginalProduct(productData);
            setNewProduct(productData);
            setProductImage(null);
            setProductImagePreview(prod.image_url ? imgUrl(prod.image_url) : '');
            setShowProdModal(true);
        } catch (err) {
            toast.error('Error fetching product details');
        } finally {
            setEditLoading(null);
        }
    };

    // Listen for external edit requests (e.g., from Inventory page via router state)
    useEffect(() => {
        if (location.state?.editProductId && !loading) {
            startEditProduct(location.state.editProductId);
            // Clear the state so it doesn't re-trigger
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, loading, navigate]);

    // Sync viewPath with URL search params for proper browser back navigation
    const isUpdatingFromUrl = useRef(false);
    const skipNextUrlUpdate = useRef(false);
    useEffect(() => {
        if (skipNextUrlUpdate.current) {
            skipNextUrlUpdate.current = false;
            return;
        }
        const searchParams = new URLSearchParams(location.search);
        const pathParam = searchParams.get('path');
        if (pathParam) {
            try {
                const parsedPath = JSON.parse(pathParam);
                isUpdatingFromUrl.current = true;
                setViewPath(parsedPath);
            } catch (e) {
                console.error('Failed to parse path param:', e);
            }
        } else {
            isUpdatingFromUrl.current = true;
            setViewPath([]);
        }
    }, [location.search]);

    // Update URL when viewPath changes (but not when updating from URL)
    useEffect(() => {
        if (isUpdatingFromUrl.current) {
            isUpdatingFromUrl.current = false;
            skipNextUrlUpdate.current = true;
            return;
        }
        const searchParams = new URLSearchParams(location.search);
        if (viewPath.length > 0) {
            searchParams.set('path', JSON.stringify(viewPath));
        } else {
            searchParams.delete('path');
        }
        const newSearch = searchParams.toString();
        if (newSearch !== location.search) {
            navigate(`${location.pathname}?${newSearch}`, { replace: true });
        }
    }, [viewPath, location.search, navigate]);

    const handleToggleProduct = async (prod) => {
        // Inventory-only items cannot be toggled
        if (prod.is_inventory_only) {
            toast.error('Inventory items are always active');
            return;
        }
        const isActive = prod.is_active === 1 || prod.is_active === true;

        // Optimistic UI Update
        setHierarchy(prev => prev.map(c => ({
            ...c,
            subcategories: c.subcategories?.map(s => ({
                ...s,
                products: s.products?.map(p => p.id === prod.id ? { ...p, is_active: !isActive } : p)
            }))
        })));

        try {
            await api.patch(`/products/${prod.id}/toggle-active`);
            toast.success(isActive ? `"${prod.name}" disabled` : `"${prod.name}" enabled`);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating product status');
            fetchHierarchy(); // Revert on error
        }
    };

    const handleToggleCategory = async (cat) => {
        const isActive = cat.is_active === 1 || cat.is_active === true;

        // Optimistic UI Update
        setHierarchy(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !isActive } : c));

        try {
            await api.patch(`/product-categories/${cat.id}/toggle-active`);
            toast.success(isActive ? `"${cat.name}" disabled` : `"${cat.name}" enabled`);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating category status');
            fetchHierarchy(); // Revert on error
        }
    };

    const handleToggleSubcategory = async (sub) => {
        // Virtual subcategories cannot be toggled
        if (typeof sub.id === 'string' && sub.id.startsWith('inv-sub-')) {
            toast.error('Virtual subcategories are always active');
            return;
        }
        const isActive = sub.is_active === 1 || sub.is_active === true;

        // Optimistic UI Update
        setHierarchy(prev => prev.map(c => ({
            ...c,
            subcategories: c.subcategories?.map(s => s.id === sub.id ? { ...s, is_active: !isActive } : s)
        })));

        try {
            await api.patch(`/product-subcategories/${sub.id}/toggle-active`);
            toast.success(isActive ? `"${sub.name}" disabled` : `"${sub.name}" enabled`);
            fetchHierarchy();
        } catch (err) {
            toast.error('Error updating subcategory status');
            fetchHierarchy(); // Revert on error
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
                inventory_item_id: '',
                isPhysicalProduct: prod.is_physical_product === 1 || prod.is_physical_product === true,
                slabs: prod.slabs && prod.slabs.length > 0 ? prod.slabs.map(s => ({ ...s, id: undefined })) : [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }],
                extras: prod.extras ? prod.extras.map(e => ({ ...e, id: undefined })) : [],
                image_url: prod.image_url, // Retain image ref if possible, or leave blank if we want fresh upload. Usually better to copy.
                isManualCompanyCode: false,
                extraInv: prod.extraInv || { hsn: '', quantity: '', unit: 'pcs', gst_rate: '0', cost_price: '', sell_price: '', vendor_name: '' }
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

    const addLink = () => {
        setNewProduct({ ...newProduct, links: [...(newProduct.links || []), { name: '', url: '' }] });
    };

    const removeLink = (index) => {
        setNewProduct({ ...newProduct, links: (newProduct.links || []).filter((_, i) => i !== index) });
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

    if (loading) return (
        <div className="stack-lg">
            <div className="skeleton-wrapper">
                <div className="skeleton skeleton--title" style={{ width: '200px', height: 28, marginBottom: 16 }} />
                <div className="skeleton skeleton--text" style={{ width: '320px', height: 16, marginBottom: 24 }} />
                <div className="product-grid">
                    {Array.from({ length: 6 }, (_, i) => (
                        <div key={i} className="product-card">
                            <div className="skeleton" style={{ width: '100%', aspectRatio: '1 / 1' }} />
                            <div className="product-card__content" style={{ padding: 12 }}>
                                <div className="skeleton" style={{ width: '70%', height: 16, marginBottom: 8 }} />
                                <div className="skeleton" style={{ width: '40%', height: 12 }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="stack-lg">
            <header className="stack-sm">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {viewPath.length > 0 && (
                            <button 
                                className="btn btn-ghost" 
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}
                                onClick={() => navigateBack(viewPath.length - 2)}
                                title="Go back"
                            >
                                <ChevronLeft size={18} /> Back
                            </button>
                        )}
                        <div>
                            <h1 className="page-title" style={{ margin: 0 }}>Product & Rate Library</h1>
                            <p className="muted" style={{ margin: '2px 0 0' }}>Manage your printing categories, products, and pricing slabs.</p>
                        </div>
                    </div>
                    {isPrivileged && (
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

            {/* Search & Filter bar — only for products view */}
            {viewInfo.type === 'subcategory' && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    padding: '12px 0 4px',
                }}>
                    {/* Search input */}
                    <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
                        <Search size={15} style={{
                            position: 'absolute', left: 10, top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-muted, #64748b)', pointerEvents: 'none'
                        }} />
                        <input
                            className="input-field"
                            style={{ paddingLeft: 32, height: 36 }}
                            placeholder="Search by name, code, size…"
                            aria-label="Search products"
                            value={productSearch}
                            onChange={e => { setProductSearch(e.target.value); setProductPage(1); }}
                        />
                    </div>

                    {/* Vendor filter */}
                    {vendorOptions.length > 0 && (
                        <select
                            className="input-field"
                            style={{ flex: '0 1 180px', height: 36, minWidth: 140 }}
                            value={filterVendor}
                            aria-label="Filter by vendor"
                            onChange={e => { setFilterVendor(e.target.value); setProductPage(1); }}
                        >
                            <option value="all">All Vendors</option>
                            {vendorOptions.map(v => (
                                <option key={v} value={v}>{v}</option>
                            ))}
                        </select>
                    )}

                    {/* Calculation type filter */}
                    {calcTypeOptions.length > 1 && (
                        <select
                            className="input-field"
                            style={{ flex: '0 1 160px', height: 36, minWidth: 130 }}
                            value={filterCalcType}
                            aria-label="Filter by calculation type"
                            onChange={e => { setFilterCalcType(e.target.value); setProductPage(1); }}
                        >
                            <option value="all">All Types</option>
                            {calcTypeOptions.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    )}

                    {/* Clear filters */}
                    {hasActiveFilters && (
                        <button
                            className="btn btn-ghost btn-sm"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 36 }}
                            onClick={() => { setProductSearch(''); setFilterVendor('all'); setFilterCalcType('all'); setProductPage(1); }}
                        >
                            <X size={13} /> Clear
                        </button>
                    )}

                    <span className="muted text-sm" style={{ whiteSpace: 'nowrap' }}>
                        {totalProducts} of {allProducts.length} products
                    </span>
                </div>
            )}

            {viewInfo.type === 'subcategory' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
                            onChange={(e) => {
                                if (e.target.checked) setSelectedProductIds(filteredProducts.map(p => p.id));
                                else setSelectedProductIds([]);
                            }}
                            checked={filteredProducts.length > 0 && selectedProductIds.length === filteredProducts.length}
                            disabled={filteredProducts.length === 0}
                        />
                        <span className="muted text-sm">Select all</span>
                        <span className="muted text-sm" style={{ marginLeft: 8 }}>{selectedProductIds.length} selected</span>
                    </div>

                    {isPrivileged && selectedProductIds.length > 0 && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost btn-sm" onClick={exportSelectedCSV}>Export CSV</button>
                            <button className="btn btn-ghost btn-sm" onClick={bulkToggleActive}>Toggle Active</button>
                            <button className="btn btn-danger btn-sm" onClick={bulkDeleteSelected}>Delete</button>
                        </div>
                    )}
                </div>
            )}

            <div className="grid-container">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={(viewInfo.type === 'subcategory' ? pagedProducts : viewInfo.items).map(i => i.id)}
                        strategy={rectSortingStrategy}
                    >
                        <div className="product-grid">
                            {/* Empty state: no items at all */}
                            {viewInfo.items.length === 0 && (
                                <div className="p-40 text-center muted italic border-dashed border-radius-lg flex-1" style={{ gridColumn: '1 / -1' }}>
                                    No {viewInfo.title.toLowerCase()} found in this section.
                                </div>
                            )}

                            {/* Empty state: items exist but active filters match nothing */}
                            {viewInfo.type === 'subcategory' && viewInfo.items.length > 0 && filteredProducts.length === 0 && (
                                <div className="p-40 text-center border-dashed border-radius-lg flex-1" style={{ gridColumn: '1 / -1' }}>
                                    <Search size={32} style={{ color: 'var(--text-muted, #64748b)', marginBottom: 10 }} />
                                    <div className="muted" style={{ marginBottom: 8 }}>No products match your filters.</div>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => { setProductSearch(''); setFilterVendor('all'); setFilterCalcType('all'); setProductPage(1); }}
                                    >
                                        <X size={13} /> Clear Filters
                                    </button>
                                </div>
                            )}

                            {viewInfo.type === 'root' && viewInfo.items.map((cat, idx) => (
                                <SortableItem key={cat.id} id={cat.id} disabled={!isAdmin} className={`product-card pointer${cat.is_active === 0 || cat.is_active === false ? ' product-card--disabled' : ''}`}>
                                    {isPrivileged && (
                                    <div className="product-card__actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); startEditCategory(cat); }} title="Edit Category" aria-label={`Edit ${cat.name}`}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); moveItem('category', viewInfo.items, idx, -1); }} title="Move Up" aria-label={`Move ${cat.name} up`} disabled={idx === 0}>
                                            <ArrowUp size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); moveItem('category', viewInfo.items, idx, 1); }} title="Move Down" aria-label={`Move ${cat.name} down`} disabled={idx === viewInfo.items.length - 1}>
                                            <ArrowDown size={14} />
                                        </button>
                                        <button
                                            className={`product-card__btn${cat.is_active === 0 || cat.is_active === false ? ' product-card__btn--enable' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleCategory(cat); }}
                                            title={cat.is_active === 0 || cat.is_active === false ? 'Enable Category' : 'Disable Category'}
                                            aria-label={cat.is_active === 0 || cat.is_active === false ? `Enable ${cat.name}` : `Disable ${cat.name}`}
                                        >
                                            {cat.is_active === 0 || cat.is_active === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button className="product-card__btn product-card__btn--delete" onClick={(e) => { e.stopPropagation(); handleDelete('category', cat.id, cat.name); }} title="Delete Category" aria-label={`Delete ${cat.name}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    )}
                                    <div role="button" tabIndex={0} aria-label={`View ${cat.name}`} className="product-card__image-wrap" onClick={() => toggleCat(cat.id)}>
                                        {cat.image_url ? (
                                            <div className="product-card__img-wrap">
                                                <SecureImage src={cat.image_url} alt={cat.name} className="product-card__img" loading="lazy" />
                                            </div>
                                        ) : (
                                            <div className="product-card__placeholder" style={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center' }}>
                                                <Grid size={48} style={{ color: 'var(--accent-2)' }} />
                                            </div>
                                        )}
                                        <div className="drag-indicator">
                                            <GripVertical size={16} />
                                        </div>
                                    </div>
                                    <div role="button" tabIndex={0} className="product-card__content" onClick={() => toggleCat(cat.id)}>
                                        <div className="product-card__name">{cat.name}</div>
                                        <div className="product-card__meta">
                                            {cat.subcategories?.length || 0} Sub-categories
                                        </div>
                                        {cat.image_url && (
                                            <div style={{ marginTop: 6 }}>
                                                <span className="muted text-xs" style={{ fontFamily: 'monospace' }}>{getImageId(cat.image_url)}</span>
                                            </div>
                                        )}
                                    </div>
                                </SortableItem>
                            ))}

                        {isPrivileged && pendingImageRequests.length > 0 && (
                            <div className="bg-light p-12 rounded border stack-sm">
                                <div className="row space-between items-center gap-md">
                                    <strong>Pending Product Image Approvals</strong>
                                    <span className="badge badge--sm">{loadingPendingImageRequests ? 'Loading...' : `${pendingImageRequests.length} Pending`}</span>
                                </div>
                                {!loadingPendingImageRequests && pendingImageRequests.length === 0 && (
                                    <p className="muted text-sm">No pending designer image requests.</p>
                                )}
                                {!loadingPendingImageRequests && pendingImageRequests.length > 0 && pendingImageRequests.slice(0, 6).map((req) => (
                                    <div key={req.id} className="row gap-md items-center" style={{ alignItems: 'center' }}>
                                        <div style={{ minWidth: 46 }}>
                                                    {req.proposed_image_url ? (
                                                        <>
                                                            <SecureImage src={req.proposed_image_url} alt={req.product_name} className="thumb-img" />
                                                            <div style={{ marginTop: 6 }}>
                                                                <span className="muted text-xs" style={{ fontFamily: 'monospace', display: 'block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{getImageId(req.proposed_image_url)}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="thumb-img" style={{ display: 'grid', placeItems: 'center' }}><Package size={14} /></div>
                                                    )}
                                                </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600 }}>{req.product_name || `Product #${req.product_id}`}</div>
                                            <div className="muted text-xs">Requested by {req.requested_by_name || `Staff #${req.requested_by}`}</div>
                                        </div>
                                        <div className="row gap-sm">
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleReviewImageRequest(req.id, 'reject')}>Reject</button>
                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleReviewImageRequest(req.id, 'approve')}>Approve</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {isPrivileged && pendingUpdateRequests.length > 0 && (
                            <div className="bg-light p-12 rounded border stack-sm" style={{ marginTop: 12 }}>
                                <div className="row space-between items-center gap-md">
                                    <strong>Pending Product Update Approvals</strong>
                                    <span className="badge badge--sm">{loadingPendingUpdateRequests ? 'Loading...' : `${pendingUpdateRequests.length} Pending`}</span>
                                </div>
                                {!loadingPendingUpdateRequests && pendingUpdateRequests.length === 0 && (
                                    <p className="muted text-sm">No pending product update requests.</p>
                                )}
                                {!loadingPendingUpdateRequests && pendingUpdateRequests.length > 0 && pendingUpdateRequests.slice(0, 6).map((req) => (
                                    <div key={req.id} className="row gap-md items-center" style={{ alignItems: 'center' }}>
                                        <div style={{ minWidth: 46 }}>
                                            <div className="thumb-img" style={{ display: 'grid', placeItems: 'center' }}><Package size={14} /></div>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600 }}>{req.product_name || `Product #${req.product_id}`}</div>
                                            <div className="muted text-xs">Requested by {req.requested_by_name || `Staff #${req.requested_by}`}</div>
                                        </div>
                                        <div className="row gap-sm">
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openUpdateRequestModal(req)}>View</button>
                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleReviewUpdateRequest(req.id, 'reject')}>Reject</button>
                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleReviewUpdateRequest(req.id, 'approve')}>Approve</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                            {viewInfo.type === 'category' && viewInfo.items.map((sub, idx) => (
                                <SortableItem key={sub.id} id={sub.id} disabled={!isAdmin} className={`product-card pointer${sub.is_active === 0 || sub.is_active === false ? ' product-card--disabled' : ''}`}>
                                    {isPrivileged && (
                                    <div className="product-card__actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); startEditSubcategory(sub); }} title="Edit Sub-category" aria-label={`Edit ${sub.name}`}>
                                            <Edit2 size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); moveItem('subcategory', viewInfo.items, idx, -1); }} title="Move Up" aria-label={`Move ${sub.name} up`} disabled={idx === 0}>
                                            <ArrowUp size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); moveItem('subcategory', viewInfo.items, idx, 1); }} title="Move Down" aria-label={`Move ${sub.name} down`} disabled={idx === viewInfo.items.length - 1}>
                                            <ArrowDown size={14} />
                                        </button>
                                        <button
                                            className={`product-card__btn${sub.is_active === 0 || sub.is_active === false ? ' product-card__btn--enable' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleSubcategory(sub); }}
                                            title={sub.is_active === 0 || sub.is_active === false ? 'Enable Sub-category' : 'Disable Sub-category'}
                                            aria-label={sub.is_active === 0 || sub.is_active === false ? `Enable ${sub.name}` : `Disable ${sub.name}`}
                                        >
                                            {sub.is_active === 0 || sub.is_active === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button className="product-card__btn product-card__btn--delete" onClick={(e) => { e.stopPropagation(); handleDelete('subcategory', sub.id, sub.name); }} title="Delete Sub-category" aria-label={`Delete ${sub.name}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    )}
                                    <div role="button" tabIndex={0} aria-label={`View ${sub.name}`} className="product-card__image-wrap" onClick={() => setViewPath([viewPath[0], sub.id])}>
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
                                    <div role="button" tabIndex={0} className="product-card__content" onClick={() => setViewPath([viewPath[0], sub.id])}>
                                        <div className="product-card__name">{sub.name}</div>
                                        <div className="product-card__meta">
                                            {sub.products?.length || 0} Products
                                        </div>
                                    </div>
                                </SortableItem>
                            ))}

                            {viewInfo.type === 'subcategory' && pagedProducts.map((prod) => {
                                const prodIdx = filteredProducts.findIndex(p => p.id === prod.id);
                                return (
                                <SortableItem
                                    key={prod.id}
                                    id={prod.id}
                                    className={`product-card${prod.is_active === 0 || prod.is_active === false ? ' product-card--disabled' : ''}`}
                                    disabled={!isPrivileged}
                                    {...(isTouchDevice()
                                        ? { onClick: () => startEditProduct(prod.id) }
                                        : { onDoubleClick: () => startEditProduct(prod.id) }
                                    )}
                                    title={isTouchDevice() ? (isPrivileged ? 'Click to edit' : 'Click to view rates') : (isPrivileged ? 'Double click to edit' : 'Double click to view rates')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {isPrivileged && (
                                    <div className="product-card__actions" onClick={(e) => e.stopPropagation()}>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); startEditProduct(prod.id); }} title="Edit Product" aria-label={`Edit ${prod.name}`} disabled={editLoading !== null}>
                                            {editLoading === prod.id ? <Loader2 size={14} className="spin" /> : <Edit2 size={14} />}
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); handleDuplicateProduct(prod.id); }} title="Duplicate Product" aria-label={`Duplicate ${prod.name}`}>
                                            <Copy size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); moveItem('product', filteredProducts, prodIdx, -1); }} title="Move Up" aria-label={`Move ${prod.name} up`} disabled={prodIdx === 0}>
                                            <ArrowUp size={14} />
                                        </button>
                                        <button className="product-card__btn" onClick={(e) => { e.stopPropagation(); moveItem('product', filteredProducts, prodIdx, 1); }} title="Move Down" aria-label={`Move ${prod.name} down`} disabled={prodIdx === filteredProducts.length - 1}>
                                            <ArrowDown size={14} />
                                        </button>
                                        <button
                                            className={`product-card__btn${prod.is_active === 0 || prod.is_active === false ? ' product-card__btn--enable' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); handleToggleProduct(prod); }}
                                            title={prod.is_active === 0 || prod.is_active === false ? 'Enable Product' : 'Disable Product'}
                                            aria-label={prod.is_active === 0 || prod.is_active === false ? `Enable ${prod.name}` : `Disable ${prod.name}`}
                                        >
                                            {prod.is_active === 0 || prod.is_active === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                        <button className="product-card__btn product-card__btn--delete" onClick={(e) => { e.stopPropagation(); handleDelete('product', prod.id, prod.name); }} title="Delete Product" aria-label={`Delete ${prod.name}`}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    )}
                                    <div className="product-card__image-wrap" style={{ position: 'relative' }}>
                                        <div role="button" tabIndex={0} style={{ position: 'absolute', top: 8, left: 8, zIndex: 6 }} onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedProductIds.includes(prod.id)}
                                                onChange={() => toggleSelectProduct(prod.id)}
                                            />
                                        </div>
                                        <div className="drag-indicator top-left">
                                            <GripVertical size={16} />
                                        </div>
                                        {prod.image_url ? (
                                            <div className="product-card__img-wrap">
                                                <SecureImage src={prod.image_url} alt={prod.name} className="product-card__img" loading="lazy" />
                                            </div>
                                        ) : (
                                            <div className="product-card__placeholder" style={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center' }}>
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
                                        {prod.links && prod.links.length > 0 && (
                                            <div className="product-card__links" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                                {prod.links.slice(0,3).map((lk, i) => (
                                                    <a key={i} href={lk.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" style={{ padding: '4px 8px' }} title={lk.name || lk.url}>
                                                        <ExternalLink size={12} />
                                                        <span style={{ marginLeft: 6, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>{lk.name || lk.url}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </SortableItem>
                            );})}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Pagination controls — only shown for products view with multiple pages */}
            {viewInfo.type === 'subcategory' && totalProductPages > 1 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '16px 0 8px',
                    flexWrap: 'wrap',
                }}>
                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => { setProductPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        disabled={productPage === 1}
                    >
                        <ChevronLeft size={15} /> Prev
                    </button>

                    {Array.from({ length: totalProductPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalProductPages || Math.abs(p - productPage) <= 2)
                        .reduce((acc, p, idx, arr) => {
                            if (idx > 0 && p - arr[idx - 1] > 1) acc.push('...');
                            acc.push(p);
                            return acc;
                        }, [])
                        .map((p, idx) =>
                            p === '...' ? (
                                <span key={`ellipsis-${idx}`} className="muted" style={{ padding: '0 4px' }}>…</span>
                            ) : (
                                <button
                                    key={p}
                                    className={`btn btn-sm${productPage === p ? ' btn-primary' : ' btn-ghost'}`}
                                    style={{ minWidth: 36 }}
                                    onClick={() => { setProductPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                >
                                    {p}
                                </button>
                            )
                        )
                    }

                    <button
                        className="btn btn-ghost btn-sm"
                        style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => { setProductPage(p => Math.min(totalProductPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        disabled={productPage === totalProductPages}
                    >
                        Next <ChevronRight size={15} />
                    </button>

                    <span className="muted text-sm" style={{ marginLeft: 8 }}>
                        {(productPage - 1) * PRODUCTS_PER_PAGE + 1}–{Math.min(productPage * PRODUCTS_PER_PAGE, totalProducts)} of {totalProducts} products
                    </span>
                </div>
            )}

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
                                        <img loading="lazy" src={catImagePreview} alt="Preview" className="thumb-img" />
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
                                        <img loading="lazy" src={subImagePreview} alt="Preview" className="thumb-img" />
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
                    <div className="modal" style={{ maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <button className="modal-close" onClick={() => { setShowProdModal(false); setIsEditing(false); resetProductForm(); }}><X size={20} /></button>
                        <h2 className="section-title" style={{ marginBottom: '4px', flexShrink: 0 }}>{isEditing ? (isAdmin ? 'Edit Product' : (canRequestImageUpdate ? 'Request Product Image Update' : 'View Product Rates')) : 'Add New Product'}</h2>
                        {isAdmin && <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', margin: '0 0 20px', flexShrink: 0 }}>Define pricing rules and default extras.</p>}
                        {canRequestImageUpdate && isEditing && <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '13px', margin: '0 0 20px', flexShrink: 0 }}>Upload a new product image. Admin approval is required before it goes live.</p>}
                        <form onSubmit={isPrivileged ? handleSaveProduct : handleSubmitProductUpdateRequest} className="stack-md" style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
                            {canRequestImageUpdate && isEditing && (
                            <div>
                                <label className="label">Proposed Product Image</label>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '16px',
                                    padding: '12px 16px',
                                    background: 'var(--surface-2, #1e293b)',
                                    border: '1.5px dashed var(--border, #334155)',
                                    borderRadius: '10px',
                                    transition: 'border-color 0.2s',
                                }}>
                                    {productImagePreview ? (
                                        <img loading="lazy" src={productImagePreview} alt="Preview" style={{
                                            width: '64px', height: '64px', borderRadius: '10px',
                                            objectFit: 'cover', border: '2px solid var(--border, #334155)',
                                            flexShrink: 0
                                        }} />
                                    ) : (
                                        <div style={{
                                            width: '64px', height: '64px', borderRadius: '10px',
                                            background: 'var(--bg, #0f172a)', display: 'flex',
                                            alignItems: 'center', justifyContent: 'center',
                                            color: 'var(--text-muted, #64748b)', flexShrink: 0
                                        }}>
                                            <ImageIcon size={24} />
                                        </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <label style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 14px', borderRadius: '6px',
                                            background: 'var(--primary, #6366f1)', color: 'var(--on-accent)',
                                            fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                                        }}>
                                            <Upload size={14} /> Choose Image
                                            <input type="file" accept="image/png,image/jpeg,image/webp"
                                                style={{ display: 'none' }}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] || null;
                                                    if (file) openCropper(file);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </label>
                                        <p style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', margin: '6px 0 0' }}>
                                            PNG, JPG or WebP. Max 2MB.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            )}
                            <fieldset disabled={!isAdmin} style={{border:'none',padding:0,margin:0}}>

                            {/* Modal Header Section with better hierarchy */}
                            <div className="modal-header-accent" style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr auto', 
                                gap: '20px', 
                                marginBottom: '24px',
                                padding: '16px',
                                background: 'var(--surface-2, #1e293b)',
                                borderRadius: '12px',
                                border: '1px solid var(--border, #334155)'
                            }}>
                                <div className="stack-sm">
                                    <div className="row items-center gap-sm mb-4">
                                        <label className="label mb-0" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent, #6366f1)' }}>Placement</label>
                                        <ChevronRight size={12} className="muted" />
                                        <span className="text-xs font-bold">{availableSubcategories.find(s => s.id === selectedSubId)?.name || 'New Item'}</span>
                                    </div>
                                    <div className="stack-xs">
                                        <label className="label">Sub-category</label>
                                        <select
                                            className="input-field"
                                            style={{ background: 'var(--bg)', border: 'none' }}
                                            value={selectedSubId || ''}
                                            onChange={(e) => setSelectedSubId(e.target.value ? Number(e.target.value) : null)}
                                            required
                                            disabled={availableSubcategories.length === 0}
                                        >
                                            <option value="" disabled>Select Sub-category</option>
                                            {availableSubcategories.map((sub) => (
                                                <option key={sub.id} value={sub.id}>{sub.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="stack-xs" style={{ minWidth: '120px' }}>
                                    <label className="label">Calc Type</label>
                                    <select
                                        className="input-field"
                                        style={{ background: 'var(--bg)', border: 'none', fontWeight: 600 }}
                                        value={newProduct.calculation_type}
                                        onChange={e => setNewProduct({ ...newProduct, calculation_type: e.target.value, slabs: e.target.value === 'Range' ? [{ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }] : [{ min_qty: 1, max_qty: null, base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 }] })}
                                    >
                                        <option value="Normal">Normal</option>
                                        <option value="Range">Range</option>
                                        <option value="Slab">Slab</option>
                                    </select>
                                </div>
                            </div>

                            {/* Product Identity Card */}
                            <div className="product-identity-section" style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '120px 1fr', 
                                gap: '24px', 
                                marginBottom: '24px',
                                alignItems: 'start'
                            }}>
                                {/* Left Side: Image Upload with a more premium frame */}
                                <div className="stack-sm">
                                    <label className="label">Media</label>
                                    <div role="button" tabIndex={0} className="image-upload-frame"
                                        style={{
                                            position: 'relative',
                                            width: '120px',
                                            height: '120px',
                                            borderRadius: '16px',
                                            background: 'var(--surface-2, #1e293b)',
                                            border: '2px dashed var(--border, #334155)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            transition: 'all 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => document.getElementById('product-image-input').click()}
                                    >
                                        {productImagePreview ? (
                                            <img loading="lazy" src={productImagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <div className="stack-xs items-center muted">
                                                <ImageIcon size={24} />
                                                <span style={{ fontSize: '10px', fontWeight: 600 }}>UPLOAD</span>
                                            </div>
                                        )}
                                        <div className="image-overlay-actions" style={{
                                            position: 'absolute',
                                            inset: 0,
                                            background: 'rgba(0,0,0,0.4)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: 0,
                                            transition: 'opacity 0.2s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                        onMouseLeave={e => e.currentTarget.style.opacity = 0}
                                        >
                                            <Upload size={20} color="white" />
                                        </div>
                                    </div>
                                    <input 
                                        id="product-image-input"
                                        type="file" 
                                        accept="image/*" 
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files?.[0] || null;
                                            if (file) openCropper(file);
                                            e.target.value = '';
                                        }}
                                    />
                                    {isAdmin && isEditing && productImagePreview && (
                                        <button type="button" className="btn btn-ghost btn-xs text-error btn--full" onClick={handleRemoveProductImage}>
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    )}
                                </div>

                                {/* Right Side: Core Details */}
                                <div className="stack-md">
                                    <div className="stack-xs">
                                        <label className="label">Product Display Name <span className="text-error">*</span></label>
                                        <input
                                            className="input-field"
                                            style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.01em' }}
                                            value={newProduct.name}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const autoCode = buildAutoSku(newProduct.company_code, val, newProduct.size);
                                                setNewProduct({ ...newProduct, name: val, product_code: autoCode });
                                            }}
                                            placeholder="e.g. Glossy Business Card"
                                            required
                                        />
                                    </div>

                                    <div className="stack-xs">
                                        <label className="label">Internal Description</label>
                                        <textarea
                                            className="input-field"
                                            style={{ minHeight: '64px', fontSize: '13px', resize: 'vertical' }}
                                            value={newProduct.description}
                                            onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                                            placeholder="Technical specs, material info, or usage notes..."
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Manufacturer / Vendor Details with Autocomplete - Modernized */}
                            <div className="vendor-specs-section" style={{
                                background: 'var(--surface-2, #1e293b)',
                                padding: '24px',
                                borderRadius: '16px',
                                border: '1px solid var(--border, #334155)',
                                marginBottom: '24px'
                            }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Package size={16} className="text-accent" />
                                    Brand & Specifications
                                </h3>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                                    {/* Company Name with Autocomplete */}
                                    <div style={{ position: 'relative' }}>
                                        <label className="label">Company / Brand Name</label>
                                        <div style={{ position: 'relative' }}>
                                            <input
                                                className="input-field"
                                                style={{ paddingLeft: '36px' }}
                                                value={newProduct.company_name}
                                                autoComplete="off"
                                                onFocus={() => setCompanyDropdownOpen(true)}
                                                onBlur={() => setTimeout(() => setCompanyDropdownOpen(false), 200)}
                                                onChange={e => {
                                                    const val = e.target.value.toUpperCase();
                                                    // Quick guess at code if none exists
                                                    const quickCode = val.replace(/[^A-Z0-9]/g, '').substring(0, 3);
                                                    setNewProduct(prev => ({
                                                        ...prev,
                                                        company_name: val,
                                                        company_code: prev.isManualCompanyCode ? prev.company_code : (prev.company_code || quickCode),
                                                        product_code: buildAutoSku(prev.isManualCompanyCode ? prev.company_code : (prev.company_code || quickCode), prev.name, prev.size),
                                                        extraInv: { ...prev.extraInv, vendor_name: val }
                                                    }));
                                                    fetchUniqueCode(val, newProduct);
                                                    setCompanyDropdownOpen(true);
                                                }}
                                                placeholder="Search Brands..."
                                            />
                                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                        </div>
                                        
                                        {/* Autocomplete Dropdown */}
                                        {companyDropdownOpen && (() => {
                                            const q = (newProduct.company_name || '').trim().toLowerCase();
                                            const matches = knownCompanies.filter(c =>
                                                !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
                                            );
                                            if (matches.length === 0) return null;
                                            return (
                                                <div style={{
                                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                                                    zIndex: 1000,
                                                    background: 'var(--surface-3, #2d3748)',
                                                    border: '1px solid var(--border, #4a5568)',
                                                    borderRadius: '12px',
                                                    boxShadow: '0 12px 24px -6px rgba(0,0,0,0.4)',
                                                    maxHeight: '220px',
                                                    overflowY: 'auto',
                                                    padding: '6px'
                                                }}>
                                                    {matches.map((c, i) => (
                                                        <div
                                                            key={i}
                                                            onMouseDown={e => {
                                                                e.preventDefault();
                                                                if (codeTimerRef.current) clearTimeout(codeTimerRef.current);
                                                                const autoSku = buildAutoSku(c.code, newProduct.name, newProduct.size);
                                                                setNewProduct(prev => ({
                                                                    ...prev,
                                                                    company_name: c.name,
                                                                    company_code: c.code,
                                                                    product_code: autoSku,
                                                                    isManualCompanyCode: true,
                                                                    extraInv: { ...prev.extraInv, vendor_name: c.name }
                                                                }));
                                                                setCompanyDropdownOpen(false);
                                                            }}
                                                            style={{
                                                                padding: '10px 14px',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                borderRadius: '8px',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <div style={{ 
                                                                    width: '28px', height: '28px', borderRadius: '6px', 
                                                                    background: 'var(--bg)', display: 'grid', placeItems: 'center', 
                                                                    fontSize: '12px', fontWeight: 800, color: 'var(--accent)' 
                                                                }}>
                                                                    {c.name.charAt(0)}
                                                                </div>
                                                                <span style={{ fontWeight: 600, fontSize: '13px' }}>{c.name}</span>
                                                            </div>
                                                            <span style={{
                                                                fontFamily: 'monospace', fontSize: '11px',
                                                                fontWeight: 700, color: 'var(--accent)',
                                                                background: 'rgba(99,102,241,0.1)',
                                                                padding: '2px 6px', borderRadius: '4px',
                                                            }}>{c.code}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Company Code */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label className="label">Unique Brand Code</label>
                                            {newProduct.isManualCompanyCode && (
                                                <button 
                                                    type="button" 
                                                    className="btn btn-ghost btn-xs text-accent" 
                                                    style={{ padding: '0 4px', fontSize: '10px', height: '18px' }}
                                                    onClick={() => {
                                                        setNewProduct(prev => {
                                                            const newCode = (prev.company_name || '').replace(/[^A-Z0-9]/g, '').substring(0, 3).toUpperCase();
                                                            return { ...prev, isManualCompanyCode: false, company_code: newCode, product_code: buildAutoSku(newCode, prev.name, prev.size) };
                                                        });
                                                        fetchUniqueCode(newProduct.company_name, newProduct);
                                                    }}
                                                >
                                                    <RotateCcw size={10} style={{ marginRight: 2 }} /> Auto
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            className="input-field"
                                            style={{ fontFamily: 'monospace', fontWeight: 700, textAlign: 'center', letterSpacing: '1px', textTransform: 'uppercase' }}
                                            value={newProduct.company_code}
                                            onChange={e => {
                                                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 5);
                                                const autoSku = buildAutoSku(val, newProduct.name, newProduct.size);
                                                setNewProduct({ ...newProduct, company_code: val, product_code: autoSku, isManualCompanyCode: true });
                                            }}
                                            placeholder="e.g. PMI"
                                            maxLength={5}
                                        />
                                    </div>

                                    {/* Size */}
                                    <div>
                                        <label className="label">Dimensions / Size</label>
                                        <input
                                            className="input-field"
                                            value={newProduct.size}
                                            onChange={e => {
                                                const val = e.target.value.toUpperCase();
                                                const autoSku = buildAutoSku(newProduct.company_code, newProduct.name, val);
                                                setNewProduct({ ...newProduct, size: val, product_code: autoSku });
                                            }}
                                            placeholder="e.g. 12X18"
                                        />
                                    </div>
                                </div>

                                {/* SKU Preview Area */}
                                <div style={{ 
                                    marginTop: '20px', 
                                    padding: '16px', 
                                    background: 'var(--surface-3, #0f172a)', 
                                    borderRadius: '12px',
                                    border: '1px solid var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <div className="stack-xs">
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>Auto-Generated System SKU</span>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Code used for internal tracking & inventory sync.</span>
                                    </div>
                                    <div style={{ 
                                        fontFamily: 'monospace', 
                                        fontSize: '16px', 
                                        fontWeight: 800, 
                                        color: 'var(--text)',
                                        letterSpacing: '0.05em'
                                    }}>
                                        {newProduct.product_code || '---'}
                                    </div>
                                </div>
                            </div>


                            {/* Physical product toggle */}
                            {isAdmin && (
                            <>
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px 16px',
                                background: newProduct.isPhysicalProduct ? 'rgba(99,102,241,0.06)' : 'var(--surface-2, #1e293b)',
                                border: `1.5px solid ${newProduct.isPhysicalProduct ? 'var(--primary, #6366f1)' : 'var(--border, #334155)'}`,
                                borderRadius: '10px',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                userSelect: 'none'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={newProduct.isPhysicalProduct}
                                    onChange={e => setNewProduct({ ...newProduct, isPhysicalProduct: e.target.checked })}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary, #6366f1)', cursor: 'pointer', flexShrink: 0 }}
                                />
                                <div style={{ lineHeight: 1.4 }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Physical Product</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #94a3b8)', marginLeft: '6px' }}>
                                        — tracks stock in Inventory
                                    </span>
                                </div>
                            </label>

                            {newProduct.isPhysicalProduct && (
                                <div className="product-form-section" style={{
                                    background: 'var(--surface-2, #1e293b)',
                                    padding: '24px',
                                    borderRadius: '16px',
                                    border: '1px solid var(--border, #334155)',
                                    marginBottom: '24px',
                                    marginTop: '8px'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showAdvancedInventory ? '16px' : '0' }}>
                                        <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Initial Inventory Details</h3>
                                        <button 
                                            type="button" 
                                            className="btn btn-ghost btn-sm" 
                                            onClick={() => setShowAdvancedInventory(!showAdvancedInventory)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            {showAdvancedInventory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            {showAdvancedInventory ? 'Hide' : 'Show'} Advanced Options
                                        </button>
                                    </div>
                                    
                                    {showAdvancedInventory && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                                            <div>
                                                <label className="label">Opening Qty</label>
                                                <input className="input-field" type="number" placeholder="0" value={newProduct.extraInv.quantity} onChange={e => setNewProduct({...newProduct, extraInv: {...newProduct.extraInv, quantity: e.target.value}})} />
                                            </div>
                                            <div>
                                                <label className="label">Unit</label>
                                                <input className="input-field" placeholder="pcs" value={newProduct.extraInv.unit} onChange={e => setNewProduct({...newProduct, extraInv: {...newProduct.extraInv, unit: e.target.value}})} />
                                            </div>
                                            <div>
                                                <label className="label">HSN Code</label>
                                                <input className="input-field" placeholder="e.g. 4820" value={newProduct.extraInv.hsn} onChange={e => setNewProduct({...newProduct, extraInv: {...newProduct.extraInv, hsn: e.target.value}})} />
                                            </div>
                                            <div>
                                                <label className="label">Cost Price (₹)</label>
                                                <input className="input-field" type="number" placeholder="0.00" value={newProduct.extraInv.cost_price} onChange={e => setNewProduct({...newProduct, extraInv: {...newProduct.extraInv, cost_price: e.target.value}})} />
                                            </div>
                                            <div>
                                                <label className="label">Selling Price (₹)</label>
                                                <input className="input-field" type="number" placeholder="Auto from slabs" value={newProduct.extraInv.sell_price} onChange={e => setNewProduct({...newProduct, extraInv: {...newProduct.extraInv, sell_price: e.target.value}})} />
                                            </div>
                                            <div>
                                                <label className="label">GST Rate (%)</label>
                                                <input className="input-field" type="number" placeholder="0" value={newProduct.extraInv.gst_rate} onChange={e => setNewProduct({...newProduct, extraInv: {...newProduct.extraInv, gst_rate: e.target.value}})} />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1' }}>
                                                <label className="label">Vendor Name (for stock)</label>
                                                <input 
                                                    className="input-field" 
                                                    placeholder="Auto-synced from Company/Brand Name" 
                                                    value={newProduct.extraInv.vendor_name} 
                                                    readOnly
                                                    style={{ background: 'var(--surface-2, #1e293b)', cursor: 'not-allowed' }}
                                                />
                                                <p style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0' }}>
                                                    Auto-synced with Company/Brand Name above
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            </>
                            )}

                            {/* Calculation Strategy - Refined UI */}
                            {isAdmin && (
                            <div className="product-form-section" style={{
                                background: 'var(--surface-2, #1e293b)',
                                padding: '24px',
                                borderRadius: '16px',
                                border: '1px solid var(--border, #334155)',
                                marginBottom: '24px'
                            }}>
                                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pricing Strategy</h3>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '20px', alignItems: 'end' }}>
                                    <div>
                                        <label className="label">Calculation Method</label>
                                        <select
                                            className="input-field"
                                            style={{ fontWeight: 600 }}
                                            value={newProduct.calculation_type}
                                            onChange={e => setNewProduct({ ...newProduct, calculation_type: e.target.value })}
                                        >
                                            <option value="Normal">Fixed Unit Rate (Qty × Rate)</option>
                                            <option value="Slab">Interpolated Slab (Gradual Transition)</option>
                                            <option value="Range">Quantity Range (Tiered Pricing)</option>
                                        </select>
                                    </div>

                                    {newProduct.calculation_type === 'Slab' && (
                                        <div>
                                            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={newProduct.has_paper_rate}
                                                    onChange={e => setNewProduct({ ...newProduct, has_paper_rate: e.target.checked })}
                                                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                                />
                                                Add Paper Rate?
                                            </label>
                                            {newProduct.has_paper_rate && (
                                                <input
                                                    type="number"
                                                    step="any"
                                                    className="input-field"
                                                    style={{ marginTop: '8px' }}
                                                    placeholder="Rate/unit"
                                                    value={newProduct.paper_rate !== undefined ? newProduct.paper_rate : ''}
                                                    onChange={e => setNewProduct({ ...newProduct, paper_rate: e.target.value === '' ? '' : Number(e.target.value) })}
                                                />
                                            )}
                                        </div>
                                    )}

                                    <div style={{ paddingBottom: '12px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                                            <input
                                                type="checkbox"
                                                checked={newProduct.has_double_side_rate}
                                                onChange={e => setNewProduct({ ...newProduct, has_double_side_rate: e.target.checked })}
                                                style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                                            />
                                            Double Side Support
                                        </label>
                                    </div>
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
                                    <div className={`grid ${newProduct.has_double_side_rate ? 'grid-cols-3' : 'grid-cols-2'} gap-md bg-light p-16 rounded border`} style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
                                        <div className="stack-xs">
                                            <label className="text-xs muted font-bold uppercase mb-4 block" style={{ letterSpacing: '0.05em' }}>Retail Unit Rate (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                style={{ fontSize: '16px', fontWeight: 600 }}
                                                placeholder="0.00"
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
                                        <div className="stack-xs">
                                            <label className="text-xs muted font-bold uppercase mb-4 block" style={{ letterSpacing: '0.05em' }}>Offset Unit Rate (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                style={{ fontSize: '16px', fontWeight: 600 }}
                                                placeholder="0.00"
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
                                            <div className="stack-xs">
                                                <label className="text-xs muted font-bold uppercase mb-4 block" style={{ letterSpacing: '0.05em' }}>Double Side Rate (₹)</label>
                                                <input
                                                    type="number"
                                                    className="input-field"
                                                    style={{ fontSize: '16px', fontWeight: 600 }}
                                                    placeholder="0.00"
                                                    step="any"
                                                    value={newProduct.slabs[0]?.double_side_unit_rate !== undefined ? newProduct.slabs[0]?.double_side_unit_rate : ''}
                                                    onChange={e => {
                                                        const slabs = [...newProduct.slabs];
                                                        if (slabs.length === 0) slabs.push({ min_qty: 0, max_qty: '', base_value: 0, unit_rate: 0, offset_unit_rate: 0, double_side_unit_rate: 0 });
                                                        slabs[0].double_side_unit_rate = e.target.value === '' ? '' : Number(e.target.value);
                                                        setNewProduct({ ...newProduct, slabs });
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="stack-sm bg-light p-16 rounded border overflow-x-auto" style={{ background: 'var(--surface-1)', borderColor: 'var(--border)' }}>
                                        <div className="row gap-md px-4 pb-12 text-xs muted font-bold uppercase min-w-[500px]" style={{ borderBottom: '1px solid var(--border)', letterSpacing: '0.05em' }}>
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

                            <div className="stack-sm" style={{ marginTop: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', width: '100%' }}>
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

                            {/* Product Links Section - Premium UI */}
                            <div className="product-links-section" style={{
                                background: 'var(--surface-2, #1e293b)',
                                padding: '20px',
                                borderRadius: '16px',
                                border: '1px solid var(--border, #334155)',
                                marginTop: '12px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', width: '100%' }}>
                                    <div className="stack-xs">
                                        <label className="label mb-0" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <LinkIcon size={16} className="muted" /> 
                                            Asset Links
                                        </label>
                                        <span className="text-xs muted">Reference files, work paths, or templates.</span>
                                    </div>
                                    {isAdmin && (
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={addLink} style={{ borderRadius: '8px' }}>
                                            <Plus size={14} /> Add Asset
                                        </button>
                                    )}
                                </div>

                                <div className="stack-sm">
                                    {(newProduct.links || []).length === 0 && (
                                        <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                                            <p className="muted text-xs">No assets linked yet.</p>
                                        </div>
                                    )}
                                    {(newProduct.links || []).map((lk, idx) => (
                                        <div key={idx} style={{ 
                                            display: 'grid', 
                                            gridTemplateColumns: '140px 1fr auto', 
                                            gap: '12px', 
                                            alignItems: 'center',
                                            padding: '12px',
                                            background: 'var(--surface-1)',
                                            borderRadius: '10px',
                                            border: '1px solid var(--border)'
                                        }}>
                                            <input
                                                placeholder="Label (e.g. Design)"
                                                className="input-field text-sm"
                                                style={{ border: 'none', background: 'var(--surface-2)', fontWeight: 600 }}
                                                value={lk.name}
                                                disabled={!isPrivileged}
                                                onChange={e => {
                                                    const links = [...(newProduct.links || [])];
                                                    links[idx] = { ...links[idx], name: e.target.value };
                                                    setNewProduct({ ...newProduct, links });
                                                }}
                                            />
                                            <input
                                                placeholder="https://... or \\server\path"
                                                className="input-field text-sm"
                                                style={{ border: 'none', background: 'var(--surface-2)', fontFamily: 'monospace' }}
                                                value={lk.url}
                                                disabled={!isPrivileged}
                                                onChange={e => {
                                                    const links = [...(newProduct.links || [])];
                                                    links[idx] = { ...links[idx], url: e.target.value };
                                                    setNewProduct({ ...newProduct, links });
                                                }}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                {lk.url && (
                                                    <a
                                                        href={lk.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ width: 34, height: 34, padding: 0, borderRadius: '8px' }}
                                                    >
                                                        <ExternalLink size={14} />
                                                    </a>
                                                )}
                                                {isAdmin && (
                                                    <button type="button" className="btn btn-ghost btn-sm text-error" style={{ width: 34, height: 34, padding: 0, borderRadius: '8px' }} onClick={() => removeLink(idx)}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            </fieldset>
                            {isAdmin && (
                                <div style={{ marginTop: '24px', width: '100%' }}>
                                    <button type="submit" className="btn btn-primary btn--full" style={{
                                        width: '100%',
                                        justifyContent: 'center',
                                        opacity: isEditing && !hasProductChanges() ? 0.6 : 1,
                                        cursor: isEditing && !hasProductChanges() ? 'not-allowed' : 'pointer'
                                    }} disabled={saveLoading || (isEditing && !hasProductChanges())}>
                                        {saveLoading ? (
                                            <>
                                                <Loader2 size={20} className="spin" />
                                                {isEditing ? 'Updating...' : 'Saving...'}
                                            </>
                                        ) : (
                                            <>
                                                <Save size={20} />
                                                {isEditing ? 'Update Product in Library' : 'Create & Save Product'}
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                            {!isPrivileged && isEditing && (
                                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                                    <button type="submit" className="btn btn-primary btn--full mt-8" disabled={saveLoading}>
                                        {saveLoading ? 'Sending request...' : 'Send update request to Admin'}
                                    </button>
                                    {canRequestImageUpdate && (
                                        <button type="button" className="btn btn-ghost mt-8" disabled={imageRequestSubmitting || !productImage} onClick={handleSubmitProductImageRequest}>
                                            {imageRequestSubmitting ? 'Submitting...' : 'Submit Image Only'}
                                        </button>
                                    )}
                                </div>
                            )}
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
            {showUpdateRequestModal && activeUpdateRequest && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '760px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <button className="modal-close" onClick={closeUpdateRequestModal}><X size={20} /></button>
                        <h2 className="section-title" style={{ marginBottom: '4px' }}>{`Review Update Request — ${activeUpdateRequest.product_name || `#${activeUpdateRequest.product_id}`}`}</h2>
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
                            <div className="row gap-md">
                                <div style={{ flex: 1 }}>
                                    <strong>Current</strong>
                                    <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 8, marginTop: 8 }}>{JSON.stringify(activeUpdateRequest.current_data, null, 2)}</pre>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <strong>Proposed</strong>
                                    <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 8, marginTop: 8 }}>{JSON.stringify(activeUpdateRequest.proposed_data, null, 2)}</pre>
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                            <label className="label">Admin note (optional)</label>
                            <textarea className="input" rows={3} value={activeUpdateRequest.admin_note || ''} onChange={(e) => setActiveUpdateRequest({ ...activeUpdateRequest, admin_note: e.target.value })} />
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button className="btn btn-ghost" onClick={() => handleReviewUpdateRequest(activeUpdateRequest.id, 'reject', activeUpdateRequest.admin_note)}>Reject</button>
                                <button className="btn btn-primary" onClick={() => handleReviewUpdateRequest(activeUpdateRequest.id, 'approve', activeUpdateRequest.admin_note)}>Approve & Apply</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductLibrary;

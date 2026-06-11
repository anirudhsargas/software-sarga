import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Package, Edit2, Trash2, Loader2, Printer, Check, Minus, Search, Link, List, Grid, TrendingUp, TrendingDown, IndianRupee, BarChart3, Clock, ShoppingCart, ArrowLeftRight, Bell, Image as ImageIcon } from 'lucide-react';
import api, { imgUrl } from '../services/api';
import auth from '../services/auth';
import localDb from '../services/localDb';
import Pagination from '../components/Pagination';
import SecureImage from '../components/SecureImage';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import SmartBillUpload from './expense-manager/SmartBillUpload';

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
    const userRole = useMemo(() => auth.getUser()?.role, []);
    const isAdmin = useMemo(() => ['Admin', 'Accountant'].includes(userRole), [userRole]);
    const isFrontOffice = useMemo(() => userRole === 'Front Office', [userRole]);
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
    const [limit, setLimit] = useState(50);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [viewMode, setViewMode] = useState('list');

    const [hierarchy, setHierarchy] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterVendor, setFilterVendor] = useState('');
    const [vendorSuggestions, setVendorSuggestions] = useState([]);
    const [vendorSearchDebounced, setVendorSearchDebounced] = useState('');
    const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);

    const [selectedIds, setSelectedIds] = useState([]);
    const [printQuantities, setPrintQuantities] = useState({});
    const [printingLabel, setPrintingLabel] = useState(false);
    const NEW_ITEM_WINDOW_DAYS = 7;

    const [showConsumeModal, setShowConsumeModal] = useState(false);
    const [consumeData, setConsumeData] = useState({ id: null, quantity: '', notes: '' });
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [restockData, setRestockData] = useState({ id: null, quantity: '', cost: '', notes: '' });

    const [showSmartUpload, setShowSmartUpload] = useState(false);

    const [showStockRequestModal, setShowStockRequestModal] = useState(false);
    const [stockRequestData, setStockRequestData] = useState({ inventory_item_id: null, item_name: '', notes: '' });
    const [branchAvailability, setBranchAvailability] = useState(null);
    const [branchAvailabilityLoading, setBranchAvailabilityLoading] = useState(false);
    const [branchRequestQtys, setBranchRequestQtys] = useState({});
    const [showStockRequestsPanel, setShowStockRequestsPanel] = useState(false);
    
    const [stockRequests, setStockRequests] = useState([]);
    const [stockRequestsLoading, setStockRequestsLoading] = useState(false);
    const [stockRequestSaving, setStockRequestSaving] = useState(false);

    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailItem, setDetailItem] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const navigate = useNavigate();

    const prevItemsRef = useRef(null);
    const prevHierarchyRef = useRef(null);
    const prevProductsRef = useRef(null);
    const prevStockRequestsRef = useRef(null);
    const prevDetailRef = useRef(null);

    useEffect(() => {
        fetchInventory();
    }, [page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    const fetchInventory = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = {
                page,
                search: debouncedSearch || undefined,
                item_type: filterType || undefined,
                category: filterCategory || undefined,
                status: filterStatus || undefined,
                vendor_name: filterVendor || undefined,
                limit: limit || 50
            };
            const res = await api.get('/inventory', { params });

            const resp = res.data;
            if (resp && Array.isArray(resp.data)) {
                const next = resp.data || [];
                const nextStr = JSON.stringify(next);
                if (nextStr !== prevItemsRef.current) {
                    prevItemsRef.current = nextStr;
                    setItems(next);
                }
                setTotal(Number(resp.total) || next.length || 0);
                setTotalPages(Number(resp.totalPages) || Math.max(1, Math.ceil((Number(resp.total) || next.length || 0) / limit)));
            } else if (Array.isArray(resp)) {
                const full = resp;
                const totalLocal = full.length;
                const totalPagesLocal = Math.max(1, Math.ceil(totalLocal / limit));
                const start = (page - 1) * limit;
                const pageItems = full.slice(start, start + limit);
                const nextStr = JSON.stringify(pageItems);
                if (nextStr !== prevItemsRef.current) {
                    prevItemsRef.current = nextStr;
                    setItems(pageItems);
                }
                setTotal(totalLocal);
                setTotalPages(totalPagesLocal);
            } else {
                setItems(resp?.data || []);
                setTotal(resp?.total || 0);
                setTotalPages(resp?.totalPages || 1);
            }
        } catch {
            setError('Failed to fetch inventory');
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    const fetchHierarchy = useCallback(async () => {
        try {
            const [products, hierarchyData] = await Promise.all([
                localDb.getProductList(),
                localDb.getProducts()
            ]);
            const pStr = JSON.stringify(products);
            if (pStr !== prevProductsRef.current) {
                prevProductsRef.current = pStr;
                setAllProducts(products || []);
            }
            const hStr = JSON.stringify(hierarchyData);
            if (hStr !== prevHierarchyRef.current) {
                prevHierarchyRef.current = hStr;
                setHierarchy(hierarchyData || []);
            }
        } catch (err) {
            console.error("Fetch hierarchy error:", err);
        }
    }, []);

    useEffect(() => {
        fetchHierarchy();
    }, [fetchHierarchy]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        const t = setTimeout(() => {
            setVendorSearchDebounced(filterVendor);
        }, 300);
        return () => clearTimeout(t);
    }, [filterVendor]);

    useEffect(() => {
        let cancelled = false;
        const fetchSuggestions = async () => {
            try {
                if (!vendorSearchDebounced) {
                    const all = await localDb.getVendors();
                    if (!cancelled) setVendorSuggestions((all || []).slice(0, 10));
                    return;
                }
                const res = await localDb.getVendors({ search: vendorSearchDebounced });
                if (!cancelled) setVendorSuggestions((res || []).slice(0, 10));
            } catch (err) {
                console.error('Vendor suggestions error', err);
            }
        };
        fetchSuggestions();
        return () => { cancelled = true; };
    }, [vendorSearchDebounced]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showAddModal) setShowAddModal(false);
                else if (showEditModal) setShowEditModal(false);
                else if (showPrintModal) setShowPrintModal(false);
                else if (showConsumeModal) setShowConsumeModal(false);
                else if (showRestockModal) setShowRestockModal(false);
                else if (showSmartUpload) setShowSmartUpload(false);
                else if (showDetailModal) setShowDetailModal(false);
            else if (showStockRequestModal) setShowStockRequestModal(false);
            else if (showStockRequestsPanel) setShowStockRequestsPanel(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAddModal, showEditModal, showPrintModal, showConsumeModal, showRestockModal, showSmartUpload, showDetailModal, showStockRequestModal, showStockRequestsPanel]);

    const fetchStockRequests = useCallback(async () => {
        setStockRequestsLoading(true);
        try {
            const res = await api.get('/stock-requests');
            const next = res.data || [];
            const nextStr = JSON.stringify(next);
            if (nextStr !== prevStockRequestsRef.current) {
                prevStockRequestsRef.current = nextStr;
                setStockRequests(next);
            }
        } catch {
            toast.error('Failed to load stock requests');
        } finally {
            setStockRequestsLoading(false);
        }
    }, []);

    const openStockRequestModal = useCallback(async (item) => {
        setStockRequestData({ inventory_item_id: item.id, item_name: item.name, notes: '' });
        setBranchAvailability(null);
        setBranchRequestQtys({});
        setShowStockRequestModal(true);
        setBranchAvailabilityLoading(true);
        try {
            const res = await api.get(`/inventory/${item.id}/branch-availability`);
            setBranchAvailability(res.data);
            const qtys = {};
            res.data.branches.forEach(b => { qtys[b.id] = ''; });
            setBranchRequestQtys(qtys);
        } catch {
            toast.error('Failed to load branch stock info');
        } finally {
            setBranchAvailabilityLoading(false);
        }
    }, []);

    const handleStockRequest = useCallback(async (e) => {
        e.preventDefault();
        const requests = Object.entries(branchRequestQtys)
            .filter(([, qty]) => parseInt(qty) > 0)
            .map(([branchId, qty]) => ({ to_branch_id: branchId, quantity: parseInt(qty) }));
        if (requests.length === 0) {
            toast.error('Enter quantity for at least one branch');
            return;
        }
        setStockRequestSaving(true);
        try {
            await Promise.all(requests.map(r => api.post('/stock-requests', {
                inventory_item_id: stockRequestData.inventory_item_id,
                to_branch_id: r.to_branch_id,
                quantity: r.quantity,
                notes: stockRequestData.notes || undefined
            })));
            toast.success(`${requests.length} stock request${requests.length > 1 ? 's' : ''} submitted`);
            setShowStockRequestModal(false);
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit request');
        } finally {
            setStockRequestSaving(false);
        }
    }, [branchRequestQtys, stockRequestData]);

    const handleReviewStockRequest = useCallback(async (id, action) => {
        const urlMap = {
            approve: `/stock-requests/${id}/approve`,
            reject: `/stock-requests/${id}/approve`,
            send: `/stock-requests/${id}/send`,
            receive: `/stock-requests/${id}/receive`
        };
        const bodyMap = {
            approve: { action: 'approve' },
            reject: { action: 'reject' },
            send: {},
            receive: {}
        };
        try {
            await api.put(urlMap[action], bodyMap[action]);
            const labels = { approve: 'Approved', reject: 'Rejected', send: 'Sent', receive: 'Received' };
            toast.success(`Request ${labels[action]}`);
            fetchStockRequests();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Action failed');
        }
    }, [fetchStockRequests]);

    const pendingRequestsCount = useMemo(() => stockRequests.filter(r => ['Pending', 'Sent'].includes(r.status)).length, [stockRequests]);

    const filteredProducts = useMemo(() => {
        if (!productSearch) return [];
        return allProducts.filter(p =>
            p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
            (p.product_code && p.product_code.toLowerCase().includes(productSearch.toLowerCase()))
        ).slice(0, 5);
    }, [productSearch, allProducts]);

    const selectProduct = useCallback((p, isEdit = false) => {
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
    }, [selectedItem, newItem]);

    const normalizeItem = useCallback((item) => ({
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
    }), []);

    const getImageId = useCallback((url) => {
        if (!url) return null;
        try {
            const parts = String(url).split('/');
            const last = parts[parts.length - 1] || url;
            return String(last).split('?')[0];
        } catch (e) {
            return url;
        }
    }, []);

    const resolveImageSrc = useCallback((itemOrUrl) => {
        if (!itemOrUrl) return null;
        if (typeof itemOrUrl === 'string') return imgUrl(itemOrUrl);
        
        const direct = itemOrUrl.product_image_url || itemOrUrl.image_url || 
                      itemOrUrl.product_image || itemOrUrl.image ||
                      itemOrUrl.photo || itemOrUrl.photo_url ||
                      itemOrUrl.thumbnail || itemOrUrl.thumbnail_url;
        
        if (direct) {
            return imgUrl(direct);
        }

        const productsAvailable = Array.isArray(allProducts) && allProducts.length > 0;
        const inventoryItemId = itemOrUrl.id;
        const linkedId = itemOrUrl.linked_product_id || itemOrUrl.product_id || null;

        if (productsAvailable) {
            if (linkedId) {
                const found = allProducts.find(p => String(p.id) === String(linkedId) || String(p.product_code) === String(linkedId));
                if (found && (found.image_url || found.product_image_url)) {
                    return imgUrl(found.image_url || found.product_image_url);
                }
            }

            if (inventoryItemId) {
                const foundByInventoryId = allProducts.find(p => String(p.inventory_item_id) === String(inventoryItemId));
                if (foundByInventoryId && (foundByInventoryId.image_url || foundByInventoryId.product_image_url)) {
                    return imgUrl(foundByInventoryId.image_url || foundByInventoryId.product_image_url);
                }
            }

            const itemSku = String(itemOrUrl.sku || itemOrUrl.product_code || '').trim();
            if (itemSku) {
                const foundBySku = allProducts.find(p => String(p.product_code || '').trim().toLowerCase() === itemSku.toLowerCase() || String(p.sku || '').trim().toLowerCase() === itemSku.toLowerCase());
                if (foundBySku && (foundBySku.image_url || foundBySku.product_image_url)) {
                    return imgUrl(foundBySku.image_url || foundBySku.product_image_url);
                }
            }

            const itemName = String(itemOrUrl.name || '').trim().toLowerCase();
            if (itemName) {
                const foundByName = allProducts.find(p => String(p.name || '').trim().toLowerCase() === itemName);
                if (foundByName && (foundByName.image_url || foundByName.product_image_url)) {
                    return imgUrl(foundByName.image_url || foundByName.product_image_url);
                }
            }
        }

        return null;
    }, [allProducts]);

    const handleAddItem = useCallback(async (e) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            const response = await api.post('/inventory', {
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
            if (response.data) {
                setItems(prev => [...prev, response.data]);
                setTotal(prev => prev + 1);
            }
            setShowAddModal(false);
            setNewItem(emptyItem);
            toast.success('Inventory item added');
            const params = {
                page, search: debouncedSearch || undefined, item_type: filterType || undefined,
                category: filterCategory || undefined, status: filterStatus || undefined,
                vendor_name: filterVendor || undefined, limit: limit || 50
            };
            const res = await api.get('/inventory', { params });
            const resp = res.data;
            if (resp && Array.isArray(resp.data)) {
                const next = resp.data || [];
                const nextStr = JSON.stringify(next);
                if (nextStr !== prevItemsRef.current) {
                    prevItemsRef.current = nextStr;
                    setItems(next);
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add item');
        } finally {
            setSaving(false);
        }
    }, [newItem, page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    const handleUpdateItem = useCallback(async (e) => {
        e.preventDefault();
        if (!selectedItem) return;
        setError('');
        setSaving(true);
        const prevItems = [...items];
        setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...selectedItem, quantity: Number(selectedItem.quantity) || 0, reorder_level: Number(selectedItem.reorder_level) || 0, cost_price: Number(selectedItem.cost_price) || 0, sell_price: Number(selectedItem.sell_price) || 0, discount: Number(selectedItem.discount) || 0, gst_rate: Number(selectedItem.gst_rate) || 0, product_id: selectedItem.product_id || null, source_code: selectedItem.source_code || null, model_name: selectedItem.model_name || null, size_code: selectedItem.size_code || null } : i));
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
            toast.success('Inventory item updated');
            const params = {
                page, search: debouncedSearch || undefined, item_type: filterType || undefined,
                category: filterCategory || undefined, status: filterStatus || undefined,
                vendor_name: filterVendor || undefined, limit: limit || 50
            };
            const res = await api.get('/inventory', { params });
            const resp = res.data;
            if (resp && Array.isArray(resp.data)) {
                const next = resp.data || [];
                const nextStr = JSON.stringify(next);
                if (nextStr !== prevItemsRef.current) {
                    prevItemsRef.current = nextStr;
                    setItems(next);
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update item');
            setItems(prevItems);
        } finally {
            setSaving(false);
        }
    }, [selectedItem, items, page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    const handleDeleteItem = useCallback(async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Item',
            message: 'Are you sure you want to delete this item?',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        const prevItems = items;
        const prevTotal = total;
        setItems((prev) => prev.filter((i) => i.id !== id));
        setTotal(Math.max(0, prevTotal - 1));
        setSelectedIds((prev) => prev.filter((i) => i !== id));

        try {
            if (!navigator.onLine) {
                await localDb.deleteInventoryItem(id);
                toast.success('Inventory item deleted (offline). Will sync when online.');
                if ((prevItems || []).length === 1 && page > 1) setPage((p) => p - 1);
                return;
            }

            await api.delete(`/inventory/${id}`);
            toast.success('Inventory item deleted');

            if ((prevItems || []).length === 1 && page > 1) setPage((p) => p - 1);
        } catch (err) {
            setItems(prevItems);
            setTotal(prevTotal);
            toast.error(err.response?.data?.message || 'Failed to delete item');
        }
    }, [items, total, page, confirm]);

    const toggleSelect = useCallback((id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }, []);

    const getStockBasedPrintQty = useCallback((item) => {
        const stockQty = Number(item?.quantity) || 0;
        return Math.max(1, Math.floor(stockQty || 1));
    }, []);

    const paperCategoryAliases = useMemo(() => ['offset papers', 'laser papers', 'other papers', 'offset paper', 'laser paper', 'other paper'], []);

    const isPaperCategory = useCallback((cat) => {
        if (!cat) return false;
        const c = String(cat).toLowerCase().trim();
        if (c.includes('paper')) return true;
        for (const alias of paperCategoryAliases) if (c.includes(alias)) return true;
        return false;
    }, [paperCategoryAliases]);

    const applyStockQuantitiesForSelected = useCallback(() => {
        const next = {};
        items
            .filter(i => selectedIds.includes(i.id))
            .forEach((item) => {
                next[item.id] = getStockBasedPrintQty(item);
            });
        setPrintQuantities(next);
    }, [items, selectedIds, getStockBasedPrintQty]);

    const handlePrintLabels = useCallback(() => {
        if (selectedIds.length === 0) return;

        const printableIds = selectedIds.filter(id => {
            const item = items.find(it => it.id === id);
            return item && !isPaperCategory(item.category);
        });

        if (printableIds.length === 0) {
            toast.error('No printable items selected — paper inventory items cannot be printed');
            return;
        }
        if (printableIds.length !== selectedIds.length) {
            toast.warning('Paper items were excluded from the print selection');
        }

        const initialQtys = {};
        printableIds.forEach(id => { initialQtys[id] = 1; });
        setPrintQuantities(initialQtys);
        setShowPrintModal(true);
    }, [selectedIds, items, isPaperCategory]);

    const handlePrintNewItemsLabels = useCallback(() => {
        const now = Date.now();
        const maxAgeMs = NEW_ITEM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

        const newItems = items.filter((item) => {
            if (!item?.created_at) return false;
            const createdTs = new Date(item.created_at).getTime();
            if (!Number.isFinite(createdTs)) return false;
            return now - createdTs <= maxAgeMs;
        });

        if (newItems.length === 0) {
            toast.error(`No new items found in the last ${NEW_ITEM_WINDOW_DAYS} days`);
            return;
        }

        const printableNewItems = newItems.filter(item => !isPaperCategory(item.category));
        if (printableNewItems.length === 0) {
            toast.error('No printable new items found — paper inventory items are excluded from label printing');
            return;
        }
        const nextIds = printableNewItems.map((item) => item.id);
        const nextQuantities = {};
        printableNewItems.forEach((item) => {
            nextQuantities[item.id] = getStockBasedPrintQty(item);
        });
        setSelectedIds(nextIds);
        setPrintQuantities(nextQuantities);
        setShowPrintModal(true);
    }, [items, isPaperCategory, getStockBasedPrintQty]);

    const generatePDF = useCallback(async () => {
        setPrintingLabel(true);
        try {
            const itemsToPrint = Object.keys(printQuantities).map(id => ({ id: Number(id), quantity_to_print: printQuantities[id] || 1 }));

            if (itemsToPrint.length === 0) {
                toast.error('No printable items selected');
                setPrintingLabel(false);
                return;
            }

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
    }, [printQuantities]);

    const handleConsume = useCallback(async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/inventory/${consumeData.id}/consume`, { quantity: consumeData.quantity, notes: consumeData.notes });
            toast.success('Stock consumed');
            setShowConsumeModal(false);
            setConsumeData({ id: null, quantity: '', notes: '' });
            const params = {
                page, search: debouncedSearch || undefined, item_type: filterType || undefined,
                category: filterCategory || undefined, status: filterStatus || undefined,
                vendor_name: filterVendor || undefined, limit: limit || 50
            };
            const res = await api.get('/inventory', { params });
            const resp = res.data;
            if (resp && Array.isArray(resp.data)) {
                const next = resp.data || [];
                const nextStr = JSON.stringify(next);
                if (nextStr !== prevItemsRef.current) {
                    prevItemsRef.current = nextStr;
                    setItems(next);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error consuming stock');
        } finally {
            setSaving(false);
        }
    }, [consumeData, page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    const handleRestock = useCallback(async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/inventory/${restockData.id}/restock`, { quantity_received: restockData.quantity, cost_price: restockData.cost, notes: restockData.notes });
            toast.success(`Restocked successfully`);
            setShowRestockModal(false);
            setRestockData({ id: null, quantity: '', cost: '', notes: '' });
            const params = {
                page, search: debouncedSearch || undefined, item_type: filterType || undefined,
                category: filterCategory || undefined, status: filterStatus || undefined,
                vendor_name: filterVendor || undefined, limit: limit || 50
            };
            const res = await api.get('/inventory', { params });
            const resp = res.data;
            if (resp && Array.isArray(resp.data)) {
                const next = resp.data || [];
                const nextStr = JSON.stringify(next);
                if (nextStr !== prevItemsRef.current) {
                    prevItemsRef.current = nextStr;
                    setItems(next);
                }
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error restocking item');
        } finally {
            setSaving(false);
        }
    }, [restockData, page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    const getStatus = useCallback((item) => {
        if (Number(item.quantity) <= Number(item.reorder_level || 0)) return 'low';
        return 'ok';
    }, []);

    const openItemDetail = useCallback(async (itemId) => {
        setDetailLoading(true);
        setShowDetailModal(true);
        try {
            const res = await api.get(`/inventory/${itemId}`);
            const next = res.data;
            const nextStr = JSON.stringify(next);
            if (nextStr !== prevDetailRef.current) {
                prevDetailRef.current = nextStr;
                setDetailItem(next);
            }
        } catch {
            toast.error('Failed to load item details');
            setShowDetailModal(false);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    return (
        <div className="stack-lg">
            <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 className="section-title">Inventory</h1>
                    <p className="section-subtitle">Manage stock, prices, and reorder levels.</p>
                </div>
                <div className="flex-1 max-w-md mx-16">
                    <div className="input-group--flex">
                        <div className="input-icon">
                            <Search size={18} />
                        </div>
                        <input
                            type="text"
                            name="inventorySearch"
                            className="input-field"
                            placeholder="Search by name or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button 
                                className="input-action"
                                onClick={() => setSearchTerm('')}
                                title="Clear Search"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="row gap-sm" style={{ justifyContent: 'flex-end', marginBottom: '4px' }}>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
                >
                    {viewMode === 'grid' ? <List size={18} /> : <Grid size={18} />}
                    <span>{viewMode === 'grid' ? 'List View' : 'Grid View'}</span>
                </button>
                {items.length > 0 && (
                    <button className="btn btn-ghost" onClick={handlePrintNewItemsLabels}>
                        <Printer size={18} />
                        <span>Print New Item Labels</span>
                    </button>
                )}
                
                {selectedIds.length > 0 && (
                    <button className="btn btn-ghost" onClick={handlePrintLabels}>
                        <Printer size={18} />
                        <span>Print Labels ({selectedIds.length})</span>
                    </button>
                )}
                <button
                    className="btn btn-ghost"
                    style={{ position: 'relative' }}
                    onClick={() => { fetchStockRequests(); setShowStockRequestsPanel(true); }}
                >
                    <Bell size={18} />
                    <span>Stock Requests</span>
                    {pendingRequestsCount > 0 && (
                        <span style={{ position: 'absolute', top: 4, right: 4, background: 'var(--danger)', color: 'var(--on-accent)', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                            {pendingRequestsCount}
                        </span>
                    )}
                </button>
                {isAdmin && (
                    <>
                        <button
                            className="btn btn-secondary"
                            onClick={() => setShowSmartUpload(true)}
                        >
                            <Printer size={18} />
                            <span>Scan Bill</span>
                        </button>
                    </>
                )}
            </div>

            <div className="row gap-md p-sm bg-surface-2 rounded-md border border-light">
                <div className="input-group" style={{ maxWidth: '180px' }}>
                    <select 
                        name="filterType"
                        className="input-field py-xs" 
                        value={filterType} 
                        onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                    >
                        <option value="">All Types</option>
                        <option value="Retail">Retail</option>
                        <option value="Consumable">Consumable</option>
                    </select>
                </div>
                <div className="input-group" style={{ maxWidth: '220px' }}>
                    <select 
                        name="filterCategory"
                        className="input-field py-xs" 
                        value={filterCategory} 
                        onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                    >
                        <option value="">All Categories</option>
                        {hierarchy.map(cat => (
                            <optgroup key={cat.id} label={cat.name}>
                                {cat.subcategories.map(sub => (
                                    <option key={sub.id} value={sub.name}>{sub.name}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>
                <div className="input-group" style={{ maxWidth: '180px' }}>
                    <select 
                        name="filterStatus"
                        className="input-field py-xs" 
                        value={filterStatus} 
                        onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                    >
                        <option value="">All Statuses</option>
                        <option value="ok">Stock OK</option>
                        <option value="low">Low Stock</option>
                    </select>
                </div>
                <div className="input-group" style={{ maxWidth: '220px' }}>
                    <input
                        name="filterVendor"
                        className="input-field py-xs"
                        placeholder="Filter by vendor..."
                        value={filterVendor}
                        onChange={(e) => { setFilterVendor(e.target.value); setPage(1); }}
                        onFocus={() => setShowVendorSuggestions(true)}
                        onBlur={() => setShowVendorSuggestions(false)}
                    />
                    {showVendorSuggestions && vendorSuggestions.length > 0 && (
                        <div className="dropdown mt-4" style={{ maxHeight: 240, overflowY: 'auto' }}>
                            {vendorSuggestions.map(v => (
                                <div key={v.id || v.name} className="dropdown-item" onMouseDown={() => { setFilterVendor(v.name); setPage(1); setShowVendorSuggestions(false); }}>
                                    <div className="text-sm font-medium">{v.name}</div>
                                    {v.phone && <div className="muted text-xs">{v.phone}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="input-group" style={{ maxWidth: '140px' }}>
                    <select
                        name="perPage"
                        className="input-field py-xs"
                        value={limit}
                        onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                    >
                        <option value={20}>20 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                    </select>
                </div>
                {(filterType || filterCategory || filterStatus || filterVendor) && (
                    <button 
                        className="btn btn-ghost btn-sm" 
                        onClick={() => {
                            setFilterType('');
                            setFilterCategory('');
                            setFilterStatus('');
                            setFilterVendor('');
                            setPage(1);
                        }}
                    >
                        <X size={14} />
                        <span>Clear Filters</span>
                    </button>
                )}
            </div>

            {error && (
                <div className="alert alert--error">
                    <span>{error}</span>
                </div>
            )}

            <div className="panel panel--tight">
                {viewMode === 'list' ? (
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
                                    <th>Price</th>
                                    <th>GST %</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} className="text-center muted table-empty">
                                            <Loader2 className="animate-spin" />
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center muted table-empty">
                                            No inventory items found.
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item) => (
                                        <tr key={item.id} className={selectedIds.includes(item.id) ? 'row-selected' : ''} style={{ cursor: 'pointer' }}>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(item.id)}
                                                    onChange={() => toggleSelect(item.id)}
                                                />
                                            </td>
                                            <td onClick={() => openItemDetail(item.id)}>
                                                <div className="row gap-sm items-center">
                                                    {resolveImageSrc(item) ? (
                                                        <div style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--border)' }}>
                                                            <SecureImage src={resolveImageSrc(item)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        </div>
                                                    ) : (
                                                        <div className="user-avatar avatar-sm">
                                                            {item.linked_product_id ? <Link size={14} className="text-primary" /> : <Package size={16} />}
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                        <span className="user-name">{item.name}</span>
                                                        {resolveImageSrc(item) && (
                                                            <span className="muted text-xs" style={{ fontFamily: 'monospace', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{getImageId(resolveImageSrc(item))}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-sm" onClick={() => openItemDetail(item.id)}>{item.sku || '-'}</td>
                                            <td className="text-sm" onClick={() => openItemDetail(item.id)}>{item.category || item.product_subcategory_name || '-'}</td>
                                            <td className="text-sm" onClick={() => openItemDetail(item.id)}>{item.quantity}</td>
                                            <td className="text-sm" onClick={() => openItemDetail(item.id)}>{item.unit}</td>
                                            <td className="text-sm" onClick={() => openItemDetail(item.id)}>₹{Number(item.sell_price || 0).toFixed(2)}</td>
                                            <td className="text-sm" onClick={() => openItemDetail(item.id)}>{item.gst_rate}%</td>
                                            <td onClick={() => openItemDetail(item.id)}>
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
                                                        <button
                                                            className="btn btn-ghost"
                                                            title="Request from Another Branch"
                                                            onClick={() => openStockRequestModal(item)}
                                                        >
                                                            <ArrowLeftRight size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                            {!isAdmin && (
                                                <td>
                                                    <button
                                                        className="btn btn-ghost"
                                                        title="Request from Another Branch"
                                                        onClick={() => openStockRequestModal(item)}
                                                    >
                                                        <ArrowLeftRight size={16} />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        {loading ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 24 }}>
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : items.length === 0 ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 24 }} className="muted">
                                No inventory items found.
                            </div>
                        ) : items.map(item => (
                            <div key={item.id} className={`card`} style={{ padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <div style={{ width: 84, height: 84, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface-2)', cursor: 'pointer' }} onClick={() => openItemDetail(item.id)}>
                                        {resolveImageSrc(item) ? <SecureImage src={resolveImageSrc(item)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>No Image</div>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                                                <div className="muted text-xs" style={{ marginTop: 6 }}>{item.sku || '-'}</div>
                                            </div>
                                            <div style={{ marginLeft: 8, textAlign: 'right' }}>
                                                <div className="muted text-sm">{item.quantity}</div>
                                                <div className="muted text-xs">{item.unit}</div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <div className="muted text-sm">{item.category || item.product_subcategory_name || '-'}</div>
                                            <div style={{ flex: 1 }} />
                                            <div>
                                                <span className={`badge ${getStatus(item) === 'low' ? 'badge--warn' : 'badge--ok'}`}>{getStatus(item) === 'low' ? 'Low' : 'OK'}</span>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {isAdmin && (
                                            <>
                                                <button className="btn btn-ghost" onClick={() => { setSelectedItem(normalizeItem(item)); setShowEditModal(true); }}><Edit2 size={16} /></button>
                                                <button className="btn btn-ghost btn-danger" onClick={() => handleDeleteItem(item.id)}><Trash2 size={16} /></button>
                                            </>
                                        )}
                                        <button className="btn btn-ghost" onClick={() => openStockRequestModal(item)} title="Request from Another Branch"><ArrowLeftRight size={16} /></button>
                                    </div>
                                    <div style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--accent-2)' }}>₹{Number(item.sell_price || 0).toFixed(2)}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div >
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} limit={limit} loading={loading} />

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
                                    name="addProductSearch"
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
                                        name="addItemName"
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
                                            name="addItemSku"
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
                                                name="addItemSource"
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
                                                name="addItemModel"
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
                                                name="addItemSize"
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
                                                name="addItemCategory"
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
                                                name="addItemHsn"
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
                                        name="addItemQty"
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
                                        name="addItemUnit"
                                        className="input-field"
                                        value={newItem.unit}
                                        onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Reorder Level</label>
                                    <input
                                        name="addItemReorderLevel"
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
                                        name="addItemCostPrice"
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
                                                name="addItemGstRate"
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
                                                name="addItemDiscount"
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
                                        name="addItemSellPrice"
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
                                        name="addItemVendorName"
                                        className="input-field"
                                        placeholder="Where do we buy this?"
                                        value={newItem.vendor_name}
                                        onChange={(e) => setNewItem({ ...newItem, vendor_name: e.target.value })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Vendor Contact</label>
                                    <input
                                        name="addItemVendorContact"
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
                                    name="addItemPurchaseLink"
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
                                    name="editProductSearch"
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
                                        name="editItemName"
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
                                            name="editItemSku"
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
                                                name="editItemSource"
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
                                                name="editItemModel"
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
                                                name="editItemSize"
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
                                                name="editItemCategory"
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
                                                name="editItemHsn"
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
                                        name="editItemQty"
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
                                        name="editItemUnit"
                                        className="input-field"
                                        value={selectedItem.unit || ''}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, unit: e.target.value })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Reorder Level</label>
                                    <input
                                        name="editItemReorderLevel"
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
                                        name="editItemCostPrice"
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
                                                name="editItemGstRate"
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
                                                name="editItemDiscount"
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
                                        name="editItemSellPrice"
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
                                        name="editItemVendorName"
                                        className="input-field"
                                        placeholder="Where do we buy this?"
                                        value={selectedItem.vendor_name || ''}
                                        onChange={(e) => setSelectedItem({ ...selectedItem, vendor_name: e.target.value })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Vendor Contact</label>
                                    <input
                                        name="editItemVendorContact"
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
                                    name="editItemPurchaseLink"
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
            )}

            {showPrintModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setShowPrintModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-8">Label Quantities</h2>
                        <p className="section-subtitle mb-16">Specify how many labels to print for each item.</p>

                        <div className="row gap-sm mb-12">
                            <button className="btn btn-ghost" onClick={applyStockQuantitiesForSelected}>
                                Use Current Stock Qty
                            </button>
                            <button
                                className="btn btn-ghost"
                                onClick={() => {
                                    const reset = {};
                                    selectedIds.forEach((id) => {
                                        reset[id] = 1;
                                    });
                                    setPrintQuantities(reset);
                                }}
                            >
                                Reset All to 1
                            </button>
                        </div>

                        <div className="stack-md mb-24" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                            {items.filter(i => selectedIds.includes(i.id)).map(item => (
                                <div key={item.id} className="row items-center justify-between panel panel--tight pb-8 pt-8">
                                    <div className="flex-1 mr-16">
                                        <div className="user-name text-sm">{item.name}</div>
                                        <div className="muted text-xs">SKU: {item.sku || 'N/A'} | Stock: {Number(item.quantity) || 0}</div>
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
                                    name="consumeQty"
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
                                    name="consumeNotes"
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
                <div className="modal-backdrop" style={{ zIndex: 1050 }}>
                    <div className="modal" style={{ maxWidth: '400px' }}>
                        <button className="modal-close" onClick={() => setShowRestockModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Restock Supply</h2>
                        <form onSubmit={handleRestock} className="stack-md">
                            <div>
                                <label className="label">Quantity Received</label>
                                <input
                                    name="restockQty"
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
                                    name="restockCost"
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
                                    name="restockNotes"
                                    className="input-field"
                                    placeholder="e.g., Delivery delayed by 2 days"
                                    value={restockData.notes}
                                    onChange={e => setRestockData({ ...restockData, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-success btn--full" disabled={saving}>
                                {saving ? 'Restocking...' : 'Restock Item'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(Inventory);

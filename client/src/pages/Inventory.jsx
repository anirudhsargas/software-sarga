import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import { useNavigate } from 'react-router-dom';
import { Printer, Trash2, Edit2, Plus, ArrowLeftRight, Minus, Package, Search, Bell, Camera, Filter, FileText, ChevronDown, CheckSquare, Layers, Download, Share2, Phone, ShoppingCart, List, Grid, X, Image as ImageIcon, Settings, IndianRupee, BarChart3, TrendingUp, RefreshCw, Loader2, Link, Clock, Check, QrCode, AlertTriangle } from 'lucide-react';
import api, { imgUrl } from '../services/api';
import auth from '../services/auth';
import localDb from '../services/localDb';
import Pagination from '../components/Pagination';
import SecureImage from '../components/SecureImage';
import InventoryImage from '../components/InventoryImage';
import InventoryImageSettings from '../components/InventoryImageSettings';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import SmartBillUpload from './expense-manager/SmartBillUpload';
import { onSocketEvent, getSocket } from '../services/socketClient';
import './InventoryModern.css';

const ScannerModal = lazyWithRetry(() => import('../components/ScannerModal'));
import ScannerErrorBoundary from '../components/ScannerErrorBoundary';
import PageContainer from '../components/ui/PageContainer';
import NoInternetState from '../components/NoInternetState';

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

const calculateMargin = (cost, sell, gstRate) => {
    const c = Number(cost) || 0;
    const s = Number(sell) || 0;
    const g = Number(gstRate) || 0;
    const gstAmount = (c * g) / 100;
    if (s <= 0) return 0;
    return ((s - c - gstAmount) / s) * 100;
};

const Inventory = () => {
    useSEO('Inventory');

    const { confirm } = useConfirm();
    const role = auth.getUser()?.role;
    const isAdmin = ['Admin', 'Accountant'].includes(role);
    const isSuperAdmin = role === 'Admin';
    const isFrontOffice = role === 'Front Office';
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [showImageSettingsModal, setShowImageSettingsModal] = useState(false);
    const [printingProgress, setPrintingProgress] = useState(null);
    const [printingTotal, setPrintingTotal] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [newItem, setNewItem] = useState(emptyItem);
    const [error, setError] = useState('');
    const [networkError, setNetworkError] = useState(false);
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

    const handleImageUpdate = useCallback(() => {
        fetchInventory();
    }, []);
    const [branches, setBranches] = useState([]);
    const [filterBranch, setFilterBranch] = useState(() => {
        const u = auth.getUser();
        const priv = ['Admin', 'Accountant'].includes(u?.role);
        return priv ? '' : (u?.branch_id || '');
    });

    useEffect(() => {
        const u = auth.getUser();
        const priv = ['Admin', 'Accountant'].includes(u?.role);
        if (!priv && u?.branch_id) {
            setFilterBranch(u.branch_id);
        }
    }, []);
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterVendor, setFilterVendor] = useState('');
    const [vendorSuggestions, setVendorSuggestions] = useState([]);
    const [vendorSearchDebounced, setVendorSearchDebounced] = useState('');
    const [showVendorSuggestions, setShowVendorSuggestions] = useState(false);

    const [selectedIds, setSelectedIds] = useState([]);
    const [printQuantities, setPrintQuantities] = useState({}); // { id: qty }
    const [printingLabel, setPrintingLabel] = useState(false);
    const [printCompleted, setPrintCompleted] = useState(0);
    const [printTotal, setPrintTotal] = useState(0);
    const NEW_ITEM_WINDOW_DAYS = 7;

    // Select & Print Labels modal state
    const [showSelectPrintModal, setShowSelectPrintModal] = useState(false);
    const [selectPrintSearch, setSelectPrintSearch] = useState('');
    const [selectPrintSelectedIds, setSelectPrintSelectedIds] = useState([]);
    const [allPrintItems, setAllPrintItems] = useState([]);
    const [allPrintItemsLoading, setAllPrintItemsLoading] = useState(false);
    const [printItemIds, setPrintItemIds] = useState([]);
    const [showAddItems, setShowAddItems] = useState(false);
    const [addItemSearch, setAddItemSearch] = useState('');

    // Consumables actions state
    const [showConsumeModal, setShowConsumeModal] = useState(false);
    const [consumeData, setConsumeData] = useState({ id: null, quantity: '', notes: '' });
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [restockData, setRestockData] = useState({ id: null, quantity: '', cost: '', sell_price: '', gst_rate: 0, name: '', notes: '', has_disabled_product: false, disabled_product_id: null });

    // Bill Upload state
    const [showSmartUpload, setShowSmartUpload] = useState(false);

    // Scanner state
    const [showScanner, setShowScanner] = useState(false);
    const handleCloseScanner = useCallback(() => setShowScanner(false), []);

    // Inter-branch stock request state
    const [showStockRequestModal, setShowStockRequestModal] = useState(false);
    const [stockRequestData, setStockRequestData] = useState({ inventory_item_id: null, item_name: '', notes: '' });
    const [branchAvailability, setBranchAvailability] = useState(null); // { item, branches[] }
    const [branchAvailabilityLoading, setBranchAvailabilityLoading] = useState(false);
    const [branchRequestQtys, setBranchRequestQtys] = useState({}); // { branchId: qty string }
    const [showStockRequestsPanel, setShowStockRequestsPanel] = useState(false);
    
    const [stockRequests, setStockRequests] = useState([]);
    const [stockRequestsLoading, setStockRequestsLoading] = useState(false);
    const [stockRequestSaving, setStockRequestSaving] = useState(false);

    // Product Detail Dashboard state
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [detailItem, setDetailItem] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const navigate = useNavigate();

    const [tabCounts, setTabCounts] = useState({ general: 0, paper: 0, consumables: 0 });

    useEffect(() => {
        let isMounted = true;
        const fetchTabCounts = async () => {
            try {
                const [genRes, paperRes, consRes] = await Promise.all([
                    api.get('/inventory', { params: { limit: 1 } }),
                    api.get('/paperInventory/stock'),
                    api.get('/inventory/consumables')
                ]);
                if (!isMounted) return;
                
                const generalCount = genRes.data?.total || (Array.isArray(genRes.data) ? genRes.data.length : 0);
                const paperCount = Array.isArray(paperRes.data) ? paperRes.data.length : 0;
                const consumablesCount = Array.isArray(consRes.data) ? consRes.data.length : 0;

                setTabCounts({
                    general: generalCount,
                    paper: paperCount,
                    consumables: consumablesCount
                });
            } catch (err) {
                console.error('Error fetching tab counts:', err);
            }
        };
        fetchTabCounts();
        return () => { isMounted = false; };
    }, []);

    const handleScan = useCallback((code) => {
        console.log('[Inventory] handleScan called with:', code);
        const normalized = (code || '').replace(/\s+/g, '').toUpperCase();
        if (!normalized) return;

        // Try to find the scanned item in current inventory by SKU or name
        const matched = items.find(i =>
            (i.sku || '').toUpperCase() === normalized ||
            (i.name || '').toUpperCase() === normalized ||
            (i.product_code || '').toUpperCase() === normalized
        );
        if (matched) {
            setSearchTerm(matched.sku || matched.name || '');
            setDebouncedSearch(matched.sku || matched.name || '');
            toast.success(`Found: ${matched.name}`);
        } else {
            setSearchTerm(normalized);
            setDebouncedSearch(normalized);
            toast('Scanned code set as search term — no exact match in current view', { icon: '🔍' });
        }
    }, [items]);

    useEffect(() => {
        fetchInventory();
    }, [page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, filterBranch, limit]);

    useEffect(() => {
        fetchHierarchy();
        fetchBranches();
    }, []);

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
                if (showSelectPrintModal) setShowSelectPrintModal(false);
                else if (showAddModal) setShowAddModal(false);
                else if (showEditModal) setShowEditModal(false);
                else if (showPrintModal) setShowPrintModal(false);
                else if (showConsumeModal) setShowConsumeModal(false);
                else if (showRestockModal) setShowRestockModal(false);
                else if (showSmartUpload) setShowSmartUpload(false);
                else if (showScanner) setShowScanner(false);
                else if (showDetailModal) setShowDetailModal(false);
                else if (showStockRequestModal) setShowStockRequestModal(false);
                else if (showStockRequestsPanel) setShowStockRequestsPanel(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSelectPrintModal, showAddModal, showEditModal, showPrintModal, showConsumeModal, showRestockModal, showSmartUpload, showScanner, showDetailModal, showStockRequestModal, showStockRequestsPanel]);

    // Listen for real-time product/inventory changes from other sessions
    useEffect(() => {
        const unsub = onSocketEvent('productDeleted', () => {
            fetchInventory();
        });
        return unsub;
    }, []);

    async function fetchInventory() {
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
                branch_id: filterBranch || undefined,
                limit: limit || 50
            };
            const res = await api.get('/inventory', { params });

            // Support two types of responses:
            // 1) Server-side paginated: { data: [...], total, totalPages }
            // 2) Full array returned directly: [...]
            const resp = res.data;
            if (resp && Array.isArray(resp.data)) {
                // Server-side pagination
                setItems(resp.data || []);
                setTotal(Number(resp.total) || resp.data.length || 0);
                setTotalPages(Number(resp.totalPages) || Math.max(1, Math.ceil((Number(resp.total) || resp.data.length || 0) / limit)));
            } else if (Array.isArray(resp)) {
                // Backend returned full array; do client-side paging
                const full = resp;
                const totalLocal = full.length;
                const totalPagesLocal = Math.max(1, Math.ceil(totalLocal / limit));
                const start = (page - 1) * limit;
                const pageItems = full.slice(start, start + limit);
                setItems(pageItems);
                setTotal(totalLocal);
                setTotalPages(totalPagesLocal);
            } else {
                // Fallback
                setItems(resp?.data || []);
                setTotal(resp?.total || 0);
                setTotalPages(resp?.totalPages || 1);
            }
        } catch (err) {
            if (!err.response && (err.code === 'ERR_NETWORK' || !navigator.onLine)) {
                setNetworkError(true);
            } else {
                setError('Failed to fetch inventory');
            }
        } finally {
            setLoading(false);
        }
    }

    async function fetchHierarchy() {
        try {
            const [products, hierarchyData] = await Promise.all([
                localDb.getProductList(),
                localDb.getProducts()
            ]);
            setAllProducts(products || []);
            setHierarchy(Array.isArray(hierarchyData) ? hierarchyData : []);
        } catch (err) {
            console.error("Fetch hierarchy error:", err);
        }
        // Overwrite with fresh API data so disabled products disappear immediately
        try {
            const { data } = await api.get('/product-hierarchy');
            if (Array.isArray(data)) {
                setHierarchy(data);
                // Flatten for allProducts (same pattern as syncWorker.v2.js)
                const flat = [];
                data.forEach(cat => {
                    (cat.subcategories || []).forEach(sub => {
                        (sub.products || []).forEach(p => flat.push(p));
                    });
                });
                setAllProducts(flat);
            }
        } catch { /* fallback to IndexedDB data */ }
    }

    async function fetchBranches() {
        try {
            const res = await api.get('/branches');
            setBranches(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) {
            console.error("Fetch branches error:", err);
        }
    }

    const fetchStockRequests = async () => {
        setStockRequestsLoading(true);
        try {
            const res = await api.get('/stock-requests');
            setStockRequests(res.data || []);
        } catch {
            toast.error('Failed to load stock requests');
        } finally {
            setStockRequestsLoading(false);
        }
    };

    const openStockRequestModal = async (item) => {
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
    };

    const handleStockRequest = async (e) => {
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
    };

    const handleReviewStockRequest = async (id, action) => {
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
    };

    const pendingRequestsCount = stockRequests.filter(r => ['Pending', 'Sent'].includes(r.status)).length;

    const lowStockCount = useMemo(() =>
        items.filter(i => {
            const stock = i.branch_stock !== undefined ? Number(i.branch_stock) : Number(i.quantity);
            return stock <= Number(i.reorder_level || 0);
        }).length,
    [items]);

    const inventoryValue = useMemo(() =>
        items.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.sell_price || 0)), 0),
    [items]);

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

    const openEditItem = useCallback((item) => {
        const normalized = normalizeItem(item);
        const bStocks = branches.map(b => {
            const existing = item.branch_stocks?.find(bs => bs.branch_id === b.id);
            return {
                branch_id: b.id,
                branch_name: b.name,
                short_name: b.short_name,
                quantity: existing ? Number(existing.quantity) : 0
            };
        });
        setSelectedItem({
            ...normalized,
            branch_stocks: bStocks
        });
        setShowEditModal(true);
    }, [branches]);

    const getImageId = (url) => {
        if (!url) return null;
        try {
            const parts = String(url).split('/');
            const last = parts[parts.length - 1] || url;
            return String(last).split('?')[0];
        } catch {
            return url;
        }
    };

    const resolveImageSrc = (itemOrUrl) => {
        if (!itemOrUrl) return null;
        if (typeof itemOrUrl === 'string') return imgUrl(itemOrUrl);
        
        // Check all possible image field names on the inventory item
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
            // If item links to a product explicitly, use that product's image.
            if (linkedId) {
                const found = allProducts.find(p => String(p.id) === String(linkedId) || String(p.product_code) === String(linkedId));
                if (found && (found.image_url || found.product_image_url)) {
                    return imgUrl(found.image_url || found.product_image_url);
                }
            }

            // Also check reverse relationship: product may reference this inventory item.
            if (inventoryItemId) {
                const foundByInventoryId = allProducts.find(p => String(p.inventory_item_id) === String(inventoryItemId));
                if (foundByInventoryId && (foundByInventoryId.image_url || foundByInventoryId.product_image_url)) {
                    return imgUrl(foundByInventoryId.image_url || foundByInventoryId.product_image_url);
                }
            }

            // Try matching by SKU/code if the item is not explicitly linked.
            const itemSku = String(itemOrUrl.sku || itemOrUrl.product_code || '').trim();
            if (itemSku) {
                const foundBySku = allProducts.find(p => String(p.product_code || '').trim().toLowerCase() === itemSku.toLowerCase() || String(p.sku || '').trim().toLowerCase() === itemSku.toLowerCase());
                if (foundBySku && (foundBySku.image_url || foundBySku.product_image_url)) {
                    return imgUrl(foundBySku.image_url || foundBySku.product_image_url);
                }
            }

            // Finally try matching by name if product has same name.
            const itemName = String(itemOrUrl.name || '').trim().toLowerCase();
            if (itemName) {
                const foundByName = allProducts.find(p => String(p.name || '').trim().toLowerCase() === itemName);
                if (foundByName && (foundByName.image_url || foundByName.product_image_url)) {
                    return imgUrl(foundByName.image_url || foundByName.product_image_url);
                }
            }
        }

        return null;
    };

    const handleAddItem = async (e) => {
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
            // Optimistic UI Update - add new item to local state
            if (response.data) {
                setItems(prev => [...prev, response.data]);
                setTotal(prev => prev + 1);
            }
            toast.success('Inventory item added');

            // Auto-open label print modal for non-paper items
            const newId = response.data?.id;
            const newSku = response.data?.sku;
            const newName = newItem.name;
            const newCategory = newItem.category;

            if (newId && !isPaperCategory(newCategory)) {
                const addedItem = {
                    id: newId,
                    sku: newSku || '',
                    name: newName,
                    quantity: Number(newItem.quantity) || 0,
                    category: newCategory || ''
                };
                setItems(prev => {
                    const exists = prev.find(i => i.id === newId);
                    return exists ? prev : [...prev, addedItem];
                });
                setSelectedIds([newId]);
                const autoQty = getStockBasedPrintQty(addedItem);
                setPrintQuantities({ [newId]: autoQty });
                setShowAddModal(false);
                setNewItem(emptyItem);
                setShowPrintModal(true);
                // fetchInventory() will be called after modal closes via generatePDF()
                return;
            }

            setShowAddModal(false);
            setNewItem(emptyItem);
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
        // Optimistic UI Update
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
                size_code: selectedItem.size_code || null,
                item_type: selectedItem.item_type || 'Retail'
            });
            setShowEditModal(false);
            setSelectedItem(null);
            toast.success('Inventory item updated');
            fetchInventory();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update item');
            setItems(prevItems);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteItem = async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Item',
            message: 'Are you sure you want to delete this item?',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        // Optimistic UI: remove locally first to avoid full reload
        const prevItems = items;
        const prevTotal = total;
        setItems((prev) => prev.filter((i) => i.id !== id));
        setTotal(Math.max(0, prevTotal - 1));
        setSelectedIds((prev) => prev.filter((i) => i !== id));

        try {
            // If offline, delete locally and rely on sync worker
            if (!navigator.onLine) {
                await localDb.deleteInventoryItem(id);
                toast.success('Inventory item deleted (offline). Will sync when online.');
                // If this was the only item on the page, move back a page
                if ((prevItems || []).length === 1 && page > 1) setPage((p) => p - 1);
                return;
            }

            await api.delete(`/inventory/${id}`);
            toast.success('Inventory item deleted');

            // If this was the only item on the page, go back a page to avoid empty list
            if ((prevItems || []).length === 1 && page > 1) setPage((p) => p - 1);
            // otherwise avoid calling fetchInventory() to prevent a full reload

            // Refresh hierarchy (Product Library data) so deleted products disappear immediately
            fetchHierarchy().catch(() => {});
        } catch (err) {
            // Revert optimistic update
            setItems(prevItems);
            setTotal(prevTotal);
            toast.error(err.response?.data?.message || 'Failed to delete item');
        }
    };

    const toggleSelect = useCallback((id) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }, []);

    const getStockBasedPrintQty = (item) => {
        const stockQty = Number(item?.quantity) || 0;
        return Math.max(1, Math.floor(stockQty || 1));
    };

    // Paper category detection: explicitly recognise main paper categories
    const paperCategoryAliases = ['offset papers', 'laser papers', 'other papers', 'offset paper', 'laser paper', 'other paper'];
    const isPaperCategory = (cat) => {
        if (!cat) return false;
        const c = String(cat).toLowerCase().trim();
        if (c.includes('paper')) return true;
        for (const alias of paperCategoryAliases) if (c.includes(alias)) return true;
        return false;
    };

    const applyStockQuantitiesForSelected = () => {
        const next = {};
        items
            .filter(i => printItemIds.includes(i.id))
            .forEach((item) => {
                next[item.id] = getStockBasedPrintQty(item);
            });
        setPrintQuantities(next);
    };

    const handlePrintLabels = async () => {
        if (selectedIds.length === 0) return;

        // Filter out paper items from printable selection (explicit paper categories)
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
        setPrintItemIds(printableIds);
        setShowAddItems(false);
        setAddItemSearch('');
        setShowPrintModal(true);
    };

    const handlePrintNewItemsLabels = () => {
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

        // Exclude paper items from automatic-new-items printing
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
        setPrintItemIds(nextIds);
        setShowAddItems(false);
        setAddItemSearch('');
        setShowPrintModal(true);
    };

    const openSelectPrintModal = async () => {
        setShowSelectPrintModal(true);
        setSelectPrintSearch('');
        setSelectPrintSelectedIds([]);
        setAllPrintItemsLoading(true);
        try {
            const res = await api.get('/inventory', { params: { no_pagination: '1' } });
            const data = res.data;
            const fetched = Array.isArray(data) ? data : (data?.data || []);
            setAllPrintItems(fetched);
        } catch {
            toast.error('Failed to load inventory items');
            setAllPrintItems([]);
        } finally {
            setAllPrintItemsLoading(false);
        }
    };

    const generatePDF = async () => {
        setPrintingLabel(true);
        setPrintingProgress(null);
        setPrintingTotal(null);
        setPrintCompleted(0);
        setPrintTotal(0);

        let cleanupSocket = null;
        try {
            const itemsToPrint = Object.keys(printQuantities).map(id => ({ id: Number(id), quantity_to_print: printQuantities[id] || 1 }));

            if (itemsToPrint.length === 0) {
                toast.error('No printable items selected');
                setPrintingLabel(false);
                return;
            }

            const totalLabels = itemsToPrint.reduce((acc, it) => acc + (Number(it.quantity_to_print) || 1), 0);
            setPrintTotal(totalLabels);

            // Connect to socket and get socket ID
            const socket = getSocket();
            const socketId = socket?.id || null;

            if (socketId) {
                cleanupSocket = onSocketEvent('labelGenProgress', (progress) => {
                    if (progress && typeof progress.completed === 'number') {
                        setPrintCompleted(progress.completed);
                    }
                });
            }

            const response = await api.post('/inventory/generate-labels',
                { items: itemsToPrint, socketId },
                {
                    responseType: 'blob',
                    timeout: 300000, // 5 minutes — large label jobs need more time
                    onDownloadProgress: (progressEvent) => {
                        try {
                            if (progressEvent.lengthComputable && progressEvent.total) {
                                const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                                setPrintingProgress(percent);
                            } else {
                                setPrintingProgress(null);
                            }
                        } catch (e) {
                            // ignore
                        }
                    }
                }
            );

            // Check that server returned a PDF, not a JSON error blob
            const contentType = response.headers?.['content-type'] || '';
            if (!contentType.includes('application/pdf')) {
                // Server returned an error — read and surface it
                let errMsg = 'Failed to generate labels';
                try {
                    const errText = await response.data.text();
                    const errParsed = JSON.parse(errText);
                    errMsg = errParsed.message || errParsed.error || errMsg;
                } catch { /* ignore parse errors */ }
                toast.error(errMsg);
                setPrintingLabel(false);
                return;
            }

            // Success confirmation before download
            try {
                toast.success(`Generated ${totalLabels} label${totalLabels !== 1 ? 's' : ''} — starting download`);
            } catch (e) {
                // ignore
            }

            // response.data is already a Blob when responseType:'blob' — do NOT re-wrap it
            const url = window.URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `labels_${new Date().getTime()}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

            setShowPrintModal(false);
            setSelectedIds([]);
            setPrintItemIds([]);
            setShowAddItems(false);
            setAddItemSearch('');
            setShowSelectPrintModal(false);
            setSelectPrintSearch('');
            setSelectPrintSelectedIds([]);
            fetchInventory();
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
            if (printCompleted > 0) {
                toast.error(`${msg} (Failed after successfully generating ${printCompleted} labels)`);
            } else {
                toast.error(msg);
            }
        } finally {
            if (cleanupSocket) cleanupSocket();
            setPrintingLabel(false);
            setPrintingProgress(null);
            setPrintingTotal(null);
            setPrintCompleted(0);
            setPrintTotal(0);
        }
    };

    const handleConsume = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/inventory/${consumeData.id}/consume`, { quantity: consumeData.quantity, notes: consumeData.notes, branch_id: filterBranch || undefined });
            toast.success('Stock consumed');
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
            await api.post(`/inventory/${restockData.id}/restock`, { 
                quantity_received: restockData.quantity, 
                cost_price: restockData.cost, 
                sell_price: restockData.sell_price,
                notes: restockData.notes, 
                branch_id: filterBranch || undefined 
            });
            toast.success(`Restocked successfully`);
            setShowRestockModal(false);
            setRestockData({ id: null, quantity: '', cost: '', sell_price: '', gst_rate: 0, name: '', notes: '', has_disabled_product: false, disabled_product_id: null });
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error restocking item');
        } finally {
            setSaving(false);
        }
    };

    const getStatus = useCallback((item) => {
        const stock = item.branch_stock !== undefined ? Number(item.branch_stock) : Number(item.quantity);
        if (stock <= Number(item.reorder_level || 0)) return 'low';
        return 'ok';
    }, []);

    const openItemDetail = useCallback(async (itemId) => {
        setDetailLoading(true);
        setShowDetailModal(true);
        try {
            const res = await api.get(`/inventory/${itemId}`);
            setDetailItem(res.data);
        } catch {
            toast.error('Failed to load item details');
            setShowDetailModal(false);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    return (
        <PageContainer>

            {/* ─── Header ─── */}
            <div className="inv-header">
                <div className="inv-header-left">
                    <div className="text-xs uppercase tracking-wider text-accent font-semibold mb-2">Inventory System / General</div>
                    <h1 className="inv-header-title">Inventory</h1>
                    <p className="inv-header-desc">Manage stock, prices, and reorder levels.</p>
                </div>
            </div>

            {/* ─── Segmented Tab Navigation ─── */}
            <div className="inv-tabs">
                <div 
                    onClick={() => navigate('/dashboard/inventory')}
                    className="inv-tab inv-tab--active"
                >
                    <div className="inv-tab-icon">
                        <Package size={20} />
                    </div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">General Inventory</span>
                        <span className="inv-tab-count">{tabCounts.general.toLocaleString()} Items</span>
                    </div>
                </div>
                <div 
                    onClick={() => navigate('/dashboard/inventory/paper')}
                    className="inv-tab"
                >
                    <div className="inv-tab-icon">
                        <Layers size={20} />
                    </div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">Paper Stock</span>
                        <span className="inv-tab-count">{tabCounts.paper.toLocaleString()} Types</span>
                    </div>
                </div>
                <div 
                    onClick={() => navigate('/dashboard/inventory/consumables')}
                    className="inv-tab"
                >
                    <div className="inv-tab-icon">
                        <ShoppingCart size={20} />
                    </div>
                    <div className="inv-tab-info">
                        <span className="inv-tab-label">Consumables</span>
                        <span className="inv-tab-count">{tabCounts.consumables.toLocaleString()} Items</span>
                    </div>
                </div>
            </div>

            {/* ─── KPI Row ─── */}
            <div className="inv-kpi-row">
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Package size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">{total}</span>
                        <span className="inv-kpi-label">Total Items</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Minus size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value" style={{ color: lowStockCount > 0 ? 'var(--warning)' : 'var(--text)' }}>{lowStockCount}</span>
                        <span className="inv-kpi-label">Low Stock</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><IndianRupee size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value">₹{inventoryValue.toLocaleString()}</span>
                        <span className="inv-kpi-label">Retail Value</span>
                    </div>
                </div>
                <div className="inv-kpi-card">
                    <div className="inv-kpi-icon"><Bell size={16} /></div>
                    <div className="inv-kpi-info">
                        <span className="inv-kpi-value" style={{ color: pendingRequestsCount > 0 ? 'var(--warning)' : 'var(--text)' }}>{pendingRequestsCount}</span>
                        <span className="inv-kpi-label">Pending Requests</span>
                    </div>
                </div>
            </div>

            {/* ─── Toolbar ─── */}
            <div className="inv-toolbar">
                {/* Row 1: Search and Primary Add Item Action */}
                <div className="inv-toolbar-row">
                    <div className="inv-search">
                        <span className="inv-search-icon"><Search size={16} /></span>
                        <input
                            type="text"
                            name="inventorySearch"
                            className="inv-search-input"
                            placeholder="Search by name or SKU..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button className="inv-search-clear" onClick={() => setSearchTerm('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate('/dashboard/products?addProduct=1')}
                    >
                        <Plus size={18} />
                        <span>Add Item</span>
                    </button>
                </div>

                {/* Row 2: Filters and Secondary Action Buttons */}
                <div className="inv-toolbar-row justify-between wrap gap-sm">
                    {/* Filter Chips */}
                    <div className="inv-chips">
                        <div className="inv-chip">
                            <label htmlFor="inv-type" className="sr-only">
                                Filter by Type
                            </label>
                            <select
                                id="inv-type"
                                name="filterType"
                                aria-label="Filter by Type"
                                value={filterType}
                                onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                            >
                                <option value="">All Types</option>
                                <option value="Retail">Retail</option>
                            </select>
                        </div>
                        <div className="inv-chip">
                            <label htmlFor="inv-branch" className="sr-only">
                                Filter by Branch
                            </label>
                            <select
                                id="inv-branch"
                                name="filterBranch"
                                aria-label="Filter by Branch"
                                value={filterBranch}
                                onChange={(e) => { setFilterBranch(e.target.value); setPage(1); }}
                                disabled={!isAdmin}
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>{b.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="inv-chip">
                            <label htmlFor="inv-category" className="sr-only">
                                Filter by Category
                            </label>
                            <select
                                id="inv-category"
                                name="filterCategory"
                                aria-label="Filter by Category"
                                value={filterCategory}
                                onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                            >
                                <option value="">All Categories</option>
                                {(Array.isArray(hierarchy) ? hierarchy : []).map(cat => (
                                    <optgroup key={cat.id} label={cat.name}>
                                        {(cat.subcategories || []).map(sub => (
                                            <option key={sub.id} value={sub.name}>{sub.name}</option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                        <div className="inv-chip">
                            <label htmlFor="inv-status" className="sr-only">
                                Filter by Status
                            </label>
                            <select
                                id="inv-status"
                                name="filterStatus"
                                aria-label="Filter by Status"
                                value={filterStatus}
                                onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
                            >
                                <option value="">All Statuses</option>
                                <option value="ok">Stock OK</option>
                                <option value="low">Low Stock</option>
                            </select>
                        </div>
                        <div className="inv-chip" style={{ position: 'relative' }}>
                            <input
                                name="filterVendor"
                                placeholder="Vendor..."
                                value={filterVendor}
                                onChange={(e) => { setFilterVendor(e.target.value); setPage(1); }}
                                onFocus={() => setShowVendorSuggestions(true)}
                                onBlur={() => setShowVendorSuggestions(false)}
                                style={{ background: 'none', border: 'none', color: 'inherit', fontSize: 12, fontWeight: 500, padding: 0, outline: 'none', width: 80 }}
                            />
                            {showVendorSuggestions && vendorSuggestions.length > 0 && (
                                <div className="dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 200, overflowY: 'auto', marginTop: 4 }}>
                                    {vendorSuggestions.map(v => (
                                        <div key={v.id || v.name} className="dropdown-item" onMouseDown={() => { setFilterVendor(v.name); setPage(1); setShowVendorSuggestions(false); }}>
                                            <div className="text-sm font-medium">{v.name}</div>
                                            {v.phone && <div className="muted text-xs">{v.phone}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="inv-chip">
                            <label htmlFor="inv-pagination" className="sr-only">
                                Items per page
                            </label>
                            <select
                                id="inv-pagination"
                                name="perPage"
                                aria-label="Items per page"
                                value={limit}
                                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                            >
                                <option value={20}>20 / page</option>
                                <option value={50}>50 / page</option>
                                <option value={100}>100 / page</option>
                            </select>
                        </div>
                        {(filterType || filterBranch || filterCategory || filterStatus || filterVendor) && (
                            <button className="inv-chip-clear" onClick={() => { 
                                const u = auth.getUser();
                                const priv = ['Admin', 'Accountant'].includes(u?.role);
                                setFilterType(''); 
                                setFilterBranch(priv ? '' : (u?.branch_id || '')); 
                                setFilterCategory(''); 
                                setFilterStatus(''); 
                                setFilterVendor(''); 
                                setPage(1); 
                            }}>
                                <X size={12} /> Clear
                            </button>
                        )}
                    </div>

                    {/* Secondary Action Buttons */}
                    <div className="row gap-xs items-center">
                        {/* Scan QR Code */}
                        <button type="button" className="inv-action-btn" onClick={() => { console.log('[Inventory] Scan button clicked'); setShowScanner(true); }} title="Scan QR / Barcode">
                            <Camera size={16} />
                        </button>

                        {/* View Mode Switcher */}
                        <button
                            type="button"
                            className="inv-action-btn"
                            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                            title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}
                        >
                            {viewMode === 'grid' ? <List size={16} /> : <Grid size={16} />}
                        </button>

                        {/* Print Selected Labels */}
                        {selectedIds.length > 0 && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={handlePrintLabels} title={`Print (${selectedIds.length}) selected`}>
                                <Printer size={14} />
                                <span>Print ({selectedIds.length})</span>
                            </button>
                        )}

                        {/* Print Labels for New Items */}
                        {items.length > 0 && (
                            <button type="button" className="inv-action-btn" onClick={handlePrintNewItemsLabels} title="Print Labels for New Items">
                                <Printer size={16} />
                            </button>
                        )}

                        {/* Select & Print Labels */}
                        <button
                            type="button"
                            className="inv-action-btn"
                            onClick={openSelectPrintModal}
                            title="Print Labels"
                        >
                            <QrCode size={16} />
                        </button>

                        {/* Image Fallback Settings */}
                        {isAdmin && (
                            <button type="button" className="inv-action-btn" title="Image Fallback Settings" onClick={() => setShowImageSettingsModal(true)}>
                                <Settings size={16} />
                            </button>
                        )}

                        {/* Pending Stock Requests Bell */}
                        <button
                            type="button"
                            className="inv-action-btn"
                            style={{ position: 'relative' }}
                            onClick={() => { fetchStockRequests(); setShowStockRequestsPanel(true); }}
                            title="Stock Requests"
                        >
                            <Bell size={16} />
                            {pendingRequestsCount > 0 && (
                                <span className="inv-badge">
                                    {pendingRequestsCount}
                                </span>
                            )}
                        </button>

                        {/* Smart Bill Upload */}
                        {isAdmin && (
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/expenses/upload-bills?redirect=/dashboard/inventory')} title="Smart Bill Upload (Scan/Upload)">
                                <ShoppingCart size={14} />
                                <span>Smart Upload</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {networkError && (
                <NoInternetState
                    variant="section"
                    title="Inventory Unavailable"
                    message="Could not fetch inventory data. Check your connection."
                    actionLabel="Retry"
                    onRetry={() => { setNetworkError(false); fetchInventory(); }}
                />
            )}
            {error && (
                <div className="alert alert--error">
                    <span>{error}</span>
                </div>
            )}

            {/* ─── Table / Grid ─── */}
            <div className="inv-table-container">
                {viewMode === 'list' ? (
                    <div className="inv-table-scroll">
                        <table className="inv-table">
                            <thead>
                                <tr>
                                    <th className="checkbox-cell">
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
                                    <th>Category</th>
                                    <th>Stock</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                    <th className="th-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: 0 }}>
                                            <div className="inv-skeleton">
                                                {[1, 2, 3, 4, 5].map(i => (
                                                    <div key={i} className="inv-skeleton-row">
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--xs" />
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--sm" />
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--md" />
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--half" />
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--quarter" />
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--quarter" />
                                                        <div className="inv-skeleton-cell inv-skeleton-cell--action" />
                                                        <div className="inv-skeleton-cell" style={{ width: 80 }} />
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div className="inv-empty">
                                                <Package size={48} className="inv-empty-icon" />
                                                <div className="inv-empty-text">No inventory items found</div>
                                                <div className="inv-empty-sub">Try adjusting your search or filters, or add a new item.</div>
                                                {searchTerm && (
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ marginTop: 16 }}
                                                        onClick={() => navigate(`/dashboard/products?addProduct=1&name=${encodeURIComponent(searchTerm)}`)}
                                                    >
                                                        <Plus size={16} />
                                                        Add "{searchTerm}" to Product Library
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item) => {
                                        const isLow = getStatus(item) === 'low';
                                        return (
                                            <tr key={item.id} className={selectedIds.includes(item.id) ? 'row-selected' : ''}>
                                                <td className="checkbox-cell" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(item.id)}
                                                        onChange={() => toggleSelect(item.id)}
                                                    />
                                                </td>
                                                <td>
                                                    <div role="button" tabIndex={0} className="inv-item-cell" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); } }}>
                                                        <InventoryImage item={item} onUpdate={handleImageUpdate} isAdmin={isAdmin} size={40} />
                                                        <div className="inv-item-info" onClick={() => openItemDetail(item.id)}>
                                                            <span className="inv-item-name">{item.name}</span>
                                                            <span className="inv-item-sku">{item.sku || '-'}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td data-label="Category">
                                                    <span className="text-sm text-muted">{item.category || item.product_subcategory_name || '-'}</span>
                                                </td>
                                                <td data-label="Stock">
                                                    <div className="inv-stock-cell">
                                                        <div className="row items-center gap-xs">
                                                            <span className="inv-stock-value">{item.branch_stock !== undefined ? Number(item.branch_stock).toLocaleString() : Number(item.quantity).toLocaleString()}</span>
                                                            {item.branch_stock !== undefined && (
                                                                <span className="inv-stock-total text-xs muted" style={{ marginLeft: 4 }}>
                                                                    / {Number(item.quantity).toLocaleString()}
                                                                </span>
                                                            )}
                                                            <span className="inv-stock-unit" style={{ marginLeft: 4 }}>{item.unit}</span>
                                                            {item.branch_stocks && item.branch_stocks.length > 0 && (
                                                                <span className="muted" style={{ fontSize: '8px', marginLeft: 4, opacity: 0.5 }}>▼</span>
                                                            )}
                                                        </div>
                                                        {item.branch_stocks && item.branch_stocks.length > 0 && (
                                                            <div className="inv-stock-popover">
                                                                <div className="inv-stock-popover-title">Branch Stocks</div>
                                                                {item.branch_stocks.map(bs => (
                                                                    <div key={bs.branch_id} className="inv-stock-popover-item">
                                                                        <span className="inv-stock-popover-branch">{bs.branch_name} ({bs.short_name})</span>
                                                                        <span className="inv-stock-popover-qty">{Number(bs.quantity).toLocaleString()} {item.unit}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td data-label="Price">
                                                    <span className="text-sm font-semibold">₹{Number(item.sell_price || 0).toFixed(2)}</span>
                                                </td>
                                                <td data-label="Status">
                                                    <span className={`inv-pill ${isLow ? 'inv-pill--low' : 'inv-pill--ok'}`}>
                                                        {isLow ? 'Low Stock' : 'In Stock'}
                                                    </span>
                                                </td>
                                                <td data-label="Actions">
                                                    <div className="inv-actions">
                                                        {isAdmin && item.item_type === 'Consumable' && (
                                                            <>
                                                                <button
                                                                    className="inv-action-btn inv-action-btn--danger"
                                                                    title="Consume Stock"
                                                                    onClick={() => { setConsumeData({ id: item.id, quantity: '', notes: '' }); setShowConsumeModal(true); }}
                                                                >
                                                                    <Minus size={14} />
                                                                </button>
                                                                <button
                                                                    className="inv-action-btn inv-action-btn--primary"
                                                                    title="Restock"
                                                                    onClick={() => { 
                                                                        setRestockData({ 
                                                                            id: item.id, 
                                                                            quantity: '', 
                                                                            cost: item.cost_price || 0, 
                                                                            sell_price: item.sell_price || 0, 
                                                                            gst_rate: item.gst_rate || 0, 
                                                                            name: item.name, 
                                                                            notes: '' 
                                                                        }); 
                                                                        setShowRestockModal(true); 
                                                                    }}
                                                                >
                                                                    <Plus size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                className="inv-action-btn"
                                                                title="Edit"
                                                                onClick={() => openEditItem(item)}
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                        )}
                                                        {isSuperAdmin && (
                                                            <button
                                                                className="inv-action-btn inv-action-btn--danger"
                                                                title="Delete"
                                                                onClick={() => handleDeleteItem(item.id)}
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            className="inv-action-btn"
                                                            title="Request from Another Branch"
                                                            onClick={() => openStockRequestModal(item)}
                                                        >
                                                            <ArrowLeftRight size={14} />
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
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, padding: 16 }}>
                        {loading ? (
                            <>
                                {[1, 2, 3, 4, 5, 6].map(i => (
                                    <div key={i} className="card" style={{ padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                            <div className="skeleton" style={{ width: 84, height: 84, borderRadius: 8, flexShrink: 0 }} />
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                <div className="skeleton" style={{ height: 16, width: '80%', borderRadius: 4 }} />
                                                <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 4 }} />
                                                <div className="skeleton" style={{ height: 12, width: '30%', borderRadius: 4 }} />
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div className="skeleton" style={{ height: 12, width: '25%', borderRadius: 4 }} />
                                            <div className="skeleton" style={{ height: 12, width: '20%', borderRadius: 4 }} />
                                        </div>
                                    </div>
                                ))}
                            </>
                        ) : items.length === 0 ? (
                            <div style={{ gridColumn: '1/-1' }}>
                                <div className="inv-empty">
                                    <Package size={48} className="inv-empty-icon" />
                                    <div className="inv-empty-text">No inventory items found</div>
                                    <div className="inv-empty-sub">Try adjusting your search or filters.</div>
                                    {searchTerm && (
                                        <button
                                            className="btn btn-primary"
                                            style={{ marginTop: 16 }}
                                            onClick={() => navigate(`/dashboard/products?addProduct=1&name=${encodeURIComponent(searchTerm)}`)}
                                        >
                                            <Plus size={16} />
                                            Add "{searchTerm}" to Product Library
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : items.map(item => (
                            <div key={item.id} className="card" style={{ padding: 12, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <div role="button" tabIndex={0} style={{ width: 84, height: 84, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface-2)', cursor: 'pointer' }} onClick={() => openItemDetail(item.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItemDetail(item.id); } }}>
                                        <InventoryImage item={item} onUpdate={handleImageUpdate} isAdmin={isAdmin} size={84} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div className="inv-item-name">{item.name}</div>
                                                <div className="inv-item-sku" style={{ marginTop: 2 }}>{item.sku || '-'}</div>
                                            </div>
                                            <div style={{ marginLeft: 8, textAlign: 'right' }}>
                                                <div className="inv-stock-cell" style={{ display: 'inline-block' }}>
                                                    <div className="inv-stock-value">
                                                        {item.branch_stock !== undefined ? Number(item.branch_stock).toLocaleString() : Number(item.quantity).toLocaleString()}
                                                        {item.branch_stock !== undefined && (
                                                            <span className="text-2xs muted" style={{ marginLeft: 2 }}>
                                                                /{Number(item.quantity).toLocaleString()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="inv-stock-unit">{item.unit}</div>
                                                    {item.branch_stocks && item.branch_stocks.length > 0 && (
                                                        <div className="inv-stock-popover" style={{ left: 'auto', right: 0 }}>
                                                            <div className="inv-stock-popover-title">Branch Stocks</div>
                                                            {item.branch_stocks.map(bs => (
                                                                <div key={bs.branch_id} className="inv-stock-popover-item">
                                                                    <span className="inv-stock-popover-branch">{bs.branch_name} ({bs.short_name})</span>
                                                                    <span className="inv-stock-popover-qty">{Number(bs.quantity).toLocaleString()} {item.unit}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{item.category || item.product_subcategory_name || '-'}</span>
                                            <div style={{ flex: 1 }} />
                                            <span className={`inv-pill ${getStatus(item) === 'low' ? 'inv-pill--low' : 'inv-pill--ok'}`}>{getStatus(item) === 'low' ? 'Low Stock' : 'In Stock'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="inv-actions" style={{ justifyContent: 'space-between' }}>
                                    <div className="inv-actions">
                                        {isAdmin && (
                                            <button className="inv-action-btn" onClick={() => openEditItem(item)}><Edit2 size={14} /></button>
                                        )}
                                        {isSuperAdmin && (
                                            <button className="inv-action-btn inv-action-btn--danger" onClick={() => handleDeleteItem(item.id)}><Trash2 size={14} /></button>
                                        )}
                                        <button className="inv-action-btn" onClick={() => openStockRequestModal(item)} title="Request from Another Branch"><ArrowLeftRight size={14} /></button>
                                    </div>
                                    <div style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--accent-2)' }}>₹{Number(item.sell_price || 0).toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} limit={limit} loading={loading} />

            {showImageSettingsModal && <InventoryImageSettings onClose={() => setShowImageSettingsModal(false)} />}

            {
                showAddModal && (
                    <div className="modal-backdrop">
                        <div className="modal modal--large" style={{ maxHeight: '92vh', borderRadius: 'var(--radius-xl)' }}>

                            {/* ── Sticky Header ── */}
                            <div className="modal-header" style={{ padding: 'var(--space-20) var(--space-24)', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 'var(--radius-md)',
                                        background: 'var(--accent-alpha)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 20
                                    }}>📦</div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                                            Add Inventory Item
                                        </h2>
                                        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                            Fill in the details below to add a new item to your inventory
                                        </p>
                                    </div>
                                </div>
                                <button className="modal-close modal-close--static" onClick={() => setShowAddModal(false)}
                                    style={{ position: 'static', flexShrink: 0 }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* ── Scrollable Body ── */}
                            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, padding: 'var(--space-24)' }}>

                                {/* Product Library Search */}
                                <div style={{
                                    marginBottom: 'var(--space-24)',
                                    padding: 'var(--space-16)',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--surface-alt)',
                                    border: '1px solid var(--border)'
                                }}>
                                    <label className="label" style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        🔗 Match with Product Library <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(Optional)</span>
                                    </label>
                                    <div className="search-input-container" style={{ marginTop: 'var(--space-8)' }}>
                                        <Search size={16} className="search-icon" />
                                        <input
                                            name="addProductSearch"
                                            className="input-field"
                                            placeholder="Search product from library to auto-fill fields..."
                                            value={productSearch}
                                            onChange={(e) => setProductSearch(e.target.value)}
                                        />
                                    </div>
                                    {filteredProducts.length > 0 && (
                                        <div className="dropdown mt-4">
                                            {filteredProducts.map(p => (
                                                <div role="button" tabIndex={0} key={p.id} className="dropdown-item" onClick={() => selectProduct(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProduct(p); } }}>
                                                    <div className="text-sm font-medium">{p.name}</div>
                                                    <div className="muted text-xs">{p.category_name} &rsaquo; {p.subcategory_name}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <form id="add-inventory-item-form" onSubmit={handleAddItem}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-20)' }}>

                                        {/* ── Section: Item Identity ── */}
                                        <div style={{
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                padding: 'var(--space-12) var(--space-16)',
                                                background: 'var(--surface-alt)',
                                                borderBottom: '1px solid var(--border)',
                                                display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                            }}>
                                                <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--accent)' }} />
                                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                                                    Item Identity
                                                </span>
                                            </div>
                                            <div style={{ padding: 'var(--space-16)', display: 'flex', flexDirection: 'column', gap: 'var(--space-16)', background: 'var(--surface)' }}>
                                                {/* Item Type */}
                                                <div>
                                                    <label className="label" style={{ marginBottom: 'var(--space-8)', display: 'block' }}>Item Type</label>
                                                    <div style={{ display: 'flex', gap: 'var(--space-12)' }}>
                                                        <label style={{
                                                            display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
                                                            padding: 'var(--space-10) var(--space-16)',
                                                            borderRadius: 'var(--radius-sm)',
                                                            border: `2px solid ${newItem.item_type === 'Retail' ? 'var(--accent)' : 'var(--border)'}`,
                                                            background: newItem.item_type === 'Retail' ? 'var(--accent-alpha)' : 'transparent',
                                                            cursor: 'pointer', transition: 'all var(--transition-fast)', flex: 1
                                                        }}>
                                                            <input type="radio" name="add_item_type" value="Retail"
                                                                checked={newItem.item_type === 'Retail'}
                                                                onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })}
                                                                style={{ accentColor: 'var(--accent)' }}
                                                            />
                                                            <div>
                                                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>🛍️ Retail Product</div>
                                                                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Has SKU, category, pricing</div>
                                                            </div>
                                                        </label>
                                                    </div>
                                                </div>

                                                {/* Item Name + SKU */}
                                                <div style={{ display: 'grid', gridTemplateColumns: newItem.item_type === 'Retail' ? '1fr 1fr' : '1fr', gap: 'var(--space-12)' }}>
                                                    <div>
                                                        <label className="label">Item Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                                        <input
                                                            name="addItemName"
                                                            className="input-field"
                                                            placeholder="e.g. Canon A4 Paper"
                                                            value={newItem.name}
                                                            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                                            required
                                                            style={{ marginTop: 'var(--space-6)' }}
                                                        />
                                                    </div>
                                                    {newItem.item_type === 'Retail' && (
                                                        <div>
                                                            <label className="label">SKU (Unique Code)</label>
                                                            <input
                                                                name="addItemSku"
                                                                className="input-field"
                                                                style={{ fontWeight: 700, letterSpacing: '0.5px', fontFamily: 'var(--font-mono)', marginTop: 'var(--space-6)' }}
                                                                value={newItem.sku}
                                                                onChange={(e) => setNewItem({ ...newItem, sku: e.target.value.toUpperCase() })}
                                                                placeholder="AUTOGENERATED"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Section: SKU Builder (Retail only) ── */}
                                        {newItem.item_type === 'Retail' && (
                                            <div style={{
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--border)',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    padding: 'var(--space-12) var(--space-16)',
                                                    background: 'var(--surface-alt)',
                                                    borderBottom: '1px solid var(--border)',
                                                    display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                                }}>
                                                    <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--info)' }} />
                                                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                                                        SKU Builder
                                                    </span>
                                                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Source · Model · Size → SKU</span>
                                                </div>
                                                <div style={{ padding: 'var(--space-16)', background: 'var(--surface)' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px', gap: 'var(--space-12)' }}>
                                                        <div>
                                                            <label className="label">Source</label>
                                                            <input
                                                                name="addItemSource"
                                                                className="input-field"
                                                             maxLength={10}
                                                             placeholder="ABC"
                                                             value={newItem.source_code}
                                                                style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', marginTop: 'var(--space-6)' }}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.toUpperCase();
                                                                    const newSku = `${val}-${newItem.model_name}-${newItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                                    setNewItem({ ...newItem, source_code: val, sku: newSku });
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="label">Model Name</label>
                                                            <input
                                                                name="addItemModel"
                                                                className="input-field"
                                                                placeholder="Model"
                                                                value={newItem.model_name}
                                                                style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', marginTop: 'var(--space-6)' }}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.toUpperCase();
                                                                    const newSku = `${newItem.source_code}-${val}-${newItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                                    setNewItem({ ...newItem, model_name: val, sku: newSku });
                                                                }}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="label">Size</label>
                                                            <input
                                                                name="addItemSize"
                                                                className="input-field"
                                                                maxLength={10}
                                                                placeholder="L"
                                                                value={newItem.size_code}
                                                                style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, textTransform: 'uppercase', marginTop: 'var(--space-6)' }}
                                                                onChange={(e) => {
                                                                    const val = e.target.value.toUpperCase();
                                                                    const newSku = `${newItem.source_code}-${newItem.model_name}-${val}`.replace(/-+$/, '').replace(/^-+/, '');
                                                                    setNewItem({ ...newItem, size_code: val, sku: newSku });
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    {newItem.sku && (
                                                        <div style={{
                                                            marginTop: 'var(--space-12)',
                                                            padding: 'var(--space-10) var(--space-14)',
                                                            borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--surface-alt)',
                                                            border: '1px dashed var(--border)',
                                                            display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                                        }}>
                                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Generated SKU:</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)', letterSpacing: '1px' }}>{newItem.sku}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Section: Classification (Retail only) ── */}
                                        {newItem.item_type === 'Retail' && (
                                            <div style={{
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--border)',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    padding: 'var(--space-12) var(--space-16)',
                                                    background: 'var(--surface-alt)',
                                                    borderBottom: '1px solid var(--border)',
                                                    display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                                }}>
                                                    <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--success)' }} />
                                                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                                                        Classification
                                                    </span>
                                                </div>
                                                <div style={{ padding: 'var(--space-16)', background: 'var(--surface)' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
                                                        <div>
                                                            <label className="label">Category</label>
                                                            <select
                                                                name="addItemCategory"
                                                                className="input-field"
                                                                value={newItem.category}
                                                                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                                                                style={{ marginTop: 'var(--space-6)' }}
                                                            >
                                                                <option value="">Select Category</option>
                                                                {(Array.isArray(hierarchy) ? hierarchy : []).map(cat => (
                                                                    <optgroup key={cat.id} label={cat.name}>
                                                                        {(cat.subcategories || []).map(sub => (
                                                                            <option key={sub.id} value={sub.name}>{sub.name}</option>
                                                                        ))}
                                                                    </optgroup>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="label">HSN Code</label>
                                                            <input
                                                                name="addItemHsn"
                                                                className="input-field"
                                                                placeholder="e.g. 4802"
                                                                value={newItem.hsn}
                                                                onChange={(e) => setNewItem({ ...newItem, hsn: e.target.value })}
                                                                style={{ marginTop: 'var(--space-6)' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Section: Stock & Fulfillment ── */}
                                        <div style={{
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                padding: 'var(--space-12) var(--space-16)',
                                                background: 'var(--surface-alt)',
                                                borderBottom: '1px solid var(--border)',
                                                display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                            }}>
                                                <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--warning)' }} />
                                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                                                    Stock &amp; Fulfillment
                                                </span>
                                            </div>
                                            <div style={{ padding: 'var(--space-16)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
                                                {branches && branches.length > 0 ? (
                                                    <div style={{
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid var(--border)',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            padding: 'var(--space-10) var(--space-14)',
                                                            background: 'var(--surface-alt)',
                                                            borderBottom: '1px solid var(--border)'
                                                        }}>
                                                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--accent-2)' }}>Branch Stock Distribution</span>
                                                        </div>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                                            {newItem.branch_stocks?.map((bs, index) => (
                                                                <div key={bs.branch_id} style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                    padding: 'var(--space-10) var(--space-14)',
                                                                    borderBottom: '1px solid var(--border-subtle)',
                                                                    gap: 'var(--space-8)'
                                                                }}>
                                                                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--text-muted)' }}>
                                                                        {bs.branch_name} <span style={{ opacity: 0.6 }}>({bs.short_name})</span>
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        className="input-field"
                                                                        style={{ width: 72, padding: '4px 8px', minHeight: 32, textAlign: 'right', fontWeight: 600 }}
                                                                        value={bs.quantity}
                                                                        min="0"
                                                                        onChange={(e) => {
                                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                                            const updatedStocks = [...(newItem.branch_stocks || [])];
                                                                            updatedStocks[index] = { ...bs, quantity: val };
                                                                            const totalQty = updatedStocks.reduce((sum, s) => sum + s.quantity, 0);
                                                                            setNewItem({ ...newItem, branch_stocks: updatedStocks, quantity: String(totalQty) });
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div style={{
                                                            padding: 'var(--space-10) var(--space-14)',
                                                            background: 'var(--surface-alt)',
                                                            borderTop: '1px solid var(--border)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                        }}>
                                                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Stock Available</span>
                                                            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                                {newItem.quantity || '0'} {newItem.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <label className="label">Opening Quantity</label>
                                                        <input
                                                            name="addItemQty"
                                                            type="number"
                                                            className="input-field"
                                                            placeholder="0"
                                                            value={newItem.quantity}
                                                            onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                                                            min="0"
                                                            style={{ marginTop: 'var(--space-6)' }}
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
                                                    <div>
                                                        <label className="label">Unit of Measure</label>
                                                        <input
                                                            name="addItemUnit"
                                                            className="input-field"
                                                            placeholder="pcs, kg, box..."
                                                            value={newItem.unit}
                                                            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                                                            style={{ marginTop: 'var(--space-6)' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label">Reorder Level</label>
                                                        <input
                                                            name="addItemReorderLevel"
                                                            type="number"
                                                            className="input-field"
                                                            placeholder="e.g. 10"
                                                            value={newItem.reorder_level}
                                                            onChange={(e) => setNewItem({ ...newItem, reorder_level: e.target.value })}
                                                            min="0"
                                                            style={{ marginTop: 'var(--space-6)' }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Section: Pricing ── */}
                                        <div style={{
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                padding: 'var(--space-12) var(--space-16)',
                                                background: 'var(--surface-alt)',
                                                borderBottom: '1px solid var(--border)',
                                                display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                            }}>
                                                <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--success)' }} />
                                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                                                    Pricing
                                                </span>
                                            </div>
                                            <div style={{ padding: 'var(--space-16)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: newItem.item_type === 'Retail' ? '1fr 1fr 1fr' : '1fr', gap: 'var(--space-12)' }}>
                                                    <div>
                                                        <label className="label">Cost Price</label>
                                                        <div style={{ position: 'relative', marginTop: 'var(--space-6)' }}>
                                                            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                                                            <input
                                                                name="addItemCostPrice"
                                                                type="number"
                                                                step="0.01"
                                                                className="input-field"
                                                                style={{ paddingLeft: 24 }}
                                                                placeholder="0.00"
                                                                value={newItem.cost_price}
                                                                onChange={(e) => setNewItem({ ...newItem, cost_price: e.target.value })}
                                                                min="0"
                                                            />
                                                        </div>
                                                    </div>
                                                    {newItem.item_type === 'Retail' && (
                                                        <>
                                                            <div>
                                                                <label className="label">GST Rate %</label>
                                                                <input
                                                                    name="addItemGstRate"
                                                                    type="number"
                                                                    className="input-field"
                                                                    placeholder="18"
                                                                    value={newItem.gst_rate}
                                                                    onChange={(e) => setNewItem({ ...newItem, gst_rate: e.target.value })}
                                                                    min="0"
                                                                    style={{ marginTop: 'var(--space-6)' }}
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="label">Discount %</label>
                                                                <input
                                                                    name="addItemDiscount"
                                                                    type="number"
                                                                    className="input-field"
                                                                    placeholder="0"
                                                                    value={newItem.discount}
                                                                    onChange={(e) => setNewItem({ ...newItem, discount: e.target.value })}
                                                                    min="0"
                                                                    style={{ marginTop: 'var(--space-6)' }}
                                                                />
                                                                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                                    {[0, 5, 10, 15, 20, 25].map(val => (
                                                                        <button
                                                                            key={val}
                                                                            type="button"
                                                                            className="btn btn-xs"
                                                                            onClick={() => setNewItem({ ...newItem, discount: String(val) })}
                                                                            style={{
                                                                                padding: '2px 8px',
                                                                                fontSize: '11px',
                                                                                borderRadius: '4px',
                                                                                border: '1px solid var(--border)',
                                                                                background: Number(newItem.discount || 0) === val ? 'var(--accent)' : 'var(--surface-alt)',
                                                                                color: Number(newItem.discount || 0) === val ? 'var(--on-accent)' : 'var(--text)',
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            {val}%
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                                {newItem.item_type === 'Retail' && (
                                                    <>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
                                                            <div>
                                                                <label className="label">Sell Price (MRP)</label>
                                                                <div style={{ position: 'relative', marginTop: 'var(--space-6)' }}>
                                                                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                                                                    <input
                                                                        name="addItemSellPrice"
                                                                        type="number"
                                                                        step="0.01"
                                                                        className="input-field"
                                                                        style={{ paddingLeft: 24 }}
                                                                        placeholder="0.00"
                                                                        value={newItem.sell_price}
                                                                        onChange={(e) => setNewItem({ ...newItem, sell_price: e.target.value })}
                                                                        min="0"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="label">Profit Margin</label>
                                                                <div style={{ 
                                                                    marginTop: 'var(--space-6)', 
                                                                    height: '38px', 
                                                                    display: 'flex', 
                                                                    alignItems: 'center', 
                                                                    padding: '0 var(--space-12)', 
                                                                    borderRadius: 'var(--radius-sm)', 
                                                                    background: 'var(--surface-alt)', 
                                                                    border: '1px solid var(--border)',
                                                                    fontWeight: 600,
                                                                    fontSize: 'var(--text-sm)'
                                                                }}>
                                                                    {(() => {
                                                                        const m = calculateMargin(newItem.cost_price, newItem.sell_price, newItem.gst_rate);
                                                                        const isPositive = m > 0;
                                                                        return (
                                                                            <span style={{ color: isPositive ? 'var(--text-success, #22c55e)' : m < 0 ? 'var(--text-danger, #ef4444)' : 'var(--text-muted)' }}>
                                                                                {m.toFixed(1)}%
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {Number(newItem.sell_price) > 0 && (
                                                            <div style={{
                                                                marginTop: 'var(--space-12)',
                                                                padding: 'var(--space-12)',
                                                                borderRadius: 'var(--radius-md)',
                                                                background: 'var(--surface-2, #1e1e2e)',
                                                                border: '1px dashed var(--border)',
                                                                fontSize: 'var(--text-xs)',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: 'var(--space-8)'
                                                            }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Pricing Summary</span>
                                                                    {(() => {
                                                                        const cp = Number(newItem.cost_price) || 0;
                                                                        const gst = Number(newItem.gst_rate) || 0;
                                                                        const mrp = Number(newItem.sell_price) || 0;
                                                                        const discPct = Number(newItem.discount) || 0;
                                                                        const discAmount = mrp * (discPct / 100);
                                                                        const effectiveSellPrice = Math.max(0, mrp - discAmount);
                                                                        const effectiveMargin = calculateMargin(cp, effectiveSellPrice, gst);

                                                                        if (effectiveMargin < 0) {
                                                                            return (
                                                                                <span style={{
                                                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                                                    color: '#ef4444',
                                                                                    padding: '2px 8px',
                                                                                    borderRadius: '12px',
                                                                                    fontWeight: 700,
                                                                                    fontSize: '10px'
                                                                                }}>
                                                                                    ⚠️ Selling at a loss
                                                                                </span>
                                                                            );
                                                                        } else if (effectiveMargin < 15) {
                                                                            return (
                                                                                <span style={{
                                                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                                                    color: '#f59e0b',
                                                                                    padding: '2px 8px',
                                                                                    borderRadius: '12px',
                                                                                    fontWeight: 700,
                                                                                    fontSize: '10px'
                                                                                }}>
                                                                                    ⚠️ Thin margin
                                                                                </span>
                                                                            );
                                                                        } else {
                                                                            return (
                                                                                <span style={{
                                                                                    background: 'rgba(34, 197, 94, 0.15)',
                                                                                    color: '#22c55e',
                                                                                    padding: '2px 8px',
                                                                                    borderRadius: '12px',
                                                                                    fontWeight: 700,
                                                                                    fontSize: '10px'
                                                                                }}>
                                                                                    ✓ Healthy margin
                                                                                </span>
                                                                            );
                                                                        }
                                                                    })()}
                                                                </div>

                                                                {(() => {
                                                                    const cp = Number(newItem.cost_price) || 0;
                                                                    const gst = Number(newItem.gst_rate) || 0;
                                                                    const mrp = Number(newItem.sell_price) || 0;
                                                                    const discPct = Number(newItem.discount) || 0;
                                                                    const discAmount = mrp * (discPct / 100);
                                                                    const effectiveSellPrice = Math.max(0, mrp - discAmount);
                                                                    const effectiveMargin = calculateMargin(cp, effectiveSellPrice, gst);

                                                                    return (
                                                                        <>
                                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-8)' }}>
                                                                                <div>
                                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Base MRP:</div>
                                                                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>₹{mrp.toFixed(2)}</div>
                                                                                </div>
                                                                                <div>
                                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Discount ({discPct}%):</div>
                                                                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: discAmount > 0 ? '#ef4444' : 'inherit' }}>
                                                                                        -₹{discAmount.toFixed(2)}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-8)' }}>
                                                                                <div>
                                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Effective Price:</div>
                                                                                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-success, #22c55e)' }}>
                                                                                        ₹{effectiveSellPrice.toFixed(2)}
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Effective Margin:</div>
                                                                                    <div style={{
                                                                                        fontSize: 'var(--text-md)',
                                                                                        fontWeight: 700,
                                                                                        color: effectiveMargin > 15 ? '#22c55e' : effectiveMargin < 0 ? '#ef4444' : '#f59e0b'
                                                                                    }}>
                                                                                        {effectiveMargin.toFixed(1)}%
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* ── Section: Vendor Info ── */}
                                        <div style={{
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                padding: 'var(--space-12) var(--space-16)',
                                                background: 'var(--surface-alt)',
                                                borderBottom: '1px solid var(--border)',
                                                display: 'flex', alignItems: 'center', gap: 'var(--space-8)'
                                            }}>
                                                <div style={{ width: 3, height: 16, borderRadius: 2, background: 'var(--info)' }} />
                                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                                                    Vendor &amp; Sourcing
                                                </span>
                                            </div>
                                            <div style={{ padding: 'var(--space-16)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
                                                    <div>
                                                        <label className="label">Vendor Name</label>
                                                        <input
                                                            name="addItemVendorName"
                                                            className="input-field"
                                                            placeholder="Where do we buy this?"
                                                            value={newItem.vendor_name}
                                                            onChange={(e) => setNewItem({ ...newItem, vendor_name: e.target.value })}
                                                            style={{ marginTop: 'var(--space-6)' }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label">Vendor Contact</label>
                                                        <input
                                                            name="addItemVendorContact"
                                                            className="input-field"
                                                            placeholder="Phone or Email"
                                                            value={newItem.vendor_contact}
                                                            onChange={(e) => setNewItem({ ...newItem, vendor_contact: e.target.value })}
                                                            style={{ marginTop: 'var(--space-6)' }}
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
                                                        style={{ marginTop: 'var(--space-6)' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </form>
                            </div>

                            {/* ── Sticky Footer ── */}
                            <div className="modal-footer" style={{
                                padding: 'var(--space-16) var(--space-24)',
                                borderTop: '1px solid var(--border)',
                                background: 'var(--surface)',
                                display: 'flex', gap: 'var(--space-12)', flexShrink: 0,
                                justifyContent: 'flex-end', alignItems: 'center'
                            }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowAddModal(false)}
                                    style={{ minWidth: 100 }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="add-inventory-item-form"
                                    className="btn btn-primary"
                                    disabled={saving}
                                    style={{ minWidth: 140, gap: 'var(--space-8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    {saving ? (
                                        <>
                                            <span style={{
                                                width: 14, height: 14, border: '2px solid currentColor',
                                                borderTopColor: 'transparent', borderRadius: '50%',
                                                display: 'inline-block', animation: 'spin 0.6s linear infinite'
                                            }} />
                                            Creating...
                                        </>
                                    ) : (
                                        <>📦 Create Item</>
                                    )}
                                </button>
                            </div>

                        </div>
                    </div>
                )
            }

            {
                showEditModal && selectedItem && (
                    <div className="modal-backdrop">
                        <div className="modal modal--large">
                            <div className="modal-header">
                                <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    Edit Inventory Item
                                    <span style={{ fontSize: '12px', fontWeight: 400, opacity: 0.4, marginLeft: '4px' }}>
                                        #{selectedItem.id}
                                    </span>
                                </h2>
                                <button
                                    className="modal-close modal-close--static"
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setSelectedItem(null);
                                    }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form id="editForm" onSubmit={handleUpdateItem} style={{ display: 'contents' }}>
                                <div className="modal-body">
                                    {/* Rematch with Product Library */}
                                    <div className="mb-20">
                                        <label className="label" style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            Rematch with Product Library
                                            <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.4 }}>(Optional)</span>
                                        </label>
                                        <div style={{ position: 'relative', marginTop: '6px' }}>
                                            <input
                                                name="editProductSearch"
                                                className="input-field"
                                                style={{ paddingLeft: '32px' }}
                                                placeholder="Search product from library..."
                                                value={productSearch}
                                                onChange={(e) => setProductSearch(e.target.value)}
                                            />
                                            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, pointerEvents: 'none' }} />
                                        </div>
                                        {filteredProducts.length > 0 && (
                                            <div className="dropdown mt-4">
                                                {filteredProducts.map(p => (
                                                    <div role="button" tabIndex={0} key={p.id} className="dropdown-item" onClick={() => selectProduct(p, true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProduct(p, true); } }}>
                                                        <div className="text-sm font-medium">{p.name}</div>
                                                        <div className="muted text-xs">{p.category_name} &rsaquo; {p.subcategory_name}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Section: Basic Information */}
                                    <div className="mb-20" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', background: 'var(--surface-2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>&#9998;</div>
                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Basic Information</span>
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
                                        </div>
                                        <div className="row gap-sm" style={{ marginTop: '10px' }}>
                                            <div style={{ width: '80px' }}>
                                                <label className="label">Source</label>
                                                 <input
                                                     name="editItemSource"
                                                     className="input-field"
                                                     maxLength={10}
                                                     placeholder="ABC"
                                                    value={selectedItem.source_code || ''}
                                                    onChange={async (e) => {
                                                        const val = e.target.value.toUpperCase();
                                                        const newSku = `${val}-${selectedItem.model_name}-${selectedItem.size_code}`.replace(/-+$/, '').replace(/^-+/, '');
                                                        const updates = { source_code: val, sku: newSku };
                                                        if (val.length === 3 && !selectedItem.vendor_name) {
                                                            try {
                                                                const res = await api.get('/vendors', { params: { search: val, limit: 1 } });
                                                                const vendor = res.data?.data?.[0] || res.data?.[0];
                                                                if (vendor?.name) updates.vendor_name = vendor.name;
                                                            } catch (_) {}
                                                        }
                                                        setSelectedItem({ ...selectedItem, ...updates });
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
                                        <div className="row gap-sm" style={{ marginTop: '10px' }}>
                                            <div className="flex-1">
                                                <label className="label">Category</label>
                                                <select
                                                    name="editItemCategory"
                                                    className="input-field"
                                                    value={selectedItem.category}
                                                    onChange={(e) => setSelectedItem({ ...selectedItem, category: e.target.value })}
                                                >
                                                    <option value="">Select Category</option>
                                                    {(Array.isArray(hierarchy) ? hierarchy : []).map(cat => (
                                                        <optgroup key={cat.id} label={cat.name}>
                                                            {(cat.subcategories || []).map(sub => (
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
                                    </div>

                                    {/* Section: Pricing & Tax */}
                                    <div className="mb-20" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', background: 'var(--surface-2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'var(--accent-2, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>&#8377;</div>
                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Pricing &amp; Tax</span>
                                        </div>
                                        <div className="row gap-sm mb-12">
                                            <div className="flex-1">
                                                <label className="label">Cost Price (&#8377;)</label>
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
                                            <div className="flex-1">
                                                <label className="label">GST Rate (%)</label>
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
                                                <label className="label">Discount (%)</label>
                                                <input
                                                    name="editItemDiscount"
                                                    type="number"
                                                    className="input-field"
                                                    value={selectedItem.discount}
                                                    onChange={(e) => setSelectedItem({ ...selectedItem, discount: e.target.value })}
                                                    min="0"
                                                />
                                                <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                    {[0, 5, 10, 15, 20, 25].map(val => (
                                                        <button
                                                            key={val}
                                                            type="button"
                                                            className="btn btn-xs"
                                                            onClick={() => setSelectedItem({ ...selectedItem, discount: String(val) })}
                                                            style={{
                                                                padding: '2px 8px',
                                                                fontSize: '11px',
                                                                borderRadius: '4px',
                                                                border: '1px solid var(--border)',
                                                                background: Number(selectedItem.discount || 0) === val ? 'var(--accent)' : 'var(--surface-alt)',
                                                                color: Number(selectedItem.discount || 0) === val ? 'var(--on-accent)' : 'var(--text)',
                                                                cursor: 'pointer',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            {val}%
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="row gap-sm">
                                            <div className="flex-1">
                                                <label className="label">Sell Price (MRP) (&#8377;)</label>
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
                                            <div className="flex-1">
                                                <label className="label">Profit Margin</label>
                                                <div className="input-field" style={{ 
                                                    background: 'var(--surface-alt)', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    fontWeight: 600,
                                                    border: '1px solid var(--border)',
                                                    cursor: 'default'
                                                }}>
                                                    {(() => {
                                                        const m = calculateMargin(selectedItem.cost_price, selectedItem.sell_price, selectedItem.gst_rate);
                                                        const isPositive = m > 0;
                                                        return (
                                                            <span style={{ color: isPositive ? 'var(--text-success, #22c55e)' : m < 0 ? 'var(--text-danger, #ef4444)' : 'var(--text-muted)' }}>
                                                                {m.toFixed(1)}%
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                        {Number(selectedItem.sell_price) > 0 && (
                                            <div style={{
                                                marginTop: 'var(--space-12)',
                                                padding: 'var(--space-12)',
                                                borderRadius: 'var(--radius-md)',
                                                background: 'var(--surface-2, #1e1e2e)',
                                                border: '1px dashed var(--border)',
                                                fontSize: 'var(--text-xs)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: 'var(--space-8)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Pricing Summary</span>
                                                    {(() => {
                                                        const cp = Number(selectedItem.cost_price) || 0;
                                                        const gst = Number(selectedItem.gst_rate) || 0;
                                                        const mrp = Number(selectedItem.sell_price) || 0;
                                                        const discPct = Number(selectedItem.discount) || 0;
                                                        const discAmount = mrp * (discPct / 100);
                                                        const effectiveSellPrice = Math.max(0, mrp - discAmount);
                                                        const effectiveMargin = calculateMargin(cp, effectiveSellPrice, gst);

                                                        if (effectiveMargin < 0) {
                                                            return (
                                                                <span style={{
                                                                    background: 'rgba(239, 68, 68, 0.15)',
                                                                    color: '#ef4444',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '12px',
                                                                    fontWeight: 700,
                                                                    fontSize: '10px'
                                                                }}>
                                                                    ⚠️ Selling at a loss
                                                                </span>
                                                            );
                                                        } else if (effectiveMargin < 15) {
                                                            return (
                                                                <span style={{
                                                                    background: 'rgba(245, 158, 11, 0.15)',
                                                                    color: '#f59e0b',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '12px',
                                                                    fontWeight: 700,
                                                                    fontSize: '10px'
                                                                }}>
                                                                    ⚠️ Thin margin
                                                                </span>
                                                            );
                                                        } else {
                                                            return (
                                                                <span style={{
                                                                    background: 'rgba(34, 197, 94, 0.15)',
                                                                    color: '#22c55e',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '12px',
                                                                    fontWeight: 700,
                                                                    fontSize: '10px'
                                                                }}>
                                                                    ✓ Healthy margin
                                                                </span>
                                                            );
                                                        }
                                                    })()}
                                                </div>

                                                {(() => {
                                                    const cp = Number(selectedItem.cost_price) || 0;
                                                    const gst = Number(selectedItem.gst_rate) || 0;
                                                    const mrp = Number(selectedItem.sell_price) || 0;
                                                    const discPct = Number(selectedItem.discount) || 0;
                                                    const discAmount = mrp * (discPct / 100);
                                                    const effectiveSellPrice = Math.max(0, mrp - discAmount);
                                                    const effectiveMargin = calculateMargin(cp, effectiveSellPrice, gst);

                                                    return (
                                                        <>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-8)' }}>
                                                                <div>
                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Base MRP:</div>
                                                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>₹{mrp.toFixed(2)}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Discount ({discPct}%):</div>
                                                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: discAmount > 0 ? '#ef4444' : 'inherit' }}>
                                                                        -₹{discAmount.toFixed(2)}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-8)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-8)' }}>
                                                                <div>
                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Effective Price:</div>
                                                                    <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-success, #22c55e)' }}>
                                                                        ₹{effectiveSellPrice.toFixed(2)}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Effective Margin:</div>
                                                                    <div style={{
                                                                        fontSize: 'var(--text-md)',
                                                                        fontWeight: 700,
                                                                        color: effectiveMargin > 15 ? '#22c55e' : effectiveMargin < 0 ? '#ef4444' : '#f59e0b'
                                                                    }}>
                                                                        {effectiveMargin.toFixed(1)}%
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Section: Stock & Supply */}
                                    <div className="mb-20" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', background: 'var(--surface-2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>&#9776;</div>
                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Stock &amp; Supply</span>
                                        </div>
                                        {branches && branches.length > 0 ? (
                                            <div className="row gap-sm" style={{ marginBottom: '10px' }}>
                                                <div className="flex-1">
                                                    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: '1px', background: 'var(--border)' }}>
                                                            <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.6, background: 'var(--surface)' }}>Branch</div>
                                                            <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.6, textAlign: 'right', background: 'var(--surface)' }}>Qty</div>
                                                            <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', opacity: 0.6, background: 'var(--surface)' }}>Branch</div>
                                                            {selectedItem.branch_stocks?.map((bs, index) => (
                                                                <div key={bs.branch_id} className="row items-center justify-between" style={{ padding: '6px 12px', background: index % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)', gridColumn: index % 2 === 0 ? '1 / 2' : '3 / 4', borderTop: '1px solid var(--border)' }}>
                                                                    <span className="text-xs font-medium">{bs.branch_name}</span>
                                                                    <input
                                                                        type="number"
                                                                        className="input-field text-right"
                                                                        style={{ width: '70px', minHeight: '28px', fontSize: '12px', padding: '2px 6px' }}
                                                                        value={bs.quantity}
                                                                        min="0"
                                                                        onChange={(e) => {
                                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                                            const updatedStocks = [...(selectedItem.branch_stocks || [])];
                                                                            updatedStocks[index] = { ...bs, quantity: val };
                                                                            const totalQty = updatedStocks.reduce((sum, s) => sum + s.quantity, 0);
                                                                            setSelectedItem({
                                                                                ...selectedItem,
                                                                                branch_stocks: updatedStocks,
                                                                                quantity: String(totalQty)
                                                                            });
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="row items-center justify-between" style={{ padding: '8px 12px', borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
                                                            <span className="text-xs font-semibold">Total Stock</span>
                                                            <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                                                                {selectedItem.quantity || '0'} {selectedItem.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="row gap-sm" style={{ marginBottom: '10px' }}>
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
                                            </div>
                                        )}
                                        <div className="row gap-sm">
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
                                    </div>

                                    {/* Section: Supplier */}
                                    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-16)', background: 'var(--surface-2)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>&#9741;</div>
                                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Supplier</span>
                                        </div>
                                        <div className="row gap-sm" style={{ marginBottom: '10px' }}>
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
                                    </div>
                                </div>
                            </form>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(false); setSelectedItem(null); }}>
                                    Cancel
                                </button>
                                <button type="submit" form="editForm" className="btn btn-primary" disabled={saving} style={{ minWidth: '120px' }}>
                                    {saving ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                            <span className="spinner" />
                                            Saving...
                                        </span>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showPrintModal && (
                    <div className="modal-backdrop">
                        <div className="modal" style={{ maxWidth: '560px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-xl)' }}>

                            {/* ── Header ── */}
                            <div className="modal-header" style={{ padding: 'var(--space-20) var(--space-24)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                                    <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--accent-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏷️</div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>Label Quantities</h2>
                                        <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Set how many labels to print for each item</p>
                                    </div>
                                </div>
                                <button className="modal-close modal-close--static" onClick={() => setShowPrintModal(false)} style={{ position: 'static', flexShrink: 0 }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* ── Body ── */}
                            <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-20) var(--space-24)' }}>

                                {/* Quick-action buttons */}
                                <div style={{ display: 'flex', gap: 'var(--space-8)', marginBottom: 'var(--space-16)', flexWrap: 'wrap' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={applyStockQuantitiesForSelected} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Layers size={14} /> Use Stock Qty
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => {
                                            const reset = {};
                                            printItemIds.forEach((id) => { reset[id] = 1; });
                                            setPrintQuantities(reset);
                                        }}
                                    >
                                        Reset to 1
                                    </button>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => setShowAddItems(prev => !prev)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}
                                    >
                                        <Plus size={14} /> Add Items
                                    </button>
                                </div>

                                {/* Inline Add Items panel */}
                                {showAddItems && (
                                    <div style={{
                                        marginBottom: 'var(--space-12)',
                                        padding: 'var(--space-12)',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'var(--surface-alt)',
                                        border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', marginBottom: 'var(--space-8)' }}>
                                            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                            <input
                                                type="text"
                                                className="input-field"
                                                placeholder="Search items to add..."
                                                value={addItemSearch}
                                                onChange={(e) => setAddItemSearch(e.target.value)}
                                                style={{ flex: 1, padding: '6px 10px', fontSize: 'var(--text-xs)' }}
                                                autoFocus
                                            />
                                            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddItems(false)} style={{ flexShrink: 0 }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                                            {items
                                                .filter(i => !printItemIds.includes(i.id) && !isPaperCategory(i.category))
                                                .filter(i => !addItemSearch || i.name?.toLowerCase().includes(addItemSearch.toLowerCase()) || i.sku?.toLowerCase().includes(addItemSearch.toLowerCase()))
                                                .slice(0, 50)
                                                .map(item => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => {
                                                            setPrintItemIds(prev => [...prev, item.id]);
                                                            setPrintQuantities(prev => ({ ...prev, [item.id]: 1 }));
                                                            setAddItemSearch('');
                                                        }}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: 'var(--space-8)',
                                                            padding: 'var(--space-8) var(--space-10)',
                                                            borderRadius: 'var(--radius-sm)',
                                                            border: 'none',
                                                            background: 'var(--surface)',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            fontSize: 'var(--text-xs)',
                                                            color: 'var(--text-primary)',
                                                            transition: 'background 0.12s',
                                                            width: '100%',
                                                        }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--accent-alpha)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
                                                    >
                                                        <Plus size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                                        {item.sku && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.sku}</span>}
                                                    </button>
                                                ))}
                                            {items.filter(i => !printItemIds.includes(i.id) && !isPaperCategory(i.category)).filter(i => !addItemSearch || i.name?.toLowerCase().includes(addItemSearch.toLowerCase()) || i.sku?.toLowerCase().includes(addItemSearch.toLowerCase())).length === 0 && (
                                                <div style={{ padding: 'var(--space-12)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No more items available</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Item rows */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
                                    {items.filter(i => printItemIds.includes(i.id)).map(item => (
                                        <div key={item.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: 'var(--space-14) var(--space-16)',
                                                borderRadius: 'var(--radius-md)',
                                                background: 'var(--surface)',
                                                border: '1px solid var(--border)',
                                                gap: 'var(--space-12)',
                                                transition: 'box-shadow var(--transition-fast)',
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 4 }}>{item.name}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
                                                    {item.sku && (
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--surface-alt)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                                            {item.sku}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                                        Stock: <strong style={{ color: 'var(--text-primary)' }}>{Number(item.quantity) || 0}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexShrink: 0 }}>
                                                {/* Stepper */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', padding: '4px', border: '1px solid var(--border)' }}>
                                                    <button
                                                        className="icon-button icon-button--sm"
                                                        style={{ width: 28, height: 28 }}
                                                        onClick={() => setPrintQuantities(prev => ({ ...prev, [item.id]: Math.max(1, (prev[item.id] || 1) - 1) }))}
                                                    >
                                                        <Minus size={13} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        className="input-field text-center"
                                                        style={{ width: 52, padding: '4px 2px', fontSize: 'var(--text-sm)', fontWeight: 700, border: 'none', background: 'transparent', outline: 'none' }}
                                                        min={1}
                                                        value={printQuantities[item.id] || 1}
                                                        onChange={(e) => setPrintQuantities(prev => ({ ...prev, [item.id]: Math.max(1, Number(e.target.value) || 1) }))}
                                                    />
                                                    <button
                                                        className="icon-button icon-button--sm"
                                                        style={{ width: 28, height: 28 }}
                                                        onClick={() => setPrintQuantities(prev => ({ ...prev, [item.id]: (prev[item.id] || 1) + 1 }))}
                                                    >
                                                        <Plus size={13} />
                                                    </button>
                                                </div>
                                                {/* Remove button */}
                                                <button
                                                    className="icon-button icon-button--sm"
                                                    style={{ width: 28, height: 28, color: '#e63946' }}
                                                    onClick={() => {
                                                        setPrintItemIds(prev => prev.filter(id => id !== item.id));
                                                        setPrintQuantities(prev => {
                                                            const next = { ...prev };
                                                            delete next[item.id];
                                                            return next;
                                                        });
                                                    }}
                                                    title="Remove item"
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {printItemIds.length === 0 && (
                                    <div style={{ padding: 'var(--space-24)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                                        No items selected. Click <strong>"Add Items"</strong> to add items.
                                    </div>
                                )}

                                {/* Summary bar */}
                                {(() => {
                                    const totalLabels = Object.values(printQuantities).reduce((a, b) => a + (b || 1), 0);
                                    const pagesNeeded = Math.ceil(totalLabels / 48);
                                    return (
                                        <div style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            marginTop: 'var(--space-16)',
                                            padding: 'var(--space-12) var(--space-16)',
                                            background: 'var(--accent-alpha)',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--accent-light)',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
                                                <Package size={15} style={{ color: 'var(--text-secondary)' }} />
                                                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                                    <strong style={{ color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}>{totalLabels}</strong> label{totalLabels !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
                                                <FileText size={15} style={{ color: 'var(--text-secondary)' }} />
                                                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                                    <strong style={{ color: 'var(--text-primary)' }}>{pagesNeeded}</strong> A4 page{pagesNeeded !== 1 ? 's' : ''} <span style={{ color: 'var(--text-muted)' }}>(48/page)</span>
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="modal-footer" style={{ padding: 'var(--space-16) var(--space-24)', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 'var(--space-10)', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setShowPrintModal(false)} disabled={printingLabel}>Cancel</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={generatePDF}
                                    disabled={printingLabel || printItemIds.length === 0}
                                    style={{ minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-8)', fontWeight: 700 }}
                                >
                                    {printingLabel ? (
                                        <Loader2 className="animate-spin" size={16} />
                                    ) : (
                                        <Printer size={16} />
                                    )}
                                    {printingLabel ? 'Generating…' : 'Generate Label PDF'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            {/* ── Print Progress Modal Overlay ── */}
            {printingLabel && (
                <div className="modal-backdrop" style={{ zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content" style={{ width: '420px', padding: 'var(--space-24)', borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-16)', background: 'var(--surface-overlay)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                            <Loader2 className="animate-spin" size={20} style={{ color: 'var(--primary)' }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>Generating Labels</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Please wait, do not close this tab</div>
                            </div>
                        </div>
                        
                        {printTotal > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    <span>Progress</span>
                                    <span>{printCompleted} of {printTotal} ({Math.round((printCompleted / printTotal) * 100)}%)</span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.round((printCompleted / printTotal) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary) 0%, #a855f7 100%)', transition: 'width 0.2s ease' }} />
                                </div>
                            </div>
                        )}
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-8)' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Running chunk-batched PDF generation…</span>
                        </div>
                    </div>
                </div>
            )}

            {showSelectPrintModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-xl)' }}>

                        <div className="modal-header" style={{ padding: 'var(--space-20) var(--space-24)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                                <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--accent-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🖨️</div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>Print Labels</h2>
                                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Select items to print labels. Quantities are set in the next step.</p>
                                </div>
                            </div>
                            <button className="modal-close modal-close--static" onClick={() => setShowSelectPrintModal(false)} style={{ position: 'static', flexShrink: 0 }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-20) var(--space-24)', display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)',
                                padding: '0 var(--space-14)', borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)', background: 'var(--surface-alt)',
                            }}>
                                <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                <input
                                    placeholder="Search by name or SKU…"
                                    value={selectPrintSearch}
                                    onChange={e => {
                                        setSelectPrintSearch(e.target.value);
                                    }}
                                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', padding: '11px 0', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}
                                    autoFocus
                                />
                                {selectPrintSearch && (
                                    <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 4 }}
                                        onClick={() => { setSelectPrintSearch(''); }}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-8)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    <input type="checkbox"
                                        onChange={(e) => {
                                            const filtered = (allPrintItems.length ? allPrintItems : items).filter(item => {
                                                const q = selectPrintSearch.toLowerCase();
                                                if (!q) return !isPaperCategory(item.category);
                                                return !isPaperCategory(item.category) &&
                                                    ((item.name || '').toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q));
                                            });
                                            if (e.target.checked) setSelectPrintSelectedIds(filtered.map(i => i.id));
                                            else setSelectPrintSelectedIds([]);
                                        }}
                                        checked={(() => {
                                            const filtered = (allPrintItems.length ? allPrintItems : items).filter(item => {
                                                const q = selectPrintSearch.toLowerCase();
                                                if (!q) return !isPaperCategory(item.category);
                                                return !isPaperCategory(item.category) &&
                                                    ((item.name || '').toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q));
                                            });
                                            return filtered.length > 0 && filtered.every(i => selectPrintSelectedIds.includes(i.id));
                                        })()}
                                    /> Select All ({selectPrintSelectedIds.length} selected)
                                </label>
                            </div>

                            <div style={{
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                maxHeight: '320px',
                                overflowY: 'auto',
                            }}>
                                {(() => {
                                    if (allPrintItemsLoading) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: 'var(--space-32) var(--space-16)', color: 'var(--text-muted)' }}>
                                                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto var(--space-10)' }} />
                                                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>Loading items…</div>
                                            </div>
                                        );
                                    }
                                    const sourceItems = allPrintItems.length ? allPrintItems : items;
                                    const filtered = sourceItems
                                        .filter(item => {
                                            const q = selectPrintSearch.toLowerCase();
                                            if (!q) return !isPaperCategory(item.category);
                                            return !isPaperCategory(item.category) &&
                                                ((item.name || '').toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q));
                                        })
                                    return filtered.length > 0 ? filtered.map((item, idx) => {
                                        const isChecked = selectPrintSelectedIds.includes(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                style={{
                                                    padding: 'var(--space-10) var(--space-16)',
                                                    display: 'flex', alignItems: 'center', gap: 'var(--space-12)',
                                                    background: isChecked ? 'var(--accent-alpha)' : idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                                                    borderBottom: '1px solid var(--border-subtle)',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => {
                                                    setSelectPrintSelectedIds(prev =>
                                                        prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
                                                    );
                                                }}
                                            >
                                                <input type="checkbox" checked={isChecked} readOnly style={{ flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 2 }}>{item.name}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
                                                        {item.sku && (
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>
                                                                {item.sku}
                                                            </span>
                                                        )}
                                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                                            Stock: <strong style={{ color: Number(item.quantity) > 0 ? 'var(--success)' : 'var(--danger)' }}>{Number(item.quantity) || 0}</strong>
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }) : (
                                        <div style={{ textAlign: 'center', padding: 'var(--space-32) var(--space-16)', color: 'var(--text-muted)' }}>
                                            <Package size={28} style={{ opacity: 0.25, marginBottom: 'var(--space-10)' }} />
                                            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>No items found</div>
                                            <div style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>Try a different search term</div>
                                            {selectPrintSearch && (
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    style={{ marginTop: 12 }}
                                                    onClick={() => navigate(`/dashboard/products?addProduct=1&name=${encodeURIComponent(selectPrintSearch)}`)}
                                                >
                                                    <Plus size={14} />
                                                    Add "{selectPrintSearch}" to Product Library
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="modal-footer" style={{ padding: 'var(--space-16) var(--space-24)', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 'var(--space-10)', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowSelectPrintModal(false)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                disabled={selectPrintSelectedIds.length === 0 || printingLabel}
                                onClick={() => {
                                    if (selectPrintSelectedIds.length === 0) return;
                                    setSelectedIds(selectPrintSelectedIds);
                                    setPrintQuantities(Object.fromEntries(selectPrintSelectedIds.map(id => [id, 1])));
                                    setShowSelectPrintModal(false);
                                    setShowPrintModal(true);
                                }}
                                style={{ minWidth: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-8)', fontWeight: 700 }}
                            >
                                <Printer size={16} />
                                Print {selectPrintSelectedIds.length} item{selectPrintSelectedIds.length !== 1 ? 's' : ''}
                            </button>
                        </div>
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
                <div className="modal-backdrop" style={{ zIndex: 'var(--z-modal-high)' }}>
                    <div className="modal" style={{ maxWidth: '450px', padding: 'var(--space-24)' }}>
                        <button className="modal-close" onClick={() => setShowRestockModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16" style={{ marginBottom: 'var(--space-12)' }}>Restock Supply</h2>
                        {restockData.name && (
                            <div className="muted text-xs mb-16" style={{ marginBottom: 'var(--space-16)', fontWeight: 500 }}>
                                Item: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{restockData.name}</span>
                            </div>
                        )}
                        {restockData.has_disabled_product && restockData.disabled_product_id && (
                            <div style={{ padding: '10px 12px', marginBottom: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid var(--warning)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>
                                    Linked product is <strong>disabled</strong>. Stock will be added but product won't appear in billing.
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline"
                                    onClick={async () => {
                                        try {
                                            await api.patch(`/products/${restockData.disabled_product_id}/toggle-active`);
                                            toast.success('Product enabled');
                                            setShowRestockModal(false);
                                            if (detailItem) openItemDetail(detailItem.id);
                                        } catch (err) {
                                            toast.error(err.response?.data?.message || 'Failed to enable product');
                                        }
                                    }}
                                >
                                    Enable Product
                                </button>
                            </div>
                        )}
                        <form onSubmit={handleRestock} className="stack-md" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-16)' }}>
                            <div>
                                <label className="label" style={{ marginBottom: 'var(--space-6)', display: 'block' }}>Quantity Received</label>
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
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-12)' }}>
                                <div>
                                    <label className="label" style={{ marginBottom: 'var(--space-6)', display: 'block' }}>New Cost Price</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                                        <input
                                            name="restockCost"
                                            type="number"
                                            step="0.01"
                                            className="input-field"
                                            style={{ paddingLeft: 24 }}
                                            value={restockData.cost}
                                            onChange={e => setRestockData({ ...restockData, cost: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="label" style={{ marginBottom: 'var(--space-6)', display: 'block' }}>Sell Price (MRP)</label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', pointerEvents: 'none' }}>₹</span>
                                        <input
                                            name="restockSellPrice"
                                            type="number"
                                            step="0.01"
                                            className="input-field"
                                            style={{ paddingLeft: 24 }}
                                            value={restockData.sell_price}
                                            onChange={e => setRestockData({ ...restockData, sell_price: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                padding: 'var(--space-12)',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--surface-alt)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)' }}>Estimated Margin:</span>
                                {(() => {
                                    const m = calculateMargin(restockData.cost, restockData.sell_price, restockData.gst_rate);
                                    const isPositive = m > 0;
                                    return (
                                        <span style={{ 
                                            fontSize: 'var(--text-sm)', 
                                            fontWeight: 700, 
                                            color: isPositive ? 'var(--text-success, #22c55e)' : m < 0 ? 'var(--text-danger, #ef4444)' : 'var(--text-muted)' 
                                        }}>
                                            {m.toFixed(1)}%
                                        </span>
                                    );
                                })()}
                            </div>
                            <div>
                                <label className="label" style={{ marginBottom: 'var(--space-6)', display: 'block' }}>Notes (Optional)</label>
                                <textarea
                                    name="restockNotes"
                                    className="input-field"
                                    placeholder="e.g., Delivery delayed by 2 days"
                                    value={restockData.notes}
                                    onChange={e => setRestockData({ ...restockData, notes: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary btn--full" style={{ marginTop: 'var(--space-8)' }} disabled={saving}>
                                {saving ? 'Restocking...' : 'Log Restock'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showSmartUpload && (
                <SmartBillUpload
                    defaultDocumentType="Vendor Bill"
                    defaultRelatedTab="vendors"
                    onClose={() => setShowSmartUpload(false)}
                    onSuccess={() => {
                        setShowSmartUpload(false);
                        fetchInventory();
                        toast.success('Bill uploaded — stock and expenses updated!');
                    }}
                    onError={() => toast.error('Bill upload failed')}
                />
            )}

            

            {/* Product Detail Dashboard Modal */}
            {showDetailModal && (
                <div role="button" tabIndex={0} className="modal-backdrop" onClick={() => { setShowDetailModal(false); setDetailItem(null); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowDetailModal(false); setDetailItem(null); } }}>
                    <div role="button" tabIndex={0} className="modal" style={{ maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                        <button className="modal-close" onClick={() => { setShowDetailModal(false); setDetailItem(null); }}>
                            <X size={22} />
                        </button>

                        {detailLoading ? (
                            <div className="text-center py-32">
                                <Loader2 className="animate-spin" size={32} />
                                <p className="muted mt-8">Loading item details...</p>
                            </div>
                        ) : detailItem ? (
                            <div>
                                {/* Header with image */}
                                <div className="row gap-lg items-start mb-24">
                                    {resolveImageSrc(detailItem) ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 120, flexShrink: 0 }}>
                                            <div style={{ width: 120, height: 120, borderRadius: 12, overflow: 'hidden', border: '2px solid var(--border)', background: 'var(--surface-alt)' }}>
                                                <SecureImage src={resolveImageSrc(detailItem)} alt={detailItem.name} loading="lazy" decoding="async" width="120" height="120" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                            <div style={{ marginTop: 8 }}>
                                                <span className="muted text-xs" style={{ fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', display: 'inline-block' }}>{getImageId(resolveImageSrc(detailItem))}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ width: 120, height: 120, borderRadius: 12, flexShrink: 0, border: '2px dashed var(--border)', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <ImageIcon size={40} className="muted" />
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <h2 className="section-title mb-4">{detailItem.name}</h2>
                                        {detailItem.sku && (
                                            <p className="text-sm muted mb-4" style={{ fontFamily: 'monospace', letterSpacing: '0.5px' }}>SKU: {detailItem.sku}</p>
                                        )}
                                        {/* Action buttons */}
                                        {isAdmin && (
                                            <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                                                {detailItem.linked_product_id && (
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const prodId = detailItem.linked_product_id;
                                                            navigate('/dashboard/products', { state: { editProductId: prodId } });
                                                        }}
                                                    >
                                                        <Edit2 size={14} style={{ marginRight: 6 }} /> Edit Product
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setRestockData({
                                                            id: detailItem.id,
                                                            quantity: '',
                                                            cost: detailItem.cost_price || 0,
                                                            sell_price: detailItem.sell_price || 0,
                                                            gst_rate: detailItem.gst_rate || 0,
                                                            name: detailItem.name,
                                                            notes: '',
                                                            has_disabled_product: detailItem.has_disabled_product,
                                                            disabled_product_id: detailItem.disabled_product_id
                                                        });
                                                        setShowRestockModal(true);
                                                    }}
                                                >
                                                    <Plus size={14} style={{ marginRight: 6 }} /> Add Stock
                                                </button>
                                            </div>
                                        )}
                                        <div className="row gap-sm mb-8">
                                            <span className={`badge ${getStatus(detailItem) === 'low' ? 'badge--warn' : 'badge--ok'}`}>
                                                {getStatus(detailItem) === 'low' ? 'Low Stock' : 'Stock OK'}
                                            </span>
                                            <span className="badge">{detailItem.item_type || 'Retail'}</span>
                                            {detailItem.linked_product_id && (
                                                <span className="badge badge--ok"><Link size={12} style={{ marginRight: 4 }} /> Linked</span>
                                            )}
                                            {detailItem.has_disabled_product && (
                                                <span className="badge badge--warn"><AlertTriangle size={12} style={{ marginRight: 4 }} /> Disabled Product</span>
                                            )}
                                        </div>
                                        {detailItem.has_disabled_product && detailItem.disabled_product_id && (
                                            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(245,158,11,0.1)', border: '1px solid var(--warning)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                                                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>
                                                    This item is linked to a <strong>disabled product</strong>. Stock operations will work but the product won't appear in the store or billing.
                                                </span>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline"
                                                    onClick={async () => {
                                                        try {
                                                            await api.patch(`/products/${detailItem.disabled_product_id}/toggle-active`);
                                                            toast.success('Product enabled');
                                                            openItemDetail(detailItem.id);
                                                        } catch (err) {
                                                            toast.error(err.response?.data?.message || 'Failed to enable product');
                                                        }
                                                    }}
                                                >
                                                    Enable Product
                                                </button>
                                            </div>
                                        )}
                                        {(detailItem.product_category_name || detailItem.product_subcategory_name || detailItem.category) && (
                                            <p className="text-sm">
                                                {detailItem.product_category_name && <span className="muted">{detailItem.product_category_name}</span>}
                                                {detailItem.product_category_name && (detailItem.product_subcategory_name || detailItem.category) && <span className="muted"> › </span>}
                                                <span style={{ fontWeight: 500 }}>{detailItem.product_subcategory_name || detailItem.category}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Key Metrics Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                                    <div className="panel panel--tight" style={{ textAlign: 'center', padding: '12px 8px' }}>
                                        <Package size={18} className="text-primary mb-4" />
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{detailItem.quantity}</div>
                                        <div className="text-xs muted">In Stock ({detailItem.unit})</div>
                                    </div>
                                    {!isFrontOffice && (
                                        <div className="panel panel--tight" style={{ textAlign: 'center', padding: '12px 8px' }}>
                                            <BarChart3 size={18} className="text-primary mb-4" />
                                            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>₹{detailItem.stock_value}</div>
                                            <div className="text-xs muted">Stock Value</div>
                                        </div>
                                    )}
                                    {!isFrontOffice && detailItem.item_type !== 'Consumable' && (
                                        <div className="panel panel--tight" style={{ textAlign: 'center', padding: '12px 8px' }}>
                                            <TrendingUp size={18} className={Number(detailItem.margin) > 0 ? 'text-primary mb-4' : 'text-danger mb-4'} />
                                            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{detailItem.margin}%</div>
                                            <div className="text-xs muted">Margin</div>
                                        </div>
                                    )}
                                    {detailItem.item_type !== 'Consumable' && (
                                        <div className="panel panel--tight" style={{ textAlign: 'center', padding: '12px 8px' }}>
                                            <IndianRupee size={18} className="text-primary mb-4" />
                                            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>₹{Number(detailItem.sell_price || 0).toFixed(2)}</div>
                                            <div className="text-xs muted">Retail Price</div>
                                        </div>
                                    )}
                                </div>

                                {/* Pricing & Tax Details */}
                                <div className="panel panel--tight mb-16" style={{ background: 'var(--surface-alt)' }}>
                                    <h3 className="text-sm font-medium mb-12" style={{ fontWeight: 600 }}>{isFrontOffice ? 'Pricing' : 'Pricing & Tax'}</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                                        {detailItem.item_type !== 'Consumable' && (
                                            <div className="row justify-between">
                                                <span className="text-sm muted">Retail Price</span>
                                                <span className="text-sm" style={{ fontWeight: 500 }}>₹{Number(detailItem.sell_price || 0).toFixed(2)}</span>
                                            </div>
                                        )}
                                        <div className="row justify-between">
                                            <span className="text-sm muted">GST Rate</span>
                                            <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.gst_rate}%</span>
                                        </div>
                                        {!isFrontOffice && (
                                            <div className="row justify-between">
                                                <span className="text-sm muted">GST Amount</span>
                                                <span className="text-sm" style={{ fontWeight: 500 }}>₹{detailItem.gst_amount}</span>
                                            </div>
                                        )}
                                        {!isFrontOffice && detailItem.item_type !== 'Consumable' && (
                                            <>
                                                <div className="row justify-between">
                                                    <span className="text-sm muted">Discount</span>
                                                    <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.discount || 0}%</span>
                                                </div>
                                                <div className="row justify-between">
                                                    <span className="text-sm muted">HSN Code</span>
                                                    <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.hsn || '-'}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Stock Details */}
                                <div className="panel panel--tight mb-16" style={{ background: 'var(--surface-alt)' }}>
                                    <h3 className="text-sm font-medium mb-12" style={{ fontWeight: 600 }}>Stock Details</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                                        <div className="row justify-between">
                                            <span className="text-sm muted">Current Stock</span>
                                            <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.quantity} {detailItem.unit}</span>
                                        </div>
                                        <div className="row justify-between">
                                            <span className="text-sm muted">Reorder Level</span>
                                            <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.reorder_level || 0} {detailItem.unit}</span>
                                        </div>
                                        {detailItem.source_code && (
                                            <div className="row justify-between">
                                                <span className="text-sm muted">Source Code</span>
                                                <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.source_code}</span>
                                            </div>
                                        )}
                                        {detailItem.model_name && (
                                            <div className="row justify-between">
                                                <span className="text-sm muted">Model</span>
                                                <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.model_name}</span>
                                            </div>
                                        )}
                                        {detailItem.size_code && (
                                            <div className="row justify-between">
                                                <span className="text-sm muted">Size</span>
                                                <span className="text-sm" style={{ fontWeight: 500 }}>{detailItem.size_code}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Vendor Info */}
                                {(detailItem.vendor_name || detailItem.vendor_contact || detailItem.purchase_link) && (
                                    <div className="panel panel--tight mb-16" style={{ background: 'var(--surface-alt)' }}>
                                        <h3 className="text-sm font-medium mb-12" style={{ fontWeight: 600 }}>Vendor Information</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                                            {detailItem.vendor_name && (
                                                <div className="row justify-between" style={{ gap: '16px' }}>
                                                    <span className="text-sm muted" style={{ whiteSpace: 'nowrap' }}>Vendor</span>
                                                    <span className="text-sm text-right" style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={detailItem.vendor_name}>{detailItem.vendor_name}</span>
                                                </div>
                                            )}
                                            {detailItem.vendor_contact && (
                                                <div className="row justify-between" style={{ gap: '16px' }}>
                                                    <span className="text-sm muted" style={{ whiteSpace: 'nowrap' }}>Contact</span>
                                                    <span className="text-sm text-right" style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={detailItem.vendor_contact}>{detailItem.vendor_contact}</span>
                                                </div>
                                            )}
                                            {detailItem.purchase_link && (
                                                <div className="row justify-between" style={{ gap: '16px' }}>
                                                    <span className="text-sm muted" style={{ whiteSpace: 'nowrap' }}>Purchase Link</span>
                                                    <a href={detailItem.purchase_link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary text-right" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={detailItem.purchase_link}>{detailItem.purchase_link}</a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Product Description */}
                                {detailItem.product_description && (
                                    <div className="panel panel--tight mb-16" style={{ background: 'var(--surface-alt)' }}>
                                        <h3 className="text-sm font-medium mb-8" style={{ fontWeight: 600 }}>Description</h3>
                                        <p className="text-sm">{detailItem.product_description}</p>
                                    </div>
                                )}

                                {/* Restock History */}
                                {!isFrontOffice && detailItem.restocks && detailItem.restocks.length > 0 && (
                                    <div className="panel panel--tight mb-16">
                                        <h3 className="text-sm font-medium mb-12" style={{ fontWeight: 600 }}>
                                            <ShoppingCart size={14} style={{ marginRight: 6 }} />
                                            Restock History
                                        </h3>
                                        <div className="table-scroll">
                                            <table className="table" style={{ fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Qty Received</th>
                                                        <th>Days Gap</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailItem.restocks.map((r, i) => (
                                                        <tr key={i}>
                                                            <td>{new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                                            <td>{r.quantity_received}</td>
                                                            <td>{r.days_since_last_reorder != null ? `${r.days_since_last_reorder}d` : '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Consumption History (Consumables) */}
                                {detailItem.consumptions && detailItem.consumptions.length > 0 && (
                                    <div className="panel panel--tight mb-16">
                                        <h3 className="text-sm font-medium mb-12" style={{ fontWeight: 600 }}>
                                            <Clock size={14} style={{ marginRight: 6 }} />
                                            Consumption History
                                        </h3>
                                        <div className="table-scroll">
                                            <table className="table" style={{ fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Qty Used</th>
                                                        <th>By</th>
                                                        <th>Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailItem.consumptions.map((c, i) => (
                                                        <tr key={i}>
                                                            <td>{new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                                            <td>{c.quantity_consumed}</td>
                                                            <td>{c.consumed_by || '-'}</td>
                                                            <td className="muted">{c.notes || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Movement Log */}
                                {detailItem.movements && detailItem.movements.length > 0 && (
                                    <div className="panel panel--tight mb-16">
                                        <h3 className="text-sm font-medium mb-12" style={{ fontWeight: 600 }}>
                                            <ArrowLeftRight size={14} style={{ marginRight: 6 }} />
                                            Stock Movement Log
                                        </h3>
                                        <div className="table-scroll">
                                            <table className="table" style={{ fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Type</th>
                                                        <th>Branch</th>
                                                        <th>Qty Change</th>
                                                        <th>Before</th>
                                                        <th>After</th>
                                                        <th>By</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailItem.movements.map((m, i) => (
                                                        <tr key={i}>
                                                            <td>{new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                                            <td><span className={`badge ${m.movement_type === 'Purchase' ? 'badge--ok' : m.movement_type === 'Consumption' ? 'badge--warn' : m.movement_type === 'Transfer In' ? '' : 'badge--error'}`}>{m.movement_type}</span></td>
                                                            <td>{m.branch_name || '-'}</td>
                                                            <td style={{ color: m.quantity_change > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</td>
                                                            <td>{m.quantity_before}</td>
                                                            <td>{m.quantity_after}</td>
                                                            <td>{m.created_by_name || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Timestamps */}
                                <div className="text-xs muted text-center mt-16">
                                    Added: {new Date(detailItem.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </div>

                                {/* Request Stock from Branch */}
                                <div className="mt-16" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, textAlign: 'center' }}>
                                    <button
                                        className="btn btn--secondary"
                                        onClick={() => { setShowDetailModal(false); openStockRequestModal(detailItem); }}
                                        style={{ gap: 8 }}
                                    >
                                        <ArrowLeftRight size={16} />
                                        Request Stock from Another Branch
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Stock Request Modal */}
            {showStockRequestModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setShowStockRequestModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-4">Request Stock from Another Branch</h2>
                        <p className="section-subtitle mb-16">
                            <strong>{stockRequestData.item_name}</strong>
                        </p>

                        {branchAvailabilityLoading ? (
                            <div className="text-center py-24"><Loader2 className="animate-spin" size={28} /></div>
                        ) : branchAvailability ? (
                            <form onSubmit={handleStockRequest} className="stack-md">
                                {branchAvailability.branches.length === 0 ? (
                                    <p className="muted text-center py-16">No other branches available.</p>
                                ) : (
                                    <div className="stack-sm">
                                        <div className="row gap-sm text-xs muted pb-4" style={{ borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                                            <span style={{ flex: 2 }}>Branch</span>
                                            <span style={{ flex: 1, textAlign: 'center' }}>Available Stock</span>
                                            <span style={{ flex: 1, textAlign: 'right' }}>Qty to Request</span>
                                        </div>
                                        {branchAvailability.branches.map(b => (
                                            <div key={b.id} className="row gap-sm items-center py-8" style={{ borderBottom: '1px solid var(--border-light)' }}>
                                                <div style={{ flex: 2 }}>
                                                    <div className="text-sm" style={{ fontWeight: 600 }}>{b.name}</div>
                                                    {b.short_name && <div className="text-xs muted">{b.short_name}</div>}
                                                </div>
                                                <div style={{ flex: 1, textAlign: 'center' }}>
                                                    <span className={`badge ${b.available_stock > 0 ? 'badge--ok' : 'badge--warn'}`}>
                                                        {b.available_stock} {b.unit}
                                                    </span>
                                                </div>
                                                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                                    <input
                                                        type="number"
                                                        className="input-field text-center"
                                                        style={{ width: '80px', padding: '4px 8px' }}
                                                        min="0"
                                                        max={b.available_stock || undefined}
                                                        placeholder="0"
                                                        value={branchRequestQtys[b.id] || ''}
                                                        onChange={e => setBranchRequestQtys(prev => ({ ...prev, [b.id]: e.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div>
                                    <label className="label">Notes (Optional)</label>
                                    <textarea
                                        className="input-field"
                                        placeholder="e.g., Urgent — needed for order #1234"
                                        value={stockRequestData.notes}
                                        onChange={e => setStockRequestData({ ...stockRequestData, notes: e.target.value })}
                                    />
                                </div>
                                {branchAvailability.branches.length > 0 && (
                                    <button type="submit" className="btn btn-primary btn--full" disabled={stockRequestSaving}>
                                        {stockRequestSaving ? 'Submitting…' : 'Submit Request'}
                                    </button>
                                )}
                            </form>
                        ) : (
                            <p className="muted text-center py-16">Failed to load branch data.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Stock Requests Panel */}
            {showStockRequestsPanel && (
                <div role="button" tabIndex={0} className="modal-backdrop" onClick={() => setShowStockRequestsPanel(false)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowStockRequestsPanel(false); } }}>
                    <div role="button" tabIndex={0} className="modal modal--large" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 'var(--radius-xl)' }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>

                        {/* ── Header ── */}
                        <div className="modal-header" style={{ padding: 'var(--space-20) var(--space-24)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-12)' }}>
                                <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--accent-alpha)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔄</div>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>Stock Transfer Requests</h2>
                                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Review, approve, and track inter-branch stock movements</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-10)' }}>
                                <button className="btn btn-ghost btn-sm" onClick={fetchStockRequests} disabled={stockRequestsLoading} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
                                    {stockRequestsLoading ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                                    Refresh
                                </button>
                                <button className="modal-close modal-close--static" onClick={() => setShowStockRequestsPanel(false)} style={{ position: 'static', flexShrink: 0 }}>
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* ── Status legend strip ── */}
                        <div style={{
                            padding: 'var(--space-12) var(--space-24)',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--surface-alt)',
                            display: 'flex', alignItems: 'center', gap: 'var(--space-20)', flexWrap: 'wrap',
                            flexShrink: 0,
                        }}>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status:</span>
                            {[
                                { label: 'Pending', bg: 'var(--warning-bg)', color: 'var(--warning)', desc: 'Awaiting approval' },
                                { label: 'Approved', bg: 'var(--success-bg)', color: 'var(--success)', desc: 'Ready to send' },
                                { label: 'Sent', bg: 'var(--info-bg)', color: 'var(--info)', desc: 'In transit' },
                                { label: 'Received', bg: 'var(--success-bg)', color: 'var(--success)', desc: 'Complete' },
                            ].map(s => (
                                <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                    <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-full)', background: s.bg, color: s.color, fontWeight: 700, fontSize: 'var(--text-2xs)' }}>{s.label}</span>
                                    {s.desc}
                                </span>
                            ))}
                        </div>

                        {/* ── Body ── */}
                        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-20) var(--space-24)' }}>
                            {stockRequestsLoading ? (
                                <div style={{ textAlign: 'center', padding: 'var(--space-48)' }}>
                                    <Loader2 className="animate-spin" size={32} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                                    <p style={{ marginTop: 'var(--space-12)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Loading requests…</p>
                                </div>
                            ) : stockRequests.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: 'var(--space-48)' }}>
                                    <div style={{ fontSize: 40, marginBottom: 'var(--space-12)' }}>📭</div>
                                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontWeight: 500 }}>No stock transfer requests yet.</p>
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>Requests from branches will appear here once submitted.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-10)' }}>
                                    {stockRequests.map(sr => {
                                        const statusMap = {
                                            Pending:  { bg: 'var(--warning-bg)',  color: 'var(--warning)',  label: 'Pending' },
                                            Approved: { bg: 'var(--success-bg)', color: 'var(--success)', label: 'Approved' },
                                            Sent:     { bg: 'var(--info-bg)',    color: 'var(--info)',    label: 'Sent' },
                                            Received: { bg: 'var(--success-bg)', color: 'var(--success)', label: 'Received' },
                                            Rejected: { bg: 'var(--error-bg)',   color: 'var(--danger)',  label: 'Rejected' },
                                        };
                                        const st = statusMap[sr.status] || statusMap.Pending;

                                        return (
                                            <div key={sr.id} style={{
                                                borderRadius: 'var(--radius-md)',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                overflow: 'hidden',
                                                transition: 'box-shadow var(--transition-fast)',
                                            }}>
                                                {/* Card top stripe by status */}
                                                <div style={{ height: 3, background: st.color, opacity: 0.6 }} />

                                                <div style={{ padding: 'var(--space-16) var(--space-18)' }}>
                                                    {/* Row 1: item name + status badge */}
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-12)', marginBottom: 'var(--space-10)' }}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                                                                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-primary)' }}>{sr.item_name}</span>
                                                                {sr.item_sku && (
                                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--surface-alt)', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                                                        {sr.item_sku}
                                                                    </span>
                                                                )}
                                                                <span style={{ padding: '2px 10px', borderRadius: 'var(--radius-full)', background: st.bg, color: st.color, fontSize: 'var(--text-xs)', fontWeight: 700 }}>
                                                                    {st.label}
                                                                </span>
                                                            </div>

                                                            {/* Transfer arrow */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sr.from_branch_name}</span>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                                                                    requests
                                                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'var(--surface-alt)', padding: '1px 8px', borderRadius: 4, border: '1px solid var(--border)' }}>
                                                                        {sr.quantity} pcs
                                                                    </span>
                                                                    from
                                                                </span>
                                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{sr.to_branch_name}</span>
                                                            </div>

                                                            {sr.notes && (
                                                                <div style={{ marginTop: 'var(--space-8)', padding: 'var(--space-8) var(--space-12)', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--border)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                                    "{sr.notes}"
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Action buttons */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', flexShrink: 0, alignItems: 'flex-end' }}>
                                                            {sr.status === 'Pending' && (
                                                                <>
                                                                    <button
                                                                        className="btn btn-sm"
                                                                        style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, minWidth: 90 }}
                                                                        onClick={() => handleReviewStockRequest(sr.id, 'approve')}
                                                                    >
                                                                        <Check size={13} /> Approve
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-sm"
                                                                        style={{ background: 'var(--error-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, minWidth: 90 }}
                                                                        onClick={() => handleReviewStockRequest(sr.id, 'reject')}
                                                                    >
                                                                        <X size={13} /> Reject
                                                                    </button>
                                                                </>
                                                            )}
                                                            {sr.status === 'Approved' && (
                                                                <button
                                                                    className="btn btn-primary btn-sm"
                                                                    style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 110 }}
                                                                    onClick={() => handleReviewStockRequest(sr.id, 'send')}
                                                                >
                                                                    <ArrowLeftRight size={13} /> Send Stock
                                                                </button>
                                                            )}
                                                            {sr.status === 'Sent' && (
                                                                <button
                                                                    className="btn btn-sm"
                                                                    style={{ background: 'var(--success)', color: 'var(--on-accent)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, minWidth: 110 }}
                                                                    onClick={() => handleReviewStockRequest(sr.id, 'receive')}
                                                                >
                                                                    <Check size={13} /> Receive Stock
                                                                </button>
                                                            )}
                                                            {sr.status === 'Received' && (
                                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <Check size={13} /> Complete
                                                                </span>
                                                            )}
                                                            {sr.status === 'Rejected' && (
                                                                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--danger)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                    <X size={13} /> Rejected
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: timeline metadata */}
                                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-8)', paddingTop: 'var(--space-10)', borderTop: '1px solid var(--border-subtle)' }}>
                                                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            🙋 <strong style={{ color: 'var(--text-secondary)' }}>{sr.created_by_name}</strong>
                                                            &nbsp;·&nbsp;{new Date(sr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                        {sr.resolved_by_name && (
                                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                                                · {sr.status === 'Rejected' ? '❌' : '✅'} {sr.status === 'Rejected' ? 'Rejected' : 'Approved'} by <strong style={{ color: 'var(--text-secondary)' }}>{sr.resolved_by_name}</strong>
                                                            </span>
                                                        )}
                                                        {sr.sent_by_name && (
                                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                                                · 📦 Sent by <strong style={{ color: 'var(--text-secondary)' }}>{sr.sent_by_name}</strong>
                                                            </span>
                                                        )}
                                                        {sr.received_by_name && (
                                                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                                                                · 🎉 Received by <strong style={{ color: 'var(--text-secondary)' }}>{sr.received_by_name}</strong>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: showScanner ? '' : 'none' }}>
                <ScannerErrorBoundary onClose={handleCloseScanner}>
                    <Suspense fallback={null}>
                        <ScannerModal
                            isOpen={showScanner}
                            onClose={handleCloseScanner}
                            onScan={handleScan}
                        />
                    </Suspense>
                </ScannerErrorBoundary>
            </div>
        </PageContainer>
    );
};

export default Inventory;

import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Printer, Trash2, Edit2, Plus, ArrowLeftRight, Minus, Package, Search, Bell, Camera, Filter, FileText, ChevronDown, CheckSquare, Layers, Download, Share2, Phone, ShoppingCart, List, Grid, X, Image as ImageIcon, Settings, IndianRupee, BarChart3, TrendingUp, RefreshCw, Loader2, Link, Clock, Check, QrCode } from 'lucide-react';
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
import './InventoryModern.css';

const ScannerModal = React.lazy(() => import('../components/ScannerModal'));
import ScannerErrorBoundary from '../components/ScannerErrorBoundary';
import PageContainer from '../components/ui/PageContainer';

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
    useSEO('Inventory');

    const { confirm } = useConfirm();
    const isAdmin = ['Admin', 'Accountant'].includes(auth.getUser()?.role);
    const isFrontOffice = auth.getUser()?.role === 'Front Office';
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [showImageSettingsModal, setShowImageSettingsModal] = useState(false);
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

    const handleImageUpdate = useCallback(() => {
        fetchInventory();
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
    const NEW_ITEM_WINDOW_DAYS = 7;

    // Select & Print Labels modal state
    const [showSelectPrintModal, setShowSelectPrintModal] = useState(false);
    const [selectPrintSearch, setSelectPrintSearch] = useState('');
    const [selectPrintSelectedId, setSelectPrintSelectedId] = useState(null);
    const [selectPrintQty, setSelectPrintQty] = useState(1);

    // Consumables actions state
    const [showConsumeModal, setShowConsumeModal] = useState(false);
    const [consumeData, setConsumeData] = useState({ id: null, quantity: '', notes: '' });
    const [showRestockModal, setShowRestockModal] = useState(false);
    const [restockData, setRestockData] = useState({ id: null, quantity: '', cost: '', notes: '' });

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
    }, [page, debouncedSearch, filterType, filterCategory, filterStatus, filterVendor, limit]);

    useEffect(() => {
        fetchHierarchy();
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
        } catch {
            setError('Failed to fetch inventory');
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
            setHierarchy(hierarchyData || []);
        } catch (err) {
            console.error("Fetch hierarchy error:", err);
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
        items.filter(i => Number(i.quantity) <= Number(i.reorder_level || 0)).length,
    [items]);

    const inventoryValue = useMemo(() =>
        items.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.cost_price || 0)), 0),
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
                size_code: selectedItem.size_code || null
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
            .filter(i => selectedIds.includes(i.id))
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
        setShowPrintModal(true);
    };

    const generatePDF = async () => {
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
            setShowSelectPrintModal(false);
            setSelectPrintSearch('');
            setSelectPrintSelectedId(null);
            setSelectPrintQty(1);
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
            toast.error(msg);
        } finally {
            setPrintingLabel(false);
        }
    };

    const handleConsume = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.post(`/inventory/${consumeData.id}/consume`, { quantity: consumeData.quantity, notes: consumeData.notes });
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
            await api.post(`/inventory/${restockData.id}/restock`, { quantity_received: restockData.quantity, cost_price: restockData.cost, notes: restockData.notes });
            toast.success(`Restocked successfully`);
            setShowRestockModal(false);
            setRestockData({ id: null, quantity: '', cost: '', notes: '' });
            fetchInventory();
        } catch (err) {
            toast.error(err.response?.data?.message || 'Error restocking item');
        } finally {
            setSaving(false);
        }
    };

    const getStatus = useCallback((item) => {
        if (Number(item.quantity) <= Number(item.reorder_level || 0)) return 'low';
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
                        <span className="inv-kpi-label">Inventory Value</span>
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
                        onClick={() => setShowAddModal(true)}
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
                                {hierarchy.map(cat => (
                                    <optgroup key={cat.id} label={cat.name}>
                                        {cat.subcategories.map(sub => (
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
                        {(filterType || filterCategory || filterStatus || filterVendor) && (
                            <button className="inv-chip-clear" onClick={() => { setFilterType(''); setFilterCategory(''); setFilterStatus(''); setFilterVendor(''); setPage(1); }}>
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
                            onClick={() => setShowSelectPrintModal(true)}
                            title="Select a product and print labels"
                        >
                            <QrCode size={16} />
                            <span>Print Labels</span>
                        </button>

                        {/* Image Sync / Settings */}
                        {isAdmin && (
                            <>
                                <button type="button" className="inv-action-btn" title="Image Fallback Settings" onClick={() => setShowImageSettingsModal(true)}>
                                    <Settings size={16} />
                                </button>
                                <button type="button" className="inv-action-btn" title="Bulk Generate Missing Images" onClick={async () => {
                                    try {
                                        const res = await api.post('/inventory/bulk-generate-images');
                                        toast.success(res.data.message);
                                    } catch {
                                        toast.error('Failed to trigger bulk generation');
                                    }
                                }}>
                                    <RefreshCw size={16} />
                                </button>
                            </>
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
                                    {!isFrontOffice && <th>Cost</th>}
                                    <th>Price</th>
                                    <th>Status</th>
                                    <th className="th-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={isFrontOffice ? 7 : 8} style={{ padding: 0 }}>
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
                                        <td colSpan={isFrontOffice ? 7 : 8}>
                                            <div className="inv-empty">
                                                <Package size={48} className="inv-empty-icon" />
                                                <div className="inv-empty-text">No inventory items found</div>
                                                <div className="inv-empty-sub">Try adjusting your search or filters, or add a new item.</div>
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
                                                        <span className="inv-stock-value">{Number(item.quantity).toLocaleString()}</span>
                                                        <span className="inv-stock-unit">{item.unit}</span>
                                                    </div>
                                                </td>
                                                {!isFrontOffice && (
                                                    <td data-label="Cost">
                                                        <span className="text-sm text-muted">₹{Number(item.cost_price).toFixed(2)}</span>
                                                    </td>
                                                )}
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
                                                                    onClick={() => { setRestockData({ id: item.id, quantity: '', cost: item.cost_price, notes: '' }); setShowRestockModal(true); }}
                                                                >
                                                                    <Plus size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        {isAdmin && (
                                                            <button
                                                                className="inv-action-btn"
                                                                title="Edit"
                                                                onClick={() => { setSelectedItem(normalizeItem(item)); setShowEditModal(true); }}
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                        )}
                                                        {isAdmin && (
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
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 24 }}>
                                <Loader2 className="animate-spin inv-loading-spinner" size={28} />
                            </div>
                        ) : items.length === 0 ? (
                            <div style={{ gridColumn: '1/-1' }}>
                                <div className="inv-empty">
                                    <Package size={48} className="inv-empty-icon" />
                                    <div className="inv-empty-text">No inventory items found</div>
                                    <div className="inv-empty-sub">Try adjusting your search or filters.</div>
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
                                                <div className="inv-stock-value">{Number(item.quantity).toLocaleString()}</div>
                                                <div className="inv-stock-unit">{item.unit}</div>
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
                                            <>
                                                <button className="inv-action-btn" onClick={() => { setSelectedItem(normalizeItem(item)); setShowEditModal(true); }}><Edit2 size={14} /></button>
                                                <button className="inv-action-btn inv-action-btn--danger" onClick={() => handleDeleteItem(item.id)}><Trash2 size={14} /></button>
                                            </>
                                        )}
                                        <button className="inv-action-btn" onClick={() => openStockRequestModal(item)} title="Request from Another Branch"><ArrowLeftRight size={14} /></button>
                                    </div>
                                    <div style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {!isFrontOffice && <span style={{ color: 'var(--muted)' }}>₹{Number(item.cost_price || 0).toFixed(2)}</span>}
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
                                            <div role="button" tabIndex={0} key={p.id} className="dropdown-item" onClick={() => selectProduct(p)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProduct(p); } }}>
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
                                            <div role="button" tabIndex={0} key={p.id} className="dropdown-item" onClick={() => selectProduct(p, true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectProduct(p, true); } }}>
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

            {showSelectPrintModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '560px' }}>
                        <button className="modal-close" onClick={() => setShowSelectPrintModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-8">Print Labels</h2>
                        <p className="section-subtitle mb-16">Search and select a product, then set quantity to print.</p>

                        {/* Search box */}
                        <div className="row gap-sm mb-12" style={{ alignItems: 'center' }}>
                            <Search size={16} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                            <input
                                className="input-field"
                                placeholder="Search by name or SKU…"
                                value={selectPrintSearch}
                                onChange={e => {
                                    setSelectPrintSearch(e.target.value);
                                    setSelectPrintSelectedId(null);
                                }}
                                style={{ flex: 1 }}
                                autoFocus
                            />
                        </div>

                        {/* Product list */}
                        <div className="stack-sm mb-16" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                            {items
                                .filter(item => {
                                    const q = selectPrintSearch.toLowerCase();
                                    if (!q) return !isPaperCategory(item.category);
                                    return !isPaperCategory(item.category) &&
                                        ((item.name || '').toLowerCase().includes(q) ||
                                         (item.sku || '').toLowerCase().includes(q));
                                })
                                .slice(0, 30)
                                .map(item => (
                                    <div
                                        key={item.id}
                                        className={`panel panel--tight pb-8 pt-8 ${selectPrintSelectedId === item.id ? 'panel--active' : ''}`}
                                        style={{
                                            cursor: 'pointer',
                                            background: selectPrintSelectedId === item.id ? 'var(--accent)' : undefined,
                                            borderColor: selectPrintSelectedId === item.id ? 'var(--primary)' : undefined
                                        }}
                                        onClick={() => {
                                            setSelectPrintSelectedId(item.id);
                                            setSelectPrintQty(getStockBasedPrintQty(item));
                                        }}
                                    >
                                        <div className="row items-center justify-between">
                                            <div>
                                                <div className="user-name text-sm">{item.name}</div>
                                                <div className="muted text-xs">SKU: {item.sku || 'N/A'} | Stock: {Number(item.quantity) || 0} {item.unit || ''}</div>
                                            </div>
                                            {selectPrintSelectedId === item.id && (
                                                <Check size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                                            )}
                                        </div>
                                    </div>
                                ))
                            }
                            {items.filter(i => !isPaperCategory(i.category)).length === 0 && (
                                <p className="muted text-sm" style={{ textAlign: 'center', padding: '1rem 0' }}>No inventory items found</p>
                            )}
                        </div>

                        {/* Quantity row — only shown when an item is selected */}
                        {selectPrintSelectedId && (() => {
                            const selItem = items.find(i => i.id === selectPrintSelectedId);
                            return selItem ? (
                                <div className="panel panel--tight mb-16 pt-12 pb-12">
                                    <div className="user-name text-sm mb-4">{selItem.name}</div>
                                    <div className="muted text-xs mb-12">SKU: {selItem.sku || 'N/A'}</div>
                                    <label className="label mb-8">Number of labels to print</label>
                                    <div className="row items-center gap-sm">
                                        <button
                                            className="icon-button icon-button--sm"
                                            type="button"
                                            onClick={() => setSelectPrintQty(q => Math.max(1, q - 1))}
                                        >
                                            <Minus size={14} />
                                        </button>
                                        <input
                                            type="number"
                                            className="input-field text-center"
                                            style={{ width: '80px', padding: '4px' }}
                                            min={1}
                                            max={5000}
                                            value={selectPrintQty}
                                            onChange={e => setSelectPrintQty(Math.max(1, Number(e.target.value) || 1))}
                                        />
                                        <button
                                            className="icon-button icon-button--sm"
                                            type="button"
                                            onClick={() => setSelectPrintQty(q => q + 1)}
                                        >
                                            <Plus size={14} />
                                        </button>
                                        <span className="muted text-xs ml-8">
                                            = {Math.ceil(selectPrintQty / 48)} A4 page{Math.ceil(selectPrintQty / 48) !== 1 ? 's' : ''}
                                            {selectPrintQty % 48 !== 0 ? `, ${48 - (selectPrintQty % 48)} slot${48 - (selectPrintQty % 48) !== 1 ? 's' : ''} unused` : ''}
                                        </span>
                                    </div>
                                </div>
                            ) : null;
                        })()}

                        <button
                            className="btn btn-primary btn--full"
                            disabled={!selectPrintSelectedId || printingLabel}
                            onClick={() => {
                                if (!selectPrintSelectedId) return;
                                setSelectedIds([selectPrintSelectedId]);
                                setPrintQuantities({ [selectPrintSelectedId]: selectPrintQty });
                                setShowSelectPrintModal(false);
                                setShowPrintModal(true);
                            }}
                        >
                            <Printer size={18} className="mr-8" />
                            <span>Continue to Generate PDF</span>
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
                <div className="modal-backdrop" style={{ zIndex: 'var(--z-modal-high)' }}>
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
                            <button type="submit" className="btn btn-primary btn--full" disabled={saving}>
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
                                                        setRestockData({ id: detailItem.id, quantity: '', cost: detailItem.cost_price || 0, notes: '' });
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
                                        </div>
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
                                            <IndianRupee size={18} className="text-primary mb-4" />
                                            <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>₹{Number(detailItem.cost_price).toFixed(2)}</div>
                                            <div className="text-xs muted">Cost Price</div>
                                        </div>
                                    )}
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
                                        {!isFrontOffice && (
                                            <div className="row justify-between">
                                                <span className="text-sm muted">Cost Price</span>
                                                <span className="text-sm" style={{ fontWeight: 500 }}>₹{Number(detailItem.cost_price).toFixed(2)}</span>
                                            </div>
                                        )}
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
                                                        <th>Cost</th>
                                                        <th>Days Gap</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailItem.restocks.map((r, i) => (
                                                        <tr key={i}>
                                                            <td>{new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                                                            <td>{r.quantity_received}</td>
                                                            <td>₹{Number(r.cost_price).toFixed(2)}</td>
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
                    <div role="button" tabIndex={0} className="modal" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                        <button className="modal-close" onClick={() => setShowStockRequestsPanel(false)}>
                            <X size={22} />
                        </button>
                        <div className="row items-center justify-between mb-16">
                            <h2 className="section-title">Stock Transfer Requests</h2>
                            <button className="btn btn-ghost btn-sm" onClick={fetchStockRequests} disabled={stockRequestsLoading}>
                                {stockRequestsLoading ? <Loader2 size={16} className="animate-spin" /> : 'Refresh'}
                            </button>
                        </div>

                        {/* Status legend */}
                        <div className="row gap-md mb-16 text-xs" style={{ flexWrap: 'wrap' }}>
                            <span className="row gap-xs items-center"><span className="badge badge--warn">Pending</span> Awaiting approval</span>
                            <span className="row gap-xs items-center"><span className="badge badge--ok">Approved</span> Ready to send</span>
                            <span className="row gap-xs items-center"><span className="badge" style={{ background: 'var(--primary)', color: 'var(--on-accent)' }}>Sent</span> In transit</span>
                            <span className="row gap-xs items-center"><span className="badge" style={{ background: 'var(--success)', color: 'var(--on-accent)' }}>Received</span> Complete</span>
                        </div>

                        {stockRequestsLoading ? (
                            <div className="text-center py-24"><Loader2 className="animate-spin" size={28} /></div>
                        ) : stockRequests.length === 0 ? (
                            <p className="muted text-center py-24">No stock transfer requests yet.</p>
                        ) : (
                            <div className="stack-sm">
                                {stockRequests.map(sr => {
                                    const statusColor = sr.status === 'Pending' ? 'badge--warn'
                                        : sr.status === 'Approved' ? 'badge--ok'
                                        : sr.status === 'Sent' ? '' : sr.status === 'Received' ? '' : 'badge--error';
                                    const statusStyle = sr.status === 'Sent' ? { background: 'var(--primary)', color: 'var(--on-accent)' }
                                        : sr.status === 'Received' ? { background: 'var(--success)', color: 'var(--on-accent)' } : {};

                                    return (
                                        <div key={sr.id} className="panel panel--tight" style={{ padding: '12px 16px' }}>
                                            <div className="row items-start justify-between gap-md">
                                                <div className="flex-1">
                                                    <div className="row items-center gap-sm mb-4">
                                                        <span className="text-sm" style={{ fontWeight: 700 }}>{sr.item_name}</span>
                                                        {sr.item_sku && <span className="text-xs muted" style={{ fontFamily: 'monospace' }}>{sr.item_sku}</span>}
                                                        <span className={`badge ${statusColor}`} style={statusStyle}>{sr.status}</span>
                                                    </div>
                                                    <div className="text-xs muted mb-4">
                                                        <strong>{sr.from_branch_name}</strong> requests <strong>{sr.quantity} pcs</strong> from <strong>{sr.to_branch_name}</strong>
                                                    </div>
                                                    {sr.notes && <div className="text-xs muted mb-4" style={{ fontStyle: 'italic' }}>"{sr.notes}"</div>}
                                                    <div className="text-xs muted">
                                                        Requested by {sr.created_by_name} · {new Date(sr.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        {sr.resolved_by_name && <span> · {sr.status === 'Rejected' ? 'Rejected' : 'Approved'} by {sr.resolved_by_name}</span>}
                                                        {sr.sent_by_name && <span> · Sent by {sr.sent_by_name}</span>}
                                                        {sr.received_by_name && <span> · Received by {sr.received_by_name}</span>}
                                                    </div>
                                                </div>
                                                <div className="row gap-sm" style={{ flexShrink: 0, alignSelf: 'center' }}>
                                                    {sr.status === 'Pending' && (
                                                        <>
                                                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }} onClick={() => handleReviewStockRequest(sr.id, 'approve')} title="Approve this request">
                                                                <Check size={14} /> Approve
                                                            </button>
                                                            <button className="btn btn-ghost btn-sm btn-danger" onClick={() => handleReviewStockRequest(sr.id, 'reject')} title="Reject this request">
                                                                <X size={14} /> Reject
                                                            </button>
                                                        </>
                                                    )}
                                                    {sr.status === 'Approved' && (
                                                        <button className="btn btn-primary btn-sm" onClick={() => handleReviewStockRequest(sr.id, 'send')} title="Send stock — will deduct from source branch">
                                                            <ArrowLeftRight size={14} /> Send Stock
                                                        </button>
                                                    )}
                                                    {sr.status === 'Sent' && (
                                                        <button className="btn btn-sm" style={{ background: 'var(--success)', color: 'var(--on-accent)' }} onClick={() => handleReviewStockRequest(sr.id, 'receive')} title="Confirm you received the stock">
                                                            <Check size={14} /> Receive Stock
                                                        </button>
                                                    )}
                                                    {sr.status === 'Received' && (
                                                        <span className="text-xs" style={{ color: 'var(--success)', fontWeight: 600 }}>✓ Complete</span>
                                                    )}
                                                    {sr.status === 'Rejected' && (
                                                        <span className="text-xs" style={{ color: 'var(--danger)', fontWeight: 600 }}>✗ Rejected</span>
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

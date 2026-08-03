import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Phone, User, Loader2, Plus, X, Edit2, Trash2, Filter, Mail, MapPin, ChevronDown, SlidersHorizontal, Download, Columns, LayoutGrid, List, ChevronRight, UserPlus, Briefcase, Clock, Check, FileText, FileSpreadsheet, Eye, EyeOff } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import localDb from '../services/localDb';
import { calculateProductPrice } from '../utils/pricing';
import { whatsappUrl } from '../utils/whatsapp';
import { formatForDisplay, telHref } from '../utils/phone';
import { validatePhone, filterMobile } from '../utils/validators';
import Pagination from '../components/Pagination';
import CountryCodeSelect from '../components/CountryCodeSelect';
import { useConfirm } from '../contexts/ConfirmContext';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import toast from 'react-hot-toast';
import BranchSelect from '../components/ui/BranchSelect';
import EmptyState from '../components/EmptyState';
import './Customers.css';
import PageContainer from '../components/ui/PageContainer';

const CUSTOMER_TYPES = ['Retail', 'Offset', 'Walk-in'];
const ADD_CUSTOMER_TYPES = ['Retail', 'Offset'];
const ADMIN_ROLES = ['admin', 'super_admin'];

const Customers = () => {
    useSEO('Customers');

    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin';
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [density, setDensity] = useState(() => localStorage.getItem('sarga_customer_density') || 'comfortable');
    const [expandedRows, setExpandedRows] = useState({});
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [addFormDirty, setAddFormDirty] = useState(false);
    const [editFormDirty, setEditFormDirty] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    const toggleDensity = (mode) => {
        setDensity(mode);
        localStorage.setItem('sarga_customer_density', mode);
    };

    const toggleRowExpanded = (id, e) => {
        e.stopPropagation();
        setExpandedRows(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };
    const [newCustomer, setNewCustomer] = useState({
        mobile: '',
        countryCode: '+91',
        name: '',
        type: 'Walk-in',
        email: '',
        gst: '',
        address: ''
    });
    const [error, setError] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const searchQuery = useDebounce(searchInput, 300);
    const [typeFilter, setTypeFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const fetchAbortRef = useRef(null);

    // Search suggestions (inline dropdown)
    const [searchSuggestions, setSearchSuggestions] = useState([]);
    const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
    const searchSuggestRef = useRef(null);
    const searchInputRef = useRef(null);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const [nameSearch, setNameSearch] = useState('');
    const [mobileSearch, setMobileSearch] = useState('');
    const nameSearchQuery = useDebounce(nameSearch, 300);
    const mobileSearchQuery = useDebounce(mobileSearch, 300);
    const nameRef = useRef(null);
    const mobileRef = useRef(null);
    const suggestRef = useRef(null);

    const triggerAddRef = useRef(null);
    const triggerEditRef = useRef(null);

    useEffect(() => {
        if (showAddModal) {
            triggerAddRef.current = document.activeElement;
        } else if (triggerAddRef.current) {
            setTimeout(() => {
                triggerAddRef.current?.focus();
                triggerAddRef.current = null;
            }, 0);
        }
    }, [showAddModal]);

    useEffect(() => {
        if (showEditModal) {
            triggerEditRef.current = document.activeElement;
        } else if (triggerEditRef.current) {
            setTimeout(() => {
                triggerEditRef.current?.focus();
                triggerEditRef.current = null;
            }, 0);
        }
    }, [showEditModal]);

    // --- ADVANCED JOB MODAL STATE ---
    const [showJobModal, setShowJobModal] = useState(false);
    const [hierarchy, setHierarchy] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [jobData, setJobData] = useState({
        job_name: '',
        description: '',
        quantity: 1,
        unit_price: 0,
        total_amount: 0,
        advance_paid: 0,
        delivery_date: '',
        applied_extras: [],
        branch_id: '',
        customPaperRate: 0,
        is_double_side: false
    });

    const [branches, setBranches] = useState([]);

    const [extraInputs, setExtraInputs] = useState([]); // [{purpose, amount}]
    const [turnaroundEstimate, setTurnaroundEstimate] = useState(null);

    const hasUnsavedChanges = (showAddModal && addFormDirty) || (showEditModal && editFormDirty);

    const updateNewCustomer = (patch) => {
        setNewCustomer(prev => ({ ...prev, ...patch }));
        setAddFormDirty(true);
        if (patch.name !== undefined) setNameSearch(patch.name);
        if (patch.mobile !== undefined) setMobileSearch(patch.mobile);
    };

    const updateSelectedCustomer = (patch) => {
        setSelectedCustomer(prev => ({ ...prev, ...patch }));
        setEditFormDirty(true);
        if (patch.name !== undefined) setNameSearch(patch.name);
        if (patch.mobile !== undefined) setMobileSearch(patch.mobile);
    };

    const closeAddModal = (force = false) => {
        if (!force && addFormDirty) {
            const shouldClose = window.confirm('You have unsaved customer details. Discard them?');
            if (!shouldClose) return;
        }
        setShowAddModal(false);
        setAddFormDirty(false);
    };

    const closeEditModal = (force = false) => {
        if (!force && editFormDirty) {
            const shouldClose = window.confirm('You have unsaved customer changes. Discard them?');
            if (!shouldClose) return;
        }
        setShowEditModal(false);
        setEditFormDirty(false);
    };



    // --- PAGINATION STATE ---
    // Already declared: page, setPage, totalPages, setTotalPages, total, setTotal
    const LIMIT = 20;

    // --- PAGINATED FETCH ---
    const fetchCustomers = async (pageNum = 1, attempt = 1) => {
        if (fetchAbortRef.current) {
            fetchAbortRef.current.abort();
        }
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        if (attempt === 1) setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.append('page', pageNum);
            params.append('limit', LIMIT);
            if (searchQuery) params.append('search', searchQuery);
            if (typeFilter) params.append('type', typeFilter);
            const res = await api.get(`/customers?${params.toString()}`, {
                signal: controller.signal,
                timeout: attempt === 1 ? 10000 : 20000
            });
            if (res.data?.data && res.data?.total !== undefined) {
                setCustomers(res.data.data);
                setTotal(res.data.total);
                setTotalPages(res.data.totalPages);
            } else if (Array.isArray(res.data)) {
                const filtered = res.data.filter(c => c.client_type !== 'internal');
                setCustomers(filtered);
                setTotal(filtered.length);
                setTotalPages(1);
            } else {
                setCustomers([]);
                setTotal(0);
                setTotalPages(1);
            }
            setPage(pageNum);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return true;
        } catch (err) {
            if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return false;
            if (attempt < 2) {
                await new Promise(r => setTimeout(r, 1500));
                return fetchCustomers(pageNum, attempt + 1);
            }
            // Fallback to localDb on failure
            try {
                const localCustomers = await localDb.getCustomers();
                if (localCustomers && localCustomers.length > 0) {
                    const filtered = localCustomers.filter(c => c.client_type !== 'internal');
                    setCustomers(filtered);
                    setTotal(filtered.length);
                    setTotalPages(1);
                    setError('Showing locally stored data — server unavailable');
                    return true;
                }
            } catch {}
            setError('Failed to fetch customers from server');
            setCustomers([]);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // --- EFFECTS ---
    useEffect(() => { fetchCustomers(1); }, [searchQuery, typeFilter]);
    useEffect(() => {
        const handleBeforeUnload = (event) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const fetchSuggestions = useCallback(async (searchTerm, isMobile) => {
        if (!searchTerm || searchTerm.length < 2) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        try {
            const params = new URLSearchParams();
            params.append('search', searchTerm);
            params.append('limit', '8');
            const res = await api.get(`/customers?${params.toString()}`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
            const filtered = data.filter(c => c.client_type !== 'internal');
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setHighlightIndex(-1);
        } catch {
            setSuggestions([]);
        }
    }, []);

    useEffect(() => {
        if (showAddModal || showEditModal) {
            fetchSuggestions(nameSearchQuery, false);
        }
    }, [nameSearchQuery, showAddModal, showEditModal]);

    useEffect(() => {
        if (showAddModal || showEditModal) {
            fetchSuggestions(mobileSearchQuery, true);
        }
    }, [mobileSearchQuery, showAddModal, showEditModal]);

    // Search suggestions for main search (shows inline below search input)
    useEffect(() => {
        let timer = null;
        if (!searchQuery || searchQuery.length < 2) {
            setSearchSuggestions([]);
            setShowSearchSuggestions(false);
            return () => { if (timer) clearTimeout(timer); };
        }
        timer = setTimeout(async () => {
            try {
                const params = new URLSearchParams();
                params.append('search', searchQuery);
                params.append('limit', '6');
                const res = await api.get(`/customers?${params.toString()}`);
                const data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
                const filtered = data.filter(c => c.client_type !== 'internal');
                setSearchSuggestions(filtered);
                setShowSearchSuggestions(filtered.length > 0);
            } catch {
                setSearchSuggestions([]);
            }
        }, 200);
        return () => { if (timer) clearTimeout(timer); };
    }, [searchQuery]);

    // Close search suggestions on outside click
    useEffect(() => {
        if (!showSearchSuggestions) return;
        const handleClick = (e) => {
            if (searchSuggestRef.current && !searchSuggestRef.current.contains(e.target) &&
                searchInputRef.current && !searchInputRef.current.contains(e.target)) {
                setShowSearchSuggestions(false);
            }
        };
        window.addEventListener('mousedown', handleClick);
        return () => window.removeEventListener('mousedown', handleClick);
    }, [showSearchSuggestions]);

    const handleSearchSuggestionSelect = useCallback((customer) => {
        setSearchInput(customer.name || customer.mobile || '');
        setShowSearchSuggestions(false);
        setTypeFilter(customer.type || '');
        setPage(1);
    }, []);

    const handleSuggestionSelect = (customer) => {
        if (showAddModal) {
            setNewCustomer(prev => ({
                ...prev,
                name: customer.name,
                mobile: customer.mobile.replace(/^\+\d+/, ''),
                countryCode: customer.mobile.startsWith('+') ? customer.mobile.slice(0, customer.mobile.length - 10) : '+91',
                type: customer.type || 'Walk-in',
                email: customer.email || '',
            }));
        } else if (showEditModal && selectedCustomer) {
            updateSelectedCustomer({
                name: customer.name,
                mobile: customer.mobile.replace(/^\+\d+/, ''),
                countryCode: customer.mobile.startsWith('+') ? customer.mobile.slice(0, customer.mobile.length - 10) : '+91',
                type: customer.type || selectedCustomer.type,
                email: customer.email || selectedCustomer.email,
            });
        }
        setShowSuggestions(false);
        setNameSearch('');
        setMobileSearch('');
    };

    const handleSuggestionKeyDown = (e) => {
        if (!showSuggestions || suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            handleSuggestionSelect(suggestions[highlightIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    // --- PAGINATION HANDLER ---
    const goToPage = (pageNum) => {
        if (pageNum < 1 || pageNum > totalPages) return;
        fetchCustomers(pageNum);
    };

    const handleAddCustomer = async (e) => {
        e.preventDefault();
        const { valid, error: phoneError } = validatePhone(newCustomer.mobile);
        if (!valid) {
            toast.error(phoneError);
            return setError(phoneError);
        }
        setLoading(true);
        try {
            const response = await localDb.createCustomer(newCustomer);
            // Optimistic UI Update - add new customer to local state
            if (response) {
                setCustomers(prev => [...prev, response]);
                setTotal(prev => prev + 1);
            }
            closeAddModal(true);
            setNewCustomer({ mobile: '', countryCode: '+91', name: '', type: 'Walk-in', email: '', gst: '', address: '' });
            toast.success('Customer added successfully');
            fetchCustomers();
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Failed to add customer';
            setError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateCustomer = async (e) => {
        e.preventDefault();
        const { valid, error: phoneError } = validatePhone(selectedCustomer.mobile);
        if (!valid) {
            toast.error(phoneError);
            return setError(phoneError);
        }
        
        setLoading(true);
        // Optimistic UI Update
        const prevCustomers = [...customers];
        setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ...selectedCustomer } : c));
        try {
            await localDb.createCustomer(selectedCustomer); // createCustomer handles upsert
            closeEditModal(true);
            setSelectedCustomer(null);
            toast.success('Customer updated successfully');
            fetchCustomers();
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Failed to update customer';
            setError(msg);
            toast.error(msg);
            setCustomers(prevCustomers);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCustomer = async (id) => {
        if (!isAdmin) {
            const note = window.prompt('Request delete: add reason (optional)');
            try {
                await api.post('/requests/customer-change', {
                    customer_id: id,
                    action: 'DELETE',
                    note: note || ''
                });
                setError('');
            } catch (e) {
                setError(e.response?.data?.message || 'Failed to submit delete request');
            }
            return;
        }

        const isConfirmed = await confirm({
            title: 'Delete Customer',
            message: 'Are you sure you want to delete this customer?',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        // Optimistic UI Update
        setCustomers(prev => prev.filter(c => c.id !== id));

        try {
            await api.delete(`/customers/${id}`);
            fetchCustomers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to delete customer');
            fetchCustomers();
        }
    };

    // Fetch turnaround estimate when product + quantity + branch change
    useEffect(() => {
        setTurnaroundEstimate(null);
    }, [selectedProduct?.id, jobData.quantity, jobData.branch_id]);

    const fetchBranches = async () => {
        try {
            const data = await localDb.getBranches();
            setBranches(data || []);
            if ((data || []).length > 0) {
                const userIsAdmin = ADMIN_ROLES.includes(user?.role?.toLowerCase());
                setJobData(prev => ({ 
                    ...prev, 
                    branch_id: userIsAdmin ? data[0].id : (user?.branch_id || data[0].id) 
                }));
            }
        } catch {
            console.error('Failed to fetch branches');
        }
    };

    const fetchHierarchy = async () => {
        try {
            let data = await localDb.getProducts();
            if (!data || data.length === 0) {
                const res = await api.get('/product-hierarchy');
                data = res.data || [];
            }
            setHierarchy(data);
        } catch {
            try {
                const res = await api.get('/product-hierarchy');
                const data = res.data || [];
                setHierarchy(data);
            } catch {
                setHierarchy([]);
            }
        }
    };

    const handleProductSelect = async (prod) => {
        setLoading(true);
        try {
            const res = await api.get(`/products/${prod.id}`);
            const fullProd = res.data;
            setSelectedProduct(fullProd);
            setJobData(prev => ({
                ...prev,
                job_name: fullProd.name,
                applied_extras: fullProd.extras || []
            }));
            setExtraInputs(fullProd.extras.map(e => ({ purpose: e.purpose, amount: e.amount })));
            setJobData(prev => ({
                ...prev,
                job_name: fullProd.name,
                applied_extras: fullProd.extras || [],
                customPaperRate: fullProd.has_paper_rate ? fullProd.paper_rate : 0,
                is_double_side: false
            }));
            setExtraInputs(fullProd.extras.map(e => ({ purpose: e.purpose, amount: e.amount })));
            calculateDynamicPrice(fullProd, jobData.quantity, fullProd.extras, fullProd.has_paper_rate ? fullProd.paper_rate : 0);
        } catch {
            setError("Failed to fetch product details");
        } finally {
            setLoading(false);
        }
    };

    const calculateDynamicPrice = (product, quantity, extras, paperRateOverride, isDoubleSideOverride) => {
        const effectiveDoubleSide = isDoubleSideOverride !== undefined
            ? isDoubleSideOverride
            : jobData.is_double_side;
        const result = calculateProductPrice({
            product,
            quantity,
            extras,
            paperRateOverride,
            currentPaperRate: jobData.customPaperRate,
            isOffset: selectedCustomer?.type === 'Offset',
            isDoubleSide: effectiveDoubleSide
        });
        if (!result) return;
        setJobData(prev => ({
            ...prev,
            ...result
        }));
    };

    const handleAddJob = async (e) => {
        e.preventDefault();
        const isConfirmed = await confirm({
            title: 'Create Job',
            message: `Create job for ${selectedCustomer?.name || 'customer'}?\nAmount: ₹${Number(jobData.total_amount).toFixed(2)}`,
            confirmText: 'Create',
            type: 'primary'
        });
        if (!isConfirmed) return;
        setLoading(true);
        try {
            await api.post('/jobs', {
                ...jobData,
                product_id: selectedProduct?.id,
                customer_id: selectedCustomer?.id || null,
                applied_extras: extraInputs
            });
            setShowJobModal(false);
            resetJobForm();
            fetchCustomers();
        } catch (e) {
            setError(e.response?.data?.message || 'Failed to add job');
        } finally {
            setLoading(false);
        }
    };

    const resetJobForm = () => {
        const userIsAdmin = ADMIN_ROLES.includes(user?.role?.toLowerCase());
        setJobData({
            job_name: '', description: '', quantity: 1, unit_price: 0,
            total_amount: 0, advance_paid: 0, delivery_date: '', applied_extras: [],
            branch_id: userIsAdmin ? (branches[0]?.id || '') : (user?.branch_id || branches[0]?.id || ''),
            customPaperRate: 0, is_double_side: false
        });
        setSelectedProduct(null);
        setExtraInputs([]);
    };

    // Close modals on ESC
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (showAddModal) closeAddModal();
                if (showEditModal) closeEditModal();
                if (showJobModal) { setShowJobModal(false); resetJobForm(); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showAddModal, showEditModal, showJobModal]);

    const addExtraInput = () => setExtraInputs([...extraInputs, { purpose: '', amount: 0 }]);
    const removeExtraInput = (idx) => {
        const next = extraInputs.filter((_, i) => i !== idx);
        setExtraInputs(next);
        calculateDynamicPrice(selectedProduct, jobData.quantity, next, jobData.customPaperRate);
    };
    const updateExtraInput = (idx, field, val) => {
        const next = [...extraInputs];
        next[idx][field] = val;
        setExtraInputs(next);
        calculateDynamicPrice(selectedProduct, jobData.quantity, next, jobData.customPaperRate);
    };

    const hasActiveFilters = searchQuery || typeFilter;
    const getOutstandingStatus = (amount) => {
        if (amount <= 0) return 'none';
        if (amount > 10000) return 'due';
        if (amount > 0) return 'partial';
        return 'none';
    };

    const [searchFocused, setSearchFocused] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [exportFilter, setExportFilter] = useState('');
    const exportRef = useRef(null);
    const [showColumnsMenu, setShowColumnsMenu] = useState(false);
    const columnsRef = useRef(null);
    const [visibleColumns, setVisibleColumns] = useState({
        customer: true,
        phone: true,
        outstanding: true,
        lastOrder: true
    });

    useEffect(() => {
        if (!showColumnsMenu) return;
        const handleClickOutside = (e) => {
            if (columnsRef.current && !columnsRef.current.contains(e.target)) {
                setShowColumnsMenu(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [showColumnsMenu]);

    const toggleColumn = (col) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    useEffect(() => {
        if (!showExportMenu) return;
        const handleClickOutside = (e) => {
            if (exportRef.current && !exportRef.current.contains(e.target)) {
                setShowExportMenu(false);
            }
        };
        window.addEventListener('mousedown', handleClickOutside);
        return () => window.removeEventListener('mousedown', handleClickOutside);
    }, [showExportMenu]);

    const fetchAllCustomersForExport = async (filterType) => {
        const params = { export: 1 };
        if (filterType) params.filter = filterType;
        const res = await api.get('/customers', { params });
        return Array.isArray(res.data) ? res.data : (res.data?.data || customers);
    };

    const getExportTitle = () => {
        switch (exportFilter) {
            case 'due': return 'Customers with Due';
            case 'has_orders': return 'Customers with Orders';
            case 'new': return 'New Added Customers';
            default: return 'All Customers';
        }
    };

    const exportToPDF = async () => {
        const allCustomers = await fetchAllCustomersForExport(exportFilter);
        const [{ default: jsPDF }, autotable] = await Promise.all([
            import('jspdf'),
            import('jspdf-autotable'),
        ]);
        const doc = new jsPDF();
        const title = getExportTitle();
        const tableColumn = ['Name', 'Type', 'Phone', 'Email', 'GST', 'Address', 'Outstanding', 'Last Order'];
        const tableRows = allCustomers.map(c => [
            c.name || '',
            c.type || '',
            c.mobile ? c.mobile.replace(/^\+/, '') : '',
            c.email || '',
            c.gst || '',
            c.address || '',
            `₹${Number(c.outstanding_balance || 0).toLocaleString('en-IN')}`,
            c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never'
        ]);
        doc.setFontSize(16);
        doc.text(title, 14, 15);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, 14, 22);
        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [79, 70, 229], fontSize: 8, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 250] }
        });
        doc.save(`${exportFilter || 'all'}-customers.pdf`);
        setShowExportMenu(false);
    };

    const exportToExcel = async () => {
        const allCustomers = await fetchAllCustomersForExport(exportFilter);
        const title = getExportTitle();
        const headers = ['Name', 'Type', 'Phone', 'Email', 'GST', 'Address', 'Outstanding', 'Last Order'];
        const rows = allCustomers.map(c => [
            c.name || '',
            c.type || '',
            c.mobile ? c.mobile.replace(/^\+/, '') : '',
            c.email || '',
            c.gst || '',
            c.address || '',
            Number(c.outstanding_balance || 0),
            c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Never'
        ]);
        const csvContent = [['Filter: ' + title], headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${exportFilter || 'all'}-customers.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setShowExportMenu(false);
    };

    return (
        <PageContainer>
            {/* ═══ Premium Header ═══ */}
            <header className="customer-header">
                <div className="customer-header-left">
                    <div className="customer-header-icon">
                        <Users size={24} />
                    </div>
                    <div className="customer-header-text">
                        <h1>Customer Management</h1>
                        <p>Manage customers, quotations, invoices and walk-in jobs</p>
                    </div>
                </div>
                <div className="customer-header-actions">
                    <button
                        className="btn-walkin"
                        onClick={() => {
                            navigate('/dashboard/sales/invoices', {
                                state: {
                                    action: 'create',
                                    customer: {
                                        id: null,
                                        name: 'Walk-in',
                                        mobile: '',
                                        type: 'Walk-in',
                                        email: '',
                                        address: '',
                                        gst: ''
                                    }
                                }
                            });
                        }}
                        aria-label="Create walk-in job"
                    >
                        <Briefcase size={18} /> Walk-in Job
                    </button>
                    <button className="btn-add-customer" onClick={() => { setAddFormDirty(false); setShowAddModal(true); }}>
                        <UserPlus size={18} /> Add Customer
                    </button>
                </div>
            </header>

            {/* ═══ Filter Toolbar ═══ */}
            <div className="customer-filters">
                <div className="customer-search" ref={searchInputRef}>
                    <Search size={18} className="search-icon" />
                    <label htmlFor="customer-search" className="sr-only">Search customers</label>
                    <input
                        id="customer-search"
                        type="text"
                        className="search-input"
                        placeholder="Search by name, phone, or customer ID..."
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 200)}
                        autoComplete="off"
                        aria-haspopup="listbox"
                        aria-expanded={showSearchSuggestions}
                        aria-controls="search-suggestions-list"
                    />
                    <button
                        className={`search-clear ${searchInput ? 'search-clear--visible' : ''}`}
                        onClick={() => { setSearchInput(''); setSearchSuggestions([]); setShowSearchSuggestions(false); }}
                        aria-label="Clear search"
                    >
                        <X size={14} />
                    </button>
                    {!searchInput && !searchFocused && (
                        <span className="search-shortcut">Search</span>
                    )}
                    {/* Search suggestions dropdown */}
                    {showSearchSuggestions && searchSuggestions.length > 0 && (
                        <div className="autocomplete-dropdown" ref={searchSuggestRef} role="listbox" aria-label="Search suggestions" id="search-suggestions-list" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 'var(--z-dropdown)', marginTop: 4 }}>
                            {searchSuggestions.map((c, i) => (
                                <div
                                    key={c.id}
                                    className="autocomplete-item"
                                    onClick={() => handleSearchSuggestionSelect(c)}
                                    role="option"
                                    aria-selected={false}
                                >
                                    <div className="autocomplete-item__avatar">{c.name?.charAt(0) || '?'}</div>
                                    <div className="autocomplete-item__info">
                                        <div className="autocomplete-item__name">{c.name}</div>
                                        <div className="autocomplete-item__meta">
                                            <span>{c.mobile ? formatForDisplay(c.mobile) : '—'}</span>
                                            <span className={`customer-type-badge customer-type-badge--${(c.type || 'walk-in').toLowerCase().replace(' ', '-')}`}>
                                                {c.type || 'Walk-in'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div
                                className="autocomplete-item"
                                onClick={() => {
                                    navigate('/dashboard/sales/invoices', {
                                        state: {
                                            action: 'create',
                                            customer: { id: null, name: 'Walk-in', mobile: '', type: 'Walk-in', email: '', address: '', gst: '' }
                                        }
                                    });
                                }}
                                role="option"
                            >
                                <div className="autocomplete-item__avatar" style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}>
                                    <Plus size={14} />
                                </div>
                                <div className="autocomplete-item__info">
                                    <div className="autocomplete-item__name">New Walk-in Customer</div>
                                    <div className="autocomplete-item__meta">
                                        <span>Create a walk-in order</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="filter-control">
                    <Filter size={14} className="filter-control-icon" />
                    <select
                        value={typeFilter}
                        onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
                        aria-label="Filter by customer type"
                    >
                        <option value="">All Types</option>
                        {CUSTOMER_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <button
                    className={`btn-clear-filters ${searchQuery || typeFilter ? '' : 'btn-clear-filters--hidden'}`}
                    onClick={() => { setSearchInput(''); setTypeFilter(''); setPage(1); }}
                >
                    <X size={14} /> Clear
                </button>
            </div>

            {/* Error banner when error exists outside of modals */}
            {error && !showAddModal && !showEditModal && !showJobModal && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    marginBottom: '16px',
                    fontSize: '14px',
                    fontWeight: 500
                }} role="alert">
                    <span>{error}</span>
                    <button
                        type="button"
                        onClick={() => setError('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 4px', borderRadius: '4px' }}
                        aria-label="Dismiss error message"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* ═══ Table Toolbar ═══ */}
            <div className="customer-table-toolbar">
                <div className="customer-table-toolbar-left">
                    {loading ? (
                        <span><Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} /> Searching customers...</span>
                    ) : customers.length > 0 ? (
                        <span>
                            <span className="progress-text">{customers.length}</span>
                            <span className="progress-text-muted"> of </span>
                            <span className="progress-text">{total}</span>
                            {total !== 1 ? ' customers' : ' customer'}
                            {searchQuery && <span className="progress-text-muted"> · results updated</span>}
                        </span>
                    ) : (
                        <span className="progress-text-muted">No customers found</span>
                    )}
                </div>
                <div className="customer-table-toolbar-right">
                    <div className="density-toggle">
                        <button
                            className={`density-btn ${density === 'comfortable' ? 'density-btn--active' : ''}`}
                            onClick={() => toggleDensity('comfortable')}
                            title="Comfortable view"
                        >
                            <List size={14} /> Normal
                        </button>
                        <button
                            className={`density-btn ${density === 'compact' ? 'density-btn--active' : ''}`}
                            onClick={() => toggleDensity('compact')}
                            title="Compact view"
                        >
                            <LayoutGrid size={14} /> Compact
                        </button>
                    </div>
                    <div className="export-dropdown-wrapper" ref={exportRef}>
                        <button className="toolbar-btn toolbar-btn--icon" title="Export" onClick={() => setShowExportMenu(prev => !prev)}>
                            <Download size={14} />
                        </button>
                        {showExportMenu && (
                            <div className="export-dropdown-menu">
                                <div className="export-filter-group">
                                    {[
                                        { value: '', label: 'All Customers' },
                                        { value: 'due', label: 'With Due' },
                                        { value: 'has_orders', label: 'With Orders' },
                                        { value: 'new', label: 'New Added' },
                                    ].map(opt => (
                                        <label key={opt.value} className={`export-filter-option ${exportFilter === opt.value ? 'active' : ''}`}>
                                            <input
                                                type="radio"
                                                name="exportFilter"
                                                value={opt.value}
                                                checked={exportFilter === opt.value}
                                                onChange={() => setExportFilter(opt.value)}
                                            />
                                            <span>{opt.label}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="export-dropdown-divider" />
                                <button className="export-dropdown-item" onClick={exportToPDF}>
                                    <FileText size={14} /> Export as PDF
                                </button>
                                <button className="export-dropdown-item" onClick={exportToExcel}>
                                    <FileSpreadsheet size={14} /> Export as Excel
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="export-dropdown-wrapper" ref={columnsRef}>
                        <button className="toolbar-btn toolbar-btn--icon" title="Columns" onClick={() => setShowColumnsMenu(prev => !prev)}>
                            <Columns size={14} />
                        </button>
                        {showColumnsMenu && (
                            <div className="export-dropdown-menu columns-dropdown-menu">
                                <div className="columns-dropdown-header">Toggle Columns</div>
                                <button className={`columns-dropdown-item ${visibleColumns.customer ? 'columns-dropdown-item--active' : ''}`} onClick={() => toggleColumn('customer')}>
                                    {visibleColumns.customer ? <Eye size={14} /> : <EyeOff size={14} />} Customer
                                </button>
                                <button className={`columns-dropdown-item ${visibleColumns.phone ? 'columns-dropdown-item--active' : ''}`} onClick={() => toggleColumn('phone')}>
                                    {visibleColumns.phone ? <Eye size={14} /> : <EyeOff size={14} />} Phone
                                </button>
                                <button className={`columns-dropdown-item ${visibleColumns.outstanding ? 'columns-dropdown-item--active' : ''}`} onClick={() => toggleColumn('outstanding')}>
                                    {visibleColumns.outstanding ? <Eye size={14} /> : <EyeOff size={14} />} Outstanding
                                </button>
                                <button className={`columns-dropdown-item ${visibleColumns.lastOrder ? 'columns-dropdown-item--active' : ''}`} onClick={() => toggleColumn('lastOrder')}>
                                    {visibleColumns.lastOrder ? <Eye size={14} /> : <EyeOff size={14} />} Last Order
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ Customer Table Card ═══ */}
            <div className="customer-table-card">
                {!loading && customers.length > 0 && (
                    <div className="customer-table-grid" style={{
                        gridTemplateColumns: [
                            '52px',
                            visibleColumns.customer && '2fr',
                            visibleColumns.phone && '1.4fr',
                            visibleColumns.outstanding && '1fr',
                            visibleColumns.lastOrder && '1.2fr',
                            '140px',
                            '36px'
                        ].filter(Boolean).join(' ')
                    }}>
                        <div className="customer-table-header-cell"></div>
                        {visibleColumns.customer && <div className="customer-table-header-cell">Customer</div>}
                        {visibleColumns.phone && <div className="customer-table-header-cell">Phone</div>}
                        {visibleColumns.outstanding && <div className="customer-table-header-cell">Outstanding</div>}
                        {visibleColumns.lastOrder && <div className="customer-table-header-cell">Last Order</div>}
                        <div className="customer-table-header-cell">Actions</div>
                        <div className="customer-table-header-cell"></div>
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                {loading && customers.length === 0 ? (
                    Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="customer-skeleton-row">
                            <div><div className="skeleton-pulse skeleton-circle" /></div>
                            <div>
                                <div className="skeleton-pulse skeleton-text" />
                                <div className="skeleton-pulse skeleton-text-sm" />
                            </div>
                            <div><div className="skeleton-pulse skeleton-text-short" /></div>
                            <div><div className="skeleton-pulse skeleton-text-short" /></div>
                            <div><div className="skeleton-pulse skeleton-text" style={{ width: '40%' }} /></div>
                            <div><div className="skeleton-pulse skeleton-text" style={{ width: '50%' }} /></div>
                            <div><div className="skeleton-pulse" style={{ width: 24, height: 24, borderRadius: 6 }} /></div>
                        </div>
                    ))
                ) : error && customers.length === 0 ? (
                    <ServerError onRetry={fetchCustomers} message={error} />
                ) : customers.length === 0 ? (
                    <EmptyState
                        icon={Users}
                        title="No customers found"
                        description={searchQuery || typeFilter
                            ? 'Try adjusting your search or filter criteria to find what you\'re looking for.'
                            : 'Get started by adding your first customer to manage orders, quotations and invoices.'}
                        variant={searchQuery || typeFilter ? 'search' : 'default'}
                        action={searchQuery || typeFilter ? undefined : () => { setAddFormDirty(false); setShowAddModal(true); }}
                        actionLabel="Add Customer"
                        secondaryAction={searchQuery || typeFilter ? () => { setSearchInput(''); setTypeFilter(''); setPage(1); } : undefined}
                        secondaryLabel="Clear Filters"
                    />
                ) : customers.map((c, _idx) => {
                    const isExpanded = !!expandedRows[c.id];
                    const outstanding = Number(c.outstanding_balance || 0);
                    const outstandingStatus = getOutstandingStatus(outstanding);
                    const formattedLastOrder = c.last_order_date
                        ? new Date(c.last_order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                        : null;
                    
                    return (
                        <div key={c.id} className="customer-row-container">
                            <div
                                className={`customer-row customer-row--${density}`}
                                onClick={() => navigate(`/dashboard/customers/${c.id}`)}
                                style={{
                                    gridTemplateColumns: [
                                        '52px',
                                        visibleColumns.customer && '2fr',
                                        visibleColumns.phone && '1.4fr',
                                        visibleColumns.outstanding && '1fr',
                                        visibleColumns.lastOrder && '1.2fr',
                                        '140px',
                                        '36px'
                                    ].filter(Boolean).join(' ')
                                }}
                            >
                                {/* Avatar */}
                                <div className="customer-avatar">
                                    <div className="avatar-circle">
                                        {c.name?.charAt(0) || '?'}
                                    </div>
                                </div>

                                {/* Customer Info */}
                                {visibleColumns.customer && (
                                    <div className="customer-info" onClick={e => e.stopPropagation()}>
                                        <span className="customer-name" title={c.name}>{c.name}</span>
                                        <span className={`customer-type-badge customer-type-badge--${(c.type || 'walk-in').toLowerCase().replace(' ', '-')}`}>
                                            {c.type || 'Walk-in'}
                                        </span>
                                    </div>
                                )}

                                {/* Phone */}
                                {visibleColumns.phone && (
                                    <div className="customer-phone">
                                        <span className="phone-number" onClick={e => e.stopPropagation()}>{formatForDisplay(c.mobile)}</span>
                                        <span className="phone-actions">
                                            <a href={telHref(c.mobile)} title="Call" className="phone-action-btn" onClick={e => { e.stopPropagation(); }}>
                                            <Phone size={13} />
                                        </a>
                                        <a href={whatsappUrl(c.mobile, `Dear ${c.name || 'Customer'},\n\nGreetings from Sarga! 🙏`)} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="phone-action-btn" onClick={e => { e.stopPropagation(); }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                        </a>
                                    </span>
                                </div>
                                )}

                                {/* Outstanding */}
                                {visibleColumns.outstanding && (
                                    <div className={`customer-outstanding customer-outstanding--${outstandingStatus}`} onClick={e => e.stopPropagation()}>
                                        <span className="outstanding-indicator">
                                            <span className={`outstanding-dot outstanding-dot--${outstandingStatus}`} />
                                            <span>{outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '—'}</span>
                                        </span>
                                    </div>
                                )}

                                {/* Last Order */}
                                {visibleColumns.lastOrder && (
                                    <div className={`customer-last-order ${!formattedLastOrder ? 'customer-last-order--empty' : ''}`}>
                                        {formattedLastOrder || 'Never ordered'}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="customer-actions" onClick={e => e.stopPropagation()}>
                                    <button
                                        className="action-btn action-btn--job"
                                        onClick={() => {
                                            navigate('/dashboard/sales/invoices', {
                                                state: {
                                                    action: 'create',
                                                    customer: { id: c.id, name: c.name, mobile: c.mobile, type: c.type, email: c.email || '', address: c.address || '', gst: c.gst || '' }
                                                }
                                            });
                                        }}
                                        title="New Job"
                                    >
                                        <Plus size={13} /> Job
                                    </button>
                                    <button
                                        className="action-icon-btn"
                                        onClick={() => { setSelectedCustomer(c); setEditFormDirty(false); setShowEditModal(true); }}
                                        title={isAdmin ? 'Edit Customer' : 'Request Edit'}
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        className="action-icon-btn action-icon-btn--danger"
                                        onClick={() => handleDeleteCustomer(c.id)}
                                        title={isAdmin ? 'Delete Customer' : 'Request Delete'}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                {/* Expand */}
                                <button
                                    className={`btn-expand ${isExpanded ? 'btn-expand--rotated' : ''}`}
                                    onClick={(e) => toggleRowExpanded(c.id, e)}
                                    title="View Details"
                                >
                                    <ChevronDown size={16} />
                                </button>
                            </div>

                            {/* Detail Panel */}
                            <div className={`customer-detail-panel ${isExpanded ? 'customer-detail-panel--expanded' : ''}`}>
                                <div className="customer-detail-content">
                                    {c.email && (
                                        <div className="customer-detail-item">
                                            <span className="customer-detail-label">Email Address</span>
                                            <span className="customer-detail-value">{c.email}</span>
                                        </div>
                                    )}
                                    {c.address && (
                                        <div className="customer-detail-item">
                                            <span className="customer-detail-label">Billing Address</span>
                                            <span className="customer-detail-value">{c.address}</span>
                                        </div>
                                    )}
                                    {c.gst && (
                                        <div className="customer-detail-item">
                                            <span className="customer-detail-label">GST Number</span>
                                            <span className="customer-detail-value">{c.gst}</span>
                                        </div>
                                    )}
                                    <div className="customer-detail-item">
                                        <span className="customer-detail-label">Date Created</span>
                                        <span className="customer-detail-value">
                                            {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                </div>
            </div>
            <Pagination
                page={page}
                totalPages={totalPages}
                total={total}
                limit={LIMIT}
                onPageChange={goToPage}
                loading={loading}
            />

            {/* Modals... */}
            {showAddModal && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-customer-title" style={{ alignItems: 'flex-start', paddingTop: '8vh' }}>
                    <div className="modal modal--customer">
                        <div className="modal-header">
                            <h2 id="add-customer-title" className="modal-title">Add New Customer</h2>
                            <button className="modal-close modal-close--static" aria-label="Close add customer modal" onClick={() => closeAddModal()}><X size={20} aria-hidden="true" /></button>
                        </div>
                        {addFormDirty && <div className="alert alert--warning" style={{ margin: '0 24px' }}>Unsaved changes</div>}
                        <div className="modal-body">
                        <form onSubmit={handleAddCustomer} noValidate>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="add-customer-name" className="label" style={{ marginBottom: 6, display: 'block' }}>Customer Name <span aria-hidden="true">*</span></label>
                                <div className="autocomplete-wrapper">
                                    <input
                                        id="add-customer-name"
                                        name="customerName"
                                        type="text"
                                        className="input-field"
                                        style={{ width: '100%', height: 44 }}
                                        value={nameSearch || newCustomer.name}
                                        onChange={(e) => { setNameSearch(e.target.value); updateNewCustomer({ name: e.target.value }); }}
                                        onKeyDown={handleSuggestionKeyDown}
                                        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        ref={nameRef}
                                        required
                                        autoFocus
                                        autoComplete="off"
                                        placeholder="Start typing customer name..."
                                        aria-required="true"
                                        aria-haspopup="listbox"
                                        aria-autocomplete="list"
                                        aria-controls="add-customer-name-suggestions"
                                        aria-expanded={showSuggestions && suggestions.length > 0}
                                    />
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="autocomplete-dropdown" ref={suggestRef} role="listbox" aria-label="Customer suggestions" id="add-customer-name-suggestions">
                                            {suggestions.map((c, i) => (
                                                <div
                                                    key={c.id}
                                                    className={`autocomplete-item ${i === highlightIndex ? 'autocomplete-item--highlighted' : ''}`}
                                                    onClick={() => handleSuggestionSelect(c)}
                                                    onMouseEnter={() => setHighlightIndex(i)}
                                                    role="option"
                                                    aria-selected={i === highlightIndex}
                                                >
                                                    <div className="autocomplete-item__avatar">{c.name?.charAt(0) || '?'}</div>
                                                    <div className="autocomplete-item__info">
                                                        <div className="autocomplete-item__name">{c.name}</div>
                                                        <div className="autocomplete-item__meta">
                                                            <span>{formatForDisplay(c.mobile)}</span>
                                                            <span>{c.type}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="add-customer-phone" className="label" style={{ marginBottom: 6, display: 'block' }}>Mobile Number <span aria-hidden="true">*</span></label>
                                <div className="autocomplete-wrapper">
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <CountryCodeSelect id="add-customer-country" name="customerCountry" value={newCustomer.countryCode} onChange={(val) => updateNewCustomer({ countryCode: val })} />
                                        <input
                                            id="add-customer-phone"
                                            name="customerPhone"
                                            type="tel"
                                            className="input-field"
                                            style={{ flex: 1, height: 44 }}
                                            value={newCustomer.mobile}
                                            onChange={(e) => { updateNewCustomer({ mobile: filterMobile(e.target.value) }); setMobileSearch(filterMobile(e.target.value)); }}
                                            onKeyDown={handleSuggestionKeyDown}
                                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            ref={mobileRef}
                                            required
                                            autoComplete="tel"
                                            placeholder="Mobile number"
                                            aria-required="true"
                                            aria-haspopup="listbox"
                                            aria-autocomplete="list"
                                            aria-controls="add-customer-phone-suggestions"
                                            aria-expanded={showSuggestions && suggestions.length > 0}
                                        />
                                    </div>
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="autocomplete-dropdown" role="listbox" aria-label="Mobile suggestions" id="add-customer-phone-suggestions">
                                            {suggestions.map((c, i) => (
                                                <div
                                                    key={c.id}
                                                    className={`autocomplete-item ${i === highlightIndex ? 'autocomplete-item--highlighted' : ''}`}
                                                    onClick={() => handleSuggestionSelect(c)}
                                                    onMouseEnter={() => setHighlightIndex(i)}
                                                    role="option"
                                                    aria-selected={i === highlightIndex}
                                                >
                                                    <div className="autocomplete-item__avatar">{c.name?.charAt(0) || '?'}</div>
                                                    <div className="autocomplete-item__info">
                                                        <div className="autocomplete-item__name">{c.name}</div>
                                                        <div className="autocomplete-item__meta">
                                                            <span>{formatForDisplay(c.mobile)}</span>
                                                            <span>{c.type}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="add-customer-type" className="label" style={{ marginBottom: 6, display: 'block' }}>Customer Type</label>
                                <select
                                    id="add-customer-type"
                                    name="customerType"
                                    className="input-field select-field"
                                    style={{ width: '100%', height: 44 }}
                                    value={newCustomer.type}
                                    onChange={(e) => updateNewCustomer({ type: e.target.value })}
                                >
                                    {ADD_CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="add-customer-email" className="label" style={{ marginBottom: 6, display: 'block' }}>Email Address</label>
                                <input
                                    id="add-customer-email"
                                    name="customerEmail"
                                    type="email"
                                    className="input-field"
                                    style={{ width: '100%', height: 44 }}
                                    value={newCustomer.email}
                                    onChange={(e) => updateNewCustomer({ email: e.target.value })}
                                    autoComplete="email"
                                />
                            </div>
                            {error && <p className="text-sm text-error" style={{ marginBottom: 16 }} role="alert">{error}</p>}
                            <button type="submit" disabled={loading} className="btn btn-primary-blue btn--full touch-target" style={{ height: 42 }}>
                                {loading ? <><Loader2 className="animate-spin" aria-hidden="true" /> Adding...</> : "Add Customer"}
                            </button>
                        </form>
                        </div>
                    </div>
                </div>
            )}

            {showEditModal && selectedCustomer && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-customer-title" style={{ alignItems: 'flex-start', paddingTop: '8vh' }}>
                    <div className="modal modal--customer">
                        <div className="modal-header">
                            <h2 id="edit-customer-title" className="modal-title">Edit Customer</h2>
                            <button className="modal-close modal-close--static" aria-label="Close edit customer modal" onClick={() => closeEditModal()}><X size={20} aria-hidden="true" /></button>
                        </div>
                        {editFormDirty && <div className="alert alert--warning" style={{ margin: '0 24px' }}>Unsaved changes</div>}
                        <div className="modal-body">
                        <form onSubmit={handleUpdateCustomer} noValidate>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="edit-customer-name" className="label" style={{ marginBottom: 6, display: 'block' }}>Customer Name <span aria-hidden="true">*</span></label>
                                <div className="autocomplete-wrapper">
                                    <input
                                        id="edit-customer-name"
                                        name="editCustomerName"
                                        type="text"
                                        className="input-field"
                                        style={{ width: '100%', height: 44 }}
                                        value={nameSearch || selectedCustomer.name}
                                        onChange={(e) => { setNameSearch(e.target.value); updateSelectedCustomer({ name: e.target.value }); }}
                                        onKeyDown={handleSuggestionKeyDown}
                                        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                        required
                                        autoComplete="off"
                                        placeholder="Customer name"
                                        aria-required="true"
                                        aria-haspopup="listbox"
                                        aria-autocomplete="list"
                                        aria-controls="edit-customer-name-suggestions"
                                        aria-expanded={showSuggestions && suggestions.length > 0}
                                    />
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="autocomplete-dropdown" role="listbox" aria-label="Customer suggestions" id="edit-customer-name-suggestions">
                                            {suggestions.map((c, i) => (
                                                <div
                                                    key={c.id}
                                                    className={`autocomplete-item ${i === highlightIndex ? 'autocomplete-item--highlighted' : ''}`}
                                                    onClick={() => handleSuggestionSelect(c)}
                                                    onMouseEnter={() => setHighlightIndex(i)}
                                                    role="option"
                                                    aria-selected={i === highlightIndex}
                                                >
                                                    <div className="autocomplete-item__avatar">{c.name?.charAt(0) || '?'}</div>
                                                    <div className="autocomplete-item__info">
                                                        <div className="autocomplete-item__name">{c.name}</div>
                                                        <div className="autocomplete-item__meta">
                                                            <span>{formatForDisplay(c.mobile)}</span>
                                                            <span>{c.type}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="edit-customer-phone" className="label" style={{ marginBottom: 6, display: 'block' }}>Mobile Number <span aria-hidden="true">*</span></label>
                                <div className="autocomplete-wrapper">
                                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                        <CountryCodeSelect id="edit-customer-country" name="editCustomerCountry" value={selectedCustomer?.countryCode || '+91'} onChange={(val) => updateSelectedCustomer({ countryCode: val })} />
                                        <input
                                            id="edit-customer-phone"
                                            name="editCustomerPhone"
                                            type="tel"
                                            className="input-field"
                                            style={{ flex: 1, height: 44 }}
                                            value={selectedCustomer.mobile}
                                            onChange={(e) => { updateSelectedCustomer({ mobile: filterMobile(e.target.value) }); setMobileSearch(filterMobile(e.target.value)); }}
                                            onKeyDown={handleSuggestionKeyDown}
                                            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                                            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                                            required
                                            autoComplete="tel"
                                            placeholder="Mobile number"
                                            aria-required="true"
                                            aria-haspopup="listbox"
                                            aria-autocomplete="list"
                                            aria-controls="edit-customer-phone-suggestions"
                                            aria-expanded={showSuggestions && suggestions.length > 0}
                                        />
                                    </div>
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className="autocomplete-dropdown" role="listbox" aria-label="Mobile suggestions" id="edit-customer-phone-suggestions">
                                            {suggestions.map((c, i) => (
                                                <div
                                                    key={c.id}
                                                    className={`autocomplete-item ${i === highlightIndex ? 'autocomplete-item--highlighted' : ''}`}
                                                    onClick={() => handleSuggestionSelect(c)}
                                                    onMouseEnter={() => setHighlightIndex(i)}
                                                    role="option"
                                                    aria-selected={i === highlightIndex}
                                                >
                                                    <div className="autocomplete-item__avatar">{c.name?.charAt(0) || '?'}</div>
                                                    <div className="autocomplete-item__info">
                                                        <div className="autocomplete-item__name">{c.name}</div>
                                                        <div className="autocomplete-item__meta">
                                                            <span>{formatForDisplay(c.mobile)}</span>
                                                            <span>{c.type}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="edit-customer-type" className="label" style={{ marginBottom: 6, display: 'block' }}>Customer Type</label>
                                <select
                                    id="edit-customer-type"
                                    name="editCustomerType"
                                    className="input-field select-field"
                                    style={{ width: '100%', height: 44 }}
                                    value={selectedCustomer.type}
                                    onChange={(e) => updateSelectedCustomer({ type: e.target.value })}
                                >
                                    {CUSTOMER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="edit-customer-email" className="label" style={{ marginBottom: 6, display: 'block' }}>Email Address</label>
                                <input
                                    id="edit-customer-email"
                                    name="editCustomerEmail"
                                    type="email"
                                    className="input-field"
                                    style={{ width: '100%', height: 44 }}
                                    value={selectedCustomer.email || ''}
                                    onChange={(e) => updateSelectedCustomer({ email: e.target.value })}
                                    autoComplete="email"
                                />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="edit-customer-gst" className="label" style={{ marginBottom: 6, display: 'block' }}>GST Number</label>
                                <input
                                    id="edit-customer-gst"
                                    name="editCustomerGst"
                                    type="text"
                                    className="input-field"
                                    style={{ width: '100%', height: 44 }}
                                    value={selectedCustomer.gst || ''}
                                    onChange={(e) => updateSelectedCustomer({ gst: e.target.value.toUpperCase() })}
                                    autoComplete="off"
                                />
                            </div>
                            <div style={{ marginBottom: 16 }}>
                                <label htmlFor="edit-customer-address" className="label" style={{ marginBottom: 6, display: 'block' }}>Address</label>
                                <textarea
                                    id="edit-customer-address"
                                    name="editCustomerAddress"
                                    className="input-field"
                                    style={{ width: '100%', minHeight: 80 }}
                                    value={selectedCustomer.address || ''}
                                    onChange={(e) => updateSelectedCustomer({ address: e.target.value })}
                                    autoComplete="street-address"
                                />
                            </div>
                            {error && <p className="text-sm text-error" style={{ marginBottom: 16 }} role="alert">{error}</p>}
                            <button type="submit" disabled={loading} className="btn btn-primary-blue btn--full touch-target" style={{ height: 42 }}>
                                {loading ? <><Loader2 className="animate-spin" aria-hidden="true" /> Updating...</> : (isAdmin ? "Update Customer" : "Send Edit Request")}
                            </button>
                        </form>
                        </div>
                    </div>
                </div>
            )}


            {/* Advanced Add Job Modal */}
            {showJobModal && selectedCustomer && (
                <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create job order">
                    <div className="modal" style={{ maxWidth: '800px' }}>
                        <button className="modal-close" onClick={() => { setShowJobModal(false); resetJobForm(); }}><X size={22} aria-hidden="true" /></button>
                        <h2 className="section-title mb-4">Create Job Order</h2>
                        <p className="muted mb-20">
                            For: <b>{selectedCustomer.name}</b>
                            {selectedCustomer.mobile ? ` (${formatForDisplay(selectedCustomer.mobile)})` : ''}
                        </p>

                        <form onSubmit={handleAddJob} className="row gap-xl items-start">
                            {/* Left Column: Selection */}
                            <div className="flex-1 stack-md">
                                <div className="p-16 bg-light rounded-lg border">
                                    <h3 className="text-sm font-bold uppercase muted mb-12">Product Selection</h3>
                                    <div className="stack-sm">
                                        <select
                                            className="input-field"
                                            value={selectedProduct?.id || ""}
                                            onChange={(e) => {
                                                const pid = e.target.value;
                                                const allProds = hierarchy.flatMap(c => c.subcategories.flatMap(s => s.products));
                                                const p = allProds.find(x => x.id === Number(pid));
                                                if (p) handleProductSelect(p);
                                            }}
                                        >
                                            <option value="">Choose a product...</option>
                                            {hierarchy.flatMap(cat =>
                                                cat.subcategories.flatMap(sub =>
                                                    sub.products.map(p => (
                                                        <option key={p.id} value={p.id}>{cat.name} &gt; {sub.name} &gt; {p.name}</option>
                                                    ))
                                                )
                                            )}
                                        </select>
                                        <div className="text-xs muted italic">Select a product to apply its pricing rules.</div>
                                    </div>
                                </div>

                                <div>
                                    <label className="label">Job Reference Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="e.g. Yearly Calendar Printing"
                                        value={jobData.job_name}
                                        onChange={(e) => setJobData({ ...jobData, job_name: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="row gap-md">
                                    <div className="flex-1">
                                        <label className="label">Quantity</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={jobData.quantity}
                                            onChange={(e) => calculateDynamicPrice(selectedProduct, e.target.value, extraInputs, jobData.customPaperRate)}
                                            required
                                        />
                                    </div>
                                    {turnaroundEstimate && (
                                        <div className="flex-1" style={{ alignSelf: 'flex-end' }}>
                                            <div style={{ padding: '8px 12px', background: 'var(--color-surface, #f0f4ff)', border: '1px solid var(--color-border, #d0d7e3)', borderRadius: '8px', fontSize: '0.82rem', lineHeight: 1.4 }}>
                                                <span style={{ marginRight: 4 }}>⏱️</span>
                                                Estimated completion: <strong>{new Date(turnaroundEstimate.ready_by).toLocaleDateString(undefined, { weekday: 'long' })}, {new Date(turnaroundEstimate.ready_by).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</strong>
                                                {' '}(~{turnaroundEstimate.predicted_hours}h)
                                            </div>
                                        </div>
                                    )}
                                    {selectedProduct?.has_paper_rate && (
                                        <div className="flex-1">
                                            <label className="label">Paper Rate (Add-on)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={jobData.customPaperRate}
                                                onChange={(e) => calculateDynamicPrice(selectedProduct, jobData.quantity, extraInputs, e.target.value)}
                                                step="0.01"
                                            />
                                        </div>
                                    )}
                                    {selectedProduct?.has_double_side_rate && (
                                        <div className="flex-1">
                                            <label className="label row items-center gap-xs">
                                                <input
                                                    type="checkbox"
                                                    checked={jobData.is_double_side}
                                                    onChange={(e) => {
                                                        const nextValue = e.target.checked;
                                                        setJobData((prev) => ({ ...prev, is_double_side: nextValue }));
                                                        calculateDynamicPrice(selectedProduct, jobData.quantity, extraInputs, jobData.customPaperRate, nextValue);
                                                    }}
                                                />
                                                Double Side
                                            </label>
                                        </div>
                                    )}
                                    <div className="flex-1">
                                        <label className="label">Delivery Date</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={jobData.delivery_date}
                                            onChange={(e) => setJobData({ ...jobData, delivery_date: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="label">Instructions / Description</label>
                                    <textarea
                                        className="input-field"
                                        style={{ minHeight: '60px' }}
                                        value={jobData.description}
                                        onChange={(e) => setJobData({ ...jobData, description: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="label">Branch</label>
                                    {isAdmin ? (
                                        <BranchSelect
                                            className="input-field"
                                            value={jobData.branch_id}
                                            onChange={(e) => setJobData({ ...jobData, branch_id: e.target.value })}
                                            required
                                        >
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </BranchSelect>
                                    ) : (
                                        <div className="input-field" style={{
                                            padding: '10px 14px',
                                            background: 'var(--color-surface-disabled, #f4f5f7)',
                                            border: '1px solid var(--color-border, #d0d7e3)',
                                            borderRadius: '8px',
                                            color: 'var(--color-text-muted, #5e6c84)',
                                            cursor: 'not-allowed'
                                        }}>
                                            {branches.find(b => String(b.id) === String(user?.branch_id))?.name || 'Assigned Branch'}
                                            <input type="hidden" name="branch_id" value={user?.branch_id || ''} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Pricing & Extras */}
                            <div className="flex-1 stack-md">
                                <div className="p-16 bg-surface rounded-lg border shadow-inner">
                                    <h3 className="text-sm font-bold uppercase muted mb-12">Extras & Charges</h3>
                                    <div className="stack-xs mb-12">
                                        {extraInputs.map((ex, idx) => (
                                            <div key={idx} className="row gap-sm">
                                                <input
                                                    placeholder="Purpose"
                                                    className="input-field text-sm p-8 flex-2"
                                                    value={ex.purpose}
                                                    onChange={e => updateExtraInput(idx, 'purpose', e.target.value)}
                                                />
                                                <input
                                                    type="number"
                                                    className="input-field text-sm p-8 flex-1"
                                                    value={ex.amount}
                                                    onChange={e => updateExtraInput(idx, 'amount', Number(e.target.value))}
                                                />
                                                <button type="button" className="btn btn-ghost p-4 text-error" aria-label={`Remove extra ${ex.purpose || 'charge'}`} onClick={() => removeExtraInput(idx)}><Trash2 size={14} aria-hidden="true" /></button>
                                            </div>
                                        ))}
                                        <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={addExtraInput}>
                                            <Plus size={14} className="mr-4" aria-hidden="true" /> Add Extra Charge
                                        </button>
                                    </div>

                                    <hr className="mb-12" />

                                    <div className="stack-xs font-mono text-sm">
                                        <div className="row space-between">
                                            <span>Base Price Calculation ({selectedProduct?.calculation_type || 'Manual'}):</span>
                                            <span>₹{(jobData.unit_price * jobData.quantity).toFixed(2)}</span>
                                        </div>
                                        <div className="row space-between">
                                            <span>Extras Total:</span>
                                            <span>₹{(jobData.total_amount - (jobData.unit_price * jobData.quantity)).toFixed(2)}</span>
                                        </div>
                                        <div className="row space-between font-bold text-lg mt-8 pt-8 border-t" style={{ color: 'var(--accent-2)' }}>
                                            <span>Grand Total:</span>
                                            <span>₹{Number(jobData.total_amount).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="label">Advance Payment Received (₹)</label>
                                    <input
                                        type="number"
                                        className="input-field mt-4"
                                        style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--success)' }}
                                        value={jobData.advance_paid}
                                        onChange={(e) => setJobData({ ...jobData, advance_paid: Number(e.target.value) })}
                                    />
                                </div>

                                <div className="p-12 bg-soft rounded border text-center">
                                    <div className="text-xs muted uppercase font-bold">Balance to Collect</div>
                                    <div className="text-2xl font-bold">₹{(jobData.total_amount - jobData.advance_paid).toFixed(2)}</div>
                                </div>

                                {error && <p className="text-sm text-error">{error}</p>}

                                <button type="submit" disabled={loading || !selectedProduct} className="btn btn-primary btn--full mt-8 py-16 text-lg">
                                    {loading ? <Loader2 className="animate-spin" /> : "Confirm & Create Job"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default Customers;

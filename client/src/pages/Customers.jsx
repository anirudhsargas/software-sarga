import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebounce } from '../hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Phone, User, Loader2, Plus, X, Edit2, Trash2, Filter, Mail, MapPin } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import localDb from '../services/localDb';
import { isTouchDevice } from '../services/utils';
import { calculateProductPrice } from '../utils/pricing';
import { whatsappUrl } from '../utils/whatsapp';
import { formatForDisplay, telHref } from '../utils/phone';
import Pagination from '../components/Pagination';
import CountryCodeSelect from '../components/CountryCodeSelect';
import { useConfirm } from '../contexts/ConfirmContext';
import SkeletonLoader from '../components/SkeletonLoader';
import ServerError from '../components/ServerError';
import toast from 'react-hot-toast';

const Customers = () => {
    useSEO('Customers');

    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin';
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [addFormDirty, setAddFormDirty] = useState(false);
    const [editFormDirty, setEditFormDirty] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
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

    const customerListRef = useRef(null);
    const customerVirtualizer = useVirtualizer({
        count: customers.length,
        getScrollElement: () => customerListRef.current,
        estimateSize: () => 72,
        overscan: 10,
    });


    const hasUnsavedChanges = (showAddModal && addFormDirty) || (showEditModal && editFormDirty);

    const updateNewCustomer = (patch) => {
        setNewCustomer(prev => ({ ...prev, ...patch }));
        setAddFormDirty(true);
    };

    const updateSelectedCustomer = (patch) => {
        setSelectedCustomer(prev => ({ ...prev, ...patch }));
        setEditFormDirty(true);
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

    const customerTypes = ['Walk-in', 'Retail', 'Offset'];


    // --- PAGINATION STATE ---
    // Already declared: page, setPage, totalPages, setTotalPages, total, setTotal
    const LIMIT = 20;

    // --- PAGINATED FETCH ---
    const fetchCustomers = async (pageNum = 1) => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            params.append('page', pageNum);
            params.append('limit', LIMIT);
            if (searchQuery) params.append('search', searchQuery);
            if (typeFilter) params.append('type', typeFilter);
            const res = await api.get(`/customers?${params.toString()}`);
            if (res.data?.data && res.data?.total !== undefined) {
                setCustomers(res.data.data);
                setTotal(res.data.total);
                setTotalPages(res.data.totalPages);
            } else if (Array.isArray(res.data)) {
                // Fallback for non-paginated response
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
        } catch (err) {
            setError('Failed to fetch customers from server');
            setCustomers([]);
        } finally {
            setLoading(false);
        }
    };

    // --- EFFECTS ---
    useEffect(() => { fetchCustomers(1); }, []);
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

    // --- PAGINATION HANDLER ---
    const goToPage = (pageNum) => {
        if (pageNum < 1 || pageNum > totalPages) return;
        fetchCustomers(pageNum);
    };

    const validateMobile = (value) => {
        return value.replace(/\D/g, '').slice(0, 10);
    };

    const handleAddCustomer = async (e) => {
        e.preventDefault();
        if (newCustomer.mobile.length !== 10) {
            return setError('Mobile number must be exactly 10 digits');
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
            setNewCustomer({ mobile: '', name: '', type: 'Walk-in', email: '', gst: '', address: '' });
            toast.success('Customer added locally');
            fetchCustomers();
        } catch (err) {
            setError('Failed to add customer');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateCustomer = async (e) => {
        e.preventDefault();
        if (selectedCustomer.mobile.length !== 10) {
            return setError('Mobile number must be exactly 10 digits');
        }
        
        setLoading(true);
        // Optimistic UI Update
        const prevCustomers = [...customers];
        setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, ...selectedCustomer } : c));
        try {
            await localDb.createCustomer(selectedCustomer); // createCustomer handles upsert
            closeEditModal(true);
            setSelectedCustomer(null);
            toast.success('Customer updated locally');
            fetchCustomers();
        } catch (err) {
            setError('Failed to update customer');
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
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to submit delete request');
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
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete customer');
            fetchCustomers();
        }
    };

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

    useEffect(() => {
        if (showJobModal) {
            fetchHierarchy();
            fetchBranches();
        } else {
            setTurnaroundEstimate(null);
        }
    }, [showJobModal]);

    // Fetch turnaround estimate when product + quantity + branch change
    useEffect(() => {
        if (!selectedProduct || !jobData.quantity || !jobData.branch_id) {
            setTurnaroundEstimate(null);
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const res = await api.post('/ai/turnaround', {
                    service_type: selectedProduct.category || selectedProduct.name,
                    quantity: Number(jobData.quantity),
                    branch_id: Number(jobData.branch_id),
                });
                setTurnaroundEstimate(res.data);
            } catch {
                setTurnaroundEstimate(null);
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [selectedProduct?.id, jobData.quantity, jobData.branch_id]);

    const fetchBranches = async () => {
        try {
            const data = await localDb.getBranches();
            setBranches(data || []);
            if ((data || []).length > 0) {
                setJobData(prev => ({ ...prev, branch_id: data[0].id }));
            }
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const fetchHierarchy = async () => {
        try {
            const data = await localDb.getProducts(); // Hierarchy is cached in meta/products
            setHierarchy(data);
        } catch (err) {
            console.error("Hierarchy error", err);
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
        } catch (err) {
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
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add job');
        } finally {
            setLoading(false);
        }
    };

    const resetJobForm = () => {
        setJobData({
            total_amount: 0, advance_paid: 0, delivery_date: '', applied_extras: [],
            branch_id: branches[0]?.id || '', customPaperRate: 0, is_double_side: false
        });
        setSelectedProduct(null);
        setExtraInputs([]);
    };

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

    return (
        <div className="stack-lg">
            <header className="page-header bg-surface p-16 rounded-lg shadow-sm">
                <div>
                    <h1 className="page-title row items-center gap-sm">
                        <Users className="text-accent" /> Customer Management
                    </h1>
                    <p className="muted">Manage your client database and create new job orders.</p>
                </div>
                <div className="row gap-sm flex-wrap">
                    <button
                        className="btn btn-ghost"
                        onClick={() => {
                            navigate('/dashboard/billing', {
                                state: {
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
                    >
                        <Plus size={18} /> Walk-in Job
                    </button>
                    <button className="btn btn-primary" onClick={() => { setAddFormDirty(false); setShowAddModal(true); }}>
                        <Plus size={18} /> Add New Customer
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface)', padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--muted)', pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search by name or mobile..."
                        className="input-field"
                        style={{ paddingLeft: 32, width: '100%', height: 36, fontSize: 14 }}
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '0 4px 0 8px', height: 36, flexShrink: 0 }}>
                    <Filter size={13} style={{ color: 'var(--muted)' }} />
                    <select
                        className="input-field"
                        style={{ border: 'none', background: 'transparent', boxShadow: 'none', height: 34, padding: '0 24px 0 2px', fontSize: 13, color: 'var(--text)', minWidth: 90 }}
                        value={typeFilter}
                        onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                    >
                        <option value="">All Types</option>
                        {customerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            <div className="card p-0 overflow-hidden shadow-sm">
                <div className="customer-list" style={{ display: 'flex', flexDirection: 'column' }}>
                {loading && customers.length === 0 ? (
                    <SkeletonLoader type="customer-list" count={8} />
                ) : error && customers.length === 0 ? (
                    <ServerError onRetry={fetchCustomers} message={error} />
                ) : customers.length === 0 ? (
                    <div className="text-center p-40 muted">No customers found.</div>
                ) : customers.map((c, idx) => (
                    <div
                        key={c.id}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '12px 14px',
                            borderBottom: idx < customers.length - 1 ? '1px solid var(--border)' : 'none',
                            cursor: 'pointer', transition: 'background 0.15s'
                        }}
                        {...(isTouchDevice()
                            ? { onClick: () => navigate(`/dashboard/customers/${c.id}`) }
                            : { onDoubleClick: () => navigate(`/dashboard/customers/${c.id}`) }
                        )}
                    >
                        {/* Avatar */}
                        <div style={{
                            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                            background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 16, color: 'var(--accent)', textTransform: 'uppercase'
                        }}>
                            {c.name?.charAt(0) || '?'}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{c.name}</span>
                                <span className={`badge badge--${c.type.toLowerCase().replace(' ', '')}`} style={{ fontSize: 11 }}>{c.type}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, color: 'var(--muted)', fontSize: 13 }}>
                                <Phone size={12} style={{ flexShrink: 0 }} />
                                <span style={{ fontFamily: 'monospace' }}>{formatForDisplay(c.mobile)}</span>
                                <a href={telHref(c.mobile)} title="Call" style={{ color: 'var(--success)', textDecoration: 'none', marginLeft: 4, display: 'flex' }}><Phone size={12} /></a>
                                <a href={whatsappUrl(c.mobile, `Dear ${c.name || 'Customer'},\n\nGreetings from Sarga! 🙏\n\nHow can we help you today?`)} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={{ color: '#25D366', textDecoration: 'none', marginLeft: 2, display: 'flex' }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                </a>
                            </div>
                            {c.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, color: 'var(--muted)', fontSize: 12, overflow: 'hidden' }}>
                                    <Mail size={11} style={{ flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div role="button" tabIndex={0} style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                            <button
                                className="btn btn-ghost"
                                style={{ fontSize: 12, padding: '5px 10px', height: 30, background: 'var(--accent-soft)', color: 'var(--accent)', gap: 4 }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate('/dashboard/billing', {
                                        state: {
                                            customer: { id: c.id, name: c.name, mobile: c.mobile, type: c.type, email: c.email || '', address: c.address || '', gst: c.gst || '' }
                                        }
                                    });
                                }}
                                title="Quick Add Job"
                            >
                                <Plus size={13} /> Job
                            </button>
                            <div style={{ display: 'flex', gap: 5 }}>
                                <button
                                    className="btn btn-ghost"
                                    style={{ padding: '5px 10px', height: 30, flex: 1 }}
                                    onClick={(e) => { e.stopPropagation(); setSelectedCustomer(c); setEditFormDirty(false); setShowEditModal(true); }}
                                    title={isAdmin ? 'Edit Customer' : 'Request Edit'}
                                >
                                    <Edit2 size={14} />
                                </button>
                                <button
                                    className="btn btn-ghost text-error"
                                    style={{ padding: '5px 10px', height: 30, flex: 1 }}
                                    onClick={(e) => { e.stopPropagation(); handleDeleteCustomer(c.id); }}
                                    title={isAdmin ? 'Delete Customer' : 'Request Delete'}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
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
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" aria-label="Close add customer modal" onClick={() => closeAddModal()}><X size={22} /></button>
                        <h2 className="section-title mb-16">Add New Customer</h2>
                        {addFormDirty && <div className="alert alert--warning mb-12">Unsaved changes</div>}
                        <form onSubmit={handleAddCustomer} className="stack-md">
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={newCustomer.name}
                                    onChange={(e) => updateNewCustomer({ name: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="row gap-md">
                                <div className="flex-1">
                                    <label className="label">Mobile Number</label>
                                    <div className="row gap-sm">
                                        <CountryCodeSelect value={newCustomer.countryCode} onChange={(val) => updateNewCustomer({ countryCode: val })} />
                                        <input
                                            type="tel"
                                            className="input-field"
                                            value={newCustomer.mobile}
                                            onChange={(e) => updateNewCustomer({ mobile: validateMobile(e.target.value) })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="label">Customer Type</label>
                                    <select
                                        className="input-field"
                                        value={newCustomer.type}
                                        onChange={(e) => updateNewCustomer({ type: e.target.value })}
                                    >
                                        {customerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="label">Email Address</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    value={newCustomer.email}
                                    onChange={(e) => updateNewCustomer({ email: e.target.value })}
                                />
                            </div>
                            <button type="submit" disabled={loading} className="btn btn-primary btn--full mt-8">
                                {loading ? <Loader2 className="animate-spin" /> : "Add Customer"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && selectedCustomer && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" aria-label="Close edit customer modal" onClick={() => closeEditModal()}><X size={22} /></button>
                        <h2 className="section-title mb-16">Edit Customer</h2>
                        {editFormDirty && <div className="alert alert--warning mb-12">Unsaved changes</div>}
                        <form onSubmit={handleUpdateCustomer} className="stack-md">
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={selectedCustomer.name}
                                    onChange={(e) => updateSelectedCustomer({ name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="row gap-md">
                                <div className="flex-1">
                                    <label className="label">Mobile Number</label>
                                    <div className="row gap-sm">
                                        <CountryCodeSelect value={selectedCustomer?.countryCode || '+91'} onChange={(val) => updateSelectedCustomer({ countryCode: val })} />
                                        <input
                                            type="tel"
                                            className="input-field"
                                            value={selectedCustomer.mobile}
                                            onChange={(e) => updateSelectedCustomer({ mobile: validateMobile(e.target.value) })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="label">Customer Type</label>
                                    <select
                                        className="input-field"
                                        value={selectedCustomer.type}
                                        onChange={(e) => updateSelectedCustomer({ type: e.target.value })}
                                    >
                                        {customerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="label">Email Address</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    value={selectedCustomer.email || ''}
                                    onChange={(e) => updateSelectedCustomer({ email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">GST Number</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={selectedCustomer.gst || ''}
                                    onChange={(e) => updateSelectedCustomer({ gst: e.target.value.toUpperCase() })}
                                />
                            </div>
                            <div>
                                <label className="label">Address</label>
                                <textarea
                                    className="input-field"
                                    style={{ minHeight: '80px' }}
                                    value={selectedCustomer.address || ''}
                                    onChange={(e) => updateSelectedCustomer({ address: e.target.value })}
                                />
                            </div>
                            {error && <p className="text-sm text-error">{error}</p>}
                            <button type="submit" disabled={loading} className="btn btn-primary btn--full mt-8">
                                {loading ? <Loader2 className="animate-spin" /> : (isAdmin ? "Update Customer" : "Send Edit Request")}
                            </button>
                        </form>
                    </div>
                </div>
            )}


            {/* Advanced Add Job Modal */}
            {showJobModal && selectedCustomer && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '800px' }}>
                        <button className="modal-close" onClick={() => { setShowJobModal(false); resetJobForm(); }}><X size={22} /></button>
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
                                            onChange={(e) => {
                                                const subId = e.target.value;
                                            }}
                                            defaultValue=""
                                        >
                                            <option value="" disabled>Select Product Hierarchy...</option>
                                            {hierarchy.map(cat => (
                                                <optgroup key={cat.id} label={cat.name}>
                                                    {cat.subcategories.map(sub => (
                                                        <optgroup key={sub.id} label={`  -- ${sub.name}`}>
                                                            {sub.products.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name}</option>
                                                            ))}
                                                        </optgroup>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>

                                        {/* Since standard select can't show nested perfectly, let's use a simple dropdown and handle change */}
                                        <div className="text-xs muted italic">Select a product to apply its pricing rules.</div>

                                        {/* Mocking the choice update for now, will refine with real selection logic */}
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
                                    <select
                                        className="input-field"
                                        value={jobData.branch_id}
                                        onChange={(e) => setJobData({ ...jobData, branch_id: e.target.value })}
                                        required
                                    >
                                        {branches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
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
                                                <button type="button" className="btn btn-ghost p-4 text-error" onClick={() => removeExtraInput(idx)}><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                        <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={addExtraInput}>
                                            <Plus size={14} className="mr-4" /> Add Extra Charge
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
        </div>
    );
};

export default Customers;

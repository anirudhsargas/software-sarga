import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Phone, User, Loader2, Plus, X, Edit2, Trash2, Filter, Mail, MapPin } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { isTouchDevice } from '../services/utils';
import { calculateProductPrice } from '../utils/pricing';
import Pagination from '../components/Pagination';
import { useConfirm } from '../contexts/ConfirmContext';

const Customers = () => {
    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin';
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [newCustomer, setNewCustomer] = useState({
        mobile: '',
        name: '',
        type: 'Walk-in',
        email: '',
        gst: '',
        address: ''
    });
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const customerTypes = ['Walk-in', 'Retail', 'Association', 'Offset'];

    useEffect(() => {
        fetchCustomers();
    }, [page, typeFilter]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchCustomers();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page, limit: 20 });
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            if (typeFilter) params.append('type', typeFilter);
            const response = await api.get(`/customers?${params}`);
            const res = response.data;
            setCustomers(res.data || []);
            setTotal(res.total || 0);
            setTotalPages(res.totalPages || 1);
        } catch (err) {
            setError('Failed to fetch customers');
        } finally {
            setLoading(false);
        }
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
            await api.post('/customers', newCustomer);
            setShowAddModal(false);
            setNewCustomer({ mobile: '', name: '', type: 'Walk-in', email: '', gst: '', address: '' });
            fetchCustomers();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add customer');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateCustomer = async (e) => {
        e.preventDefault();
        if (selectedCustomer.mobile.length !== 10) {
            return setError('Mobile number must be exactly 10 digits');
        }
        if (!isAdmin) {
            setLoading(true);
            try {
                await api.post('/requests/customer-change', {
                    customer_id: selectedCustomer.id,
                    action: 'EDIT',
                    payload: {
                        mobile: selectedCustomer.mobile,
                        name: selectedCustomer.name,
                        type: selectedCustomer.type,
                        email: selectedCustomer.email,
                        gst: selectedCustomer.gst,
                        address: selectedCustomer.address
                    }
                });
                setShowEditModal(false);
                setSelectedCustomer(null);
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to submit edit request');
            } finally {
                setLoading(false);
            }
            return;
        }

        setLoading(true);
        try {
            await api.put(`/customers/${selectedCustomer.id}`, selectedCustomer);
            setShowEditModal(false);
            setSelectedCustomer(null);
            fetchCustomers();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update customer');
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

        try {
            await api.delete(`/customers/${id}`);
            fetchCustomers();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete customer');
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

    useEffect(() => {
        if (showJobModal) {
            fetchHierarchy();
            fetchBranches();
        }
    }, [showJobModal]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data || []);
            if ((response.data || []).length > 0) {
                setJobData(prev => ({ ...prev, branch_id: response.data[0].id }));
            }
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const fetchHierarchy = async () => {
        try {
            const res = await api.get('/product-hierarchy');
            setHierarchy(res.data);
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
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
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
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
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
                {loading && customers.length === 0 ? (
                    <div className="text-center p-40 muted">Loading customers...</div>
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
                                <span style={{ fontFamily: 'monospace' }}>+91 {c.mobile}</span>
                            </div>
                            {c.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, color: 'var(--muted)', fontSize: 12, overflow: 'hidden' }}>
                                    <Mail size={11} style={{ flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
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
                                    onClick={(e) => { e.stopPropagation(); setSelectedCustomer(c); setShowEditModal(true); }}
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
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

            {/* Modals... */}
            {showAddModal && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={22} /></button>
                        <h2 className="section-title mb-16">Add New Customer</h2>
                        <form onSubmit={handleAddCustomer} className="stack-md">
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={newCustomer.name}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="row gap-md">
                                <div className="flex-1">
                                    <label className="label">Mobile Number</label>
                                    <div className="row gap-sm">
                                        <span className="badge" style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--bg-light)' }}>+91</span>
                                        <input
                                            type="tel"
                                            className="input-field"
                                            placeholder="10-digit mobile"
                                            value={newCustomer.mobile}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, mobile: validateMobile(e.target.value) })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="label">Customer Type</label>
                                    <select
                                        className="input-field"
                                        value={newCustomer.type}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, type: e.target.value })}
                                    >
                                        {customerTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="label">Email Address (Optional)</label>
                                <input
                                    type="email"
                                    className="input-field"
                                    value={newCustomer.email}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">GST Number (Optional)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={newCustomer.gst}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, gst: e.target.value.toUpperCase() })}
                                    placeholder="GSTIN"
                                />
                            </div>
                            <div>
                                <label className="label">Full Address</label>
                                <textarea
                                    className="input-field"
                                    style={{ minHeight: '80px', resize: 'vertical' }}
                                    value={newCustomer.address}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                />
                            </div>

                            {error && <p className="text-sm text-error">{error}</p>}

                            <button type="submit" disabled={loading} className="btn btn-primary btn--full mt-8">
                                {loading ? <Loader2 className="animate-spin" /> : "Save Customer"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && selectedCustomer && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" onClick={() => setShowEditModal(false)}><X size={22} /></button>
                        <h2 className="section-title mb-16">Edit Customer</h2>
                        <form onSubmit={handleUpdateCustomer} className="stack-md">
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={selectedCustomer.name}
                                    onChange={(e) => setSelectedCustomer({ ...selectedCustomer, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="row gap-md">
                                <div className="flex-1">
                                    <label className="label">Mobile Number</label>
                                    <div className="row gap-sm">
                                        <span className="badge" style={{ padding: '12px 14px', borderRadius: '12px' }}>+91</span>
                                        <input
                                            type="tel"
                                            className="input-field"
                                            value={selectedCustomer.mobile}
                                            onChange={(e) => setSelectedCustomer({ ...selectedCustomer, mobile: validateMobile(e.target.value) })}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="label">Customer Type</label>
                                    <select
                                        className="input-field"
                                        value={selectedCustomer.type}
                                        onChange={(e) => setSelectedCustomer({ ...selectedCustomer, type: e.target.value })}
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
                                    onChange={(e) => setSelectedCustomer({ ...selectedCustomer, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">GST Number</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={selectedCustomer.gst || ''}
                                    onChange={(e) => setSelectedCustomer({ ...selectedCustomer, gst: e.target.value.toUpperCase() })}
                                    placeholder="GSTIN"
                                />
                            </div>
                            <div>
                                <label className="label">Address</label>
                                <textarea
                                    className="input-field"
                                    style={{ minHeight: '80px', resize: 'vertical' }}
                                    value={selectedCustomer.address || ''}
                                    onChange={(e) => setSelectedCustomer({ ...selectedCustomer, address: e.target.value })}
                                />
                            </div>

                            {error && <p className="text-sm text-error">{error}</p>}

                            <button type="submit" disabled={loading} className="btn btn-primary btn--full">
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
                            {selectedCustomer.mobile ? ` (+91 ${selectedCustomer.mobile})` : ''}
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

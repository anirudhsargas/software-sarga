import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, X, Trash2, Filter, Receipt, Loader2, Calendar, User, CreditCard, ShoppingBag, ExternalLink, FileText, Search, PlusCircle, Building2 } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { serverToday, serverDateTimeLocal } from '../services/serverTime';
import Pagination from '../components/Pagination';
import { useConfirm } from '../contexts/ConfirmContext';

const Payments = () => {
    const { confirm } = useConfirm();
    const location = useLocation();
    const [payments, setPayments] = useState([]);
    const [branches, setBranches] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showAddMethodModal, setShowAddMethodModal] = useState(false);
    const [newMethodName, setNewMethodName] = useState('');
    const [filters, setFilters] = useState({ branch_id: '', type: '', startDate: '', endDate: '' });
    const [formData, setFormData] = useState({
        branch_id: '',
        type: 'Utility',
        payee_name: '',
        amount: '',
        payment_method: 'Cash',
        cash_amount: '',
        upi_amount: '',
        reference_number: '',
        description: '',
        payment_date: serverDateTimeLocal(),
        vendor_id: '',
        period_start: '',
        period_end: '',
        staff_id: '',
        is_partial_payment: false,
        bill_total_amount: '',
        bill_reference_id: null
    });
    const [vendors, setVendors] = useState([]);
    const [showVendorModal, setShowVendorModal] = useState(false);
    const [newVendor, setNewVendor] = useState({ name: '', type: 'Vendor', contact_person: '', phone: '', address: '', branch_id: '', order_link: '', gstin: '' });
    const [showStatementModal, setShowStatementModal] = useState(false);
    const [showPayeeListModal, setShowPayeeListModal] = useState(false);
    const [payeeSearch, setPayeeSearch] = useState('');
    const [payeeFilter, setPayeeFilter] = useState('');
    const [payeeStatement, setPayeeStatement] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isAutoPay, setIsAutoPay] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    // Bill Recording State
    const [showBillModal, setShowBillModal] = useState(false);
    const [inventory, setInventory] = useState([]);
    const [billData, setBillData] = useState({
        vendor_id: '',
        bill_number: '',
        bill_date: serverToday(),
        items: [] // { inventory_item_id, name, quantity, unit_cost, total_cost }
    });
    const [billSearch, setBillSearch] = useState('');

    const types = ['Vendor', 'Utility', 'Salary', 'Rent', 'Other'];

    useEffect(() => {
        fetchPayments();
        fetchBranches();
        fetchPaymentMethods();
        fetchVendors();
        fetchInventory();
        fetchStaff();
    }, []);

    useEffect(() => {
        fetchPayments();
    }, [page]);

    const fetchStaff = async () => {
        try {
            const res = await api.get('/staff');
            setStaffList(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) { console.error('Failed to fetch staff', err); }
    };

    const fetchInventory = async () => {
        try {
            const res = await api.get('/inventory');
            setInventory(Array.isArray(res.data) ? res.data : (res.data?.data || []));
        } catch (err) { console.error('Failed to fetch inventory', err); }
    };

    useEffect(() => {
        if (!location.state?.paymentPrefill) return;
        const { amount, payee_name, description, type, staff_id } = location.state.paymentPrefill;
        setShowModal(true);
        setFormData(prev => ({
            ...prev,
            amount: amount ? Number(amount).toFixed(2) : '',
            payee_name: payee_name || prev.payee_name,
            description: description || prev.description,
            type: type || 'Other',
            staff_id: staff_id || '',
            payment_method: 'Cash'
        }));
    }, [location.state]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            const branchData = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            setBranches(branchData);
            if (branchData.length > 0) {
                setFormData(prev => ({ ...prev, branch_id: branchData[0].id }));
            }
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const fetchPaymentMethods = async () => {
        try {
            const response = await api.get('/payment-methods');
            setPaymentMethods(Array.isArray(response.data) ? response.data : (response.data?.data || []));
        } catch (err) {
            console.error('Failed to fetch payment methods');
        }
    };

    const fetchVendors = async (type = '') => {
        try {
            const params = type ? `?type=${type}` : '';
            const response = await api.get(`/vendors${params}`);
            setVendors(Array.isArray(response.data) ? response.data : (response.data?.data || []));
        } catch (err) {
            console.error('Failed to fetch vendors');
        }
    };

    const fetchPayeeStatement = async (payeeId) => {
        setLoading(true);
        try {
            const response = await api.get(`/vendors/${payeeId}/statement`);
            setPayeeStatement(response.data);
            setShowStatementModal(true);
        } catch (err) {
            setError('Failed to fetch statement');
        } finally {
            setLoading(false);
        }
    };

    const fetchPayments = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 20 });
            if (filters.branch_id) params.append('branch_id', filters.branch_id);
            if (filters.type) params.append('type', filters.type);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);

            const response = await api.get(`/payments?${params.toString()}`);
            const res = response.data;
            setPayments(Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []));
            setTotal(res.total || 0);
            setTotalPages(res.totalPages || 1);
        } catch (err) {
            setError('Failed to fetch payments');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate "Both" payment method
        if (formData.payment_method === 'Both') {
            const cash = Number(formData.cash_amount) || 0;
            const upi = Number(formData.upi_amount) || 0;
            const total = Number(formData.amount) || 0;

            if (Math.abs(cash + upi - total) > 0.01) {
                setError('Cash + UPI must equal total amount');
                return;
            }
        }

        setLoading(true);
        setError('');
        try {
            const finalFormData = {
                ...formData,
                payment_date: formData.payment_date || serverDateTimeLocal()
            };
            const isConfirmed = await confirm({
                title: 'Record Payment',
                message: `Record payment of ₹${Number(formData.amount).toFixed(2)} to ${formData.payee_name || 'payee'} via ${formData.payment_method}?`,
                confirmText: 'Record',
                type: 'primary'
            });
            if (!isConfirmed) {
                setLoading(false);
                return;
            }
            await api.post('/payments', finalFormData);
            setSuccess('Payment recorded successfully!');
            setTimeout(() => setSuccess(''), 3000);
            setShowModal(false);
            setFormData({
                branch_id: branches[0]?.id || '',
                type: 'Utility',
                payee_name: '',
                amount: '',
                payment_method: 'Cash',
                cash_amount: '',
                upi_amount: '',
                reference_number: '',
                description: '',
                payment_date: serverDateTimeLocal(),
                vendor_id: '',
                period_start: '',
                period_end: '',
                is_partial_payment: false,
                bill_total_amount: '',
                bill_reference_id: null
            });
            fetchPayments();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    const handleBillSubmit = async (e) => {
        e.preventDefault();
        if (!billData.items.length) {
            setError('Please add at least one item to the bill');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const billTotal = billData.items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
            const isConfirmed = await confirm({
                title: 'Record Purchase Bill',
                message: `Record purchase bill of ₹${billTotal.toFixed(2)}?\nBill #: ${billData.bill_number || 'N/A'}\nItems: ${billData.items.length}`,
                confirmText: 'Record',
                type: 'primary'
            });
            if (!isConfirmed) {
                setLoading(false);
                return;
            }
            await api.post('/vendor-bills', billData);
            setSuccess('Purchase bill recorded successfully!');
            setTimeout(() => {
                setSuccess('');
                setShowBillModal(false);
            }, 1500);
            setBillData({
                vendor_id: '',
                bill_number: '',
                bill_date: serverToday(),
                items: []
            });
            await fetchVendors(); // Refresh balance/history
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to record bill');
        } finally {
            setLoading(false);
        }
    };

    const addBillItem = (invItem) => {
        const existing = billData.items.find(i => i.inventory_item_id === invItem.id);
        if (existing) return;

        setBillData({
            ...billData,
            items: [...billData.items, {
                inventory_item_id: invItem.id,
                name: invItem.name,
                quantity: 1,
                unit_cost: invItem.cost_price || 0,
                total_cost: invItem.cost_price || 0
            }]
        });
        setBillSearch('');
    };

    const updateBillItem = (index, field, value) => {
        const newItems = [...billData.items];
        newItems[index][field] = value;
        if (field === 'quantity' || field === 'unit_cost') {
            newItems[index].total_cost = (Number(newItems[index].quantity) || 0) * (Number(newItems[index].unit_cost) || 0);
        }
        setBillData({ ...billData, items: newItems });
    };

    const removeBillItem = (index) => {
        setBillData({
            ...billData,
            items: billData.items.filter((_, i) => i !== index)
        });
    };

    const handleAddPaymentMethod = async () => {
        if (!newMethodName.trim()) {
            setError('Payment method name is required');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.post('/payment-methods', { name: newMethodName });
            setShowAddMethodModal(false);
            setNewMethodName('');
            fetchPaymentMethods();
            setFormData({ ...formData, payment_method: newMethodName });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add payment method');
        } finally {
            setLoading(false);
        }
    };

    const handleAddVendor = async (e) => {
        e.preventDefault();
        if (!newVendor.name.trim()) {
            setError('Vendor name is required');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await api.post('/vendors', newVendor);
            setSuccess('Payee added successfully!');
            await fetchVendors(); // Await refresh
            setTimeout(() => {
                setSuccess('');
                setShowVendorModal(false);
            }, 1500);
            setNewVendor({ name: '', type: 'Vendor', contact_person: '', phone: '', address: '', branch_id: '', order_link: '', gstin: '' });
            setFormData({ ...formData, vendor_id: response.data.id, payee_name: newVendor.name });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add payee');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Payment',
            message: 'Are you sure you want to delete this payment record?',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;
        try {
            await api.delete(`/payments/${id}`);
            fetchPayments();
        } catch (err) {
            setError('Failed to delete payment');
        }
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Payments & Expenditure</h1>
                    <p className="section-subtitle">Record and track vendor payments, utility bills, and other expenses.</p>
                </div>
                <div className="row gap-sm">
                    {['Admin', 'Accountant'].includes(auth.getUser()?.role) && (
                        <>
                            <button onClick={() => { fetchVendors(); setShowPayeeListModal(true); }} className="btn btn-ghost">
                                <User size={20} />
                                <span>Manage Payees</span>
                            </button>
                            <button onClick={() => { setNewVendor({ name: '', type: 'Vendor', contact_person: '', phone: '', address: '', branch_id: '', order_link: '', gstin: '' }); setShowVendorModal(true); }} className="btn btn-ghost">
                                <Plus size={20} />
                                <span>Add Payee/Entity</span>
                            </button>
                        </>
                    )}
                    <button onClick={() => { setIsAutoPay(false); setShowModal(true); }} className="btn btn-primary">
                        <Plus size={20} />
                        <span>Record Payment</span>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="panel panel--tight">
                <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
                    <div className="flex-1" style={{ minWidth: '200px' }}>
                        <label className="label">Branch</label>
                        <select
                            className="input-field"
                            value={filters.branch_id}
                            onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
                        >
                            <option value="">All Branches</option>
                            {(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                    <div className="flex-1" style={{ minWidth: '150px' }}>
                        <label className="label">Type</label>
                        <select
                            className="input-field"
                            value={filters.type}
                            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                        >
                            <option value="">All Types</option>
                            {types.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                    <div className="flex-1" style={{ minWidth: '150px' }}>
                        <label className="label">Start Date</label>
                        <input
                            type="date"
                            className="input-field"
                            value={filters.startDate}
                            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                        />
                    </div>
                    <div className="flex-1" style={{ minWidth: '150px' }}>
                        <label className="label">End Date</label>
                        <input
                            type="date"
                            className="input-field"
                            value={filters.endDate}
                            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                        />
                    </div>
                    <div style={{ alignSelf: 'flex-end' }}>
                        <button onClick={fetchPayments} className="btn btn-ghost">
                            <Filter size={18} />
                            <span>Apply</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Payee / Purpose</th>
                                <th>Vendor</th>
                                <th>Period</th>
                                <th>Branch</th>
                                <th>Type</th>
                                <th>Method</th>
                                <th>Amount</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && payments.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="text-center muted table-empty">
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : payments.length === 0 ? (
                                <tr>
                                    <td colSpan="9" className="text-center muted table-empty">
                                        No payment records found.
                                    </td>
                                </tr>
                            ) : (
                                (payments || []).map((p) => (
                                    <tr
                                        key={p.id}
                                        onDoubleClick={p.vendor_id ? () => fetchPayeeStatement(p.vendor_id) : undefined}
                                        style={{ cursor: p.vendor_id ? 'pointer' : 'default' }}
                                        title={p.vendor_id ? 'Double-click to view statement' : ''}
                                    >
                                        <td className="text-sm">
                                            <div className="stack-sm">
                                                <div className="row gap-sm">
                                                    <Calendar size={14} className="muted" />
                                                    {new Date(p.payment_date).toLocaleDateString()}
                                                </div>
                                                <span className="text-xs muted">
                                                    {new Date(p.payment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="stack-sm">
                                                <span className="user-name">{p.payee_name}</span>
                                                <span className="text-xs muted">{p.description}</span>
                                            </div>
                                        </td>
                                        <td className="text-sm">
                                            {p.vendor_name ? (
                                                <span className="badge badge--outline">{p.vendor_name}</span>
                                            ) : (
                                                <span className="muted">--</span>
                                            )}
                                        </td>
                                        <td className="text-xs muted">
                                            {p.period_start ? (
                                                <div className="stack-xs">
                                                    <span>{new Date(p.period_start).toLocaleDateString()}</span>
                                                    <span>to {new Date(p.period_end).toLocaleDateString()}</span>
                                                </div>
                                            ) : '--'}
                                        </td>
                                        <td className="text-sm">{p.branch_name}</td>
                                        <td><span className="badge">{p.type}</span></td>
                                        <td className="text-sm muted">
                                            <div className="stack-sm">
                                                <div className="row gap-sm">
                                                    <CreditCard size={14} />
                                                    {p.payment_method}
                                                </div>
                                                {p.payment_method === 'Both' && (
                                                    <span className="text-xs muted">
                                                        Cash: ₹{Number(p.cash_amount || 0).toLocaleString()} | UPI: ₹{Number(p.upi_amount || 0).toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-accent">₹{Number(p.amount).toLocaleString()}</td>
                                        <td>
                                            <button
                                                className="btn btn-ghost btn-danger"
                                                style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                onClick={() => handleDelete(p.id)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={(p) => { setPage(p); }} />

            {showModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => setShowModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">
                            {isAutoPay ? `Payment to ${formData.payee_name}` : 'Record New Payment'}
                        </h2>
                        <form onSubmit={handleSubmit} className="stack-md">
                            {!isAutoPay && (
                                <div className="row gap-sm">
                                    <div className="flex-1">
                                        <label className="label">Branch</label>
                                        <select
                                            className="input-field"
                                            value={formData.branch_id}
                                            onChange={(e) => setFormData({ ...formData, branch_id: e.target.value })}
                                            required
                                        >
                                            {(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="label">Payment Type</label>
                                        <select
                                            className="input-field"
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                            required
                                        >
                                            {types.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {!isAutoPay && (
                                <>
                                    <label className="label">Payee / Entity</label>
                                    <div className="row gap-sm">
                                        <select
                                            className="input-field"
                                            style={{ flex: 1 }}
                                            value={formData.vendor_id}
                                            onChange={(e) => {
                                                const v = (vendors || []).find(vend => vend.id == e.target.value);
                                                setFormData({ ...formData, vendor_id: e.target.value, payee_name: v ? v.name : '' });
                                            }}
                                            required
                                        >
                                            <option value="">Select Payee</option>
                                            {(vendors || []).filter(v => v.type === formData.type).map(v => (
                                                <option key={v.id} value={v.id}>{v.name}</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            className="btn btn-ghost"
                                            onClick={() => {
                                                setNewVendor(prev => ({ ...prev, type: formData.type }));
                                                setShowVendorModal(true);
                                            }}
                                            title={`Add New ${formData.type}`}
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="label">{formData.type === 'Vendor' ? 'Purpose' : 'Payee Name / Purpose'}</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder={formData.type === 'Vendor' ? 'e.g. Bulk Paper, Machines' : 'e.g. Electric Dept, Vendor XYZ'}
                                    value={formData.payee_name}
                                    onChange={(e) => setFormData({ ...formData, payee_name: e.target.value })}
                                    required
                                    disabled={isAutoPay && formData.vendor_id}
                                />
                            </div>

                            {!isAutoPay && (
                                <div className="row gap-sm">
                                    <div className="flex-1">
                                        <label className="label">Collecting Period (From)</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={formData.period_start}
                                            onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="label">Collecting Period (To)</label>
                                        <input
                                            type="date"
                                            className="input-field"
                                            value={formData.period_end}
                                            onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="row gap-sm">
                                {/* Amount and DateTime row merged for normal view, but datetime hidden now */}
                                <div className="flex-1">
                                    <label className="label">Amount (₹)</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Partial Payment Section - for Rent, Vendor, and Salary types */}
                            {['Rent', 'Vendor', 'Salary'].includes(formData.type) && (
                                <div className="stack-sm bg-light p-12 rounded" style={{ borderLeft: '3px solid var(--accent)' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.is_partial_payment}
                                            onChange={(e) => setFormData({ ...formData, is_partial_payment: e.target.checked })}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <span>This is a partial payment</span>
                                    </label>
                                    {formData.is_partial_payment && (
                                        <>
                                            <div>
                                                <label className="label">Total Bill Amount (₹)</label>
                                                <input
                                                    type="number"
                                                    className="input-field"
                                                    placeholder="e.g. 95000"
                                                    value={formData.bill_total_amount}
                                                    onChange={(e) => setFormData({ ...formData, bill_total_amount: e.target.value })}
                                                />
                                                <small className="text-xs muted" style={{ marginTop: '4px', display: 'block' }}>
                                                    Total amount outstanding for this bill
                                                </small>
                                            </div>
                                            {formData.bill_total_amount && formData.amount && (
                                                <div className="stack-xs">
                                                    <div className="row space-between text-sm">
                                                        <span className="muted">Total Bill:</span>
                                                        <span className="font-semibold">₹{Number(formData.bill_total_amount).toLocaleString()}</span>
                                                    </div>
                                                    <div className="row space-between text-sm">
                                                        <span className="muted">Paying Today:</span>
                                                        <span className="font-semibold text-success">₹{Number(formData.amount).toLocaleString()}</span>
                                                    </div>
                                                    <div className="row space-between text-sm" style={{ paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                                                        <span className="muted">Remaining Balance:</span>
                                                        <span className="font-semibold text-accent">₹{Math.max(0, Number(formData.bill_total_amount) - Number(formData.amount)).toLocaleString()}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Payment Method</label>
                                    <div className="row gap-sm">
                                        <select
                                            className="input-field"
                                            style={{ flex: 1 }}
                                            value={formData.payment_method}
                                            onChange={(e) => {
                                                setFormData({ ...formData, payment_method: e.target.value });
                                                if (e.target.value !== 'Both') {
                                                    setFormData(prev => ({ ...prev, cash_amount: '', upi_amount: '' }));
                                                }
                                            }}
                                            required
                                        >
                                            {(paymentMethods || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                                        </select>
                                        {['Admin', 'Accountant'].includes(auth.getUser()?.role) && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost"
                                                onClick={() => setShowAddMethodModal(true)}
                                            >
                                                <Plus size={18} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {formData.type === 'Salary' ? (
                                    <div className="flex-1">
                                        <label className="label">Staff Member <span className="text-red-500">*</span></label>
                                        <select
                                            className="input-field"
                                            value={formData.staff_id || ''}
                                            onChange={(e) => {
                                                const selectedStaff = (staffList || []).find(s => s.id == e.target.value);
                                                setFormData(prev => ({
                                                    ...prev,
                                                    staff_id: e.target.value,
                                                    payee_name: selectedStaff ? selectedStaff.name : ''
                                                }));
                                            }}
                                            required
                                        >
                                            <option value="">Select Staff</option>
                                            {(staffList || []).map(s => (
                                                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="flex-1">
                                        <div className="row justify-between align-center mb-1">
                                            <label className="label">Payee / Vendor <span className="text-red-500">*</span></label>
                                            <button
                                                type="button"
                                                className="text-xs text-primary hover-underline"
                                                onClick={() => setShowPayeeListModal(true)}
                                            >
                                                Select / Manage
                                            </button>
                                        </div>
                                        <div className="input-group">
                                            <input
                                                type="text"
                                                className="input-field"
                                                list="payee-suggestions"
                                                value={formData.payee_name}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const vendor = (vendors || []).find(v => v.name === val);
                                                    setFormData({
                                                        ...formData,
                                                        payee_name: val,
                                                        vendor_id: vendor ? vendor.id : ''
                                                    });
                                                }}
                                                placeholder={formData.type === 'Utility' ? 'e.g. KSEB' : 'Name of person/business'}
                                                required
                                            />
                                            <datalist id="payee-suggestions">
                                                {vendors && vendors
                                                    .filter(v => !formData.type || v.type === formData.type)
                                                    .map(v => (
                                                        <option key={v.id} value={v.name} />
                                                    ))}
                                            </datalist>
                                            {formData.vendor_id && (
                                                <div className="input-icon-right text-success">
                                                    <User size={16} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Reference # (Optional)</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="UTR, Chq #, etc."
                                        value={formData.reference_number}
                                        onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                                    />
                                </div>
                            </div>

                            {formData.payment_method === 'Both' && (
                                <div className="row gap-sm">
                                    <div className="flex-1">
                                        <label className="label">Cash Amount (₹)</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={formData.cash_amount}
                                            onChange={(e) => setFormData({ ...formData, cash_amount: e.target.value })}
                                            required
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="label">UPI Amount (₹)</label>
                                        <input
                                            type="number"
                                            className="input-field"
                                            value={formData.upi_amount}
                                            onChange={(e) => setFormData({ ...formData, upi_amount: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="label">Description / Remarks</label>
                                <textarea
                                    className="input-field"
                                    rows="2"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
                            {success && <p className="text-sm" style={{ color: 'var(--color-ok)' }}>{success}</p>}
                            <button type="submit" className="btn btn-primary btn--full" disabled={loading}>
                                {loading ? <Loader2 className="animate-spin" /> : 'Record Payment'}
                            </button>
                        </form>
                    </div>
                </div >
            )}

            {
                showAddMethodModal && (
                    <div className="modal-backdrop">
                        <div className="modal" style={{ maxWidth: '400px' }}>
                            <button className="modal-close" onClick={() => { setShowAddMethodModal(false); setNewMethodName(''); setError(''); }}>
                                <X size={22} />
                            </button>
                            <h2 className="section-title mb-16">Add Payment Method</h2>
                            <div className="stack-md">
                                <div>
                                    <label className="label">Method Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="e.g., PhonePe, PayTM"
                                        value={newMethodName}
                                        onChange={(e) => setNewMethodName(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleAddPaymentMethod()}
                                        autoFocus
                                    />
                                </div>
                                {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
                                <button onClick={handleAddPaymentMethod} className="btn btn-primary btn--full" disabled={loading}>
                                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Add Method'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            {showVendorModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '500px' }}>
                        <button className="modal-close" onClick={() => { setNewVendor({ name: '', type: 'Vendor', contact_person: '', phone: '', address: '', branch_id: '', order_link: '', gstin: '' }); setShowVendorModal(false); setError(''); }}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Add New Payee</h2>
                        <form onSubmit={handleAddVendor} className="stack-md">
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Payee Name *</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="e.g. ABC Paper Mills"
                                        value={newVendor.name}
                                        onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Payee Type</label>
                                    <select
                                        className="input-field"
                                        value={newVendor.type}
                                        onChange={(e) => setNewVendor({ ...newVendor, type: e.target.value })}
                                        required
                                    >
                                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Contact Person</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="John Doe"
                                        value={newVendor.contact_person}
                                        onChange={(e) => setNewVendor({ ...newVendor, contact_person: e.target.value })}
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Phone / Mobile</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="9876543210"
                                        value={newVendor.phone}
                                        onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Address</label>
                                <textarea
                                    className="input-field"
                                    rows="2"
                                    placeholder="Full address of the vendor"
                                    value={newVendor.address}
                                    onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Order Link (Optional)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Link to order page or document"
                                    value={newVendor.order_link}
                                    onChange={(e) => setNewVendor({ ...newVendor, order_link: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">GSTIN (Optional)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="GST Identification Number"
                                    value={newVendor.gstin}
                                    onChange={(e) => setNewVendor({ ...newVendor, gstin: e.target.value })}
                                />
                            </div>
                            {['Admin', 'Accountant'].includes(auth.getUser()?.role) && (
                                <div>
                                    <label className="label">Applicable Branch</label>
                                    <select
                                        className="input-field"
                                        value={newVendor.branch_id}
                                        onChange={(e) => setNewVendor({ ...newVendor, branch_id: e.target.value })}
                                    >
                                        <option value="">Whole Shop (Global)</option>
                                        {(branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
                            {success && <p className="text-sm" style={{ color: 'var(--color-ok)' }}>{success}</p>}
                            <button type="submit" className="btn btn-primary btn--full" disabled={loading}>
                                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Create Payee'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
            {showBillModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '700px', width: '95%' }}>
                        <button className="modal-close" onClick={() => setShowBillModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">Record Purchase Bill</h2>
                        <form onSubmit={handleBillSubmit} className="stack-md">
                            <div className="row gap-sm">
                                <div className="flex-1">
                                    <label className="label">Bill Number</label>
                                    <input
                                        className="input-field"
                                        value={billData.bill_number}
                                        onChange={(e) => setBillData({ ...billData, bill_number: e.target.value })}
                                        placeholder="Invoice # / Bill #"
                                        required
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="label">Bill Date</label>
                                    <input
                                        type="date"
                                        className="input-field"
                                        value={billData.bill_date}
                                        onChange={(e) => setBillData({ ...billData, bill_date: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="stack-sm">
                                <label className="label">Add Items from Inventory</label>
                                <div className="input-group">
                                    <div className="input-icon">
                                        <Search size={16} />
                                    </div>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Search inventory items..."
                                        value={billSearch}
                                        onChange={(e) => setBillSearch(e.target.value)}
                                    />
                                </div>
                                {billSearch && (
                                    <div className="dropdown-panel border-all rounded stack-xs shadow-md" style={{ maxHeight: '200px', overflowY: 'auto', position: 'absolute', background: 'white', width: '90%', zIndex: 100 }}>
                                        {(inventory || [])
                                            .filter(i => i.name.toLowerCase().includes(billSearch.toLowerCase()) || i.sku?.toLowerCase().includes(billSearch.toLowerCase()))
                                            .map(item => (
                                                <div
                                                    key={item.id}
                                                    className="dropdown-item row justify-between p-8 hover-surface"
                                                    onClick={() => addBillItem(item)}
                                                >
                                                    <div>
                                                        <div className="text-sm font-medium">{item.name}</div>
                                                        <div className="text-xs muted">{item.sku || 'No SKU'} • Stock: {item.quantity} {item.unit}</div>
                                                    </div>
                                                    <div className="text-sm text-primary font-bold">₹{item.cost_price}</div>
                                                </div>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>

                            {billData.items.length > 0 && (
                                <div className="border-all rounded overflow-hidden">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Item</th>
                                                <th style={{ width: '80px' }}>Qty</th>
                                                <th style={{ width: '100px' }}>Cost</th>
                                                <th style={{ width: '100px' }}>Total</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {billData.items.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="text-sm">{item.name}</td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            className="input-field input-sm"
                                                            value={item.quantity}
                                                            onChange={(e) => updateBillItem(idx, 'quantity', e.target.value)}
                                                            min="1"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            type="number"
                                                            className="input-field input-sm"
                                                            value={item.unit_cost}
                                                            onChange={(e) => updateBillItem(idx, 'unit_cost', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="text-sm font-medium">₹{Number(item.total_cost).toLocaleString()}</td>
                                                    <td>
                                                        <button type="button" className="btn btn-ghost btn-danger p-4" onClick={() => removeBillItem(idx)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-surface-lowest">
                                            <tr>
                                                <td colSpan="3" className="text-right font-bold">Grand Total:</td>
                                                <td colSpan="2" className="text-primary font-bold">₹{billData.items.reduce((sum, i) => sum + i.total_cost, 0).toLocaleString()}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
                            {success && <p className="text-sm" style={{ color: 'var(--color-ok)' }}>{success}</p>}
                            <div className="row gap-sm">
                                <button type="button" className="btn btn-ghost flex-1" onClick={() => setShowBillModal(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary flex-1" disabled={loading}>
                                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Save Bill'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )
            }
            {showStatementModal && payeeStatement && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '800px', width: '90%' }}>
                        <button className="modal-close" onClick={() => setShowStatementModal(false)}>
                            <X size={22} />
                        </button>
                        <div className="stack-lg">
                            <div className="page-header">
                                <div>
                                    <div className="flex items-center gap-sm">
                                        <h2 className="section-title">{payeeStatement.payee.name}</h2>
                                        {payeeStatement.payee.order_link && (
                                            <a
                                                href={payeeStatement.payee.order_link.startsWith('http') ? payeeStatement.payee.order_link : `https://${payeeStatement.payee.order_link}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="btn btn-ghost btn-sm"
                                                title="Visit Vendor Portal"
                                            >
                                                <ExternalLink size={14} />
                                                <span>Portal</span>
                                            </a>
                                        )}
                                    </div>
                                    <p className="section-subtitle">Transaction Statement & History</p>
                                </div>
                                <div className="text-right stack-xs">
                                    <span className="badge badge--outline">{payeeStatement.payee.type}</span>
                                    {payeeStatement.payee.gstin && <span className="text-xs muted block">GST: {payeeStatement.payee.gstin}</span>}
                                </div>
                            </div>

                            <div className="row gap-md">
                                <div className="panel flex-1 text-center">
                                    <span className="label">Total Paid Accrued</span>
                                    <h3 className="text-accent" style={{ fontSize: '1.5rem' }}>
                                        ₹{(payeeStatement.transactions || []).filter(t => t.entry_type === 'Payment').reduce((sum, t) => sum + Number(t.amount), 0).toLocaleString()}
                                    </h3>
                                </div>
                                {payeeStatement.payee.type === 'Vendor' && (
                                    <div className="panel flex-1 text-center">
                                        <span className="label">Total Purchases</span>
                                        <h3 style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
                                            ₹{(payeeStatement.transactions || []).filter(t => t.entry_type === 'Purchase').reduce((sum, t) => sum + Number(t.total_amount), 0).toLocaleString()}
                                        </h3>
                                    </div>
                                )}
                            </div>

                            <div className="border-all rounded overflow-hidden">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Type</th>
                                            <th>Reference / Bill #</th>
                                            <th className="text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(payeeStatement.transactions || []).length === 0 ? (
                                            <tr>
                                                <td colSpan="4" className="text-center muted py-20">No transactions recorded.</td>
                                            </tr>
                                        ) : (
                                            (payeeStatement.transactions || []).map((t) => (
                                                <tr key={`${t.entry_type}-${t.id}`}>
                                                    <td className="text-sm">
                                                        {new Date(t.payment_date || t.bill_date).toLocaleDateString()}
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${t.entry_type === 'Purchase' ? 'badge--warn' : 'badge--ok'}`}>
                                                            {t.entry_type}
                                                        </span>
                                                    </td>
                                                    <td className="text-sm">
                                                        {t.reference_number || t.bill_number || '--'}
                                                        <div className="text-xs muted">{t.description || (t.entry_type === 'Purchase' ? 'Inventory Stock In' : '--')}</div>
                                                    </td>
                                                    <td className="text-right font-medium">
                                                        ₹{Number(t.amount || t.total_amount).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showPayeeListModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '800px', width: '90%' }}>
                        <button className="modal-close" onClick={() => setShowPayeeListModal(false)}>
                            <X size={22} />
                        </button>
                        <div className="stack-lg">
                            <div className="page-header">
                                <div>
                                    <h2 className="section-title">Manage Payees / Entities</h2>
                                    <p className="section-subtitle">View and manage all registered payees across all categories.</p>
                                </div>
                            </div>

                            <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
                                <div className="flex-1" style={{ minWidth: '250px' }}>
                                    <label className="label">Search Payee</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Search by name..."
                                        value={payeeSearch}
                                        onChange={(e) => setPayeeSearch(e.target.value)}
                                    />
                                </div>
                                <div style={{ width: '150px' }}>
                                    <label className="label">Type</label>
                                    <select
                                        className="input-field"
                                        value={payeeFilter}
                                        onChange={(e) => setPayeeFilter(e.target.value)}
                                    >
                                        <option value="">All Types</option>
                                        {types.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="panel panel--tight">
                                <div className="table-scroll" style={{ maxHeight: '400px' }}>
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Type</th>
                                                <th>Branch</th>
                                                <th>Contact</th>
                                                <th>Phone</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(vendors || [])
                                                .filter(v =>
                                                    v.name.toLowerCase().includes(payeeSearch.toLowerCase()) &&
                                                    (payeeFilter === '' || v.type === payeeFilter)
                                                )
                                                .length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" className="text-center muted table-empty">
                                                        No payees found matching your criteria.
                                                    </td>
                                                </tr>
                                            ) : (
                                                (vendors || [])
                                                    .filter(v =>
                                                        v.name.toLowerCase().includes(payeeSearch.toLowerCase()) &&
                                                        (payeeFilter === '' || v.type === payeeFilter)
                                                    )
                                                    .map((v) => (
                                                        <tr
                                                            key={v.id}
                                                            onDoubleClick={() => {
                                                                setShowPayeeListModal(false);
                                                                fetchPayeeStatement(v.id);
                                                            }}
                                                            style={{ cursor: 'pointer' }}
                                                            title="Double-click to view statement"
                                                        >
                                                            <td className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-sm">
                                                                    <span className="user-name truncate">{v.name}</span>
                                                                    {v.order_link && (
                                                                        <a
                                                                            href={v.order_link.startsWith('http') ? v.order_link : `https://${v.order_link}`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-primary hover:opacity-80"
                                                                            title="Visit Vendor Portal"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <ExternalLink size={14} />
                                                                        </a>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-xs">
                                                                    <span className="text-xs muted">{v.type}</span>
                                                                    {v.gstin && (
                                                                        <span className="text-xs px-4 py-1 bg-surface-lowest rounded border border-border-dimmer">
                                                                            {v.gstin}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td><span className="badge badge--outline">{v.type}</span></td>
                                                            <td>
                                                                <span className="text-xs">
                                                                    {v.branch_id ? (branches || []).find(b => b.id === v.branch_id)?.name || 'Branch' : 'Whole Shop'}
                                                                </span>
                                                            </td>
                                                            <td className="text-sm muted">{v.contact_person || '--'}</td>
                                                            <td className="text-sm muted">{v.phone || '--'}</td>
                                                            <td>
                                                                <div className="row gap-xs">
                                                                    {v.type === 'Vendor' && (
                                                                        <button
                                                                            className="btn btn-ghost btn-sm"
                                                                            style={{ color: 'var(--color-primary)' }}
                                                                            onClick={() => {
                                                                                setBillData({
                                                                                    vendor_id: v.id,
                                                                                    bill_number: '',
                                                                                    bill_date: serverToday(),
                                                                                    items: []
                                                                                });
                                                                                setShowBillModal(true);
                                                                                setShowPayeeListModal(false);
                                                                            }}
                                                                        >
                                                                            <ShoppingBag size={14} />
                                                                            <span>Bill</span>
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        className="btn btn-primary btn-sm"
                                                                        onClick={() => {
                                                                            setFormData(prev => ({
                                                                                ...prev,
                                                                                type: v.type, // Use v.type here
                                                                                payee_name: v.name,
                                                                                vendor_id: v.id, // Set vendor_id for Vendor/Utility types
                                                                                staff_id: '', // Clear staff_id
                                                                                branch_id: v.branch_id || (branches[0]?.id || ''),
                                                                                amount: '',
                                                                                description: ''
                                                                            }));
                                                                            setIsAutoPay(true);
                                                                            setShowPayeeListModal(false);
                                                                            setShowModal(true);
                                                                        }}
                                                                    >
                                                                        <Plus size={14} />
                                                                        <span>Pay</span>
                                                                    </button>
                                                                    <button
                                                                        className="btn btn-ghost btn-sm"
                                                                        onClick={() => {
                                                                            setShowPayeeListModal(false);
                                                                            fetchPayeeStatement(v.id);
                                                                        }}
                                                                    >
                                                                        <FileText size={14} />
                                                                        <span>Statement</span>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}


export default Payments;

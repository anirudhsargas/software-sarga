import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertCircle, X, User, Edit, Trash2, ArrowRight, FileCheck } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { isTouchDevice } from '../services/utils';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';

const Requests = () => {
    useSEO('Requests');

    const { confirm } = useConfirm();
    const user = auth.getUser();
    const [_idRequests, setIdRequests] = useState([]);
    const [_customerRequests, setCustomerRequests] = useState([]);
    const [_vendorRequests, setVendorRequests] = useState([]);
    const [allRequests, setAllRequests] = useState([]);
    const [newId, setNewId] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [message, setMessage] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    useEffect(() => {
        if (user.role === 'Admin') {
            fetchAllRequests();
        } else if (user.role === 'Accountant') {
            fetchDiscountRequestsForAccountant();
        } else {
            setFetching(false);
        }
    }, []);

    const [pendingBadgeTotal, setPendingBadgeTotal] = useState(null);

    async function fetchDiscountRequestsForAccountant() {
        setFetching(true);
        try {
            const res = await api.get('/requests/discount', { _noCache: true });
            const dataArray = res.data.data || (Array.isArray(res.data) ? res.data : []);
            const combined = dataArray.map(r => ({ ...r, request_type: 'DISCOUNT_REQUEST' }));
            setAllRequests(combined);

            const countRes = await api.get('/requests/pending-count', { _noCache: true }).catch(() => null);
            if (countRes?.data?.pending_count !== undefined) {
                setPendingBadgeTotal(countRes.data.pending_count);
            }
        } catch (err) {
            console.error('Failed to fetch discount requests:', err);
        } finally {
            setFetching(false);
        }
    }

    async function fetchAllRequests() {
        setFetching(true);
        setFetchError(null);
        const fallbackResponse = { data: { data: [] } };

        const safeFetch = async (label, promise) => {
            try {
                return await promise;
            } catch (err) {
                const status = err.response?.status ? `HTTP ${err.response.status}` : 'Network Error';
                const message = err.response?.data?.message || err.message || 'Failed to load';
                console.error(`Failed to fetch ${label} requests [${status}]: ${message}`, err);
                setFetchError(prev => ({
                    ...(prev || {}),
                    [label]: { status, message }
                }));
                return fallbackResponse;
            }
        };
        try {
            const [idResponse, customerResponse, vendorResponse, openingResponse, attendanceResponse, discountResponse, productResponse, countRes] = await Promise.all([
                safeFetch('id change', api.get('/requests/id-change', { _noCache: true })),
                safeFetch('customer change', api.get('/requests/customer-change', { _noCache: true })),
                safeFetch('vendor', api.get('/vendor-requests', { params: { status: 'Pending' }, _noCache: true })),
                safeFetch('opening balance', api.get('/daily-report/change-requests', { params: { status: 'Pending' }, _noCache: true })),
                safeFetch('attendance', api.get('/requests/attendance', { _noCache: true })),
                safeFetch('discount', api.get('/requests/discount', { _noCache: true })),
                safeFetch('product', api.get('/products/update-requests', { params: { status: 'pending' }, _noCache: true })),
                api.get('/requests/pending-count', { _noCache: true }).catch(() => null)
            ]);

            if (countRes?.data?.pending_count !== undefined) {
                setPendingBadgeTotal(countRes.data.pending_count);
            }

            const idData = idResponse.data.data || (Array.isArray(idResponse.data) ? idResponse.data : []);
            const customerData = customerResponse.data.data || (Array.isArray(customerResponse.data) ? customerResponse.data : []);
            const vendorData = vendorResponse.data.data || (Array.isArray(vendorResponse.data) ? vendorResponse.data : []);
            const openingData = openingResponse.data.data || (Array.isArray(openingResponse.data) ? openingResponse.data : []);
            const attendanceData = attendanceResponse.data.data || (Array.isArray(attendanceResponse.data) ? attendanceResponse.data : []);
            const discountData = discountResponse.data.data || (Array.isArray(discountResponse.data) ? discountResponse.data : []);
            const productData = Array.isArray(productResponse.data) ? productResponse.data : (productResponse.data?.data || []);

            setIdRequests(idData);
            setCustomerRequests(customerData);
            setVendorRequests(vendorData);

            // Combine and sort all requests by created_at / requested_at
            const combined = [
                ...idData.map(r => ({ ...r, request_type: 'ID_CHANGE', name: r.name || r.old_user_id || 'Staff' })),
                ...customerData.map(r => ({ ...r, request_type: 'CUSTOMER_CHANGE', requester_name: r.requester_name || 'Staff', customer_name: r.customer_name || 'Customer' })),
                ...vendorData.map(r => ({ ...r, request_type: 'VENDOR_REQUEST', request_type_value: r.request_type, requester_name: r.requested_by_name || 'Staff', name: r.name || 'Vendor' })),
                ...openingData.map(r => ({ ...r, request_type: 'OPENING_CHANGE', requester_name: r.requester_name || 'Staff' })),
                ...attendanceData.map(r => ({ ...r, request_type: 'ATTENDANCE_CHANGE', staff_name: r.staff_name || 'Staff' })),
                ...discountData.map(r => ({ ...r, request_type: 'DISCOUNT_REQUEST', requester_name: r.requester_name || 'Staff' })),
                ...productData.map(r => ({ ...r, request_type: 'PRODUCT_UPDATE', created_at: r.requested_at, requester_name: r.requested_by_name || 'Staff', name: r.product_name || 'Product' }))
            ].sort((a, b) => new Date(b.created_at || b.requested_at || 0) - new Date(a.created_at || a.requested_at || 0));

            setAllRequests(combined);
        } catch (err) {
            console.error('Failed to fetch requests:', err);
        } finally {
            setFetching(false);
        }
    }

    const handleSubmitRequest = async (e) => {
        e.preventDefault();
        const isConfirmed = await confirm({
            title: 'Submit Request',
            message: `Submit ID change request to "${newId}"?`,
            confirmText: 'Submit',
            type: 'primary'
        });
        if (!isConfirmed) return;
        setLoading(true);
        try {
            await api.post(
                '/requests/id-change',
                { new_user_id: newId }
            );
            setMessage('Request submitted successfully. Waiting for Admin approval.');
            setNewId('');
        } catch {
            setMessage('Failed to submit request.');
        } finally {
            setLoading(false);
        }
    };

    const handleRowDoubleClick = (request) => {
        setSelectedRequest(request);
        setShowDetailModal(true);
    };

    const handleReview = async (request, action) => {
        const actionUpper = action.toUpperCase();
        const label = actionUpper === 'APPROVE' ? 'Approve' : 'Reject';
        const typeLabel = request.request_type === 'ID_CHANGE'
            ? 'ID change'
            : request.request_type === 'CUSTOMER_CHANGE'
                ? 'customer change'
                : request.request_type === 'ATTENDANCE_CHANGE'
                    ? 'attendance change'
                    : request.request_type === 'DISCOUNT_REQUEST'
                        ? 'discount approval'
                        : request.request_type === 'PRODUCT_UPDATE'
                            ? 'product update'
                            : 'admin setup';

        const isConfirmed = await confirm({
            title: `${label} Request`,
            message: `Are you sure you want to ${label.toLowerCase()} this ${typeLabel} request?`,
            confirmText: label,
            type: actionUpper === 'APPROVE' ? 'primary' : 'danger'
        });
        if (!isConfirmed) return;

        try {
            // Instant optimistic update: filter item out of table and decrement badge
            setAllRequests(prev => prev.filter(r => !(r.id === request.id && r.request_type === request.request_type)));
            setPendingBadgeTotal(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
            setShowDetailModal(false);
            setSelectedRequest(null);

            // Dispatch instant badge update event to Dashboard sidebar
            window.dispatchEvent(new CustomEvent('requestReviewed', { detail: { decrement: 1 } }));

            if (request.request_type === 'ID_CHANGE') {
                await api.post(`/requests/id-change/${request.id}/review`, { action });
            } else if (request.request_type === 'CUSTOMER_CHANGE') {
                await api.post(`/requests/customer-change/${request.id}/review`, { action });
            } else if (request.request_type === 'OPENING_CHANGE') {
                await api.post(`/daily-report/change-requests/${request.id}/review`, {
                    action: action === 'APPROVE' ? 'Approve' : 'Reject'
                });
            } else if (request.request_type === 'ATTENDANCE_CHANGE') {
                await api.post(`/requests/attendance/${request.id}/review`, { action });
            } else if (request.request_type === 'DISCOUNT_REQUEST') {
                await api.post(`/requests/discount/${request.id}/review`, { action });
            } else if (request.request_type === 'PRODUCT_UPDATE') {
                await api.patch(`/products/update-requests/${request.id}`, { action: action === 'APPROVE' ? 'approve' : 'reject' });
            } else {
                await api.put(`/vendor-requests/${request.id}/review`, {
                    status: action === 'APPROVE' ? 'Approved' : 'Rejected'
                });
            }

            toast.success(`Request ${actionUpper === 'APPROVE' ? 'approved' : 'rejected'} successfully`);

            // Background refetch for full database sync
            if (user.role === 'Accountant') {
                fetchDiscountRequestsForAccountant();
            } else {
                fetchAllRequests();
            }
        } catch (err) {
            const field = err.response?.data?.field;
            const message = err.response?.data?.message || err.message || 'Action failed';
            const detailMsg = field
                ? `Column Error [${field}]: ${message}`
                : message;
            toast.error(detailMsg);
            if (user.role === 'Accountant') {
                fetchDiscountRequestsForAccountant();
            } else {
                fetchAllRequests();
            }
            window.dispatchEvent(new Event('requestReviewed'));
        }
    };

    const getRequestTypeBadge = (type) => {
        if (type === 'ID_CHANGE') {
            return <span className="badge" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>ID Change</span>;
        }
        if (type === 'CUSTOMER_CHANGE') {
            return <span className="badge" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>Customer {selectedRequest?.action}</span>;
        }
        if (type === 'VENDOR_REQUEST') {
            return <span className="badge" style={{ backgroundColor: 'var(--warning)', color: 'var(--on-accent)' }}>Admin Setup</span>;
        }
        if (type === 'OPENING_CHANGE') {
            return <span className="badge" style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}>Opening Change</span>;
        }
        if (type === 'ATTENDANCE_CHANGE') {
            return <span className="badge" style={{ backgroundColor: 'var(--success)', color: 'var(--on-accent)' }}>Attendance Change</span>;
        }
        if (type === 'DISCOUNT_REQUEST') {
            return <span className="badge" style={{ backgroundColor: 'var(--warning)', color: 'var(--on-accent)' }}>Discount Approval</span>;
        }
        if (type === 'PRODUCT_UPDATE') {
            return <span className="badge" style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}>Product Update</span>;
        }
        return <span className="badge">{type}</span>;
    };

    if (user.role !== 'Admin' && user.role !== 'Accountant') {
        return (
            <div className="stack-lg container-sm">
                <div className="text-center">
                    <h1 className="section-title">Change User ID</h1>
                    <p className="section-subtitle">
                        Your User ID is your mobile number. To change it, please submit a request for Admin approval.
                    </p>
                </div>

                {message && (
                    <div className="alert alert--info">
                        <AlertCircle size={20} />
                        <span>{message}</span>
                    </div>
                )}

                <form onSubmit={handleSubmitRequest} className="panel stack-lg">
                    <div>
                        <label className="label">Current User ID</label>
                        <input type="text" className="input-field" value={user.user_id} disabled />
                    </div>
                    <div>
                        <label className="label">New Mobile Number</label>
                        <input
                            type="tel"
                            className="input-field"
                            placeholder="Enter new mobile number"
                            value={newId}
                            onChange={(e) => setNewId(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary btn--full"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Submit Request"}
                    </button>
                </form>
            </div>
        );
    }

    return (
        <PageContainer>
            <div>
                <h1 className="section-title">Requests</h1>
                <p className="section-subtitle">
                    {user.role === 'Accountant'
                        ? 'Review and approve discount requests (up to 10%). Double-click a row to view details.'
                        : 'Review and approve staff requests for ID changes and customer modifications. Double-click a row to view details.'}
                </p>
            </div>

            {fetchError && Object.keys(fetchError).length > 0 && (() => {
                const missingCount = (pendingBadgeTotal !== null && pendingBadgeTotal > allRequests.length)
                    ? pendingBadgeTotal - allRequests.length
                    : 0;
                return (
                    <div className="alert alert--warning" role="alert" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                        <div className="row gap-sm items-center">
                            <AlertCircle size={20} />
                            <span style={{ fontWeight: 600 }}>
                                Partial Data Loaded: {missingCount > 0 ? `${missingCount} pending request(s) failed to load.` : 'Some request types failed to load.'}
                            </span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '24px', fontSize: '0.875rem' }}>
                            {Object.entries(fetchError).map(([label, info]) => (
                                <li key={label}>
                                    <strong>{label}</strong>: {info.status} — {info.message}
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })()}

            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Requested By</th>
                                <th>Subject</th>
                                <th>Requested At</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fetching ? (
                                <tr>
                                    <td colSpan="5" className="text-center muted table-empty">
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : allRequests.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center muted table-empty">
                                        No pending requests found.
                                    </td>
                                </tr>
                            ) : (
                                allRequests.map(req => (
                                    <tr
                                        key={`${req.request_type}-${req.id}`}
                                        {...(isTouchDevice()
                                            ? { onClick: () => handleRowDoubleClick(req) }
                                            : { onDoubleClick: () => handleRowDoubleClick(req) }
                                        )}
                                        style={{ cursor: 'pointer' }}
                                        title={isTouchDevice() ? "Click to view details" : "Double-click to view details"}
                                    >
                                        <td>{getRequestTypeBadge(req.request_type)}</td>
                                        <td className="user-name">
                                            {req.request_type === 'ID_CHANGE'
                                                ? req.name
                                                : req.request_type === 'ATTENDANCE_CHANGE'
                                                    ? req.staff_name
                                                    : req.requester_name}
                                        </td>
                                        <td className="text-sm">
                                            {req.request_type === 'ID_CHANGE' ? (
                                                <span>Change ID: {req.old_user_id} → {req.new_user_id}</span>
                                            ) : req.request_type === 'CUSTOMER_CHANGE' ? (
                                                <span>{req.action} customer: {req.customer_name}</span>
                                            ) : req.request_type === 'OPENING_CHANGE' ? (
                                                <span>
                                                    {req.request_type === 'OPENING_CHANGE' && req.request_type_value !== 'machine_count'
                                                        ? `${req.book_type} balance: ₹${req.current_value} → ₹${req.requested_value}`
                                                        : `Machine count: ${req.current_value} → ${req.requested_value}`
                                                    }
                                                    {req.branch_name && ` (${req.branch_name})`}
                                                </span>
                                            ) : req.request_type === 'ATTENDANCE_CHANGE' ? (
                                                <span>Update attendance on {new Date(req.attendance_date).toLocaleDateString()} to {req.requested_status}</span>
                                            ) : req.request_type === 'DISCOUNT_REQUEST' ? (
                                                <span>{Number(req.discount_percent).toFixed(1)}% discount on ₹{Number(req.total_amount || 0).toFixed(2)} — by {req.requester_name}</span>
                                            ) : req.request_type === 'PRODUCT_UPDATE' ? (
                                                <span>Update product: {req.name || req.product_name}</span>
                                            ) : (
                                                <span>{req.request_type_value || req.request_type} request: {req.name}</span>
                                            )}
                                        </td>
                                        <td className="text-sm muted">{new Date(req.created_at).toLocaleString()}</td>
                                        <td>
                                            <span className="badge" style={{ backgroundColor: 'var(--warning)' }}>
                                                Pending
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Premium Request Details Modal */}
            {showDetailModal && selectedRequest && (
                <div className="modal-backdrop" style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 1100 }}>
                    <div className="modal" style={{ maxWidth: '640px', width: '92vw', maxHeight: '88vh', borderRadius: '16px', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)', border: '1px solid var(--border)', overflow: 'hidden', backgroundColor: 'var(--bg-card, #ffffff)' }}>
                        
                        {/* Modal Header */}
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)' }}>
                            <div className="row gap-md items-center">
                                <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'var(--accent-soft, rgba(99, 102, 241, 0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent, #6366f1)' }}>
                                    <FileCheck size={22} />
                                </div>
                                <div>
                                    <h2 className="modal-title" style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary, #0f172a)' }}>Request Review</h2>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #64748b)', marginTop: '2px' }}>
                                        ID #{selectedRequest.id} &bull; Submitted {new Date(selectedRequest.created_at || selectedRequest.requested_at || Date.now()).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <button className="modal-close" onClick={() => { setShowDetailModal(false); setSelectedRequest(null); }} style={{ borderRadius: '8px', padding: '8px', cursor: 'pointer', border: 'none', background: 'transparent', color: 'var(--text-muted)' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="modal-body" style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            
                            {/* Summary Metadata Card */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', background: 'var(--bg-secondary, #f8fafc)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted, #64748b)', marginBottom: '6px' }}>Category</div>
                                    <div>{getRequestTypeBadge(selectedRequest.request_type)}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted, #64748b)', marginBottom: '6px' }}>Requested By</div>
                                    <div className="row gap-xs items-center" style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                                        <User size={16} style={{ color: 'var(--accent, #6366f1)' }} />
                                        <span>
                                            {selectedRequest.request_type === 'ID_CHANGE' ? selectedRequest.name :
                                                selectedRequest.request_type === 'ATTENDANCE_CHANGE' ? selectedRequest.staff_name :
                                                    (selectedRequest.requester_name || selectedRequest.name || 'Staff')}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Request Details Content */}
                            {selectedRequest.request_type === 'ID_CHANGE' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>User ID Transfer</div>
                                    <div className="row gap-md items-center" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', justifyContent: 'space-between' }}>
                                        <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Current User ID</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace' }}>{selectedRequest.old_user_id}</div>
                                        </div>
                                        <div style={{ padding: '8px', borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                                            <ArrowRight size={20} />
                                        </div>
                                        <div style={{ textAlign: 'center', flex: 1 }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Requested User ID</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--accent)' }}>{selectedRequest.new_user_id}</div>
                                        </div>
                                    </div>
                                </div>
                            ) : selectedRequest.request_type === 'CUSTOMER_CHANGE' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div className="row gap-md items-center" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', justifyContent: 'space-between' }}>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Action Type</div>
                                            <div className="row gap-xs items-center" style={{ fontWeight: 700 }}>
                                                {selectedRequest.action === 'EDIT' ? <Edit size={16} style={{ color: 'var(--accent)' }} /> : <Trash2 size={16} style={{ color: 'var(--error, #ef4444)' }} />}
                                                <span style={{ color: selectedRequest.action === 'DELETE' ? 'var(--error, #ef4444)' : 'var(--text-primary)' }}>
                                                    {selectedRequest.action === 'EDIT' ? 'Edit Customer' : 'Delete Customer'}
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Target Customer</div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedRequest.customer_name}</div>
                                        </div>
                                    </div>

                                    {selectedRequest.action === 'EDIT' && selectedRequest.payload && (() => {
                                        try {
                                            const payloadObj = JSON.parse(selectedRequest.payload);
                                            return (
                                                <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>Requested Modifications</div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                                        {Object.entries(payloadObj).map(([pKey, pVal]) => {
                                                            if (!pVal) return null;
                                                            return (
                                                                <div key={pKey} style={{ background: 'var(--bg-card, #ffffff)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{pKey.replace(/_/g, ' ')}</div>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '2px', wordBreak: 'break-word' }}>{String(pVal)}</div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        } catch {
                                            return null;
                                        }
                                    })()}

                                    {selectedRequest.note && (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Requester Note</div>
                                            <div style={{ fontSize: '0.9rem' }}>{selectedRequest.note}</div>
                                        </div>
                                    )}
                                </div>
                            ) : selectedRequest.request_type === 'OPENING_CHANGE' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Date</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{selectedRequest.report_date ? new Date(selectedRequest.report_date).toLocaleDateString() : '—'}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Branch</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{selectedRequest.branch_name || 'Main'}</div>
                                        </div>
                                        {selectedRequest.machine_name && (
                                            <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Machine</div>
                                                <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{selectedRequest.machine_name}</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="row gap-md items-center" style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', justifyContent: 'space-between' }}>
                                        <div style={{ flex: 1, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Current Value</div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: 600 }}>{selectedRequest.book_type ? `₹${selectedRequest.current_value}` : selectedRequest.current_value}</div>
                                        </div>
                                        <div style={{ color: 'var(--accent)' }}>
                                            <ArrowRight size={20} />
                                        </div>
                                        <div style={{ flex: 1, textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Requested Value</div>
                                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{selectedRequest.book_type ? `₹${selectedRequest.requested_value}` : selectedRequest.requested_value}</div>
                                        </div>
                                    </div>

                                    {selectedRequest.note && (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Reason / Note</div>
                                            <div style={{ fontSize: '0.9rem' }}>{selectedRequest.note}</div>
                                        </div>
                                    )}
                                </div>
                            ) : selectedRequest.request_type === 'DISCOUNT_REQUEST' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Discount %</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent)' }}>{Number(selectedRequest.discount_percent).toFixed(1)}%</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Order Total</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>₹{Number(selectedRequest.total_amount || 0).toFixed(2)}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>Savings</div>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--warning, #eab308)' }}>
                                                ₹{(Number(selectedRequest.total_amount || 0) * Number(selectedRequest.discount_percent) / 100).toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    {selectedRequest.customer_name && (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Customer</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{selectedRequest.customer_name}</div>
                                        </div>
                                    )}

                                    {selectedRequest.reason && (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Reason</div>
                                            <div style={{ fontSize: '0.9rem' }}>{selectedRequest.reason}</div>
                                        </div>
                                    )}
                                </div>
                            ) : selectedRequest.request_type === 'PRODUCT_UPDATE' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Product</div>
                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedRequest.product_name || `Product #${selectedRequest.product_id}`}</div>
                                    </div>

                                    {selectedRequest.proposed_data && (
                                        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Proposed Changes</div>
                                            <div style={{ padding: '8px' }}>
                                                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Field</th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Current</th>
                                                            <th style={{ padding: '8px 4px', textAlign: 'center' }}></th>
                                                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Proposed</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {Object.keys(selectedRequest.proposed_data).map(fKey => {
                                                            const curr = selectedRequest.current_data?.[fKey];
                                                            const prop = selectedRequest.proposed_data?.[fKey];
                                                            const isScalar = v => v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
                                                            const changed = String(curr ?? '') !== String(prop ?? '');
                                                            if (!changed && !prop) return null;
                                                            return (
                                                                <tr key={fKey} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                    <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>{fKey.replace(/_/g, ' ')}</td>
                                                                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                                        {isScalar(curr) ? (curr ?? '—') : JSON.stringify(curr)}
                                                                    </td>
                                                                    <td style={{ padding: '10px 4px', textAlign: 'center' }}>
                                                                        {changed && <ArrowRight size={14} style={{ color: 'var(--warning, #eab308)' }} />}
                                                                    </td>
                                                                    <td style={{ padding: '10px 12px', fontSize: '0.85rem', fontWeight: changed ? 700 : 400, color: changed ? 'var(--accent)' : 'var(--text)' }}>
                                                                        {isScalar(prop) ? (prop ?? '—') : JSON.stringify(prop)}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : selectedRequest.request_type === 'ATTENDANCE_CHANGE' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Attendance Date</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{new Date(selectedRequest.attendance_date).toLocaleDateString()}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Requested Status</div>
                                            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--accent)' }}>{selectedRequest.requested_status}</div>
                                        </div>
                                    </div>

                                    {(selectedRequest.requested_time || selectedRequest.requested_gone_time) && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                            {selectedRequest.requested_time && (
                                                <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>In Time</div>
                                                    <div style={{ fontWeight: 600 }}>{selectedRequest.requested_time}</div>
                                                </div>
                                            )}
                                            {selectedRequest.requested_gone_time && (
                                                <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Out Time</div>
                                                    <div style={{ fontWeight: 600 }}>{selectedRequest.requested_gone_time}</div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {selectedRequest.requested_notes && (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Notes</div>
                                            <div style={{ fontSize: '0.9rem' }}>{selectedRequest.requested_notes}</div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Request Type</div>
                                            <div style={{ fontWeight: 600 }}>{selectedRequest.request_type_value || selectedRequest.request_type}</div>
                                        </div>
                                        <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Entity / Name</div>
                                            <div style={{ fontWeight: 700 }}>{selectedRequest.name}</div>
                                        </div>
                                    </div>
                                    {selectedRequest.request_reason && (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' }}>Reason</div>
                                            <div style={{ fontSize: '0.9rem' }}>{selectedRequest.request_reason}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>

                        {/* Modal Footer */}
                        <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', gap: '12px', justifyContent: 'flex-end', flexShrink: 0 }}>
                            <button
                                onClick={() => handleReview(selectedRequest, 'REJECT')}
                                className="btn btn-ghost btn-danger"
                                style={{ minWidth: '130px', padding: '10px 18px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                <XCircle size={18} />
                                <span>Reject</span>
                            </button>
                            <button
                                onClick={() => handleReview(selectedRequest, 'APPROVE')}
                                className="btn btn-primary"
                                style={{ minWidth: '130px', padding: '10px 18px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}
                            >
                                <CheckCircle2 size={18} />
                                <span>Approve</span>
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default Requests;

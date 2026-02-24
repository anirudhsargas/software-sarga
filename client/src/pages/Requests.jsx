import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertCircle, X, User, Edit, Trash2 } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { isTouchDevice } from '../services/utils';

const Requests = () => {
    const user = auth.getUser();
    const [idRequests, setIdRequests] = useState([]);
    const [customerRequests, setCustomerRequests] = useState([]);
    const [vendorRequests, setVendorRequests] = useState([]);
    const [allRequests, setAllRequests] = useState([]);
    const [newId, setNewId] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [message, setMessage] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    useEffect(() => {
        if (user.role === 'Admin') {
            fetchAllRequests();
        } else {
            setFetching(false);
        }
    }, []);

    const fetchAllRequests = async () => {
        setFetching(true);
        try {
            const [idResponse, customerResponse, vendorResponse, openingResponse] = await Promise.all([
                api.get('/requests/id-change', { headers: auth.getAuthHeader() }),
                api.get('/requests/customer-change', { headers: auth.getAuthHeader() }),
                api.get('/vendor-requests', { headers: auth.getAuthHeader(), params: { status: 'Pending' } }),
                api.get('/daily-report/change-requests', { headers: auth.getAuthHeader(), params: { status: 'Pending' } }).catch(() => ({ data: [] }))
            ]);

            setIdRequests(idResponse.data);
            setCustomerRequests(customerResponse.data);
            setVendorRequests(vendorResponse.data);

            // Combine and sort all requests by created_at
            const combined = [
                ...idResponse.data.map(r => ({ ...r, request_type: 'ID_CHANGE' })),
                ...customerResponse.data.map(r => ({ ...r, request_type: 'CUSTOMER_CHANGE' })),
                ...vendorResponse.data.map(r => ({ ...r, request_type: 'VENDOR_REQUEST', request_type_value: r.request_type })),
                ...openingResponse.data.map(r => ({ ...r, request_type: 'OPENING_CHANGE' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setAllRequests(combined);
        } catch (err) {
            console.error('Failed to fetch requests:', err);
        } finally {
            setFetching(false);
        }
    };

    const handleSubmitRequest = async (e) => {
        e.preventDefault();
        if (!window.confirm(`Submit ID change request to "${newId}"?`)) return;
        setLoading(true);
        try {
            await api.post(
                '/requests/id-change',
                { new_user_id: newId },
                { headers: auth.getAuthHeader() }
            );
            setMessage('Request submitted successfully. Waiting for Admin approval.');
            setNewId('');
        } catch (err) {
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
        const label = action === 'approve' ? 'Approve' : 'Reject';
        const typeLabel = request.request_type === 'ID_CHANGE'
            ? 'ID change'
            : request.request_type === 'CUSTOMER_CHANGE'
                ? 'customer change'
                : 'admin setup';
        if (!window.confirm(`${label} this ${typeLabel} request?`)) return;
        try {
            if (request.request_type === 'ID_CHANGE') {
                await api.post(`/requests/id-change/${request.id}/review`, { action }, { headers: auth.getAuthHeader() });
            } else if (request.request_type === 'CUSTOMER_CHANGE') {
                await api.post(`/requests/customer-change/${request.id}/review`, { action }, { headers: auth.getAuthHeader() });
            } else if (request.request_type === 'OPENING_CHANGE') {
                await api.post(`/daily-report/change-requests/${request.id}/review`, {
                    action: action === 'APPROVE' ? 'Approve' : 'Reject'
                }, { headers: auth.getAuthHeader() });
            } else {
                await api.put(`/vendor-requests/${request.id}/review`, {
                    status: action === 'APPROVE' ? 'Approved' : 'Rejected'
                }, { headers: auth.getAuthHeader() });
            }
            setShowDetailModal(false);
            setSelectedRequest(null);
            fetchAllRequests();
        } catch (err) {
            alert(err.response?.data?.message || 'Action failed');
        }
    };

    const getRequestTypeBadge = (type) => {
        if (type === 'ID_CHANGE') {
            return <span className="badge" style={{ backgroundColor: 'var(--primary-light)' }}>ID Change</span>;
        }
        if (type === 'CUSTOMER_CHANGE') {
            return <span className="badge" style={{ backgroundColor: 'var(--accent-light)' }}>Customer {selectedRequest?.action}</span>;
        }
        if (type === 'VENDOR_REQUEST') {
            return <span className="badge" style={{ backgroundColor: 'var(--warning)' }}>Admin Setup</span>;
        }
        if (type === 'OPENING_CHANGE') {
            return <span className="badge" style={{ backgroundColor: '#7c3aed', color: '#fff' }}>Opening Change</span>;
        }
        return <span className="badge">{type}</span>;
    };

    if (user.role !== 'Admin') {
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
        <div className="stack-lg">
            <div>
                <h1 className="section-title">Requests</h1>
                <p className="section-subtitle">Review and approve staff requests for ID changes and customer modifications. Double-click a row to view details.</p>
            </div>

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

            {/* Detail Modal */}
            {showDetailModal && selectedRequest && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: '600px' }}>
                        <button className="modal-close" onClick={() => { setShowDetailModal(false); setSelectedRequest(null); }}>
                            <X size={22} />
                        </button>

                        <h2 className="section-title mb-16">Request Details</h2>

                        <div className="stack-md">
                            {/* Request Type */}
                            <div>
                                <label className="label">Request Type</label>
                                <div>{getRequestTypeBadge(selectedRequest.request_type)}</div>
                            </div>

                            {/* Requested By */}
                            <div>
                                <label className="label">Requested By</label>
                                <div className="row gap-sm items-center">
                                    <User size={16} className="muted" />
                                    <span className="user-name">
                                        {selectedRequest.request_type === 'ID_CHANGE' ? selectedRequest.name : (selectedRequest.requester_name || selectedRequest.name)}
                                    </span>
                                </div>
                            </div>

                            {/* Request Details based on type */}
                            {selectedRequest.request_type === 'ID_CHANGE' ? (
                                <>
                                    <div>
                                        <label className="label">Current User ID</label>
                                        <input type="text" className="input-field" value={selectedRequest.old_user_id} disabled />
                                    </div>
                                    <div>
                                        <label className="label">Requested New User ID</label>
                                        <input type="text" className="input-field" value={selectedRequest.new_user_id} disabled />
                                    </div>
                                </>
                            ) : selectedRequest.request_type === 'CUSTOMER_CHANGE' ? (
                                <>
                                    <div>
                                        <label className="label">Action</label>
                                        <div className="row gap-sm items-center">
                                            {selectedRequest.action === 'EDIT' ? <Edit size={16} className="muted" /> : <Trash2 size={16} className="text-error" />}
                                            <span>{selectedRequest.action === 'EDIT' ? 'Edit Customer' : 'Delete Customer'}</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label">Customer</label>
                                        <input type="text" className="input-field" value={selectedRequest.customer_name} disabled />
                                    </div>
                                    {selectedRequest.note && (
                                        <div>
                                            <label className="label">Note</label>
                                            <textarea className="input-field" rows="3" value={selectedRequest.note} disabled />
                                        </div>
                                    )}
                                    {selectedRequest.action === 'EDIT' && selectedRequest.payload && (
                                        <div>
                                            <label className="label">Requested Changes</label>
                                            <div className="panel" style={{ backgroundColor: 'var(--bg-secondary)', padding: '12px' }}>
                                                <pre style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                                                    {JSON.stringify(JSON.parse(selectedRequest.payload), null, 2)}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : selectedRequest.request_type === 'OPENING_CHANGE' ? (
                                <>
                                    <div>
                                        <label className="label">Change Type</label>
                                        <input type="text" className="input-field" value={selectedRequest.request_type === 'OPENING_CHANGE' ? (selectedRequest.book_type ? `Opening Balance (${selectedRequest.book_type})` : `Machine Opening Count`) : ''} disabled />
                                    </div>
                                    <div>
                                        <label className="label">Date</label>
                                        <input type="text" className="input-field" value={selectedRequest.report_date ? new Date(selectedRequest.report_date).toLocaleDateString() : ''} disabled />
                                    </div>
                                    <div>
                                        <label className="label">Branch</label>
                                        <input type="text" className="input-field" value={selectedRequest.branch_name || ''} disabled />
                                    </div>
                                    {selectedRequest.machine_name && (
                                        <div>
                                            <label className="label">Machine</label>
                                            <input type="text" className="input-field" value={selectedRequest.machine_name} disabled />
                                        </div>
                                    )}
                                    <div className="row gap-md">
                                        <div className="flex-1">
                                            <label className="label">Current Value</label>
                                            <input type="text" className="input-field" value={selectedRequest.book_type ? `₹${selectedRequest.current_value}` : selectedRequest.current_value} disabled />
                                        </div>
                                        <div className="flex-1">
                                            <label className="label">Requested Value</label>
                                            <input type="text" className="input-field" value={selectedRequest.book_type ? `₹${selectedRequest.requested_value}` : selectedRequest.requested_value} disabled style={{ fontWeight: 600, color: 'var(--primary)' }} />
                                        </div>
                                    </div>
                                    {selectedRequest.note && (
                                        <div>
                                            <label className="label">Note</label>
                                            <textarea className="input-field" rows="2" value={selectedRequest.note} disabled />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="label">Request Type</label>
                                        <input type="text" className="input-field" value={selectedRequest.request_type_value || selectedRequest.request_type} disabled />
                                    </div>
                                    <div>
                                        <label className="label">Name</label>
                                        <input type="text" className="input-field" value={selectedRequest.name} disabled />
                                    </div>
                                    {selectedRequest.contact_person && (
                                        <div>
                                            <label className="label">Contact Person</label>
                                            <input type="text" className="input-field" value={selectedRequest.contact_person} disabled />
                                        </div>
                                    )}
                                    {selectedRequest.phone && (
                                        <div>
                                            <label className="label">Phone</label>
                                            <input type="text" className="input-field" value={selectedRequest.phone} disabled />
                                        </div>
                                    )}
                                    {selectedRequest.address && (
                                        <div>
                                            <label className="label">Address</label>
                                            <textarea className="input-field" rows="2" value={selectedRequest.address} disabled />
                                        </div>
                                    )}
                                    {selectedRequest.request_reason && (
                                        <div>
                                            <label className="label">Reason</label>
                                            <textarea className="input-field" rows="3" value={selectedRequest.request_reason} disabled />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Requested At */}
                            <div>
                                <label className="label">Requested At</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={new Date(selectedRequest.created_at).toLocaleString()}
                                    disabled
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="row gap-sm" style={{ marginTop: '16px' }}>
                                <button
                                    onClick={() => handleReview(selectedRequest, 'APPROVE')}
                                    className="btn btn-primary flex-1"
                                >
                                    <CheckCircle2 size={18} />
                                    <span>Approve</span>
                                </button>
                                <button
                                    onClick={() => handleReview(selectedRequest, 'REJECT')}
                                    className="btn btn-ghost btn-danger flex-1"
                                >
                                    <XCircle size={18} />
                                    <span>Reject</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Requests;

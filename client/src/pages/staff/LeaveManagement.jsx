import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import { CalendarDays, AlertCircle, Plus, X } from 'lucide-react';
import { useConfirm } from '../../contexts/ConfirmContext';
import PageContainer from '../components/ui/PageContainer';

const LeaveManagement = () => {
    useSEO('Leave Management');
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        leave_type: 'Sick Leave',
        start_date: '',
        end_date: '',
        reason: '',
        attachment: null
    });

    const { data: leaves, isLoading } = useQuery({
        queryKey: ['staff_leaves'],
        queryFn: async () => {
            const res = await api.get('/staff-portal/leaves');
            return res.data;
        }
    });

    const submitMutation = useMutation({
        mutationFn: async (data) => {
            const formDataObj = new FormData();
            formDataObj.append('leave_type', data.leave_type);
            formDataObj.append('start_date', data.start_date);
            formDataObj.append('end_date', data.end_date);
            formDataObj.append('reason', data.reason);
            if (data.attachment) {
                formDataObj.append('attachment', data.attachment);
            }
            return api.post('/staff-portal/leaves', formDataObj, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
        },
        onSuccess: () => {
            toast.success('Leave request submitted successfully');
            queryClient.invalidateQueries(['staff_leaves']);
            setShowForm(false);
            setFormData({ leave_type: 'Sick Leave', start_date: '', end_date: '', reason: '', attachment: null });
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Failed to submit leave request');
        }
    });

    const cancelMutation = useMutation({
        mutationFn: async (id) => api.put(`/staff-portal/leaves/${id}/cancel`),
        onSuccess: () => {
            toast.success('Leave cancelled');
            queryClient.invalidateQueries(['staff_leaves']);
        },
        onError: () => toast.error('Failed to cancel leave')
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (new Date(formData.end_date) < new Date(formData.start_date)) {
            return toast.error('End date cannot be before start date');
        }
        submitMutation.mutate(formData);
    };

    const handleCancel = async (id) => {
        const yes = await confirm({
            title: 'Cancel Leave',
            message: 'Are you sure you want to cancel this leave request?',
            confirmText: 'Yes, Cancel',
            type: 'warning'
        });
        if (yes) {
            cancelMutation.mutate(id);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'Approved': return 'var(--success)';
            case 'Rejected': return 'var(--error)';
            case 'Cancelled': return 'var(--text-muted)';
            default: return 'var(--warning)';
        }
    };

    return (
        <PageContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 className="section-title">Leave Management</h1>
                    <p className="section-subtitle">Request and track your time off.</p>
                </div>
                {!showForm && (
                    <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                        <Plus size={18} />
                        Request Leave
                    </button>
                )}
            </div>

            {showForm && (
                <div className="card mb-24" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                        <h2 className="section-title" style={{ margin: 0 }}>New Leave Request</h2>
                        <button className="btn-icon" onClick={() => setShowForm(false)}>
                            <X size={20} />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="grid grid-2" style={{ gap: '20px' }}>
                        <div>
                            <label className="label">Leave Type</label>
                            <select 
                                className="input-field" 
                                value={formData.leave_type}
                                onChange={e => setFormData({...formData, leave_type: e.target.value})}
                                required
                            >
                                <option value="Sick Leave">Sick Leave</option>
                                <option value="Casual Leave">Casual Leave</option>
                                <option value="Annual Leave">Annual Leave</option>
                                <option value="Unpaid Leave">Unpaid Leave</option>
                            </select>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <label className="label">Start Date</label>
                                <input 
                                    type="date" 
                                    className="input-field"
                                    value={formData.start_date}
                                    onChange={e => setFormData({...formData, start_date: e.target.value})}
                                    min={new Date().toISOString().split('T')[0]}
                                    required
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label className="label">End Date</label>
                                <input 
                                    type="date" 
                                    className="input-field"
                                    value={formData.end_date}
                                    onChange={e => setFormData({...formData, end_date: e.target.value})}
                                    min={formData.start_date || new Date().toISOString().split('T')[0]}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="label">Reason</label>
                            <textarea 
                                className="input-field" 
                                rows="3"
                                placeholder="Briefly explain the reason for your leave"
                                value={formData.reason}
                                onChange={e => setFormData({...formData, reason: e.target.value})}
                                required
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1' }}>
                            <label className="label">Attachment (Optional, e.g., Medical Certificate)</label>
                            <input 
                                type="file" 
                                className="input-field"
                                onChange={e => setFormData({...formData, attachment: e.target.files[0]})}
                                accept=".pdf,.jpg,.jpeg,.png"
                            />
                        </div>

                        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-primary" disabled={submitMutation.isLoading}>
                                {submitMutation.isLoading ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Date Applied</th>
                                <th>Leave Type</th>
                                <th>Duration</th>
                                <th>Reason</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="6" className="text-center py-4">Loading leaves...</td></tr>
                            ) : leaves?.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-8 text-muted">
                                        <CalendarDays size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                                        No leave history found.
                                    </td>
                                </tr>
                            ) : (
                                leaves?.map(leave => (
                                    <tr key={leave.id}>
                                        <td>{new Date(leave.created_at).toLocaleDateString()}</td>
                                        <td><strong>{leave.leave_type}</strong></td>
                                        <td>
                                            {new Date(leave.start_date).toLocaleDateString()} 
                                            {leave.start_date !== leave.end_date && ` - ${new Date(leave.end_date).toLocaleDateString()}`}
                                        </td>
                                        <td>
                                            <div style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={leave.reason}>
                                                {leave.reason}
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                padding: '4px 8px', 
                                                borderRadius: '12px', 
                                                fontSize: '12px', 
                                                backgroundColor: `${getStatusColor(leave.status)}20`,
                                                color: getStatusColor(leave.status),
                                                fontWeight: 'bold'
                                            }}>
                                                {leave.status}
                                            </span>
                                        </td>
                                        <td>
                                            {leave.status === 'Pending' && (
                                                <button 
                                                    className="btn-text text-danger" 
                                                    onClick={() => handleCancel(leave.id)}
                                                    disabled={cancelMutation.isLoading}
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </PageContainer>
    );
};

export default LeaveManagement;

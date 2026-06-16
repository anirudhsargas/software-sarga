import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import { Clock, CheckCircle, AlertTriangle } from 'lucide-react';

const DesignBooking = () => {
    useSEO('Design Queue');
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState('All');

    const { data: bookings, isLoading } = useQuery({
        queryKey: ['designer_bookings'],
        queryFn: async () => {
            const res = await api.get('/design-workspace/bookings');
            return res.data;
        }
    });

    const statusMutation = useMutation({
        mutationFn: async ({ id, status }) => api.put(`/design-workspace/bookings/${id}/status`, { status }),
        onSuccess: () => {
            toast.success('Status updated');
            queryClient.invalidateQueries(['designer_bookings']);
        },
        onError: () => toast.error('Failed to update status')
    });

    const handleStatusChange = (id, newStatus) => {
        statusMutation.mutate({ id, status: newStatus });
    };

    const filteredBookings = bookings?.filter(b => statusFilter === 'All' ? true : b.status === statusFilter) || [];

    const getStatusColor = (status) => {
        switch (status) {
            case 'Requested': return '#6b7280';
            case 'Assigned': return '#3b82f6';
            case 'Designing': return '#f59e0b';
            case 'Review': return '#8b5cf6';
            case 'Approved': return '#10b981';
            case 'Printed': return '#059669';
            case 'Delivered': return '#047857';
            default: return '#6b7280';
        }
    };

    return (
        <div className="container-lg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 className="section-title">Design Queue</h1>
                    <p className="section-subtitle">Track and manage design bookings from customers.</p>
                </div>
                <div>
                    <select 
                        className="input-field" 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ width: '200px' }}
                    >
                        <option value="All">All Statuses</option>
                        <option value="Requested">Requested</option>
                        <option value="Assigned">Assigned</option>
                        <option value="Designing">Designing</option>
                        <option value="Review">Review</option>
                        <option value="Approved">Approved</option>
                    </select>
                </div>
            </div>

            <div className="card">
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>ID / Date</th>
                                <th>Customer</th>
                                <th>Due Date</th>
                                <th>Priority</th>
                                <th>Designer</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="7" className="text-center py-4">Loading queue...</td></tr>
                            ) : filteredBookings.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-8 text-muted">
                                        No bookings found matching criteria.
                                    </td>
                                </tr>
                            ) : (
                                filteredBookings.map(b => (
                                    <tr key={b.id}>
                                        <td>
                                            <div style={{ fontWeight: '500' }}>#{b.id}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                                {new Date(b.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ fontWeight: '500' }}>{b.customer_name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{b.company_name}</div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={14} color="var(--text-muted)" />
                                                <span>{new Date(b.due_date).toLocaleDateString()}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                                                backgroundColor: b.priority === 'High' || b.priority === 'Urgent' ? 'var(--error)' : 'var(--surface-3)',
                                                color: b.priority === 'High' || b.priority === 'Urgent' ? 'white' : 'var(--text)'
                                            }}>
                                                {b.priority}
                                            </span>
                                        </td>
                                        <td>{b.designer_name || <span className="text-muted">Unassigned</span>}</td>
                                        <td>
                                            <select 
                                                value={b.status}
                                                onChange={(e) => handleStatusChange(b.id, e.target.value)}
                                                disabled={statusMutation.isLoading}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    border: `1px solid ${getStatusColor(b.status)}50`,
                                                    backgroundColor: `${getStatusColor(b.status)}10`,
                                                    color: getStatusColor(b.status),
                                                    fontWeight: '600',
                                                    outline: 'none',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <option value="Requested">Requested</option>
                                                <option value="Assigned">Assigned</option>
                                                <option value="Designing">Designing</option>
                                                <option value="Review">Review</option>
                                                <option value="Approved">Approved</option>
                                                <option value="Printed">Printed</option>
                                                <option value="Delivered">Delivered</option>
                                            </select>
                                        </td>
                                        <td>
                                            <button className="btn btn-outline btn-sm">View Details</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default DesignBooking;

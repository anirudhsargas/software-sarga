import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { Plus, X, Edit2, Trash2, MapPin, Phone, Loader2, Building2, CreditCard } from 'lucide-react';

import api from '../services/api';
import { isTouchDevice } from '../services/utils';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';
import './Branches.css';

const Branches = () => {
    useSEO('Branches');

    const { confirm } = useConfirm();
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [formData, setFormData] = useState({ name: '', address: '', phone: '', upi_id: '', short_name: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && showModal) {
                setShowModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showModal]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch {
            setError('Failed to fetch branches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBranches();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingBranch) {
                // Optimistic UI Update for edit
                const _prevBranches = [...branches];
                setBranches(prev => prev.map(b => b.id === editingBranch.id ? { ...b, ...formData } : b));
                await api.put(`/branches/${editingBranch.id}`, formData);
                toast.success('Branch updated successfully');
            } else {
                await api.post('/branches', formData);
                toast.success('Branch created successfully');
            }
            setShowModal(false);
            setEditingBranch(null);
            setFormData({ name: '', address: '', phone: '', upi_id: '', short_name: '' });
            fetchBranches();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save branch');
            fetchBranches();
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Branch',
            message: 'Are you sure? Deleting a branch will affect staff and jobs associated with it.',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;
        // Optimistic UI Update
        setBranches(prev => prev.filter(b => b.id !== id));
        try {
            await api.delete(`/branches/${id}`);
            toast.success('Branch deleted successfully');
            fetchBranches();
        } catch {
            setError('Failed to delete branch');
            fetchBranches();
        }
    };

    return (
        <PageContainer>
            <div className="page-header">
                <div>
                    <h1 className="section-title">Branches Management</h1>
                    <p className="section-subtitle">Manage physical locations and service centers.</p>
                </div>
                <button
                    onClick={() => {
                        setEditingBranch(null);
                        setFormData({ name: '', address: '', phone: '', upi_id: '', short_name: '' });
                        setShowModal(true);
                    }}
                    className="btn btn-primary"
                >
                    <Plus size={20} />
                    <span>Add Branch</span>
                </button>
            </div>

            <div className="panel panel--tight">
                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Branch Name</th>
                                <th>Code</th>
                                <th>Address</th>
                                <th>Phone</th>
                                <th>UPI ID</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && branches.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center muted table-empty">
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : branches.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center muted table-empty">
                                        No branches found.
                                    </td>
                                </tr>
                            ) : (
                                branches.map((b) => (
                                    <tr
                                        key={b.id}
                                        {...(isTouchDevice()
                                            ? { onClick: () => { setEditingBranch(b); setFormData({ name: b.name, address: b.address || '', phone: b.phone || '', upi_id: b.upi_id || '', short_name: b.short_name || '' }); setShowModal(true); } }
                                            : { onDoubleClick: () => { setEditingBranch(b); setFormData({ name: b.name, address: b.address || '', phone: b.phone || '', upi_id: b.upi_id || '', short_name: b.short_name || '' }); setShowModal(true); } }
                                        )}
                                        title={isTouchDevice() ? "Click to edit" : "Double click to edit"}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td>
                                            <div className="row gap-sm">
                                                <div className="user-avatar avatar-sm">
                                                    <Building2 size={16} />
                                                </div>
                                                <span className="user-name">{b.name}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ 
                                                display: 'inline-block', 
                                                padding: '2px 8px', 
                                                borderRadius: '4px', 
                                                backgroundColor: 'var(--accent-light)', 
                                                color: 'var(--primary)',
                                                fontWeight: '600',
                                                fontSize: '12px'
                                            }}>
                                                {b.short_name || '---'}
                                            </span>
                                        </td>
                                        <td className="text-sm muted">
                                            <div className="row gap-sm">
                                                <MapPin size={14} />
                                                {b.address || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="text-sm muted">
                                            <div className="row gap-sm">
                                                <Phone size={14} />
                                                {b.phone || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="text-sm muted">
                                            {b.upi_id ? (
                                                <div className="row gap-sm">
                                                    <CreditCard size={14} />
                                                    {b.upi_id}
                                                </div>
                                            ) : (
                                                <span style={{ opacity: 0.4 }}>Not set</span>
                                            )}
                                        </td>
                                        <td>
                                            <div role="button" tabIndex={0} className="row gap-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingBranch(b);
                                                        setFormData({ name: b.name, address: b.address || '', phone: b.phone || '', upi_id: b.upi_id || '', short_name: b.short_name || '' });
                                                        setShowModal(true);
                                                    }}
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-danger"
                                                    style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(b.id);
                                                    }}
                                                >
                                                    <Trash2 size={16} />
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

            {showModal && (
                <div className="branch-modal-backdrop" onClick={() => setShowModal(false)}>
                    <div className="branch-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="branch-modal-header">
                            <div className="branch-modal-title">
                                <span className="branch-modal-title-icon">
                                    <Building2 size={18} />
                                </span>
                                <span>{editingBranch ? 'Edit Branch' : 'Add Branch'}</span>
                            </div>
                            <button className="branch-modal-close" onClick={() => setShowModal(false)} aria-label="Close modal">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="branch-form">
                            <div className="branch-form-row">
                                <div className="branch-form-group flex-2">
                                    <label className="branch-form-label">Branch Name *</label>
                                    <input
                                        type="text"
                                        className="branch-form-input"
                                        name="branchName"
                                        placeholder="e.g. Perambra"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="branch-form-group flex-1">
                                    <label className="branch-form-label">Code (3 chars)</label>
                                    <input
                                        type="text"
                                        className="branch-form-input"
                                        name="branchShortName"
                                        maxLength={3}
                                        placeholder="PBA"
                                        value={formData.short_name || ''}
                                        onChange={(e) => setFormData({ ...formData, short_name: e.target.value.toUpperCase() })}
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                            </div>
                            <div className="branch-form-group">
                                <label className="branch-form-label">Address</label>
                                <textarea
                                    className="branch-form-textarea"
                                    name="branchAddress"
                                    rows="3"
                                    placeholder="Enter physical branch address..."
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <div className="branch-form-group">
                                <label className="branch-form-label">Phone Number</label>
                                <input
                                    type="text"
                                    className="branch-form-input"
                                    name="branchPhone"
                                    placeholder="e.g. +91 98765 43210"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="branch-form-group">
                                <label className="branch-form-label">UPI ID (for payment QR code)</label>
                                <input
                                    type="text"
                                    className="branch-form-input"
                                    name="branchUpiId"
                                    placeholder="e.g. shopname@upi"
                                    value={formData.upi_id}
                                    onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                                />
                            </div>
                            {error && <div className="branch-form-error">{error}</div>}
                            <div className="branch-form-actions">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="btn btn-primary">
                                    {loading ? <Loader2 className="animate-spin" /> : (editingBranch ? 'Update Branch' : 'Create Branch')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </PageContainer>
    );
};

export default Branches;

import React, { useState, useEffect } from 'react';
import { Plus, X, Edit2, Trash2, MapPin, Phone, Loader2, Building2, CreditCard } from 'lucide-react';

import api from '../services/api';
import { isTouchDevice } from '../services/utils';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';

const Branches = () => {
    const { confirm } = useConfirm();
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingBranch, setEditingBranch] = useState(null);
    const [formData, setFormData] = useState({ name: '', address: '', phone: '', upi_id: '' });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchBranches();
    }, []);

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
        } catch (err) {
            setError('Failed to fetch branches');
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingBranch) {
                await api.put(`/branches/${editingBranch.id}`, formData);
                toast.success('Branch updated successfully');
            } else {
                await api.post('/branches', formData);
                toast.success('Branch created successfully');
            }
            setShowModal(false);
            setEditingBranch(null);
            setFormData({ name: '', address: '', phone: '', upi_id: '' });
            fetchBranches();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save branch');
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
        try {
            await api.delete(`/branches/${id}`);
            toast.success('Branch deleted successfully');
            fetchBranches();
        } catch (err) {
            setError('Failed to delete branch');
        }
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Branches Management</h1>
                    <p className="section-subtitle">Manage physical locations and service centers.</p>
                </div>
                <button
                    onClick={() => {
                        setEditingBranch(null);
                        setFormData({ name: '', address: '', phone: '', upi_id: '' });
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
                                            ? { onClick: () => { setEditingBranch(b); setFormData({ name: b.name, address: b.address || '', phone: b.phone || '', upi_id: b.upi_id || '' }); setShowModal(true); } }
                                            : { onDoubleClick: () => { setEditingBranch(b); setFormData({ name: b.name, address: b.address || '', phone: b.phone || '', upi_id: b.upi_id || '' }); setShowModal(true); } }
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
                                            <div className="row gap-sm" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingBranch(b);
                                                        setFormData({ name: b.name, address: b.address || '', phone: b.phone || '', upi_id: b.upi_id || '' });
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
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" onClick={() => setShowModal(false)}>
                            <X size={22} />
                        </button>
                        <h2 className="section-title mb-16">{editingBranch ? 'Edit Branch' : 'Add Branch'}</h2>
                        <form onSubmit={handleSubmit} className="stack-md">
                            <div>
                                <label className="label">Branch Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Address</label>
                                <textarea
                                    className="input-field"
                                    rows="3"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">Phone Number</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="label">UPI ID (for payment QR code)</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="e.g. shopname@upi"
                                    value={formData.upi_id}
                                    onChange={(e) => setFormData({ ...formData, upi_id: e.target.value })}
                                />
                            </div>
                            {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
                            <button type="submit" disabled={loading} className="btn btn-primary btn--full">
                                {loading ? <Loader2 className="animate-spin" /> : (editingBranch ? 'Update Branch' : 'Create Branch')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Branches;

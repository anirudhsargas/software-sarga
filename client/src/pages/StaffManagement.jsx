import React, { useEffect, useState } from 'react';
import { UserPlus, Search, Shield, Phone, User, Loader2, Plus, X, Edit2, Trash2, Key, BarChart3, Banknote, Calendar } from 'lucide-react';
import HolidayCalendar from '../components/HolidayCalendar';
import { useNavigate } from 'react-router-dom';
import auth from '../services/auth';
import api, { imgUrl } from '../services/api';
import { serverNow } from '../services/serverTime';
import ImageCropModal from '../components/ImageCropModal';
import { isTouchDevice } from '../services/utils';
import Pagination from '../components/Pagination';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';

const StaffManagement = () => {
    const { confirm } = useConfirm();
    const navigate = useNavigate();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [showHolidayModal, setShowHolidayModal] = useState(false);
    const [showSalaryConfig, setShowSalaryConfig] = useState(false);
    const [newStaff, setNewStaff] = useState({ mobile: '', name: '', role: 'Other Staff', countryCode: '+91', branch_id: '', salary_type: 'Monthly', base_salary: '', daily_rate: '' });
    const [branches, setBranches] = useState([]);
    const [error, setError] = useState('');
    const [newStaffImage, setNewStaffImage] = useState(null);
    const [newStaffPreview, setNewStaffPreview] = useState('');
    const [editStaffImage, setEditStaffImage] = useState(null);
    const [editStaffPreview, setEditStaffPreview] = useState('');
    const [cropState, setCropState] = useState(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [selectedBranchFilter, setSelectedBranchFilter] = useState('');



    const roles = ['Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'];

    useEffect(() => {
        fetchStaff();
        fetchBranches();
    }, []);

    useEffect(() => {
        fetchStaff();
    }, [page, selectedBranchFilter]); // Fetch when page OR branch filter changes

    useEffect(() => {
        setPage(1); // Reset to first page when branch filter changes
    }, [selectedBranchFilter]);

    useEffect(() => {
        if (!newStaffImage) {
            setNewStaffPreview('');
            return;
        }
        const url = URL.createObjectURL(newStaffImage);
        setNewStaffPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [newStaffImage]);

    useEffect(() => {
        if (editStaffImage) {
            const url = URL.createObjectURL(editStaffImage);
            setEditStaffPreview(url);
            return () => URL.revokeObjectURL(url);
        }
        if (selectedStaff?.image_url) {
            setEditStaffPreview(imgUrl(selectedStaff.image_url));
        } else {
            setEditStaffPreview('');
        }
    }, [editStaffImage, selectedStaff]);

    const fetchBranches = async () => {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
            // Don't auto-set branch_id here to allow "Select Branch" placeholder
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const fetchStaff = async () => {
        try {
            setLoading(true);
            let url = `/staff?page=${page}&limit=20`;
            if (selectedBranchFilter) {
                url += `&branch_id=${selectedBranchFilter}`;
            }
            const response = await api.get(url);
            const res = response.data;
            // Sort staff alphabetically by name
            const sortedStaff = [...res.data].sort((a, b) =>
                (a.name || '').localeCompare(b.name || '')
            );
            setStaff(sortedStaff);
            setTotal(res.total);
            setTotalPages(res.totalPages);
        } catch (err) {
            setError('Failed to fetch staff list');
        } finally {
            setLoading(false);
        }
    };

    const validateMobile = (value) => {
        // Remove white spaces and non-numeric characters
        const cleaned = value.replace(/\D/g, '');
        // Limit to 10 digits
        return cleaned.slice(0, 10);
    };

    const openCropper = (file, target) => {
        if (!file) return;
        setCropState({ file, target });
    };

    const handleCropCancel = () => {
        setCropState(null);
    };

    const handleCropComplete = (croppedFile) => {
        if (!cropState) return;
        if (cropState.target === 'newStaff') {
            setNewStaffImage(croppedFile);
        }
        if (cropState.target === 'editStaff') {
            setEditStaffImage(croppedFile);
        }
        setCropState(null);
    };

    const handleAddStaff = async (e) => {
        e.preventDefault();
        if (newStaff.mobile.length !== 10) {
            return setError('Mobile number must be exactly 10 digits');
        }
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('mobile', newStaff.mobile);
            formData.append('name', newStaff.name);
            formData.append('role', newStaff.role);
            formData.append('branch_id', newStaff.branch_id);
            if (isAdmin) {
                formData.append('salary_type', newStaff.salary_type || 'Monthly');
                if (newStaff.salary_type === 'Monthly') {
                    formData.append('base_salary', newStaff.base_salary || 0);
                } else {
                    formData.append('daily_rate', newStaff.daily_rate || 0);
                }
            }
            if (newStaffImage) formData.append('image', newStaffImage);

            await api.post('/staff', formData);
            setShowAddModal(false);
            setNewStaff({ mobile: '', name: '', role: 'Other Staff', countryCode: '+91', branch_id: branches[0]?.id || '', salary_type: 'Monthly', base_salary: '', daily_rate: '' });
            setNewStaffImage(null);
            fetchStaff();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to add staff');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStaff = async (e) => {
        e.preventDefault();
        if (selectedStaff.user_id.length !== 10) {
            return setError('Mobile number must be exactly 10 digits');
        }
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('mobile', selectedStaff.user_id);
            formData.append('name', selectedStaff.name);
            formData.append('role', selectedStaff.role);
            formData.append('branch_id', selectedStaff.branch_id || '');

            // Add salary fields if admin
            if (isAdmin) {
                formData.append('salary_type', selectedStaff.salary_type || 'Monthly');
                if (selectedStaff.salary_type === 'Monthly') {
                    formData.append('base_salary', selectedStaff.base_salary || 0);
                } else {
                    formData.append('daily_rate', selectedStaff.daily_rate || 0);
                }
            }

            if (editStaffImage) formData.append('image', editStaffImage);

            await api.put(`/staff/${selectedStaff.id}`, formData);
            setShowEditModal(false);
            setSelectedStaff(null);
            setEditStaffImage(null);
            fetchStaff();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update staff');
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveStaffImage = async () => {
        if (!selectedStaff) return;

        const isConfirmed = await confirm({
            title: 'Remove Photo',
            message: 'Are you sure you want to remove this staff photo?',
            confirmText: 'Remove',
            type: 'danger'
        });
        if (!isConfirmed) return;

        setLoading(true);
        try {
            await api.delete(`/staff/${selectedStaff.id}/image`);
            setEditStaffImage(null);
            setEditStaffPreview('');
            setSelectedStaff({ ...selectedStaff, image_url: null });
            fetchStaff();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to remove staff photo');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteStaff = async (id) => {
        const isConfirmed = await confirm({
            title: 'Delete Staff Member',
            message: 'Are you sure you want to delete this staff member?\n\nThis will also remove their related requests and logs. This action cannot be undone.',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.delete(`/staff/${id}`);
            fetchStaff();
        } catch (err) {
            setError('Failed to delete staff member');
        }
    };

    const handleResetPassword = async (id) => {
        const isConfirmed = await confirm({
            title: 'Reset Password',
            message: 'Reset password to mobile number?\n\nThe staff member will be required to change it on next login.',
            confirmText: 'Reset',
            type: 'danger' // Using danger or primary contextually, it's a major action
        });
        if (!isConfirmed) return;

        try {
            await api.put(`/staff/${id}/reset-password`, {});
            toast.success('Password reset successfully!');
        } catch (err) {
            setError('Failed to reset password');
        }
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Staff Management</h1>
                    <p className="section-subtitle">Add and manage printing shop team members.</p>
                </div>
                {isAdmin && (
                    <div className="row gap-sm">
                        <button
                            onClick={() => setShowHolidayModal(true)}
                            className="btn btn-ghost"
                            style={{ gap: 8 }}
                        >
                            <Calendar size={20} />
                            <span>Mark Holiday</span>
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="btn btn-primary"
                        >
                            <Plus size={20} />
                            <span>Add Staff</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="panel panel--tight">
                <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <label htmlFor="branch-filter" style={{ fontWeight: '500', marginRight: '8px' }}>
                        Filter by Branch:
                    </label>
                    <select
                        id="branch-filter"
                        value={selectedBranchFilter}
                        onChange={(e) => setSelectedBranchFilter(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            borderRadius: '4px',
                            border: '1px solid #ddd',
                            fontSize: '14px',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">All Branches</option>
                        {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                                {branch.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="table-scroll">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Staff Details</th>
                                <th>Role</th>
                                <th>Branch</th>
                                <th>Mobile (User ID)</th>
                                {/* Password Status column removed */}
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && staff.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center muted table-empty">
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : staff.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="text-center muted table-empty">
                                        No staff members found.
                                    </td>
                                </tr>
                            ) : (
                                staff.map((s) => (
                                    <tr
                                        key={s.id}
                                        onDoubleClick={() => navigate(`/dashboard/employee/${s.id}`)}
                                        className="hover:bg-slate-50 transition-colors"
                                        title="Double click to view dashboard"
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <td>
                                            <div className="row gap-sm">
                                                <div className="user-avatar avatar-sm">
                                                    {s.image_url ? (
                                                        <img
                                                            src={imgUrl(s.image_url)}
                                                            alt={s.name}
                                                            className="avatar-img"
                                                        />
                                                    ) : (
                                                        <User size={16} />
                                                    )}
                                                </div>
                                                <span className="user-name">
                                                    {s.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge">{s.role}</span>
                                        </td>
                                        <td className="text-sm">{s.branch_name || 'N/A'}</td>
                                        <td className="text-sm">+91 {s.user_id}</td>
                                        {/* Password Status cell removed */}
                                        <td className="text-sm muted">
                                            {new Date(s.created_at).toLocaleDateString()}
                                        </td>
                                        <td>
                                            {isAdmin ? (
                                                <div className="row gap-sm" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate('/payments', {
                                                                state: {
                                                                    paymentPrefill: {
                                                                        type: 'Salary',
                                                                        staff_id: s.id,
                                                                        payee_name: s.name,
                                                                        description: `Salary for ${serverNow().toLocaleString('default', { month: 'long' })}`
                                                                    }
                                                                }
                                                            });
                                                        }}
                                                        title="Pay Salary"
                                                    >
                                                        <Banknote size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost"
                                                        style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/dashboard/employee/${s.id}`);
                                                        }}
                                                        title="View Dashboard"
                                                    >
                                                        <BarChart3 size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-danger"
                                                        style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedStaff({ ...s, countryCode: '+91' });
                                                            setShowEditModal(true);
                                                        }}
                                                        title="Edit Staff Member"
                                                    >
                                                        <Edit2 size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-danger"
                                                        style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleResetPassword(s.id);
                                                        }}
                                                        title="Reset Password to Default"
                                                    >
                                                        <Key size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-ghost btn-danger"
                                                        style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteStaff(s.id);
                                                        }}
                                                        title="Delete Staff Member"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ padding: '8px', minWidth: 'auto', border: 'none' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/dashboard/employee/${s.id}`);
                                                    }}
                                                    title="View Dashboard"
                                                >
                                                    <BarChart3 size={16} />
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
            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

            {/* Add Staff Modal */}
            {showAddModal && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button
                            className="modal-close"
                            onClick={() => setShowAddModal(false)}
                        >
                            <X size={22} />
                        </button>

                        <h2 className="section-title mb-16">Add Staff Member</h2>
                        <form onSubmit={handleAddStaff} className="stack-md">
                            <div>
                                <label className="label">Staff Photo (Optional)</label>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="input-field"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        if (file) openCropper(file, 'newStaff');
                                        e.target.value = '';
                                    }}
                                />
                                {newStaffPreview && (
                                    <div className="row gap-sm" style={{ marginTop: '8px' }}>
                                        <img src={newStaffPreview} alt="Preview" className="thumb-img" />
                                        <span className="text-sm muted">Preview</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    placeholder="Enter full name"
                                    value={newStaff.name}
                                    onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Mobile Number (User ID)</label>
                                <div className="row gap-sm">
                                    <input
                                        type="text"
                                        className="input-field"
                                        style={{ width: '80px', textAlign: 'center' }}
                                        value={newStaff.countryCode}
                                        onChange={(e) => setNewStaff({ ...newStaff, countryCode: e.target.value })}
                                        placeholder="+91"
                                    />
                                    <input
                                        type="tel"
                                        className="input-field"
                                        placeholder="10 digit number"
                                        value={newStaff.mobile}
                                        onChange={(e) => setNewStaff({ ...newStaff, mobile: validateMobile(e.target.value) })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Branch</label>
                                <select
                                    className="input-field"
                                    value={newStaff.branch_id}
                                    onChange={(e) => setNewStaff({ ...newStaff, branch_id: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Select Branch</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Role</label>
                                <select
                                    className="input-field"
                                    value={newStaff.role}
                                    onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                                >
                                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            {isAdmin && (
                                <>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                                        <h3 className="section-subtitle">Salary & Compensation</h3>
                                    </div>

                                    <div>
                                        <label className="label">Salary Type</label>
                                        <select
                                            className="input-field"
                                            value={newStaff.salary_type || 'Monthly'}
                                            onChange={(e) => setNewStaff({ ...newStaff, salary_type: e.target.value })}
                                        >
                                            <option value="Monthly">Monthly</option>
                                            <option value="Daily">Daily</option>
                                        </select>
                                    </div>

                                    {newStaff.salary_type === 'Monthly' ? (
                                        <div>
                                            <label className="label">Base Monthly Salary (₹)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="input-field"
                                                placeholder="e.g., 25000"
                                                value={newStaff.base_salary || ''}
                                                onChange={(e) => setNewStaff({ ...newStaff, base_salary: e.target.value })}
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="label">Daily Rate (₹)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="input-field"
                                                placeholder="e.g., 500"
                                                value={newStaff.daily_rate || ''}
                                                onChange={(e) => setNewStaff({ ...newStaff, daily_rate: e.target.value })}
                                            />
                                        </div>
                                    )}
                                </>
                            )}

                            {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn btn-primary btn--full"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "Create Account"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Staff Modal */}
            {showEditModal && selectedStaff && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button
                            className="modal-close"
                            onClick={() => {
                                setShowEditModal(false);
                                setSelectedStaff(null);
                            }}
                        >
                            <X size={22} />
                        </button>

                        <h2 className="section-title mb-16">Edit Staff Member</h2>
                        <form onSubmit={handleUpdateStaff} className="stack-md">
                            <div>
                                <label className="label">Staff Photo (Optional)</label>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="input-field"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0] || null;
                                        if (file) openCropper(file, 'editStaff');
                                        e.target.value = '';
                                    }}
                                />
                                {editStaffPreview && (
                                    <div className="row gap-sm" style={{ marginTop: '8px' }}>
                                        <img src={editStaffPreview} alt="Preview" className="thumb-img" />
                                        <span className="text-sm muted">Preview</span>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-sm text-error"
                                            onClick={handleRemoveStaffImage}
                                        >
                                            Remove Photo
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="label">Full Name</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={selectedStaff.name}
                                    onChange={(e) => setSelectedStaff({ ...selectedStaff, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="label">Mobile Number (User ID)</label>
                                <div className="row gap-sm">
                                    <input
                                        type="text"
                                        className="input-field"
                                        style={{ width: '80px', textAlign: 'center' }}
                                        value={selectedStaff.countryCode || '+91'}
                                        onChange={(e) => setSelectedStaff({ ...selectedStaff, countryCode: e.target.value })}
                                    />
                                    <input
                                        type="tel"
                                        className="input-field"
                                        value={selectedStaff.user_id}
                                        onChange={(e) => setSelectedStaff({ ...selectedStaff, user_id: validateMobile(e.target.value) })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="label">Branch</label>
                                <select
                                    className="input-field"
                                    value={selectedStaff.branch_id || ''}
                                    onChange={(e) => setSelectedStaff({ ...selectedStaff, branch_id: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Select Branch</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="label">Role</label>
                                <select
                                    className="input-field"
                                    value={selectedStaff.role}
                                    onChange={(e) => setSelectedStaff({ ...selectedStaff, role: e.target.value })}
                                >
                                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            {isAdmin && (
                                <>
                                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                                        <h3 className="section-subtitle">Salary & Compensation</h3>
                                    </div>

                                    <div>
                                        <label className="label">Salary Type</label>
                                        <select
                                            className="input-field"
                                            value={selectedStaff.salary_type || 'Monthly'}
                                            onChange={(e) => setSelectedStaff({ ...selectedStaff, salary_type: e.target.value })}
                                        >
                                            <option value="Monthly">Monthly</option>
                                            <option value="Daily">Daily</option>
                                        </select>
                                    </div>

                                    {selectedStaff.salary_type === 'Monthly' ? (
                                        <div>
                                            <label className="label">Base Monthly Salary (₹)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="input-field"
                                                placeholder="e.g., 25000"
                                                value={selectedStaff.base_salary || ''}
                                                onChange={(e) => setSelectedStaff({ ...selectedStaff, base_salary: e.target.value })}
                                            />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="label">Daily Rate (₹)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="input-field"
                                                placeholder="e.g., 500"
                                                value={selectedStaff.daily_rate || ''}
                                                onChange={(e) => setSelectedStaff({ ...selectedStaff, daily_rate: e.target.value })}
                                            />
                                        </div>
                                    )}
                                </>
                            )}

                            {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn btn-primary btn--full"
                            >
                                {loading ? <Loader2 className="animate-spin" /> : "Update Details"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Mark Holiday Modal */}
            {showHolidayModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ padding: 0, overflow: 'hidden', border: 'none', background: 'transparent' }}>
                        <button
                            className="modal-close"
                            onClick={() => setShowHolidayModal(false)}
                            style={{ zIndex: 10, top: 12, right: 12 }}
                        >
                            <X size={22} />
                        </button>
                        <HolidayCalendar onSuccess={() => {
                            setTimeout(() => setShowHolidayModal(false), 1500);
                        }} />
                    </div>
                </div>
            )}

            <ImageCropModal
                file={cropState?.file || null}
                title="Crop Staff Photo"
                outputSize={512}
                onCancel={handleCropCancel}
                onComplete={handleCropComplete}
            />
        </div>
    );
};

export default StaffManagement;

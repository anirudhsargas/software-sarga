import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { User, Loader2, Plus, X, Edit2, Trash2, Key, BarChart3, Banknote, Calendar, LogIn, LogOut, Settings } from 'lucide-react';
import HolidayCalendar from '../components/HolidayCalendar';
import SecureImage from '../components/SecureImage';
import { useNavigate } from 'react-router-dom';
import auth from '../services/auth';
import api, { imgUrl } from '../services/api';
import ImageCropModal from '../components/ImageCropModal';
import Pagination from '../components/Pagination';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import CountryCodeSelect from '../components/CountryCodeSelect';
import { formatForDisplay, telHref } from '../utils/phone';
import { validatePhone, filterMobile } from '../utils/validators';

import BranchSelect from '../components/ui/BranchSelect';
// Memoized staff row
const StaffRow = React.memo(({ staff: s, navigate, setSelectedStaff, setShowEditModal, setEditStaffImage, setEditStaffPreview, handleDelete, isAdmin, handleResetPassword, handleMarkAttendance, todayAttendance, onOpenSettings }) => (
    <tr
        key={s.id}
        onDoubleClick={() => navigate(`/dashboard/employee/${s.id}`)}
        style={{ cursor: 'pointer' }}
        title="Double click to view dashboard"
    >
        <td>
            <div className="row gap-sm">
                <div className="user-avatar avatar-sm">
                    {s.image_url ? (
                        <SecureImage src={s.image_url} alt={s.name} className="avatar-img" />
                    ) : (
                        <User size={16} />
                    )}
                </div>
                <span className="user-name">{s.name}</span>
            </div>
        </td>
        <td>{s.role}</td>
        <td>{s.branch_name || 'N/A'}</td>
        <td>{formatForDisplay(s.user_id || s.mobile)}</td>
        <td>{new Date(s.created_at).toLocaleDateString()}</td>
        <td>
            {isAdmin ? (
                <div role="button" tabIndex={0} className="row gap-sm" onClick={(e) => e.stopPropagation()}>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAttendance(s.id);
                        }}
                        title={todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? "Mark Gone" : "Mark Attendance"}
                    >
                        {todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? <LogOut size={15} /> : <LogIn size={15} />}
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate('/dashboard/attendance-salary', {
                                state: {
                                    paymentPrefill: {
                                        type: 'Salary',
                                        staff_id: s.id,
                                        payee_name: s.name,
                                        description: `Salary for ${new Date().toLocaleString('default', { month: 'long' })}`
                                    }
                                }
                            });
                        }}
                        title="Pay Salary"
                    >
                        <Banknote size={15} />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/employee/${s.id}`); }}
                        title="View Dashboard"
                    >
                        <BarChart3 size={15} />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                            onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStaff({ ...s, countryCode: s.countryCode || '+91' });
                            setEditStaffImage(null);
                            setEditStaffPreview('');
                            setShowEditModal(true);
                        }}
                        title="Edit Staff Member"
                    >
                        <Edit2 size={15} />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); handleResetPassword(s.id); }}
                        title="Reset Password to Default"
                    >
                        <Key size={15} />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); onOpenSettings(s); }}
                        title="Staff Settings"
                    >
                        <Settings size={15} />
                    </button>
                    <button
                        className="btn btn-ghost text-error"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                        title="Delete Staff Member"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            ) : (
                <>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAttendance(s.id);
                        }}
                        title={todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? "Mark Gone" : "Mark Attendance"}
                    >
                        {todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? <LogOut size={15} /> : <LogIn size={15} />}
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/employee/${s.id}`); }}
                        title="View Dashboard"
                    >
                        <BarChart3 size={15} />
                    </button>
                </>
            )}
        </td>
    </tr>
));

const StaffManagement = () => {
    useSEO('Staff Management');

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
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [settingsStaff, setSettingsStaff] = useState(null);
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
    const [searchInput, setSearchInput] = useState('');
    const debouncedSearch = useDebounce(searchInput, 300);
    const [todayAttendance, setTodayAttendance] = useState({});

    const roles = ['Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'];

    useEffect(() => {
        fetchStaff();
        fetchBranches();
        fetchTodayAttendance();
    }, []);

    useEffect(() => {
        fetchStaff();
    }, [page, selectedBranchFilter]);

    useEffect(() => {
        setPage(1);
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

    // validateMobile now imported from ../utils/validators

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

            const response = await api.post('/staff', formData);
            // Optimistic UI Update - add new staff to local state
            if (response.data) {
                setStaff(prev => [...prev, response.data]);
            }
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
        // Optimistic UI Update
        const prevStaff = [...staff];
        setStaff(prev => prev.map(s => s.id === selectedStaff.id ? { ...s, ...selectedStaff, user_id: selectedStaff.user_id } : s));
        try {
            const formData = new FormData();
            formData.append('mobile', selectedStaff.user_id);
            formData.append('name', selectedStaff.name);
            formData.append('role', selectedStaff.role);
            formData.append('branch_id', selectedStaff.branch_id || '');

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
            setStaff(prevStaff);
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
            message: 'Are you sure you want to delete this staff member?\n\nThis action cannot be undone.',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;
        
        // Optimistic UI Update
        setStaff(prev => prev.filter(s => s.id !== id));
        
        try {
            await api.delete(`/staff/${id}`);
            fetchStaff();
        } catch (err) {
            setError('Failed to delete staff member');
            fetchStaff();
        }
    };

    const handleResetPassword = async (id) => {
        const isConfirmed = await confirm({
            title: 'Reset Password',
            message: 'Reset password to mobile number?',
            confirmText: 'Reset',
            type: 'danger'
        });
        if (!isConfirmed) return;
        try {
            await api.put(`/staff/${id}/reset-password`, {});
            toast.success('Password reset successfully!');
        } catch (err) {
            setError('Failed to reset password');
        }
    };

    const fetchTodayAttendance = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const response = await api.get(`/cctv/attendance/summary?date=${today}`);
            const attendanceMap = {};
            response.data.staff.forEach(att => {
                attendanceMap[att.staff_id] = {
                    in_time: att.entry_time ? att.entry_time.split(' ')[1] : null,
                    out_time: att.exit_time ? att.exit_time.split(' ')[1] : null,
                    status: att.status === 'present' ? 'Present' : att.status
                };
            });
            setTodayAttendance(attendanceMap);
        } catch (err) {
            console.error('Failed to fetch today\'s attendance:', err);
        }
    };

    const handleMarkAttendance = async (staffId) => {
        const existing = todayAttendance[staffId];
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toTimeString().slice(0, 5);

        try {
            if (existing?.in_time && !existing?.out_time) {
                // Mark as gone (out_time)
                await api.post(`/staff/${staffId}/attendance`, {
                    attendance_date: today,
                    status: existing.status || 'Present',
                    gone_time: now
                });
                toast.success('Marked as gone successfully!');
            } else {
                // Mark attendance (in_time)
                await api.post(`/staff/${staffId}/attendance`, {
                    attendance_date: today,
                    status: 'Present',
                    time: now
                });
                toast.success('Attendance marked successfully!');
            }
            fetchTodayAttendance();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to mark attendance');
        }
    };

    const filteredStaff = useMemo(() => {
        if (!debouncedSearch) return staff;
        const q = debouncedSearch.toLowerCase();
        return staff.filter(s =>
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.mobile && s.mobile.includes(q)) ||
            (s.role && s.role.toLowerCase().includes(q))
        );
    }, [staff, debouncedSearch]);

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Staff Management</h1>
                    <p className="section-subtitle">Add and manage printing shop team members.</p>
                </div>
                {isAdmin && (
                    <div className="row gap-sm">
                        <button onClick={() => setShowHolidayModal(true)} className="btn btn-ghost" style={{ gap: 8 }}>
                            <Calendar size={20} />
                            <span>Mark Holiday</span>
                        </button>
                        <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                            <Plus size={20} />
                            <span>Add Staff</span>
                        </button>
                    </div>
                )}
            </div>

            <div className="row gap-sm" style={{ marginBottom: 12 }}>
                <input
                    type="text"
                    className="input-field"
                    placeholder="Search staff..."
                    style={{ minWidth: 180 }}
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                />
                <BranchSelect 
                    className="input-field" 
                    style={{ width: 180 }}
                    value={selectedBranchFilter}
                    onChange={e => setSelectedBranchFilter(e.target.value)}
                >
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </BranchSelect>
            </div>

            <div className="table-scroll">
                <table className="table">
                    <thead>
                        <tr>
                            <th>Staff Details</th>
                            <th>Role</th>
                            <th>Branch</th>
                            <th>Mobile (User ID)</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && filteredStaff.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                                <Loader2 className="animate-spin" style={{ display: 'inline', marginRight: 8 }} /> Loading staff...
                            </td></tr>
                        ) : filteredStaff.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                                No staff members found.
                            </td></tr>
                        ) : filteredStaff.map(s => (
                            <StaffRow
                                key={s.id}
                                staff={s}
                                navigate={navigate}
                                setSelectedStaff={setSelectedStaff}
                                setShowEditModal={setShowEditModal}
                                setEditStaffImage={setEditStaffImage}
                                setEditStaffPreview={setEditStaffPreview}
                                handleDelete={handleDeleteStaff}
                                isAdmin={isAdmin}
                                handleResetPassword={handleResetPassword}
                                handleMarkAttendance={handleMarkAttendance}
                                todayAttendance={todayAttendance}
                                onOpenSettings={(s) => { setSettingsStaff(s); setShowSettingsModal(true); }}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

            {showAddModal && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" onClick={() => setShowAddModal(false)}><X size={22} /></button>
                        <h2 className="section-title mb-16">Add Staff Member</h2>
                        <form onSubmit={handleAddStaff} className="stack-md">
                            <div>
                                <label className="label">Staff Photo</label>
                                <input type="file" name="newStaffPhoto" accept="image/*" onChange={e => openCropper(e.target.files?.[0], 'newStaff')} />
                                {newStaffPreview && <img loading="lazy" src={newStaffPreview} className="thumb-img" alt="preview" style={{ marginTop: 8, borderRadius: 8, maxHeight: 80 }} />}
                            </div>
                            <div>
                                <label className="label">Full Name</label>
                                <input type="text" name="newStaffName" className="input-field" placeholder="Full Name" value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} required />
                            </div>
                            <div>
                                <label className="label">Mobile Number</label>
                                <div className="row gap-sm">
                                    <CountryCodeSelect value={newStaff.countryCode} onChange={(val) => setNewStaff({...newStaff, countryCode: val})} />
                                    <input type="tel" name="newStaffMobile" className="input-field" placeholder="10-digit mobile" value={newStaff.mobile} onChange={e => setNewStaff({...newStaff, mobile: filterMobile(e.target.value)})} required />
                                </div>
                            </div>
                            <div>
                                <label className="label">Branch</label>
                                <BranchSelect name="newStaffBranch" className="input-field" value={newStaff.branch_id} onChange={e => setNewStaff({...newStaff, branch_id: e.target.value})} required>
                                    <option value="">Select Branch</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </BranchSelect>
                            </div>
                            <div>
                                <label className="label">Role</label>
                                <select name="newStaffRole" className="input-field" value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value})}>
                                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            {isAdmin && (
                                <>
                                    <div>
                                        <label className="label">Salary Type</label>
                                        <select name="newStaffSalaryType" className="input-field" value={newStaff.salary_type} onChange={e => setNewStaff({...newStaff, salary_type: e.target.value})}>
                                            <option value="Monthly">Monthly</option>
                                            <option value="Daily">Daily</option>
                                        </select>
                                    </div>
                                    {newStaff.salary_type === 'Monthly' ? (
                                        <div>
                                            <label className="label">Base Salary (₹)</label>
                                            <input type="number" name="newStaffSalary" className="input-field" placeholder="0" min="0" value={newStaff.base_salary} onChange={e => setNewStaff({...newStaff, base_salary: e.target.value})} />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="label">Daily Rate (₹)</label>
                                            <input type="number" name="newStaffDailyRate" className="input-field" placeholder="0" min="0" value={newStaff.daily_rate} onChange={e => setNewStaff({...newStaff, daily_rate: e.target.value})} />
                                        </div>
                                    )}
                                </>
                            )}
                            <button type="submit" disabled={loading} className="btn btn-primary btn--full">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Create Account'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && selectedStaff && (
                <div className="modal-backdrop">
                    <div className="modal">
                        <button className="modal-close" onClick={() => setShowEditModal(false)}><X size={22} /></button>
                        <h2 className="section-title mb-16">Edit Staff Member</h2>
                        <form onSubmit={handleUpdateStaff} className="stack-md">
                            <div>
                                <label className="label">Staff Photo</label>
                                <div className="row gap-sm" style={{ alignItems: 'center' }}>
                                    {editStaffPreview && <img loading="lazy" src={editStaffPreview} alt="Preview" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
                                    <input type="file" name="editStaffPhoto" accept="image/*" onChange={e => openCropper(e.target.files?.[0], 'editStaff')} />
                                    {(editStaffImage || selectedStaff?.image_url) && (
                                        <button type="button" className="btn btn-ghost text-error" style={{ padding: '4px 8px', fontSize: 12 }} onClick={handleRemoveStaffImage}>Remove</button>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="label">Full Name</label>
                                <input type="text" name="editStaffName" className="input-field" value={selectedStaff.name} onChange={e => setSelectedStaff({...selectedStaff, name: e.target.value})} required />
                            </div>
                            <div>
                                <label className="label">Mobile Number</label>
                                <div className="row gap-sm">
                                    <CountryCodeSelect value={selectedStaff?.countryCode || '+91'} onChange={(val) => setSelectedStaff({...selectedStaff, countryCode: val})} />
                                    <input type="tel" name="editStaffMobile" className="input-field" value={selectedStaff.user_id} onChange={e => setSelectedStaff({...selectedStaff, user_id: filterMobile(e.target.value)})} required />
                                </div>
                            </div>
                            <div>
                                <label className="label">Branch</label>
                                <BranchSelect name="editStaffBranch" className="input-field" value={selectedStaff.branch_id || ''} onChange={e => setSelectedStaff({...selectedStaff, branch_id: e.target.value})}>
                                    <option value="">Select Branch</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </BranchSelect>
                            </div>
                            <div>
                                <label className="label">Role</label>
                                <select name="editStaffRole" className="input-field" value={selectedStaff.role} onChange={e => setSelectedStaff({...selectedStaff, role: e.target.value})}>
                                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            {isAdmin && (
                                <>
                                    <div>
                                        <label className="label">Salary Type</label>
                                        <select name="editStaffSalaryType" className="input-field" value={selectedStaff.salary_type || 'Monthly'} onChange={e => setSelectedStaff({...selectedStaff, salary_type: e.target.value})}>
                                            <option value="Monthly">Monthly</option>
                                            <option value="Daily">Daily</option>
                                        </select>
                                    </div>
                                    {(selectedStaff.salary_type || 'Monthly') === 'Monthly' ? (
                                        <div>
                                            <label className="label">Base Salary (₹)</label>
                                            <input type="number" name="editStaffSalary" className="input-field" min="0" value={selectedStaff.base_salary || ''} onChange={e => setSelectedStaff({...selectedStaff, base_salary: e.target.value})} />
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="label">Daily Rate (₹)</label>
                                            <input type="number" name="editStaffDailyRate" className="input-field" min="0" value={selectedStaff.daily_rate || ''} onChange={e => setSelectedStaff({...selectedStaff, daily_rate: e.target.value})} />
                                        </div>
                                    )}
                                </>
                            )}
                            <button type="submit" disabled={loading} className="btn btn-primary btn--full">
                                {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Details'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {showHolidayModal && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ padding: 0 }}>
                        <button className="modal-close" onClick={() => setShowHolidayModal(false)}><X size={22} /></button>
                        <HolidayCalendar onSuccess={() => setShowHolidayModal(false)} />
                    </div>
                </div>
            )}

            <ImageCropModal file={cropState?.file} title="Crop Photo" onCancel={handleCropCancel} onComplete={handleCropComplete} />

            {showSettingsModal && settingsStaff && (
                <StaffSettingsModal
                    staff={settingsStaff}
                    onClose={() => { setShowSettingsModal(false); setSettingsStaff(null); }}
                    onUpdate={(updatedStaff) => {
                        setStaff(prev => prev.map(s => s.id === updatedStaff.id ? updatedStaff : s));
                        fetchStaff();
                    }}
                />
            )}
        </div>
    );
};

const StaffSettingsModal = ({ staff, onClose, onUpdate }) => {
    const [loading, setLoading] = useState(false);
    const [settings, setSettings] = useState(() => {
        try {
            return staff.settings ? (typeof staff.settings === 'string' ? JSON.parse(staff.settings) : staff.settings) : {
                sidebar: {
                    dashboard: true,
                    customers: true,
                    billing: true,
                    jobs: true,
                    inventory: true,
                    expenses: true,
                    reports: true
                }
            };
        } catch (e) {
            return { sidebar: { dashboard: true, customers: true, billing: true, jobs: true, inventory: true, expenses: true, reports: true } };
        }
    });

    const sidebarOptions = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'customers', label: 'Customers' },
        { key: 'billing', label: 'Billing' },
        { key: 'jobs', label: 'Orders & Jobs' },
        { key: 'inventory', label: 'Inventory' },
        { key: 'operations', label: 'Operations' },
        { key: 'finance', label: 'Finance' },
        { key: 'manage', label: 'Management' },
        { key: 'reports', label: 'Reports' },
        { key: 'internal', label: 'Internal Books' },
    ];

    const handleSave = async () => {
        setLoading(true);
        try {
            const response = await api.put(`/staff/${staff.id}`, { settings });
            toast.success('Staff settings updated');
            onUpdate(response.data);
            onClose();
        } catch (err) {
            toast.error('Failed to update settings');
        } finally {
            setLoading(false);
        }
    };

    const toggleSidebar = (key) => {
        setSettings(prev => ({
            ...prev,
            sidebar: {
                ...prev.sidebar,
                [key]: !prev.sidebar[key]
            }
        }));
    };

    return (
        <div className="modal-backdrop">
            <div className="modal">
                <button className="modal-close" onClick={onClose}><X size={22} /></button>
                <h2 className="section-title mb-8">Settings: {staff.name}</h2>
                <p className="section-subtitle mb-24">Configure permissions and preferences for this staff member.</p>

                <div className="stack-md">
                    <div>
                        <h3 className="label" style={{ marginBottom: 12 }}>Sidebar Visibility</h3>
                        <div className="grid grid--2 gap-sm">
                            {sidebarOptions.map(opt => (
                                <label key={opt.key} className="row gap-sm items-center" style={{ cursor: 'pointer', padding: '8px', border: '1px solid var(--border)', borderRadius: 8 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!settings.sidebar?.[opt.key]}
                                        onChange={() => toggleSidebar(opt.key)}
                                    />
                                    <span style={{ fontSize: 14 }}>{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: 24 }}>
                        <button className="btn btn-primary btn--full" onClick={handleSave} disabled={loading}>
                            {loading ? <Loader2 size={18} className="animate-spin" /> : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StaffManagement;

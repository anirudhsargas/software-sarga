import { usePageTitle } from '../hooks/usePageTitle';
import React, { useEffect, useState, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { User, Loader2, Plus, X, Edit2, Trash2, Key, BarChart3, Banknote, Calendar, LogIn, LogOut, Settings, Search, Camera, Phone, Briefcase, DollarSign, MapPin } from 'lucide-react';
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
import { formatForDisplay } from '../utils/phone';
import { filterMobile } from '../utils/validators';

import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
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
                        <SecureImage src={s.image_url} alt={s.name} className="avatar-img" onError={(e) => { e.currentTarget.src = ''; e.currentTarget.style.display = 'none'; }} />
                    ) : (
                        <User size={16} aria-hidden="true" />
                    )}
                </div>
                <span className="user-name">{s.name}</span>
            </div>
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>{s.role}</td>
        <td>{s.branch_name || 'N/A'}</td>
        <td>{formatForDisplay(s.user_id || s.mobile)}</td>
        <td>{new Date(s.created_at).toLocaleDateString()}</td>
        <td>
            {isAdmin ? (
                <div role="button" tabIndex={0} className="row gap-sm" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleMarkAttendance(s.id);
                        }}
                        title={todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? "Mark Gone" : "Mark Attendance"}
                        aria-label={todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? "Mark Gone" : "Mark Attendance"}
                    >
                        {todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? <LogOut size={15} aria-hidden="true" /> : <LogIn size={15} aria-hidden="true" />}
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
                        aria-label="Pay Salary"
                    >
                        <Banknote size={15} aria-hidden="true" />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/employee/${s.id}`); }}
                        title="View Dashboard"
                        aria-label="View Dashboard"
                    >
                        <BarChart3 size={15} aria-hidden="true" />
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
                        aria-label="Edit Staff Member"
                    >
                        <Edit2 size={15} aria-hidden="true" />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); handleResetPassword(s.id); }}
                        title="Reset Password to Default"
                        aria-label="Reset Password to Default"
                    >
                        <Key size={15} aria-hidden="true" />
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); onOpenSettings(s); }}
                        title="Staff Settings"
                        aria-label="Staff Settings"
                    >
                        <Settings size={15} aria-hidden="true" />
                    </button>
                    <button
                        className="btn btn-ghost text-error"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                        title="Delete Staff Member"
                        aria-label="Delete Staff Member"
                    >
                        <Trash2 size={15} aria-hidden="true" />
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
                        aria-label={todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? "Mark Gone" : "Mark Attendance"}
                    >
                        {todayAttendance[s.id]?.in_time && !todayAttendance[s.id]?.out_time ? <LogOut size={15} aria-hidden="true" /> : <LogIn size={15} aria-hidden="true" />}
                    </button>
                    <button
                        className="btn btn-ghost"
                        style={{ padding: '6px', minWidth: 'auto', border: 'none' }}
                        onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/employee/${s.id}`); }}
                        title="View Dashboard"
                        aria-label="View Dashboard"
                    >
                        <BarChart3 size={15} aria-hidden="true" />
                    </button>
                </>
            )}
        </td>
    </tr>
));

const STAFF_ROLES = ['Front Office', 'Designer', 'Printer', 'Accountant', 'Other Staff'];

const StaffManagement = () => {
    usePageTitle('Staff Management');

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
    const [_error, setError] = useState('');
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

    async function fetchBranches() {
        try {
            const response = await api.get('/branches');
            setBranches(response.data);
        } catch {
            console.error('Failed to fetch branches');
        }
    }

    async function fetchStaff() {
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
        } catch {
            setError('Failed to fetch staff list');
        } finally {
            setLoading(false);
        }
    }

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
        } catch {
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
        } catch {
            setError('Failed to reset password');
        }
    };

    async function fetchTodayAttendance() {
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
    }

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
        <PageContainer>
            <div className="page-header">
                <div>
                    <h1 className="section-title">Staff Management</h1>
                    <p className="section-subtitle">Add and manage printing shop team members.</p>
                </div>
            </div>

            <div className="staff-toolbar">
                <div className="staff-search-wrap">
                    <Search className="staff-search-icon" size={16} aria-hidden="true" />
                    <label htmlFor="staff-search-input" className="sr-only">Search staff</label>
                    <input
                        id="staff-search-input"
                        type="text"
                        className="staff-search-input"
                        placeholder="Search staff by name or role\u2026"
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                </div>
                <label htmlFor="branch-filter-select" className="sr-only">Filter by branch</label>
                <select
                    id="branch-filter-select"
                    className="form-select branch-filter-select"
                    value={selectedBranchFilter}
                    onChange={e => setSelectedBranchFilter(e.target.value)}
                >
                    <option value="">All Branches</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {isAdmin && (
                    <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                        <Plus size={18} aria-hidden="true" />
                        <span>Add Staff</span>
                    </button>
                )}
            </div>

            <div className="table-scroll">
                <table className="table">
                    <thead>
                        <tr>
                            <th scope="col">Staff Details</th>
                            <th scope="col">Role</th>
                            <th scope="col">Branch</th>
                            <th scope="col">Mobile (User ID)</th>
                            <th scope="col">Joined</th>
                            <th scope="col">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && filteredStaff.length === 0 ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                                <Loader2 className="animate-spin" style={{ display: 'inline', marginRight: 8 }} aria-hidden="true" /> Loading staff...
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
                <div className="modal-backdrop" style={{ zIndex: 'var(--z-modal, 1000)' }}>
                    <style>{`
                        .staff-modal-container {
                            background: var(--surface);
                            border: 1px solid var(--border-subtle);
                            border-radius: 24px;
                            width: 100%;
                            max-width: 580px;
                            max-height: 90vh;
                            overflow: hidden;
                            display: flex;
                            flex-direction: column;
                            box-shadow: var(--shadow-lg);
                            animation: modal-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        @keyframes modal-enter {
                            from { opacity: 0; transform: scale(0.96) translateY(10px); }
                            to { opacity: 1; transform: scale(1) translateY(0); }
                        }
                        .staff-form-body {
                            padding: 32px;
                            overflow-y: auto;
                        }
                        .staff-form-wrapper {
                            display: flex;
                            flex-direction: column;
                            gap: 22px;
                        }
                        .staff-photo-section {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            gap: 16px;
                            padding: 20px;
                            background: var(--surface-2);
                            border: 2px dashed var(--border-subtle);
                            border-radius: 16px;
                            text-align: center;
                            position: relative;
                            transition: border-color 0.2s ease;
                        }
                        .staff-photo-section:hover {
                            border-color: var(--accent);
                        }
                        .staff-avatar-preview-container {
                            width: 100px;
                            height: 100px;
                            border-radius: 50%;
                            background: var(--surface);
                            border: 2px solid var(--border-subtle);
                            box-shadow: var(--shadow-sm);
                            display: grid;
                            place-items: center;
                            overflow: hidden;
                            position: relative;
                        }
                        .staff-avatar-preview {
                            width: 100%;
                            height: 100%;
                            object-fit: cover;
                        }
                        .staff-avatar-placeholder {
                            color: var(--text-muted, var(--muted));
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            gap: 6px;
                        }
                        .staff-photo-input-label {
                            display: inline-flex;
                            align-items: center;
                            gap: 8px;
                            padding: 8px 16px;
                            border-radius: 8px;
                            background: var(--surface);
                            border: 1px solid var(--border);
                            color: var(--text);
                            font-size: 13px;
                            font-weight: 600;
                            cursor: pointer;
                            box-shadow: var(--shadow-2xs);
                            transition: all 0.15s ease;
                        }
                        .staff-photo-input-label:hover {
                            background: var(--surface-2);
                            border-color: var(--text-muted);
                        }
                        .staff-field-group {
                            display: flex;
                            flex-direction: column;
                            gap: 6px;
                        }
                        .staff-label {
                            font-size: 11px;
                            font-weight: 700;
                            color: var(--text-muted, var(--muted));
                            text-transform: uppercase;
                            letter-spacing: 0.06em;
                            padding-left: 2px;
                        }
                        .staff-input-container {
                            position: relative;
                            display: flex;
                            align-items: center;
                            width: 100%;
                        }
                        .staff-input-decorator {
                            position: absolute;
                            left: 14px;
                            color: var(--text-muted, var(--muted));
                            pointer-events: none;
                            transition: color 0.15s ease;
                            display: flex;
                            align-items: center;
                            z-index: 1;
                        }
                        .staff-input {
                            width: 100%;
                            padding: 11px 14px 11px 40px;
                            border: 1.5px solid var(--border-subtle);
                            border-radius: 10px;
                            background: var(--surface);
                            color: var(--text);
                            font-size: 14px;
                            line-height: 1.4;
                            transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
                            outline: none;
                            font-family: inherit;
                        }
                        .staff-input:hover {
                            border-color: var(--text-muted, var(--muted));
                        }
                        .staff-input:focus {
                            border-color: var(--accent);
                            background: var(--surface);
                            box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
                        }
                        .staff-input-container:focus-within .staff-input-decorator {
                            color: var(--accent);
                        }
                        .staff-input-row {
                            display: flex;
                            gap: 12px;
                            width: 100%;
                        }
                        .staff-input-row select.input-field {
                            width: 120px;
                            flex-shrink: 0;
                        }
                        select.staff-input {
                            appearance: none;
                            -webkit-appearance: none;
                            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
                            background-repeat: no-repeat;
                            background-position: right 14px center;
                            background-size: 16px;
                            padding-right: 40px;
                            cursor: pointer;
                        }
                    `}</style>
                    <div className="staff-modal-container">
                        <div className="modal-header" style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add Staff Member</h2>
                            <button className="modal-close modal-close--static" onClick={() => setShowAddModal(false)} style={{ display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleAddStaff} className="staff-form-body">
                            <div className="staff-form-wrapper">
                                <div className="staff-photo-section">
                                    <div className="staff-avatar-preview-container">
                                        {newStaffPreview ? (
                                            <img src={newStaffPreview} className="staff-avatar-preview" alt="preview" />
                                        ) : (
                                            <div className="staff-avatar-placeholder">
                                                <User size={32} />
                                                <span style={{ fontSize: 11 }}>No photo</span>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="newStaffPhoto" className="staff-photo-input-label">
                                            <Camera size={14} />
                                            <span>Choose Photo</span>
                                        </label>
                                        <input 
                                            id="newStaffPhoto" 
                                            type="file" 
                                            name="newStaffPhoto" 
                                            accept="image/*" 
                                            onChange={e => openCropper(e.target.files?.[0], 'newStaff')} 
                                            style={{ display: 'none' }}
                                        />
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="newStaffName" className="staff-label">Full Name</label>
                                    <div className="staff-input-container">
                                        <div className="staff-input-decorator"><User size={15} /></div>
                                        <input 
                                            id="newStaffName" 
                                            type="text" 
                                            name="newStaffName" 
                                            className="staff-input" 
                                            placeholder="Full Name" 
                                            value={newStaff.name} 
                                            onChange={e => setNewStaff({...newStaff, name: e.target.value})} 
                                            required 
                                        />
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="newStaffMobile" className="staff-label">Mobile Number</label>
                                    <div className="staff-input-row">
                                        <CountryCodeSelect value={newStaff.countryCode} onChange={(val) => setNewStaff({...newStaff, countryCode: val})} />
                                        <div className="staff-input-container" style={{ flex: 1 }}>
                                            <div className="staff-input-decorator"><Phone size={15} /></div>
                                            <input 
                                                id="newStaffMobile" 
                                                type="tel" 
                                                name="newStaffMobile" 
                                                className="staff-input" 
                                                placeholder="10-digit mobile" 
                                                value={newStaff.mobile} 
                                                onChange={e => setNewStaff({...newStaff, mobile: filterMobile(e.target.value)})} 
                                                required 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="newStaffBranch" className="staff-label">Branch</label>
                                    <div className="staff-input-container">
                                        <div className="staff-input-decorator"><MapPin size={15} /></div>
                                        <BranchSelect 
                                            id="newStaffBranch" 
                                            name="newStaffBranch" 
                                            className="staff-input" 
                                            value={newStaff.branch_id} 
                                            onChange={e => setNewStaff({...newStaff, branch_id: e.target.value})} 
                                            required
                                        >
                                            <option value="">Select Branch</option>
                                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </BranchSelect>
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="newStaffRole" className="staff-label">Role</label>
                                    <div className="staff-input-container">
                                        <div className="staff-input-decorator"><Briefcase size={15} /></div>
                                        <select 
                                            id="newStaffRole" 
                                            name="newStaffRole" 
                                            className="staff-input" 
                                            value={newStaff.role} 
                                            onChange={e => setNewStaff({...newStaff, role: e.target.value})}
                                        >
                                            {STAFF_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <>
                                        <div className="staff-field-group">
                                            <label htmlFor="newStaffSalaryType" className="staff-label">Salary Type</label>
                                            <div className="staff-input-container">
                                                <div className="staff-input-decorator"><DollarSign size={15} /></div>
                                                <select 
                                                    id="newStaffSalaryType" 
                                                    name="newStaffSalaryType" 
                                                    className="staff-input" 
                                                    value={newStaff.salary_type} 
                                                    onChange={e => setNewStaff({...newStaff, salary_type: e.target.value})}
                                                >
                                                    <option value="Monthly">Monthly</option>
                                                    <option value="Daily">Daily</option>
                                                </select>
                                            </div>
                                        </div>

                                        {newStaff.salary_type === 'Monthly' ? (
                                            <div className="staff-field-group">
                                                <label htmlFor="newStaffSalary" className="staff-label">Base Salary (₹)</label>
                                                <div className="staff-input-container">
                                                    <div className="staff-input-decorator"><DollarSign size={15} /></div>
                                                    <input 
                                                        id="newStaffSalary" 
                                                        type="number" 
                                                        name="newStaffSalary" 
                                                        className="staff-input" 
                                                        placeholder="0" 
                                                        min="0" 
                                                        value={newStaff.base_salary} 
                                                        onChange={e => setNewStaff({...newStaff, base_salary: e.target.value})} 
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="staff-field-group">
                                                <label htmlFor="newStaffDailyRate" className="staff-label">Daily Rate (₹)</label>
                                                <div className="staff-input-container">
                                                    <div className="staff-input-decorator"><DollarSign size={15} /></div>
                                                    <input 
                                                        id="newStaffDailyRate" 
                                                        type="number" 
                                                        name="newStaffDailyRate" 
                                                        className="staff-input" 
                                                        placeholder="0" 
                                                        min="0" 
                                                        value={newStaff.daily_rate} 
                                                        onChange={e => setNewStaff({...newStaff, daily_rate: e.target.value})} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 16 }}>
                                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-ghost" style={{ flex: 1, height: 44, borderRadius: 10 }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : 'Create Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditModal && selectedStaff && (
                <div className="modal-backdrop" style={{ zIndex: 'var(--z-modal, 1000)' }}>
                    <div className="staff-modal-container">
                        <div className="modal-header" style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Edit Staff Member</h2>
                            <button className="modal-close modal-close--static" onClick={() => setShowEditModal(false)} style={{ display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpdateStaff} className="staff-form-body">
                            <div className="staff-form-wrapper">
                                <div className="staff-photo-section">
                                    <div className="staff-avatar-preview-container">
                                        {editStaffPreview ? (
                                            <img src={editStaffPreview} className="staff-avatar-preview" alt="Preview" />
                                        ) : (
                                            <div className="staff-avatar-placeholder">
                                                <User size={32} />
                                                <span style={{ fontSize: 11 }}>No photo</span>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <label htmlFor="editStaffPhoto" className="staff-photo-input-label">
                                            <Camera size={14} />
                                            <span>Change Photo</span>
                                        </label>
                                        <input 
                                            id="editStaffPhoto" 
                                            type="file" 
                                            name="editStaffPhoto" 
                                            accept="image/*" 
                                            onChange={e => openCropper(e.target.files?.[0], 'editStaff')} 
                                            style={{ display: 'none' }}
                                        />
                                        {(editStaffImage || selectedStaff?.image_url) && (
                                            <button 
                                                type="button" 
                                                className="btn btn-ghost text-error" 
                                                style={{ padding: '4px 12px', fontSize: 12, height: 32, borderRadius: 8 }} 
                                                onClick={handleRemoveStaffImage}
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="editStaffName" className="staff-label">Full Name</label>
                                    <div className="staff-input-container">
                                        <div className="staff-input-decorator"><User size={15} /></div>
                                        <input 
                                            id="editStaffName" 
                                            type="text" 
                                            name="editStaffName" 
                                            className="staff-input" 
                                            value={selectedStaff.name} 
                                            onChange={e => setSelectedStaff({...selectedStaff, name: e.target.value})} 
                                            required 
                                        />
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="editStaffMobile" className="staff-label">Mobile Number</label>
                                    <div className="staff-input-row">
                                        <CountryCodeSelect value={selectedStaff?.countryCode || '+91'} onChange={(val) => setSelectedStaff({...selectedStaff, countryCode: val})} />
                                        <div className="staff-input-container" style={{ flex: 1 }}>
                                            <div className="staff-input-decorator"><Phone size={15} /></div>
                                            <input 
                                                id="editStaffMobile" 
                                                type="tel" 
                                                name="editStaffMobile" 
                                                className="staff-input" 
                                                value={selectedStaff.user_id} 
                                                onChange={e => setSelectedStaff({...selectedStaff, user_id: filterMobile(e.target.value)})} 
                                                required 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="editStaffBranch" className="staff-label">Branch</label>
                                    <div className="staff-input-container">
                                        <div className="staff-input-decorator"><MapPin size={15} /></div>
                                        <BranchSelect 
                                            id="editStaffBranch" 
                                            name="editStaffBranch" 
                                            className="staff-input" 
                                            value={selectedStaff.branch_id || ''} 
                                            onChange={e => setSelectedStaff({...selectedStaff, branch_id: e.target.value})}
                                        >
                                            <option value="">Select Branch</option>
                                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </BranchSelect>
                                    </div>
                                </div>

                                <div className="staff-field-group">
                                    <label htmlFor="editStaffRole" className="staff-label">Role</label>
                                    <div className="staff-input-container">
                                        <div className="staff-input-decorator"><Briefcase size={15} /></div>
                                        <select 
                                            id="editStaffRole" 
                                            name="editStaffRole" 
                                            className="staff-input" 
                                            value={selectedStaff.role} 
                                            onChange={e => setSelectedStaff({...selectedStaff, role: e.target.value})}
                                        >
                                            {STAFF_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <>
                                        <div className="staff-field-group">
                                            <label htmlFor="editStaffSalaryType" className="staff-label">Salary Type</label>
                                            <div className="staff-input-container">
                                                <div className="staff-input-decorator"><DollarSign size={15} /></div>
                                                <select 
                                                    id="editStaffSalaryType" 
                                                    name="editStaffSalaryType" 
                                                    className="staff-input" 
                                                    value={selectedStaff.salary_type || 'Monthly'} 
                                                    onChange={e => setSelectedStaff({...selectedStaff, salary_type: e.target.value})}
                                                >
                                                    <option value="Monthly">Monthly</option>
                                                    <option value="Daily">Daily</option>
                                                </select>
                                            </div>
                                        </div>

                                        {(selectedStaff.salary_type || 'Monthly') === 'Monthly' ? (
                                            <div className="staff-field-group">
                                                <label htmlFor="editStaffSalary" className="staff-label">Base Salary (₹)</label>
                                                <div className="staff-input-container">
                                                    <div className="staff-input-decorator"><DollarSign size={15} /></div>
                                                    <input 
                                                        id="editStaffSalary" 
                                                        type="number" 
                                                        name="editStaffSalary" 
                                                        className="staff-input" 
                                                        min="0" 
                                                        value={selectedStaff.base_salary || ''} 
                                                        onChange={e => setSelectedStaff({...selectedStaff, base_salary: e.target.value})} 
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="staff-field-group">
                                                <label htmlFor="editStaffDailyRate" className="staff-label">Daily Rate (₹)</label>
                                                <div className="staff-input-container">
                                                    <div className="staff-input-decorator"><DollarSign size={15} /></div>
                                                    <input 
                                                        id="editStaffDailyRate" 
                                                        type="number" 
                                                        name="editStaffDailyRate" 
                                                        className="staff-input" 
                                                        min="0" 
                                                        value={selectedStaff.daily_rate || ''} 
                                                        onChange={e => setSelectedStaff({...selectedStaff, daily_rate: e.target.value})} 
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 16 }}>
                                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-ghost" style={{ flex: 1, height: 44, borderRadius: 10 }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : 'Update Details'}
                                </button>
                            </div>
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
        </PageContainer>
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
        } catch {
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
        } catch {
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
                <div className="modal-header">
                    <h2 className="modal-title">Settings: {staff.name}</h2>
                    <button className="modal-close modal-close--static" onClick={onClose}><X size={22} /></button>
                </div>
                <p className="section-subtitle" style={{ margin: '0 24px 16px' }}>Configure permissions and preferences for this staff member.</p>

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

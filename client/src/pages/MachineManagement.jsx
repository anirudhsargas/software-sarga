import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, Edit2, Trash2, Power, PowerOff, Loader2, Building2, Settings,
    Users, UserPlus, X, Eye, Hash, Gauge, IndianRupee, ClipboardList,
    Calendar, TrendingUp, Package, ChevronLeft, RefreshCw, Printer, AlertTriangle, CheckCircle, XCircle,
    BookOpen
} from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { serverToday } from '../services/serverTime';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';

const MachineManagement = () => {
    const { confirm } = useConfirm();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

    const [machines, setMachines] = useState([]);
    const [branches, setBranches] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingMachine, setEditingMachine] = useState(null);
    const [selectedMachine, setSelectedMachine] = useState(null);
    const [machineDetails, setMachineDetails] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailTab, setDetailTab] = useState('work');
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignMachineId, setAssignMachineId] = useState(null);
    const [selectedStaffIds, setSelectedStaffIds] = useState([]);
    const [showWorkModal, setShowWorkModal] = useState(false);
    const [workSaving, setWorkSaving] = useState(false);
    const [formData, setFormData] = useState({
        machine_name: '', machine_type: 'Offset', counter_type: 'Manual',
        branch_id: '', location: '', is_active: true
    });
    const [workForm, setWorkForm] = useState({
        customer_name: '', work_details: '', copies: '', payment_type: 'Cash',
        cash_amount: '', upi_amount: '', credit_amount: '', total_amount: '', remarks: ''
    });
    const [readingForm, setReadingForm] = useState({ opening_count: '', closing_count: '', notes: '' });
    const [readingSaving, setReadingSaving] = useState(false);
    const [countRequests, setCountRequests] = useState([]);
    const [countRequestWorking, setCountRequestWorking] = useState(false);

    // Book assignments (Offset / Laser / Other)
    const [bookAssignments, setBookAssignments] = useState({ Offset: [], Laser: [], Other: [] });
    const [showBookAssignModal, setShowBookAssignModal] = useState(false);
    const [bookAssignType, setBookAssignType] = useState(null);   // 'Offset' | 'Laser' | 'Other'
    const [bookAssignBranchId, setBookAssignBranchId] = useState('');
    const [bookAssignStaffIds, setBookAssignStaffIds] = useState([]);
    const [savingBookAssign, setSavingBookAssign] = useState(false);

    const machineTypes = ['Offset', 'Digital', 'Binding', 'Lamination', 'Cutting', 'Other'];
    const BOOK_TYPES = [
        { key: 'Offset', color: '#2563eb', label: 'Offset' },
        { key: 'Laser',  color: '#7c3aed', label: 'Laser'  },
        { key: 'Other',  color: '#059669', label: 'Other'  },
    ];

    // ─── Data Fetch ──────────────────────────────────────────────
    useEffect(() => {
        fetchMachines();
        if (isAdmin) {
            fetchBranches();
            fetchStaff();
            fetchBookAssignments();
        }
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data);
        } catch (e) { console.error('Error fetching branches:', e); }
    };

    const fetchStaff = async () => {
        try {
            const res = await api.get('/staff');
            setStaffList(Array.isArray(res.data) ? res.data : res.data.data || []);
        } catch (e) { console.error('Error fetching staff:', e); }
    };

    const fetchMachines = async () => {
        try {
            setLoading(true);
            const res = await api.get('/machines');
            setMachines(res.data);
        } catch (e) { console.error('Error fetching machines:', e); }
        finally { setLoading(false); }
    };

    const fetchBookAssignments = async () => {
        try {
            const res = await api.get('/machines/book-assignments');
            setBookAssignments(res.data || { Offset: [], Laser: [], Other: [] });
        } catch (e) { console.error('Error fetching book assignments:', e); }
    };

    const openBookAssignModal = (bookType) => {
        const defaultBranch = branches.length > 0 ? String(branches[0].id) : '';
        const bid = defaultBranch;
        setBookAssignType(bookType);
        setBookAssignBranchId(bid);
        const current = (bookAssignments[bookType] || [])
            .filter(s => String(s.branch_id) === String(bid))
            .map(s => s.staff_id);
        setBookAssignStaffIds(current);
        setShowBookAssignModal(true);
    };

    const handleModalBranchChange = (branchId) => {
        setBookAssignBranchId(branchId);
        const current = (bookAssignments[bookAssignType] || [])
            .filter(s => String(s.branch_id) === String(branchId))
            .map(s => s.staff_id);
        setBookAssignStaffIds(current);
    };

    const handleSaveBookAssignment = async () => {
        if (!bookAssignBranchId) { toast.error('Select a branch first'); return; }
        setSavingBookAssign(true);
        try {
            await api.post('/machines/book-assignments', {
                book_type: bookAssignType,
                staff_ids: bookAssignStaffIds,
                branch_id: bookAssignBranchId
            });
            setShowBookAssignModal(false);
            fetchBookAssignments();
            toast.success(`${bookAssignType} staff assigned`);
        } catch (e) { toast.error(e.response?.data?.error || 'Failed to save'); }
        finally { setSavingBookAssign(false); }
    };

    const toggleBookStaff = (staffId) => {
        setBookAssignStaffIds(prev =>
            prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
        );
    };

    const fetchMachineDetails = useCallback(async (id) => {
        try {
            setDetailLoading(true);
            const res = await api.get(`/machines/${id}`);
            setMachineDetails(res.data);
            setCountRequests(res.data.pending_count_requests || []);
            // Pre-fill reading form with today's reading
            if (res.data.today_reading) {
                setReadingForm({
                    opening_count: res.data.today_reading.opening_count?.toString() || '',
                    closing_count: res.data.today_reading.closing_count?.toString() || '',
                    notes: res.data.today_reading.notes || ''
                });
            } else {
                // Auto-carry forward: pre-fill opening count from yesterday's closing count
                const expected = res.data.expected_opening_count;
                setReadingForm({
                    opening_count: expected != null ? expected.toString() : '',
                    closing_count: '',
                    notes: ''
                });
            }
        } catch (e) {
            console.error('Error fetching machine details:', e);
            toast.error(e.response?.data?.error || 'Failed to load machine details');
        } finally { setDetailLoading(false); }
    }, []);

    // ─── Handlers ────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingMachine) {
                await api.put(`/machines/${editingMachine.id}`, formData);
            } else {
                await api.post('/machines', formData);
            }
            setShowModal(false);
            resetForm();
            fetchMachines();
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to save machine');
        }
    };

    const handleEdit = (machine, e) => {
        if (e) e.stopPropagation();
        setEditingMachine(machine);
        setFormData({
            machine_name: machine.machine_name, machine_type: machine.machine_type,
            counter_type: machine.counter_type, branch_id: machine.branch_id,
            location: machine.location || '', is_active: machine.is_active === 1
        });
        setShowModal(true);
    };

    const handleToggleActive = async (machine, e) => {
        if (e) e.stopPropagation();
        const newState = machine.is_active === 1 ? 'Inactive' : 'Active';

        const isConfirmed = await confirm({
            title: `Set ${newState}`,
            message: `Are you sure you want to set ${machine.machine_name} to ${newState}?`,
            confirmText: 'Yes',
            type: 'primary'
        });
        if (!isConfirmed) return;

        try {
            await api.put(`/machines/${machine.id}`, { is_active: machine.is_active === 1 ? 0 : 1 });
            fetchMachines();
        } catch (e) { toast.error(e.response?.data?.error || 'Failed to update machine'); }
    };

    const handleDelete = async (machine, e) => {
        if (e) e.stopPropagation();

        const isConfirmed = await confirm({
            title: 'Delete Machine',
            message: `Are you sure you want to delete ${machine.machine_name}?`,
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.delete(`/machines/${machine.id}`);
            fetchMachines();
        } catch (e) { toast.error(e.response?.data?.error || 'Failed to delete machine'); }
    };

    const resetForm = () => {
        setFormData({ machine_name: '', machine_type: 'Offset', counter_type: 'Manual', branch_id: '', location: '', is_active: true });
        setEditingMachine(null);
    };

    const handleCardDoubleClick = (machine) => {
        setSelectedMachine(machine);
        setDetailTab('work');
        fetchMachineDetails(machine.id);
    };

    // ─── Staff Assignment ────────────────────────────────────────
    const openAssignModal = (machine, e) => {
        if (e) e.stopPropagation();
        setAssignMachineId(machine.id);
        setSelectedStaffIds(machine.assigned_staff_ids || []);
        setShowAssignModal(true);
    };

    const handleAssignStaff = async () => {
        try {
            await api.post(`/machines/${assignMachineId}/assign-staff`, { staff_ids: selectedStaffIds });
            setShowAssignModal(false);
            fetchMachines();
            if (selectedMachine?.id === assignMachineId) fetchMachineDetails(assignMachineId);
        } catch (e) { toast.error(e.response?.data?.error || 'Failed to assign staff'); }
    };

    const toggleStaff = (staffId) => {
        setSelectedStaffIds(prev =>
            prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
        );
    };

    // ─── Reading ─────────────────────────────────────────────────
    const handleSaveReading = async () => {
        if (!selectedMachine) return;
        setReadingSaving(true);
        try {
            const today = serverToday ? serverToday() : new Date().toISOString().split('T')[0];
            const res = await api.post(`/machines/${selectedMachine.id}/readings`, {
                reading_date: today,
                opening_count: readingForm.opening_count ? parseInt(readingForm.opening_count) : 0,
                closing_count: readingForm.closing_count ? parseInt(readingForm.closing_count) : null,
                notes: readingForm.notes || null
            });
            if (res.data.count_request_created) {
                toast('Count mismatch flagged — sent to admin for review', { icon: '⚠️', duration: 4000 });
            } else {
                toast.success('Counter reading saved');
            }
            fetchMachineDetails(selectedMachine.id);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to save reading');
        } finally { setReadingSaving(false); }
    };

    // ─── Count Request Review (Admin) ──────────────────────────
    const handleCountRequestReview = async (reqId, status, adminNote) => {
        setCountRequestWorking(true);
        try {
            await api.put(`/machines/count-requests/${reqId}`, { status, admin_note: adminNote || null });
            toast.success(`Count request ${status.toLowerCase()}`);
            fetchMachineDetails(selectedMachine.id);
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to review request');
        } finally { setCountRequestWorking(false); }
    };

    // ─── Work Entry ──────────────────────────────────────────────
    const handleAddWork = async (e) => {
        e.preventDefault();
        if (!selectedMachine) return;
        setWorkSaving(true);
        try {
            const today = serverToday ? serverToday() : new Date().toISOString().split('T')[0];
            await api.post(`/machines/${selectedMachine.id}/work`, {
                ...workForm,
                copies: parseInt(workForm.copies) || 0,
                cash_amount: parseFloat(workForm.cash_amount) || 0,
                upi_amount: parseFloat(workForm.upi_amount) || 0,
                credit_amount: parseFloat(workForm.credit_amount) || 0,
                total_amount: parseFloat(workForm.total_amount) || 0,
                work_date: today
            });
            setShowWorkModal(false);
            setWorkForm({ customer_name: '', work_details: '', copies: '', payment_type: 'Cash', cash_amount: '', upi_amount: '', credit_amount: '', total_amount: '', remarks: '' });
            fetchMachineDetails(selectedMachine.id);
        } catch (e) { toast.error(e.response?.data?.error || 'Failed to add work'); }
        finally { setWorkSaving(false); }
    };

    const handleDeleteWork = async (entryId) => {
        const isConfirmed = await confirm({
            title: 'Delete Work Entry',
            message: 'Are you sure you want to delete this work entry?',
            confirmText: 'Delete',
            type: 'danger'
        });
        if (!isConfirmed) return;

        try {
            await api.delete(`/machines/${selectedMachine.id}/work/${entryId}`);
            fetchMachineDetails(selectedMachine.id);
        } catch (e) { toast.error(e.response?.data?.error || 'Failed to delete'); }
    };

    // ─── Helpers ─────────────────────────────────────────────────
    const getTypeColor = (type) => {
        const colors = {
            'Offset': 'badge--type-offset', 'Digital': 'badge--type-retail',
            'Binding': 'badge--type-association', 'Lamination': 'badge--success',
            'Cutting': 'badge--warning', 'Other': 'badge--type-walk-in'
        };
        return colors[type] || 'badge--type-walk-in';
    };

    const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 });
    const fmtCur = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

    // ─── Detail View ─────────────────────────────────────────────
    if (selectedMachine) {
        return (
            <div className="stack-lg">
                {/* Header */}
                <div className="page-header">
                    <div className="row items-center gap-md">
                        <button className="btn btn-ghost" onClick={() => { setSelectedMachine(null); setMachineDetails(null); }}>
                            <ChevronLeft size={20} />
                        </button>
                        <div>
                            <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Settings size={22} />
                                {selectedMachine.machine_name}
                            </h1>
                            <p className="section-subtitle">
                                <span className={`badge ${getTypeColor(selectedMachine.machine_type)}`}>{selectedMachine.machine_type}</span>
                                {' '}{selectedMachine.branch_name} &middot; {selectedMachine.location || 'No location set'}
                            </p>
                        </div>
                    </div>
                    <div className="row gap-sm">
                        <button className="btn btn-primary" onClick={() => setShowWorkModal(true)}>
                            <Plus size={18} /> Add Work
                        </button>
                    </div>
                </div>

                {detailLoading ? (
                    <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
                        <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto' }} />
                    </div>
                ) : machineDetails ? (
                    <>
                        {/* Stats Cards */}
                        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
                                <div className="text-sm muted" style={{ marginBottom: 4 }}>Today Opening</div>
                                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {machineDetails.today_reading ? fmt(machineDetails.today_reading.opening_count) : '—'}
                                </div>
                            </div>
                            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
                                <div className="text-sm muted" style={{ marginBottom: 4 }}>Today Closing</div>
                                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {machineDetails.today_reading?.closing_count != null ? fmt(machineDetails.today_reading.closing_count) : '—'}
                                </div>
                            </div>
                            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
                                <div className="text-sm muted" style={{ marginBottom: 4 }}>Today Copies</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
                                    {machineDetails.today_reading?.total_copies ? fmt(machineDetails.today_reading.total_copies) : '—'}
                                </div>
                            </div>
                            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
                                <div className="text-sm muted" style={{ marginBottom: 4 }}>Month Revenue</div>
                                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-success)', fontFamily: 'var(--font-mono, monospace)' }}>
                                    {fmtCur(machineDetails.monthly_stats?.total_revenue)}
                                </div>
                            </div>
                            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
                                <div className="text-sm muted" style={{ marginBottom: 4 }}>Month Jobs</div>
                                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {fmt(machineDetails.monthly_stats?.total_jobs)}
                                </div>
                            </div>
                            <div className="panel" style={{ padding: 16, textAlign: 'center' }}>
                                <div className="text-sm muted" style={{ marginBottom: 4 }}>Assigned Staff</div>
                                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                                    {machineDetails.assigned_staff?.length || 0}
                                </div>
                            </div>
                        </div>

                        {/* Opening/Closing Count Entry */}
                        <div className="panel" style={{ padding: 16 }}>
                            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
                                <Gauge size={16} style={{ verticalAlign: -3, marginRight: 6 }} />
                                Today's Counter ({serverToday ? serverToday() : new Date().toISOString().split('T')[0]})
                            </h3>
                            <div className="row gap-md items-end" style={{ flexWrap: 'wrap' }}>
                                <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                                    <label className="form-label text-sm">Opening Count</label>
                                    <input type="number" className="input-field"
                                        value={readingForm.opening_count}
                                        onChange={e => setReadingForm({ ...readingForm, opening_count: e.target.value })}
                                        disabled={machineDetails.today_reading && !isAdmin}
                                        placeholder="0"
                                    />
                                    {/* Show expected count hint */}
                                    {machineDetails.expected_opening_count != null && (
                                        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--clr-muted, #888)' }}>
                                            Last count: <strong>{machineDetails.expected_opening_count.toLocaleString('en-IN')}</strong>
                                        </div>
                                    )}
                                    {/* Warn if staff has changed from expected */}
                                    {!isAdmin && !machineDetails.today_reading &&
                                        machineDetails.expected_opening_count != null &&
                                        readingForm.opening_count !== '' &&
                                        parseInt(readingForm.opening_count) !== machineDetails.expected_opening_count && (
                                        <div style={{ fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--clr-warning, #d97706)' }}>
                                            <AlertTriangle size={12} />
                                            Differs from last count — will be sent to admin for review
                                        </div>
                                    )}
                                </div>
                                <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                                    <label className="form-label text-sm">Closing Count</label>
                                    <input type="number" className="input-field"
                                        value={readingForm.closing_count}
                                        onChange={e => setReadingForm({ ...readingForm, closing_count: e.target.value })}
                                        placeholder="—"
                                    />
                                    {/* Show calculated copies */}
                                    {readingForm.closing_count !== '' && readingForm.opening_count !== '' &&
                                        parseInt(readingForm.closing_count) > parseInt(readingForm.opening_count) && (
                                        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--clr-primary)' }}>
                                            Copies today: <strong>{(parseInt(readingForm.closing_count) - parseInt(readingForm.opening_count)).toLocaleString('en-IN')}</strong>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group" style={{ flex: 2, minWidth: 200, margin: 0 }}>
                                    <label className="form-label text-sm">Notes</label>
                                    <input type="text" className="input-field"
                                        value={readingForm.notes}
                                        onChange={e => setReadingForm({ ...readingForm, notes: e.target.value })}
                                        placeholder="Optional notes..."
                                    />
                                </div>
                                <button className="btn btn-primary" onClick={handleSaveReading} disabled={readingSaving}
                                    style={{ minWidth: 100 }}>
                                    {readingSaving ? <Loader2 className="animate-spin" size={16} /> : 'Save'}
                                </button>
                            </div>
                            {machineDetails.today_reading && !isAdmin && (
                                <p className="text-sm muted" style={{ marginTop: 8 }}>
                                    Opening count is locked. Contact Admin for changes.
                                </p>
                            )}
                        </div>

                        {/* Tab Navigation */}
                        <div className="row gap-sm" style={{ borderBottom: '2px solid var(--clr-border)', paddingBottom: 0 }}>
                            {[
                                { key: 'work', label: "Today's Work", icon: ClipboardList },
                                { key: 'production', label: 'Production Summary', icon: TrendingUp },
                                { key: 'jobs', label: 'Job Queue', icon: Package },
                                { key: 'staff', label: 'Assigned Staff', icon: Users },
                                { key: 'readings', label: 'Reading History', icon: Hash }
                            ].map(tab => (
                                <button key={tab.key}
                                    className={`btn ${detailTab === tab.key ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setDetailTab(tab.key)}
                                    style={{ borderRadius: '8px 8px 0 0', fontSize: 13 }}>
                                    <tab.icon size={15} /> {tab.label}
                                </button>
                            ))}
                            {/* Count Requests tab — admin only */}
                            {isAdmin && (
                                <button
                                    className={`btn ${detailTab === 'requests' ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setDetailTab('requests')}
                                    style={{ borderRadius: '8px 8px 0 0', fontSize: 13, position: 'relative' }}>
                                    <AlertTriangle size={15} /> Count Requests
                                    {countRequests.length > 0 && (
                                        <span style={{
                                            position: 'absolute', top: 4, right: 4,
                                            background: 'var(--clr-danger, #ef4444)', color: '#fff',
                                            borderRadius: '50%', width: 16, height: 16,
                                            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, lineHeight: 1
                                        }}>{countRequests.length}</span>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Tab Content */}
                        {detailTab === 'work' && (
                            <div className="panel panel--tight">
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Customer</th>
                                                <th>Work Details</th>
                                                <th>Copies</th>
                                                <th>Payment</th>
                                                <th>Amount</th>
                                                <th>Remarks</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.today_work || machineDetails.today_work.length === 0) ? (
                                                <tr><td colSpan="7" className="text-center muted table-empty">No work entries today</td></tr>
                                            ) : machineDetails.today_work.map(w => (
                                                <tr key={w.id}>
                                                    <td className="font-medium">{w.customer_name}</td>
                                                    <td className="text-sm">{w.work_details}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(w.copies)}</td>
                                                    <td><span className="badge badge--type-walk-in">{w.payment_type}</span></td>
                                                    <td className="font-medium" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmtCur(w.total_amount)}</td>
                                                    <td className="text-sm muted">{w.remarks || '-'}</td>
                                                    <td>
                                                        <button className="btn btn-ghost btn-danger" style={{ padding: 6 }}
                                                            onClick={() => handleDeleteWork(w.id)}><Trash2 size={15} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {machineDetails.today_work && machineDetails.today_work.length > 0 && (
                                    <div className="row" style={{ padding: '12px 16px', justifyContent: 'flex-end', gap: 20, borderTop: '1px solid var(--clr-border)' }}>
                                        <span className="text-sm muted">Total: <strong>{machineDetails.today_work.length}</strong> entries</span>
                                        <span className="text-sm font-medium" style={{ color: 'var(--clr-success)' }}>
                                            Total: {fmtCur(machineDetails.today_work.reduce((s, w) => s + parseFloat(w.total_amount || 0), 0))}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {detailTab === 'production' && (
                            <div className="panel panel--tight">
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--clr-border)' }}>
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Last 7 Days Production</h3>
                                </div>
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Opening</th>
                                                <th>Closing</th>
                                                <th>Total Copies</th>
                                                <th>Revenue</th>
                                                <th>Work Entries</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.production_summary || machineDetails.production_summary.length === 0) ? (
                                                <tr><td colSpan="6" className="text-center muted table-empty">No production data</td></tr>
                                            ) : machineDetails.production_summary.map(p => (
                                                <tr key={p.reading_date}>
                                                    <td className="font-medium">{new Date(p.reading_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(p.opening_count)}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{p.closing_count != null ? fmt(p.closing_count) : '—'}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--clr-primary)' }}>{fmt(p.total_copies)}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmtCur(p.day_revenue)}</td>
                                                    <td>{p.work_entries_count || 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Monthly Summary */}
                                {machineDetails.monthly_stats && (
                                    <div style={{ padding: 16, borderTop: '1px solid var(--clr-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                                        <div><span className="text-sm muted">Month Revenue</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_revenue)}</strong></div>
                                        <div><span className="text-sm muted">Cash</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_cash)}</strong></div>
                                        <div><span className="text-sm muted">UPI</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_upi)}</strong></div>
                                        <div><span className="text-sm muted">Credit</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_credit)}</strong></div>
                                        <div><span className="text-sm muted">Total Copies</span><br /><strong>{fmt(machineDetails.monthly_stats.total_copies)}</strong></div>
                                        <div><span className="text-sm muted">Total Jobs</span><br /><strong>{fmt(machineDetails.monthly_stats.total_jobs)}</strong></div>
                                    </div>
                                )}
                            </div>
                        )}

                        {detailTab === 'jobs' && (
                            <div className="panel panel--tight">
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--clr-border)' }}>
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Pending Jobs (assigned staff)</h3>
                                </div>
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Job #</th>
                                                <th>Customer</th>
                                                <th>Job Name</th>
                                                <th>Qty</th>
                                                <th>Amount</th>
                                                <th>Status</th>
                                                <th>Due Date</th>
                                                <th>Assigned To</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.job_queue || machineDetails.job_queue.length === 0) ? (
                                                <tr><td colSpan="8" className="text-center muted table-empty">No pending jobs</td></tr>
                                            ) : machineDetails.job_queue.map(j => (
                                                <tr key={j.id}>
                                                    <td className="font-medium">{j.job_number || '-'}</td>
                                                    <td>{j.customer_name || '-'}</td>
                                                    <td>{j.job_name}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{j.quantity}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmtCur(j.total_amount)}</td>
                                                    <td>
                                                        <span className={`badge ${j.status === 'Pending' ? 'badge--warning' : 'badge--type-retail'}`}>
                                                            {j.status}
                                                        </span>
                                                    </td>
                                                    <td className="text-sm">{j.delivery_date ? new Date(j.delivery_date).toLocaleDateString('en-IN') : '-'}</td>
                                                    <td className="text-sm">{j.assigned_to}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {detailTab === 'staff' && (
                            <div className="panel" style={{ padding: 16 }}>
                                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Assigned Staff</h3>
                                    {isAdmin && (
                                        <button className="btn btn-ghost btn-primary" style={{ fontSize: 13 }}
                                            onClick={() => openAssignModal(selectedMachine)}>
                                            <UserPlus size={15} /> Manage
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                                    {(!machineDetails.assigned_staff || machineDetails.assigned_staff.length === 0) ? (
                                        <p className="text-sm muted">No staff assigned yet</p>
                                    ) : machineDetails.assigned_staff.map(s => (
                                        <div key={s.id} className="panel" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'var(--clr-primary-light, #eef2ff)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 600, fontSize: 14, color: 'var(--clr-primary)',
                                                flexShrink: 0
                                            }}>
                                                {s.name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div className="font-medium text-sm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                                                <div className="text-xs muted">{s.role}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {detailTab === 'readings' && (
                            <div className="panel panel--tight">
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Opening</th>
                                                <th>Closing</th>
                                                <th>Total Copies</th>
                                                <th>Notes</th>
                                                <th>Entered By</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.readings || machineDetails.readings.length === 0) ? (
                                                <tr><td colSpan="6" className="text-center muted table-empty">No readings yet</td></tr>
                                            ) : machineDetails.readings.map(r => (
                                                <tr key={r.id}>
                                                    <td className="font-medium">{new Date(r.reading_date).toLocaleDateString('en-IN')}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{fmt(r.opening_count)}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>{r.closing_count != null ? fmt(r.closing_count) : '—'}</td>
                                                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>{fmt(r.total_copies)}</td>
                                                    <td className="text-sm muted">{r.notes || '-'}</td>
                                                    <td className="text-sm">{r.created_by_name || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Count Requests Tab (Admin only) */}
                        {detailTab === 'requests' && isAdmin && (
                            <div className="panel panel--tight">
                                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--clr-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <AlertTriangle size={16} style={{ color: 'var(--clr-warning, #d97706)' }} />
                                        Pending Count Mismatch Requests
                                    </h3>
                                    <span className="text-sm muted">Staff-entered counts that differ from the previous day's closing count</span>
                                </div>
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Expected (Last Close)</th>
                                                <th>Entered by Staff</th>
                                                <th>Difference</th>
                                                <th>Submitted By</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {countRequests.length === 0 ? (
                                                <tr><td colSpan="6" className="text-center muted table-empty">No pending count requests</td></tr>
                                            ) : countRequests.map(req => {
                                                const diff = req.entered_count - (req.expected_count || 0);
                                                return (
                                                    <tr key={req.id}>
                                                        <td className="font-medium">{new Date(req.reading_date).toLocaleDateString('en-IN')}</td>
                                                        <td style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                                                            {req.expected_count != null ? req.expected_count.toLocaleString('en-IN') : '—'}
                                                        </td>
                                                        <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                                                            {req.entered_count.toLocaleString('en-IN')}
                                                        </td>
                                                        <td style={{ fontFamily: 'var(--font-mono, monospace)', color: diff > 0 ? 'var(--clr-success)' : diff < 0 ? 'var(--clr-danger, #ef4444)' : undefined, fontWeight: 600 }}>
                                                            {diff > 0 ? '+' : ''}{diff.toLocaleString('en-IN')}
                                                        </td>
                                                        <td className="text-sm">{req.submitted_by_name || '—'}</td>
                                                        <td>
                                                            <div className="row gap-sm">
                                                                <button
                                                                    className="btn btn-sm"
                                                                    style={{ background: 'var(--clr-success)', color: '#fff', padding: '4px 10px', fontSize: 12 }}
                                                                    disabled={countRequestWorking}
                                                                    onClick={() => handleCountRequestReview(req.id, 'Approved', null)}>
                                                                    <CheckCircle size={13} /> Approve
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-danger"
                                                                    style={{ padding: '4px 10px', fontSize: 12 }}
                                                                    disabled={countRequestWorking}
                                                                    onClick={() => handleCountRequestReview(req.id, 'Rejected', null)}>
                                                                    <XCircle size={13} /> Reject
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {countRequests.length > 0 && (
                                    <div className="text-sm muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--clr-border)' }}>
                                        <strong>Approve</strong> = accept the staff's entered count &nbsp;|&nbsp;
                                        <strong>Reject</strong> = revert to the expected count (last day's closing)
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : null}

                {/* Work Entry Modal */}
                {showWorkModal && (
                    <div className="modal-overlay" onClick={() => setShowWorkModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                            <div className="modal-header">
                                <h2>Add Work Entry</h2>
                                <button className="btn btn-ghost" onClick={() => setShowWorkModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleAddWork}>
                                <div className="modal-body stack-md">
                                    <div className="form-group">
                                        <label className="form-label">Customer Name *</label>
                                        <input type="text" className="input-field" required
                                            value={workForm.customer_name}
                                            onChange={e => setWorkForm({ ...workForm, customer_name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Work Details *</label>
                                        <input type="text" className="input-field" required
                                            value={workForm.work_details}
                                            onChange={e => setWorkForm({ ...workForm, work_details: e.target.value })}
                                            placeholder="e.g., A4 Print 2-side" />
                                    </div>
                                    <div className="row gap-md">
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">Copies *</label>
                                            <input type="number" className="input-field" required min="0"
                                                value={workForm.copies}
                                                onChange={e => setWorkForm({ ...workForm, copies: e.target.value })} />
                                        </div>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">Payment Type</label>
                                            <select className="input-field" value={workForm.payment_type}
                                                onChange={e => setWorkForm({ ...workForm, payment_type: e.target.value })}>
                                                <option>Cash</option><option>UPI</option><option>Credit</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="row gap-md">
                                        {(workForm.payment_type === 'Cash' || workForm.payment_type === 'UPI') && (
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label className="form-label">{workForm.payment_type} Amount</label>
                                                <input type="number" className="input-field" step="0.01" min="0"
                                                    value={workForm.payment_type === 'Cash' ? workForm.cash_amount : workForm.upi_amount}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        if (workForm.payment_type === 'Cash')
                                                            setWorkForm({ ...workForm, cash_amount: val, total_amount: val });
                                                        else
                                                            setWorkForm({ ...workForm, upi_amount: val, total_amount: val });
                                                    }} />
                                            </div>
                                        )}
                                        {workForm.payment_type === 'Credit' && (
                                            <div className="form-group" style={{ flex: 1 }}>
                                                <label className="form-label">Credit Amount</label>
                                                <input type="number" className="input-field" step="0.01" min="0"
                                                    value={workForm.credit_amount}
                                                    onChange={e => setWorkForm({ ...workForm, credit_amount: e.target.value, total_amount: e.target.value })} />
                                            </div>
                                        )}
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="form-label">Total Amount</label>
                                            <input type="number" className="input-field" step="0.01" min="0"
                                                value={workForm.total_amount}
                                                onChange={e => setWorkForm({ ...workForm, total_amount: e.target.value })} />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Remarks</label>
                                        <input type="text" className="input-field"
                                            value={workForm.remarks}
                                            onChange={e => setWorkForm({ ...workForm, remarks: e.target.value })} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-ghost" onClick={() => setShowWorkModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={workSaving}>
                                        {workSaving ? <Loader2 className="animate-spin" size={16} /> : 'Add Work'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Staff Assignment Modal */}
                {showAssignModal && renderAssignModal()}
            </div>
        );
    }

    // ─── Assign Modal Component ──────────────────────────────────
    function renderAssignModal() {
        // Filter staff by branch if machine is in MPR/Meppayur branch
        let filteredStaff = staffList;
        const machine = machines.find(m => m.id === assignMachineId);
        if (machine && machine.branch_name) {
            const bn = machine.branch_name.toLowerCase();
            // match common identifiers for Meppayur/MPR branch
            if (bn.includes('meppayur') || bn.includes('mpr')) {
                filteredStaff = staffList.filter(s => s.branch_name && (s.branch_name.toLowerCase().includes('meppayur') || s.branch_name.toLowerCase().includes('mpr')));
            }
        }
        return (
            <div className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                    <div className="modal-header">
                        <h2>Assign Staff</h2>
                        <button className="btn btn-ghost" onClick={() => setShowAssignModal(false)}>×</button>
                    </div>
                    <div className="modal-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
                        <p className="text-sm muted" style={{ marginBottom: 12 }}>Select staff members to assign to this machine. Multiple selections allowed.</p>
                        <div className="stack-sm">
                            {filteredStaff.map(s => (
                                <label key={s.id} className="row items-center gap-sm" style={{
                                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                    border: '1px solid var(--clr-border)',
                                    background: selectedStaffIds.includes(s.id) ? 'var(--clr-primary-light, #eef2ff)' : 'transparent'
                                }}>
                                    <input type="checkbox"
                                        checked={selectedStaffIds.includes(s.id)}
                                        onChange={() => toggleStaff(s.id)} />
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: 'var(--accent)', color: '#fff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, fontWeight: 600, flexShrink: 0
                                    }}>
                                        {s.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div className="font-medium text-sm">{s.name}</div>
                                        <div className="text-xs muted">{s.role} &middot; {s.branch_name || ''}</div>
                                    </div>
                                </label>
                            ))}
                            {filteredStaff.length === 0 && <p className="text-sm muted">No staff available</p>}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={() => setShowAssignModal(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAssignStaff}>
                            Assign ({selectedStaffIds.length})
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Card Grid View ──────────────────────────────────────────
    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Machine Management</h1>
                    <p className="section-subtitle">
                        {isAdmin ? 'Manage machines, assign staff & track production' : 'Your assigned machines'}
                    </p>
                </div>
                {isAdmin && (
                    <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                        <Plus size={18} /> Add Machine
                    </button>
                )}
            </div>

            {loading ? (
                <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
                    <Loader2 className="animate-spin" size={32} style={{ margin: '0 auto' }} />
                </div>
            ) : machines.length === 0 ? (
                <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
                    <Settings size={40} className="muted" style={{ margin: '0 auto 12px' }} />
                    <p className="muted">{isAdmin ? 'No machines found. Add your first machine.' : 'No machines assigned to you.'}</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {machines.map(machine => (
                        <div key={machine.id} className="panel"
                            onDoubleClick={() => handleCardDoubleClick(machine)}
                            style={{
                                padding: 0, cursor: 'pointer', transition: 'box-shadow .15s, transform .15s',
                                opacity: machine.is_active === 1 ? 1 : 0.6,
                                position: 'relative', overflow: 'hidden'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                            onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
                        >
                            {/* Card Header */}
                            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--clr-border)' }}>
                                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="row items-center gap-sm">
                                            <Printer size={18} style={{ color: 'var(--clr-primary)', flexShrink: 0 }} />
                                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {machine.machine_name}
                                            </h3>
                                        </div>
                                        <div className="row items-center gap-xs" style={{ marginTop: 4 }}>
                                            <span className={`badge ${getTypeColor(machine.machine_type)}`} style={{ fontSize: 11 }}>{machine.machine_type}</span>
                                            <span className="text-xs muted">{machine.counter_type}</span>
                                            {machine.is_active !== 1 && <span className="badge badge--danger" style={{ fontSize: 11 }}>Inactive</span>}
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <div className="row gap-xs" style={{ flexShrink: 0 }}>
                                            <button className="btn btn-ghost" style={{ padding: 4 }}
                                                onClick={e => openAssignModal(machine, e)} title="Assign Staff">
                                                <UserPlus size={15} />
                                            </button>
                                            <button className="btn btn-ghost btn-primary" style={{ padding: 4 }}
                                                onClick={e => handleEdit(machine, e)} title="Edit">
                                                <Edit2 size={15} />
                                            </button>
                                            <button className={`btn btn-ghost ${machine.is_active === 1 ? 'btn-warning' : 'btn-success'}`}
                                                style={{ padding: 4 }}
                                                onClick={e => handleToggleActive(machine, e)}
                                                title={machine.is_active === 1 ? 'Deactivate' : 'Activate'}>
                                                {machine.is_active === 1 ? <PowerOff size={15} /> : <Power size={15} />}
                                            </button>
                                            <button className="btn btn-ghost btn-danger" style={{ padding: 4 }}
                                                onClick={e => handleDelete(machine, e)} title="Delete">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Card Body */}
                            <div style={{ padding: '10px 16px 14px' }}>
                                <div className="row items-center gap-xs text-sm" style={{ marginBottom: 6 }}>
                                    <Building2 size={14} className="muted" />
                                    <span className="muted">{machine.branch_name}</span>
                                    {machine.location && <span className="muted">&middot; {machine.location}</span>}
                                </div>

                                {/* Assigned Staff */}
                                <div className="row items-center gap-xs" style={{ marginTop: 8 }}>
                                    <Users size={14} className="muted" />
                                    {machine.assigned_staff_names ? (
                                        <span className="text-sm" style={{ color: 'var(--clr-primary)' }}>{machine.assigned_staff_names}</span>
                                    ) : (
                                        <span className="text-sm muted">No staff assigned</span>
                                    )}
                                </div>

                                {/* Double-click hint */}
                                <div className="text-xs muted" style={{ marginTop: 8, opacity: 0.6 }}>
                                    Double-click to view full details
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Machine Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{editingMachine ? 'Edit Machine' : 'Add New Machine'}</h2>
                            <button className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm(); }}>×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body stack-md">
                                <div className="form-group">
                                    <label className="form-label">Machine Name *</label>
                                    <input type="text" className="input-field" required
                                        value={formData.machine_name}
                                        onChange={e => setFormData({ ...formData, machine_name: e.target.value })} />
                                </div>
                                <div className="row gap-md">
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Machine Type *</label>
                                        <select className="input-field" required
                                            value={formData.machine_type}
                                            onChange={e => setFormData({ ...formData, machine_type: e.target.value })}>
                                            {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label">Counter Type *</label>
                                        <select className="input-field" required
                                            value={formData.counter_type}
                                            onChange={e => setFormData({ ...formData, counter_type: e.target.value })}>
                                            <option value="Manual">Manual</option>
                                            <option value="Automatic">Automatic</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Branch *</label>
                                    <select className="input-field" required
                                        value={formData.branch_id}
                                        onChange={e => setFormData({ ...formData, branch_id: e.target.value })}>
                                        <option value="">Select Branch</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Location</label>
                                    <input type="text" className="input-field"
                                        value={formData.location}
                                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="e.g., Ground Floor, Room 101" />
                                </div>
                                <div className="form-group">
                                    <label className="row items-center gap-sm" style={{ cursor: 'pointer' }}>
                                        <input type="checkbox" checked={formData.is_active}
                                            onChange={e => setFormData({ ...formData, is_active: e.target.checked })} />
                                        <span>Active</span>
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => { setShowModal(false); resetForm(); }}>Cancel</button>
                                <button type="submit" className="btn btn-primary">
                                    {editingMachine ? 'Update Machine' : 'Add Machine'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Staff Assignment Modal */}
            {showAssignModal && renderAssignModal()}

            {/* Cash Book Assignments (Admin only) */}
            {isAdmin && (
                <div className="panel" style={{ padding: 20 }}>
                    <h3 className="panel-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BookOpen size={16} /> Cash Book Assignments
                    </h3>
                    <p className="text-sm muted" style={{ marginBottom: 14 }}>
                        Assign staff responsible for entering cash opening for each book. Only assigned staff will see that book's opening prompt.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                        {BOOK_TYPES.map(bt => {
                            // Group by branch
                            const byBranch = {};
                            (bookAssignments[bt.key] || []).forEach(s => {
                                const bName = s.branch_name || 'Unknown';
                                if (!byBranch[bName]) byBranch[bName] = [];
                                byBranch[bName].push(s);
                            });
                            const branchEntries = Object.entries(byBranch);
                            return (
                                <div key={bt.key} className="panel" style={{ padding: 14, border: `2px solid ${bt.color}22` }}>
                                    <div className="row items-center" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <div style={{ width: 10, height: 10, borderRadius: 3, background: bt.color }} />
                                            <span style={{ fontWeight: 700, fontSize: 14 }}>{bt.label}</span>
                                        </div>
                                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}
                                            onClick={() => openBookAssignModal(bt.key)}>
                                            <UserPlus size={13} /> Assign
                                        </button>
                                    </div>
                                    {branchEntries.length === 0 ? (
                                        <p className="text-sm muted" style={{ margin: 0 }}>No staff assigned</p>
                                    ) : (
                                        <div className="stack-xs">
                                            {branchEntries.map(([bName, staffArr]) => (
                                                <div key={bName}>
                                                    <div className="text-xs muted" style={{ fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{bName}</div>
                                                    {staffArr.map(s => (
                                                        <div key={s.staff_id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: bt.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                                                {s.staff_name?.charAt(0)?.toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-medium">{s.staff_name}</div>
                                                                <div className="text-xs muted">{s.staff_role}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Book Assignment Modal */}
            {showBookAssignModal && (() => {
                const foStaff = staffList.filter(s =>
                    s.role === 'Front Office' &&
                    (!bookAssignBranchId || String(s.branch_id) === String(bookAssignBranchId))
                );
                return (
                    <div className="modal-overlay" onClick={() => setShowBookAssignModal(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                            <div className="modal-header">
                                <h2>Assign Staff — {bookAssignType} Book</h2>
                                <button className="btn btn-ghost" onClick={() => setShowBookAssignModal(false)}>×</button>
                            </div>
                            <div className="modal-body" style={{ maxHeight: 440, overflowY: 'auto' }}>
                                <p className="text-sm muted" style={{ marginBottom: 12 }}>
                                    Only Front Office staff can enter cash opening. Select a branch and assign staff.
                                </p>
                                {/* Branch selector */}
                                <div style={{ marginBottom: 14 }}>
                                    <label className="label" style={{ fontSize: 12 }}>Branch</label>
                                    <select
                                        className="input-field"
                                        value={bookAssignBranchId}
                                        onChange={e => handleModalBranchChange(e.target.value)}
                                    >
                                        <option value="">Select branch…</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                                <div className="stack-sm">
                                    {foStaff.length === 0 ? (
                                        <p className="text-sm muted">{bookAssignBranchId ? 'No Front Office staff in this branch.' : 'Select a branch to see staff.'}</p>
                                    ) : foStaff.map(s => (
                                        <label key={s.id} className="row items-center gap-sm" style={{
                                            padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                            border: '1px solid var(--clr-border)',
                                            background: bookAssignStaffIds.includes(s.id) ? 'var(--clr-primary-light, #eef2ff)' : 'transparent'
                                        }}>
                                            <input type="checkbox"
                                                checked={bookAssignStaffIds.includes(s.id)}
                                                onChange={() => toggleBookStaff(s.id)} />
                                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                                                {s.name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div className="font-medium text-sm">{s.name}</div>
                                                <div className="text-xs muted">Front Office &middot; {s.branch_name || ''}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-ghost" onClick={() => setShowBookAssignModal(false)}>Cancel</button>
                                <button className="btn btn-primary" onClick={handleSaveBookAssignment} disabled={savingBookAssign || !bookAssignBranchId}>
                                    {savingBookAssign ? 'Saving...' : `Assign (${bookAssignStaffIds.length})`}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default MachineManagement;

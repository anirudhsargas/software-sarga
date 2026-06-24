import { useSEO } from '../hooks/useSEO';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Plus, Edit2, Trash2, Power, PowerOff, Loader2, Building2, Settings,
    Users, UserPlus, X, Eye, Hash, Gauge, IndianRupee, ClipboardList,
    Calendar, TrendingUp, Package, ChevronLeft, ArrowLeft, RefreshCw, Printer, AlertTriangle, CheckCircle, XCircle,
    BookOpen
} from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { serverToday } from '../services/serverTime';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { syncManager } from '../services/syncWorkerManager';
import MeterVerification from '../components/MeterVerification';
import {formatCurrencyDecimal} from '../utils/formatters';
import './MachineManagement.css';
import PageContainer from '../components/ui/PageContainer';

import BranchSelect from '../components/ui/BranchSelect';

const machineTypes = ['Offset', 'Digital', 'Binding', 'Lamination', 'Cutting', 'Other'];
const BOOK_TYPES = [
    { key: 'Offset', color: 'var(--accent)', label: 'Offset' },
    { key: 'Laser',  color: 'var(--accent)', label: 'Laser'  },
    { key: 'Other',  color: 'var(--text-muted)', label: 'Other'  },
];

const MachineManagement = () => {
    useSEO('Machine Management');

    const { confirm } = useConfirm();
    const user = auth.getUser();
    const isAdmin = user?.role === 'Admin' || user?.role === 'Accountant';

    const triggerRef = useRef(null);
    const triggerWorkRef = useRef(null);
    const triggerAssignRef = useRef(null);
    const triggerBookAssignRef = useRef(null);

    const [showModal, setShowModal] = useState(false);
    useEffect(() => {
        if (showModal) {
            triggerRef.current = document.activeElement;
        } else if (triggerRef.current) {
            triggerRef.current.focus();
            triggerRef.current = null;
        }
    }, [showModal]);

    const [showWorkModal, setShowWorkModal] = useState(false);
    useEffect(() => {
        if (showWorkModal) {
            triggerWorkRef.current = document.activeElement;
        } else if (triggerWorkRef.current) {
            triggerWorkRef.current.focus();
            triggerWorkRef.current = null;
        }
    }, [showWorkModal]);

    const [showAssignModal, setShowAssignModal] = useState(false);
    useEffect(() => {
        if (showAssignModal) {
            triggerAssignRef.current = document.activeElement;
        } else if (triggerAssignRef.current) {
            triggerAssignRef.current.focus();
            triggerAssignRef.current = null;
        }
    }, [showAssignModal]);

    const [showBookAssignModal, setShowBookAssignModal] = useState(false);
    useEffect(() => {
        if (showBookAssignModal) {
            triggerBookAssignRef.current = document.activeElement;
        } else if (triggerBookAssignRef.current) {
            triggerBookAssignRef.current.focus();
            triggerBookAssignRef.current = null;
        }
    }, [showBookAssignModal]);

    useEffect(() => {
        return () => {
            triggerRef.current?.focus();
            triggerWorkRef.current?.focus();
            triggerAssignRef.current?.focus();
            triggerBookAssignRef.current?.focus();
        };
    }, []);

    const [machines, setMachines] = useState([]);
    const [branches, setBranches] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingMachine, setEditingMachine] = useState(null);
    const [selectedMachine, setSelectedMachine] = useState(null);
    const [machineDetails, setMachineDetails] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailTab, setDetailTab] = useState('work');
    const [assignMachineId, setAssignMachineId] = useState(null);
    const [selectedStaffIds, setSelectedStaffIds] = useState([]);
    const [workSaving, setWorkSaving] = useState(false);
    const [formData, setFormData] = useState({
        machine_name: '', machine_type: 'Offset', counter_type: 'Manual',
        branch_id: '', location: '', ip_address: '', is_active: true,
        snmp_community: 'public', mpr_requires_login: false, mpr_username: '', mpr_password: '',
        book_type: 'Offset'
    });
    const [workForm, setWorkForm] = useState({
        customer_name: '', work_details: '', copies: '', payment_type: 'Cash',
        cash_amount: '', upi_amount: '', credit_amount: '', total_amount: '', remarks: '',
        waste_copies: '', proof_copies: ''
    });
    const [readingForm, setReadingForm] = useState({ opening_count: '', closing_count: '', waste_prints: '', proof_prints: '', notes: '' });
    const [filterType, setFilterType] = useState('All');
    const [readingSaving, setReadingSaving] = useState(false);
    const [countRequests, setCountRequests] = useState([]);
    const [countRequestWorking, setCountRequestWorking] = useState(false);
    const [liveCount, setLiveCount] = useState(null);
    const [liveCountLoading, setLiveCountLoading] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState('All');
    const [dailyBookType, setDailyBookType] = useState('Offset');

    // Book assignments (Offset / Laser / Other)
    const [bookAssignments, setBookAssignments] = useState({ Offset: [], Laser: [], Other: [] });
    const [bookAssignType, setBookAssignType] = useState(null);   // 'Offset' | 'Laser' | 'Other'
    const [bookAssignBranchId, setBookAssignBranchId] = useState('');
    const [bookAssignStaffIds, setBookAssignStaffIds] = useState([]);
    const [savingBookAssign, setSavingBookAssign] = useState(false);

    // Data Fetch ──────────────────────────────────────────────
    useEffect(() => {
        fetchMachines();
        if (isAdmin) {
            fetchBranches();
            fetchStaff();
            fetchBookAssignments();
        }
    }, [selectedBranch]);

    async function fetchBranches() {
        try {
            const res = await api.get('/branches');
            setBranches(res.data);
        } catch (e) { console.error('Error fetching branches:', e); }
    }

    async function fetchStaff() {
        try {
            const res = await api.get('/staff');
            setStaffList(Array.isArray(res.data) ? res.data : res.data.data || []);
        } catch (e) { console.error('Error fetching staff:', e); }
    }

    async function fetchMachines() {
        try {
            setLoading(true);
            const user = auth.getUser();
            const isAdminUser = user?.role === 'Admin' || user?.role === 'Accountant';
            
            const params = {};
            if (isAdminUser) {
                if (selectedBranch !== 'All') {
                    params.branch_id = selectedBranch;
                }
            } else {
                params.branch_id = user?.branch_id;
            }

            const res = await api.get('/machines', { params });
            setMachines(res.data);
        } catch (e) { console.error('Error fetching machines:', e); }
        finally { setLoading(false); }
    }

    async function fetchBookAssignments() {
        try {
            const res = await api.get('/machines/book-assignments');
            setBookAssignments(res.data || { Offset: [], Laser: [], Other: [] });
        } catch (e) { console.error('Error fetching book assignments:', e); }
    }

    const fetchLiveCount = async (machineId, ipAddress) => {
        if (!ipAddress) { setLiveCount(null); return; }
        try {
            setLiveCountLoading(true);
            const res = await api.get(`/machines/${machineId}/mpr-meter-data`);
            setLiveCount(res.data.meter_data);
        } catch {
            setLiveCount(null);
        } finally {
            setLiveCountLoading(false);
        }
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
                    waste_prints: res.data.today_reading.waste_prints?.toString() || '',
                    proof_prints: res.data.today_reading.proof_prints?.toString() || '',
                    notes: res.data.today_reading.notes || ''
                });
            } else {
                // Auto-carry forward: pre-fill opening count from yesterday's closing count
                const expected = res.data.expected_opening_count;
                setReadingForm({
                    opening_count: expected != null ? expected.toString() : '',
                    closing_count: '',
                    waste_prints: '',
                    proof_prints: '',
                    notes: ''
                });
            }
            setDailyBookType(res.data.book_type || 'Offset');
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
                // Optimistic UI Update for edit
                const _prevMachines = [...machines];
                setMachines(prev => prev.map(m => m.id === editingMachine.id ? { ...m, ...formData } : m));
                await api.put(`/machines/${editingMachine.id}`, formData);
            } else {
                await api.post('/machines', formData);
            }
            setShowModal(false);
            resetForm();
            fetchMachines();
            // Invalidate machines cache so billing page gets fresh data
            syncManager.invalidateCache('machines');
            toast.success('Machine saved and cache refreshed');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to save machine');
            fetchMachines();
        }
    };

    const handleEdit = (machine, e) => {
        if (e) e.stopPropagation();
        setEditingMachine(machine);
        setFormData({
            machine_name: machine.machine_name, machine_type: machine.machine_type,
            counter_type: machine.counter_type, branch_id: machine.branch_id,
            location: machine.location || '', ip_address: machine.ip_address || '', is_active: machine.is_active === 1,
            snmp_community: machine.snmp_community || 'public',
            mpr_requires_login: !!(machine.mpr_username),
            mpr_username: machine.mpr_username || '',
            mpr_password: machine.mpr_password || '',
            book_type: machine.book_type || 'Offset'
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
            // Invalidate machines cache so billing page gets fresh data
            syncManager.invalidateCache('machines');
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

        // Optimistic UI Update
        setMachines(prev => prev.filter(m => m.id !== machine.id));
        try {
            await api.delete(`/machines/${machine.id}`);
            fetchMachines();
            // Invalidate machines cache so billing page gets fresh data
            syncManager.invalidateCache('machines');
        } catch (e) {
            toast.error(e.response?.data?.error || 'Failed to delete machine');
            fetchMachines();
        }
    };

    const resetForm = () => {
        setFormData({ machine_name: '', machine_type: 'Offset', counter_type: 'Manual', branch_id: '', location: '', ip_address: '', is_active: true, snmp_community: 'public', mpr_requires_login: false, mpr_username: '', mpr_password: '', book_type: 'Offset' });
        setEditingMachine(null);
    };

    const handleCardDoubleClick = (machine) => {
        setSelectedMachine(machine);
        setDetailTab('work');
        setLiveCount(null);
        fetchMachineDetails(machine.id);
        fetchLiveCount(machine.id, machine.ip_address);
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
                waste_prints: readingForm.waste_prints ? parseInt(readingForm.waste_prints) : 0,
                proof_prints: readingForm.proof_prints ? parseInt(readingForm.proof_prints) : 0,
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
                waste_copies: parseInt(workForm.waste_copies) || 0,
                proof_copies: parseInt(workForm.proof_copies) || 0,
                cash_amount: parseFloat(workForm.cash_amount) || 0,
                upi_amount: parseFloat(workForm.upi_amount) || 0,
                credit_amount: parseFloat(workForm.credit_amount) || 0,
                total_amount: parseFloat(workForm.total_amount) || 0,
                work_date: today
            });
            setShowWorkModal(false);
            setWorkForm({ customer_name: '', work_details: '', copies: '', payment_type: 'Cash', cash_amount: '', upi_amount: '', credit_amount: '', total_amount: '', remarks: '', waste_copies: '', proof_copies: '' });
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
    const fmtCur = formatCurrencyDecimal;

    const filteredMachines = filterType === 'All'
        ? machines
        : filterType === 'Others'
            ? machines.filter(m => m.machine_type !== 'Offset' && m.machine_type !== 'Laser')
            : machines.filter(m => m.machine_type === filterType);

    // ─── Detail View ─────────────────────────────────────────────
    if (selectedMachine) {
        return (
            <div className="stack-lg">
                {/* Header */}
                <div className="page-header">
                    <div className="row items-center gap-md">
                        <button className="btn btn-ghost" onClick={() => setSelectedMachine(null)}>
                            <ArrowLeft size={18} />
                        </button>
                        <div className="mm-page-header">
                            <Printer size={20} className="mm-header-icon" />
                            <h1 className="section-title">{selectedMachine.machine_name}</h1>
                        </div>
                        {selectedMachine.ip_address && (
                            <span className="mm-header-ip">IP: {selectedMachine.ip_address}</span>
                        )}
                        <div className="row gap-sm ml-auto">
                            <button className="btn btn-primary" onClick={() => setShowWorkModal(true)}>
                                <Plus size={18} /> Add Work
                            </button>
                        </div>
                    </div>
                </div>

                {detailLoading ? (
                    <div className="mm-loading">
                        <Loader2 className="animate-spin mm-loader-inline" size={32} />
                    </div>
                ) : machineDetails ? (
                    <>
                        {/* Stats Cards */}
                        <div className="mm-stats-grid">
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label">Today Opening</div>
                                <div className="mm-stat-value">
                                    {machineDetails.today_reading ? fmt(machineDetails.today_reading.opening_count) : '—'}
                                </div>
                                <div className="form-group">
                                    <label className="form-label" htmlFor={`daily-book-${selectedMachine?.id}`}>Daily Book</label>
                                    <select id={`daily-book-${selectedMachine?.id}`} className="input-field"
                                        value={dailyBookType}
                                        onChange={e => {
                                            setDailyBookType(e.target.value);
                                            api.put(`/machines/${selectedMachine.id}`, { book_type: e.target.value })
                                                .then(() => toast.success('Daily book updated'))
                                                .catch(() => toast.error('Failed to update daily book'));
                                        }}>
                                        {BOOK_TYPES.map(bt => (
                                            <option key={bt.key} value={bt.key}>{bt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label">Today Closing</div>
                                <div className="mm-stat-value">
                                    {machineDetails.today_reading?.closing_count != null ? fmt(machineDetails.today_reading.closing_count) : '—'}
                                </div>
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label">Total Copies</div>
                                <div className="mm-stat-value mm-stat-value--accent">
                                    {machineDetails.today_reading?.total_copies ? fmt(machineDetails.today_reading.total_copies) : '—'}
                                </div>
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label mm-monthly-stat-label--error">Waste Prints</div>
                                <div className="mm-stat-value mm-stat-value--error">
                                    {machineDetails.today_reading?.waste_prints != null ? fmt(machineDetails.today_reading.waste_prints) : '—'}
                                </div>
                                {machineDetails.today_reading?.total_copies > 0 && machineDetails.today_reading?.waste_prints != null && (
                                    <div className="mm-table-percent mm-table-percent--error">
                                        {((machineDetails.today_reading.waste_prints / machineDetails.today_reading.total_copies) * 100).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label mm-monthly-stat-label--warning">Proof Prints</div>
                                <div className="mm-stat-value mm-stat-value--warning">
                                    {machineDetails.today_reading?.proof_prints != null ? fmt(machineDetails.today_reading.proof_prints) : '—'}
                                </div>
                                {machineDetails.today_reading?.total_copies > 0 && machineDetails.today_reading?.proof_prints != null && (
                                    <div className="mm-table-percent mm-table-percent--warning">
                                        {((machineDetails.today_reading.proof_prints / machineDetails.today_reading.total_copies) * 100).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label">Month Revenue</div>
                                <div className="mm-stat-value mm-stat-value--success">
                                    {fmtCur(machineDetails.monthly_stats?.total_revenue)}
                                </div>
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label">Month Jobs</div>
                                <div className="mm-stat-value">
                                    {fmt(machineDetails.monthly_stats?.total_jobs)}
                                </div>
                            </div>
                            <div className="panel mm-stat-card">
                                <div className="mm-stat-label">Assigned Staff</div>
                                <div className="mm-stat-value">
                                    {machineDetails.assigned_staff?.length || 0}
                                </div>
                            </div>
                            {machineDetails.ip_address && (
                                <div className="panel mm-live-count-card">
                                    <div className="mm-live-count-label">Live Count</div>
                                    <div className="mm-live-count-value">
                                        {liveCountLoading ? (
                                            <Loader2 size={20} className="animate-spin mm-loader-inline" />
                                        ) : liveCount?.total_prints != null ? (
                                            liveCount.total_prints.toLocaleString('en-IN')
                                        ) : '—'}
                                    </div>
                                    <button
                                        onClick={() => fetchLiveCount(selectedMachine.id, machineDetails.ip_address)}
                                        disabled={liveCountLoading}
                                        title="Refresh live count"
                                        className="mm-live-count-refresh"
                                    >
                                        <RefreshCw size={13} className={liveCountLoading ? 'animate-spin' : ''} />
                                    </button>
                                    {liveCount?.fetched_at && (
                                        <div className="mm-live-count-time">
                                            {new Date(liveCount.fetched_at).toLocaleTimeString()}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Opening/Closing Count Entry */}
                        <div className="panel panel--tight">
                            <h3 className="mm-panel-header-title">
                                <Gauge size={16} className="mm-header-icon-small" />
                                Today's Counter ({serverToday ? serverToday() : new Date().toISOString().split('T')[0]})
                            </h3>
                            <div className="mm-reading-form">
                                <div className="form-group mm-form-group--inline">
                                    <label className="form-label text-sm mm-reading-label mm-reading-label--muted">Opening Count</label>
                                    <input type="number" className="input-field mm-reading-input mm-reading-input--large"
                                        value={readingForm.opening_count}
                                        onChange={e => setReadingForm({ ...readingForm, opening_count: e.target.value })}
                                        disabled={machineDetails.today_reading && !isAdmin}
                                        placeholder="0"
                                    />
                                    {machineDetails.expected_opening_count != null && (
                                        <div className="mm-reading-hint">
                                            Expected: <strong>{machineDetails.expected_opening_count.toLocaleString('en-IN')}</strong>
                                        </div>
                                    )}
                                    {!isAdmin && !machineDetails.today_reading &&
                                        machineDetails.expected_opening_count != null &&
                                        readingForm.opening_count !== '' &&
                                        parseInt(readingForm.opening_count) !== machineDetails.expected_opening_count && (
                                        <div className="mm-reading-hint mm-reading-hint--warning">
                                            <AlertTriangle size={10} /> Flagged for review
                                        </div>
                                    )}
                                </div>

                                <div className="form-group mm-form-group--inline">
                                    <label className="form-label text-sm mm-reading-label mm-reading-label--muted">Closing Count</label>
                                    <input type="number" className="input-field mm-reading-input mm-reading-input--large"
                                        value={readingForm.closing_count}
                                        onChange={e => setReadingForm({ ...readingForm, closing_count: e.target.value })}
                                        placeholder="—"
                                    />
                                    {readingForm.closing_count !== '' && readingForm.opening_count !== '' &&
                                        parseInt(readingForm.closing_count) > parseInt(readingForm.opening_count) && (
                                        <div className="mm-reading-hint mm-reading-hint--accent">
                                            Total: {(parseInt(readingForm.closing_count) - parseInt(readingForm.opening_count)).toLocaleString('en-IN')}
                                        </div>
                                    )}
                                </div>

                                <div className="form-group mm-form-group--inline">
                                    <label className="form-label text-sm mm-reading-label mm-reading-label--error">Waste Prints</label>
                                    <input type="number" min="0" className="input-field mm-reading-input mm-reading-input--error"
                                        value={readingForm.waste_prints}
                                        onChange={e => setReadingForm({ ...readingForm, waste_prints: e.target.value })}
                                        placeholder="0"
                                    />
                                    {readingForm.waste_prints && readingForm.closing_count && readingForm.opening_count &&
                                        parseInt(readingForm.closing_count) > parseInt(readingForm.opening_count) && (
                                        <div className="mm-reading-hint mm-reading-hint--error">
                                            {((parseInt(readingForm.waste_prints) / (parseInt(readingForm.closing_count) - parseInt(readingForm.opening_count))) * 100).toFixed(1)}% waste
                                        </div>
                                    )}
                                </div>

                                <div className="form-group mm-form-group--inline">
                                    <label className="form-label text-sm mm-reading-label mm-reading-label--warning">Proof Prints</label>
                                    <input type="number" min="0" className="input-field mm-reading-input mm-reading-input--warning"
                                        value={readingForm.proof_prints}
                                        onChange={e => setReadingForm({ ...readingForm, proof_prints: e.target.value })}
                                        placeholder="0"
                                    />
                                    {readingForm.proof_prints && readingForm.closing_count && readingForm.opening_count &&
                                        parseInt(readingForm.closing_count) > parseInt(readingForm.opening_count) && (
                                        <div className="mm-reading-hint mm-reading-hint--warning">
                                            {((parseInt(readingForm.proof_prints) / (parseInt(readingForm.closing_count) - parseInt(readingForm.opening_count))) * 100).toFixed(1)}% proof
                                        </div>
                                    )}
                                </div>

                                <div className="form-group mm-form-group--inline">
                                    <label className="form-label text-sm mm-reading-label mm-reading-label--muted">Notes</label>
                                    <input type="text" className="input-field mm-reading-input"
                                        value={readingForm.notes}
                                        onChange={e => setReadingForm({ ...readingForm, notes: e.target.value })}
                                        placeholder="Remarks..."
                                    />
                                </div>

                                <button className="btn btn-primary mm-reading-save-btn" onClick={handleSaveReading} disabled={readingSaving}>
                                    {readingSaving ? <Loader2 className="animate-spin" size={18} /> : 'Save'}
                                </button>
                            </div>
                            {/* Good prints summary */}
                            {readingForm.closing_count && readingForm.opening_count &&
                                parseInt(readingForm.closing_count) > parseInt(readingForm.opening_count) && (
                                <div className="mm-good-prints-summary">
                                    {(() => {
                                        const total = parseInt(readingForm.closing_count) - parseInt(readingForm.opening_count);
                                        const waste = parseInt(readingForm.waste_prints) || 0;
                                        const proof = parseInt(readingForm.proof_prints) || 0;
                                        const good = Math.max(0, total - waste - proof);
                                        const overLimit = waste + proof > total;
                                        return (
                                            <>
                                                <span className="mm-good-prints-item mm-good-prints-item--good">
                                                    ✓ Good: {good.toLocaleString('en-IN')} ({total > 0 ? ((good/total)*100).toFixed(1) : 0}%)
                                                </span>
                                                <span className="mm-good-prints-item mm-good-prints-item--error">Waste: {waste.toLocaleString('en-IN')}</span>
                                                <span className="mm-good-prints-item mm-good-prints-item--warning">Proof: {proof.toLocaleString('en-IN')}</span>
                                                {overLimit && <span className="mm-good-prints-item mm-good-prints-item--alert">⚠ Waste + Proof exceeds total!</span>}
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                            {machineDetails.today_reading && !isAdmin && (
                                <p className="text-sm muted mm-reading-locked">
                                    Opening count is locked. Contact Admin for changes.
                                </p>
                            )}
                        </div>

                        {/* Tab Navigation */}
                        <div className="mm-tab-nav">
                            {[
                                { key: 'work', label: "Today's Work", icon: ClipboardList },
                                { key: 'production', label: 'Production Summary', icon: TrendingUp },
                                { key: 'jobs', label: 'Job Queue', icon: Package },
                                { key: 'staff', label: 'Assigned Staff', icon: Users },
                                { key: 'readings', label: 'Reading History', icon: Hash },
                                { key: 'meter', label: 'MPR Verification', icon: Eye }
                            ].map(tab => (
                                <button key={tab.key}
                                    className={`btn ${detailTab === tab.key ? 'btn-primary' : 'btn-ghost'} mm-tab-btn`}
                                    onClick={() => setDetailTab(tab.key)}
                                >
                                    <tab.icon size={15} /> {tab.label}
                                </button>
                            ))}
                            {/* Count Requests tab — admin only */}
                            {isAdmin && (
                                <button
                                    className={`btn ${detailTab === 'requests' ? 'btn-primary' : 'btn-ghost'} mm-tab-btn mm-tab-btn--relative`}
                                    onClick={() => setDetailTab('requests')}
                                >
                                    <AlertTriangle size={15} /> Count Requests
                                    {countRequests.length > 0 && (
                                        <span className="mm-tab-badge">{countRequests.length}</span>
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
                                                <th className="mm-table-header mm-table-header--error">Waste</th>
                                                <th className="mm-table-header mm-table-header--warning">Proof</th>
                                                <th>Payment</th>
                                                <th>Amount</th>
                                                <th>Remarks</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.today_work || machineDetails.today_work.length === 0) ? (
                                                <tr><td colSpan="9" className="text-center muted table-empty">No work entries today</td></tr>
                                            ) : machineDetails.today_work.map(w => (
                                                <tr key={w.id}>
                                                    <td className="font-medium">{w.customer_name}</td>
                                                    <td className="text-sm">{w.work_details}</td>
                                                    <td className="mm-table-cell-mono">{fmt(w.copies)}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--error">{w.waste_copies > 0 ? fmt(w.waste_copies) : '—'}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--warning">{w.proof_copies > 0 ? fmt(w.proof_copies) : '—'}</td>
                                                    <td><span className="badge badge--type-walk-in">{w.payment_type}</span></td>
                                                    <td className="font-medium mm-table-cell-mono">{fmtCur(w.total_amount)}</td>
                                                    <td className="text-sm muted">{w.remarks || '-'}</td>
                                                    <td>
                                                        <button className="btn btn-ghost btn-danger mm-delete-btn"
                                                            onClick={() => handleDeleteWork(w.id)}><Trash2 size={15} /></button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {machineDetails.today_work && machineDetails.today_work.length > 0 && (
                                    <div className="mm-work-summary">
                                        <span className="text-sm muted">Total: <strong>{machineDetails.today_work.length}</strong> entries</span>
                                        <span className="text-sm font-medium mm-work-summary-total">
                                            Total: {fmtCur(machineDetails.today_work.reduce((s, w) => s + parseFloat(w.total_amount || 0), 0))}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {detailTab === 'production' && (
                            <div className="panel panel--tight">
                                <div className="mm-panel-header">
                                    <h3 className="mm-panel-header-title">Last 7 Days Production</h3>
                                </div>
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Opening</th>
                                                <th>Closing</th>
                                                <th>Total Copies</th>
                                                <th className="mm-table-header mm-table-header--good">Good</th>
                                                <th className="mm-table-header mm-table-header--error">Waste</th>
                                                <th className="mm-table-header mm-table-header--warning">Proof</th>
                                                <th>Revenue</th>
                                                <th>Work Entries</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.production_summary || machineDetails.production_summary.length === 0) ? (
                                                <tr><td colSpan="9" className="text-center muted table-empty">No production data</td></tr>
                                            ) : machineDetails.production_summary.map(p => {
                                                const waste = p.waste_prints || 0;
                                                const proof = p.proof_prints || 0;
                                                const good = Math.max(0, (p.total_copies || 0) - waste - proof);
                                                return (
                                                <tr key={p.reading_date}>
                                                    <td className="font-medium">{new Date(p.reading_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                                                    <td className="mm-table-cell-mono">{fmt(p.opening_count)}</td>
                                                    <td className="mm-table-cell-mono">{p.closing_count != null ? fmt(p.closing_count) : '—'}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--bold">{fmt(p.total_copies)}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--good mm-table-cell-mono--bold">{fmt(good)}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--error">
                                                        {waste > 0 ? <>{fmt(waste)} <span className="mm-table-percent mm-table-percent--error"> ({p.total_copies > 0 ? ((waste/p.total_copies)*100).toFixed(1) : 0}%)</span></> : '—'}
                                                    </td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--warning">
                                                        {proof > 0 ? <>{fmt(proof)} <span className="mm-table-percent mm-table-percent--warning"> ({p.total_copies > 0 ? ((proof/p.total_copies)*100).toFixed(1) : 0}%)</span></> : '—'}
                                                    </td>
                                                    <td className="mm-table-cell-mono">{fmtCur(p.day_revenue)}</td>
                                                    <td>{p.work_entries_count || 0}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Monthly Summary */}
                                {machineDetails.monthly_stats && (
                                    <div className="mm-monthly-stats">
                                        <div><span className="text-sm muted">Month Revenue</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_revenue)}</strong></div>
                                        <div><span className="text-sm muted">Cash</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_cash)}</strong></div>
                                        <div><span className="text-sm muted">UPI</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_upi)}</strong></div>
                                        <div><span className="text-sm muted">Credit</span><br /><strong>{fmtCur(machineDetails.monthly_stats.total_credit)}</strong></div>
                                        <div><span className="text-sm muted">Total Copies</span><br /><strong>{fmt(machineDetails.monthly_stats.total_copies)}</strong></div>
                                        <div><span className="mm-monthly-stat-label mm-monthly-stat-label--error">Waste Prints</span><br /><strong className="mm-monthly-stat-value mm-monthly-stat-value--error">{fmt(machineDetails.monthly_stats.waste_prints || 0)}</strong></div>
                                        <div><span className="mm-monthly-stat-label mm-monthly-stat-label--warning">Proof Prints</span><br /><strong className="mm-monthly-stat-value mm-monthly-stat-value--warning">{fmt(machineDetails.monthly_stats.proof_prints || 0)}</strong></div>
                                        <div><span className="text-sm muted">Total Jobs</span><br /><strong>{fmt(machineDetails.monthly_stats.total_jobs)}</strong></div>
                                    </div>
                                )}
                            </div>
                        )}

                        {detailTab === 'staff' && (
                            <div className="panel mm-staff-section">
                                <div className="mm-staff-header">
                                    <h3 className="mm-staff-title">Assigned Staff</h3>
                                    {isAdmin && (
                                        <button className="btn btn-ghost btn-primary mm-btn-sm"
                                            onClick={() => openAssignModal(selectedMachine)}>
                                            <UserPlus size={15} /> Manage
                                        </button>
                                    )}
                                </div>
                                <div className="mm-staff-grid">
                                    {(!machineDetails.assigned_staff || machineDetails.assigned_staff.length === 0) ? (
                                        <p className="text-sm muted">No staff assigned yet</p>
                                    ) : machineDetails.assigned_staff.map(s => (
                                        <div key={s.id} className="panel mm-staff-card">
                                            <div className="mm-staff-avatar">
                                                {s.name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="mm-staff-info">
                                                <div className="font-medium text-sm mm-staff-name">{s.name}</div>
                                                <div className="text-xs muted">{s.role}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {detailTab === 'readings' && (
                            <div className="panel panel--tight">
                                <div className="mm-panel-header">
                                    <h3 className="mm-panel-header-title">Reading History</h3>
                                </div>
                                <div className="table-scroll">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Opening</th>
                                                <th>Closing</th>
                                                <th>Total Copies</th>
                                                <th>Good</th>
                                                <th>Waste</th>
                                                <th>Proof</th>
                                                <th>Notes</th>
                                                <th>Entered By</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(!machineDetails.readings || machineDetails.readings.length === 0) ? (
                                                <tr><td colSpan="9" className="text-center muted table-empty">No readings yet</td></tr>
                                            ) : machineDetails.readings.map(r => {
                                                const waste = r.waste_prints || 0;
                                                const proof = r.proof_prints || 0;
                                                const good = Math.max(0, (r.total_copies || 0) - waste - proof);
                                                return (
                                                <tr key={r.id}>
                                                    <td className="font-medium">{new Date(r.reading_date).toLocaleDateString('en-IN')}</td>
                                                    <td className="mm-table-cell-mono">{fmt(r.opening_count)}</td>
                                                    <td className="mm-table-cell-mono">{r.closing_count != null ? fmt(r.closing_count) : '—'}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--bold">{fmt(r.total_copies)}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--good mm-table-cell-mono--bold">{fmt(good)}</td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--error">
                                                        {waste > 0 ? <>{fmt(waste)}{r.total_copies > 0 && <span className="mm-table-percent mm-table-percent--error"> ({((waste/r.total_copies)*100).toFixed(1)}%)</span>}</> : '—'}
                                                    </td>
                                                    <td className="mm-table-cell-mono mm-table-cell-mono--warning">
                                                        {proof > 0 ? <>{fmt(proof)}{r.total_copies > 0 && <span className="mm-table-percent mm-table-percent--warning"> ({((proof/r.total_copies)*100).toFixed(1)}%)</span>}</> : '—'}
                                                    </td>
                                                    <td className="text-sm muted">{r.notes || '-'}</td>
                                                    <td className="text-sm">{r.created_by_name || '-'}</td>
                                                </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Count Requests Tab (Admin only) */}
                        {detailTab === 'requests' && isAdmin && (
                            <>
                                <div className="panel panel--tight">
                                    <div className="mm-panel-header mm-panel-header--flex">
                                        <h3 className="mm-panel-header-title mm-panel-header-title--flex">
                                            <AlertTriangle size={16} className="mm-header-icon-warning" />
                                            Count Requests
                                        </h3>
                                    </div>
                                    <div className="text-sm muted">Staff-entered counts that differ from the previous day's closing count</div>
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
                                                        <td className="mm-table-cell-mono">
                                                            {req.expected_count != null ? req.expected_count.toLocaleString('en-IN') : '—'}
                                                        </td>
                                                        <td className="mm-table-cell-mono mm-table-cell-mono--bold">
                                                            {req.entered_count.toLocaleString('en-IN')}
                                                        </td>
                                                        <td className="mm-table-cell-mono" style={{ color: diff > 0 ? 'var(--success)' : diff < 0 ? 'var(--error)' : undefined, fontWeight: 600 }}>
                                                            {diff > 0 ? '+' : ''}{diff.toLocaleString('en-IN')}
                                                        </td>
                                                        <td className="text-sm">{req.submitted_by_name || '—'}</td>
                                                        <td>
                                                            <div className="mm-count-request-actions">
                                                                <button
                                                                    className="btn btn-sm mm-count-request-approve-btn"
                                                                    disabled={countRequestWorking}
                                                                    onClick={() => handleCountRequestReview(req.id, 'Approved', null)}>
                                                                    <CheckCircle size={13} /> Approve
                                                                </button>
                                                                <button
                                                                    className="btn btn-sm btn-danger mm-count-request-reject-btn"
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
                                    <div className="text-sm muted mm-count-request-hint">
                                        <strong>Approve</strong> = accept the staff's entered count &nbsp;|&nbsp;
                                        <strong>Reject</strong> = revert to the expected count (last day's closing)
                                    </div>
                                )}
                            </>
                        )}

                        {/* MPR Meter Verification Tab (Admin only) */}
                        {detailTab === 'meter' && isAdmin && machineDetails && (
                            <div className="panel panel--tight">
                                <div className="mm-panel-header">
                                    <MeterVerification 
                                        machineId={machineDetails.id}
                                        machineName={machineDetails.machine_name}
                                        machineIpAddress={machineDetails.ip_address}
                                        lastClosingCount={machineDetails.expected_opening_count}
                                    />
                                </div>
                            </div>
                        )}
                    </>
                ) : null}

                {/* Work Entry Modal */}
                {showWorkModal && (
                    <div role="dialog" aria-modal="true" aria-labelledby="work-modal-title" className="modal-overlay" onClick={() => setShowWorkModal(false)}>
                        <div className="modal mm-work-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2 id="work-modal-title">Add Work Entry</h2>
                                <button className="btn btn-ghost" onClick={() => setShowWorkModal(false)} aria-label="Close work entry modal">×</button>
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
                                        <div className="form-group mm-work-input-group">
                                            <label className="form-label">Copies *</label>
                                            <input type="number" className="input-field" required min="0"
                                                value={workForm.copies}
                                                onChange={e => setWorkForm({ ...workForm, copies: e.target.value })} />
                                        </div>
                                        <div className="form-group mm-work-input-group">
                                            <label className="form-label mm-work-input-label--error">Waste Copies</label>
                                            <input type="number" className="input-field" min="0"
                                                value={workForm.waste_copies}
                                                onChange={e => setWorkForm({ ...workForm, waste_copies: e.target.value })}
                                                placeholder="0"
                                                style={{ borderColor: workForm.waste_copies ? 'var(--destructive)' : undefined }} />
                                        </div>
                                        <div className="form-group mm-work-input-group">
                                            <label className="form-label mm-work-input-label--warning">Proof Copies</label>
                                            <input type="number" className="input-field" min="0"
                                                value={workForm.proof_copies}
                                                onChange={e => setWorkForm({ ...workForm, proof_copies: e.target.value })}
                                                placeholder="0"
                                                style={{ borderColor: workForm.proof_copies ? 'var(--warning)' : undefined }} />
                                        </div>
                                        <div className="form-group mm-work-input-group">
                                            <label className="form-label">Payment Type</label>
                                            <select className="input-field" value={workForm.payment_type}
                                                onChange={e => setWorkForm({ ...workForm, payment_type: e.target.value })}>
                                                <option>Cash</option><option>UPI</option><option>Credit</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="row gap-md">
                                        {(workForm.payment_type === 'Cash' || workForm.payment_type === 'UPI') && (
                                            <div className="form-group mm-work-input-group">
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
                                            <div className="form-group mm-work-input-group">
                                                <label className="form-label">Credit Amount</label>
                                                <input type="number" className="input-field" step="0.01" min="0"
                                                    value={workForm.credit_amount}
                                                    onChange={e => setWorkForm({ ...workForm, credit_amount: e.target.value, total_amount: e.target.value })} />
                                            </div>
                                        )}
                                        <div className="form-group mm-work-input-group">
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
            <div role="dialog" aria-modal="true" aria-labelledby="assign-modal-title" className="modal-overlay" onClick={() => setShowAssignModal(false)}>
                <div className="modal mm-assign-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header modal-header--flex">
                        <h2 id="assign-modal-title">Assign Staff</h2>
                        <button className="btn btn-ghost" onClick={() => setShowAssignModal(false)} aria-label="Close staff assignment modal">×</button>
                    </div>
                    <div className="modal-body mm-assign-modal-body">
                        <p className="text-sm muted mm-assign-hint">Select staff members to assign to this machine. Multiple selections allowed.</p>
                        <div className="stack-sm">
                            {filteredStaff.map(s => (
                                <label key={s.id} className="mm-assign-staff-item mm-assign-staff-item--selected"
                                    style={{
                                        background: selectedStaffIds.includes(s.id) ? 'var(--accent)' : 'transparent',
                                        color: selectedStaffIds.includes(s.id) ? 'var(--on-accent)' : 'var(--text)'
                                    }}
                                >
                                    <input type="checkbox"
                                        checked={selectedStaffIds.includes(s.id)}
                                        onChange={() => toggleStaff(s.id)} />
                                    <div className="mm-assign-avatar">
                                        {s.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="flex-1">
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
        <PageContainer>
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
                <div className="mm-loading">
                    <Loader2 className="animate-spin" size={32} />
                </div>
            ) : machines.length === 0 ? (
                <div className="mm-empty-state">
                    <Settings size={40} className="muted mm-empty-icon" />
                    <p className="muted">{isAdmin ? 'No machines found. Add your first machine.' : 'No machines assigned to you.'}</p>
                </div>
            ) : (
                <>
                    {/* Filter Bar */}
                    <div className="mm-filter-bar">
                        {/* Machine Type Filter */}
                        <div className="mm-type-filter-container">
                            <span className="text-sm font-medium muted" style={{ minWidth: 'fit-content', marginRight: '8px' }}>Type:</span>
                            <div className="mm-filter-pills-row">
                                {['All', 'Offset', 'Laser', 'Others'].map(type => (
                                    <button
                                        key={type}
                                        className={`btn btn-sm ${filterType === type ? 'btn-primary' : 'btn-ghost'} mm-filter-pill`}
                                        onClick={() => setFilterType(type)}
                                        style={{ flexShrink: 0 }}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Branch Filter (Admin only) */}
                        {isAdmin && (
                            <div className="row items-center gap-sm ml-auto">
                                <span className="text-sm font-medium muted">Branch:</span>
                                <BranchSelect 
                                    className="mm-filter-select"
                                    value={selectedBranch}
                                    onChange={e => setSelectedBranch(e.target.value)}
                                >
                                    <option value="All">All Branches</option>
                                    {branches.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </BranchSelect>
                            </div>
                        )}
                    </div>

                    <div className="mm-machine-grid">
                        {filteredMachines.map(machine => (
                        <div key={machine.id} className={`mm-machine-card ${machine.is_active === 1 ? '' : 'mm-machine-card--inactive'}`}
                            onDoubleClick={() => handleCardDoubleClick(machine)}
                        >
                            {/* Card Header */}
                            <div className="mm-card-header">
                                <div className="row items-center gap-sm flex-1 min-w-0">
                                    <Printer size={18} className="mm-header-icon-accent" />
                                    <h3 className="mm-card-name">{machine.machine_name}</h3>
                                </div>
                                <div className="row items-center gap-xs mt-2">
                                    <span className={`badge ${getTypeColor(machine.machine_type)} mm-badge-sm`}>{machine.machine_type}</span>
                                    <span className="text-xs muted">{machine.counter_type}</span>
                                    {machine.is_active !== 1 && <span className="badge badge--danger mm-badge-sm">Inactive</span>}
                                    {machine.health_status && (
                                        <span className={`badge mm-badge-sm ${
                                            machine.health_status === 'healthy' ? 'badge--success' :
                                            machine.health_status === 'warning' ? 'badge--warning' :
                                            machine.health_status === 'critical' ? 'badge--danger' : 'badge--type-walk-in'
                                        }`}>
                                            {machine.health_status.charAt(0).toUpperCase() + machine.health_status.slice(1)}
                                        </span>
                                    )}
                                </div>
                                {isAdmin && (
                                    <div className="mm-card-actions">
                                        <button className="mm-card-action-btn"
                                            onClick={e => openAssignModal(machine, e)} title="Assign Staff">
                                            <UserPlus size={15} />
                                        </button>
                                        <button className="mm-card-action-btn btn-primary mm-action-btn-sm"
                                            onClick={e => handleEdit(machine, e)} title="Edit">
                                            <Edit2 size={15} />
                                        </button>
                                        <button className={`mm-card-action-btn ${machine.is_active === 1 ? 'btn-warning' : 'btn-success'}`}
                                            onClick={e => handleToggleActive(machine, e)}
                                            title={machine.is_active === 1 ? 'Deactivate' : 'Activate'}>
                                            {machine.is_active === 1 ? <PowerOff size={15} /> : <Power size={15} />}
                                        </button>
                                        <button className="mm-card-action-btn btn-danger"
                                            onClick={e => handleDelete(machine, e)} title="Delete">
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Card Body */}
                            <div className="mm-card-info">
                                <div className="mm-card-info-row">
                                    <Building2 size={14} className="muted" />
                                    <span className="muted">{machine.branch_name}</span>
                                    {machine.location && <span className="muted">&middot; {machine.location}</span>}
                                </div>
                                {machine.ip_address && (
                                    <div className="mm-card-info-row">
                                        <span className="muted mm-ip-address">IP: {machine.ip_address}</span>
                                    </div>
                                )}
                                {machine.last_polled_at && (
                                    <div className="mm-card-info-row">
                                        <span className="muted text-xs">Sync: {new Date(machine.last_polled_at).toLocaleString()}</span>
                                    </div>
                                )}

                                {/* Assigned Staff */}
                                <div className="mm-card-info-row mt-8">
                                    <Users size={14} className="muted" />
                                    {machine.assigned_staff_names ? (
                                        <span className="text-sm mm-staff-names">{machine.assigned_staff_names}</span>
                                    ) : (
                                        <span className="text-sm muted">No staff assigned</span>
                                    )}
                                </div>

                                {/* Double-click hint */}
                                <div className="text-xs muted mm-card-hint">
                                    Double-click to view full details
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                </>
            )}

            {/* Add/Edit Machine Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => { setShowModal(false); resetForm(); }} role="dialog" aria-modal="true" aria-labelledby="machine-modal-title">
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header modal-header--flex">
                            <h2 id="machine-modal-title">{editingMachine ? 'Edit Machine' : 'Add New Machine'}</h2>
                            <button className="btn btn-ghost ml-auto" onClick={() => { setShowModal(false); resetForm(); }} aria-label="Close machine modal">×</button>
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
                                    <div className="form-group flex-1">
                                        <label className="form-label">Machine Type *</label>
                                        <select className="input-field" required
                                            value={formData.machine_type}
                                            onChange={e => setFormData({ ...formData, machine_type: e.target.value })}>
                                            {machineTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group flex-1">
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
                                    <BranchSelect className="input-field" required
                                        value={formData.branch_id}
                                        onChange={e => setFormData({ ...formData, branch_id: e.target.value })}>
                                        <option value="">Select Branch</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </BranchSelect>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Location</label>
                                    <input type="text" className="input-field"
                                        value={formData.location}
                                        onChange={e => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="e.g., Ground Floor, Room 101" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">IP Address</label>
                                    <input type="text" className="input-field"
                                        value={formData.ip_address}
                                        onChange={e => setFormData({ ...formData, ip_address: e.target.value })}
                                        placeholder="e.g., 192.168.1.105" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">SNMP Community</label>
                                    <input type="text" className="input-field"
                                        value={formData.snmp_community}
                                        onChange={e => setFormData({ ...formData, snmp_community: e.target.value })}
                                        placeholder="public" />
                                    <small className="mm-snmp-hint">For most printers: leave as "public". For Canon: skip this and use web login below instead. For Kyocera/others with non-standard SNMP: enter the community name.</small>
                                </div>
                                <div className="form-group">
                                    <label className="row items-center gap-sm mm-label-checkbox">
                                        <input type="checkbox" checked={formData.mpr_requires_login}
                                            onChange={e => setFormData({ ...formData, mpr_requires_login: e.target.checked, mpr_username: e.target.checked ? formData.mpr_username : '', mpr_password: e.target.checked ? formData.mpr_password : '' })} />
                                        <span className="form-label mm-label-checkbox-text">✓ Printer requires web login (Canon, some Ricoh)</span>
                                    </label>
                                    {formData.mpr_requires_login && (
                                        <div className="mm-login-grid">
                                            <div>
                                                <label className="form-label mm-label-sm">👤 Username</label>
                                                <input type="text" className="input-field"
                                                    value={formData.mpr_username}
                                                    onChange={e => setFormData({ ...formData, mpr_username: e.target.value })}
                                                    placeholder="e.g., admin" autoComplete="off" />
                                                <small className="mm-login-hint">Canon default: admin or your domain user</small>
                                            </div>
                                            <div>
                                                <label className="form-label mm-label-sm">🔐 Password</label>
                                                <input type="password" className="input-field"
                                                    value={formData.mpr_password}
                                                    onChange={e => setFormData({ ...formData, mpr_password: e.target.value })}
                                                    placeholder="••••••••" autoComplete="new-password" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="form-group">
                                    <label className="row items-center gap-sm mm-label-checkbox">
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
                <div className="panel mm-cash-book-panel">
                    <h3 className="panel-title mm-panel-title--flex">
                        <BookOpen size={16} /> Cash Book Assignments
                    </h3>
                    <p className="text-sm muted mm-cash-book-desc">
                        Assign staff responsible for entering cash opening for each book. Only assigned staff will see that book's opening prompt.
                    </p>
                    <div className="mm-book-grid">
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
                                <div key={bt.key} className="panel mm-book-type-panel" style={{ padding: 14, border: `2px solid ${bt.color}22` }}>
                                    <div className="row items-center mm-book-type-header">
                                        <div className="mm-book-type-title">
                                            <div className="mm-book-type-dot" style={{ background: bt.color }} />
                                            <span className="mm-book-type-label">{bt.label}</span>
                                        </div>
                                        <button className="btn btn-ghost btn-sm mm-btn-xs"
                                            onClick={() => openBookAssignModal(bt.key)}>
                                            <UserPlus size={13} /> Assign
                                        </button>
                                    </div>
                                    {branchEntries.length === 0 ? (
                                        <p className="text-sm muted mm-empty-paragraph">No staff assigned</p>
                                    ) : (
                                        <div className="stack-xs">
                                            {branchEntries.map(([bName, staffArr]) => (
                                                <div key={bName}>
                                                    <div className="text-xs muted mm-branch-label">{bName}</div>
                                                    {staffArr.map(s => (
                                                        <div key={s.staff_id} className="mm-staff-item">
                                                            <div className="mm-staff-avatar-small" style={{ background: bt.color, color: 'var(--on-accent)' }}>
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
                    <div role="dialog" aria-modal="true" aria-labelledby="book-assign-modal-title" className="modal-overlay" onClick={() => setShowBookAssignModal(false)}>
                        <div className="modal mm-modal-sm" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2 id="book-assign-modal-title">Assign Staff — {bookAssignType} Book</h2>
                                <button className="btn btn-ghost" onClick={() => setShowBookAssignModal(false)} aria-label="Close cash book assignment modal">×</button>
                            </div>
                            <div className="modal-body mm-modal-body-scroll">
                                <p className="text-sm muted mm-modal-desc">
                                    Only Front Office staff can enter cash opening. Select a branch and assign staff.
                                </p>
                                {/* Branch selector */}
                                <div className="mm-branch-selector">
                                    <label className="label mm-label-xs">Branch</label>
                                    <BranchSelect
                                        className="input-field"
                                        value={bookAssignBranchId}
                                        onChange={e => handleModalBranchChange(e.target.value)}
                                    >
                                        <option value="">Select branch…</option>
                                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </BranchSelect>
                                </div>
                                <div className="stack-sm">
                                    {foStaff.length === 0 ? (
                                        <p className="text-sm muted">{bookAssignBranchId ? 'No Front Office staff in this branch.' : 'Select a branch to see staff.'}</p>
                                    ) : foStaff.map(s => (
                                        <label key={s.id} className="row items-center gap-sm mm-staff-label" style={{
                                            padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                            border: '1px solid var(--border)',
                                            background: bookAssignStaffIds.includes(s.id) ? 'var(--surface-2)' : 'transparent'
                                        }}>
                                            <input type="checkbox"
                                                checked={bookAssignStaffIds.includes(s.id)}
                                                onChange={() => toggleBookStaff(s.id)} />
                                            <div className="mm-staff-avatar-md">
                                                {s.name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <div className="mm-staff-name">{s.name}</div>
                                                <div className="mm-staff-role">Front Office &middot; {s.branch_name || ''}</div>
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
        </PageContainer>
    );
};

export default MachineManagement;

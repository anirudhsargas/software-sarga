import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Briefcase, IndianRupee, User, Clock, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { serverToday, serverThisMonth } from '../services/serverTime';
import './EmployeeDetail.css';

const EmployeeDetail = () => {
    const { staffId } = useParams();
    const navigate = useNavigate();
    const [employee, setEmployee] = useState(null);
    const [workHistory, setWorkHistory] = useState([]);
    const [salaryInfo, setSalaryInfo] = useState(null);
    const [attendance, setAttendance] = useState([]);
    // Track if attendance is already marked today
    const [attendanceMarkedToday, setAttendanceMarkedToday] = useState(false);
    const [salaryCalculation, setSalaryCalculation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('work'); // work, attendance, salary
    const [showPaySalaryModal, setShowPaySalaryModal] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(serverThisMonth());
    const [attendanceError, setAttendanceError] = useState('');
    const [salaryCalculationError, setSalaryCalculationError] = useState('');
    // Attendance marking modal state
    const [showAttendanceModal, setShowAttendanceModal] = useState(false);
    const [attendanceForm, setAttendanceForm] = useState({
        status: 'Present',
        time: '09:00',
        notes: ''
    });
    const [attendanceSubmitError, setAttendanceSubmitError] = useState('');
    const [confirmDialog, setConfirmDialog] = useState({
        show: false,
        title: '',
        message: '',
        onConfirm: null,
        type: 'confirm' // 'confirm' or 'alert'
    });

    // Attendance marking submit handler
    const handleAttendanceSubmit = async (e) => {
        e.preventDefault();
        setAttendanceSubmitError('');
        try {
            // Only Admin can mark Holiday
            if (attendanceForm.status === 'Holiday' && !['Admin'].includes(auth.getUser()?.role)) {
                setAttendanceSubmitError('Only Admin can mark holidays.');
                return;
            }
            // Require time for Present/Half Day
            if ((attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day') && !attendanceForm.time) {
                setAttendanceSubmitError('Please enter time for Present/Half Day.');
                return;
            }
            // Only allowed roles can mark attendance
            const allowedRoles = ['Admin', 'Accountant', 'Front Office', 'front office'];
            if (!allowedRoles.includes(auth.getUser()?.role)) {
                setAttendanceSubmitError('Only Admin/Accountant/Front Office can record attendance');
                return;
            }
            const payload = {
                attendance_date: serverToday(),
                status: attendanceForm.status,
                notes: attendanceForm.notes,
                time: attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day' ? attendanceForm.time : undefined
            };
            await api.post(`/staff/${staffId}/attendance`, payload);
            setShowAttendanceModal(false);
            setAttendanceForm({ status: 'Present', time: '09:00', notes: '' });
            fetchAttendanceData();
        } catch (err) {
            setAttendanceSubmitError(err.response?.data?.message || 'Failed to mark attendance');
        }
    };
    const [salaryForm, setSalaryForm] = useState({
        payment_amount: '',
        payment_method: 'Cash',
        reference_number: '',
        notes: '',
        payment_date: serverToday()
    });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchEmployeeData();
        fetchAttendanceData();
        fetchSalaryCalculation();
    }, [staffId, currentMonth]);

    const fetchEmployeeData = async () => {
        try {
            setLoading(true);
            const [workRes, salaryRes] = await Promise.all([
                api.get(`/staff/${staffId}/work-history`),
                api.get(`/staff/${staffId}/salary-info`)
            ]);
            setWorkHistory(workRes.data);
            setSalaryInfo(salaryRes.data);
            setEmployee(salaryRes.data.staff);

            setSalaryForm(prev => ({
                ...prev,
                payment_date: serverToday(),
            }));
        } catch (err) {
            console.error('Error fetching employee data:', err);
            setError('Failed to fetch employee data: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    const fetchAttendanceData = async () => {
        try {
            setAttendanceError('');
            const response = await api.get(`/staff/${staffId}/attendance/${currentMonth}`);
            console.log('Attendance response:', response.data);
            setAttendance(response.data.attendance || []);
            // Check if attendance is already marked today
            const today = serverToday();
            const found = (response.data.attendance || []).find(a => a.attendance_date === today);
            setAttendanceMarkedToday(!!found);
        } catch (err) {
            console.error('Error fetching attendance:', err);
            setAttendanceError(`Failed to load attendance: ${err.response?.data?.message || err.message}`);
            setAttendance([]);
        }
    };

    const fetchSalaryCalculation = async () => {
        try {
            setSalaryCalculationError('');
            const response = await api.get(`/staff/${staffId}/salary-calculation/${currentMonth}`);
            console.log('Salary calculation response:', response.data);
            setSalaryCalculation(response.data);
        } catch (err) {
            console.error('Error calculating salary:', err);
            setSalaryCalculationError(`Failed to calculate salary: ${err.response?.data?.message || err.message}`);
            setSalaryCalculation(null);
        }
    };

    const handlePaySalary = async (e) => {
        e.preventDefault();
        if (!salaryForm.payment_amount || Number(salaryForm.payment_amount) <= 0) {
            setError('Payment amount must be greater than 0');
            return;
        }

        setConfirmDialog({
            show: true,
            title: 'Confirm Salary Payment',
            message: (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>Paying to</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 20 }}>{employee?.name}</div>

                    <div style={{
                        background: 'var(--bg-2)',
                        padding: '16px',
                        borderRadius: 16,
                        border: '1px solid var(--border)',
                        marginBottom: 24
                    }}>
                        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Amount</div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--accent)' }}>
                            ₹{Number(salaryForm.payment_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, textAlign: 'left' }}>
                        <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 2 }}>Method</div>
                            <div style={{ fontWeight: 600 }}>{salaryForm.payment_method}</div>
                        </div>
                        <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 2 }}>Date</div>
                            <div style={{ fontWeight: 600 }}>{new Date(salaryForm.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                        </div>
                    </div>
                </div>
            ),
            type: 'confirm',
            onConfirm: async () => {
                try {
                    setSubmitting(true);
                    const payload = {
                        base_salary: salaryInfo?.staff?.base_salary || 0,
                        bonus: 0,
                        deduction: 0,
                        payment_month: currentMonth + '-01',
                        ...salaryForm
                    };
                    await api.post(`/staff/${staffId}/pay-salary`, payload);
                    setShowPaySalaryModal(false);
                    fetchEmployeeData();
                    // Show success alert
                    setConfirmDialog({
                        show: true,
                        title: 'Payment Successful',
                        message: (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: 'var(--success)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Transaction Recorded</div>
                                <div style={{ fontSize: 13, color: 'var(--muted)' }}>The staff balance and payment history have been updated successfully.</div>
                            </div>
                        ),
                        type: 'alert'
                    });
                } catch (err) {
                    setError(err.response?.data?.message || 'Failed to record payment');
                } finally {
                    setSubmitting(false);
                }
            }
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="p-6">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-accent mb-6">
                    <ArrowLeft size={20} /> Back
                </button>
                {error ? (
                    <div className="text-center text-red-500">{error}</div>
                ) : (
                    <div className="text-center text-red-500">Employee not found</div>
                )}
            </div>
        );
    }

    const salaryTotal = (salaryInfo?.staff?.base_salary || 0);
    const pendingPayment = salaryTotal - (salaryInfo?.recentPayments?.reduce((sum, p) => sum + Number(p.payment_amount), 0) || 0);

    return (
        <div className="employee-detail">
            <div className="employee-detail__container">
                <button onClick={() => navigate(-1)} className="employee-detail__back">
                    <ArrowLeft size={18} /> Back to Staff
                </button>

                {error && (
                    <div className="employee-detail__alert">
                        <AlertCircle className="employee-detail__alert-icon" />
                        <p className="employee-detail__alert-text">{error}</p>
                    </div>
                )}

                <div className="employee-detail__card">
                    <div className="employee-detail__card-body">
                        <div className="employee-detail__avatar">
                            <User className="employee-detail__avatar-icon" />
                        </div>
                        <div>
                            <h1 className="employee-detail__name">{employee.name}</h1>
                            <p className="employee-detail__role">{employee.role}</p>
                            <p className="employee-detail__meta">User ID: {employee.user_id}</p>
                        </div>
                    </div>
                </div>

                <div className="employee-detail__tabs">
                    <button
                        onClick={() => setActiveTab('work')}
                        className={`employee-detail__tab ${activeTab === 'work' ? 'is-active' : ''}`}
                    >
                        <Briefcase className="employee-detail__tab-icon" />
                        Work History
                    </button>
                    <button
                        onClick={() => setActiveTab('attendance')}
                        className={`employee-detail__tab ${activeTab === 'attendance' ? 'is-active' : ''}`}
                    >
                        <Clock className="employee-detail__tab-icon" />
                        Attendance & Salary
                    </button>
                </div>

                <div className="employee-detail__panel">
                    {activeTab === 'work' && (
                        <div>
                            <h2 className="employee-detail__section-title">Assigned Jobs</h2>
                            {workHistory.length === 0 ? (
                                <div className="employee-detail__empty">
                                    <Briefcase className="employee-detail__empty-icon" />
                                    <p>No jobs assigned yet</p>
                                </div>
                            ) : (
                                <div className="employee-detail__list">
                                    {workHistory.map(job => (
                                        <div key={job.id} className="employee-detail__job-card">
                                            <div className="employee-detail__job-header">
                                                <h3>{job.job_name}</h3>
                                                <span className={`employee-detail__status ${job.status === 'Completed'
                                                    ? 'is-complete'
                                                    : job.status === 'Processing'
                                                        ? 'is-processing'
                                                        : 'is-pending'
                                                    }`}>
                                                    {job.status}
                                                </span>
                                            </div>
                                            <p className="employee-detail__job-meta">
                                                Job #{job.job_number} • {job.customer_name}
                                            </p>
                                            <div className="employee-detail__job-info">
                                                <span>₹{(parseFloat(job.total_amount) || 0).toFixed(2)}</span>
                                                <span>Qty: {job.quantity || 0}</span>
                                                {job.delivery_date && (
                                                    <span className="employee-detail__job-date">
                                                        <Clock size={14} />
                                                        {new Date(job.delivery_date).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'attendance' && (
                        <div>
                            <div className="employee-detail__section-header">
                                <h2 className="employee-detail__section-title">Attendance & Salary</h2>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                    <input
                                        type="month"
                                        value={currentMonth}
                                        onChange={(e) => setCurrentMonth(e.target.value)}
                                        className="employee-detail__month-selector"
                                    />
                                    {['Admin', 'Accountant', 'Front Office', 'front office'].includes(auth.getUser()?.role) && (
                                        (attendanceMarkedToday ?
                                            <button
                                                onClick={() => setShowAttendanceModal(true)}
                                                className="employee-detail__cta"
                                                style={{ padding: '6px 16px', background: auth.getUser()?.role === 'Admin' ? 'var(--warning)' : 'var(--accent-2)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                {auth.getUser()?.role === 'Admin' ? 'Update Attendance' : 'Request Change'}
                                            </button>
                                            : <button
                                                onClick={() => setShowAttendanceModal(true)}
                                                className="employee-detail__cta"
                                                style={{ padding: '6px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}
                                            >
                                                Mark Attendance
                                            </button>
                                        )
                                    )}
                                    {['Admin', 'Accountant', 'Front Office', 'front office'].includes(auth.getUser()?.role) && (
                                        <button
                                            onClick={() => setShowPaySalaryModal(true)}
                                            className="employee-detail__cta"
                                            style={{ padding: '6px 16px', background: 'var(--success)', color: '#fff' }}
                                        >
                                            <IndianRupee size={16} /> Pay Salary
                                        </button>
                                    )}
                                </div>
                            </div>
                            {/* Attendance Marking Modal */}
                            {showAttendanceModal && (
                                <div className="employee-detail__modal">
                                    <div className="employee-detail__modal-card" style={{ background: 'var(--surface, #fff)', borderRadius: 12, boxShadow: '0 4px 24px #0001', padding: 24, minWidth: 320 }}>
                                        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent, var(--accent))', marginBottom: 16 }}>Attendance Change</h3>
                                        {attendanceMarkedToday ? (
                                            auth.getUser()?.role === 'Admin' ? (
                                                <form onSubmit={handleAttendanceSubmit}>
                                                    <div style={{ marginBottom: 16 }}>
                                                        <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Status</label>
                                                        <select
                                                            value={attendanceForm.status}
                                                            onChange={e => setAttendanceForm(f => ({ ...f, status: e.target.value, time: '' }))}
                                                            className="employee-detail__input"
                                                            style={{ width: '100%', marginTop: 4 }}
                                                        >
                                                            <option>Present</option>
                                                            <option>Absent</option>
                                                            <option>Half Day</option>
                                                        </select>
                                                    </div>
                                                    {(attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day') && (
                                                        <div style={{ marginBottom: 16 }}>
                                                            <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Time</label>
                                                            <input
                                                                type="time"
                                                                value={attendanceForm.time}
                                                                onChange={e => setAttendanceForm(f => ({ ...f, time: e.target.value }))}
                                                                className="employee-detail__input"
                                                                style={{ width: '100%', marginTop: 4 }}
                                                                required
                                                            />
                                                        </div>
                                                    )}
                                                    <div style={{ marginBottom: 16 }}>
                                                        <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Notes</label>
                                                        <textarea
                                                            value={attendanceForm.notes}
                                                            onChange={e => setAttendanceForm(f => ({ ...f, notes: e.target.value }))}
                                                            className="employee-detail__textarea"
                                                            style={{ width: '100%', marginTop: 4 }}
                                                        />
                                                    </div>
                                                    {attendanceSubmitError && <div style={{ color: 'var(--error)', margin: '8px 0', fontSize: 13 }}>{attendanceSubmitError}</div>}
                                                    <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                                                        <button type="button" className="employee-detail__btn is-ghost" onClick={() => setShowAttendanceModal(false)} style={{ minWidth: 80 }}>Cancel</button>
                                                        <button type="submit" className="employee-detail__btn is-primary" style={{ background: 'var(--accent, var(--accent))', color: '#fff', minWidth: 80 }}>Save</button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <form onSubmit={async (e) => {
                                                    e.preventDefault();
                                                    setAttendanceSubmitError('');
                                                    try {
                                                        // Send request to admin for change
                                                        await api.post(`/staff/${staffId}/attendance-change-request`, {
                                                            attendance_date: serverToday(),
                                                            requested_status: attendanceForm.status,
                                                            requested_time: attendanceForm.time,
                                                            requested_notes: attendanceForm.notes,
                                                            requested_by: auth.getUser()?.user_id,
                                                        });
                                                        setShowAttendanceModal(false);
                                                        setAttendanceForm({ status: 'Present', time: '09:00', notes: '' });
                                                        setConfirmDialog({
                                                            show: true,
                                                            title: 'Request Submitted',
                                                            message: (
                                                                <div style={{ textAlign: 'center' }}>
                                                                    <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Sent to Admin</div>
                                                                    <div style={{ fontSize: 13, color: 'var(--muted)' }}>Your attendance change request has been sent for review.</div>
                                                                </div>
                                                            ),
                                                            type: 'alert'
                                                        });
                                                    } catch (err) {
                                                        setAttendanceSubmitError(err.response?.data?.message || 'Failed to send request');
                                                    }
                                                }}>
                                                    <div style={{ marginBottom: 16 }}>
                                                        <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Requested Status</label>
                                                        <select
                                                            value={attendanceForm.status}
                                                            onChange={e => setAttendanceForm(f => ({ ...f, status: e.target.value, time: '' }))}
                                                            className="employee-detail__input"
                                                            style={{ width: '100%', marginTop: 4 }}
                                                        >
                                                            <option>Present</option>
                                                            <option>Absent</option>
                                                            <option>Half Day</option>
                                                        </select>
                                                    </div>
                                                    {(attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day') && (
                                                        <div style={{ marginBottom: 16 }}>
                                                            <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Requested Time</label>
                                                            <input
                                                                type="time"
                                                                value={attendanceForm.time}
                                                                onChange={e => setAttendanceForm(f => ({ ...f, time: e.target.value }))}
                                                                className="employee-detail__input"
                                                                style={{ width: '100%', marginTop: 4 }}
                                                                required
                                                            />
                                                        </div>
                                                    )}
                                                    <div style={{ marginBottom: 16 }}>
                                                        <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Notes</label>
                                                        <textarea
                                                            value={attendanceForm.notes}
                                                            onChange={e => setAttendanceForm(f => ({ ...f, notes: e.target.value }))}
                                                            className="employee-detail__textarea"
                                                            style={{ width: '100%', marginTop: 4 }}
                                                        />
                                                    </div>
                                                    {attendanceSubmitError && <div style={{ color: 'var(--error)', margin: '8px 0', fontSize: 13 }}>{attendanceSubmitError}</div>}
                                                    <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                                                        <button type="button" className="employee-detail__btn is-ghost" onClick={() => setShowAttendanceModal(false)} style={{ minWidth: 80 }}>Cancel</button>
                                                        <button type="submit" className="employee-detail__btn is-primary" style={{ background: 'var(--accent, var(--accent))', color: '#fff', minWidth: 80 }}>Request Change</button>
                                                    </div>
                                                </form>
                                            )
                                        ) : (
                                            <form onSubmit={handleAttendanceSubmit}>
                                                <div style={{ marginBottom: 16 }}>
                                                    <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Status</label>
                                                    <select
                                                        value={attendanceForm.status}
                                                        onChange={e => setAttendanceForm(f => ({ ...f, status: e.target.value, time: '' }))}
                                                        className="employee-detail__input"
                                                        style={{ width: '100%', marginTop: 4 }}
                                                    >
                                                        <option>Present</option>
                                                        <option>Absent</option>
                                                        <option>Half Day</option>
                                                    </select>
                                                </div>
                                                {(attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day') && (
                                                    <div style={{ marginBottom: 16 }}>
                                                        <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Time</label>
                                                        <input
                                                            type="time"
                                                            value={attendanceForm.time}
                                                            onChange={e => setAttendanceForm(f => ({ ...f, time: e.target.value }))}
                                                            className="employee-detail__input"
                                                            style={{ width: '100%', marginTop: 4 }}
                                                            required
                                                        />
                                                    </div>
                                                )}
                                                <div style={{ marginBottom: 16 }}>
                                                    <label style={{ fontWeight: 600, color: 'var(--muted, var(--muted))' }}>Notes</label>
                                                    <textarea
                                                        value={attendanceForm.notes}
                                                        onChange={e => setAttendanceForm(f => ({ ...f, notes: e.target.value }))}
                                                        className="employee-detail__textarea"
                                                        style={{ width: '100%', marginTop: 4 }}
                                                    />
                                                </div>
                                                {attendanceSubmitError && <div style={{ color: 'var(--error)', margin: '8px 0', fontSize: 13 }}>{attendanceSubmitError}</div>}
                                                <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                                                    <button type="button" className="employee-detail__btn is-ghost" onClick={() => setShowAttendanceModal(false)} style={{ minWidth: 80 }}>Cancel</button>
                                                    <button type="submit" className="employee-detail__btn is-primary" style={{ background: 'var(--accent, var(--accent))', color: '#fff', minWidth: 80 }}>Save</button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                </div>

                            )}
                            {attendanceError && (
                                <div style={{ background: '#fee', padding: '12px', borderRadius: '4px', marginBottom: '16px', color: '#c33', fontSize: '13px' }}>
                                    {attendanceError}
                                </div>
                            )}

                            {salaryCalculationError && (
                                <div style={{ background: '#fee', padding: '12px', borderRadius: '4px', marginBottom: '16px', color: '#c33', fontSize: '13px' }}>
                                    {salaryCalculationError}
                                </div>
                            )}

                            {!salaryCalculation && !salaryCalculationError ? (
                                <div className="employee-detail__empty" style={{ background: '#f5f5f5', padding: '24px', borderRadius: '6px', textAlign: 'center' }}>
                                    <Clock className="employee-detail__empty-icon" />
                                    <p>Loading attendance data for {currentMonth}...</p>
                                </div>
                            ) : null}

                            {salaryCalculation && (
                                <React.Fragment>
                                    {/* Summary Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 }}>
                                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--success)18', border: '1px solid var(--success)30' }}>
                                            <div style={{ fontSize: 10, color: 'var(--success)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Present</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{salaryCalculation.attendance?.present || 0}</div>
                                        </div>
                                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--error)18', border: '1px solid var(--error)30' }}>
                                            <div style={{ fontSize: 10, color: 'var(--error)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Absent</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--error)' }}>{(salaryCalculation.attendance?.absent || 0) + (salaryCalculation.attendance?.leave || 0)}</div>
                                        </div>
                                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--warning)18', border: '1px solid var(--warning)30' }}>
                                            <div style={{ fontSize: 10, color: 'var(--warning)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Half Day</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{attendance?.filter(a => a.status === 'Half Day').length || 0}</div>
                                        </div>
                                        <div style={{ padding: 14, borderRadius: 10, background: 'var(--accent)18', border: '1px solid var(--accent)30' }}>
                                            <div style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Holiday</div>
                                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{salaryCalculation.attendance?.holiday || 0}</div>
                                        </div>
                                        <div style={{ padding: 14, borderRadius: 10, background: 'linear-gradient(135deg, var(--success), var(--success))', color: '#fff' }}>
                                            <div style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', opacity: 0.85 }}>Calculated Salary</div>
                                            <div style={{ fontSize: 22, fontWeight: 800 }}>₹{Number(salaryCalculation.calculation?.calculatedSalary || 0).toLocaleString('en-IN')}</div>
                                        </div>
                                    </div>

                                    {/* Calendar Grid */}
                                    {(() => {
                                        const [y, m] = currentMonth.split('-').map(Number);
                                        const firstDay = new Date(y, m - 1, 1).getDay();
                                        const daysInMonth = new Date(y, m, 0).getDate();
                                        const today = new Date();
                                        const attMap = {};
                                        (attendance || []).forEach(a => { attMap[new Date(a.attendance_date).getDate()] = a.status; });
                                        const statusCfg = {
                                            Present: { color: 'var(--success)', bg: 'var(--success)18', label: 'P' },
                                            Absent: { color: 'var(--error)', bg: 'var(--error)18', label: 'A' },
                                            'Half Day': { color: 'var(--warning)', bg: 'var(--warning)18', label: '½' },
                                            Holiday: { color: 'var(--accent)', bg: 'var(--accent)18', label: 'H' },
                                            Leave: { color: 'var(--error)', bg: 'var(--error)18', label: 'A' },
                                        };
                                        const cells = [];
                                        for (let i = 0; i < firstDay; i++) cells.push(null);
                                        for (let d = 1; d <= daysInMonth; d++) {
                                            const date = new Date(y, m - 1, d);
                                            cells.push({ day: d, status: attMap[d] || null, isSunday: date.getDay() === 0, isToday: date.toDateString() === today.toDateString(), isFuture: date > today });
                                        }
                                        return (
                                            <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 20 }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
                                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                                        <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: d === 'Sun' ? 'var(--error)' : 'var(--muted)', padding: '3px 0', textTransform: 'uppercase' }}>{d}</div>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
                                                    {cells.map((cell, idx) => {
                                                        if (!cell) return <div key={`e-${idx}`} />;
                                                        const cfg = cell.status ? statusCfg[cell.status] : null;
                                                        return (
                                                            <div key={cell.day} style={{
                                                                aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                                                borderRadius: 6, fontSize: 12, fontWeight: cell.isToday ? 800 : 500,
                                                                background: cell.isToday ? 'linear-gradient(135deg, var(--accent), #818cf8)' : cfg?.bg || (cell.isSunday ? 'var(--error)10' : 'var(--bg, #ffffff08)'),
                                                                color: cell.isToday ? '#fff' : cell.isFuture ? 'var(--muted)' : cfg?.color || (cell.isSunday ? 'var(--error)' : 'inherit'),
                                                                border: cell.isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                                                                opacity: cell.isFuture ? 0.4 : 1
                                                            }} title={cell.status ? `${cell.day}: ${cell.status}` : `${cell.day}`}>
                                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{cell.day}</span>
                                                                {cfg && <span style={{ fontSize: 8, fontWeight: 700, marginTop: 1 }}>{cfg.label}</span>}
                                                                {cell.isSunday && !cfg && !cell.isFuture && <span style={{ fontSize: 7, fontWeight: 600, marginTop: 1, opacity: 0.7 }}>OFF</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                                                    {Object.entries({ Present: 'var(--success)18', Absent: 'var(--error)18', 'Half Day': 'var(--warning)18', Holiday: 'var(--accent)18' }).map(([k, bg]) => (
                                                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
                                                            <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: '1px solid #00000012' }} />
                                                            <span style={{ color: 'var(--muted)' }}>{k}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Salary Breakdown */}
                                    {salaryCalculation.calculation && (
                                        <div style={{ background: 'var(--surface, #fff)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 20 }}>
                                            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
                                                {salaryCalculation.staffType === 'Monthly' ? 'Monthly' : 'Daily'} Salary Breakdown
                                            </h3>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                {salaryCalculation.staffType === 'Monthly' ? (
                                                    <>
                                                        {[
                                                            ['Base Monthly', `₹${Number(salaryCalculation.calculation.baseMonthly || 0).toLocaleString('en-IN')}`],
                                                            ['Per Day Rate', `₹${Number(salaryCalculation.calculation.perDayRate || 0).toLocaleString('en-IN')}`],
                                                            ['Working Days', salaryCalculation.calculation.totalWorkingDays],
                                                            ['Days Worked', salaryCalculation.calculation.daysWorked],
                                                            ['Paid Leaves', salaryCalculation.calculation.paidLeaves],
                                                            ['Unpaid Leaves', salaryCalculation.calculation.unpaidLeaves],
                                                        ].map(([label, value], i) => (
                                                            <div key={i} style={{
                                                                display: 'flex', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6,
                                                                background: label === 'Unpaid Leaves' ? 'var(--error)15' : 'var(--bg, #ffffff08)',
                                                                border: label === 'Unpaid Leaves' ? '1px solid var(--error)30' : '1px solid var(--border)'
                                                            }}>
                                                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
                                                                <span style={{ fontSize: 13, fontWeight: 600, color: label === 'Unpaid Leaves' ? 'var(--error)' : 'inherit' }}>{value}</span>
                                                            </div>
                                                        ))}
                                                    </>
                                                ) : (
                                                    <>
                                                        {[
                                                            ['Daily Rate', `₹${Number(salaryCalculation.calculation.dailyRate || 0).toLocaleString('en-IN')}`],
                                                            ['Days Present', salaryCalculation.calculation.presentDays],
                                                            ['Total Records', salaryCalculation.calculation.totalDays],
                                                        ].map(([label, value], i) => (
                                                            <div key={i} style={{
                                                                display: 'flex', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6,
                                                                background: 'var(--bg, #ffffff08)', border: '1px solid var(--border)'
                                                            }}>
                                                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
                                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
                                                            </div>
                                                        ))}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Attendance Log Table */}
                                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 12px' }}>Attendance Log</h3>
                                    {attendance && attendance.length === 0 ? (
                                        <div className="employee-detail__empty">
                                            <Clock className="employee-detail__empty-icon" />
                                            <p>No attendance records for {currentMonth}</p>
                                        </div>
                                    ) : (
                                        <div className="table-scroll">
                                            <table className="table" style={{ fontSize: 13 }}>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Day</th>
                                                        <th>Status</th>
                                                        <th>Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attendance && attendance.map(record => {
                                                        const d = new Date(record.attendance_date);
                                                        const sCfg = {
                                                            Present: { bg: 'var(--success)18', color: 'var(--success)' },
                                                            Absent: { bg: 'var(--error)18', color: 'var(--error)' },
                                                            'Half Day': { bg: 'var(--warning)18', color: 'var(--warning)' },
                                                            Holiday: { bg: 'var(--accent)18', color: 'var(--accent)' },
                                                            Leave: { bg: 'var(--error)18', color: 'var(--error)' },
                                                        };
                                                        const sc = sCfg[record.status] || {};
                                                        return (
                                                            <tr key={record.id}>
                                                                <td>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                                                <td style={{ color: d.getDay() === 0 ? 'var(--error)' : 'inherit' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</td>
                                                                <td>
                                                                    <span style={{ padding: '2px 8px', borderRadius: 4, background: sc.bg || '#f3f4f6', color: sc.color || '#4b5563', fontSize: 11, fontWeight: 600 }}>
                                                                        {record.status === 'Leave' ? 'Absent' : record.status}
                                                                    </span>
                                                                </td>
                                                                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{record.notes || '—'}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Historic Salary Records */}
                                    <div style={{ marginTop: 32 }}>
                                        <h2 className="employee-detail__section-title">Historic Salary Records</h2>
                                        {salaryInfo?.currentMonthSalary && (
                                            <div className="employee-detail__status-card" style={{ marginBottom: 16 }}>
                                                <CheckCircle className="employee-detail__status-icon" />
                                                <div>
                                                    <p>
                                                        This month's salary: <strong>₹{Number(salaryInfo.currentMonthSalary.net_salary || 0).toFixed(2)}</strong>
                                                    </p>
                                                    <span>
                                                        Paid on {new Date(salaryInfo.currentMonthSalary.paid_date).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {salaryInfo?.salaryRecords.length === 0 ? (
                                            <div className="employee-detail__empty">
                                                <IndianRupee className="employee-detail__empty-icon" />
                                                <p>No salary records yet</p>
                                            </div>
                                        ) : (
                                            <div className="employee-detail__table-wrap">
                                                <table className="employee-detail__table" style={{ fontSize: 13 }}>
                                                    <thead>
                                                        <tr>
                                                            <th>Month</th>
                                                            <th className="is-right">Base</th>
                                                            <th className="is-right">Bonus</th>
                                                            <th className="is-right">Deduction</th>
                                                            <th className="is-right">Net</th>
                                                            <th>Status</th>
                                                            <th>Paid Date</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {salaryInfo?.salaryRecords.map(record => (
                                                            <tr key={record.id}>
                                                                <td>
                                                                    {new Date(record.payment_month).toLocaleDateString('en-IN', {
                                                                        month: 'short',
                                                                        year: 'numeric'
                                                                    })}
                                                                </td>
                                                                <td className="is-right">₹{Number(record.base_salary || 0).toFixed(2)}</td>
                                                                <td className="is-right is-positive">+₹{Number(record.bonus || 0).toFixed(2)}</td>
                                                                <td className="is-right is-negative">-₹{Number(record.deduction || 0).toFixed(2)}</td>
                                                                <td className="is-right is-strong">₹{Number(record.net_salary || 0).toFixed(2)}</td>
                                                                <td>
                                                                    <span className={`employee-detail__status ${record.status === 'Paid' ? 'is-complete' : record.status === 'Partial' ? 'is-processing' : 'is-pending'}`}>
                                                                        {record.status}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    {record.paid_date
                                                                        ? new Date(record.paid_date).toLocaleDateString()
                                                                        : '-'
                                                                    }
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    {/* Recent Payments Transaction Ledger */}
                                    {salaryInfo?.recentPayments && salaryInfo.recentPayments.length > 0 && (
                                        <div className="employee-detail__payments-section" style={{ marginTop: 32 }}>
                                            <div className="employee-detail__payments-head">
                                                <h3 className="employee-detail__payments-title">Recent Payment Transactions</h3>
                                            </div>
                                            <div className="employee-detail__payments-list">
                                                {salaryInfo.recentPayments.map(payment => (
                                                    <div key={payment.id} className="employee-detail__payment-card">
                                                        <div className="employee-detail__payment-date">
                                                            {new Date(payment.payment_date).toLocaleDateString('en-IN', {
                                                                month: 'short',
                                                                day: 'numeric',
                                                                year: 'numeric'
                                                            })}
                                                        </div>
                                                        <div className="employee-detail__payment-amount">
                                                            ₹{Number(payment.payment_amount).toFixed(2)}
                                                        </div>
                                                        <div className="employee-detail__payment-details">
                                                            <div>
                                                                <span className="employee-detail__payment-method">
                                                                    {payment.payment_method}
                                                                </span>
                                                            </div>
                                                            {payment.reference_number && (
                                                                <div><small>Ref: {payment.reference_number}</small></div>
                                                            )}
                                                            {payment.notes && (
                                                                <div><small>Note: {payment.notes}</small></div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showPaySalaryModal && (
                <div className="employee-detail__modal">
                    <div className="employee-detail__modal-card">
                        <h3>Pay Salary for {employee?.name}</h3>

                        <div className="employee-detail__salary-info">
                            <div className="employee-detail__info-group">
                                <label>Salary Type</label>
                                <span className="employee-detail__info-value">{salaryInfo?.staff?.salary_type || 'Not Set'}</span>
                            </div>
                            <div className="employee-detail__info-group">
                                <label>{salaryInfo?.staff?.salary_type === 'Daily' ? 'Daily Rate' : 'Base Salary'}</label>
                                <span className="employee-detail__info-value">₹{(salaryInfo?.staff?.salary_type === 'Daily' ? salaryInfo?.staff?.daily_rate : salaryInfo?.staff?.base_salary) || 0}</span>
                            </div>
                            <div className="employee-detail__info-group">
                                <label>Pending Payment</label>
                                <span className="employee-detail__info-value is-accent">₹{pendingPayment.toFixed(2)}</span>
                            </div>
                        </div>

                        <form onSubmit={handlePaySalary} className="employee-detail__form">
                            <div>
                                <label>Payment Amount *</label>
                                <div className="employee-detail__currency">
                                    <span>₹</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        placeholder="0.00"
                                        value={salaryForm.payment_amount}
                                        onChange={(e) => setSalaryForm(prev => ({ ...prev, payment_amount: e.target.value }))}
                                        className="employee-detail__input"
                                    />
                                </div>
                            </div>

                            <div>
                                <label>Payment Method</label>
                                <select
                                    value={salaryForm.payment_method}
                                    onChange={(e) => setSalaryForm(prev => ({ ...prev, payment_method: e.target.value }))}
                                    className="employee-detail__input"
                                >
                                    <option>Cash</option>
                                    <option>UPI</option>
                                    <option>Cheque</option>
                                    <option>Account Transfer</option>
                                </select>
                            </div>

                            {salaryForm.payment_method !== 'Cash' && (
                                <div>
                                    <label>Reference Number</label>
                                    <input
                                        type="text"
                                        placeholder="UTR, Cheque No., etc."
                                        value={salaryForm.reference_number}
                                        onChange={(e) => setSalaryForm(prev => ({ ...prev, reference_number: e.target.value }))}
                                        className="employee-detail__input"
                                    />
                                </div>
                            )}

                            <div>
                                <label>Notes</label>
                                <textarea
                                    rows="2"
                                    placeholder="Any additional notes..."
                                    value={salaryForm.notes}
                                    onChange={(e) => setSalaryForm(prev => ({ ...prev, notes: e.target.value }))}
                                    className="employee-detail__textarea"
                                />
                            </div>

                            <div className="employee-detail__actions">
                                <button
                                    type="button"
                                    onClick={() => setShowPaySalaryModal(false)}
                                    disabled={submitting}
                                    className="employee-detail__btn is-ghost"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="employee-detail__btn is-primary"
                                >
                                    {submitting && <Loader2 className="employee-detail__spinner" />}
                                    Pay Now
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {confirmDialog.show && (
                <div className="employee-detail__modal" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
                    <div className="employee-detail__modal-card" style={{
                        textAlign: 'center',
                        padding: '32px 24px',
                        borderRadius: 24,
                        maxWidth: 380,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 20,
                            background: confirmDialog.type === 'alert' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            display: 'grid', placeItems: 'center', margin: '0 auto 20px',
                            color: confirmDialog.type === 'alert' ? 'var(--accent)' : 'var(--warning)'
                        }}>
                            {confirmDialog.type === 'alert' ? <CheckCircle size={32} /> : <AlertCircle size={32} />}
                        </div>

                        <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: 'var(--text)' }}>
                            {confirmDialog.title}
                        </h3>

                        <div style={{
                            fontSize: 15,
                            lineHeight: 1.6,
                            color: 'var(--text-secondary)',
                            marginBottom: 32,
                            padding: '0 10px'
                        }}>
                            {confirmDialog.message}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: confirmDialog.type === 'confirm' ? '1fr 1.2fr' : '1fr', gap: 12 }}>
                            {confirmDialog.type === 'confirm' && (
                                <button
                                    className="employee-detail__btn"
                                    onClick={() => setConfirmDialog(prev => ({ ...prev, show: false }))}
                                    style={{
                                        background: 'var(--bg-2)',
                                        color: 'var(--text)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 12,
                                        height: 48,
                                        fontSize: 14,
                                        fontWeight: 600
                                    }}
                                >
                                    Cancel
                                </button>
                            )}
                            <button
                                className="employee-detail__btn"
                                onClick={() => {
                                    if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                                    setConfirmDialog(prev => ({ ...prev, show: false }));
                                }}
                                style={{
                                    background: confirmDialog.type === 'confirm' ? 'var(--accent)' : 'var(--success)',
                                    color: '#111827', // Dark text as requested
                                    borderRadius: 12,
                                    height: 48,
                                    padding: '0 20px',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                    cursor: 'pointer'
                                }}
                            >
                                {confirmDialog.type === 'confirm' ? 'Confirm Payment' : 'Got it'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EmployeeDetail;

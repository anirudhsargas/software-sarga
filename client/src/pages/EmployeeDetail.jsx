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
        time: '',
        notes: ''
    });
    const [attendanceSubmitError, setAttendanceSubmitError] = useState('');

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
            const payload = {
                attendance_date: serverToday(),
                status: attendanceForm.status,
                notes: attendanceForm.notes,
                time: attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day' ? attendanceForm.time : undefined
            };
            await api.post(`/staff/${staffId}/attendance`, payload, { headers: auth.getAuthHeader() });
            setShowAttendanceModal(false);
            setAttendanceForm({ status: 'Present', time: '', notes: '' });
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
                api.get(`/staff/${staffId}/work-history`, { headers: auth.getAuthHeader() }),
                api.get(`/staff/${staffId}/salary-info`, { headers: auth.getAuthHeader() })
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
            const response = await api.get(`/staff/${staffId}/attendance/${currentMonth}`, {
                headers: auth.getAuthHeader()
            });
            console.log('Attendance response:', response.data);
            setAttendance(response.data.attendance || []);
        } catch (err) {
            console.error('Error fetching attendance:', err);
            setAttendanceError(`Failed to load attendance: ${err.response?.data?.message || err.message}`);
            setAttendance([]);
        }
    };

    const fetchSalaryCalculation = async () => {
        try {
            setSalaryCalculationError('');
            const response = await api.get(`/staff/${staffId}/salary-calculation/${currentMonth}`, {
                headers: auth.getAuthHeader()
            });
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
        if (!window.confirm(`Pay ₹${Number(salaryForm.payment_amount).toFixed(2)} to ${employee?.name}?\nMethod: ${salaryForm.payment_method}\nDate: ${salaryForm.payment_date}`)) return;

        try {
            setSubmitting(true);
            const payload = {
                base_salary: salaryInfo?.staff?.base_salary || 0,
                bonus: 0,
                deduction: 0,
                payment_month: currentMonth + '-01',
                ...salaryForm
            };
            await api.post(`/staff/${staffId}/pay-salary`, payload, {
                headers: auth.getAuthHeader()
            });
            setShowPaySalaryModal(false);
            setSalaryForm(prev => ({ 
                ...prev, 
                payment_amount: '',
                reference_number: '', 
                notes: '',
                payment_date: serverToday()
            }));
            setError('');
            await fetchEmployeeData();
        } catch (err) {
            setError('Failed to record salary payment');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
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
                <div className="text-center text-red-500">Employee not found</div>
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
                        Attendance
                    </button>
                    <button
                        onClick={() => setActiveTab('salary')}
                        className={`employee-detail__tab ${activeTab === 'salary' ? 'is-active' : ''}`}
                    >
                        <IndianRupee className="employee-detail__tab-icon" />
                        Salary Management
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
                                                <span className={`employee-detail__status ${
                                                    job.status === 'Completed'
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
                            <div className="employee-detail__section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                <h2 className="employee-detail__section-title">Attendance & Salary Calculation</h2>
                                <button
                                    onClick={() => setShowAttendanceModal(true)}
                                    className="employee-detail__cta"
                                    style={{ padding: '6px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer' }}
                                >
                                    Mark Attendance
                                </button>
                            </div>
                            {/* Attendance Marking Modal */}
                            {showAttendanceModal && (
                                <div className="employee-detail__modal">
                                    <div className="employee-detail__modal-card" style={{ background: 'var(--surface, #fff)', borderRadius: 12, boxShadow: '0 4px 24px #0001', padding: 24, minWidth: 320 }}>
                                        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent, #6366f1)', marginBottom: 16 }}>Mark Attendance</h3>
                                        <form onSubmit={handleAttendanceSubmit}>
                                            <div style={{ marginBottom: 16 }}>
                                                <label style={{ fontWeight: 600, color: 'var(--muted, #6b7280)' }}>Status</label>
                                                <select
                                                    value={attendanceForm.status}
                                                    onChange={e => setAttendanceForm(f => ({ ...f, status: e.target.value, time: '' }))}
                                                    className="employee-detail__input"
                                                    style={{ width: '100%', marginTop: 4 }}
                                                >
                                                    <option>Present</option>
                                                    <option>Absent</option>
                                                    <option>Leave</option>
                                                    <option disabled={!['Admin'].includes(auth.getUser()?.role)}>Holiday</option>
                                                    <option>Half Day</option>
                                                </select>
                                            </div>
                                            {(attendanceForm.status === 'Present' || attendanceForm.status === 'Half Day') && (
                                                <div style={{ marginBottom: 16 }}>
                                                    <label style={{ fontWeight: 600, color: 'var(--muted, #6b7280)' }}>Time</label>
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
                                                <label style={{ fontWeight: 600, color: 'var(--muted, #6b7280)' }}>Notes</label>
                                                <textarea
                                                    value={attendanceForm.notes}
                                                    onChange={e => setAttendanceForm(f => ({ ...f, notes: e.target.value }))}
                                                    className="employee-detail__textarea"
                                                    style={{ width: '100%', marginTop: 4 }}
                                                />
                                            </div>
                                            {attendanceSubmitError && <div style={{ color: '#ef4444', margin: '8px 0', fontSize: 13 }}>{attendanceSubmitError}</div>}
                                            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                                                <button type="button" className="employee-detail__btn is-ghost" onClick={() => setShowAttendanceModal(false)} style={{ minWidth: 80 }}>Cancel</button>
                                                <button type="submit" className="employee-detail__btn is-primary" style={{ background: 'var(--accent, #6366f1)', color: '#fff', minWidth: 80 }}>Save</button>
                                            </div>
                                        </form>
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
                                    {salaryCalculation && (
                                        <div className="employee-detail__salary-info">
                                            <div className="employee-detail__info-group">
                                                <label>Staff Type</label>
                                                <span className="employee-detail__info-value">{salaryCalculation.staffType}</span>
                                            </div>
                                            <div className="employee-detail__info-group">
                                                <label>Attendance Summary</label>
                                                <span className="employee-detail__info-value">
                                                    P: {salaryCalculation.attendance?.present || 0} | A: {salaryCalculation.attendance?.absent || 0}  | L: {salaryCalculation.attendance?.leave || 0} | H: {salaryCalculation.attendance?.holiday || 0}
                                                </span>
                                            </div>
                                            <div className="employee-detail__info-group">
                                                <label>Calculated Salary</label>
                                                <span className="employee-detail__info-value is-accent">₹{Number(salaryCalculation.calculation?.calculatedSalary || 0).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    )}

                                    {salaryCalculation?.staffType === 'Monthly' && salaryCalculation.calculation && (
                                        <div className="employee-detail__status-card">
                                            <CheckCircle className="employee-detail__status-icon" />
                                            <div>
                                                <p>Monthly Salary Breakdown</p>
                                                <ul style={{ fontSize: '13px', marginTop: '8px' }}>
                                                    <li>Base Monthly: ₹{Number(salaryCalculation.calculation.baseMonthly || 0).toFixed(2)}</li>
                                                    <li>Per Day Rate: ₹{Number(salaryCalculation.calculation.perDayRate || 0).toFixed(2)}</li>
                                                    <li>Working Days: {salaryCalculation.calculation.totalWorkingDays}</li>
                                                    <li>Paid Leaves: {salaryCalculation.calculation.paidLeaves}</li>
                                                    <li>Unpaid Leaves: {salaryCalculation.calculation.unpaidLeaves} (deducted)</li>
                                                    <li>Days Worked: {salaryCalculation.calculation.daysWorked}</li>
                                                    <li><strong>Total Salary: ₹{Number(salaryCalculation.calculation.calculatedSalary || 0).toFixed(2)}</strong></li>
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    {salaryCalculation?.staffType === 'Daily' && salaryCalculation.calculation && (
                                        <div className="employee-detail__status-card">
                                            <CheckCircle className="employee-detail__status-icon" />
                                            <div>
                                                <p>Daily Wage Breakdown</p>
                                                <ul style={{ fontSize: '13px', marginTop: '8px' }}>
                                                    <li>Daily Rate: ₹{Number(salaryCalculation.calculation.dailyRate || 0).toFixed(2)}</li>
                                                    <li>Days Present: {salaryCalculation.calculation.presentDays}</li>
                                                    <li><strong>Total Salary: ₹{Number(salaryCalculation.calculation.calculatedSalary || 0).toFixed(2)}</strong></li>
                                                </ul>
                                            </div>
                                        </div>
                                    )}

                                    <h3 className="employee-detail__section-title" style={{ marginTop: '24px' }}>Attendance Details</h3>
                                    {attendance && attendance.length === 0 ? (
                                        <div className="employee-detail__empty">
                                            <Clock className="employee-detail__empty-icon" />
                                            <p>No attendance records for {currentMonth}</p>
                                        </div>
                                    ) : (
                                        <div className="employee-detail__table-wrap">
                                            <table className="employee-detail__table">
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>Day</th>
                                                        <th>Status</th>
                                                        <th>Notes</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {attendance && attendance.map(record => (
                                                        <tr key={record.id}>
                                                            <td>{new Date(record.attendance_date).toLocaleDateString()}</td>
                                                            <td>{new Date(record.attendance_date).toLocaleDateString('en-US', { weekday: 'short' })}</td>
                                                            <td>
                                                                <span className={`employee-detail__status ${
                                                                    record.status === 'Present' ? 'is-complete' :
                                                                    record.status === 'Holiday' ? 'is-pending' :
                                                                    record.status === 'Leave' ? 'is-processing' :
                                                                    'is-warning'
                                                                }`}>
                                                                    {record.status}
                                                                </span>
                                                            </td>
                                                            <td>{record.notes || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </React.Fragment>
                            )}
                        </div>
                    )}

                    {activeTab === 'salary' && (
                        <div>
                            <div className="employee-detail__section-head">
                                <h2 className="employee-detail__section-title">Salary Records</h2>
                                <button
                                    onClick={() => setShowPaySalaryModal(true)}
                                    className="employee-detail__cta"
                                >
                                    <IndianRupee size={16} /> Pay Salary
                                </button>
                            </div>

                            {salaryInfo?.currentMonthSalary && (
                                <div className="employee-detail__status-card">
                                    <CheckCircle className="employee-detail__status-icon" />
                                    <div>
                                        <p>
                                            This month's salary: <strong>₹{salaryInfo.currentMonthSalary.net_salary?.toFixed(2)}</strong>
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
                                    <table className="employee-detail__table">
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
                                                    <td className="is-right">₹{record.base_salary?.toFixed(2)}</td>
                                                    <td className="is-right is-positive">+₹{record.bonus?.toFixed(2)}</td>
                                                    <td className="is-right is-negative">-₹{record.deduction?.toFixed(2)}</td>
                                                    <td className="is-right is-strong">₹{record.net_salary?.toFixed(2)}</td>
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

                            {salaryInfo?.recentPayments && salaryInfo.recentPayments.length > 0 && (
                                <div className="employee-detail__payments-section">
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
                                <label>Payment Date *</label>
                                <input
                                    type="date"
                                    required
                                    value={salaryForm.payment_date}
                                    onChange={(e) => setSalaryForm(prev => ({ ...prev, payment_date: e.target.value }))}
                                    className="employee-detail__input"
                                />
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
        </div>
    );
};

export default EmployeeDetail;

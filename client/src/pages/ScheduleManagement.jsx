import { useSEO } from '../hooks/useSEO';
import React, {useEffect, useState} from 'react';
import { Clock, Calendar, AlertTriangle, Timer, Plus, Check, X, ChevronDown, Users, Edit2, Trash2 } from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import { serverThisMonth } from '../services/serverTime';
import PageContainer from '../components/ui/PageContainer';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ScheduleManagement = () => {
    useSEO('Schedule Management');

    const [activeTab, setActiveTab] = useState('schedules');
    const [month, setMonth] = useState(serverThisMonth());
    const [staffList, setStaffList] = useState([]);
    const [staffFilter, setStaffFilter] = useState('');

    // Schedule state
    const [schedules, setSchedules] = useState([]);
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [scheduleForm, setScheduleForm] = useState({
        staff_id: '', schedule_name: 'General Shift',
        shift_start: '09:00', shift_end: '18:00',
        break_minutes: 60, working_days: [1, 2, 3, 4, 5, 6],
        effective_from: new Date().toISOString().slice(0, 10), effective_to: ''
    });

    // Late time state
    const [lateData, setLateData] = useState({ records: [], summary: {} });

    // Overtime state
    const [overtimeData, setOvertimeData] = useState({ records: [], summary: {} });
    const [showOTForm, setShowOTForm] = useState(false);
    const [otForm, setOTForm] = useState({
        staff_id: '', overtime_date: new Date().toISOString().slice(0, 10),
        scheduled_end: '18:00', actual_end: '', overtime_minutes: 0,
        overtime_type: 'Weekday', notes: ''
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const user = auth.getUser();
    const isAdmin = ['Admin', 'Accountant'].includes(user?.role);

    // Fetch staff list
    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get('/staff');
                setStaffList(Array.isArray(data) ? data : (data.staff || []));
            } catch { /* ignore */ }
        })();
    }, []);

    // Fetch data based on active tab
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError('');
            try {
                if (activeTab === 'schedules') {
                    const params = new URLSearchParams();
                    if (staffFilter) params.append('staff_id', staffFilter);
                    const { data } = await api.get(`/schedules?${params}`);
                    setSchedules(Array.isArray(data) ? data : []);
                } else if (activeTab === 'latetime') {
                    const params = new URLSearchParams({ year_month: month });
                    if (staffFilter) params.append('staff_id', staffFilter);
                    const { data } = await api.get(`/schedules/latetime?${params}`);
                    setLateData(data || { records: [], summary: {} });
                } else if (activeTab === 'overtime') {
                    const params = new URLSearchParams({ year_month: month });
                    if (staffFilter) params.append('staff_id', staffFilter);
                    const { data } = await api.get(`/schedules/overtime?${params}`);
                    setOvertimeData(data || { records: [], summary: {} });
                }
            } catch (err) {
                setError(err.response?.data?.message || 'Failed to fetch data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [activeTab, month, staffFilter]);

    const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

    // Schedule CRUD
    const handleScheduleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const payload = {
                ...scheduleForm,
                working_days: scheduleForm.working_days.join(','),
                effective_to: scheduleForm.effective_to || null
            };
            if (editingSchedule) {
                await api.put(`/schedules/${editingSchedule.id}`, payload);
                flash('Schedule updated');
            } else {
                await api.post('/schedules', payload);
                flash('Schedule created');
            }
            setShowScheduleForm(false);
            setEditingSchedule(null);
            resetScheduleForm();
            // Refresh
            const { data } = await api.get('/schedules');
            setSchedules(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save schedule');
        }
    };

    const deleteSchedule = async (id) => {
        if (!window.confirm('Delete this schedule?')) return;
        try {
            await api.delete(`/schedules/${id}`);
            setSchedules(prev => prev.filter(s => s.id !== id));
            flash('Schedule deleted');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to delete schedule');
        }
    };

    const editSchedule = (sch) => {
        setEditingSchedule(sch);
        setScheduleForm({
            staff_id: sch.staff_id,
            schedule_name: sch.schedule_name,
            shift_start: sch.shift_start?.slice(0, 5) || '09:00',
            shift_end: sch.shift_end?.slice(0, 5) || '18:00',
            break_minutes: sch.break_minutes || 60,
            working_days: sch.working_days ? sch.working_days.split(',').map(Number) : [1, 2, 3, 4, 5, 6],
            effective_from: sch.effective_from?.slice(0, 10) || '',
            effective_to: sch.effective_to?.slice(0, 10) || ''
        });
        setShowScheduleForm(true);
    };

    const resetScheduleForm = () => {
        setScheduleForm({
            staff_id: '', schedule_name: 'General Shift',
            shift_start: '09:00', shift_end: '18:00',
            break_minutes: 60, working_days: [1, 2, 3, 4, 5, 6],
            effective_from: new Date().toISOString().slice(0, 10), effective_to: ''
        });
    };

    // Late time excuse
    const excuseLate = async (id, excused) => {
        try {
            await api.put(`/schedules/latetime/${id}/excuse`, { excused });
            setLateData(prev => ({
                ...prev,
                records: prev.records.map(r => r.id === id ? { ...r, excused: excused ? 1 : 0 } : r)
            }));
            flash(excused ? 'Late arrival excused' : 'Excuse removed');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update');
        }
    };

    // Overtime submission & approval
    const handleOTSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            await api.post('/schedules/overtime', otForm);
            flash('Overtime recorded');
            setShowOTForm(false);
            setOTForm({ staff_id: '', overtime_date: new Date().toISOString().slice(0, 10), scheduled_end: '18:00', actual_end: '', overtime_minutes: 0, overtime_type: 'Weekday', notes: '' });
            const params = new URLSearchParams({ year_month: month });
            if (staffFilter) params.append('staff_id', staffFilter);
            const { data } = await api.get(`/schedules/overtime?${params}`);
            setOvertimeData(data || { records: [], summary: {} });
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to save overtime');
        }
    };

    const approveOT = async (id, approved) => {
        try {
            await api.put(`/schedules/overtime/${id}/approve`, { approved });
            setOvertimeData(prev => ({
                ...prev,
                records: prev.records.map(r => r.id === id ? { ...r, approved: approved ? 1 : 0 } : r)
            }));
            flash(approved ? 'Overtime approved' : 'Approval removed');
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update');
        }
    };

    const toggleDay = (day) => {
        setScheduleForm(f => ({
            ...f,
            working_days: f.working_days.includes(day)
                ? f.working_days.filter(d => d !== day)
                : [...f.working_days, day].sort()
        }));
    };

    const fmtTime = (t) => t ? t.slice(0, 5) : '—';
    const fmtMin = (m) => {
        if (!m) return '0m';
        const h = Math.floor(m / 60);
        const min = m % 60;
        return h > 0 ? `${h}h ${min}m` : `${min}m`;
    };
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    // Styles
    const cardStyle = { background: 'var(--surface, #fff)', borderRadius: 12, border: '1px solid var(--border)', padding: 16, marginBottom: 16 };
    const statCard = (color) => ({
        padding: 14, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`,
        display: 'flex', flexDirection: 'column', gap: 2
    });
    const btnPrimary = { background: 'var(--accent)', color: 'var(--on-accent, #fff)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
    const btnGhost = { background: 'var(--bg-2, #f3f4f6)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 13 };
    const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg, #fff)', color: 'var(--text)', fontSize: 13 };
    const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 };
    const badgeStyle = (bg, color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: bg, color, fontSize: 11, fontWeight: 600 });

    return (
        <PageContainer>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Schedule & Time Tracking</h1>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--bg-2, #f3f4f6)', padding: 4, borderRadius: 10 }}>
                {[
                    { key: 'schedules', label: 'Schedules', icon: Calendar },
                    { key: 'latetime', label: 'Late Time', icon: AlertTriangle },
                    { key: 'overtime', label: 'Overtime', icon: Timer }
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px',
                        borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                        background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                        color: activeTab === tab.key ? 'var(--on-accent, #fff)' : 'var(--text-secondary, var(--muted))'
                    }}>
                        <tab.icon size={15} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 180 }}>
                    <option value="">All Staff</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                </select>
                {activeTab !== 'schedules' && (
                    <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
                )}
            </div>

            {/* Messages */}
            {error && <div style={{ background: 'var(--error)15', color: 'var(--error)', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}
            {success && <div style={{ background: 'var(--success)15', color: 'var(--success)', padding: '10px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{success}</div>}

            {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>}

            {/* ===== SCHEDULES TAB ===== */}
            {!loading && activeTab === 'schedules' && (
                <div>
                    {isAdmin && (
                        <div style={{ marginBottom: 16 }}>
                            <button onClick={() => { resetScheduleForm(); setEditingSchedule(null); setShowScheduleForm(!showScheduleForm); }} style={btnPrimary}>
                                <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                {showScheduleForm ? 'Cancel' : 'Assign Schedule'}
                            </button>
                        </div>
                    )}

                    {showScheduleForm && (
                        <div style={cardStyle}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
                                {editingSchedule ? 'Edit Schedule' : 'New Schedule'}
                            </h3>
                            <form onSubmit={handleScheduleSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Staff *</label>
                                        <select value={scheduleForm.staff_id} onChange={e => setScheduleForm(f => ({ ...f, staff_id: e.target.value }))} style={inputStyle} required>
                                            <option value="">Select staff</option>
                                            {staffList.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Schedule Name</label>
                                        <input value={scheduleForm.schedule_name} onChange={e => setScheduleForm(f => ({ ...f, schedule_name: e.target.value }))} style={inputStyle} placeholder="e.g. Morning Shift" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Shift Start *</label>
                                        <input type="time" value={scheduleForm.shift_start} onChange={e => setScheduleForm(f => ({ ...f, shift_start: e.target.value }))} style={inputStyle} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Shift End *</label>
                                        <input type="time" value={scheduleForm.shift_end} onChange={e => setScheduleForm(f => ({ ...f, shift_end: e.target.value }))} style={inputStyle} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Break (minutes)</label>
                                        <input type="number" value={scheduleForm.break_minutes} onChange={e => setScheduleForm(f => ({ ...f, break_minutes: parseInt(e.target.value) || 0 }))} style={inputStyle} min={0} max={120} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Effective From *</label>
                                        <input type="date" value={scheduleForm.effective_from} onChange={e => setScheduleForm(f => ({ ...f, effective_from: e.target.value }))} style={inputStyle} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Effective To</label>
                                        <input type="date" value={scheduleForm.effective_to} onChange={e => setScheduleForm(f => ({ ...f, effective_to: e.target.value }))} style={inputStyle} />
                                    </div>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <label style={labelStyle}>Working Days</label>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        {DAYS.map((name, idx) => (
                                            <button key={idx} type="button" onClick={() => toggleDay(idx)} style={{
                                                padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                                border: scheduleForm.working_days.includes(idx) ? '2px solid var(--accent)' : '1px solid var(--border)',
                                                background: scheduleForm.working_days.includes(idx) ? 'var(--accent)20' : 'var(--bg, #fff)',
                                                color: scheduleForm.working_days.includes(idx) ? 'var(--accent)' : 'var(--muted)'
                                            }}>
                                                {name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="submit" style={btnPrimary}>{editingSchedule ? 'Update' : 'Create'} Schedule</button>
                                    <button type="button" onClick={() => { setShowScheduleForm(false); setEditingSchedule(null); }} style={btnGhost}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Schedule List */}
                    {schedules.length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
                            <Calendar size={40} style={{ color: 'var(--muted)', marginBottom: 8 }} />
                            <p style={{ color: 'var(--muted)' }}>No schedules assigned yet</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: 12 }}>
                            {schedules.map(sch => (
                                <div key={sch.id} style={{ ...cardStyle, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: 200 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            <span style={{ fontWeight: 700, fontSize: 15 }}>{sch.staff_name}</span>
                                            <span style={badgeStyle(sch.is_active ? 'var(--success)18' : 'var(--muted)18', sch.is_active ? 'var(--success)' : 'var(--muted)')}>
                                                {sch.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 13, color: 'var(--text-secondary, var(--muted))', marginBottom: 4 }}>
                                            <strong>{sch.schedule_name}</strong> — {fmtTime(sch.shift_start)} to {fmtTime(sch.shift_end)}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                            Break: {sch.break_minutes}min • Days: {sch.working_days?.split(',').map(d => DAYS[+d]).join(', ')}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                                            From {fmtDate(sch.effective_from)}{sch.effective_to ? ` to ${fmtDate(sch.effective_to)}` : ' (ongoing)'}
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => editSchedule(sch)} style={{ ...btnGhost, padding: '6px 10px' }} title="Edit">
                                                <Edit2 size={14} />
                                            </button>
                                            {user?.role === 'Admin' && (
                                                <button onClick={() => deleteSchedule(sch.id)} style={{ ...btnGhost, padding: '6px 10px', borderColor: 'var(--error)30', color: 'var(--error)' }} title="Delete">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ===== LATE TIME TAB ===== */}
            {!loading && activeTab === 'latetime' && (
                <div>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <div style={statCard('var(--error)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--error)' }}>Total Late</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--error)' }}>{lateData.summary?.totalRecords || 0}</span>
                        </div>
                        <div style={statCard('var(--warning)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--warning)' }}>Total Minutes</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{fmtMin(lateData.summary?.totalLateMinutes)}</span>
                        </div>
                        <div style={statCard('var(--accent)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)' }}>Avg Late</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{fmtMin(lateData.summary?.avgLateMinutes)}</span>
                        </div>
                        <div style={statCard('var(--success)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)' }}>Excused</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{lateData.summary?.excusedCount || 0}</span>
                        </div>
                    </div>

                    {/* Late Records Table */}
                    {(lateData.records || []).length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
                            <AlertTriangle size={40} style={{ color: 'var(--muted)', marginBottom: 8 }} />
                            <p style={{ color: 'var(--muted)' }}>No late arrivals recorded for {month}</p>
                        </div>
                    ) : (
                        <div style={cardStyle}>
                            <div className="table-scroll">
                                <table className="table" style={{ fontSize: 13, width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Staff</th>
                                            <th>Scheduled</th>
                                            <th>Actual</th>
                                            <th>Late By</th>
                                            <th>Status</th>
                                            <th>Reason</th>
                                            {isAdmin && <th>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lateData.records.map(r => (
                                            <tr key={r.id}>
                                                <td>{fmtDate(r.attendance_date)}</td>
                                                <td style={{ fontWeight: 600 }}>{r.staff_name}</td>
                                                <td>{fmtTime(r.scheduled_start)}</td>
                                                <td style={{ color: 'var(--error)', fontWeight: 600 }}>{fmtTime(r.actual_start)}</td>
                                                <td>
                                                    <span style={badgeStyle(
                                                        r.late_minutes > 30 ? 'var(--error)18' : 'var(--warning)18',
                                                        r.late_minutes > 30 ? 'var(--error)' : 'var(--warning)'
                                                    )}>
                                                        {fmtMin(r.late_minutes)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={badgeStyle(
                                                        r.excused ? 'var(--success)18' : 'var(--error)18',
                                                        r.excused ? 'var(--success)' : 'var(--error)'
                                                    )}>
                                                        {r.excused ? 'Excused' : 'Unexcused'}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reason || '—'}</td>
                                                {isAdmin && (
                                                    <td>
                                                        <button
                                                            onClick={() => excuseLate(r.id, !r.excused)}
                                                            style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }}
                                                        >
                                                            {r.excused ? 'Unexcuse' : 'Excuse'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===== OVERTIME TAB ===== */}
            {!loading && activeTab === 'overtime' && (
                <div>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                        <div style={statCard('var(--accent)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)' }}>Total OT</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)' }}>{overtimeData.summary?.totalRecords || 0}</span>
                        </div>
                        <div style={statCard('var(--warning)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--warning)' }}>Total Hours</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--warning)' }}>{overtimeData.summary?.totalOTHours || 0}h</span>
                        </div>
                        <div style={statCard('var(--success)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)' }}>Approved</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>{overtimeData.summary?.approvedHours || 0}h</span>
                        </div>
                        <div style={statCard('var(--error)')}>
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--error)' }}>Pending</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--error)' }}>{overtimeData.summary?.pendingCount || 0}</span>
                        </div>
                    </div>

                    {isAdmin && (
                        <div style={{ marginBottom: 16 }}>
                            <button onClick={() => setShowOTForm(!showOTForm)} style={btnPrimary}>
                                <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                {showOTForm ? 'Cancel' : 'Add Overtime'}
                            </button>
                        </div>
                    )}

                    {showOTForm && (
                        <div style={cardStyle}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Record Overtime</h3>
                            <form onSubmit={handleOTSubmit}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }}>
                                    <div>
                                        <label style={labelStyle}>Staff *</label>
                                        <select value={otForm.staff_id} onChange={e => setOTForm(f => ({ ...f, staff_id: e.target.value }))} style={inputStyle} required>
                                            <option value="">Select staff</option>
                                            {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Date *</label>
                                        <input type="date" value={otForm.overtime_date} onChange={e => setOTForm(f => ({ ...f, overtime_date: e.target.value }))} style={inputStyle} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Scheduled End</label>
                                        <input type="time" value={otForm.scheduled_end} onChange={e => setOTForm(f => ({ ...f, scheduled_end: e.target.value }))} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Actual End</label>
                                        <input type="time" value={otForm.actual_end} onChange={e => setOTForm(f => ({ ...f, actual_end: e.target.value }))} style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>OT Minutes *</label>
                                        <input type="number" value={otForm.overtime_minutes} onChange={e => setOTForm(f => ({ ...f, overtime_minutes: parseInt(e.target.value) || 0 }))} style={inputStyle} min={1} required />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Type</label>
                                        <select value={otForm.overtime_type} onChange={e => setOTForm(f => ({ ...f, overtime_type: e.target.value }))} style={inputStyle}>
                                            <option>Weekday</option>
                                            <option>Weekend</option>
                                            <option>Holiday</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ marginBottom: 12 }}>
                                    <label style={labelStyle}>Notes</label>
                                    <textarea value={otForm.notes} onChange={e => setOTForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="submit" style={btnPrimary}>Save Overtime</button>
                                    <button type="button" onClick={() => setShowOTForm(false)} style={btnGhost}>Cancel</button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Overtime Records Table */}
                    {(overtimeData.records || []).length === 0 ? (
                        <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
                            <Timer size={40} style={{ color: 'var(--muted)', marginBottom: 8 }} />
                            <p style={{ color: 'var(--muted)' }}>No overtime records for {month}</p>
                        </div>
                    ) : (
                        <div style={cardStyle}>
                            <div className="table-scroll">
                                <table className="table" style={{ fontSize: 13, width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>Date</th>
                                            <th>Staff</th>
                                            <th>Scheduled End</th>
                                            <th>Actual End</th>
                                            <th>OT Duration</th>
                                            <th>Type</th>
                                            <th>Status</th>
                                            <th>Notes</th>
                                            {isAdmin && <th>Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {overtimeData.records.map(r => (
                                            <tr key={r.id}>
                                                <td>{fmtDate(r.overtime_date)}</td>
                                                <td style={{ fontWeight: 600 }}>{r.staff_name}</td>
                                                <td>{fmtTime(r.scheduled_end)}</td>
                                                <td style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmtTime(r.actual_end)}</td>
                                                <td>
                                                    <span style={badgeStyle('var(--accent)18', 'var(--accent)')}>
                                                        {fmtMin(r.overtime_minutes)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={badgeStyle(
                                                        r.overtime_type === 'Weekend' ? 'var(--warning)18' : r.overtime_type === 'Holiday' ? 'var(--error)18' : 'var(--accent)18',
                                                        r.overtime_type === 'Weekend' ? 'var(--warning)' : r.overtime_type === 'Holiday' ? 'var(--error)' : 'var(--accent)'
                                                    )}>
                                                        {r.overtime_type}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={badgeStyle(
                                                        r.approved ? 'var(--success)18' : 'var(--warning)18',
                                                        r.approved ? 'var(--success)' : 'var(--warning)'
                                                    )}>
                                                        {r.approved ? 'Approved' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--muted)', fontSize: 12, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.notes || '—'}</td>
                                                {isAdmin && (
                                                    <td>
                                                        <button
                                                            onClick={() => approveOT(r.id, !r.approved)}
                                                            style={{
                                                                ...btnGhost, padding: '4px 10px', fontSize: 11,
                                                                borderColor: r.approved ? 'var(--error)30' : 'var(--success)30',
                                                                color: r.approved ? 'var(--error)' : 'var(--success)'
                                                            }}
                                                        >
                                                            {r.approved ? 'Revoke' : 'Approve'}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </PageContainer>
    );
};

export default ScheduleManagement;

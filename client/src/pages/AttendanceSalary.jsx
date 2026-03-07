import React, { useEffect, useState, useMemo } from 'react';
import api from '../services/api';
import auth from '../services/auth';
import { Calendar, IndianRupee, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, Sun } from 'lucide-react';

const statusConfig = {
  Present: { color: 'var(--success)', bg: 'var(--success)18', label: 'P' },
  Absent: { color: 'var(--error)', bg: 'var(--error)18', label: 'A' },
  'Half Day': { color: 'var(--warning)', bg: 'var(--warning)18', label: '½' },
  Holiday: { color: 'var(--accent)', bg: 'var(--accent)18', label: 'H' },
};

const AttendanceSalary = () => {
  const user = auth.getUser();
  const staffId = user?.id;

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [attendance, setAttendance] = useState([]);
  const [summary, setSummary] = useState(null);
  const [salaryInfo, setSalaryInfo] = useState(null);
  const [salaryCalc, setSalaryCalc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    if (!staffId) return;
    setLoading(true);
    setError(null);
    try {
      const [attRes, salRes, calcRes] = await Promise.allSettled([
        api.get(`/staff/${staffId}/attendance/${selectedMonth}`),
        api.get(`/staff/${staffId}/salary-info`),
        api.get(`/staff/${staffId}/salary-calculation/${selectedMonth}`),
      ]);

      if (attRes.status === 'fulfilled') {
        setAttendance(attRes.value.data?.attendance || []);
        setSummary(attRes.value.data?.summary || null);
      }
      if (salRes.status === 'fulfilled') {
        setSalaryInfo(salRes.value.data || null);
      }
      if (calcRes.status === 'fulfilled') {
        setSalaryCalc(calcRes.value.data || null);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [staffId, selectedMonth]);

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-');
    return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const changeMonth = (delta) => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const calendarDays = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = new Date();
    const attMap = {};
    attendance.forEach(a => { attMap[new Date(a.attendance_date).getDate()] = a.status; });
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      days.push({ day: d, status: attMap[d] || null, isSunday: date.getDay() === 0, isToday: date.toDateString() === today.toDateString(), isFuture: date > today });
    }
    return days;
  }, [selectedMonth, attendance]);

  const fmt = (val) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
  const halfDays = summary?.halfDay || attendance.filter(a => a.status === 'Half Day').length || 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          Loading your details...
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Attendance & Salary</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>View your attendance records and salary details</p>
      </div>

      {error && <div className="alert alert--error mb-16">{error}</div>}

      {/* Salary Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 16, borderRadius: 12, background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)', color: '#fff' }}>
          <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Salary Type</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{salaryInfo?.staff?.salary_type || 'Not Set'}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            {salaryInfo?.staff?.salary_type === 'Monthly' ? `Base: ${fmt(salaryInfo?.staff?.base_salary)}/mo`
              : salaryInfo?.staff?.salary_type === 'Daily' ? `Rate: ${fmt(salaryInfo?.staff?.daily_rate)}/day` : 'Contact Admin'}
          </div>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: 'linear-gradient(135deg, var(--success) 0%, var(--success) 100%)', color: '#fff' }}>
          <div style={{ fontSize: 11, opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>This Month Salary</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {salaryCalc?.calculation?.calculatedSalary != null ? fmt(salaryCalc.calculation.calculatedSalary) : '—'}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            {salaryCalc?.staffType === 'Monthly' ? `${salaryCalc?.calculation?.daysWorked || 0} / ${salaryCalc?.calculation?.totalWorkingDays || 26} days`
              : salaryCalc?.staffType === 'Daily' ? `${salaryCalc?.calculation?.presentDays || 0} days worked` : ''}
          </div>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: 'var(--success)18', border: '1px solid var(--success)30' }}>
          <div style={{ fontSize: 11, color: 'var(--success)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>Days Present</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--success)' }}>{summary?.present || 0}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{halfDays > 0 ? `+ ${halfDays} half days` : 'this month'}</div>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: 'var(--error)18', border: '1px solid var(--error)30' }}>
          <div style={{ fontSize: 11, color: 'var(--error)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 4 }}>Absent</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--error)' }}>{(summary?.absent || 0) + (summary?.leave || 0)}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{summary?.holiday > 0 ? `${summary.holiday} holidays` : 'this month'}</div>
        </div>
      </div>

      {/* Month Navigator + Calendar */}
      <div style={{ background: 'var(--surface, #1e1e2e)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="btn btn-ghost" onClick={() => changeMonth(-1)} style={{ padding: '6px 10px' }}><ChevronLeft size={18} /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>{monthLabel}</span>
          </div>
          <button className="btn btn-ghost" onClick={() => changeMonth(1)} style={{ padding: '6px 10px' }}><ChevronRight size={18} /></button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: d === 'Sun' ? 'var(--error)' : 'var(--muted)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {calendarDays.map((cell, idx) => {
            if (!cell) return <div key={`empty-${idx}`} />;
            const config = cell.status ? statusConfig[cell.status] : null;
            return (
              <div key={cell.day} style={{
                aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, fontSize: 13, fontWeight: cell.isToday ? 800 : 500,
                background: cell.isToday ? 'linear-gradient(135deg, var(--accent), #818cf8)'
                  : config?.bg || (cell.isSunday ? 'var(--error)10' : 'var(--bg, #ffffff08)'),
                color: cell.isToday ? '#fff' : cell.isFuture ? 'var(--muted)' : config?.color || (cell.isSunday ? 'var(--error)' : 'inherit'),
                border: cell.isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                opacity: cell.isFuture ? 0.4 : 1,
                transition: 'all 0.15s ease'
              }} title={cell.status ? `${cell.day}: ${cell.status}` : `${cell.day}`}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{cell.day}</span>
                {config && <span style={{ fontSize: 9, fontWeight: 700, marginTop: 1 }}>{config.label}</span>}
                {cell.isSunday && !config && !cell.isFuture && <span style={{ fontSize: 8, fontWeight: 600, marginTop: 1, opacity: 0.7 }}>OFF</span>}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {Object.entries(statusConfig).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 12, height: 12, borderRadius: 3, background: val.bg, border: `1px solid ${val.color}40` }} />
              <span style={{ color: 'var(--muted)' }}>{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Attendance Details Table */}
      {attendance.length > 0 && (
        <div style={{ background: 'var(--surface, #1e1e2e)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Attendance Log</h3>
          <div className="table-scroll">
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Date</th><th>Day</th><th>Status</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {attendance.map((a, i) => {
                  const d = new Date(a.attendance_date);
                  const config = statusConfig[a.status] || {};
                  return (
                    <tr key={i}>
                      <td>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ color: d.getDay() === 0 ? 'var(--error)' : 'inherit' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: config.bg || '#ffffff10', color: config.color || 'inherit', fontSize: 11, fontWeight: 600 }}>
                          {a.status}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{a.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Salary Calculation Breakdown */}
      {salaryCalc?.calculation && (
        <div style={{ background: 'var(--surface, #1e1e2e)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <IndianRupee size={16} /> Salary Breakdown — {monthLabel}
          </h3>
          <div className="salary-breakdown-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {salaryCalc.staffType === 'Monthly' ? (
              <>
                <InfoRow label="Base Monthly" value={fmt(salaryCalc.calculation.baseMonthly)} />
                <InfoRow label="Per Day Rate" value={fmt(salaryCalc.calculation.perDayRate)} />
                <InfoRow label="Working Days" value={salaryCalc.calculation.totalWorkingDays} />
                <InfoRow label="Days Worked" value={salaryCalc.calculation.daysWorked} />
                <InfoRow label="Paid Leaves" value={salaryCalc.calculation.paidLeaves} />
                <InfoRow label="Unpaid Leaves" value={salaryCalc.calculation.unpaidLeaves} highlight />
              </>
            ) : (
              <>
                <InfoRow label="Daily Rate" value={fmt(salaryCalc.calculation.dailyRate)} />
                <InfoRow label="Days Present" value={salaryCalc.calculation.presentDays} />
                <InfoRow label="Total Records" value={salaryCalc.calculation.totalDays} />
              </>
            )}
          </div>
          <div style={{
            marginTop: 16, padding: 16, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--success) 0%, var(--success) 100%)',
            color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Calculated Salary</span>
            <span style={{ fontSize: 22, fontWeight: 800 }}>{fmt(salaryCalc.calculation.calculatedSalary)}</span>
          </div>
        </div>
      )}

      {/* Recent Salary Payments */}
      {salaryInfo?.recentPayments?.length > 0 && (
        <div style={{ background: 'var(--surface, #1e1e2e)', borderRadius: 12, border: '1px solid var(--border)', padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Recent Salary Payments</h3>
          <div className="table-scroll">
            <table className="table" style={{ fontSize: 13 }}>
              <thead>
                <tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {salaryInfo.recentPayments.map((p, i) => (
                  <tr key={i}>
                    <td>{new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>{fmt(p.payment_amount)}</td>
                    <td>{p.payment_method || '—'}</td>
                    <td style={{ fontSize: 11 }}>{p.reference_number || '—'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow = ({ label, value, highlight }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 12px', borderRadius: 6,
    background: highlight ? 'var(--error)15' : 'var(--bg, #ffffff08)',
    border: highlight ? '1px solid var(--error)30' : '1px solid var(--border)'
  }}>
    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
    <span style={{ fontSize: 14, fontWeight: 600, color: highlight ? 'var(--error)' : 'inherit' }}>{value}</span>
  </div>
);

export default AttendanceSalary;

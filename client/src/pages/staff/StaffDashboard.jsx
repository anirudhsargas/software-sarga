import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import auth from '../../services/auth';
import { useSEO } from '../../hooks/useSEO';
import {
  CheckCircle, Clock, CalendarX, User, Activity, ChevronLeft, ChevronRight,
  IndianRupee, Calendar, Download, AlertCircle, Loader2, ArrowLeft, ArrowRight
} from 'lucide-react';
import PageContainer from '../../components/ui/PageContainer';

const PAGE_SIZE = 10;

const statusCfg = {
  Present: { color: 'var(--success)', bg: 'var(--success)18', label: 'Present' },
  Absent: { color: 'var(--error)', bg: 'var(--error)18', label: 'Absent' },
  'Half Day': { color: 'var(--warning)', bg: 'var(--warning)18', label: 'Half Day' },
  Leave: { color: 'var(--accent)', bg: 'var(--accent)18', label: 'Leave' },
  Holiday: { color: 'var(--primary)', bg: 'var(--primary)18', label: 'Holiday' },
};

const StaffDashboard = () => {
  useSEO('Staff Portal - Overview');
  const user = auth.getUser();
  const staffId = user?.id;

  const now = new Date();
  const [attMonth, setAttMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const [attPage, setAttPage] = useState(1);
  const [payPage, setPayPage] = useState(1);

  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: ['staff_attendance_detail', staffId, attMonth],
    queryFn: async () => {
      const res = await api.get(`/staff/${staffId}/attendance/${attMonth}`);
      return res.data;
    },
    enabled: !!staffId,
    staleTime: 60000,
  });

  const { data: salaryInfo, isLoading: salaryLoading } = useQuery({
    queryKey: ['staff_salary_info', staffId],
    queryFn: async () => {
      const res = await api.get(`/staff/${staffId}/salary-info`);
      return res.data;
    },
    enabled: !!staffId,
    staleTime: 60000,
  });

  const { data: timeline, isLoading: tlLoading } = useQuery({
    queryKey: ['staff_timeline'],
    queryFn: async () => {
      const res = await api.get('/staff-portal/timeline');
      return res.data;
    },
    staleTime: 300000,
  });

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['staff_tasks'],
    queryFn: async () => {
      const res = await api.get('/staff-portal/tasks');
      return res.data;
    },
    staleTime: 300000,
  });

  const pendingTasks = tasks?.filter(t => t.status !== 'Completed') || [];
  const rows = attendance?.attendance || [];
  const summary = attendance?.summary;
  const payments = salaryInfo?.recentPayments || [];

  const attTotalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const attPaginated = rows.slice((attPage - 1) * PAGE_SIZE, attPage * PAGE_SIZE);

  const payTotalPages = Math.max(1, Math.ceil(payments.length / PAGE_SIZE));
  const payPaginated = payments.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE);

  const changeMonth = (delta) => {
    const [y, m] = attMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setAttMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    setAttPage(1);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = attMonth.split('-');
    return new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [attMonth]);

  const downloadSlip = async () => {
    try {
      const res = await api.get(`/staff/${staffId}/salary-slip/${attMonth}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `salary-slip-${attMonth}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <PageContainer>
      {/* Profile Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {salaryInfo?.staff?.image_url ? (
            <img src={salaryInfo.staff.image_url} alt={salaryInfo.staff.name}
              style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <User size={26} />
            </div>
          )}
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Welcome, {user?.name || 'Staff'}</h1>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>
              {user?.role || 'Staff'} · {salaryInfo?.staff?.salary_type || '—'} salary
            </p>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={downloadSlip}>
          <Download size={14} /> Salary Slip
        </button>
      </div>

      {/* Attendance Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--success)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Present</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--success)', marginTop: 4 }}>
            {attLoading ? '-' : (summary?.present ?? 0)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--error)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Absent</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--error)', marginTop: 4 }}>
            {attLoading ? '-' : (summary?.absent ?? 0)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--warning)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Half Days</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--warning)', marginTop: 4 }}>
            {attLoading ? '-' : (summary?.halfDay ?? 0)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--accent)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leaves</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--accent)', marginTop: 4 }}>
            {attLoading ? '-' : (summary?.leave ?? 0)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Holidays</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>
            {attLoading ? '-' : (summary?.holiday ?? 0)}
          </div>
        </div>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Working Days</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--primary)', marginTop: 4 }}>
            {attLoading ? '-' : (summary?.workingDays ?? 0)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Attendance Log */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} style={{ color: 'var(--primary)' }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Attendance Log</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => changeMonth(-1)}><ChevronLeft size={15} /></button>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 90, textAlign: 'center' }}>{monthLabel}</span>
              <button className="btn btn-ghost" style={{ padding: '4px 8px' }} onClick={() => changeMonth(1)}><ChevronRight size={15} /></button>
            </div>
          </div>

          {attLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              <AlertCircle size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No attendance records for this month</p>
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Day</th>
                      <th>Status</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attPaginated.map(a => {
                      const d = new Date(a.attendance_date);
                      const cfg = statusCfg[a.status] || {};
                      return (
                        <tr key={a.id}>
                          <td>{d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                          <td style={{ color: d.getDay() === 0 ? 'var(--error)' : 'inherit' }}>
                            {d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block', padding: '1px 8px', borderRadius: 4,
                              background: cfg.bg || 'transparent', color: cfg.color || 'inherit',
                              fontSize: 11, fontWeight: 600,
                            }}>
                              {cfg.label || a.status}
                            </span>
                          </td>
                          <td style={{ color: a.in_time ? 'inherit' : 'var(--muted)', fontSize: 11 }}>
                            {a.in_time ? a.in_time.slice(0, 5) : '—'}
                          </td>
                          <td style={{ color: a.out_time ? 'inherit' : 'var(--muted)', fontSize: 11 }}>
                            {a.out_time ? a.out_time.slice(0, 5) : '—'}
                          </td>
                          <td style={{ color: 'var(--muted)', fontSize: 11, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.notes || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Attendance Pagination */}
              {attTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Showing {(attPage - 1) * PAGE_SIZE + 1}–{Math.min(attPage * PAGE_SIZE, rows.length)} of {rows.length}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" disabled={attPage <= 1} onClick={() => setAttPage(p => p - 1)} style={{ padding: '4px 8px' }}>
                      <ArrowLeft size={13} />
                    </button>
                    {Array.from({ length: attTotalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} className={`btn btn-sm ${p === attPage ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setAttPage(p)} style={{ padding: '4px 8px', minWidth: 28, fontSize: 12 }}>
                        {p}
                      </button>
                    ))}
                    <button className="btn btn-ghost btn-sm" disabled={attPage >= attTotalPages} onClick={() => setAttPage(p => p + 1)} style={{ padding: '4px 8px' }}>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent Salary Payments */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IndianRupee size={16} style={{ color: 'var(--success)' }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Recent Salary Payments</h3>
            </div>
            {salaryInfo?.currentMonthSalary && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'var(--success)18', color: 'var(--success)', fontWeight: 600 }}>
                {salaryInfo.currentMonthSalary.status || 'Paid'}
              </span>
            )}
          </div>

          {salaryLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : payments.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              <IndianRupee size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No salary payments yet</p>
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table className="table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payPaginated.map(p => (
                      <tr key={p.id}>
                        <td>{new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                          ₹{Number(p.payment_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ fontSize: 11 }}>{p.payment_method || '—'}</td>
                        <td style={{ fontSize: 11 }}>{p.reference_number || '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 11, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {payTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Showing {(payPage - 1) * PAGE_SIZE + 1}–{Math.min(payPage * PAGE_SIZE, payments.length)} of {payments.length}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" disabled={payPage <= 1} onClick={() => setPayPage(p => p - 1)} style={{ padding: '4px 8px' }}>
                      <ArrowLeft size={13} />
                    </button>
                    {Array.from({ length: payTotalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} className={`btn btn-sm ${p === payPage ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setPayPage(p)} style={{ padding: '4px 8px', minWidth: 28, fontSize: 12 }}>
                        {p}
                      </button>
                    ))}
                    <button className="btn btn-ghost btn-sm" disabled={payPage >= payTotalPages} onClick={() => setPayPage(p => p + 1)} style={{ padding: '4px 8px' }}>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bottom row: Tasks + Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Active Tasks */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={16} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Active Tasks ({pendingTasks.length})</h3>
          </div>
          {tasksLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : pendingTasks.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              <CheckCircle size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No active tasks</p>
            </div>
          ) : (
            <div className="stack-sm" style={{ padding: '12px 20px' }}>
              {pendingTasks.slice(0, 5).map(task => (
                <div key={task.id} style={{
                  padding: '12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: task.priority === 'High' || task.priority === 'Urgent' ? 'var(--error)08' : 'transparent',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{task.title}</span>
                    <span style={{
                      padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                      background: task.priority === 'High' || task.priority === 'Urgent' ? 'var(--error)' : 'var(--surface-3)',
                      color: task.priority === 'High' || task.priority === 'Urgent' ? 'white' : 'var(--text)',
                    }}>
                      {task.priority}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : '—'}
                  </div>
                </div>
              ))}
              {pendingTasks.length > 5 && (
                <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: 'var(--muted)' }}>
                  +{pendingTasks.length - 5} more tasks
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent Activity Timeline */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={16} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Recent Activity</h3>
          </div>
          {tlLoading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
              <Loader2 size={18} className="animate-spin" /> Loading…
            </div>
          ) : !timeline || timeline.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
              <Activity size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0, fontSize: 13 }}>No recent activity</p>
            </div>
          ) : (
            <div style={{ padding: '16px 20px' }}>
              {timeline.map((item, idx) => (
                <div key={idx} style={{
                  position: 'relative', paddingLeft: 20, paddingBottom: idx < timeline.length - 1 ? 16 : 0,
                  borderLeft: idx < timeline.length - 1 ? '2px solid var(--border)' : 'none',
                }}>
                  <div style={{
                    position: 'absolute', left: -5, top: 2, width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--primary)',
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{item.action}</div>
                  {item.details && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {typeof item.details === 'object' ? JSON.stringify(item.details) : String(item.details)}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    {new Date(item.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default StaffDashboard;
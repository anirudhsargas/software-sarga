import React, { useEffect, useState, useCallback } from 'react';
import { Camera, Loader2, Plus, X, User, Clock, RefreshCw } from 'lucide-react';
import api from '../services/api';
import SecureImage from '../components/SecureImage';
import toast from 'react-hot-toast';

const BRANCHES = [
  { value: 'perambra', label: 'Perambra' },
  { value: 'meppayur_main', label: 'Meppayur Main' },
  { value: 'meppayur_room', label: 'Meppayur Room' },
];

const STATUS_BADGES = {
  present: { className: 'badge badge--ok', label: 'Present' },
  absent: { className: 'badge badge--danger', label: 'Absent' },
  left: { className: 'badge badge--info', label: 'Left' },
  left_early: { className: 'badge badge--warning', label: 'Left Early' },
};

const SOURCE_BADGES = {
  face_recognition: { className: 'badge badge--primary', label: 'Auto (CCTV)' },
  manual: { className: 'badge', label: 'Manual' },
};

const formatTime = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const CCTVAttendance = () => {
  const [branch, setBranch] = useState('perambra');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Manual entry form state
  const [manualStaffId, setManualStaffId] = useState('');
  const [manualBranch, setManualBranch] = useState(branch);
  const [manualEventType, setManualEventType] = useState('entry');
  const [manualTime, setManualTime] = useState('');
  const [currentTimeOnOpen, setCurrentTimeOnOpen] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  const getTimeDiffMinutes = () => {
    if (!currentTimeOnOpen || !manualTime) return 0;
    const [curH, curM] = currentTimeOnOpen.split(':').map(Number);
    const [entH, entM] = manualTime.split(':').map(Number);
    return Math.abs(curH * 60 + curM - (entH * 60 + entM));
  };

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`cctv/attendance/summary?branch=${branch}&date=${date}`);
      setSummary(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch attendance summary:', err);
      toast.error('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  }, [branch, date]);

  // Initial load + auto-refresh every 30 seconds
  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  // Fetch staff list for manual entry modal
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { data } = await api.get('staff?all=true&limit=200');
        setStaffList(data.data || data || []);
      } catch {
        // Silently fail — modal will show empty dropdown
      }
    };
    fetchStaff();
  }, []);

  const openManualModal = () => {
    setManualStaffId('');
    setManualBranch(branch);
    setManualEventType('entry');
    const now = new Date();
    const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setManualTime(nowStr);
    setCurrentTimeOnOpen(nowStr);
    setShowManual(true);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualStaffId || !manualBranch || !manualEventType || !manualTime) {
      toast.error('Please fill all fields');
      return;
    }

    setManualSaving(true);
    try {
      const timestamp = `${date}T${manualTime}:00`;
      await api.post('cctv/attendance', {
        staff_id: parseInt(manualStaffId, 10),
        branch: manualBranch,
        event_type: manualEventType,
        source: 'manual',
        timestamp,
      });
      toast.success('Attendance recorded');
      setShowManual(false);
      fetchSummary();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record attendance');
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Camera size={22} /> CCTV Attendance
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Updated {formatTime(lastRefresh)}
            </span>
          )}
          <button className="btn btn-ghost" onClick={fetchSummary} title="Refresh" style={{ padding: 8, minWidth: 'auto' }}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="btn btn-primary" onClick={openManualModal}>
            <Plus size={16} /> Manual Entry
          </button>
        </div>
      </div>

      {/* Branch Tabs + Date Picker */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2)', borderRadius: 12, padding: 4 }}>
          {BRANCHES.map(b => (
            <button
              key={b.value}
              className={`btn ${branch === b.value ? 'btn-primary' : 'btn-ghost'}`}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13 }}
              onClick={() => setBranch(b.value)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
          style={{ width: 160 }}
        />
      </div>

      {/* Summary Stats */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-value">{summary.total_staff}</div>
            <div className="stat-label">Total Staff</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--success)' }}>
            <div className="stat-value" style={{ color: 'var(--success)' }}>{summary.present}</div>
            <div className="stat-label">Present</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '3px solid var(--error)' }}>
            <div className="stat-value" style={{ color: 'var(--error)' }}>{summary.absent}</div>
            <div className="stat-label">Absent</div>
          </div>
          {summary.alert_count > 0 && (
            <div className="stat-card" style={{ borderLeft: '3px solid var(--warning)', background: 'var(--warning-bg)' }}>
              <div className="stat-value" style={{ color: 'var(--warning)' }}>{summary.alert_count}</div>
              <div className="stat-label">Not Arrived (Alert)</div>
            </div>
          )}
          {summary.discrepancy_count > 0 && (
            <div className="stat-card" style={{ borderLeft: '3px solid #f59e0b', background: '#fff7e0' }}>
              <div className="stat-value" style={{ color: '#b45309' }}>{summary.discrepancy_count}</div>
              <div className="stat-label">Time Discrepancies</div>
            </div>
          )}
        </div>
      )}

      {/* Attendance Table */}
      <div className="card p-16">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Staff</th>
                <th>Entry Time</th>
                <th>Exit Time</th>
                <th>Source</th>
                <th>Status</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                    <Loader2 size={18} className="animate-spin" style={{ display: 'inline-block', marginRight: 8 }} />
                    Loading attendance...
                  </td>
                </tr>
              ) : !summary || summary.staff.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                    No staff found for this branch
                  </td>
                </tr>
              ) : (
                summary.staff.map(s => {
                  const statusBadge = STATUS_BADGES[s.status] || { className: 'badge', label: s.status };
                  const entrySrc = s.entry_source ? SOURCE_BADGES[s.entry_source] : null;
                  return (
                    <tr key={s.staff_id} style={s.absent_alert ? { background: 'rgba(255,0,0,0.06)' } : undefined}>
                      <td>
                        <div className="row gap-sm" style={{ alignItems: 'center' }}>
                          <div className="user-avatar avatar-sm">
                            {s.image_url ? <SecureImage src={s.image_url} alt={s.name} className="avatar-img" /> : <User size={16} />}
                          </div>
                          <div>
                            <span className="user-name">{s.name}</span>
                            {s.branch_name && (
                              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.branch_name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {s.entry_time ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <Clock size={13} style={{ color: 'var(--muted)' }} />
                            {formatTime(s.entry_time)}
                            {s.entry_discrepancy !== null && s.entry_discrepancy > 30 && (
                              <span title={`Recorded ${s.entry_discrepancy} min after actual submission`}
                                style={{ fontSize: 11, background: '#fff7e0', color: '#b45309', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                ⚠ {s.entry_discrepancy}m gap
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {s.exit_time ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <Clock size={13} style={{ color: 'var(--muted)' }} />
                            {formatTime(s.exit_time)}
                            {s.exit_discrepancy !== null && s.exit_discrepancy > 30 && (
                              <span title={`Recorded ${s.exit_discrepancy} min after actual submission`}
                                style={{ fontSize: 11, background: '#fff7e0', color: '#b45309', border: '1px solid #f59e0b', borderRadius: 4, padding: '1px 5px', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                ⚠ {s.exit_discrepancy}m gap
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {entrySrc ? <span className={entrySrc.className}>{entrySrc.label}</span> : '—'}
                      </td>
                      <td>
                        <span className={statusBadge.className}>
                          {s.absent_alert ? '⚠ ' : ''}{statusBadge.label}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 13 }}>{s.event_count}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showManual && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 440 }}>
            <button className="modal-close" onClick={() => setShowManual(false)} title="Close">
              <X size={20} />
            </button>
            <h2 className="section-title mb-16" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={18} /> Manual Attendance Entry
            </h2>
            <form onSubmit={handleManualSubmit} className="stack-md">
              <div>
                <label className="label">Staff Member</label>
                <select
                  className="input"
                  value={manualStaffId}
                  onChange={(e) => setManualStaffId(e.target.value)}
                  required
                >
                  <option value="">Select staff...</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Branch</label>
                <select
                  className="input"
                  value={manualBranch}
                  onChange={(e) => setManualBranch(e.target.value)}
                  required
                >
                  {BRANCHES.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Event Type</label>
                <select
                  className="input"
                  value={manualEventType}
                  onChange={(e) => setManualEventType(e.target.value)}
                  required
                >
                  <option value="entry">Entry</option>
                  <option value="exit">Exit</option>
                </select>
              </div>
              <div>
                <label className="label">Time</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="time"
                    className="input"
                    value={manualTime}
                    onChange={(e) => setManualTime(e.target.value)}
                    required
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Current time: <strong>{currentTimeOnOpen}</strong>
                </div>
                {getTimeDiffMinutes() > 30 && (
                  <div style={{
                    marginTop: 6,
                    padding: '6px 10px',
                    background: 'var(--warning-bg, #fff7e0)',
                    border: '1px solid var(--warning, #f59e0b)',
                    borderRadius: 6,
                    fontSize: 12,
                    color: 'var(--warning, #b45309)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    ⚠ Entered time differs from current time by{' '}
                    <strong>{getTimeDiffMinutes()} min</strong>. This will be flagged for admin review.
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 0' }}>
                Source: <span className="badge">Manual</span>
              </div>
              <div className="row gap-sm" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowManual(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={manualSaving}>
                  {manualSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Record Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CCTVAttendance;

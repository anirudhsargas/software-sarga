import { useSEO } from '../hooks/useSEO';
import React, { useEffect, useState, useCallback } from 'react';
import { Camera, Loader2, Plus, X, User, Clock, RefreshCw, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import SecureImage from '../components/SecureImage';
import toast from 'react-hot-toast';
import BranchSelect from '../components/ui/BranchSelect';
import PageContainer from '../components/ui/PageContainer';
import './CCTVAttendance.css';

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
    useSEO('C C T V Attendance');

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

  // Listen for attendance updates from other pages and refresh immediately
  useEffect(() => {
    const onStorage = (e) => {
      if (!e) return;
      if (e.key === 'attendance:updated') {
        fetchSummary();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [fetchSummary]);

  // Fetch staff list for manual entry modal
  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const { data } = await api.get('staff?all=true&limit=200');
        setStaffList(data.data || data || []);
      } catch {
        // Silently fail
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
    <PageContainer>
      {/* Page Header */}
      <div className="cctv-att-header">
        <h1 className="cctv-att-header-title">
          <Camera size={22} /> CCTV Attendance
        </h1>
        <div className="cctv-att-header-actions">
          {lastRefresh && (
            <span className="cctv-att-header-updated">
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
      <div className="cctv-att-filters">
        <div className="cctv-att-branch-tabs">
          {BRANCHES.map(b => (
            <button
              key={b.value}
              className={`cctv-att-branch-tab${branch === b.value ? ' cctv-att-branch-tab--active' : ''}`}
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
          className="input cctv-att-date-input"
        />
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="cctv-att-stats">
          <div className="stat-card cctv-att-stat-card">
            <div className="stat-value">{summary.total_staff}</div>
            <div className="stat-label">Total Staff</div>
          </div>
          <div className="stat-card cctv-att-stat-card--present">
            <div className="stat-value">{summary.present}</div>
            <div className="stat-label">Present</div>
          </div>
          <div className="stat-card cctv-att-stat-card--absent">
            <div className="stat-value">{summary.absent}</div>
            <div className="stat-label">Absent</div>
          </div>
          {summary.alert_count > 0 && (
            <div className="stat-card cctv-att-stat-card--alert">
              <div className="stat-value">{summary.alert_count}</div>
              <div className="stat-label">Not Arrived (Alert)</div>
            </div>
          )}
          {summary.discrepancy_count > 0 && (
            <div className="stat-card cctv-att-stat-card--discrepancy">
              <div className="stat-value">{summary.discrepancy_count}</div>
              <div className="stat-label">Time Discrepancies</div>
            </div>
          )}
        </div>
      )}

      {/* Attendance Table */}
      <div className="card cctv-att-table-wrap">
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
                    <tr key={s.staff_id} className={s.absent_alert ? 'cctv-att-row--alert' : ''}>
                      <td>
                        <div className="cctv-att-staff-cell">
                          <div className="cctv-att-avatar">
                            {s.image_url ? <SecureImage src={s.image_url} alt={s.name} className="avatar-img" width={34} height={34} /> : <User size={16} />}
                          </div>
                          <div>
                            <span className="cctv-att-staff-name">{s.name}</span>
                            {s.branch_name && (
                              <div className="cctv-att-staff-branch">{s.branch_name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {s.entry_time ? (
                          <span className="cctv-att-time">
                            <Clock size={13} className="cctv-att-time-icon" />
                            {formatTime(s.entry_time)}
                            {s.entry_discrepancy !== null && s.entry_discrepancy > 30 && (
                              <span title={`Recorded ${s.entry_discrepancy} min after actual submission`} className="cctv-att-discrepancy-badge">
                                <AlertTriangle size={10} /> {s.entry_discrepancy}m gap
                              </span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {s.exit_time ? (
                          <span className="cctv-att-time">
                            <Clock size={13} className="cctv-att-time-icon" />
                            {formatTime(s.exit_time)}
                            {s.exit_discrepancy !== null && s.exit_discrepancy > 30 && (
                              <span title={`Recorded ${s.exit_discrepancy} min after actual submission`} className="cctv-att-discrepancy-badge">
                                <AlertTriangle size={10} /> {s.exit_discrepancy}m gap
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
                          {s.absent_alert ? <AlertTriangle size={12} style={{ display: 'inline', marginRight: 2 }} /> : ''}{statusBadge.label}
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
          <div className="modal cctv-att-manual-modal">
            <button className="modal-close" onClick={() => setShowManual(false)} title="Close">
              <X size={20} />
            </button>
            <h2 className="section-title cctv-att-manual-title">
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
                <BranchSelect
                  className="input"
                  value={manualBranch}
                  onChange={(e) => setManualBranch(e.target.value)}
                  required
                >
                  {BRANCHES.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </BranchSelect>
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
                  <div className="cctv-att-warning-banner">
                    <AlertTriangle size={14} />
                    Entered time differs from current time by{' '}
                    <strong>{getTimeDiffMinutes()} min</strong>. This will be flagged for admin review.
                  </div>
                )}
              </div>
              <div className="cctv-att-source-label">
                Source: <span className="badge">Manual</span>
              </div>
              <div className="cctv-att-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setShowManual(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={manualSaving}>
                  {manualSaving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : 'Record Attendance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default CCTVAttendance;

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  PenTool, Clock, CheckCircle, AlertTriangle, ChevronRight,
  Bell, Calendar, Upload, Plus, Zap, TrendingUp, Eye, RefreshCw,
  User, Briefcase, Timer, ArrowRight, Star
} from 'lucide-react';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import auth from '../../services/auth';
import '../../styles/designer-dashboard.css';
import PageContainer from '../../components/ui/PageContainer';

/* ── helpers ── */
const now = new Date();
const todayStr = now.toISOString().split('T')[0];

function formatDeadline(dateStr) {
  if (!dateStr) return 'No deadline';
  const d = new Date(dateStr);
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `${diff}d left`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) < now;
}

function isDueToday(dateStr) {
  if (!dateStr) return false;
  return dateStr.split('T')[0] === todayStr;
}

const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

function getPriorityClass(p) {
  const m = { Urgent: 'urgent', High: 'high', Medium: 'medium', Low: 'low' };
  return m[p] || 'low';
}

/* ── Skeleton ── */
function DashboardSkeleton() {
  return (
    <PageContainer className="designer-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="skeleton-block" style={{ width: 260, height: 28, borderRadius: 8, marginBottom: 8 }} />
          <div className="skeleton-block" style={{ width: 180, height: 14, borderRadius: 6 }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton-block" style={{ width: 120, height: 38, borderRadius: 10 }} />)}
        </div>
      </div>
      <div className="designer-stats-grid">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="skeleton-card">
            <div className="skeleton-block" style={{ width: 40, height: 40, borderRadius: 12 }} />
            <div className="skeleton-block" style={{ width: 60, height: 32, borderRadius: 6 }} />
            <div className="skeleton-block" style={{ width: 90, height: 12, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </PageContainer>
  );
}

/* ── Main Component ── */
const DesignDashboard = () => {
  useSEO('Design Studio');
  const navigate = useNavigate();
  const user = auth.getUser();

  const { data: bookings = [], isLoading: bookingsLoading, refetch } = useQuery({
    queryKey: ['designer_bookings'],
    queryFn: async () => {
      const res = await api.get('/design-workspace/bookings');
      return res.data || [];
    },
    refetchInterval: 60000, // silent auto-refresh every 1 min
  });

  const { data: assets = [] } = useQuery({
    queryKey: ['designer_assets'],
    queryFn: async () => {
      const res = await api.get('/design-workspace/assets');
      return res.data || [];
    },
    staleTime: 300000,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      switch (e.key.toLowerCase()) {
        case 'd': e.preventDefault(); navigate('/designer'); break;
        case 'a': e.preventDefault(); navigate('/designer/assigned'); break;
        case 'b': e.preventDefault(); navigate('/designer/bookings'); break;
        case 'j': e.preventDefault(); navigate('/designer/bookings'); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  // Derived stats
  const assigned = bookings.filter(b => b.status === 'Assigned');
  const inProgress = bookings.filter(b => b.status === 'Designing');
  const awaitingApproval = bookings.filter(b => b.status === 'Review');
  const completedToday = bookings.filter(b => b.status === 'Approved' && isDueToday(b.updated_at));
  const dueToday = bookings.filter(b => isDueToday(b.due_date) && !['Approved','Delivered'].includes(b.status));

  // Active job (first in-progress or first assigned)
  const activeJob = inProgress[0] || assigned[0] || null;

  // Sorted assigned jobs for preview (priority → deadline)
  const assignedSorted = [...assigned, ...inProgress]
    .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
    .slice(0, 5);

  // Recent assets (recent work)
  const recentWork = assets.slice(0, 6);

  // Mock notifications (in real system, these come from an API)
  const notifications = [
    ...assigned.slice(0, 2).map(b => ({
      id: `assign-${b.id}`, type: 'assign', dot: 'var(--info)',
      text: `New assignment: ${b.customer_name} — ${b.design_type || 'Design Job'}`,
      time: 'Just now'
    })),
    ...dueToday.slice(0, 2).map(b => ({
      id: `due-${b.id}`, type: 'deadline', dot: 'var(--danger)',
      text: `Deadline today: ${b.customer_name}`,
      time: 'Due today'
    })),
    ...awaitingApproval.slice(0, 1).map(b => ({
      id: `review-${b.id}`, type: 'review', dot: 'var(--accent)',
      text: `Awaiting approval from ${b.customer_name}`,
      time: 'Pending'
    })),
  ].slice(0, 5);

  if (bookingsLoading) return <DashboardSkeleton />;

  return (
    <PageContainer>

      {/* ── Header ── */}
      <div className="designer-page-header">
        <div>
          <h1 className="designer-page-header__title">
            <PenTool size={24} />
            {user?.name ? `${user.name.split(' ')[0]}'s Studio` : 'Design Studio'}
          </h1>
          <p className="designer-page-header__subtitle">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}{bookings.length} total jobs
          </p>
        </div>

        <div className="quick-actions-bar">
          <button
            id="qa-new-booking"
            className="quick-action-btn quick-action-btn--primary"
            onClick={() => navigate('/designer/bookings')}
            title="Alt+B"
          >
            <Plus size={15} />
            New Booking
            <span className="quick-action-btn__kbd">Alt+B</span>
          </button>
          <button
            id="qa-assigned"
            className="quick-action-btn"
            onClick={() => navigate('/designer/assigned')}
            title="Alt+A"
          >
            <Briefcase size={15} />
            Assigned Jobs
            <span className="quick-action-btn__kbd">Alt+A</span>
          </button>
          <button
            id="qa-refresh"
            className="quick-action-btn"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div className="designer-stats-grid">
        {/* Assigned */}
        <div className="designer-stat-card" onClick={() => navigate('/designer/assigned')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-icon-row">
            <div className="stat-card-icon"><Briefcase size={20} /></div>
            {assigned.length > 0 && <span className="stat-card-badge stat-card-badge--active">Queue</span>}
          </div>
          <div className="stat-card-value">{assigned.length}</div>
          <div className="stat-card-label">Assigned</div>
        </div>

        {/* In Progress */}
        <div className="designer-stat-card" onClick={() => navigate('/designer/assigned')} style={{ cursor: 'pointer' }}>
          <div className="stat-card-icon-row">
            <div className="stat-card-icon"><PenTool size={20} /></div>
            {inProgress.length > 0 && <span className="stat-card-badge stat-card-badge--active">Active</span>}
          </div>
          <div className="stat-card-value">{inProgress.length}</div>
          <div className="stat-card-label">In Progress</div>
        </div>

        {/* Awaiting Approval */}
        <div className="designer-stat-card">
          <div className="stat-card-icon-row">
            <div className="stat-card-icon"><Eye size={20} /></div>
            {awaitingApproval.length > 0 && <span className="stat-card-badge stat-card-badge--pending">Pending</span>}
          </div>
          <div className="stat-card-value">{awaitingApproval.length}</div>
          <div className="stat-card-label">Awaiting Approval</div>
        </div>

        {/* Completed Today */}
        <div className="designer-stat-card">
          <div className="stat-card-icon-row">
            <div className="stat-card-icon"><CheckCircle size={20} /></div>
            {completedToday.length > 0 && <span className="stat-card-badge stat-card-badge--done">Today</span>}
          </div>
          <div className="stat-card-value">{completedToday.length}</div>
          <div className="stat-card-label">Completed Today</div>
        </div>

        {/* Due Today — highlighted red */}
        <div className={`designer-stat-card${dueToday.length > 0 ? ' designer-stat-card--urgent' : ''}`}>
          <div className="stat-card-icon-row">
            <div className="stat-card-icon" style={dueToday.length > 0 ? { color: 'var(--danger)', borderColor: 'var(--danger)', background: 'var(--error-bg)' } : {}}>
              <AlertTriangle size={20} />
            </div>
            {dueToday.length > 0 && <span className="stat-card-badge stat-card-badge--urgent">Urgent</span>}
          </div>
          <div className="stat-card-value">{dueToday.length}</div>
          <div className="stat-card-label">Due Today</div>
        </div>
      </div>

      {/* ── Row 1: Assigned Jobs + Active Design ── */}
      <div className="designer-grid-2">

        {/* Assigned Jobs */}
        <div className="designer-panel">
          <div className="designer-panel__header">
            <span className="designer-panel__title">
              <Briefcase size={16} /> Assigned Jobs
            </span>
            <Link to="/designer/assigned" className="designer-panel__link">
              View all <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
            </Link>
          </div>
          <div className="designer-panel__body" style={{ padding: '12px 16px' }}>
            {assignedSorted.length === 0 ? (
              <div className="empty-state-sm">
                <CheckCircle size={32} />
                <p>No pending jobs — you're clear!</p>
              </div>
            ) : (
              assignedSorted.map(b => {
                const overdue = isOverdue(b.due_date);
                return (
                  <div
                    key={b.id}
                    className="job-item"
                    onClick={() => navigate('/designer/assigned')}
                    id={`job-item-${b.id}`}
                  >
                    <div className={`status-dot status-dot--${b.status === 'Designing' ? 'active' : 'pending'}`} />
                    <div className="job-item__main">
                      <div className="job-item__title">{b.customer_name} {b.company_name ? `(${b.company_name})` : ''}</div>
                      <div className="job-item__meta">
                        <span>{b.design_type || 'Design Job'}</span>
                        <span className="dot-sep" />
                        <span style={{ color: overdue || isDueToday(b.due_date) ? 'var(--danger)' : undefined, fontWeight: overdue ? 700 : 500 }}>
                          {formatDeadline(b.due_date)}
                        </span>
                      </div>
                    </div>
                    <div className="job-item__right">
                      <span className={`priority-badge priority-badge--${getPriorityClass(b.priority)}`}>
                        {b.priority || 'Normal'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Active Design */}
        <div className="designer-panel">
          <div className="designer-panel__header">
            <span className="designer-panel__title">
              <Zap size={16} /> Active Design
            </span>
            {activeJob && (
              <Link to="/designer/assigned" className="designer-panel__link">
                Open <ArrowRight size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </Link>
            )}
          </div>
          <div className="designer-panel__body">
            {!activeJob ? (
              <div className="empty-state-sm">
                <PenTool size={32} />
                <p>No active design in progress</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Pick up an assigned job to start</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Customer block */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: 'var(--surface-2)', display: 'grid', placeItems: 'center',
                    fontSize: 20, fontWeight: 800, color: 'var(--text-muted)',
                    border: '1px solid var(--border)', flexShrink: 0
                  }}>
                    {(activeJob.customer_name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--text-heading)' }}>
                      {activeJob.customer_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {activeJob.design_type || 'Design Job'} · #{activeJob.id}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className={`priority-badge priority-badge--${getPriorityClass(activeJob.priority)}`}>
                        {activeJob.priority || 'Normal'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>Progress</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      {activeJob.status === 'Designing' ? '50%' : activeJob.status === 'Review' ? '80%' : '20%'}
                    </span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div
                      className="progress-bar-fill"
                      style={{ width: activeJob.status === 'Designing' ? '50%' : activeJob.status === 'Review' ? '80%' : '20%' }}
                    />
                  </div>
                </div>

                {/* Deadline */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                  <Timer size={14} />
                  <span style={{
                    color: isOverdue(activeJob.due_date) || isDueToday(activeJob.due_date) ? 'var(--danger)' : undefined,
                    fontWeight: 600
                  }}>
                    {formatDeadline(activeJob.due_date)}
                  </span>
                  {activeJob.due_date && (
                    <>
                      <span className="dot-sep" />
                      <span>{new Date(activeJob.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="quick-action-btn quick-action-btn--primary"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => navigate('/designer/assigned')}
                  >
                    Open Job
                  </button>
                  <button
                    className="quick-action-btn"
                    style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => navigate('/designer/bookings')}
                  >
                    <Upload size={14} /> Upload
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Recent Work + Notifications + Timeline ── */}
      <div className="designer-grid-3">

        {/* Recent Work */}
        <div className="designer-panel">
          <div className="designer-panel__header">
            <span className="designer-panel__title">
              <Clock size={16} /> Recent Work
            </span>
            <Link to="/designer/library" className="designer-panel__link">Library</Link>
          </div>
          <div className="designer-panel__body" style={{ padding: '12px 16px' }}>
            {recentWork.length === 0 ? (
              <div className="empty-state-sm">
                <TrendingUp size={28} />
                <p>No recent uploads yet</p>
              </div>
            ) : (
              recentWork.map((a, i) => (
                <div key={a.id || i} className="job-item">
                  <div style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    overflow: 'hidden', display: 'grid', placeItems: 'center'
                  }}>
                    {a.preview_url
                      ? <img src={`/${a.preview_url}`} alt={a.asset_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <PenTool size={16} color="var(--text-muted)" />
                    }
                  </div>
                  <div className="job-item__main">
                    <div className="job-item__title">{a.asset_name || 'Untitled Asset'}</div>
                    <div className="job-item__meta">By {a.uploaded_by_name || 'You'}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Notifications */}
        <div className="designer-panel">
          <div className="designer-panel__header">
            <span className="designer-panel__title">
              <Bell size={16} /> Notifications
              {notifications.length > 0 && (
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--danger)', color: 'var(--on-danger, #fff)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 10, fontWeight: 800
                }}>
                  {notifications.length}
                </span>
              )}
            </span>
          </div>
          <div className="designer-panel__body">
            {notifications.length === 0 ? (
              <div className="empty-state-sm">
                <Bell size={28} />
                <p>No new notifications</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="notif-item">
                  <div className="notif-item__dot" style={{ background: n.dot }} />
                  <div className="notif-item__body">
                    <div className="notif-item__text">{n.text}</div>
                    <div className="notif-item__time">{n.time}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Timeline */}
        <div className="designer-panel">
          <div className="designer-panel__header">
            <span className="designer-panel__title">
              <Calendar size={16} /> Today's Timeline
            </span>
          </div>
          <div className="designer-panel__body">
            {dueToday.length === 0 && inProgress.length === 0 ? (
              <div className="empty-state-sm">
                <Calendar size={28} />
                <p>Nothing due today 🎉</p>
              </div>
            ) : (
              <div className="timeline-list">
                {inProgress.map(b => (
                  <div key={`ip-${b.id}`} className="timeline-item">
                    <div className="timeline-dot timeline-dot--active" />
                    <div className="timeline-content">
                      <div className="timeline-content__title">{b.customer_name}</div>
                      <div className="timeline-content__meta">In Progress · {b.design_type || 'Design'}</div>
                    </div>
                  </div>
                ))}
                {dueToday.map(b => (
                  <div key={`dt-${b.id}`} className="timeline-item">
                    <div className="timeline-dot timeline-dot--due" />
                    <div className="timeline-content">
                      <div className="timeline-content__title" style={{ color: 'var(--danger)' }}>
                        {b.customer_name}
                      </div>
                      <div className="timeline-content__meta">Due Today · {b.design_type || 'Design'}</div>
                    </div>
                  </div>
                ))}
                {awaitingApproval.map(b => (
                  <div key={`aw-${b.id}`} className="timeline-item">
                    <div className="timeline-dot timeline-dot--done" />
                    <div className="timeline-content">
                      <div className="timeline-content__title">{b.customer_name}</div>
                      <div className="timeline-content__meta">Awaiting approval</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

    </PageContainer>
  );
};

export default DesignDashboard;

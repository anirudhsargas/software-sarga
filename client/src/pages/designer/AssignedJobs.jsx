import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Briefcase, Clock, CheckCircle, Eye, Send,
  AlertTriangle, Timer, ArrowRight, Search, User
} from 'lucide-react';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import '../../styles/designer-dashboard.css';
import PageContainer from '../../components/ui/PageContainer';

/* ── Column definitions ── */
const COLUMNS = [
  { id: 'Assigned',    label: 'Assigned',    icon: Briefcase,    color: 'var(--info)' },
  { id: 'Designing',   label: 'In Progress', icon: Clock,        color: 'var(--warning)' },
  { id: 'Review',      label: 'Review',      icon: Eye,          color: 'var(--accent)' },
  { id: 'Approved',    label: 'Ready',       icon: CheckCircle,  color: 'var(--success)' },
  { id: 'Delivered',   label: 'Delivered',   icon: Send,         color: 'var(--text-muted)' },
];

/* ── Helpers ── */
const now = new Date();
const todayStr = now.toISOString().split('T')[0];

function formatDeadline(dateStr) {
  if (!dateStr) return 'No deadline';
  const d = new Date(dateStr);
  const diff = Math.ceil((d - now) / 86400000);
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Tomorrow';
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

function getPriorityClass(p) {
  const m = { Urgent: 'urgent', High: 'high', Medium: 'medium', Low: 'low' };
  return m[p] || 'low';
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 60000);
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}

/* ── Kanban Card ── */
function KanbanCard({ booking, onStatusChange, isUpdating }) {
  const [isDragging, setIsDragging] = useState(false);
  const navigate = useNavigate();

  const deadlineUrgent = isOverdue(booking.due_date) || isDueToday(booking.due_date);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('bookingId', String(booking.id));
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };

  const handleDragEnd = () => setIsDragging(false);

  // Next logical status for the "Complete / Move Forward" action
  const NEXT = {
    Assigned: 'Designing',
    Designing: 'Review',
    Review: 'Approved',
    Approved: 'Delivered',
  };

  const nextStatus = NEXT[booking.status];

  const actionLabel = {
    Assigned: 'Start',
    Designing: 'Submit Review',
    Review: 'Mark Approved',
    Approved: 'Mark Delivered',
  }[booking.status] || 'Open';

  return (
    <div
      className={`kanban-card${isDragging ? ' kanban-card--dragging' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      id={`kanban-card-${booking.id}`}
    >
      {/* Top: customer + priority */}
      <div className="kanban-card__top">
        <div>
          <div className="kanban-card__customer">{booking.customer_name}</div>
          <div className="kanban-card__type">{booking.design_type || 'Design Job'} · #{booking.id}</div>
        </div>
        <span className={`priority-badge priority-badge--${getPriorityClass(booking.priority)}`}>
          {booking.priority || 'Normal'}
        </span>
      </div>

      {/* Meta rows */}
      <div className="kanban-card__meta">
        <div className="kanban-card__meta-row">
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Timer size={11} /> Assigned {formatRelativeTime(booking.created_at)}
          </span>
        </div>
        <div className="kanban-card__meta-row">
          <span
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              color: deadlineUrgent ? 'var(--danger)' : undefined,
              fontWeight: deadlineUrgent ? 700 : 500
            }}
          >
            {deadlineUrgent && <AlertTriangle size={11} />}
            <Clock size={11} /> {formatDeadline(booking.due_date)}
          </span>
          {booking.company_name && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <User size={11} /> {booking.company_name}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="progress-bar-wrap" style={{ marginTop: 4 }}>
            <div
              className={`progress-bar-fill${deadlineUrgent ? ' progress-bar-fill--danger' : ''}`}
              style={{
                width: {
                  Assigned: '15%', Designing: '50%', Review: '80%',
                  Approved: '95%', Delivered: '100%'
                }[booking.status] || '15%'
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textAlign: 'right' }}>
            {{
              Assigned: '15%', Designing: '50%', Review: '80%',
              Approved: '95%', Delivered: '100%'
            }[booking.status]}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="kanban-card__actions">
        <button
          className="kanban-btn"
          onClick={() => navigate('/designer/bookings')}
          id={`btn-open-${booking.id}`}
        >
          Open
        </button>
        {nextStatus && (
          <button
            className="kanban-btn kanban-btn--primary"
            disabled={isUpdating}
            onClick={() => onStatusChange(booking.id, nextStatus)}
            id={`btn-advance-${booking.id}`}
          >
            {isUpdating ? '...' : actionLabel}
          </button>
        )}
        {booking.status === 'Designing' && (
          <button
            className="kanban-btn"
            onClick={() => onStatusChange(booking.id, 'Assigned')}
            id={`btn-pause-${booking.id}`}
            title="Pause — move back to Assigned"
          >
            Pause
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Kanban Column ── */
function KanbanColumn({ col, bookings, onStatusChange, isUpdating, search }) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const bookingId = parseInt(e.dataTransfer.getData('bookingId'), 10);
    if (bookingId) onStatusChange(bookingId, col.id);
  };

  const filtered = search
    ? bookings.filter(b =>
        b.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        b.design_type?.toLowerCase().includes(search.toLowerCase()) ||
        String(b.id).includes(search)
      )
    : bookings;

  const IconComp = col.icon;

  return (
    <div
      className={`kanban-col${dragOver ? ' kanban-col--drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      id={`kanban-col-${col.id.toLowerCase()}`}
    >
      <div className="kanban-col__header">
        <span className="kanban-col__title">
          <span style={{ color: col.color, display: 'flex', alignItems: 'center' }}>
            <IconComp size={14} />
          </span>
          {col.label}
        </span>
        <span className="kanban-col__count">{filtered.length}</span>
      </div>

      <div className="kanban-col__body">
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {search ? 'No matches' : 'Drop cards here'}
          </div>
        ) : (
          filtered.map(b => (
            <KanbanCard
              key={b.id}
              booking={b}
              onStatusChange={onStatusChange}
              isUpdating={isUpdating}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ── Main Page ── */
const AssignedJobs = () => {
  useSEO('Assigned Jobs');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['designer_bookings'],
    queryFn: async () => {
      const res = await api.get('/design-workspace/bookings');
      return res.data || [];
    },
    refetchInterval: 60000,
  });

  const { mutate: updateStatus, isLoading: isUpdating } = useMutation({
    mutationFn: async ({ id, status }) =>
      api.put(`/design-workspace/bookings/${id}/status`, { status }),
    onSuccess: (_, { status }) => {
      const label = COLUMNS.find(c => c.id === status)?.label || status;
      toast.success(`Moved to ${label}`);
      queryClient.invalidateQueries({ queryKey: ['designer_bookings'] });
    },
    onError: () => toast.error('Failed to update status'),
  });

  const handleStatusChange = useCallback((id, status) => {
    updateStatus({ id, status });
  }, [updateStatus]);

  // Sort: priority → overdue → due date
  const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const sortedBookings = [...bookings].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 9;
    const pb = PRIORITY_ORDER[b.priority] ?? 9;
    if (pa !== pb) return pa - pb;
    const da = a.due_date ? new Date(a.due_date) : new Date(9999, 0);
    const db = b.due_date ? new Date(b.due_date) : new Date(9999, 0);
    return da - db;
  });

  // Group by column
  const colMap = {};
  COLUMNS.forEach(c => { colMap[c.id] = []; });
  sortedBookings.forEach(b => {
    if (colMap[b.status]) colMap[b.status].push(b);
    else if (colMap['Assigned']) colMap['Assigned'].push(b); // fallback
  });

  // Summary counts
  const totalActive = (colMap['Assigned']?.length || 0) + (colMap['Designing']?.length || 0) + (colMap['Review']?.length || 0);

  return (
    <PageContainer>

      {/* Header */}
      <div className="designer-page-header">
        <div>
          <h1 className="designer-page-header__title">
            <Briefcase size={22} /> Assigned Jobs
          </h1>
          <p className="designer-page-header__subtitle">
            {totalActive} active · Drag cards between columns to update status
          </p>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: 240 }}>
          <Search size={14} style={{
            position: 'absolute', left: 11, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none'
          }} />
          <input
            id="kanban-search"
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input"
            style={{ paddingLeft: 32, height: 38 }}
          />
        </div>
      </div>

      {/* Board */}
      {isLoading ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {COLUMNS.map(c => (
            <div key={c.id} style={{ flex: '0 0 280px' }}>
              <div className="skeleton-block" style={{ height: 44, borderRadius: 12, marginBottom: 10 }} />
              {[1,2].map(i => (
                <div key={i} className="skeleton-card" style={{ marginBottom: 8 }}>
                  <div className="skeleton-block" style={{ height: 14, width: '70%', borderRadius: 4 }} />
                  <div className="skeleton-block" style={{ height: 12, width: '50%', borderRadius: 4 }} />
                  <div className="skeleton-block" style={{ height: 6, borderRadius: 3 }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban-board">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              col={col}
              bookings={colMap[col.id] || []}
              onStatusChange={handleStatusChange}
              isUpdating={isUpdating}
              search={search}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
};

export default AssignedJobs;

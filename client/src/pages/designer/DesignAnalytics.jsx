import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, CheckCircle, Clock, RefreshCw, Star,
  BarChart2, Award, Target, Zap
} from 'lucide-react';
import api from '../../services/api';
import { useSEO } from '../../hooks/useSEO';
import '../../styles/designer-dashboard.css';

/* ── Helpers ── */
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeeklyBuckets(bookings) {
  const buckets = Array(7).fill(0);
  const now = new Date();
  bookings.forEach(b => {
    if (!b.updated_at && !b.created_at) return;
    const d = new Date(b.updated_at || b.created_at);
    const diff = Math.floor((now - d) / 86400000);
    if (diff >= 0 && diff < 7) {
      const dayIdx = (new Date().getDay() + 6 - diff) % 7; // Mon=0
      if (['Approved', 'Delivered'].includes(b.status)) buckets[dayIdx]++;
    }
  });
  return buckets;
}

/* ── Sparkline Bar Chart ── */
function SparklineChart({ data, label }) {
  const max = Math.max(...data, 1);
  return (
    <div className="sparkline-wrap">
      <h3>{label}</h3>
      <div className="sparkline-chart">
        {data.map((val, i) => (
          <div key={i} className="sparkline-bar-wrap">
            <div
              className="sparkline-bar"
              style={{ height: `${Math.round((val / max) * 100)}%` }}
              title={`${DAY_LABELS[i]}: ${val}`}
            />
            <span className="sparkline-label">{DAY_LABELS[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
        <span>Total this week: <strong style={{ color: 'var(--text-primary)' }}>{data.reduce((a, b) => a + b, 0)}</strong></span>
        <span>Peak: <strong style={{ color: 'var(--text-primary)' }}>{Math.max(...data)}/day</strong></span>
      </div>
    </div>
  );
}

/* ── Metric Card ── */
function MetricCard({ icon: Icon, value, label, trend, trendLabel, color }) {
  return (
    <div className="analytics-card">
      <div className="analytics-card__icon" style={color ? { color, borderColor: color, background: `${color}15` } : {}}>
        <Icon size={20} />
      </div>
      <div className="analytics-card__value">{value}</div>
      <div className="analytics-card__label">{label}</div>
      {trendLabel && (
        <div className={`analytics-card__trend analytics-card__trend--${trend}`}>
          {trend === 'up' ? '↑' : '↓'} {trendLabel}
        </div>
      )}
    </div>
  );
}

/* ── Main ── */
const DesignAnalytics = () => {
  useSEO('Design Analytics');

  const { data: bookings = [], isLoading, refetch } = useQuery({
    queryKey: ['designer_bookings'],
    queryFn: async () => {
      const res = await api.get('/design-workspace/bookings');
      return res.data || [];
    },
  });

  const { data: designers = [] } = useQuery({
    queryKey: ['designers_list'],
    queryFn: async () => {
      try {
        const res = await api.get('/admin/designers');
        return res.data?.designers || [];
      } catch { return []; }
    },
  });

  /* ── Computed metrics ── */
  const metrics = useMemo(() => {
    const total = bookings.length;
    const completed = bookings.filter(b => ['Approved', 'Delivered'].includes(b.status));
    const completedCount = completed.length;

    // Average time (created_at → updated_at in hours)
    const avgHours = completed.length > 0
      ? completed.reduce((sum, b) => {
          const start = b.created_at ? new Date(b.created_at) : null;
          const end   = b.updated_at ? new Date(b.updated_at) : null;
          if (!start || !end) return sum;
          return sum + Math.max(0, (end - start) / 3600000);
        }, 0) / completed.length
      : 0;

    const avgTimeDisplay = avgHours >= 24
      ? `${(avgHours / 24).toFixed(1)}d`
      : `${Math.round(avgHours)}h`;

    // On-time delivery % (delivered before or on due date)
    const withDueDate = completed.filter(b => b.due_date);
    const onTime = withDueDate.filter(b =>
      b.updated_at && new Date(b.updated_at) <= new Date(b.due_date)
    );
    const deliveryPct = withDueDate.length > 0
      ? Math.round((onTime.length / withDueDate.length) * 100)
      : 0;

    // Revision % (jobs that went back from Review to Designing)
    const revisionCount = bookings.filter(b => b.revision_count > 0).length;
    const revisionPct = total > 0 ? Math.round((revisionCount / total) * 100) : 0;

    // Designer leaderboard
    const leaderboard = designers
      .map(d => ({
        ...d,
        completed: bookings.filter(b =>
          (b.assigned_staff_id === d.id || b.designer_name === d.name) &&
          ['Approved', 'Delivered'].includes(b.status)
        ).length
      }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 5);

    return { total, completedCount, avgTimeDisplay, deliveryPct, revisionPct, leaderboard };
  }, [bookings, designers]);

  const weeklyData = useMemo(() => getWeeklyBuckets(bookings), [bookings]);

  /* ── Skeleton ── */
  if (isLoading) {
    return (
      <div className="analytics-page">
        <div className="analytics-grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-block" style={{ width: 44, height: 44, borderRadius: 12 }} />
              <div className="skeleton-block" style={{ width: 70, height: 36, borderRadius: 6 }} />
              <div className="skeleton-block" style={{ width: 100, height: 12, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">

      {/* ── Header ── */}
      <div className="designer-page-header">
        <div>
          <h1 className="designer-page-header__title">
            <BarChart2 size={22} /> Performance Analytics
          </h1>
          <p className="designer-page-header__subtitle">
            Based on {bookings.length} total bookings in the system
          </p>
        </div>
        <button className="quick-action-btn" onClick={() => refetch()} id="btn-refresh-analytics">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Metric Cards ── */}
      <div className="analytics-grid">
        <MetricCard
          icon={CheckCircle}
          value={metrics.completedCount}
          label="Jobs Completed"
          color="var(--success)"
          trend="up"
          trendLabel={`of ${metrics.total} total`}
        />
        <MetricCard
          icon={Clock}
          value={metrics.avgTimeDisplay}
          label="Avg Completion Time"
          color="var(--info)"
        />
        <MetricCard
          icon={RefreshCw}
          value={`${metrics.revisionPct}%`}
          label="Revision Rate"
          color={metrics.revisionPct > 30 ? 'var(--danger)' : 'var(--warning)'}
          trend={metrics.revisionPct > 30 ? 'down' : 'up'}
          trendLabel={metrics.revisionPct > 30 ? 'High — needs review' : 'Within target'}
        />
        <MetricCard
          icon={Target}
          value={`${metrics.deliveryPct}%`}
          label="On-Time Delivery"
          color={metrics.deliveryPct >= 80 ? 'var(--success)' : metrics.deliveryPct >= 60 ? 'var(--warning)' : 'var(--danger)'}
          trend={metrics.deliveryPct >= 80 ? 'up' : 'down'}
          trendLabel={metrics.deliveryPct >= 80 ? 'Great performance' : 'Needs improvement'}
        />
      </div>

      {/* ── Charts + Leaderboard ── */}
      <div className="designer-grid-2">

        {/* Weekly Trend Sparkline */}
        <SparklineChart data={weeklyData} label="Jobs Completed — Last 7 Days" />

        {/* Designer Leaderboard */}
        <div className="sparkline-wrap">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} /> Designer Leaderboard
          </h3>

          {metrics.leaderboard.length === 0 ? (
            <div className="empty-state-sm">
              <Star size={28} />
              <p>No designer data yet</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {metrics.leaderboard.map((d, i) => (
                <div key={d.id || i} className="leaderboard-row" id={`leaderboard-row-${i}`}>
                  <div className={`leaderboard-rank leaderboard-rank--${i + 1}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </div>
                  <div className="leaderboard-name">{d.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar-wrap" style={{ width: 80 }}>
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${metrics.leaderboard[0].completed > 0
                            ? Math.round((d.completed / metrics.leaderboard[0].completed) * 100)
                            : 0}%`
                        }}
                      />
                    </div>
                    <div className="leaderboard-score">
                      {d.completed}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Completion breakdown by status */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Queue Breakdown
            </div>
            {[
              { label: 'Waiting', key: 'Requested', color: 'var(--text-muted)' },
              { label: 'Assigned', key: 'Assigned', color: 'var(--info)' },
              { label: 'In Progress', key: 'Designing', color: 'var(--warning)' },
              { label: 'In Review', key: 'Review', color: '#8b5cf6' },
              { label: 'Approved', key: 'Approved', color: 'var(--success)' },
            ].map(({ label, key, color }) => {
              const count = bookings.filter(b => b.status === key).length;
              const pct = metrics.total > 0 ? Math.round((count / metrics.total) * 100) : 0;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 72, fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>{label}</div>
                  <div className="progress-bar-wrap" style={{ flex: 1 }}>
                    <div className="progress-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};

export default DesignAnalytics;

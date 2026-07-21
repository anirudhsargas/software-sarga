import { useState, useEffect, useCallback } from 'react'
import { Activity, Users, Shield, CheckCircle, XCircle, PlusCircle, Edit3, Trash2, ThumbsUp, TrendingUp, Clock, AlertTriangle, Loader2, BarChart3, PieChart, Calendar, RefreshCw, Building2, Monitor, Smartphone, Globe } from 'lucide-react'
import api from '../../services/api'
import PageContainer from '../../components/ui/PageContainer'
import './AuditTrail.css'

const STAT_CARDS = [
    { key: 'totalToday', label: 'Total Activities Today', icon: Activity, color: '#4361ee' },
    { key: 'totalLogins', label: 'Total Logins', icon: Users, color: '#3a86ff' },
    { key: 'failedLogins', label: 'Failed Logins', icon: XCircle, color: '#e63946' },
    { key: 'recordsCreated', label: 'Records Created', icon: PlusCircle, color: '#2ec4b6' },
    { key: 'recordsUpdated', label: 'Records Updated', icon: Edit3, color: '#ff9f1c' },
    { key: 'recordsDeleted', label: 'Records Deleted', icon: Trash2, color: '#e63946' },
    { key: 'approvals', label: 'Approvals Today', icon: ThumbsUp, color: '#06d6a0' },
]

function AuditDashboard() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [timeRange, setTimeRange] = useState('today')

    const loadStats = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const params = new URLSearchParams()
            if (timeRange === 'today') {
                const today = new Date().toISOString().slice(0, 10)
                params.set('date_from', today)
                params.set('date_to', today)
            }

            const res = await api.get(`/audit/stats?${params}`)
            if (res.data?.success) {
                setStats(res.data.data)
            }
        } catch (err) {
            setError('Failed to load audit dashboard')
        } finally {
            setLoading(false)
        }
    }, [timeRange])

    useEffect(() => {
        loadStats()
        const interval = setInterval(loadStats, 60000)
        return () => clearInterval(interval)
    }, [loadStats])

    if (loading && !stats) {
        return (
            <PageContainer>
                <div className="audit-dashboard-loading">
                    <Loader2 size={32} className="spin" />
                    <p>Loading audit dashboard...</p>
                </div>
            </PageContainer>
        )
    }

    if (error && !stats) {
        return (
            <PageContainer>
                <div className="audit-dashboard-error">
                    <AlertTriangle size={32} />
                    <p>{error}</p>
                    <button className="btn btn-primary" onClick={loadStats}>Retry</button>
                </div>
            </PageContainer>
        )
    }

    const maxModuleCount = Math.max(...(stats?.mostActiveModules || []).map(m => m.count), 1)
    const maxHourCount = Math.max(...(stats?.hourlyActivity || []).map(h => h.count), 1)

    return (
        <PageContainer>
            <div className="audit-page">
                <div className="audit-header">
                    <div className="audit-header-left">
                        <div className="audit-title-section">
                            <BarChart3 size={24} className="audit-title-icon" />
                            <div>
                                <h1 className="audit-title">Audit Dashboard</h1>
                                <p className="audit-subtitle">Real-time activity monitoring & analytics</p>
                            </div>
                        </div>
                    </div>
                    <div className="audit-header-actions">
                        <select
                            className="audit-time-select"
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value)}
                        >
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                        </select>
                        <button className="btn btn-secondary btn-sm" onClick={loadStats} disabled={loading}>
                            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
                        </button>
                    </div>
                </div>

                <div className="audit-stats-grid">
                    {STAT_CARDS.map(card => (
                        <div key={card.key} className="audit-stat-card">
                            <div className="audit-stat-icon" style={{ background: `${card.color}15`, color: card.color }}>
                                <card.icon size={22} />
                            </div>
                            <div className="audit-stat-info">
                                <span className="audit-stat-value">{stats?.[card.key]?.toLocaleString() || 0}</span>
                                <span className="audit-stat-label">{card.label}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="audit-dashboard-grid">
                    <div className="audit-chart-card">
                        <div className="audit-chart-header">
                            <h3>Most Active Modules</h3>
                            <Activity size={16} />
                        </div>
                        <div className="audit-chart-body">
                            {(stats?.mostActiveModules || []).length > 0 ? (
                                <div className="audit-bar-chart">
                                    {stats.mostActiveModules.map((m, i) => (
                                        <div key={m.module} className="audit-bar-row">
                                            <span className="audit-bar-label">{m.module}</span>
                                            <div className="audit-bar-track">
                                                <div
                                                    className="audit-bar-fill"
                                                    style={{
                                                        width: `${(m.count / maxModuleCount) * 100}%`,
                                                        background: `hsl(${220 + i * 25}, 70%, ${55 + i * 3}%)`
                                                    }}
                                                />
                                            </div>
                                            <span className="audit-bar-value">{m.count}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="audit-chart-empty">No module activity data</div>
                            )}
                        </div>
                    </div>

                    <div className="audit-chart-card">
                        <div className="audit-chart-header">
                            <h3>Hourly Activity Heatmap</h3>
                            <Clock size={16} />
                        </div>
                        <div className="audit-chart-body">
                            {(stats?.hourlyActivity || []).length > 0 ? (
                                <div className="audit-heatmap">
                                    {stats.hourlyActivity.map((h) => {
                                        const hour = h.hour ? new Date(h.hour + ':00').getHours() : 0
                                        const intensity = h.count / maxHourCount
                                        return (
                                            <div
                                                key={h.hour}
                                                className="audit-heatmap-cell"
                                                style={{
                                                    background: `rgba(67, 97, 238, ${0.1 + intensity * 0.9})`,
                                                }}
                                                title={`${h.hour}: ${h.count} activities`}
                                            >
                                                <span className="audit-heatmap-hour">{String(hour).padStart(2, '0')}:00</span>
                                                <span className="audit-heatmap-count">{h.count}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="audit-chart-empty">No hourly data available</div>
                            )}
                        </div>
                    </div>

                    <div className="audit-chart-card">
                        <div className="audit-chart-header">
                            <h3>Branch-wise Activity</h3>
                            <Building2 size={16} />
                        </div>
                        <div className="audit-chart-body">
                            {(stats?.branchActivity || []).length > 0 ? (
                                <div className="audit-bar-chart">
                                    {stats.branchActivity.map((b, i) => (
                                        <div key={b.branch || i} className="audit-bar-row">
                                            <span className="audit-bar-label">{b.branch}</span>
                                            <div className="audit-bar-track">
                                                <div
                                                    className="audit-bar-fill audit-bar-fill--branch"
                                                    style={{
                                                        width: `${(b.count / Math.max(...stats.branchActivity.map(x => x.count), 1)) * 100}%`
                                                    }}
                                                />
                                            </div>
                                            <span className="audit-bar-value">{b.count}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="audit-chart-empty">No branch activity data</div>
                            )}
                        </div>
                    </div>

                    <div className="audit-chart-card">
                        <div className="audit-chart-header">
                            <h3>Most Active Users</h3>
                            <Users size={16} />
                        </div>
                        <div className="audit-chart-body">
                            {(stats?.mostActiveUsers || []).length > 0 ? (
                                <div className="audit-user-list">
                                    {stats.mostActiveUsers.map((u, i) => (
                                        <div key={u.user_id_internal || i} className="audit-user-row">
                                            <div className="audit-user-rank">#{i + 1}</div>
                                            <div className="audit-user-avatar audit-user-avatar--sm">
                                                {u.employee_name?.[0] || '?'}
                                            </div>
                                            <div className="audit-user-details">
                                                <span className="audit-user-name">{u.employee_name || u.username || 'Unknown'}</span>
                                                <span className="audit-user-uname">@{u.username || 'N/A'}</span>
                                            </div>
                                            <span className="audit-user-count">{u.count} actions</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="audit-chart-empty">No user activity data</div>
                            )}
                        </div>
                    </div>
                </div>

                {(stats?.topErrors || []).length > 0 && (
                    <div className="audit-chart-card audit-card--full">
                        <div className="audit-chart-header">
                            <h3>Top Error Operations</h3>
                            <AlertTriangle size={16} className="audit-error-icon" />
                        </div>
                        <div className="audit-chart-body">
                            <table className="audit-error-table">
                                <thead>
                                    <tr>
                                        <th>Module</th>
                                        <th>Action</th>
                                        <th>Error</th>
                                        <th>Count</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.topErrors.map((e, i) => (
                                        <tr key={i}>
                                            <td><span className="audit-module-pill">{e.module}</span></td>
                                            <td><span className="audit-badge audit-badge--view">{e.action_type}</span></td>
                                            <td className="audit-error-msg">{e.error_message || 'Unknown error'}</td>
                                            <td><span className="audit-error-count">{e.count}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </PageContainer>
    )
}

export default AuditDashboard

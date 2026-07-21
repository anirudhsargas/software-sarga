import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, Filter, X, Download, ChevronDown, ChevronUp, Clock, User, Monitor, Globe, MapPin, CheckCircle, XCircle, AlertTriangle, Loader2, FileText, Table, FileJson, FileSpreadsheet, ExternalLink, Shield, Calendar, Layers, Activity, BarChart3, Eye, ChevronLeft, ChevronRight, Info, Hash, Smartphone, Laptop, Terminal, Maximize2, Minimize2, Copy, Check, RefreshCw } from 'lucide-react'
import api from '../../services/api'
import toast from 'react-hot-toast'
import PageContainer from '../../components/ui/PageContainer'
import './AuditTrail.css'

const ACTION_COLORS = {
    Create: 'audit-badge--create',
    Update: 'audit-badge--update',
    Delete: 'audit-badge--delete',
    Login: 'audit-badge--login',
    Logout: 'audit-badge--login',
    Approve: 'audit-badge--approve',
    Reject: 'audit-badge--approve',
    View: 'audit-badge--view',
    Print: 'audit-badge--view',
    Export: 'audit-badge--view',
    Import: 'audit-badge--create',
    Payment: 'audit-badge--payment',
    Cancel: 'audit-badge--delete',
    Restore: 'audit-badge--create',
}

const ACTION_ICONS = {
    Create: '+',
    Update: '~',
    Delete: '×',
    Login: '→',
    Logout: '←',
    Approve: '✓',
    Reject: '✗',
    View: '👁',
    Payment: '💰',
    Cancel: '⊘',
    Restore: '↩',
}

const MODULES = ['All', 'Authentication', 'Customer', 'Vendor', 'Inventory', 'Product', 'Paper Inventory', 'Purchase', 'Sales', 'Billing', 'Quotation', 'Payment', 'Expenses', 'Payroll', 'Attendance', 'Production', 'Users', 'Settings', 'Backup', 'Reports', 'Communication', 'AI Operations', 'Printing']
const ACTIONS = ['All', 'Create', 'Update', 'Delete', 'Login', 'Logout', 'View', 'Print', 'Export', 'Import', 'Approve', 'Reject', 'Payment', 'Cancel', 'Restore']

function AuditTrail() {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(true)
    const [selectedLog, setSelectedLog] = useState(null)
    const [showDetailPanel, setShowDetailPanel] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [copiedId, setCopiedId] = useState(null)

    const [filters, setFilters] = useState({
        search: '',
        module: 'All',
        action: 'All',
        status: 'All',
        user_id: '',
        branch_id: '',
        record_id: '',
        document_number: '',
        date_from: '',
        date_to: '',
    })

    const [filterOptions, setFilterOptions] = useState({
        modules: [],
        actions: [],
        users: [],
        branches: [],
    })

    const observerRef = useRef(null)
    const listRef = useRef(null)

    const loadLogs = useCallback(async (pageNum = 1, append = false) => {
        try {
            setLoading(true)
            const params = new URLSearchParams()
            params.set('page', pageNum)
            params.set('limit', 50)

            Object.entries(filters).forEach(([k, v]) => {
                if (v && v !== 'All') params.set(k, v)
            })

            const res = await api.get(`/audit/logs?${params}`)
            const result = res.data
            if (result.success) {
                if (append) {
                    setLogs(prev => [...prev, ...result.data])
                } else {
                    setLogs(result.data)
                }
                setTotal(result.pagination.total)
                setHasMore(pageNum < result.pagination.totalPages)
            }
        } catch (err) {
            toast.error('Failed to load audit logs')
        } finally {
            setLoading(false)
        }
    }, [filters])

    const loadFilterOptions = useCallback(async () => {
        try {
            const res = await api.get('/audit/filters')
            if (res.data?.success) {
                setFilterOptions(res.data.data)
            }
        } catch { }
    }, [])

    useEffect(() => {
        loadFilterOptions()
    }, [loadFilterOptions])

    useEffect(() => {
        setPage(1)
        loadLogs(1)
    }, [filters, loadLogs])

    const loadMore = useCallback(() => {
        if (loading || !hasMore) return
        const nextPage = page + 1
        setPage(nextPage)
        loadLogs(nextPage, true)
    }, [loading, hasMore, page, loadLogs])

    useEffect(() => {
        if (!observerRef.current || !listRef.current) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading) {
                    loadMore()
                }
            },
            { threshold: 0.1 }
        )
        const sentinel = observerRef.current
        if (sentinel) observer.observe(sentinel)
        return () => { if (sentinel) observer.unobserve(sentinel) }
    }, [hasMore, loading, loadMore])

    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }))
    }

    const clearFilters = () => {
        setFilters({
            search: '',
            module: 'All',
            action: 'All',
            status: 'All',
            user_id: '',
            branch_id: '',
            record_id: '',
            document_number: '',
            date_from: '',
            date_to: '',
        })
    }

    const hasActiveFilters = Object.entries(filters).some(([k, v]) => {
        if (k === 'search') return v !== ''
        if (k === 'module' || k === 'action' || k === 'status') return v !== 'All'
        return v !== ''
    })

    const openDetail = async (log) => {
        setSelectedLog(log)
        setShowDetailPanel(true)
    }

    const handleExport = async (format) => {
        setExporting(true)
        try {
            const params = new URLSearchParams()
            params.set('format', format)
            Object.entries(filters).forEach(([k, v]) => {
                if (v && v !== 'All') params.set(k, v)
            })

            const res = await api.get(`/audit/export?${params}`, {
                responseType: format === 'json' ? 'json' : 'text',
            })

            let blob
            let filename

            if (format === 'json') {
                blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
                filename = `audit-log-${new Date().toISOString().slice(0, 10)}.json`
            } else if (format === 'csv') {
                blob = new Blob([res.data], { type: 'text/csv' })
                filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
            }

            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            toast.success(`${format.toUpperCase()} exported successfully`)
        } catch (err) {
            toast.error('Export failed')
        } finally {
            setExporting(false)
        }
    }

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(text.slice(0, 8))
            setTimeout(() => setCopiedId(null), 2000)
        })
    }

    const formatTimestamp = (ts) => {
        if (!ts) return '-'
        const d = new Date(ts)
        return d.toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true
        })
    }

    const getActionIcon = (action) => {
        const map = {
            Create: <span className="audit-action-icon audit-action-icon--create">+</span>,
            Update: <span className="audit-action-icon audit-action-icon--update">~</span>,
            Delete: <span className="audit-action-icon audit-action-icon--delete">×</span>,
            Login: <span className="audit-action-icon audit-action-icon--login">→</span>,
            Logout: <span className="audit-action-icon audit-action-icon--login">←</span>,
            Approve: <span className="audit-action-icon audit-action-icon--approve">✓</span>,
            Reject: <span className="audit-action-icon audit-action-icon--approve">✗</span>,
            Payment: <span className="audit-action-icon audit-action-icon--payment">$</span>,
            Cancel: <span className="audit-action-icon audit-action-icon--delete">⊘</span>,
        }
        return map[action] || <span className="audit-action-icon audit-action-icon--view">•</span>
    }

    const getDeviceIcon = (device) => {
        if (!device || device === 'Unknown') return <Monitor size={14} />
        if (device === 'Mobile') return <Smartphone size={14} />
        if (device === 'Tablet') return <Laptop size={14} />
        return <Monitor size={14} />
    }

    const getStatusIcon = (success) => {
        return success ? <CheckCircle size={14} className="audit-status-icon audit-status-icon--success" /> : <XCircle size={14} className="audit-status-icon audit-status-icon--failed" />
    }

    const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
        if (k === 'search') return v !== ''
        if (k === 'module' || k === 'action' || k === 'status') return v !== 'All'
        return v !== ''
    }).length

    const modules = useMemo(() => {
        const all = ['All', ...(filterOptions.modules || [])]
        return [...new Set(all)]
    }, [filterOptions.modules])

    const actions = useMemo(() => {
        const all = ['All', ...(filterOptions.actions || [])]
        return [...new Set(all)]
    }, [filterOptions.actions])

    return (
        <PageContainer>
            <div className="audit-page">
                <div className="audit-header">
                    <div className="audit-header-left">
                        <div className="audit-title-section">
                            <Shield size={24} className="audit-title-icon" />
                            <div>
                                <h1 className="audit-title">Enterprise Audit Trail</h1>
                                <p className="audit-subtitle">Immutable record of all system activities • {total.toLocaleString()} total entries</p>
                            </div>
                        </div>
                    </div>
                    <div className="audit-header-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowFilters(!showFilters)}>
                            <Filter size={16} />
                            Filters{activeFilterCount > 0 && <span className="audit-filter-count">{activeFilterCount}</span>}
                        </button>
                        <div className="audit-export-group">
                            <button className="btn btn-secondary btn-sm" onClick={() => handleExport('csv')} disabled={exporting}>
                                {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} />} CSV
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleExport('json')} disabled={exporting}>
                                {exporting ? <Loader2 size={16} className="spin" /> : <FileJson size={16} />} JSON
                            </button>
                        </div>
                    </div>
                </div>

                {showFilters && (
                    <div className="audit-filters-panel">
                        <div className="audit-filters-grid">
                            <div className="audit-filter-field audit-filter-field--wide">
                                <label>Search</label>
                                <div className="audit-search-wrap">
                                    <Search size={16} className="audit-search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Search by user, module, document..."
                                        value={filters.search}
                                        onChange={(e) => handleFilterChange('search', e.target.value)}
                                        className="audit-search-input"
                                    />
                                    {filters.search && <button className="audit-clear-search" onClick={() => handleFilterChange('search', '')}><X size={14} /></button>}
                                </div>
                            </div>
                            <div className="audit-filter-field">
                                <label>Module</label>
                                <select value={filters.module} onChange={(e) => handleFilterChange('module', e.target.value)}>
                                    {modules.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div className="audit-filter-field">
                                <label>Action</label>
                                <select value={filters.action} onChange={(e) => handleFilterChange('action', e.target.value)}>
                                    {actions.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <div className="audit-filter-field">
                                <label>Status</label>
                                <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)}>
                                    <option value="All">All</option>
                                    <option value="success">Success</option>
                                    <option value="failed">Failed</option>
                                </select>
                            </div>
                            <div className="audit-filter-field">
                                <label>User ID</label>
                                <input type="text" placeholder="User ID" value={filters.user_id} onChange={(e) => handleFilterChange('user_id', e.target.value)} />
                            </div>
                            <div className="audit-filter-field">
                                <label>Branch</label>
                                <input type="text" placeholder="Branch ID" value={filters.branch_id} onChange={(e) => handleFilterChange('branch_id', e.target.value)} />
                            </div>
                            <div className="audit-filter-field">
                                <label>Record ID</label>
                                <input type="text" placeholder="Record ID" value={filters.record_id} onChange={(e) => handleFilterChange('record_id', e.target.value)} />
                            </div>
                            <div className="audit-filter-field">
                                <label>Document No</label>
                                <input type="text" placeholder="Invoice/Purchase No" value={filters.document_number} onChange={(e) => handleFilterChange('document_number', e.target.value)} />
                            </div>
                            <div className="audit-filter-field">
                                <label>From</label>
                                <input type="datetime-local" value={filters.date_from} onChange={(e) => handleFilterChange('date_from', e.target.value)} />
                            </div>
                            <div className="audit-filter-field">
                                <label>To</label>
                                <input type="datetime-local" value={filters.date_to} onChange={(e) => handleFilterChange('date_to', e.target.value)} />
                            </div>
                        </div>
                        {hasActiveFilters && (
                            <div className="audit-filters-actions">
                                <span className="audit-filters-count">{total.toLocaleString()} results</span>
                                <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear Filters</button>
                            </div>
                        )}
                    </div>
                )}

                <div className="audit-table-container">
                    <table className="audit-table">
                        <thead>
                            <tr>
                                <th className="audit-col-time">Timestamp</th>
                                <th className="audit-col-user">User</th>
                                <th className="audit-col-branch">Branch</th>
                                <th className="audit-col-module">Module</th>
                                <th className="audit-col-action">Action</th>
                                <th className="audit-col-record">Record</th>
                                <th className="audit-col-desc">Description</th>
                                <th className="audit-col-status">Status</th>
                                <th className="audit-col-device">Device</th>
                                <th className="audit-col-ip">IP Address</th>
                                <th className="audit-col-actions"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} className="audit-row" onClick={() => openDetail(log)}>
                                    <td className="audit-cell-time">
                                        <span className="audit-timestamp">{formatTimestamp(log.timestamp)}</span>
                                    </td>
                                    <td className="audit-cell-user">
                                        <div className="audit-user-info">
                                            <div className="audit-user-avatar">{log.employee_name?.[0] || '?'}</div>
                                            <div>
                                                <div className="audit-user-name">{log.employee_name || log.username || 'System'}</div>
                                                {log.user_role && <div className="audit-user-role">{log.user_role}</div>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="audit-cell-branch">
                                        <span className="audit-branch-pill">{log.branch_name || '-'}</span>
                                    </td>
                                    <td className="audit-cell-module">
                                        <span className="audit-module-pill">{log.module}</span>
                                    </td>
                                    <td className="audit-cell-action">
                                        <span className={`audit-badge ${ACTION_COLORS[log.action_type] || 'audit-badge--view'}`}>
                                            {getActionIcon(log.action_type)}
                                            {log.action_type}
                                        </span>
                                    </td>
                                    <td className="audit-cell-record">
                                        <div className="audit-record-info">
                                            <span className="audit-record-type">{log.record_type || '-'}</span>
                                            {log.document_number && <span className="audit-doc-no">{log.document_number}</span>}
                                        </div>
                                    </td>
                                    <td className="audit-cell-desc">
                                        <span className="audit-desc-text" title={log.error_message || log.reason_remarks || ''}>
                                            {log.action_type === 'Create' && `Created ${log.record_type || 'record'}`}
                                            {log.action_type === 'Update' && `Updated ${log.record_type || 'record'}`}
                                            {log.action_type === 'Delete' && `Deleted ${log.record_type || 'record'}`}
                                            {log.action_type === 'Login' && `Logged in`}
                                            {log.action_type === 'Logout' && `Logged out`}
                                            {log.action_type === 'Approve' && `Approved ${log.record_type || 'request'}`}
                                            {log.action_type === 'Reject' && `Rejected ${log.record_type || 'request'}`}
                                            {log.action_type === 'Payment' && `Payment ${log.document_number || ''}`}
                                            {!['Create', 'Update', 'Delete', 'Login', 'Logout', 'Approve', 'Reject', 'Payment'].includes(log.action_type) && `${log.action_type} ${log.record_type || ''}`}
                                            {log.error_message && <span className="audit-error-hint"> - {log.error_message}</span>}
                                        </span>
                                    </td>
                                    <td className="audit-cell-status">
                                        {getStatusIcon(log.success)}
                                    </td>
                                    <td className="audit-cell-device">
                                        <span className="audit-device-info" title={`${log.browser || ''} ${log.operating_system || ''}`}>
                                            {getDeviceIcon(log.device_name)}
                                            <span>{log.device_name || '-'}</span>
                                        </span>
                                    </td>
                                    <td className="audit-cell-ip">
                                        <code className="audit-ip">{log.ip_address || '-'}</code>
                                    </td>
                                    <td className="audit-cell-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); openDetail(log); }} title="View details">
                                            <Eye size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {loading && logs.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="audit-loading-cell">
                                        <div className="audit-loader">
                                            <Loader2 size={24} className="spin" />
                                            <span>Loading audit trail...</span>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {!loading && logs.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="audit-empty-cell">
                                        <div className="audit-empty">
                                            <Search size={40} />
                                            <h3>No audit records found</h3>
                                            <p>Try adjusting your search filters</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                    <div ref={observerRef} className="audit-sentinel">
                        {loading && logs.length > 0 && <Loader2 size={20} className="spin" />}
                        {!hasMore && logs.length > 0 && <span className="audit-end-msg">All records loaded</span>}
                    </div>
                </div>

                {showDetailPanel && selectedLog && (
                    <AuditDetailPanel log={selectedLog} onClose={() => setShowDetailPanel(false)} formatTimestamp={formatTimestamp} copyToClipboard={copyToClipboard} copiedId={copiedId} />
                )}
            </div>
        </PageContainer>
    )
}

function AuditDetailPanel({ log, onClose, formatTimestamp, copyToClipboard, copiedId }) {
    const [activeTab, setActiveTab] = useState('overview')

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Info },
        { id: 'changes', label: 'Changes', icon: Layers },
        { id: 'user', label: 'User Info', icon: User },
        { id: 'device', label: 'Device', icon: Monitor },
        { id: 'request', label: 'Request', icon: Terminal },
        { id: 'security', label: 'Security', icon: Shield },
    ]

    const parseJson = (data) => {
        if (!data) return null
        try {
            return typeof data === 'string' ? JSON.parse(data) : data
        } catch {
            return null
        }
    }

    const changedFields = parseJson(log.changed_fields)
    const previousValues = parseJson(log.previous_values)
    const newValues = parseJson(log.new_values)

    const formatValue = (val) => {
        if (val === null || val === undefined) return <span className="audit-null">null</span>
        if (typeof val === 'object') return <pre className="audit-json-pre">{JSON.stringify(val, null, 2)}</pre>
        return String(val)
    }

    return (
        <div className="audit-detail-overlay" onClick={onClose}>
            <div className="audit-detail-panel" onClick={(e) => e.stopPropagation()}>
                <div className="audit-detail-header">
                    <div className="audit-detail-title-section">
                        <Shield size={20} />
                        <div>
                            <h2 className="audit-detail-title">Audit Record Details</h2>
                            <span className="audit-detail-id">ID: {log.audit_id?.slice(0, 8)}...</span>
                        </div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className="audit-detail-tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            className={`audit-detail-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="audit-detail-body">
                    {activeTab === 'overview' && (
                        <div className="audit-detail-section">
                            <div className="audit-detail-grid">
                                <div className="audit-detail-field">
                                    <label>Timestamp</label>
                                    <span>{formatTimestamp(log.timestamp)}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Module</label>
                                    <span className="audit-module-pill">{log.module}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Action</label>
                                    <span className={`audit-badge ${ACTION_COLORS[log.action_type] || 'audit-badge--view'}`}>{log.action_type}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Status</label>
                                    <span className={log.success ? 'audit-status-success' : 'audit-status-failed'}>
                                        {log.success ? 'Success' : 'Failed'}
                                    </span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Record Type</label>
                                    <span>{log.record_type || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Record ID</label>
                                    <code>{log.record_id || '-'}</code>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Document Number</label>
                                    <span className="audit-doc-highlight">{log.document_number || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Duration</label>
                                    <span>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Department</label>
                                    <span>{log.department || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Branch</label>
                                    <span>{log.branch_name || '-'}</span>
                                </div>
                            </div>

                            {log.error_message && (
                                <div className="audit-detail-error">
                                    <AlertTriangle size={16} />
                                    <div>
                                        <strong>Error:</strong> {log.error_message}
                                    </div>
                                </div>
                            )}

                            {log.reason_remarks && (
                                <div className="audit-detail-remarks">
                                    <Info size={16} />
                                    <div>
                                        <strong>Remarks:</strong> {log.reason_remarks}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'changes' && (
                        <div className="audit-detail-section">
                            {changedFields && Object.keys(changedFields).length > 0 ? (
                                <div className="audit-changes-list">
                                    <div className="audit-changes-header">
                                        <h3>Changed Fields ({Object.keys(changedFields).length})</h3>
                                    </div>
                                    {Object.entries(changedFields).map(([field, change]) => (
                                        <div key={field} className="audit-change-item">
                                            <div className="audit-change-field">
                                                <code>{field}</code>
                                            </div>
                                            <div className="audit-change-values">
                                                <div className="audit-change-old">
                                                    <label>Previous</label>
                                                    <span>{formatValue(change.from ?? change.old)}</span>
                                                </div>
                                                <ChevronRight size={14} className="audit-change-arrow" />
                                                <div className="audit-change-new">
                                                    <label>New</label>
                                                    <span>{formatValue(change.to ?? change.new)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : previousValues && newValues ? (
                                <div className="audit-json-compare">
                                    <div className="audit-compare-column">
                                        <h3>Previous Values</h3>
                                        <pre className="audit-json-pre">{JSON.stringify(previousValues, null, 2)}</pre>
                                    </div>
                                    <div className="audit-compare-column">
                                        <h3>New Values</h3>
                                        <pre className="audit-json-pre">{JSON.stringify(newValues, null, 2)}</pre>
                                    </div>
                                </div>
                            ) : (
                                <div className="audit-no-data">
                                    <Layers size={32} />
                                    <p>No change data available for this action</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'user' && (
                        <div className="audit-detail-section">
                            <div className="audit-detail-grid">
                                <div className="audit-detail-field">
                                    <label>Employee Name</label>
                                    <span>{log.employee_name || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Username</label>
                                    <code>{log.username || '-'}</code>
                                </div>
                                <div className="audit-detail-field">
                                    <label>User ID (Internal)</label>
                                    <code>{log.user_id_internal || '-'}</code>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Role</label>
                                    <span className="audit-role-pill">{log.user_role || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Branch</label>
                                    <span>{log.branch_name || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Department</label>
                                    <span>{log.department || '-'}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'device' && (
                        <div className="audit-detail-section">
                            <div className="audit-detail-grid">
                                <div className="audit-detail-field">
                                    <label>Device</label>
                                    <span>{log.device_name || 'Unknown'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Browser</label>
                                    <span>{log.browser || 'Unknown'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Operating System</label>
                                    <span>{log.operating_system || 'Unknown'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>IP Address</label>
                                    <code>{log.ip_address || '-'}</code>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Latitude</label>
                                    <span>{log.latitude || '-'}</span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Longitude</label>
                                    <span>{log.longitude || '-'}</span>
                                </div>
                                {log.latitude && log.longitude && (
                                    <div className="audit-detail-field audit-detail-field--wide">
                                        <label>Location</label>
                                        <a href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`} target="_blank" rel="noopener noreferrer" className="audit-map-link">
                                            <MapPin size={14} /> View on Maps
                                        </a>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'request' && (
                        <div className="audit-detail-section">
                            <div className="audit-detail-grid">
                                <div className="audit-detail-field audit-detail-field--wide">
                                    <label>API Endpoint</label>
                                    <code className="audit-api-endpoint">{log.api_endpoint || '-'}</code>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Response Status</label>
                                    <span className={`audit-status-code ${log.response_status >= 400 ? 'audit-status-code--error' : log.response_status >= 300 ? 'audit-status-code--redirect' : 'audit-status-code--ok'}`}>
                                        {log.response_status || '-'}
                                    </span>
                                </div>
                                <div className="audit-detail-field">
                                    <label>Duration</label>
                                    <span>{log.duration_ms ? `${log.duration_ms}ms` : '-'}</span>
                                </div>
                                <div className="audit-detail-field audit-detail-field--wide">
                                    <label>Session ID (last 20 chars)</label>
                                    <code>{log.session_id || '-'}</code>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'security' && (
                        <div className="audit-detail-section">
                            <div className="audit-security-info">
                                <div className="audit-security-icon">
                                    <Shield size={24} />
                                </div>
                                <div className="audit-security-text">
                                    <h3>Hash Chain Verification</h3>
                                    <p>This record is cryptographically linked to the previous record using SHA-256 hashing, forming an immutable chain. Any tampering with past records will break the chain.</p>
                                </div>
                            </div>
                            <div className="audit-detail-grid">
                                <div className="audit-detail-field audit-detail-field--wide">
                                    <label>Current Hash</label>
                                    <div className="audit-hash-copy">
                                        <code className="audit-hash">{log.current_hash}</code>
                                        <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(log.current_hash)} title="Copy hash">
                                            {copiedId === log.current_hash?.slice(0, 8) ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="audit-detail-field audit-detail-field--wide">
                                    <label>Previous Hash</label>
                                    <div className="audit-hash-copy">
                                        <code className="audit-hash">{log.previous_hash}</code>
                                        <button className="btn btn-ghost btn-sm" onClick={() => copyToClipboard(log.previous_hash)} title="Copy previous hash">
                                            {copiedId === log.previous_hash?.slice(0, 8) ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="audit-detail-field audit-detail-field--wide">
                                    <label>Audit ID (UUID)</label>
                                    <code>{log.audit_id}</code>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="audit-detail-footer">
                    <span className="audit-detail-timestamp">Recorded at {formatTimestamp(log.timestamp)}</span>
                </div>
            </div>
        </div>
    )
}

export default AuditTrail

import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, ShieldCheck, RefreshCw, AlertTriangle, Play, FileSpreadsheet, Activity, Server, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';
import { useConfirm } from '../contexts/ConfirmContext';
import { useBranches } from '../contexts/BranchContext';
import '../styles/BackupSettings.css';

const BackupSettingsPage = () => {
  useSEO('Google Sheets Backup');

  const { confirm } = useConfirm();
  const { branches } = useBranches();

  // State variables
  const [health, setHealth] = useState({ status: 'checking', latency: 0 });
  const [status, setStatus] = useState({ enabled: true, lockStatus: false, syncTimes: {}, sheetId: '', jobs: [] });
  const [metrics, setMetrics] = useState({
    backup_jobs_running: 0,
    backup_rows_per_second: 0,
    backup_duration_seconds: 0,
    restore_failures_total: 0,
    sheet_api_latency_ms: 0
  });
  const [history, setHistory] = useState([]);
  
  // Integrity check state
  const [integrity, setIntegrity] = useState(null);
  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);

  // Loading states
  const [loading, setLoading] = useState({ health: true, status: true, history: true, metrics: true });
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [runningRestore, setRunningRestore] = useState(false);

  // Restore preparation state
  const [tableName, setTableName] = useState('RAW_Customers');
  const [restoreConfig, setRestoreConfig] = useState({
    dateStart: '',
    dateEnd: '',
    branchId: ''
  });
  const [stagedRestoreId, setStagedRestoreId] = useState(null);
  const [restoreToken, setRestoreToken] = useState(null);
  const [stagedPreview, setStagedPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [lastAppliedId, setLastAppliedId] = useState(null);
  
  // Expanded diff state
  const [expandedRowId, setExpandedRowId] = useState(null);

  const jobPollInterval = useRef(null);

  // Fetch Connection Health
  const fetchHealth = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, health: true }));
      const { data } = await api.get('/backup/health');
      setHealth(data);
    } catch (err) {
      setHealth({ status: 'unhealthy', error: err.response?.data?.message || err.message, latency: 0 });
    } finally {
      setLoading(prev => ({ ...prev, health: false }));
    }
  }, []);

  // Fetch Sync Threshold Status
  const fetchStatus = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, status: true }));
      const { data } = await api.get('/backup/status');
      setStatus(data);
    } catch {
      toast.error('Failed to load sync thresholds');
    } finally {
      setLoading(prev => ({ ...prev, status: false }));
    }
  }, []);

  // Fetch Audit History logs
  const fetchHistory = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, history: true }));
      const { data } = await api.get('/backup/history');
      setHistory(data || []);
    } catch {
      toast.error('Failed to load backup log history');
    } finally {
      setLoading(prev => ({ ...prev, history: false }));
    }
  }, []);

  // Fetch telemetry Metrics
  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(prev => ({ ...prev, metrics: true }));
      const { data } = await api.get('/backup/metrics');
      if (data.success) {
        setMetrics(data);
      }
    } catch {
      // Silently fail for metrics
    } finally {
      setLoading(prev => ({ ...prev, metrics: false }));
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchHealth();
    fetchStatus();
    fetchHistory();
    fetchMetrics();
  }, [fetchHealth, fetchStatus, fetchHistory, fetchMetrics]);

  useEffect(() => {
    refreshAll();
    return () => {
      if (jobPollInterval.current) clearInterval(jobPollInterval.current);
    };
  }, [refreshAll]);

  // Poll background job status
  const pollJobStatus = (jobId) => {
    if (jobPollInterval.current) clearInterval(jobPollInterval.current);
    setActiveJobId(jobId);
    setJobStatus('queued');

    jobPollInterval.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/backup/job/${jobId}`);
        if (data.success && data.job) {
          const jobState = data.job.status;
          setJobStatus(jobState);
          if (jobState === 'completed') {
            clearInterval(jobPollInterval.current);
            setActiveJobId(null);
            toast.success(`Backup job completed successfully! Synced ${data.job.rows_synced} rows.`);
            refreshAll();
          } else if (jobState === 'failed' || jobState === 'cancelled') {
            clearInterval(jobPollInterval.current);
            setActiveJobId(null);
            toast.error(`Backup job status: ${jobState.toUpperCase()}. ${data.job.error_message || ''}`);
            refreshAll();
          }
        }
      } catch (err) {
        clearInterval(jobPollInterval.current);
        setActiveJobId(null);
        toast.error('Failed to get background job status');
      }
    }, 2000); // Poll every 2 seconds
  };

  // Trigger Incremental Sync
  const handleIncrementalSync = async () => {
    try {
      const { data } = await api.post('/backup/run');
      if (data.success && data.jobId) {
        toast.success('Backup job queued in background');
        pollJobStatus(data.jobId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to queue backup');
    }
  };

  // Trigger Full Snapshot Sync Rebuild
  const handleFullSync = async () => {
    const confirmed = await confirm({
      title: 'Queue Full Snapshot Rebuild',
      message: 'This will rebuild all Google Sheets tabs using a complete database snapshot. The sync will process in the background. Proceed?',
      confirmText: 'Queue Rebuild',
      type: 'warning'
    });

    if (!confirmed) return;

    try {
      const { data } = await api.post('/backup/full');
      if (data.success && data.jobId) {
        toast.success('Full snapshot rebuild job queued in background');
        pollJobStatus(data.jobId);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to queue rebuild snapshot');
    }
  };

  // Step 1: Stage Google Sheets data for preview
  const handleStageRestore = async (e) => {
    e.preventDefault();
    setStagedRestoreId(null);
    setRestoreToken(null);
    setStagedPreview(null);
    setExpandedRowId(null);
    setLoadingPreview(true);

    const loadToast = toast.loading(`Reading ${tableName} from Sheets...`);
    try {
      const { data } = await api.post('/backup/restore/prepare', {
        tableName,
        ...restoreConfig
      });
      toast.dismiss(loadToast);
      
      if (data.success && data.restoreHistoryId) {
        setStagedRestoreId(data.restoreHistoryId);
        setRestoreToken(data.restoreToken);
        // Fetch preview changes
        const previewRes = await api.get(`/backup/restore/preview/${data.restoreHistoryId}`);
        if (previewRes.data.success) {
          setStagedPreview(previewRes.data);
          toast.success('Sheets data successfully staged. Review changes below!');
        }
      }
    } catch (err) {
      toast.dismiss(loadToast);
      toast.error(err.response?.data?.message || 'Failed to load and stage sheets data');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Step 2: Apply staged recovery
  const handleApplyRestore = async () => {
    if (!stagedRestoreId || !restoreToken) return;

    const confirmed = await confirm({
      title: 'Apply Database Recovery',
      message: `Are you sure you want to commit these staged changes? A rollback snapshot will be automatically saved prior to application.`,
      confirmText: 'Commit Recovery',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      setRunningRestore(true);
      const applyToast = toast.loading('Applying staged recovery update...');
      const { data } = await api.post('/backup/restore/apply', {
        restoreHistoryId: stagedRestoreId,
        restoreToken: restoreToken
      });
      toast.dismiss(applyToast);
      
      toast.success(data.message || 'Recovery committed successfully!');
      setLastAppliedId(stagedRestoreId);
      setStagedRestoreId(null);
      setRestoreToken(null);
      setStagedPreview(null);
      setExpandedRowId(null);
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Restoration apply failed');
    } finally {
      setRunningRestore(false);
    }
  };

  // Step 3: Rollback applied recovery
  const handleRollbackRestore = async () => {
    if (!lastAppliedId) return;

    const confirmed = await confirm({
      title: 'Rollback Database Restoration',
      message: 'Are you sure you want to revert all changes from this restoration session? The database will be returned to its pre-restore state.',
      confirmText: 'Rollback Now',
      type: 'danger'
    });

    if (!confirmed) return;

    try {
      setRunningRestore(true);
      const rollbackToast = toast.loading('Rolling back database changes...');
      const { data } = await api.post('/backup/restore/rollback', {
        restoreHistoryId: lastAppliedId
      });
      toast.dismiss(rollbackToast);
      
      toast.success(data.message || 'Database successfully rolled back!');
      setLastAppliedId(null);
      refreshAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Rollback failed');
    } finally {
      setRunningRestore(false);
    }
  };

  // Real-time backup integrity verification trigger
  const handleVerifyIntegrity = async () => {
    try {
      setVerifyingIntegrity(true);
      const verifyToast = toast.loading('Running backup integrity check...');
      const { data } = await api.get('/backup/verify');
      toast.dismiss(verifyToast);
      
      if (data.success) {
        setIntegrity(data);
        if (data.healthy) {
          toast.success(`Integrity check passed! MySQL rows match Google Sheets count.`);
        } else {
          toast.error(`Integrity check failed. Mismatch detected between MySQL and Google Sheets.`);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to run integrity verification');
    } finally {
      setVerifyingIntegrity(false);
    }
  };

  // Column Diff generator for modified staged previews
  const getDiffFields = (before, after) => {
    if (!before || !after) return [];
    
    let beforeObj = typeof before === 'string' ? JSON.parse(before) : before;
    let afterObj = typeof after === 'string' ? JSON.parse(after) : after;
    
    const diffs = [];
    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);
    
    for (const key of allKeys) {
      if (['created_at', 'updated_at'].includes(key)) continue;
      
      let bVal = beforeObj[key];
      let aVal = afterObj[key];
      
      if (typeof bVal === 'object' && bVal !== null) bVal = JSON.stringify(bVal);
      if (typeof aVal === 'object' && aVal !== null) aVal = JSON.stringify(aVal);
      
      if (String(bVal) !== String(aVal) && !(bVal === null && aVal === '')) {
        diffs.push({
          name: key,
          before: bVal === null || bVal === undefined ? '[NULL]' : bVal,
          after: aVal === null || aVal === undefined ? '[NULL]' : aVal
        });
      }
    }
    return diffs;
  };

  const isBackupActive = status.enabled !== false;

  return (
    <PageContainer>
      <div className="backup-page">
        {/* Page header title */}
        <div>
          <h1 className="section-title">Google Sheets Backup & Reports</h1>
          <p className="section-subtitle">Manage service accounts, queue background jobs, review staging recovery previews, and monitor metrics.</p>
        </div>

        {/* Warning banner when backup service is disabled */}
        {!isBackupActive && (
          <div className="health-status-bar" style={{ background: 'rgba(239, 68, 68, 0.08)', borderColor: 'rgba(239, 68, 68, 0.3)', marginBottom: '1.25rem' }}>
            <AlertTriangle size={20} style={{ color: '#ef4444' }} />
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ef4444' }}>Google Sheets Backup Service is Disabled</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
                Required configurations or credentials are missing, or a startup connection error occurred. Backups and recovery features are currently deactivated.
              </div>
            </div>
          </div>
        )}

        {/* Rollback warning banner right after successful restoration apply */}
        {lastAppliedId && (
          <div className="health-status-bar" style={{ background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.3)', marginBottom: '1.25rem' }}>
            <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f59e0b' }}>Restoration Committed Successfully</span>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
                  A pre-restore database snapshot has been stored in restoration logs. You can rollback this action to revert the changes.
                </div>
              </div>
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleRollbackRestore}
                disabled={runningRestore}
                style={{ background: '#f59e0b', color: '#000', border: 'none', marginLeft: '1rem' }}
              >
                Rollback Restore
              </button>
            </div>
          </div>
        )}

        {/* Metrics KPI widgets */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          <div className="backup-card" style={{ padding: '1.25rem', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>System Health</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Server size={18} className="text-secondary" />
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: !isBackupActive ? 'var(--muted)' : (health.status === 'healthy' ? '#10b981' : '#ef4444') }}>
                {!isBackupActive ? 'Disabled' : (health.status === 'healthy' ? 'Healthy' : 'Unhealthy')}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {isBackupActive ? `API Latency: ${metrics.sheet_api_latency_ms}ms` : 'Check Server Logs'}
            </span>
          </div>

          <div className="backup-card" style={{ padding: '1.25rem', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>Active Workers</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={18} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {isBackupActive ? `${metrics.backup_jobs_running} running` : 'N/A'}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Non-blocking queue</span>
          </div>

          <div className="backup-card" style={{ padding: '1.25rem', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>Backup Sync Speed</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                {isBackupActive ? `${metrics.backup_rows_per_second} rows/s` : 'N/A'}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
              {isBackupActive ? `Avg Duration: ${metrics.backup_duration_seconds}s` : '-'}
            </span>
          </div>

          <div className="backup-card" style={{ padding: '1.25rem', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>Failed/Rolled Restores</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldCheck size={18} style={{ color: metrics.restore_failures_total > 0 ? '#ef4444' : '#10b981' }} />
              <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {isBackupActive ? `${metrics.restore_failures_total} reverted` : 'N/A'}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>DR rollback count</span>
          </div>
        </div>

        {/* Sync Progress Indicator when a background job is running */}
        {activeJobId && (
          <div className="health-status-bar" style={{ background: 'rgba(99, 102, 241, 0.08)', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
            <RefreshCw size={18} className="animate-spin text-secondary" style={{ color: '#6366f1' }} />
            <div>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sync job #{activeJobId} is running in background...</span>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
                Status: <strong style={{ color: '#6366f1', textTransform: 'uppercase' }}>{jobStatus}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', margin: '0.75rem 0' }}>
          <button
            className="btn btn-primary"
            onClick={handleIncrementalSync}
            disabled={activeJobId !== null || runningRestore}
            style={{ justifyContent: 'center', gap: '8px', flex: 1 }}
          >
            <Play size={16} />
            Run Backup Now
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleFullSync}
            disabled={activeJobId !== null || runningRestore}
            style={{ justifyContent: 'center', gap: '8px', flex: 1 }}
          >
            <RefreshCw size={16} />
            Full Snapshot Rebuild
          </button>
        </div>

        {/* Central Operations panels grid */}
        <div className="backup-grid">
          
          {/* Card 1: Trigger Backups */}
          <div className="backup-card">
            <div className="backup-card-header">
              <Database size={18} className="backup-card-icon" />
              <h3 className="backup-card-title">Sync Operations</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: 0 }}>
              Queue background synchronization worker jobs. These are processed asynchronously without blocking web API latency.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
              <button 
                className="btn btn-secondary" 
                onClick={handleVerifyIntegrity} 
                disabled={!isBackupActive || activeJobId !== null || runningRestore || verifyingIntegrity}
                style={{ justifyContent: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                {verifyingIntegrity ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                Verify Backup Integrity
              </button>
            </div>
            {isBackupActive && status.sheetId && (
              <a 
                href={`https://docs.google.com/spreadsheets/d/${status.sheetId}`} 
                target="_blank" 
                rel="noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ justifyContent: 'center', gap: '6px', fontSize: '0.85rem' }}
              >
                <FileSpreadsheet size={16} />
                Open Google Sheets Panel
              </a>
            )}
          </div>

          {/* Card 2: Restore / Recovery (Staged) */}
          <div className="backup-card">
            <div className="backup-card-header">
              <AlertTriangle size={18} className="backup-card-icon" style={{ color: 'var(--text-error, #ef4444)' }} />
              <h3 className="backup-card-title">Staged Data Recovery</h3>
            </div>
            <form onSubmit={handleStageRestore} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="backup-input-group">
                <label className="backup-input-label">Select Table Source</label>
                <select 
                  className="input-field"
                  value={tableName}
                  onChange={e => { setTableName(e.target.value); setStagedPreview(null); setExpandedRowId(null); }}
                  disabled={!isBackupActive}
                >
                  <option value="RAW_Customers">RAW_Customers (sarga_customers)</option>
                  <option value="RAW_Jobs">RAW_Jobs (sarga_jobs)</option>
                  <option value="RAW_Bills">RAW_Bills (sarga_bills_documents)</option>
                  <option value="RAW_Inventory">RAW_Inventory (sarga_inventory)</option>
                  <option value="RAW_Expenses">RAW_Expenses (sarga_payments)</option>
                  <option value="RAW_Vendors">RAW_Vendors (vendors)</option>
                  <option value="RAW_Staff">RAW_Staff (sarga_staff)</option>
                  <option value="RAW_Attendance">RAW_Attendance (sarga_staff_attendance)</option>
                  <option value="RAW_Payments">RAW_Payments (sarga_customer_payments)</option>
                  <option value="RAW_Orders">RAW_Orders (sarga_orders)</option>
                  <option value="RAW_Designs">RAW_Designs (sarga_customer_designs)</option>
                </select>
              </div>
              <div className="backup-input-group">
                <label className="backup-input-label">Select Branch Filter</label>
                <select 
                  className="input-field" 
                  value={restoreConfig.branchId} 
                  onChange={e => setRestoreConfig(prev => ({ ...prev, branchId: e.target.value }))}
                  disabled={!isBackupActive}
                >
                  <option value="">All Branches</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="backup-input-group">
                  <label className="backup-input-label">Date Start</label>
                  <input 
                    type="date" 
                    className="input-field" 
                    value={restoreConfig.dateStart}
                    onChange={e => setRestoreConfig(prev => ({ ...prev, dateStart: e.target.value }))}
                    disabled={!isBackupActive}
                  />
                </div>
                <div className="backup-input-group">
                  <label className="backup-input-label">Date End</label>
                  <input 
                    type="date" 
                    className="input-field" 
                    value={restoreConfig.dateEnd}
                    onChange={e => setRestoreConfig(prev => ({ ...prev, dateEnd: e.target.value }))}
                    disabled={!isBackupActive}
                  />
                </div>
              </div>
              <button 
                type="submit" 
                className="btn btn-secondary" 
                disabled={!isBackupActive || activeJobId !== null || runningRestore || health.status !== 'healthy' || loadingPreview}
                style={{ justifyContent: 'center', gap: '8px', marginTop: '0.5rem' }}
              >
                {loadingPreview ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                Load & Stage Sheets Data
              </button>
            </form>
          </div>

          {/* Card 3: Sheets Last Synced times */}
          <div className="backup-card">
            <div className="backup-card-header">
              <Activity size={18} className="backup-card-icon" style={{ color: '#10b981' }} />
              <h3 className="backup-card-title">Sync Thresholds</h3>
            </div>
            <div className="table-status-list">
              {loading.status ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                  <Loader spinner className="animate-spin" />
                </div>
              ) : !isBackupActive || Object.keys(status.syncTimes).length === 0 ? (
                <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)', padding: '1rem' }}>
                  {!isBackupActive ? 'Backup module is disabled.' : 'No backup thresholds established. Run sync to initialize.'}
                </p>
              ) : (
                Object.entries(status.syncTimes).map(([name, val]) => (
                  <div className="table-status-row" key={name}>
                    <span className="table-status-name">{name}</span>
                    <span className="table-status-time" title={`Last Sync Threshold: ${val.last_sync_time}`}>
                      {val.last_sync_time.split(' ')[0]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Restoration Preview Panel (Shows up when sheets data is staged) */}
        {stagedPreview && (
          <div className="logs-section" style={{ background: 'rgba(239, 68, 68, 0.03)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} style={{ color: '#ef4444' }} />
                <h3 className="backup-card-title">Staged Restoration Preview: {stagedPreview.tableName}</h3>
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Staged changes: <strong>{stagedPreview.counts.total} rows</strong>
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginTop: '0.8rem' }}>
              
              {/* Added rows */}
              <div className="backup-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#10b981', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Rows to Insert (New)</span>
                  <span>{stagedPreview.counts.added} rows</span>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                  {stagedPreview.added.length === 0 ? (
                    <div>No new rows will be inserted.</div>
                  ) : (
                    stagedPreview.added.map(r => (
                      <div key={r.id} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        ID {r.id}: {r.name}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modified rows */}
              <div className="backup-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f59e0b', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Rows to Overwrite (Modified)</span>
                  <span>{stagedPreview.counts.modified} rows</span>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                  {stagedPreview.modified.length === 0 ? (
                    <div>No existing rows will be modified.</div>
                  ) : (
                    stagedPreview.modified.map(r => (
                      <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div 
                          style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer', fontWeight: 500 }}
                          onClick={() => setExpandedRowId(expandedRowId === r.id ? null : r.id)}
                        >
                          <span>ID {r.id}: {r.name}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>
                            {expandedRowId === r.id ? 'Hide changes' : 'View diff'}
                          </span>
                        </div>
                        {expandedRowId === r.id && (
                          <div style={{ marginTop: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto' }}>
                            <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                  <th style={{ textAlign: 'left', padding: '4px' }}>Field</th>
                                  <th style={{ textAlign: 'left', padding: '4px', color: '#f59e0b' }}>Current DB</th>
                                  <th style={{ textAlign: 'left', padding: '4px', color: '#10b981' }}>Sheets Backup</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getDiffFields(r.before, r.after).map(field => (
                                  <tr key={field.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                    <td style={{ fontWeight: 600, padding: '4px' }}>{field.name}</td>
                                    <td style={{ color: 'var(--muted)', padding: '4px', wordBreak: 'break-all' }}>{String(field.before)}</td>
                                    <td style={{ color: '#10b981', padding: '4px', wordBreak: 'break-all' }}>{String(field.after)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Deleted rows */}
              <div className="backup-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ef4444', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Rows to Delete (Missing in Sheets)</span>
                  <span>{stagedPreview.counts.deleted || 0} rows</span>
                </div>
                <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                  {!stagedPreview.deleted || stagedPreview.deleted.length === 0 ? (
                    <div>No rows will be deleted.</div>
                  ) : (
                    stagedPreview.deleted.map(r => (
                      <div key={r.id} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        ID {r.id}: {r.name}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button 
                className="btn btn-ghost btn-sm"
                onClick={() => { setStagedRestoreId(null); setStagedPreview(null); setExpandedRowId(null); }}
                disabled={runningRestore}
              >
                Cancel Staging
              </button>
              <button 
                className="btn btn-secondary btn--danger"
                onClick={handleApplyRestore}
                disabled={runningRestore || (stagedPreview.counts.added === 0 && stagedPreview.counts.modified === 0 && stagedPreview.counts.deleted === 0)}
                style={{ gap: '6px' }}
              >
                <ShieldCheck size={16} />
                Apply Restore changes to DB
              </button>
            </div>
          </div>
        )}

        {/* Section: Logging & Sync Audit Trail */}
        <div className="logs-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="backup-card-title">Synchronization Logs</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Shows last 100 sync processes</span>
          </div>
          
          <div className="logs-table-wrapper">
            {loading.history ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader spinner className="animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--muted)', padding: '2rem' }}>
                No synchronization logs recorded in database.
              </p>
            ) : (
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Sync Type</th>
                    <th>Status</th>
                    <th>Rows Synced</th>
                    <th>Latency</th>
                    <th>Checksum (SHA-256)</th>
                    <th>Error Details</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td>
                        <span className={`badge ${log.sync_type}`}>
                          {log.sync_type}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${log.status}`}>
                          {log.status}
                        </span>
                      </td>
                      <td>{log.rows_synced}</td>
                      <td>{log.latency_ms}ms</td>
                      <td>
                        {log.checksum_hash ? (
                          <span 
                            title={log.checksum_hash} 
                            style={{ fontFamily: 'monospace', fontSize: '0.75rem', cursor: 'help', borderBottom: '1px dotted rgba(255,255,255,0.3)', paddingBottom: '1px' }}
                          >
                            {log.checksum_hash.slice(0, 8)}...
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.error_message}>
                        {log.error_message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Section: Console Diagnostic Logs */}
        <div className="logs-section" style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={16} className="text-secondary" />
            <h3 className="backup-card-title" style={{ fontSize: '1rem' }}>Console Diagnostics</h3>
          </div>
          <div className="console-box">
            <div className="console-line">[System] Backup System initialized</div>
            {loading.health ? (
              <div className="console-line" style={{ color: '#f59e0b' }}>[System] Checking credentials...</div>
            ) : health.status === 'credentials_missing' ? (
              <div className="console-line" style={{ color: '#ef4444' }}>
                [System] Credentials: NOT CONFIGURED — Add GOOGLE_SERVICE_ACCOUNT to env
              </div>
            ) : health.status === 'credentials_invalid' ? (
              <div className="console-line" style={{ color: '#ef4444' }}>
                [System] Credentials: INVALID — {health.message}
              </div>
            ) : health.status === 'sheet_id_missing' ? (
              <div className="console-line" style={{ color: '#ef4444' }}>
                [System] Sheet ID: GOOGLE_SHEET_ID not configured
              </div>
            ) : health.status === 'sheet_not_shared' ? (
              <div className="console-line" style={{ color: '#ef4444' }}>
                [System] Sheet: Not accessible — {health.message}
              </div>
            ) : health.serviceAccount ? (
              <div className="console-line" style={{ color: '#10b981' }}>
                [System] Credentials: CONFIGURED — Service Account: {health.serviceAccount}
              </div>
            ) : health.status === 'healthy' ? (
              <div className="console-line" style={{ color: '#10b981' }}>
                [System] Credentials: CONFIGURED
              </div>
            ) : null}
            {health.sheetTitle ? (
              <div className="console-line" style={{ color: '#10b981' }}>
                [System] Sheet: &quot;{health.sheetTitle}&quot; (latency: {health.latency}ms)
              </div>
            ) : null}
            {health.status === 'healthy' && health.latency ? (
              <div className="console-line" style={{ color: '#10b981' }}>
                [System] API Latency: {health.latency}ms
              </div>
            ) : null}
            {health.status === 'api_error' && health.message ? (
              <div className="console-line" style={{ color: '#ef4444' }}>
                [System] API Error: {health.message}
              </div>
            ) : null}
            <div className="console-line">
              [System] Last backup: {status.jobs && status.jobs.length > 0
                ? status.jobs[0].status === 'completed'
                  ? `${new Date(status.jobs[0].completed_at).toLocaleString()} (completed, ${status.jobs[0].rows_written} rows)`
                  : `${new Date(status.jobs[0].started_at).toLocaleString()} (${status.jobs[0].status})`
                : 'Never'}
            </div>
            {history.slice(0, 3).map((log, idx) => (
              <div className="console-line" key={idx} style={{ color: log.status === 'failed' ? '#ef4444' : '#10b981' }}>
                [{new Date(log.created_at).toLocaleTimeString()}] Sync {log.sync_type.toUpperCase()} completed with status {log.status.toUpperCase()} ({log.rows_synced} rows in {log.latency_ms}ms)
              </div>
            ))}
          </div>
        </div>

      </div>
    </PageContainer>
  );
};

const Loader = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
    <line x1="12" y1="2" x2="12" y2="6"></line>
    <line x1="12" y1="18" x2="12" y2="22"></line>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
    <line x1="2" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="22" y2="12"></line>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
  </svg>
);

export default BackupSettingsPage;

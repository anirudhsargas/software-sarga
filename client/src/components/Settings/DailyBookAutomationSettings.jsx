import React, { useState, useEffect } from 'react';
import { Save, Clock, Users, Mail, BellRing, Settings as SettingsIcon, AlertCircle, PlayCircle, Loader2 } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function DailyBookAutomationSettings() {
    const [settings, setSettings] = useState({
        is_enabled: false,
        send_time: '20:00:00',
        timezone: 'Asia/Kolkata',
        days_of_week: '1-6',
        recipients_admin: '',
        recipients_accounts: '',
        recipients_cc: '',
        recipients_bcc: '',
        format_pdf: true,
        format_excel: true,
        format_html: true,
        retry_enabled: true,
        max_retries: 3
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [triggering, setTriggering] = useState(false);
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState(null);

    useEffect(() => {
        fetchSettings();
        fetchStatus();
        fetchLogs();
    }, []);

    const fetchSettings = async () => {
        try {
            const { data } = await api.get('/settings/daily-book');
            if (Object.keys(data).length > 0) {
                setSettings({
                    ...data,
                    format_pdf: !!data.format_pdf,
                    format_excel: !!data.format_excel,
                    format_html: !!data.format_html,
                    retry_enabled: !!data.retry_enabled,
                    is_enabled: !!data.is_enabled
                });
            }
            setLoading(false);
        } catch (err) {
            toast.error('Failed to load automation settings');
            setLoading(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const { data } = await api.get('/settings/daily-book/logs');
            setLogs(data);
        } catch (err) {
            console.error('Failed to load logs');
        }
    };

    const fetchStatus = async () => {
        try {
            const { data } = await api.get('/settings/daily-book/status');
            setStatus(data);
        } catch (err) {
            console.error('Failed to fetch status');
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.put('/settings/daily-book', settings);
            toast.success('Automation settings saved and scheduled');
            fetchStatus();
        } catch (err) {
            toast.error('Failed to save settings');
        }
        setSaving(false);
    };

    const handleTriggerTest = async () => {
        setTriggering(true);
        toast.loading('Running test report...', { id: 'test-trigger' });
        try {
            const res = await api.post('/settings/daily-book/trigger', { isTest: true, forceRun: true });
            toast.success(res.data.message || 'Test triggered successfully', { id: 'test-trigger' });
            fetchLogs();
        } catch (err) {
            toast.error('Test trigger failed: ' + (err.response?.data?.error || err.message), { id: 'test-trigger' });
        }
        setTriggering(false);
    };

    if (loading) return <div className="sp-spinner-wrap"><Loader2 size={24} className="animate-spin" /></div>;

    return (
        <div className="sp-card" style={{ maxWidth: 800 }}>
            <div className="sp-section-header">
                <BellRing size={20} className="text-accent" />
                <h3 className="sp-card-title">Daily Book Automation</h3>
            </div>
            <p className="sp-note">Configure the automated end-of-day reports sent to administrators and accountants.</p>

            <div className="sp-grid sp-grid--1" style={{ marginTop: 24, padding: 16, background: 'var(--bg-light)', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <h4 style={{ margin: 0, fontWeight: 600 }}>Enable Automation</h4>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Automatically generate and send the daily book.</p>
                    </div>
                    <label className="sp-switch">
                        <input 
                            type="checkbox" 
                            checked={settings.is_enabled} 
                            onChange={e => setSettings(s => ({ ...s, is_enabled: e.target.checked }))} 
                        />
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{settings.is_enabled ? 'Active' : 'Disabled'}</span>
                    </label>
                </div>
            </div>

            <div className="sp-grid sp-grid--2" style={{ marginTop: 24 }}>
                <div className="sp-field">
                    <label className="sp-label"><Clock size={14} style={{ display: 'inline', marginRight: 4 }} /> Dispatch Time</label>
                    <input 
                        type="time" 
                        value={settings.send_time} 
                        onChange={e => setSettings(s => ({ ...s, send_time: e.target.value }))} 
                        className="sp-input" 
                    />
                    <p className="sp-note" style={{ marginTop: 4 }}>Default is 20:00 (8:00 PM).</p>
                </div>
                <div className="sp-field">
                    <label className="sp-label"><SettingsIcon size={14} style={{ display: 'inline', marginRight: 4 }} /> Timezone</label>
                    <select 
                        value={settings.timezone} 
                        onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))} 
                        className="sp-input"
                    >
                        <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                        <option value="UTC">UTC</option>
                    </select>
                </div>
            </div>

            <div className="sp-section-header" style={{ marginTop: 24 }}>
                <Mail size={18} className="text-accent" />
                <h4 style={{ margin: 0, fontWeight: 600 }}>Recipients</h4>
            </div>

            <div className="sp-grid sp-grid--2">
                <div className="sp-field">
                    <label className="sp-label">Admin Emails</label>
                    <input 
                        value={settings.recipients_admin} 
                        onChange={e => setSettings(s => ({ ...s, recipients_admin: e.target.value }))} 
                        className="sp-input" 
                        placeholder="Comma separated emails"
                    />
                </div>
                <div className="sp-field">
                    <label className="sp-label">Accountant Emails</label>
                    <input 
                        value={settings.recipients_accounts} 
                        onChange={e => setSettings(s => ({ ...s, recipients_accounts: e.target.value }))} 
                        className="sp-input" 
                        placeholder="Comma separated emails"
                    />
                </div>
            </div>

            <div className="sp-section-header" style={{ marginTop: 24 }}>
                <SettingsIcon size={18} className="text-accent" />
                <h4 style={{ margin: 0, fontWeight: 600 }}>Formats & Retry Logic</h4>
            </div>

            <div className="sp-grid sp-grid--2" style={{ gap: 16 }}>
                <div>
                    <label className="sp-switch" style={{ display: 'flex', marginBottom: 10 }}>
                        <input type="checkbox" checked={settings.format_pdf} onChange={e => setSettings(s => ({ ...s, format_pdf: e.target.checked }))} />
                        <span>Include PDF Attachment</span>
                    </label>
                    <label className="sp-switch" style={{ display: 'flex', marginBottom: 10 }}>
                        <input type="checkbox" checked={settings.format_excel} onChange={e => setSettings(s => ({ ...s, format_excel: e.target.checked }))} />
                        <span>Include Excel Attachment</span>
                    </label>
                </div>
                <div>
                    <label className="sp-switch" style={{ display: 'flex', marginBottom: 10 }}>
                        <input type="checkbox" checked={settings.retry_enabled} onChange={e => setSettings(s => ({ ...s, retry_enabled: e.target.checked }))} />
                        <span>Enable Auto-Retry on Failure</span>
                    </label>
                    <div className="sp-field">
                        <label className="sp-label" style={{ fontSize: 12 }}>Max Retries</label>
                        <select 
                            value={settings.max_retries} 
                            onChange={e => setSettings(s => ({ ...s, max_retries: Number(e.target.value) }))} 
                            className="sp-input"
                            disabled={!settings.retry_enabled}
                            style={{ padding: '4px 8px', height: 32 }}
                        >
                            <option value={1}>1 time</option>
                            <option value={3}>3 times</option>
                            <option value={5}>5 times</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="sp-actions" style={{ marginTop: 32, justifyContent: 'space-between' }}>
                <button onClick={handleTriggerTest} disabled={triggering} className="btn btn-ghost" style={{ color: 'var(--accent)' }}>
                    {triggering ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />} 
                    Run Test Now
                </button>
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} 
                    Save Automation Settings
                </button>
            </div>

            {/* Execution Logs */}
            <div style={{ marginTop: 40, borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                <h4 style={{ margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={16} /> Recent Execution Logs
                </h4>
                {logs.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 10 }}>No execution logs found.</p>
                ) : (
                    <div style={{ marginTop: 16, overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', color: 'var(--muted)' }}>
                                    <th style={{ padding: '8px 4px' }}>Date</th>
                                    <th style={{ padding: '8px 4px' }}>Time</th>
                                    <th style={{ padding: '8px 4px' }}>Status</th>
                                    <th style={{ padding: '8px 4px' }}>Retries</th>
                                    <th style={{ padding: '8px 4px' }}>Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '8px 4px' }}>{log.report_date}</td>
                                        <td style={{ padding: '8px 4px' }}>{new Date(log.created_at).toLocaleTimeString()}</td>
                                        <td style={{ padding: '8px 4px' }}>
                                            <span style={{ 
                                                color: log.status === 'Success' ? 'var(--success)' : 
                                                       log.status === 'Running' ? 'var(--accent)' : 'var(--danger)',
                                                fontWeight: 600 
                                            }}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 4px' }}>{log.retry_count}</td>
                                        <td style={{ padding: '8px 4px', color: 'var(--danger)' }}>{log.error || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

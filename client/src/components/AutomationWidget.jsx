import React, { useEffect, useState } from 'react';
import { BellRing, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { Link } from 'react-router-dom';

export default function AutomationWidget() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchStatus = async () => {
            try {
                const { data } = await api.get('/settings/daily-book/status');
                if (mounted) {
                    setStatus(data);
                    setLoading(false);
                }
            } catch (error) {
                if (mounted) setLoading(false);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 60000); // Check every minute
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    if (loading) {
        return (
            <div className="card stat-card skeleton" style={{ height: 120 }}>
            </div>
        );
    }

    const isSuccess = status?.lastRun?.status === 'Success';
    const isRunning = status?.lastRun?.status === 'Running';
    const isFailed = status?.lastRun?.status === 'Failed';
    const isRetrying = status?.lastRun?.status === 'Retrying';

    return (
        <div className="card stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div className="row justify-between items-start">
                <div className="stat-info">
                    <h3 className="stat-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <BellRing size={16} /> Daily Book Automation
                    </h3>
                    <div className="stat-value" style={{ fontSize: '1.25rem', marginTop: 8 }}>
                        {status?.nextRunTime ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Clock size={16} className="text-muted" /> Next: {status.nextRunTime}
                            </span>
                        ) : 'Not Scheduled'}
                    </div>
                </div>
                <div className={`stat-icon-wrap`} style={{ 
                    background: isSuccess ? 'var(--success-light)' : 
                                isFailed ? 'var(--danger-light)' : 
                                'var(--accent-light)',
                    color: isSuccess ? 'var(--success)' : 
                           isFailed ? 'var(--danger)' : 
                           'var(--accent)'
                }}>
                    {isSuccess ? <CheckCircle size={24} /> : 
                     isFailed ? <AlertCircle size={24} /> : 
                     <BellRing size={24} />}
                </div>
            </div>
            <div className="row justify-between items-center" style={{ marginTop: 12, borderTop: '1px solid var(--border-light)', paddingTop: 12 }}>
                <span className="stat-desc" style={{ 
                    color: isSuccess ? 'var(--success)' : 
                           isFailed ? 'var(--danger)' : 
                           isRetrying ? 'var(--warning)' : 'var(--muted)',
                    fontWeight: 500
                }}>
                    {status?.lastRun ? `Last Run: ${status.lastRun.status}` : 'No recent runs'}
                </span>
                
                <Link to="/dashboard/settings" className="text-accent text-sm font-semibold" style={{ textDecoration: 'none' }}>
                    Configure →
                </Link>
            </div>
        </div>
    );
}

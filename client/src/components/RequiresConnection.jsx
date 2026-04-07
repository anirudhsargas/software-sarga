import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOffline';

/**
 * RequiresConnection — wrapper component for admin-only features.
 * Shows a friendly message when offline, otherwise renders children.
 *
 * Usage:
 *   <RequiresConnection feature="AI Monitoring">
 *     <AIMonitoring />
 *   </RequiresConnection>
 */
const RequiresConnection = ({ children, feature = 'This feature' }) => {
    const isOnline = useOnlineStatus();

    if (!isOnline) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '50vh',
                gap: '16px',
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary, #999)',
            }}>
                <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <WifiOff size={36} color="#ef4444" />
                </div>
                <h2 style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    color: 'var(--text, #e0e0e0)',
                    margin: 0,
                }}>
                    Requires Internet Connection
                </h2>
                <p style={{ fontSize: '14px', maxWidth: '360px', lineHeight: 1.6, margin: 0 }}>
                    <strong>{feature}</strong> needs a live server connection to load data.
                    Please check your connection and try again.
                </p>
            </div>
        );
    }

    return children;
};

export default RequiresConnection;

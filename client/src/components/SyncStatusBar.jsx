import React, { useState, useEffect } from 'react';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { RefreshCw, Wifi, WifiOff, CheckCircle, AlertCircle, Loader2, ArrowUpCircle } from 'lucide-react';
import './SyncStatusBar.css';

export const SyncStatusBar = () => {
  const { status, lastSyncText, pendingCount, syncNow } = useSyncStatus();
  const [visible, setVisible] = useState(false);
  const isOnline = navigator.onLine;

  useEffect(() => {
    // Show when offline, syncing, error, or if there are pending items to upload
    if (!isOnline || status === 'syncing' || status === 'error' || pendingCount > 0) {
      setVisible(true);
    } else if (status === 'synced') {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
      }, 3500); // Auto dismiss synced state after 3.5s
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [status, isOnline, pendingCount]);

  if (!visible) return null;

  let Icon = Wifi;
  let color = 'var(--text-secondary)';
  let label = 'Ready';
  let spin = false;

  if (!isOnline) {
    Icon = WifiOff;
    color = 'var(--text-muted)';
    label = 'Offline';
  } else if (status === 'syncing') {
    Icon = Loader2;
    color = 'var(--warning)';
    label = pendingCount > 0 ? 'Uploading' : 'Syncing';
    spin = true;
  } else if (status === 'synced') {
    Icon = CheckCircle;
    color = 'var(--success)';
    label = 'Success';
  } else if (status === 'error') {
    Icon = AlertCircle;
    color = 'var(--danger)';
    label = 'Sync failed';
  } else if (pendingCount > 0) {
    Icon = ArrowUpCircle;
    color = 'var(--info)';
    label = 'Pending sync';
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`sync-bar sync-bar--${status}`}
      onClick={status !== 'syncing' && isOnline ? syncNow : undefined}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (status !== 'syncing' && isOnline) syncNow(); } }}
      title={isOnline ? 'Click to sync now' : 'Offline'}
      style={{
        cursor: status !== 'syncing' && isOnline ? 'pointer' : 'default',
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 'var(--z-toast)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-md)',
        color: color,
        userSelect: 'none',
        transition: 'opacity 300ms ease, transform 300ms ease',
      }}
    >
      <Icon
        size={14}
        className={spin ? 'animate-spin' : ''}
        style={{ color }}
      />
      <span style={{ color }}>{label}</span>
      {pendingCount > 0 && isOnline && (
        <span 
          className="sync-bar__badge"
          style={{
            background: 'var(--accent)',
            color: 'var(--text-inverse)',
            borderRadius: '999px',
            padding: '1px 6px',
            fontSize: '10px',
            fontWeight: 700,
            marginLeft: '4px',
          }}
        >
          {pendingCount}
        </span>
      )}
    </div>
  );
};
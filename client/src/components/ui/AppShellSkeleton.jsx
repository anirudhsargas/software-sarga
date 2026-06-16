import React from 'react';
import './AppShellSkeleton.css';

export default function AppShellSkeleton() {
  return (
    <div className="skeleton-shell">
      {/* Sidebar Skeleton */}
      <div className="skeleton-sidebar">
        <div className="skeleton-sidebar-header">
          <div className="skeleton-circle" />
          <div className="skeleton-text" style={{ width: '60%' }} />
        </div>
        <div className="skeleton-sidebar-nav">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton-nav-item">
              <div className="skeleton-icon" />
              <div className="skeleton-text" style={{ width: '70%' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Skeleton */}
      <div className="skeleton-main">
        {/* Topbar Skeleton */}
        <div className="skeleton-topbar">
          <div className="skeleton-text" style={{ width: '150px' }} />
          <div className="skeleton-circle" style={{ width: '32px', height: '32px' }} />
        </div>

        {/* Dashboard Content Skeleton */}
        <div className="skeleton-content">
          <div className="skeleton-header">
            <div className="skeleton-title" style={{ width: '250px' }} />
            <div className="skeleton-text" style={{ width: '400px' }} />
          </div>

          <div className="skeleton-grid">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton-card">
                <div className="skeleton-icon" />
                <div className="skeleton-text" style={{ width: '50%', marginTop: '12px' }} />
                <div className="skeleton-title" style={{ width: '80%', marginTop: '8px' }} />
              </div>
            ))}
          </div>

          <div className="skeleton-table">
            <div className="skeleton-table-header" />
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton-table-row">
                <div className="skeleton-text" style={{ width: '20%' }} />
                <div className="skeleton-text" style={{ width: '40%' }} />
                <div className="skeleton-text" style={{ width: '15%' }} />
                <div className="skeleton-text" style={{ width: '15%' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

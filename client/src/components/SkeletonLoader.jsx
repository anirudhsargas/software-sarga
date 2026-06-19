import React from 'react';
import { Loader2 } from 'lucide-react';
import './SkeletonLoader.css';

const SkeletonLoader = ({ type = 'cards', count = 6, columns }) => {

  // ── FrontOffice stat cards: icon (48×48 rounded square) + value + label ──
  if (type === 'cards') {
    return (
      <div className="skeleton-fo-stats">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="skeleton-fo-card">
            <div className="skeleton skeleton-fo-card__icon skeleton-box"></div>
            <div className="skeleton-fo-card__body">
              <div className="skeleton skeleton-box skeleton-fo-card__value"></div>
              <div className="skeleton skeleton-box skeleton-fo-card__label"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Jobs table: dynamic columns via `columns` prop ──
  if (type === 'table') {
    const cols = columns || [
      { key: 'jobDetails', header: 'Job Details', width: '2fr', lines: 2 },
      { key: 'customer', header: 'Customer', width: '1.5fr', lines: 2 },
      { key: 'branch', header: 'Branch', width: '1fr' },
      { key: 'status', header: 'Status', width: '1fr', pill: true },
      { key: 'production', header: 'Production', width: '1fr', lines: 2 },
      { key: 'delivery', header: 'Delivery', width: '1fr' },
      { key: 'actions', header: 'Actions', width: '0.8fr' }
    ];

    const gridCols = cols.map(c => c.width || '1fr').join(' ');

    return (
      <div className="skeleton-table-wrapper">
        <div className="skeleton-table">
          <div className="skeleton-row skeleton-row--header" style={{ gridTemplateColumns: gridCols }}>
            {cols.map((col, i) => (
              <div key={i} className="skeleton-cell skeleton-cell--header">{col.header}</div>
            ))}
          </div>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="skeleton-row" style={{ gridTemplateColumns: gridCols }}>
              {cols.map((col, ci) => (
                <div key={ci} className={`skeleton-cell${col.lines === 2 ? ' skeleton-cell--stacked' : ''}`}>
                  {col.pill ? (
                    <div className="skeleton skeleton-box skeleton-box--pill"></div>
                  ) : (
                    <>
                      <div className="skeleton skeleton-box skeleton-box--line"></div>
                      {col.lines === 2 && <div className="skeleton skeleton-box skeleton-box--line skeleton-box--short"></div>}
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="skeleton-loading-footer">
          <Loader2 className="skeleton-loading-spinner" size={16} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // ── Customer list: avatar circle + name/badge + phone + actions ──
  if (type === 'customer-list') {
    return (
      <div className="skeleton-customer-list">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="skeleton-customer-row">
            <div className="skeleton skeleton-box skeleton-customer-avatar"></div>
            <div className="skeleton-customer-info">
              <div className="skeleton-customer-name-row">
                <div className="skeleton skeleton-box skeleton-customer-name"></div>
                <div className="skeleton skeleton-box skeleton-customer-badge"></div>
              </div>
              <div className="skeleton skeleton-box skeleton-customer-phone"></div>
            </div>
            <div className="skeleton-customer-actions">
              <div className="skeleton skeleton-box skeleton-customer-btn"></div>
              <div className="skeleton-customer-btn-row">
                <div className="skeleton skeleton-box skeleton-customer-btn-sm"></div>
                <div className="skeleton skeleton-box skeleton-customer-btn-sm"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Attendance dashboard: 4 stat cards + calendar grid ──
  if (type === 'attendance') {
    return (
      <div className="skeleton-attendance" style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div className="skeleton-box" style={{ height: 22, width: 200, marginBottom: 8 }}></div>
          <div className="skeleton-box" style={{ height: 13, width: 280 }}></div>
        </div>

        {/* 4 Salary overview cards */}
        <div className="skeleton-attendance-cards">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton-attendance-card">
              <div className="skeleton skeleton-box" style={{ height: 11, width: 80, marginBottom: 6, opacity: 0.6 }}></div>
              <div className="skeleton skeleton-box" style={{ height: 20, width: 60, marginBottom: 6 }}></div>
              <div className="skeleton skeleton-box" style={{ height: 12, width: 100, opacity: 0.5 }}></div>
            </div>
          ))}
        </div>

        {/* Calendar */}
        <div className="skeleton-calendar">
          {/* Month nav */}
            <div className="skeleton-calendar-nav">
            <div className="skeleton skeleton-box" style={{ width: 32, height: 32, borderRadius: 6 }}></div>
            <div className="skeleton skeleton-box" style={{ width: 140, height: 18 }}></div>
            <div className="skeleton skeleton-box" style={{ width: 32, height: 32, borderRadius: 6 }}></div>
          </div>
          {/* Day headers */}
          <div className="skeleton-calendar-grid" style={{ marginBottom: 4 }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--muted)', padding: '4px 0', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>
          {/* Calendar cells — 5 weeks × 7 days */}
          <div className="skeleton-calendar-grid">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="skeleton-calendar-cell">
                <div className="skeleton skeleton-box" style={{ width: 16, height: 14 }}></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Form skeleton (kept for backwards compat) ──
  if (type === 'form') {
    return (
      <div className="skeleton-form">
            <div className="skeleton-form-row">
          <div className="skeleton-form-group skeleton-form-group--full">
            <div className="skeleton skeleton-label"></div>
            <div className="skeleton skeleton-input"></div>
          </div>
        </div>
        <div className="skeleton-form-row">
          <div className="skeleton-form-group">
            <div className="skeleton skeleton-label"></div>
            <div className="skeleton skeleton-input"></div>
          </div>
          <div className="skeleton-form-group">
            <div className="skeleton skeleton-label"></div>
            <div className="skeleton skeleton-input"></div>
          </div>
        </div>
        <div className="skeleton-form-row">
          <div className="skeleton-form-group skeleton-form-group--full">
            <div className="skeleton skeleton-label"></div>
            <div className="skeleton skeleton-input"></div>
          </div>
        </div>
        <div className="skeleton-form-row">
          <div className="skeleton skeleton-button"></div>
        </div>
      </div>
    );
  }

  return null;
};

export const CardSkeleton = ({ count = 6 }) => <SkeletonLoader type="cards" count={count} />;
export const TableSkeleton = ({ count = 6, columns }) => <SkeletonLoader type="table" count={count} columns={columns} />;
export const DashboardSkeleton = ({ count = 6 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="skeleton-box" style={{ height: '32px', width: '220px', borderRadius: '8px' }}></div>
      <div className="skeleton-box" style={{ height: '36px', width: '140px', borderRadius: '8px' }}></div>
    </div>
    <div className="skeleton-box" style={{ height: '34px', width: '100%', borderRadius: '10px' }}></div>
    <CardSkeleton count={count} />
    <TableSkeleton count={5} />
  </div>
);

export default SkeletonLoader;

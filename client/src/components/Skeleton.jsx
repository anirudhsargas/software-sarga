import React from 'react';

export const Skeleton = React.memo(({ className = '', style }) => (
  <div className={`skeleton ${className || ''}`} style={style} aria-hidden="true" />
));

export const SkeletonText = React.memo(({ width = '100%', height = 14, className = '' }) => (
  <div
    className={`skeleton skeleton--text ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height }}
    aria-hidden="true"
  />
));

export const SkeletonTitle = React.memo(({ width = 220, height = 22, className = '' }) => (
  <div
    className={`skeleton skeleton--title ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height }}
    aria-hidden="true"
  />
));

export const SkeletonAvatar = React.memo(({ size = 64, className = '' }) => (
  <div
    className={`skeleton skeleton--avatar ${className}`}
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
));

export const SkeletonKpi = React.memo(({ width = 90, height = 28, className = '' }) => (
  <div
    className={`skeleton skeleton--kpi ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height }}
    aria-hidden="true"
  />
));

export const SkeletonCircle = React.memo(({ size = 40, className = '' }) => (
  <div
    className={`skeleton skeleton--circle ${className}`}
    style={{ width: size, height: size, borderRadius: '50%' }}
    aria-hidden="true"
  />
));

export const SkeletonRect = React.memo(({ width = '100%', height = 80, className = '' }) => (
  <div
    className={`skeleton skeleton--rect ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height, borderRadius: 8 }}
    aria-hidden="true"
  />
));

export const SkeletonCard = React.memo(({ count = 1, width, height = 120, className = '' }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={`skeleton skeleton--card ${className}`}
        style={{
          width: typeof width === 'number' ? `${width}px` : width || '100%',
          height,
          borderRadius: 12,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'var(--card)',
          border: '1px solid var(--border)'
        }}
        aria-hidden="true"
      >
        <div className="skeleton" style={{ width: '40%', height: 14, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: '80%', height: 24, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: '60%', height: 12, borderRadius: 4 }} />
      </div>
    ))}
  </>
));

export const SkeletonTableRow = React.memo(({ count = 1, columns = 4, className = '' }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={`skeleton skeleton--table-row ${className}`}
        style={{
          display: 'flex',
          gap: 16,
          padding: '12px 16px',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)'
        }}
        aria-hidden="true"
      >
        {Array.from({ length: columns }).map((_, ci) => (
          <div
            key={ci}
            className="skeleton"
            style={{
              flex: ci === 0 ? 2 : 1,
              height: 14,
              borderRadius: 4
            }}
          />
        ))}
      </div>
    ))}
  </>
));

export default Skeleton;

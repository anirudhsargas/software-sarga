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

export default Skeleton;

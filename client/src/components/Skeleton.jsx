import React from 'react';

export const Skeleton = ({ className = '', style }) => (
  <div className={`skeleton ${className || ''}`} style={style} aria-hidden="true" />
);

export const SkeletonText = ({ width = '100%', height = 14, className = '' }) => (
  <div
    className={`skeleton skeleton--text ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height }}
    aria-hidden="true"
  />
);

export const SkeletonTitle = ({ width = 220, height = 22, className = '' }) => (
  <div
    className={`skeleton skeleton--title ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height }}
    aria-hidden="true"
  />
);

export const SkeletonAvatar = ({ size = 64, className = '' }) => (
  <div
    className={`skeleton skeleton--avatar ${className}`}
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
);

export const SkeletonKpi = ({ width = 90, height = 28, className = '' }) => (
  <div
    className={`skeleton skeleton--kpi ${className}`}
    style={{ width: typeof width === 'number' ? `${width}px` : width, height }}
    aria-hidden="true"
  />
);

export default Skeleton;

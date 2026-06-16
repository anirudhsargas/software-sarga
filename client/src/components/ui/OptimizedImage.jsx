import React from 'react';

/**
 * OptimizedImage Component
 * Implements responsive images using srcset and picture for WebP support.
 * Also enforces lazy loading, async decoding, and explicit dimensions to prevent CLS.
 */
export const OptimizedImage = ({
  src,
  alt = '',
  width,
  height,
  className = '',
  sizes = '40px',
  loading = 'lazy',
  fetchpriority = 'auto',
  ...props
}) => {
  // If no source is provided, return null or a skeleton
  if (!src) return null;

  // We can simulate an API that generates different sizes by appending a width param.
  // E.g., if it's an uploaded file or standard image URL.
  // In a real scenario, the backend or CDN handles this. We will append standard query params.
  const isUrl = src.startsWith('http') || src.startsWith('/');
  
  const generateSrcSet = (baseSrc, format = '') => {
    if (!isUrl || src.startsWith('data:')) return undefined;
    const formatParam = format ? `&format=${format}` : '';
    // This assumes the backend/CDN respects a `w=` query parameter.
    const urlObj = new URL(baseSrc, window.location.origin);
    const createUrl = (w) => {
      const u = new URL(urlObj);
      u.searchParams.set('w', w);
      if (format) u.searchParams.set('format', format);
      return `${u.pathname}${u.search}`;
    };
    return `${createUrl(40)} 40w, ${createUrl(80)} 80w, ${createUrl(160)} 160w`;
  };

  return (
    <picture>
      {isUrl && !src.startsWith('data:') && (
        <source type="image/webp" srcSet={generateSrcSet(src, 'webp')} sizes={sizes} />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        loading={loading}
        decoding="async"
        fetchpriority={fetchpriority}
        srcSet={generateSrcSet(src)}
        sizes={sizes}
        style={{
          aspectRatio: (width && height) ? `${width} / ${height}` : 'auto',
          objectFit: 'cover'
        }}
        {...props}
      />
    </picture>
  );
};

export default OptimizedImage;

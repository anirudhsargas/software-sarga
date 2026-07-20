import React, { useState, useEffect } from 'react';
import { imgUrl, FILE_BASE } from '../services/api';
import { Image as ImageIcon } from 'lucide-react';

// Detect if we're in a cross-origin environment (Vercel, Render, etc.)
// Local dev with Vite proxy is same-origin, so plain <img> works fine.
const IS_LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const IS_CROSS_ORIGIN = !IS_LOCAL_DEV;

const CLOUDINARY_PATTERN = /^https?:\/\/res\.cloudinary\.com\//;

const getResponsiveCloudinaryUrl = (url, width, height) => {
    if (!CLOUDINARY_PATTERN.test(url) || (!width && !height)) return url;
    const parts = url.split('/upload/');
    if (parts.length !== 2) return url;
    let transforms = [];
    if (width) transforms.push(`w_${Math.round(width)}`);
    if (height) transforms.push(`h_${Math.round(height)}`);
    transforms.push('c_fill', 'f_auto', 'q_auto');
    return `${parts[0]}/upload/${transforms.join(',')}/${parts[1]}`;
};

const SecureImage = React.memo(({ src, alt, className, style, loading = 'lazy', decoding, width, height }) => {
    const [displaySrc, setDisplaySrc] = useState(null);
    const [error, setError] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);

    useEffect(() => {
        if (!src) { setDisplaySrc(null); setError(false); setImgLoaded(false); return; }

        if (src.startsWith('blob:') || src.startsWith('data:')) {
            setDisplaySrc(src);
            setError(false);
            return;
        }

        if (src.startsWith('http://') || src.startsWith('https://')) {
            setDisplaySrc(getResponsiveCloudinaryUrl(src, width, height));
            setError(false);
            return;
        }

        // In local dev (same-origin), just build the auth URL and let <img> load it
        if (!IS_CROSS_ORIGIN) {
            const url = imgUrl(src);
            setDisplaySrc(url);
            setError(false);
            return;
        }

        // Cross-origin: browser img tags can't send headers → fetch via JS with header
        let cancelled = false;
        let objectUrl = null;
        const token = localStorage.getItem('token');
        const url = imgUrl(src);


        fetch(url, {
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'ngrok-skip-browser-warning': '1',
            },
        })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.blob();
            })
            .then(blob => {
                if (cancelled || !blob) return;
                objectUrl = URL.createObjectURL(blob);
                setDisplaySrc(objectUrl);
                setError(false);
            })
            .catch(err => {
                console.error('[SecureImage] Fetch error:', err);
                setError(true);
            });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src, width, height]);

    const wrapperStyle = {
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    };

    return (
        <div className={className} style={{ ...wrapperStyle, ...style }}>
            {displaySrc && !error ? (
                <img
                    src={displaySrc}
                    alt={alt || ''}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: imgLoaded ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                    }}
                    loading={loading}
                    decoding={decoding}
                    width={width}
                    height={height}
                    onLoad={() => setImgLoaded(true)}
                    onError={(e) => {
                        console.error('[SecureImage] Image load error:', e, 'src:', displaySrc);
                        setError(true);
                    }}
                />
            ) : (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-muted)',
                    fontSize: width && width < 60 ? '14px' : '24px',
                }}>
                    {error ? <ImageIcon size={width && width < 60 ? 14 : 24} /> : null}
                </div>
            )}
        </div>
    );
});

export default SecureImage;

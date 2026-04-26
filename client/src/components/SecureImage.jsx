import { useState, useEffect } from 'react';
import { imgUrl, FILE_BASE } from '../services/api';

// Detect if we're in a cross-origin environment (Vercel, Render, etc.)
// Local dev with Vite proxy is same-origin, so plain <img> works fine.
const IS_LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const IS_CROSS_ORIGIN = !IS_LOCAL_DEV;

/**
 * Renders an image whose source path requires JWT auth (from /uploads/).
 * In cross-origin environments (Vercel, Render, ngrok), fetches the file with
 * Authorization header to avoid CORS issues, then renders via a blob URL.
 * In local dev, just uses a normal <img> (Vite proxy handles auth via query param).
 */
export default function SecureImage({ src, alt, className, style, loading, width, height }) {
    const [displaySrc, setDisplaySrc] = useState(null);

    useEffect(() => {
        if (!src) { setDisplaySrc(null); return; }

        // blob:/data: URLs are local previews — render directly
        if (src.startsWith('blob:') || src.startsWith('data:')) {
            setDisplaySrc(src);
            return;
        }

        // In local dev (same-origin), just build the auth URL and let <img> load it
        if (!IS_CROSS_ORIGIN) {
            setDisplaySrc(imgUrl(src));
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
            .then(r => (r.ok ? r.blob() : null))
            .then(blob => {
                if (cancelled || !blob) return;
                objectUrl = URL.createObjectURL(blob);
                setDisplaySrc(objectUrl);
            })
            .catch(() => { });

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);

    if (!displaySrc) return null;
    return (
        <img
            src={displaySrc}
            alt={alt || ''}
            className={className}
            style={style}
            loading={loading}
            width={width}
            height={height}
        />
    );
}

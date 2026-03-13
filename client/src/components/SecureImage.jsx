import { useState, useEffect } from 'react';
import { imgUrl, FILE_BASE } from '../services/api';

// Only need the fetch-with-header approach for ngrok tunnels.
// In local dev (Vite proxy) or same-origin setups, a plain <img> works fine.
const IS_NGROK = FILE_BASE.includes('ngrok');

/**
 * Renders an image whose source path requires JWT auth (from /uploads/).
 * In production via ngrok, fetches the file with Authorization + bypass headers
 * to avoid ngrok's browser-interstitial page, then renders via a blob URL.
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

        // In non-ngrok envs, just build the auth URL and let <img> load it
        if (!IS_NGROK) {
            setDisplaySrc(imgUrl(src));
            return;
        }

        // ngrok: browser img tags can't send headers → fetch via JS with header
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

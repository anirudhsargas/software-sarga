import { useState, useEffect } from 'react';
import { imgUrl, FILE_BASE } from '../services/api';
import { Image as ImageIcon } from 'lucide-react';

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
export default function SecureImage({ src, alt, className, style, loading, decoding, width, height }) {
    const [displaySrc, setDisplaySrc] = useState(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!src) { setDisplaySrc(null); setError(false); return; }

        // blob:/data: URLs are local previews — render directly
        if (src.startsWith('blob:') || src.startsWith('data:')) {
            setDisplaySrc(src);
            setError(false);
            return;
        }

        // Cloudinary / external CDN URLs don't need auth — render directly
        if (src.startsWith('http://') || src.startsWith('https://')) {
            setDisplaySrc(src);
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
    }, [src]);

    if (!displaySrc) {
        if (error) {
            return (
                <div
                    className={className}
                    style={{
                        ...style,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--surface-2, #1e293b)',
                        border: '1px solid var(--border, #334155)',
                        borderRadius: '8px',
                        color: 'var(--text-muted, #64748b)'
                    }}
                >
                    <ImageIcon size={24} />
                </div>
            );
        }
        return null;
    }
    
    return (
        <img
            src={displaySrc}
            alt={alt || ''}
            className={className}
            style={style}
            loading={loading}
            decoding={decoding}
            width={width}
            height={height}
            onError={(e) => {
                console.error('[SecureImage] Image load error:', e, 'src:', displaySrc);
                setError(true);
            }}
        />
    );
}

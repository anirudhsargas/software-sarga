import React from 'react';

/**
 * Reusable pagination component.
 * Props:
 *   page      - current page (1-based)
 *   totalPages - total number of pages
 *   onPageChange(newPage) - callback when page changes
 *   limit     - (optional) current page size
 *   total     - (optional) total item count, displayed as info
 */
export default function Pagination({ page, totalPages, onPageChange, total, limit }) {
    if (!totalPages || totalPages <= 1) return null;

    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
        pages.push(i);
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', padding: '14px 0', flexWrap: 'wrap'
        }}>
            {total != null && (
                <span style={{ marginRight: 12, fontSize: '0.82rem', color: 'var(--muted)' }}>
                    {total} item{total !== 1 ? 's' : ''}
                </span>
            )}
            <button
                onClick={() => onPageChange(1)}
                disabled={page === 1}
                style={btnStyle(page === 1, false)}
            >«</button>
            <button
                onClick={() => onPageChange(page - 1)}
                disabled={page === 1}
                style={btnStyle(page === 1, false)}
            >‹</button>
            {start > 1 && <span style={{ color: 'var(--muted)' }}>…</span>}
            {pages.map(p => (
                <button
                    key={p}
                    onClick={() => onPageChange(p)}
                    style={btnStyle(false, p === page)}
                >{p}</button>
            ))}
            {end < totalPages && <span style={{ color: 'var(--muted)' }}>…</span>}
            <button
                onClick={() => onPageChange(page + 1)}
                disabled={page === totalPages}
                style={btnStyle(page === totalPages, false)}
            >›</button>
            <button
                onClick={() => onPageChange(totalPages)}
                disabled={page === totalPages}
                style={btnStyle(page === totalPages, false)}
            >»</button>
        </div>
    );
}

function btnStyle(disabled, active) {
    return {
        padding: '5px 11px',
        border: active ? '1.5px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 8,
        background: active ? 'var(--accent)' : 'var(--surface)',
        color: active ? '#fff' : 'var(--text)',
        fontWeight: active ? 700 : 500,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        fontSize: '0.82rem',
        minWidth: 32,
        transition: 'all 0.15s ease',
    };
}

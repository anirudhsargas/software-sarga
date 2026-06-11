import React, { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import api from '../services/api';

/**
 * UpsellSuggestions — shows chip buttons with ML-powered cross-sell
 * recommendations after a category is selected.
 *
 * Props:
 *   currentServices: string[]  — currently selected category names
 *   branchId: number|null
 *   onAdd: (serviceName: string) => void — called when user clicks a chip
 */
const UpsellSuggestions = React.memo(({ currentServices, branchId, onAdd }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [dismissed, setDismissed] = useState(new Set());
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!currentServices || currentServices.length === 0) {
            setSuggestions([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setDismissed(new Set());

        api.post('/ai/upsell', {
            current_services: currentServices,
            branch_id: branchId || null,
        })
            .then(res => {
                if (cancelled) return;
                const items = (res.data?.suggestions || [])
                    .filter(s => s.confidence_percent > 50);
                setSuggestions(items);
            })
            .catch(() => {
                if (!cancelled) setSuggestions([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [currentServices?.join(','), branchId]);

    const visible = suggestions.filter(s => !dismissed.has(s.service));

    if (loading || visible.length === 0) return null;

    return (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8,
            alignItems: 'center',
        }}>
            <Sparkles size={14} style={{ color: 'var(--primary, #6366f1)', flexShrink: 0 }} />
            {visible.map((s, i) => (
                <span
                    key={s.service}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 12px', borderRadius: 20,
                        background: 'var(--bg-2, #f1f5f9)',
                        border: '1px solid var(--border, #e2e8f0)',
                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        color: 'var(--text, #334155)',
                        animation: `upsellFadeIn 0.3s ease ${i * 0.08}s both`,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => onAdd(s.service)}
                        style={{
                            background: 'none', border: 'none', padding: 0,
                            cursor: 'pointer', color: 'inherit', font: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                    >
                        <span style={{ color: 'var(--primary, #6366f1)', fontWeight: 600 }}>+</span>
                        {` Add ${s.service} (${s.confidence_percent}% of similar orders)`}
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDismissed(prev => new Set(prev).add(s.service)); }}
                        style={{
                            background: 'none', border: 'none', padding: 0,
                            cursor: 'pointer', color: 'var(--muted, #94a3b8)',
                            display: 'inline-flex', lineHeight: 1,
                        }}
                        title="Dismiss"
                    >
                        <X size={12} />
                    </button>
                </span>
            ))}
            <style>{`
                @keyframes upsellFadeIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
});

export default UpsellSuggestions;

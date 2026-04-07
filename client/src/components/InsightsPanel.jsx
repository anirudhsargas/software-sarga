import React, { useState, useEffect, useCallback } from 'react';
import { Lightbulb, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import api from '../services/api';

const SOURCE_LABELS = {
    gpt: 'AI-Powered',
    rules: 'Rule-Based',
    error: 'Limited',
    unavailable: '',
};

export default function InsightsPanel() {
    const [data, setData] = useState({ insights: [], generated_at: null, source: null });
    const [expanded, setExpanded] = useState(true);
    const [loading, setLoading] = useState(false);

    const fetchInsights = useCallback(async (refresh = false) => {
        setLoading(true);
        try {
            const url = refresh ? 'ai/insights?refresh=1' : 'ai/insights';
            const res = await api.get(url);
            setData(res.data || { insights: [], generated_at: null, source: null });
        } catch {
            // keep stale data
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    const count = data.insights?.length || 0;

    if (count === 0 && !loading) return null;

    const sourceLabel = SOURCE_LABELS[data.source] || '';
    const generatedTime = data.generated_at
        ? new Date(data.generated_at).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })
        : null;

    return (
        <div style={{ margin: '0 0 16px', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--card-bg, #fff)' }}>
            {/* Header bar */}
            <button
                onClick={() => setExpanded(e => !e)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 16px', border: 'none', cursor: 'pointer',
                    background: 'var(--accent-light)',
                    color: 'var(--accent)',
                    fontWeight: 600, fontSize: '14px',
                }}
            >
                <Lightbulb size={18} />
                <span style={{ flex: 1, textAlign: 'left' }}>
                    {count} Business Insight{count !== 1 ? 's' : ''}
                    {sourceLabel && (
                        <span style={{
                            marginLeft: 8, fontSize: '11px', fontWeight: 500,
                            padding: '2px 8px', borderRadius: '6px',
                            background: data.source === 'gpt' ? '#dbeafe' : '#e0e7ff',
                            color: data.source === 'gpt' ? '#1d4ed8' : '#4338ca',
                        }}>
                            {sourceLabel}
                        </span>
                    )}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); fetchInsights(true); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'inherit', display: 'flex' }}
                    title="Refresh insights"
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </button>
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {/* Insights list */}
            {expanded && (
                <div>
                    {loading && count === 0 ? (
                        <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted, var(--muted))', fontSize: '13px' }}>
                            Generating insights…
                        </div>
                    ) : (
                        data.insights.map((insight, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                                    padding: '10px 16px',
                                    borderTop: '1px solid var(--border)',
                                    fontSize: '13px',
                                    lineHeight: 1.5,
                                    color: 'var(--text)',
                                }}
                            >
                                <span style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }}>●</span>
                                <span>{insight}</span>
                            </div>
                        ))
                    )}
                    {generatedTime && (
                        <div style={{
                            padding: '8px 16px', fontSize: '11px',
                            color: 'var(--text-muted, var(--muted))',
                            borderTop: '1px solid var(--border)', textAlign: 'right',
                        }}>
                            Generated: {generatedTime}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

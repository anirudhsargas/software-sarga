import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lightbulb, ChevronDown, ChevronUp, RefreshCw, X } from 'lucide-react';
import api from '../services/api';

const SOURCE_LABELS = {
    gpt: 'AI-Powered',
    rules: 'Rule-Based',
    error: 'Limited',
    unavailable: '',
};

const CACHE_KEY = 'sarga_insights_cache';

export default function InsightsPanel() {
    const [data, setData] = useState(() => {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            return cached ? JSON.parse(cached) : { insights: [], generated_at: null, source: null };
        } catch {
            return { insights: [], generated_at: null, source: null };
        }
    });
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [visible, setVisible] = useState(true);
    const [userInteracted, setUserInteracted] = useState(false);
    const activityTimerRef = useRef(null);

    const fetchInsights = useCallback(async (refresh = false) => {
        setLoading(true);
        setError(false);
        try {
            const url = refresh ? 'ai/insights?refresh=1' : 'ai/insights';
            const res = await api.get(url);
            const responseData = res.data || { insights: [], generated_at: null, source: null };
            setData(responseData);
            setError(false);
            localStorage.setItem(CACHE_KEY, JSON.stringify(responseData));
        } catch (err) {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInsights();
    }, [fetchInsights]);

    // Reset visibility when new insights load
    const count = data.insights?.length || 0;
    useEffect(() => {
        if (count > 0) {
            setVisible(true);
        }
    }, [count]);

    // Handle auto-hide after inactivity (8 seconds)
    const resetActivityTimer = useCallback(() => {
        if (activityTimerRef.current) {
            clearTimeout(activityTimerRef.current);
        }
        if (!expanded && count > 0 && !userInteracted) {
            activityTimerRef.current = setTimeout(() => {
                setVisible(false);
            }, 8000);
        }
    }, [expanded, count, userInteracted]);

    useEffect(() => {
        resetActivityTimer();
        return () => {
            if (activityTimerRef.current) {
                clearTimeout(activityTimerRef.current);
            }
        };
    }, [resetActivityTimer]);

    const handleInteraction = () => {
        setUserInteracted(true);
        if (activityTimerRef.current) {
            clearTimeout(activityTimerRef.current);
        }
    };

    if (!visible) return null;

    if (loading) {
        return (
            <div style={{ 
                margin: '0 0 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border)', 
                background: 'var(--card)', 
                boxShadow: 'var(--shadow-sm)',
                padding: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Lightbulb size={14} style={{ color: 'var(--warning)' }} />
                    <div className="skeleton-box" style={{ height: '14px', width: '120px' }}></div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="skeleton-box" style={{ height: '12px', width: '100%' }}></div>
                    <div className="skeleton-box" style={{ height: '12px', width: '90%' }}></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ 
                margin: '0 0 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border)', 
                background: 'var(--card)', 
                boxShadow: 'var(--shadow-sm)',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '13px' }}>
                    <Lightbulb size={14} style={{ color: 'var(--text-muted)' }} />
                    <span>Failed to load endpoint: <code>/ai/insights</code></span>
                </div>
                <button 
                    type="button" 
                    className="btn btn-ghost btn-sm" 
                    onClick={() => fetchInsights(true)} 
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}
                >
                    <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> Retry
                </button>
            </div>
        );
    }

    if (count === 0) {
        return (
            <div style={{ 
                margin: '0 0 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border)', 
                background: 'var(--card)', 
                boxShadow: 'var(--shadow-sm)',
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '13px'
            }}>
                No business insights available at this time.
            </div>
        );
    }

    const sourceLabel = SOURCE_LABELS[data.source] || '';
    const generatedTime = data.generated_at
        ? new Date(data.generated_at).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })
        : null;

    return (
        <div 
            onMouseEnter={handleInteraction}
            onClick={handleInteraction}
            style={{ 
                margin: '0 0 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border)', 
                overflow: 'hidden', 
                background: 'var(--card)', 
                boxShadow: 'var(--shadow-sm)',
                transition: 'all 0.25s ease'
            }}
        >
            {/* Header bar - compact, height <= 36px */}
            <div role="button"
                tabIndex={0}
                onClick={() => setExpanded(e => !e)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(x => !x); } }}
                style={{
                    width: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    padding: '6px 12px', 
                    height: '34px',
                    cursor: 'pointer',
                    background: 'var(--hover)',
                    color: 'var(--text-primary)',
                    fontWeight: 600, 
                    fontSize: '12px',
                    boxSizing: 'border-box',
                    userSelect: 'none'
                }}
            >
                <Lightbulb size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {count} Business Insight{count !== 1 ? 's' : ''}
                    {sourceLabel && (
                        <span style={{
                            marginLeft: 8, 
                            fontSize: '10px', 
                            fontWeight: 500,
                            padding: '1px 6px', 
                            borderRadius: '4px',
                            background: 'var(--border)',
                            color: 'var(--text-secondary)',
                        }}>
                            {sourceLabel}
                        </span>
                    )}
                </span>
                <button
                    onClick={(e) => { e.stopPropagation(); handleInteraction(); fetchInsights(true); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                    title="Refresh insights"
                    disabled={loading}
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                </button>
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                <button
                    onClick={(e) => { e.stopPropagation(); setVisible(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                    title="Dismiss"
                    aria-label="Dismiss banner"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Insights list */}
            {expanded && (
                <div style={{ transition: 'all 0.2s ease', borderTop: '1px solid var(--border)' }}>
                    {data.insights.map((insight, i) => (
                        <div
                            key={i}
                            style={{
                                display: 'flex', 
                                alignItems: 'flex-start', 
                                gap: '8px',
                                padding: '8px 12px',
                                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                                fontSize: '12px',
                                lineHeight: 1.4,
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <span style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }}>●</span>
                            <span>{insight}</span>
                        </div>
                    ))}
                    {generatedTime && (
                        <div style={{
                            padding: '6px 12px', 
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            borderTop: '1px solid var(--border)', 
                            textAlign: 'right',
                        }}>
                            Generated: {generatedTime}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


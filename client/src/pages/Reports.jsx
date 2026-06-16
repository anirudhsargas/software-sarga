import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, TrendingUp, TrendingDown, Minus, Sun, CloudRain, RefreshCw, BarChart3 } from 'lucide-react';
import api from '../services/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_FULL = {
    Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
    May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
    Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};

// Green color scale from light (#C8E6C9) to dark (#1B5E20)
function indexToColor(val) {
    if (!val || val === 0) return 'var(--color-surfaceHover)';
    // Clamp between 0.4 and 1.6 for color mapping
    const clamped = Math.max(0.4, Math.min(1.6, val));
    const t = (clamped - 0.4) / 1.2; // normalize 0..1
    // Interpolate from #C8E6C9 (light green) to #1B5E20 (dark green)
    const r = Math.round(200 - t * (200 - 27));
    const g = Math.round(230 - t * (230 - 94));
    const b = Math.round(201 - t * (201 - 32));
    return `rgb(${r}, ${g}, ${b})`;
}

function indexLabel(val, peakMonths, slowMonths, monthFull) {
    if (!val) return '';
    let suffix = '';
    if (peakMonths.includes(monthFull)) suffix = ' (peak season)';
    else if (slowMonths.includes(monthFull)) suffix = ' (slow season)';
    return `${monthFull} — ${val}× average${suffix}`;
}

const TREND_CONFIG = {
    growing: { icon: TrendingUp, color: 'var(--color-success)', label: 'Growing' },
    stable: { icon: Minus, color: 'var(--color-warning)', label: 'Stable' },
    declining: { icon: TrendingDown, color: 'var(--color-danger)', label: 'Declining' },
};

export default function Reports() {
    useSEO('Reports');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const fetchSeasonal = useCallback(async (refresh = false) => {
        setLoading(true);
        try {
            const url = refresh ? 'ai/seasonal?refresh=1' : 'ai/seasonal';
            const res = await api.get(url);
            setData(res.data);
        } catch {
            // keep stale
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchSeasonal(); }, [fetchSeasonal]);

    const seasonalIndex = data?.seasonal_index || {};
    const peakMonths = data?.peak_months || [];
    const slowMonths = data?.slow_months || [];
    const bestDay = data?.best_day_of_week || 'N/A';
    const worstDay = data?.worst_day_of_week || 'N/A';
    const yoy = data?.yoy_growth_percent ?? 0;
    const trendDir = data?.trend_direction || 'stable';
    const trendCfg = TREND_CONFIG[trendDir] || TREND_CONFIG.stable;
    const TrendIcon = trendCfg.icon;

    // Build 4 rows × 3 cols grid of months
    const grid = [];
    for (let r = 0; r < 4; r++) {
        grid.push(MONTHS.slice(r * 3, r * 3 + 3));
    }

    return (
        <div style={{ padding: '0 0 24px', maxWidth: 900, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Calendar size={22} color="var(--primary)" />
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
                    Seasonal Analysis
                </h2>
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => fetchSeasonal(true)}
                    disabled={loading}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                        background: 'var(--card-bg, #fff)', cursor: 'pointer',
                        fontSize: 13, color: 'var(--text-muted, var(--muted))',
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {loading && !data ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted, var(--muted))' }}>
                    Loading seasonal data…
                </div>
            ) : (
                <>
                    {/* Seasonal Heatmap */}
                    <div style={{
                        borderRadius: 12, border: '1px solid var(--border)',
                        background: 'var(--card-bg, #fff)', overflow: 'hidden', marginBottom: 20,
                    }}>
                        <div style={{
                            padding: '14px 16px', borderBottom: '1px solid var(--border)',
                            fontWeight: 600, fontSize: 14, color: 'var(--text)',
                            display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                            <BarChart3 size={16} />
                            Monthly Seasonal Index
                        </div>

                        <div style={{ padding: 16, position: 'relative' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: 8,
                            }}>
                                {grid.flat().map((month) => {
                                    const val = seasonalIndex[month] || 0;
                                    const bg = indexToColor(val);
                                    const textColor = val > 1.1 ? 'var(--color-surface)' : val > 0.8 ? 'var(--color-textSecondary)' : 'var(--color-icon)';
                                    const fullName = MONTH_FULL[month];
                                    const tipText = indexLabel(val, peakMonths, slowMonths, fullName);

                                    return (
                                        <div
                                            key={month}
                                            onMouseEnter={() => setTooltip(tipText)}
                                            onMouseLeave={() => setTooltip(null)}
                                            onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                                            style={{
                                                position: 'relative',
                                                background: bg,
                                                borderRadius: 10,
                                                padding: '18px 12px',
                                                textAlign: 'center',
                                                cursor: 'default',
                                                transition: 'transform 0.15s, box-shadow 0.15s',
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.04)';
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)';
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)';
                                                e.currentTarget.style.boxShadow = 'none';
                                            }}
                                        >
                                            <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>
                                                {month}
                                            </div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: textColor, marginTop: 4 }}>
                                                {val > 0 ? `${val}×` : '—'}
                                            </div>
                                            {peakMonths.includes(fullName) && (
                                                <div style={{ fontSize: 10, marginTop: 2, color: textColor, opacity: 0.85 }}>
                                                    ▲ Peak
                                                </div>
                                            )}
                                            {slowMonths.includes(fullName) && (
                                                <div style={{ fontSize: 10, marginTop: 2, color: textColor, opacity: 0.85 }}>
                                                    ▼ Slow
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tooltip */}
                            {tooltip && (
                                <div style={{
                                    position: 'fixed',
                                    top: tooltipPos.y - 45,
                                    left: tooltipPos.x,
                                    transform: 'translateX(-50%)',
                                    background: 'var(--accent)',
                                    color: 'var(--on-accent)',
                                    padding: '6px 14px',
                                    borderRadius: 8,
                                    fontSize: 12,
                                    whiteSpace: 'nowrap',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                                    zIndex: 9999,
                                    pointerEvents: 'none',
                                    animation: 'fade-in 0.1s ease-out',
                                }}>
                                    {tooltip}
                                </div>
                            )}

                            {/* Legend */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 6, marginTop: 16, fontSize: 11, color: 'var(--text-muted, var(--muted))',
                            }}>
                                <span>Low</span>
                                {[0.5, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5].map(v => (
                                    <div key={v} style={{
                                        width: 20, height: 12, borderRadius: 3,
                                        background: indexToColor(v),
                                    }} />
                                ))}
                                <span>High</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                    }}>
                        {/* Best Day */}
                        <div style={cardStyle}>
                            <div style={cardLabelStyle}>
                                <Sun size={14} color='var(--color-warning)' /> Best Day
                            </div>
                            <div style={cardValueStyle}>{bestDay}</div>
                            <div style={cardSubStyle}>Highest avg revenue</div>
                        </div>

                        {/* Worst Day */}
                        <div style={cardStyle}>
                            <div style={cardLabelStyle}>
                                <CloudRain size={14} color='var(--color-textMuted)' /> Worst Day
                            </div>
                            <div style={cardValueStyle}>{worstDay}</div>
                            <div style={cardSubStyle}>Lowest avg revenue</div>
                        </div>

                        {/* YoY Growth */}
                        <div style={cardStyle}>
                            <div style={cardLabelStyle}>
                                {yoy >= 0
                                    ? <TrendingUp size={14} color='var(--color-success)' />
                                    : <TrendingDown size={14} color='var(--color-danger)' />}
                                YoY Growth
                            </div>
                            <div style={{
                                ...cardValueStyle,
                                color: yoy > 0 ? 'var(--color-success)' : yoy < 0 ? 'var(--color-danger)' : 'var(--text)',
                            }}>
                                {yoy > 0 ? '+' : ''}{yoy}%
                            </div>
                            <div style={cardSubStyle}>vs previous year</div>
                        </div>

                        {/* Trend */}
                        <div style={cardStyle}>
                            <div style={cardLabelStyle}>
                                <TrendIcon size={14} color={trendCfg.color} /> Trend
                            </div>
                            <div style={{ ...cardValueStyle, color: trendCfg.color }}>
                                {trendCfg.label}
                            </div>
                            <div style={cardSubStyle}>Last 90 days</div>
                        </div>
                    </div>

                    {/* Generated timestamp */}
                    {data?.generated_at && (
                        <div style={{
                            textAlign: 'right', fontSize: 11, marginTop: 16,
                            color: 'var(--text-muted, var(--muted))',
                        }}>
                            Last computed: {new Date(data.generated_at).toLocaleString('en-IN', {
                                day: 'numeric', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Shared card styles ───────────────────────────────────────────────────────

const cardStyle = {
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--card-bg, #fff)',
    padding: '16px',
};

const cardLabelStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 500,
    color: 'var(--text-muted, var(--muted))',
    marginBottom: 6,
};

const cardValueStyle = {
    fontSize: 22, fontWeight: 700, color: 'var(--text)',
};

const cardSubStyle = {
    fontSize: 11, color: 'var(--text-muted, var(--muted))', marginTop: 2,
};

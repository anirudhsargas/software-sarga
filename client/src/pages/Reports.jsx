import { useSEO } from '../hooks/useSEO';
import PageContainer from '../components/ui/PageContainer';
import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, TrendingUp, TrendingDown, Minus, Sun, CloudRain, RefreshCw, BarChart3 } from 'lucide-react';
import api from '../services/api';
import './Reports.css';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_FULL = {
    Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April',
    May: 'May', Jun: 'June', Jul: 'July', Aug: 'August',
    Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
};

// Green color scale from light (#C8E6C9) to dark (#1B5E20)
function indexToColor(val) {
    if (!val || val === 0) return 'var(--secondary)';
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
    growing: { icon: TrendingUp, color: 'var(--success)', label: 'Growing' },
    stable: { icon: Minus, color: 'var(--warning)', label: 'Stable' },
    declining: { icon: TrendingDown, color: 'var(--destructive)', label: 'Declining' },
};

export default function Reports() {
    useSEO('Reports');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [tooltip, setTooltip] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const fetchSeasonal = useCallback(async () => {
        setLoading(false);
        setData(null);
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
        <PageContainer>
            {/* Header */}
            <div className="reports-header">
                <Calendar size={22} color="var(--primary)" />
                <h2 className="reports-header-title">
                    Seasonal Analysis
                </h2>
                <div style={{ flex: 1 }} />
                <button
                    onClick={() => fetchSeasonal(true)}
                    disabled={loading}
                    className="reports-refresh-btn"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {loading && !data ? (
                <div className="reports-loading">
                    Loading seasonal data…
                </div>
            ) : !data || Object.keys(seasonalIndex).length === 0 ? (
                <div className="empty-state-global reports-error">
                    <div className="empty-state-global__icon"><BarChart3 size={48} /></div>
                    <p className="empty-state-global__title">No data available</p>
                </div>
            ) : (
                <>
                    {/* Seasonal Heatmap */}
                    <div className="heatmap-card">
                        <div className="heatmap-header">
                            <BarChart3 size={16} />
                            Monthly Seasonal Index
                        </div>

                        <div className="heatmap-body">
                            <div className="heatmap-grid">
                                {grid.flat().map((month) => {
                                    const val = seasonalIndex[month] || 0;
                                    const bg = indexToColor(val);
                                    const textColor = val > 1.1 ? 'var(--card)' : 'var(--text-primary)';
                                    const fullName = MONTH_FULL[month];
                                    const tipText = indexLabel(val, peakMonths, slowMonths, fullName);

                                    return (
                                        <div
                                            key={month}
                                            onMouseEnter={() => setTooltip(tipText)}
                                            onMouseLeave={() => setTooltip(null)}
                                            onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                                            className="heatmap-cell"
                                            style={{
                                                background: bg,
                                            }}
                                        >
                                            <div className="heatmap-cell-month" style={{ color: textColor }}>
                                                {month}
                                            </div>
                                            <div className="heatmap-cell-value" style={{ color: textColor }}>
                                                {val > 0 ? `${val}×` : '—'}
                                            </div>
                                            {peakMonths.includes(fullName) && (
                                                <div className="heatmap-cell-badge" style={{ color: textColor }}>
                                                    ▲ Peak
                                                </div>
                                            )}
                                            {slowMonths.includes(fullName) && (
                                                <div className="heatmap-cell-badge" style={{ color: textColor }}>
                                                    ▼ Slow
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tooltip */}
                            {tooltip && (
                                <div 
                                    className="heatmap-tooltip"
                                    style={{
                                        top: tooltipPos.y - 45,
                                        left: tooltipPos.x,
                                    }}
                                >
                                    {tooltip}
                                </div>
                            )}

                            {/* Legend */}
                            <div className="heatmap-legend">
                                <span>Low</span>
                                {[0.5, 0.7, 0.9, 1.0, 1.1, 1.3, 1.5].map(v => (
                                    <div key={v} className="heatmap-legend-color" style={{
                                        background: indexToColor(v),
                                    }} />
                                ))}
                                <span>High</span>
                            </div>
                        </div>
                    </div>

                    {/* Stat Cards */}
                    <div className="stats-grid">
                        {/* Best Day */}
                        <div className="reports-card">
                            <div className="reports-card-label">
                                <Sun size={14} color='var(--warning)' /> Best Day
                            </div>
                            <div className="reports-card-value">{bestDay}</div>
                            <div className="reports-card-sub">Highest avg revenue</div>
                        </div>

                        {/* Worst Day */}
                        <div className="reports-card">
                            <div className="reports-card-label">
                                <CloudRain size={14} color='var(--muted-foreground)' /> Worst Day
                            </div>
                            <div className="reports-card-value">{worstDay}</div>
                            <div className="reports-card-sub">Lowest avg revenue</div>
                        </div>

                        {/* YoY Growth */}
                        <div className="reports-card">
                            <div className="reports-card-label">
                                {yoy >= 0
                                    ? <TrendingUp size={14} color='var(--success)' />
                                    : <TrendingDown size={14} color='var(--destructive)' />}
                                YoY Growth
                            </div>
                            <div className="reports-card-value" style={{
                                color: yoy > 0 ? 'var(--success)' : yoy < 0 ? 'var(--destructive)' : 'var(--text-primary)',
                            }}>
                                {yoy > 0 ? '+' : ''}{yoy}%
                            </div>
                            <div className="reports-card-sub">vs previous year</div>
                        </div>

                        {/* Trend */}
                        <div className="reports-card">
                            <div className="reports-card-label">
                                <TrendIcon size={14} color={trendCfg.color} /> Trend
                            </div>
                            <div className="reports-card-value" style={{ color: trendCfg.color }}>
                                {trendCfg.label}
                            </div>
                            <div className="reports-card-sub">Last 90 days</div>
                        </div>
                    </div>

                    {/* Generated timestamp */}
                    {data?.generated_at && (
                        <div className="reports-timestamp">
                            Last computed: {new Date(data.generated_at).toLocaleString('en-IN', {
                                day: 'numeric', month: 'short', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })}
                        </div>
                    )}
                </>
            )}
        </PageContainer>
    );
}

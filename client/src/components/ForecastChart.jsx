import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ComposedChart, Legend
} from 'recharts';
import { RefreshCw, TrendingUp, Loader2 } from 'lucide-react';
import api from '../services/api';

const fmt = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div style={{
            background: 'var(--card-bg, #fff)', border: '1px solid var(--border)',
            borderRadius: '10px', padding: '10px 14px', fontSize: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>{label}</div>
            {payload.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    <span style={{ color: 'var(--muted)' }}>{p.name}:</span>
                    <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
                </div>
            ))}
        </div>
    );
};

export default function ForecastChart() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState(30); // 7 or 30

    const fetchForecast = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get(`ai/forecast?branch=all&days=${range}`);
            setData(res.data);
        } catch {
            // keep stale
        } finally {
            setLoading(false);
        }
    }, [range]);

    useEffect(() => { fetchForecast(); }, [fetchForecast]);

    const chartData = useMemo(() => {
        if (!data) return [];
        const actual = data.actual_revenue || [];
        const forecast = data.forecast || [];

        // Build a date-keyed map merging actual + predicted (aggregate across branches)
        const map = new Map();

        for (const a of actual) {
            const d = a.date?.slice(0, 10);
            if (!d) continue;
            const entry = map.get(d) || { date: d };
            entry.actual = (entry.actual || 0) + (a.revenue || 0);
            map.set(d, entry);
        }

        for (const f of forecast) {
            const d = f.date?.slice(0, 10);
            if (!d) continue;
            const entry = map.get(d) || { date: d };
            entry.predicted = (entry.predicted || 0) + (f.predicted_revenue || 0);
            entry.confidence_low = (entry.confidence_low || 0) + (f.confidence_low || 0);
            entry.confidence_high = (entry.confidence_high || 0) + (f.confidence_high || 0);
            map.set(d, entry);
        }

        const sorted = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));

        // Limit to `range` days of actual + `range` days of forecast
        const result = sorted.slice(-range * 2);

        // Format dates for display
        return result.map(r => ({
            ...r,
            label: new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        }));
    }, [data, range]);

    const accuracy = data?.model_accuracy != null ? Math.round(data.model_accuracy * 100) : null;
    const modelType = data?.model_type;

    return (
        <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius, 12px)',
            border: '1px solid var(--border)', padding: '20px', marginBottom: '20px',
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <TrendingUp size={18} color="var(--accent)" />
                    <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
                        ML Revenue Forecast
                    </h3>
                    {accuracy !== null && (
                        <span style={{
                            padding: '2px 9px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
                            background: accuracy >= 75 ? 'rgba(47,125,74,0.1)' : accuracy >= 60 ? 'rgba(179,107,0,0.1)' : 'rgba(176,58,46,0.1)',
                            color: accuracy >= 75 ? 'var(--success)' : accuracy >= 60 ? 'var(--warning)' : 'var(--error)',
                        }}>
                            {accuracy}% R²
                        </span>
                    )}
                    {modelType && modelType !== 'none' && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>
                            {modelType === 'random_forest' ? 'Random Forest' : modelType === 'moving_average' ? '30-day Avg' : modelType}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Range toggle */}
                    {[7, 30].map(d => (
                        <button
                            key={d}
                            onClick={() => setRange(d)}
                            style={{
                                padding: '4px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                border: '1px solid var(--border)', cursor: 'pointer',
                                background: range === d ? 'var(--accent)' : 'transparent',
                                color: range === d ? '#000' : 'var(--muted)',
                            }}
                        >
                            {d}d
                        </button>
                    ))}
                    <button
                        onClick={fetchForecast}
                        disabled={loading}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--muted)', display: 'flex' }}
                        title="Refresh forecast"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Chart */}
            {loading && !data ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, gap: '8px', color: 'var(--muted)' }}>
                    <Loader2 size={16} className="animate-spin" /> Loading forecast…
                </div>
            ) : chartData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '13px' }}>
                    No forecast data available yet
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 11, fill: 'var(--muted)' }}
                            interval="preserveStartEnd"
                            tickMargin={6}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: 'var(--muted)' }}
                            tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
                            width={48}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                            iconSize={10}
                        />

                        {/* Confidence band */}
                        <Area
                            dataKey="confidence_high"
                            stroke="none"
                            fill="rgba(59, 130, 246, 0.08)"
                            name="Confidence Band"
                            isAnimationActive={false}
                        />
                        <Area
                            dataKey="confidence_low"
                            stroke="none"
                            fill="var(--card-bg, #fff)"
                            name=" "
                            legendType="none"
                            isAnimationActive={false}
                        />

                        {/* Actual revenue */}
                        <Line
                            dataKey="actual"
                            stroke="var(--accent, #00b894)"
                            strokeWidth={2}
                            dot={{ r: 2, fill: 'var(--accent, #00b894)' }}
                            name="Actual Revenue"
                            connectNulls={false}
                        />

                        {/* Predicted revenue */}
                        <Line
                            dataKey="predicted"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            dot={{ r: 2, fill: '#3b82f6' }}
                            name="Predicted Revenue"
                            connectNulls={false}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            )}

            {/* Top features */}
            {data?.top_features?.length > 0 && (
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Top Predictive Features
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {data.top_features.slice(0, 6).map((f, i) => (
                            <span key={i} style={{
                                padding: '3px 10px', borderRadius: '8px', fontSize: '11px',
                                background: 'var(--bg-2, var(--bg))', color: 'var(--text)',
                                fontFamily: "'Space Grotesk', sans-serif",
                            }}>
                                {f.feature_name.replace(/^svc_/, '').replace(/_/g, ' ')}
                                <span style={{ marginLeft: '4px', color: 'var(--muted)' }}>
                                    {(f.importance_score * 100).toFixed(0)}%
                                </span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

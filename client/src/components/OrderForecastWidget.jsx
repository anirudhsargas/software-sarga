import React, { useEffect, useState } from 'react';
import useScrollAnimation from '../hooks/useScrollAnimation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, Calendar } from 'lucide-react';
import api from '../services/api';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BAR_COLOR = 'var(--primary, #6366f1)';
const PEAK_COLOR = 'var(--color-warning)';

const OrderForecastWidget = ({ branchId }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setMounted(true));
    }, []);

    // Call hooks unconditionally to preserve hook ordering across renders
    const ref = useScrollAnimation({ stagger: true, staggerSelector: 'div > *' });

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const res = await api.get('/ai/order-forecast', { 
                    params: { 
                        branch: branchId || 'all', 
                        horizon: 7 
                    } 
                });
                setData(res.data);
                setError(false);
            } catch {
                setError(true);
            } finally {
                setLoading(false);
            }
        })();
    }, [branchId]);

    if (loading) return <SkeletonLoader />;
    if (error || !data) return null;

    const { predictions = [], peak_day_this_week: peak, model_type } = data;

    // Aggregate across branches per day
    const dayMap = {};
    for (const p of predictions) {
        if (!dayMap[p.date]) {
            dayMap[p.date] = { date: p.date, predicted_orders: 0, low: 0, high: 0 };
        }
        dayMap[p.date].predicted_orders += p.predicted_orders;
        dayMap[p.date].low += p.confidence_interval?.[0] || 0;
        dayMap[p.date].high += p.confidence_interval?.[1] || 0;
    }

    const chartData = Object.values(dayMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(d => {
            const dt = new Date(d.date + 'T00:00:00');
            return {
                ...d,
                label: DAY_NAMES[dt.getDay()],
                fullDay: FULL_DAY_NAMES[dt.getDay()],
                dateStr: `${dt.getDate()}/${dt.getMonth() + 1}`,
                predicted_orders: Math.round(d.predicted_orders),
                isPeak: peak && d.date === peak.date,
            };
        });

    const peakEntry = chartData.find(d => d.isPeak);
    const peakLabel = peakEntry
        ? `${peakEntry.fullDay} · ~${peakEntry.predicted_orders} jobs expected`
        : null;

    // Per-branch forecasts for the cards
    const branchGroups = {};
    for (const p of predictions) {
        const key = p.branch_id;
        if (!branchGroups[key]) {
            branchGroups[key] = { branch_id: key, branch_name: p.branch_name || `Branch ${key}`, branch_short: p.branch_short, total: 0, days: [] };
        }
        branchGroups[key].total += p.predicted_orders;
        branchGroups[key].days.push(p);
    }
    const branchCards = Object.values(branchGroups);

    return (
        <section ref={ref} className="summary-section animate-fade-up" style={{ marginTop: 24 }}>
            <div className="summary-section__header">
                <div>
                    <h2 className="section-title">Order Forecast — Next 7 Days</h2>
                    <p className="section-subtitle">
                        {model_type ? `${model_type} model` : 'AI prediction'}
                        {data.model_accuracy != null && <> · MAE {data.model_accuracy}</>}
                    </p>
                </div>
                <Calendar size={22} className="muted" />
            </div>

            {/* Chart */}
            {mounted && (
                <div style={{ width: '100%', height: 300, marginBottom: 4 }}>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e5e7eb)" />
                        <XAxis
                            dataKey="label"
                            tick={{ fontSize: 12, fill: 'var(--muted, #9ca3af)' }}
                            tickLine={false}
                        />
                        <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11, fill: 'var(--muted, #9ca3af)' }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload?.[0]) return null;
                                const d = payload[0].payload;
                                return (
                                    <div style={{
                                        background: 'var(--surface, #fff)', border: '1px solid var(--border, #e5e7eb)',
                                        borderRadius: 8, padding: '8px 12px', fontSize: 13, boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{ fontWeight: 600 }}>{d.fullDay} ({d.dateStr})</div>
                                        <div>Predicted: <strong>{d.predicted_orders}</strong> jobs</div>
                                        <div style={{ color: 'var(--muted)', fontSize: 11 }}>Range: {Math.round(d.low)} – {Math.round(d.high)}</div>
                                    </div>
                                );
                            }}
                        />
                        <Bar dataKey="predicted_orders" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {chartData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.isPeak ? PEAK_COLOR : BAR_COLOR} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                </div>
            )}

            {/* Peak stat */}
            {peakLabel && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: 'var(--warning-bg)', borderRadius: 8,
                    fontSize: 13, color: 'var(--color-danger)', marginBottom: 16,
                }}>
                    <TrendingUp size={16} style={{ color: PEAK_COLOR }} />
                    <span><strong>Peak day:</strong> {peakLabel}</span>
                </div>
            )}

            {/* Branch cards */}
            {branchCards.length > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    {branchCards.map(bc => {
                        const branchPeak = bc.days.reduce((a, b) => a.predicted_orders > b.predicted_orders ? a : b, bc.days[0]);
                        const peakDt = new Date(branchPeak.date + 'T00:00:00');
                        return (
                            <div key={bc.branch_id} className="hover-lift" style={{
                                padding: 14, borderRadius: 10,
                                border: '1px solid var(--border, #e5e7eb)',
                                background: 'var(--surface-lowest, #f8fafc)',
                            }}>
                                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                                    {bc.branch_name}
                                    {bc.branch_short && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>({bc.branch_short})</span>}
                                </div>
                                <div style={{ fontSize: 22, fontWeight: 700 }}>
                                    ~{Math.round(bc.total)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>jobs this week</span>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                                    Peak: {FULL_DAY_NAMES[peakDt.getDay()]} · ~{Math.round(branchPeak.predicted_orders)} jobs
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

const SkeletonLoader = () => (
    <section className="summary-section animate-fade-up" style={{ marginTop: 24 }}>
        <div className="summary-section__header">
            <div>
                <div className="skeleton" style={{ width: 220, height: 16, borderRadius: 4, background: 'var(--border, #e5e7eb)' }} />
                <div className="skeleton" style={{ width: 140, height: 12, borderRadius: 4, background: 'var(--border, #e5e7eb)', marginTop: 8 }} />
            </div>
        </div>
        <div style={{ display: 'flex', gap: 8, height: 180, alignItems: 'flex-end', padding: '16px 0' }}>
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="skeleton" style={{
                    flex: 1, borderRadius: 4,
                    background: 'var(--border, #e5e7eb)',
                    height: `${30 + Math.random() * 60}%`,
                    animation: 'pulse 1.5s ease-in-out infinite',
                    animationDelay: `${i * 0.1}s`,
                }} />
            ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[0, 1].map(i => (
                <div key={i} className="skeleton" style={{
                    height: 80, borderRadius: 10,
                    background: 'var(--border, #e5e7eb)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                }} />
            ))}
        </div>
    </section>
);

export default React.memo(OrderForecastWidget);

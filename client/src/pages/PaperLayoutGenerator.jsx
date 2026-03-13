import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Layers, Calculator, Download, Loader2, RotateCcw, Maximize } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const PAPER_SIZES = [
    { name: 'A4', w: 210, h: 297 },
    { name: 'A3', w: 297, h: 420 },
    { name: 'Letter', w: 216, h: 279 },
    { name: 'Legal', w: 216, h: 356 },
    { name: 'SRA3', w: 320, h: 450 },
    { name: 'Custom', w: 0, h: 0 },
];

const PaperLayoutGenerator = () => {
    const canvasRef = useRef(null);
    const [paperSize, setPaperSize] = useState('A3');
    const [paperW, setPaperW] = useState(297);
    const [paperH, setPaperH] = useState(420);
    const [designW, setDesignW] = useState(100);
    const [designH, setDesignH] = useState(150);
    const [bleed, setBleed] = useState(3);
    const [margin, setMargin] = useState(5);
    const [gutter, setGutter] = useState(2);
    const [layout, setLayout] = useState(null);
    const [loading, setLoading] = useState(false);
    const [comparison, setComparison] = useState(null);

    useEffect(() => {
        const preset = PAPER_SIZES.find(p => p.name === paperSize);
        if (preset && preset.w) { setPaperW(preset.w); setPaperH(preset.h); }
    }, [paperSize]);

    const drawCanvas = useCallback((layoutData) => {
        const canvas = canvasRef.current;
        if (!canvas || !layoutData) return;
        const ctx = canvas.getContext('2d');
        const { sheet, placements } = layoutData;
        if (!sheet) return;
        const paper_width = sheet.width;
        const paper_height = sheet.height;
        const scale = Math.min(canvas.width / paper_width, canvas.height / paper_height) * 0.9;
        const offX = (canvas.width - paper_width * scale) / 2;
        const offY = (canvas.height - paper_height * scale) / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Paper
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fbfaf7';
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || '#dedad1';
        ctx.lineWidth = 1;
        ctx.fillRect(offX, offY, paper_width * scale, paper_height * scale);
        ctx.strokeRect(offX, offY, paper_width * scale, paper_height * scale);

        // Designs
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f2a33';
        if (placements) {
            placements.forEach((p, i) => {
                const x = offX + p.x * scale;
                const y = offY + p.y * scale;
                const w = p.width * scale;
                const h = p.height * scale;
                ctx.fillStyle = accent + '18'; // subtle fill
                ctx.strokeStyle = accent;
                ctx.lineWidth = 1.5;
                ctx.fillRect(x, y, w, h);
                ctx.strokeRect(x, y, w, h);

                // Bleed lines (dashed)
                if (bleed > 0) {
                    ctx.save();
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--error').trim() || '#b03a2e';
                    ctx.lineWidth = 0.5;
                    const bx = x + bleed * scale, by = y + bleed * scale;
                    const bw = w - 2 * bleed * scale, bh = h - 2 * bleed * scale;
                    if (bw > 0 && bh > 0) ctx.strokeRect(bx, by, bw, bh);
                    ctx.restore();
                }

                // Number label
                ctx.fillStyle = accent;
                ctx.font = `600 ${Math.max(10, 12 * scale)}px 'Space Grotesk', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${i + 1}`, x + w / 2, y + h / 2);
            });
        }

        // Cut marks
        const markLen = 8;
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#6c7077';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        if (placements) {
            placements.forEach(p => {
                const corners = [
                    [p.x, p.y], [p.x + p.width, p.y],
                    [p.x, p.y + p.height], [p.x + p.width, p.y + p.height]
                ];
                corners.forEach(([cx, cy]) => {
                    const sx = offX + cx * scale, sy = offY + cy * scale;
                    ctx.beginPath();
                    ctx.moveTo(sx - markLen, sy); ctx.lineTo(sx + markLen, sy);
                    ctx.moveTo(sx, sy - markLen); ctx.lineTo(sx, sy + markLen);
                    ctx.stroke();
                });
            });
        }
    }, [bleed]);

    useEffect(() => { if (layout) drawCanvas(layout); }, [layout, drawCanvas]);

    const calculate = async () => {
        setLoading(true);
        try {
            const res = await api.post('ai/paper-layout/calculate', {
                sheet_size: { width: paperW, height: paperH },
                design_size: { width: designW, height: designH },
                bleed, margin, gutter, quantity: 1
            });
            setLayout(res.data);
            setComparison(null);
        } catch { toast.error('Calculation failed'); }
        finally { setLoading(false); }
    };

    const compare = async () => {
        try {
            const res = await api.post('ai/paper-layout/compare', {
                design_size: { width: designW, height: designH },
                bleed, margin, gutter, quantity: 1
            });
            setComparison(res.data.comparisons || []);
        } catch { toast.error('Comparison failed'); }
    };

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Layers size={24} /> Paper Layout Optimizer
                    </h1>
                    <p className="section-subtitle">Maximize print yield and minimize paper waste</p>
                </div>
            </div>

            <div className="ai-grid ai-grid--controls">
                {/* Controls Panel */}
                <div className="panel" style={{ alignSelf: 'start' }}>
                    <h3 className="ai-section-heading">Configuration</h3>

                    {/* Paper Size */}
                    <div style={{ marginBottom: 14 }}>
                        <label className="label">Paper Size</label>
                        <select className="input-field" value={paperSize} onChange={e => setPaperSize(e.target.value)}>
                            {PAPER_SIZES.map(p => <option key={p.name} value={p.name}>{p.name}{p.w ? ` (${p.w}×${p.h}mm)` : ''}</option>)}
                        </select>
                    </div>

                    {(paperSize === 'Custom') && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                            <div>
                                <label className="label">Width (mm)</label>
                                <input className="input-field" type="number" min={1} value={paperW} onChange={e => setPaperW(+e.target.value)} />
                            </div>
                            <div>
                                <label className="label">Height (mm)</label>
                                <input className="input-field" type="number" min={1} value={paperH} onChange={e => setPaperH(+e.target.value)} />
                            </div>
                        </div>
                    )}

                    {/* Design Size */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div>
                            <label className="label">Design W (mm)</label>
                            <input className="input-field" type="number" min={1} value={designW} onChange={e => setDesignW(+e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Design H (mm)</label>
                            <input className="input-field" type="number" min={1} value={designH} onChange={e => setDesignH(+e.target.value)} />
                        </div>
                    </div>

                    {/* Bleed / Margin / Gutter */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
                        <div>
                            <label className="label">Bleed</label>
                            <input className="input-field" type="number" min={0} value={bleed} onChange={e => setBleed(+e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Margin</label>
                            <input className="input-field" type="number" min={0} value={margin} onChange={e => setMargin(+e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Gutter</label>
                            <input className="input-field" type="number" min={0} value={gutter} onChange={e => setGutter(+e.target.value)} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" onClick={calculate} disabled={loading} style={{ flex: 1 }}>
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                            Calculate
                        </button>
                        <button className="btn btn-ghost" onClick={compare} title="Compare paper sizes">
                            <Maximize size={16} />
                        </button>
                    </div>
                </div>

                {/* Preview + Results */}
                <div>
                    {/* Canvas */}
                    <div className="panel" style={{ marginBottom: 20 }}>
                        <h3 className="ai-section-heading">
                            Layout Preview
                        </h3>
                        <canvas ref={canvasRef} width={600} height={500}
                            style={{ width: '100%', height: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }} />
                    </div>

                    {/* Stats */}
                    {layout && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: 'Copies/Sheet', value: layout.cards_per_sheet || 0 },
                                { label: 'Waste', value: `${(layout.waste_percent || 0).toFixed(1)}%` },
                                { label: 'Orientation', value: layout.is_rotated ? 'Landscape' : 'Portrait' },
                                { label: 'Paper', value: `${paperW}×${paperH}mm` },
                            ].map((s, i) => (
                                <div key={i} className="summary-tile" style={{ minHeight: 'auto', padding: 14 }}>
                                    <div className="summary-tile__title">{s.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: 'var(--accent)' }}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {layout && (
                        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                            <button className="btn btn-ghost" onClick={() => { setLayout(null); setComparison(null); }}>
                                <RotateCcw size={16} /> Reset
                            </button>
                            <button className="btn btn-primary" onClick={() => toast('PDF generation coming soon')}>
                                <Download size={16} /> Export PDF
                            </button>
                        </div>
                    )}

                    {/* Comparison Table */}
                    {comparison && (
                        <div className="panel panel--tight">
                            <h3 className="ai-section-heading" style={{ marginBottom: 12 }}>Paper Size Comparison</h3>
                            <div className="table-scroll">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Paper</th>
                                            <th>Copies</th>
                                            <th>Waste</th>
                                            <th>Efficiency</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {comparison.sort((a, b) => b.cards_per_sheet - a.cards_per_sheet).map((c, i) => (
                                            <tr key={i} style={{ cursor: 'pointer' }}
                                                onClick={() => { setPaperSize('Custom'); setPaperW(c.sheet?.width || paperW); setPaperH(c.sheet?.height || paperH); setLayout(c); }}>
                                                <td style={{ fontWeight: 600 }}>{c.paper_name}</td>
                                                <td>{c.cards_per_sheet}</td>
                                                <td>{(c.waste_percent || 0).toFixed(1)}%</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', borderRadius: 3, background: (100 - (c.waste_percent || 0)) >= 70 ? 'var(--success)' : 'var(--warning)', width: `${100 - (c.waste_percent || 0)}%` }} />
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-2)' }}>
                                                            {(100 - (c.waste_percent || 0)).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @media (max-width: 900px) {
                    .ai-grid--controls { grid-template-columns: 1fr !important; }
                }
            `}</style>
        </div>
    );
};

export default PaperLayoutGenerator;

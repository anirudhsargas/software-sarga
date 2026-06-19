import { useSEO } from '../hooks/useSEO';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Layers, Calculator, Download, Loader2, RotateCcw, Maximize, AlertTriangle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { optimizePaperUsage, findBestSheetSize, PAPER_SIZES as PAPER_SIZES_CONST, SHEET_SIZES } from '../utils/paperOptimizer';
import PageContainer from '../components/ui/PageContainer';

const PAPER_SIZES = [
    { name: 'A4', w: 210, h: 297 },
    { name: 'A3', w: 297, h: 420 },
    { name: 'Letter', w: 216, h: 279 },
    { name: 'Legal', w: 216, h: 356 },
    { name: 'SRA3', w: 320, h: 450 },
    { name: '13x19', w: 330, h: 483 },
    { name: '12x18', w: 305, h: 457 },
    { name: 'Custom', w: 0, h: 0 },
];

const UNIT_MM = 1;
const UNIT_CM = 10;
const UNIT_INCH = 25.4;
const UNIT_LABELS = { mm: 'mm', cm: 'cm', inch: 'inch' };

const convertToMm = (value, unit) => {
    if (unit === 'cm') return Math.round(value * 10);
    if (unit === 'inch') return Math.round(value * 25.4);
    return Math.round(value);
};

const convertFromMm = (value, unit) => {
    if (unit === 'cm') return +(value / 10).toFixed(2);
    if (unit === 'inch') return +(value / 25.4).toFixed(3);
    return value;
};

const PaperLayoutGenerator = () => {
    useSEO('Paper Layout Generator');

    const canvasRef = useRef(null);
    const [unit, setUnit] = useState('mm');
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
    const [useClientOptimization, setUseClientOptimization] = useState(true);
    const [quantity, setQuantity] = useState(100);

    useEffect(() => {
        const preset = PAPER_SIZES.find(p => p.name === paperSize);
        if (preset && preset.w) { setPaperW(preset.w); setPaperH(preset.h); }
    }, [paperSize]);

    // Client-side optimization using paperOptimizer
    const clientOptimization = useMemo(() => {
        if (!useClientOptimization || paperW <= 0 || paperH <= 0 || designW <= 0 || designH <= 0) {
            return null;
        }

        const result = optimizePaperUsage({
            sheetSize: 'Custom',
            sheetW: paperW,
            sheetH: paperH,
            itemSize: 'Custom',
            itemW: designW,
            itemH: designH,
            itemCount: quantity,
            bleed: bleed + gutter,
            doubleSide: false
        });

        return result;
    }, [paperW, paperH, designW, designH, quantity, bleed, gutter, useClientOptimization]);

    // Find best sheet size for current design
    const bestSheetOptions = useMemo(() => {
        if (designW <= 0 || designH <= 0) return [];
        
        return findBestSheetSize({
            itemSize: 'Custom',
            itemW: designW,
            itemH: designH,
            itemCount: quantity,
            bleed: bleed + gutter,
            doubleSide: false
        });
    }, [designW, designH, quantity, bleed, gutter]);

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
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || 'var(--background)';
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--border').trim() || 'var(--border)';
        ctx.lineWidth = 1;
        ctx.fillRect(offX, offY, paper_width * scale, paper_height * scale);
        ctx.strokeRect(offX, offY, paper_width * scale, paper_height * scale);

        // Designs
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'var(--foreground)';
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
                    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--error').trim() || 'var(--destructive)';
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
        ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || 'var(--muted-foreground)';
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
        <PageContainer>
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
                        <label className="label" htmlFor="paper-size-select">Paper Size</label>
                        <select id="paper-size-select" className="input-field" value={paperSize} onChange={e => setPaperSize(e.target.value)}>
                            {PAPER_SIZES.map(p => <option key={p.name} value={p.name}>{p.name}{p.w ? ` (${convertFromMm(p.w, unit)}×${convertFromMm(p.h, unit)}${unit})` : ''}</option>)}
                        </select>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                        <label className="label" htmlFor="unit-select">Unit</label>
                        <select id="unit-select" className="input-field" value={unit} onChange={e => {
                            const newUnit = e.target.value;
                            const factor = newUnit === 'cm' ? 0.1 : newUnit === 'inch' ? 1 / 25.4 : 1;
                            const toFactor = unit === 'cm' ? 0.1 : unit === 'inch' ? 1 / 25.4 : 1;
                            setUnit(newUnit);
                            setPaperW(+(paperW * UNIT_LABELS[unit] ? 1 : factor / toFactor).toFixed(3) || paperW);
                        }}>
                            <option value="mm">mm</option>
                            <option value="cm">cm</option>
                            <option value="inch">inch</option>
                        </select>
                    </div>

                    {(paperSize === 'Custom') && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                            <div>
                                <label className="label" htmlFor="paper-width">Width ({unit})</label>
                                <input id="paper-width" className="input-field" type="number" min={0.1} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(paperW, unit)} onChange={e => setPaperW(convertToMm(+e.target.value, unit))} />
                            </div>
                            <div>
                                <label className="label" htmlFor="paper-height">Height ({unit})</label>
                                <input id="paper-height" className="input-field" type="number" min={0.1} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(paperH, unit)} onChange={e => setPaperH(convertToMm(+e.target.value, unit))} />
                            </div>
                        </div>
                    )}

                    {/* Design Size */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div>
                            <label className="label" htmlFor="design-width">Design W ({unit})</label>
                            <input id="design-width" className="input-field" type="number" min={0.1} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(designW, unit)} onChange={e => setDesignW(convertToMm(+e.target.value, unit))} />
                        </div>
                        <div>
                            <label className="label" htmlFor="design-height">Design H ({unit})</label>
                            <input id="design-height" className="input-field" type="number" min={0.1} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(designH, unit)} onChange={e => setDesignH(convertToMm(+e.target.value, unit))} />
                        </div>
                    </div>

                    {/* Bleed / Margin / Gutter */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
                        <div>
                            <label className="label" htmlFor="bleed-input">Bleed ({unit})</label>
                            <input id="bleed-input" className="input-field" type="number" min={0} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(bleed, unit)} onChange={e => setBleed(convertToMm(+e.target.value, unit))} />
                        </div>
                        <div>
                            <label className="label" htmlFor="margin-input">Margin ({unit})</label>
                            <input id="margin-input" className="input-field" type="number" min={0} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(margin, unit)} onChange={e => setMargin(convertToMm(+e.target.value, unit))} />
                        </div>
                        <div>
                            <label className="label" htmlFor="gutter-input">Gutter ({unit})</label>
                            <input id="gutter-input" className="input-field" type="number" min={0} step={unit === 'inch' ? 0.001 : unit === 'cm' ? 0.1 : 1} value={convertFromMm(gutter, unit)} onChange={e => setGutter(convertToMm(+e.target.value, unit))} />
                        </div>
                    </div>

                    {/* Quantity */}
                    <div style={{ marginBottom: 18 }}>
                        <label className="label" htmlFor="quantity-input">Quantity</label>
                        <input id="quantity-input" className="input-field" type="number" min={1} value={quantity} onChange={e => setQuantity(+e.target.value)} />
                    </div>

                    {/* Optimization Toggle */}
                    <div style={{ marginBottom: 18 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input 
                                type="checkbox" 
                                checked={useClientOptimization} 
                                onChange={e => setUseClientOptimization(e.target.checked)} 
                            />
                            <span className="label" style={{ margin: 0 }}>Use Client-Side Optimization</span>
                        </label>
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
                    {clientOptimization && useClientOptimization ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: 'Sheets Needed', value: clientOptimization.sheetsNeeded },
                                { label: 'Items/Sheet', value: clientOptimization.itemsPerSheet },
                                { label: 'Waste', value: `${clientOptimization.wastePercent}%`, color: clientOptimization.wastePercent < 20 ? 'var(--success)' : clientOptimization.wastePercent < 40 ? 'var(--warning)' : 'var(--error)' },
                                { label: 'Utilization', value: `${clientOptimization.utilizationPercent}%`, color: clientOptimization.utilizationPercent >= 80 ? 'var(--success)' : clientOptimization.utilizationPercent >= 60 ? 'var(--warning)' : 'var(--error)' },
                                { label: 'Layout', value: `${clientOptimization.cols}×${clientOptimization.rows} (${clientOptimization.layout})` },
                                { label: 'Paper', value: `${convertFromMm(paperW, unit)}×${convertFromMm(paperH, unit)}${unit}` },
                            ].map((s, i) => (
                                <div key={i} className="summary-tile" style={{ minHeight: 'auto', padding: 14 }}>
                                    <div className="summary-tile__title">{s.label}</div>
                                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: s.color || 'var(--accent)' }}>{s.value}</div>
                                </div>
                            ))}
                        </div>
                    ) : layout && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: 'Copies/Sheet', value: layout.cards_per_sheet || 0 },
                                { label: 'Waste', value: `${(layout.waste_percent || 0).toFixed(1)}%` },
                                {
                                    label: 'Orientation',
                                    value: layout.mixed_layout
                                        ? 'Mixed'
                                        : (layout.is_rotated ? 'Landscape' : 'Portrait')
                                },
                                { label: 'Paper', value: `${convertFromMm(paperW, unit)}×${convertFromMm(paperH, unit)}${unit}` },
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

                    {/* Best Sheet Size Options */}
                    {useClientOptimization && bestSheetOptions.length > 0 && (
                        <div className="panel panel--tight" style={{ marginBottom: 20 }}>
                            <h3 className="ai-section-heading" style={{ marginBottom: 12 }}>
                                Best Sheet Sizes (Minimum Wastage)
                            </h3>
                            <div className="table-scroll">
                                <table className="table">
                                    <thead>
                                        <tr>
                                            <th>Paper Size</th>
                                            <th>Sheets Needed</th>
                                            <th>Items/Sheet</th>
                                            <th>Waste</th>
                                            <th>Efficiency</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bestSheetOptions.slice(0, 8).map((opt, i) => (
                                            <tr 
                                                key={i} 
                                                style={{ 
                                                    cursor: 'pointer',
                                                    backgroundColor: opt.sheetSize === paperSize ? 'var(--success)10' : 'transparent'
                                                }}
                                                onClick={() => {
                                                    const preset = PAPER_SIZES.find(p => p.name === opt.sheetSize);
                                                    if (preset) {
                                                        setPaperSize(opt.sheetSize);
                                                        setPaperW(preset.w);
                                                        setPaperH(preset.h);
                                                    } else {
                                                        setPaperSize('Custom');
                                                        setPaperW(opt.sheetW);
                                                        setPaperH(opt.sheetH);
                                                    }
                                                }}
                                            >
                                                <td style={{ fontWeight: 600 }}>
                                                    {opt.label}
                                                    {i === 0 && (
                                                        <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--success)', color: 'white' }}>
                                                            BEST
                                                        </span>
                                                    )}
                                                </td>
                                                <td>{opt.sheetsNeeded}</td>
                                                <td>{opt.itemsPerSheet}</td>
                                                <td style={{ color: opt.wastePercent < 20 ? 'var(--success)' : opt.wastePercent < 40 ? 'var(--warning)' : 'var(--error)' }}>
                                                    {opt.wastePercent}%
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden', maxWidth: 80 }}>
                                                            <div style={{ 
                                                                height: '100%', 
                                                                borderRadius: 3, 
                                                                background: opt.utilizationPercent >= 80 ? 'var(--success)' : opt.utilizationPercent >= 60 ? 'var(--warning)' : 'var(--error)', 
                                                                width: `${opt.utilizationPercent}%` 
                                                            }} />
                                                        </div>
                                                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-2)' }}>
                                                            {opt.utilizationPercent.toFixed(0)}%
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
        </PageContainer>
    );
};

export default PaperLayoutGenerator;

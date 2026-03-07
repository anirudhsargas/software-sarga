import React, { useState, useMemo } from 'react';
import {
  optimizePaperUsage,
  findBestSheetSize,
  PAPER_SIZES,
  SHEET_SIZES,
  ITEM_SIZES,
} from '../utils/paperOptimizer';
import { Scissors, Layers, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, X } from 'lucide-react';

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 16 },
  modal: { background: 'var(--surface, #1a1a2e)', border: '1px solid var(--border, #333)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto', padding: 0, boxShadow: '0 20px 50px rgba(0,0,0,0.4)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border, #333)' },
  title: { display: 'flex', alignItems: 'center', gap: 10, margin: 0, fontSize: 18, fontWeight: 700 },
  body: { padding: '20px 24px' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted, var(--muted))', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  select: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border, #444)', background: 'var(--bg, #222)', color: 'var(--text, #eee)', fontSize: 14, outline: 'none' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border, #444)', background: 'var(--bg, #222)', color: 'var(--text, #eee)', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  section: { marginTop: 20 },
  resultCard: (color) => ({ padding: 16, borderRadius: 12, border: `1px solid ${color}33`, background: `${color}08`, marginBottom: 10 }),
  badge: (bg, color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: bg, color, letterSpacing: '0.03em' }),
  metricRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 13 },
  metricLabel: { color: 'var(--muted, var(--muted))' },
  metricValue: { fontWeight: 700 },
  visualSheet: { position: 'relative', border: '2px solid var(--accent, var(--accent))', borderRadius: 4, overflow: 'hidden' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted, var(--muted))', padding: 4 },
};

const WasteBar = ({ percent }) => {
  const utilization = 100 - percent;
  const color = utilization >= 80 ? 'var(--success)' : utilization >= 60 ? 'var(--warning)' : 'var(--error)';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color }}>Utilization {utilization.toFixed(1)}%</span>
        <span style={{ color: 'var(--muted)' }}>Waste {percent.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--border, #333)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${utilization}%`, background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
};

const SheetVisual = ({ result }) => {
  if (!result || result.error) return null;
  const { sheetW, sheetH, itemW, itemH, cols, rows, layout } = result;

  // Scale to fit in a max 240px box
  const maxDim = 200;
  const scale = Math.min(maxDim / sheetW, maxDim / sheetH);
  const dispW = Math.round(sheetW * scale);
  const dispH = Math.round(sheetH * scale);

  const isRotated = layout === 'landscape';
  const cellW = isRotated ? itemH : itemW;
  const cellH = isRotated ? itemW : itemH;
  const cw = Math.round(cellW * scale);
  const ch = Math.round(cellH * scale);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: c * cw,
            top: r * ch,
            width: cw - 1,
            height: ch - 1,
            background: 'var(--accent, var(--accent))',
            opacity: 0.25,
            border: '1px solid var(--accent, var(--accent))',
            borderRadius: 2,
          }}
        />
      );
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>SHEET LAYOUT PREVIEW</div>
      <div style={{ ...s.visualSheet, width: dispW, height: dispH, background: 'var(--bg, #1a1a2e)' }}>
        {cells}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
        {cols} × {rows} = {cols * rows} per sheet ({layout})
      </div>
    </div>
  );
};

const PaperOptimizer = ({ isOpen, onClose, onApply }) => {
  const [sheetSize, setSheetSize] = useState('A3');
  const [itemSize, setItemSize] = useState('A5');
  const [itemCount, setItemCount] = useState(100);
  const [bleed, setBleed] = useState(0);
  const [doubleSide, setDoubleSide] = useState(false);
  const [customSheet, setCustomSheet] = useState({ w: '', h: '' });
  const [customItem, setCustomItem] = useState({ w: '', h: '' });
  const [showBestSheet, setShowBestSheet] = useState(false);

  const result = useMemo(() => {
    return optimizePaperUsage({
      sheetSize,
      sheetW: customSheet.w,
      sheetH: customSheet.h,
      itemSize,
      itemW: customItem.w,
      itemH: customItem.h,
      itemCount,
      bleed,
      doubleSide,
    });
  }, [sheetSize, itemSize, itemCount, bleed, doubleSide, customSheet.w, customSheet.h, customItem.w, customItem.h]);

  const bestSheets = useMemo(() => {
    if (!showBestSheet) return [];
    return findBestSheetSize({
      itemSize,
      itemW: customItem.w,
      itemH: customItem.h,
      itemCount,
      bleed,
      doubleSide,
    });
  }, [showBestSheet, itemSize, customItem.w, customItem.h, itemCount, bleed, doubleSide]);

  if (!isOpen) return null;

  const hasError = result?.error;
  const wasteColor = !hasError && result.wastePercent < 20 ? 'var(--success)' : result?.wastePercent < 40 ? 'var(--warning)' : 'var(--error)';

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>
            <Scissors size={20} color="var(--accent, var(--accent))" />
            Paper Size Optimizer
          </h2>
          <button style={s.closeBtn} onClick={onClose}><X size={20} /></button>
        </div>

        <div style={s.body}>
          {/* Input Section */}
          <div style={s.grid2}>
            {/* Sheet Size */}
            <div>
              <label style={s.label}>Sheet Size (Source Paper)</label>
              <select style={s.select} value={sheetSize} onChange={(e) => setSheetSize(e.target.value)}>
                {SHEET_SIZES.map(k => (
                  <option key={k} value={k}>{PAPER_SIZES[k].label}</option>
                ))}
                <option value="Custom">Custom Size</option>
              </select>
              {sheetSize === 'Custom' && (
                <div style={{ ...s.grid2, marginTop: 8 }}>
                  <div>
                    <label style={{ ...s.label, fontSize: 10 }}>Width (mm)</label>
                    <input style={s.input} type="number" placeholder="mm" value={customSheet.w} onChange={(e) => setCustomSheet(p => ({ ...p, w: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: 10 }}>Height (mm)</label>
                    <input style={s.input} type="number" placeholder="mm" value={customSheet.h} onChange={(e) => setCustomSheet(p => ({ ...p, h: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Item Size */}
            <div>
              <label style={s.label}>Print Item Size</label>
              <select style={s.select} value={itemSize} onChange={(e) => setItemSize(e.target.value)}>
                {ITEM_SIZES.map(k => (
                  <option key={k} value={k}>{PAPER_SIZES[k].label}</option>
                ))}
                <option value="Custom">Custom Size</option>
              </select>
              {itemSize === 'Custom' && (
                <div style={{ ...s.grid2, marginTop: 8 }}>
                  <div>
                    <label style={{ ...s.label, fontSize: 10 }}>Width (mm)</label>
                    <input style={s.input} type="number" placeholder="mm" value={customItem.w} onChange={(e) => setCustomItem(p => ({ ...p, w: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: 10 }}>Height (mm)</label>
                    <input style={s.input} type="number" placeholder="mm" value={customItem.h} onChange={(e) => setCustomItem(p => ({ ...p, h: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Count, Bleed, Double Side */}
          <div style={{ ...s.grid3, marginTop: 12 }}>
            <div>
              <label style={s.label}>Quantity to Print</label>
              <input style={s.input} type="number" min="1" value={itemCount} onChange={(e) => setItemCount(e.target.value)} />
            </div>
            <div>
              <label style={s.label}>Bleed / Gutter (mm)</label>
              <input style={s.input} type="number" min="0" step="0.5" value={bleed} onChange={(e) => setBleed(e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={doubleSide} onChange={(e) => setDoubleSide(e.target.checked)} />
                Double-Side Print
              </label>
            </div>
          </div>

          {/* Results */}
          <div style={s.section}>
            {hasError ? (
              <div style={{ ...s.resultCard('var(--error)'), display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertTriangle size={20} color="var(--error)" />
                <span style={{ fontWeight: 600, color: 'var(--error)' }}>{result.error}</span>
              </div>
            ) : (
              <>
                {/* Main Result */}
                <div style={s.resultCard(wasteColor)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>Sheets Required</div>
                      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{result.sheetsNeeded}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={s.badge(
                        result.wastePercent < 20 ? '#dcfce7' : result.wastePercent < 40 ? '#fef9c3' : '#fef2f2',
                        result.wastePercent < 20 ? '#166534' : result.wastePercent < 40 ? '#854d0e' : '#991b1b'
                      )}>
                        {result.wastePercent < 20 ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                        {result.wastePercent < 20 ? 'Optimal' : result.wastePercent < 40 ? 'Moderate Waste' : 'High Waste'}
                      </span>
                    </div>
                  </div>

                  <WasteBar percent={result.wastePercent} />

                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border, #333)', paddingTop: 12 }}>
                    <div style={s.metricRow}>
                      <span style={s.metricLabel}>Items per sheet</span>
                      <span style={s.metricValue}>{result.itemsPerSheet} ({result.layout})</span>
                    </div>
                    {doubleSide && (
                      <div style={s.metricRow}>
                        <span style={s.metricLabel}>Effective per sheet (double-side)</span>
                        <span style={s.metricValue}>{result.effectivePerSheet}</span>
                      </div>
                    )}
                    <div style={s.metricRow}>
                      <span style={s.metricLabel}>Total printed</span>
                      <span style={s.metricValue}>{result.totalPrinted}</span>
                    </div>
                    {result.extraPrints > 0 && (
                      <div style={s.metricRow}>
                        <span style={s.metricLabel}>Extra prints (surplus)</span>
                        <span style={{ ...s.metricValue, color: 'var(--warning)' }}>+{result.extraPrints}</span>
                      </div>
                    )}
                    <div style={s.metricRow}>
                      <span style={s.metricLabel}>Waste per sheet</span>
                      <span style={s.metricValue}>{(result.wasteAreaPerSheet / 100).toFixed(0)} cm²</span>
                    </div>
                    <div style={s.metricRow}>
                      <span style={s.metricLabel}>Layout</span>
                      <span style={s.metricValue}>{result.cols} cols × {result.rows} rows</span>
                    </div>
                  </div>
                </div>

                {/* Visual */}
                <SheetVisual result={result} />

                {/* Apply to billing */}
                {onApply && (
                  <button
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                      background: 'var(--accent, var(--accent))', color: '#fff', fontWeight: 700,
                      fontSize: 14, cursor: 'pointer', marginTop: 16
                    }}
                    onClick={() => {
                      onApply({
                        sheetsNeeded: result.sheetsNeeded,
                        itemsPerSheet: result.itemsPerSheet,
                        totalPrinted: result.totalPrinted,
                        wastePercent: result.wastePercent,
                        summary: result.summary,
                        breakdown: result.breakdown,
                      });
                      onClose();
                    }}
                  >
                    <Layers size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                    Use {result.sheetsNeeded} sheet{result.sheetsNeeded !== 1 ? 's' : ''} as quantity
                  </button>
                )}

                {/* Best Sheet Finder */}
                <button
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '10px', borderRadius: 10, border: '1px solid var(--border, #444)',
                    background: 'transparent', color: 'var(--text, #eee)', fontWeight: 600,
                    fontSize: 13, cursor: 'pointer', marginTop: 10
                  }}
                  onClick={() => setShowBestSheet(v => !v)}
                >
                  {showBestSheet ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showBestSheet ? 'Hide' : 'Find'} Best Sheet Size for This Item
                </button>

                {showBestSheet && bestSheets.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                      All Sheet Options (sorted by least waste)
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {bestSheets.map((opt, i) => (
                        <div
                          key={opt.sheetSize}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                            background: i === 0 ? 'var(--success)15' : 'var(--bg, #222)',
                            border: i === 0 ? '1px solid var(--success)33' : '1px solid transparent',
                          }}
                          onClick={() => { setSheetSize(opt.sheetSize); setShowBestSheet(false); }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{opt.label}</span>
                            {i === 0 && <span style={{ ...s.badge('#dcfce7', '#166534'), marginLeft: 8, fontSize: 10 }}>BEST</span>}
                          </div>
                          <div style={{ textAlign: 'right', fontSize: 12 }}>
                            <div style={{ fontWeight: 700 }}>{opt.sheetsNeeded} sheet{opt.sheetsNeeded !== 1 ? 's' : ''}</div>
                            <div style={{ color: 'var(--muted)', fontSize: 11 }}>{opt.itemsPerSheet}/sheet • {opt.wastePercent}% waste</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaperOptimizer;

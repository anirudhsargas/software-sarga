import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect } from 'react';
import { Layers, Calculator, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Save, RotateCcw } from 'lucide-react';
import api from '../services/api';
import auth from '../services/auth';
import toast from 'react-hot-toast';
import PageContainer from '../components/ui/PageContainer';
import './PlatePlanner.css';

const DEFAULT_BLEED = 3;
const DEFAULT_GUTTER = 4;

const PlatePlanner = () => {
  useSEO('Plate Planner');

  const user = auth.getUser();
  const [pressSheets, setPressSheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const [sheetId, setSheetId] = useState('');
  const [trimW, setTrimW] = useState('');
  const [trimH, setTrimH] = useState('');
  const [bleed, setBleed] = useState(DEFAULT_BLEED);
  const [gutter, setGutter] = useState(DEFAULT_GUTTER);
  const [orderQty, setOrderQty] = useState('');
  const [selectedOrientation, setSelectedOrientation] = useState(null);

  useEffect(() => {
    fetchPressSheets();
  }, []);

  const fetchPressSheets = async () => {
    try {
      const res = await api.get('/press-sheets');
      setPressSheets(res.data || []);
    } catch {
      toast.error('Failed to load press sheets');
    }
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    if (!sheetId || !trimW || !trimH || !orderQty) {
      toast.error('Fill in press sheet, trim size, and quantity');
      return;
    }
    setCalculating(true);
    setResult(null);
    setSelectedOrientation(null);
    try {
      const res = await api.post('/imposition/calculate', {
        press_sheet_id: parseInt(sheetId),
        trim_width_mm: parseFloat(trimW),
        trim_height_mm: parseFloat(trimH),
        bleed_mm: parseFloat(bleed) || DEFAULT_BLEED,
        gutter_mm: parseFloat(gutter) || DEFAULT_GUTTER,
        order_qty: parseInt(orderQty),
      });
      setResult(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  const handleSave = async () => {
    if (!result || !selectedOrientation) {
      toast.error('Select an orientation first');
      return;
    }
    const imp = result.imposition[selectedOrientation];
    setSaving(true);
    try {
      await api.post('/imposition/plans', {
        press_sheet_id: result.press_sheet.id,
        trim_width_mm: parseFloat(trimW),
        trim_height_mm: parseFloat(trimH),
        bleed_mm: parseFloat(bleed) || DEFAULT_BLEED,
        gutter_mm: parseFloat(gutter) || DEFAULT_GUTTER,
        orientation: selectedOrientation,
        n_up: imp.nUp,
        order_qty: parseInt(orderQty),
        sheets_required: result.quantity.currentSheets,
        yield_qty: result.quantity.currentYield,
        spoilage_qty: result.quantity.spoilage,
      });
      toast.success('Imposition plan saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setSelectedOrientation(null);
  };

  return (
    <PageContainer>
      <div className="planner-header">
        <div className="planner-header__content">
          <h1><Layers size={28} /> Plate Planner</h1>
          <p>Calculate n-up imposition for any trim size on any press sheet</p>
        </div>
      </div>

      <div className="planner-grid">
        <div className="panel stack-md">
          <div className="panel-header">
            <Calculator size={18} />
            <h3>Job & Press Details</h3>
          </div>

          <form onSubmit={handleCalculate} className="stack-md">
            <div className="stack-xs">
              <label className="label">Press Sheet</label>
              <select className="input-field" value={sheetId} onChange={e => setSheetId(e.target.value)}>
                <option value="">Select press sheet...</option>
                {pressSheets.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.width_mm}×{s.height_mm}mm)
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row-2">
              <div className="stack-xs">
                <label className="label">Trim Width (mm)</label>
                <input className="input-field" type="number" step="0.1" min="1"
                  value={trimW} onChange={e => setTrimW(e.target.value)} placeholder="e.g. 210" />
              </div>
              <div className="stack-xs">
                <label className="label">Trim Height (mm)</label>
                <input className="input-field" type="number" step="0.1" min="1"
                  value={trimH} onChange={e => setTrimH(e.target.value)} placeholder="e.g. 297" />
              </div>
            </div>

            <div className="form-row-3">
              <div className="stack-xs">
                <label className="label">Bleed (mm)</label>
                <input className="input-field" type="number" step="0.5" min="0"
                  value={bleed} onChange={e => setBleed(e.target.value)} />
              </div>
              <div className="stack-xs">
                <label className="label">Gutter (mm)</label>
                <input className="input-field" type="number" step="0.5" min="0"
                  value={gutter} onChange={e => setGutter(e.target.value)} />
              </div>
              <div className="stack-xs">
                <label className="label">Order Quantity</label>
                <input className="input-field" type="number" min="1"
                  value={orderQty} onChange={e => setOrderQty(e.target.value)} placeholder="e.g. 1000" />
              </div>
            </div>

            <button className="btn btn-primary btn--full" disabled={calculating}>
              {calculating ? <Loader2 className="animate-spin" size={18} /> : <Calculator size={18} />}
              Calculate Imposition
            </button>
          </form>
        </div>

        <div className="stack-md">
          {result && (
            <div className="fade-in">
              <div className="panel-header">
                <h3>Results — {result.press_sheet.name}</h3>
                <button className="btn btn-ghost btn-sm" onClick={handleReset}>
                  <RotateCcw size={14} /> New Calc
                </button>
              </div>

              <div className="orientation-cards">
                {['portrait', 'landscape'].map(orient => {
                  const imp = result.imposition[orient];
                  const isBest = orient === result.imposition.best.orientation;
                  const isSelected = selectedOrientation === orient;
                  return (
                    <div key={orient}
                      className={`orientation-card ${isBest ? 'orientation-card--best' : ''} ${isSelected ? 'orientation-card--selected' : ''}`}
                      onClick={() => setSelectedOrientation(orient)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') setSelectedOrientation(orient); }}
                    >
                      <div className="orientation-card__header">
                        <h4>{orient === 'portrait' ? 'Portrait' : 'Landscape'}</h4>
                        {isBest && <span className="badge badge--primary">Best</span>}
                        {isSelected && <CheckCircle2 size={20} className="icon-selected" />}
                      </div>
                      <div className="orientation-card__nup">{imp.nUp}<small>-up</small></div>
                      <div className="orientation-card__grid">
                        {imp.cols} cols × {imp.rows} rows
                      </div>
                      <div className="orientation-card__leftover">
                        <span>Leftover: {imp.leftoverWidth.toFixed(1)}×{imp.leftoverHeight.toFixed(1)}mm</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="panel stack-sm">
                <h4>Quantity Breakdown</h4>
                <table className="table">
                  <tbody>
                    <tr>
                      <td>Sheets required</td>
                      <td className="font-bold">{result.quantity.currentSheets}</td>
                    </tr>
                    <tr>
                      <td>Total yield</td>
                      <td className="font-bold">{result.quantity.currentYield}</td>
                    </tr>
                    <tr>
                      <td>Spoilage</td>
                      <td className={`font-bold ${result.quantity.spoilage > 0 ? 'text-warning' : ''}`}>
                        {result.quantity.spoilage}
                      </td>
                    </tr>
                    {result.quantity.upsell && (
                      <tr className="upsell-row">
                        <td>
                          <div className="upsell-suggestion">
                            <AlertTriangle size={14} />
                            <span>Upsell to {result.quantity.upsell.targetQty}</span>
                          </div>
                          <div className="text-xs muted">
                            +{result.quantity.upsell.extraSheets} sheets → {result.quantity.upsell.yieldQty} copies
                          </div>
                        </td>
                        <td className="font-bold text-primary">{result.quantity.upsell.yieldQty}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <button className="btn btn-primary btn--full" disabled={!selectedOrientation || saving} onClick={handleSave}>
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Save Plan ({selectedOrientation ? `${result.imposition[selectedOrientation].nUp}-up ${selectedOrientation}` : 'select orientation'})
              </button>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default PlatePlanner;

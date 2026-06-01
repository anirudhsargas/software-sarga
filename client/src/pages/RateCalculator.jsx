import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

function formatCurrency(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RateCalculator() {
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [availableFinishes, setAvailableFinishes] = useState([]);
  const [selectedFinishes, setSelectedFinishes] = useState([]);
  const [calculation, setCalculation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [finishes, setFinishes] = useState([]);
  const [expressInfo, setExpressInfo] = useState(null);

  useEffect(() => {
    api.get('/pricing/products').then(({ data }) => {
      setProducts(data.products || []);
    }).catch(() => {});
    api.get('/pricing/finishes').then(({ data }) => {
      setFinishes(data.finishes || []);
    }).catch(() => {});
    api.get('/pricing/express').then(({ data }) => {
      if (data.rules) setExpressInfo(data.rules);
    }).catch(() => {});
  }, []);

  const handleProductChange = useCallback(async (e) => {
    const pid = e.target.value;
    setSelectedProduct(pid);
    setSelectedFinishes([]);
    setCalculation(null);
    if (!pid) { setAvailableFinishes([]); return; }
    try {
      const { data } = await api.get(`/pricing/product/${pid}/finishes`);
      setAvailableFinishes(data.finishes || []);
    } catch { setAvailableFinishes([]); }
  }, []);

  const toggleFinish = useCallback((fid) => {
    setSelectedFinishes(prev => prev.includes(fid) ? prev.filter(f => f !== fid) : [...prev, fid]);
  }, []);

  const calculate = useCallback(async () => {
    if (!selectedProduct || quantity < 1) return;
    setLoading(true);
    try {
      const { data } = await api.get('/pricing/calculate', {
        params: { product_id: selectedProduct, quantity, finishes: selectedFinishes.join(',') }
      });
      setCalculation(data);
    } catch (err) {
      setCalculation({ error: err.response?.data?.error || 'Calculation failed' });
    } finally { setLoading(false); }
  }, [selectedProduct, quantity, selectedFinishes]);

  const quickQtys = [50, 100, 200, 500, 1000, 5000];

  const product = products.find(p => String(p.id) === String(selectedProduct));

  return (
    <div className="page-container" style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h2 style={{ marginBottom: 8 }}>Rate Calculator</h2>
      <p style={{ color: '#6b7280', marginBottom: 24, fontSize: 14 }}>Real-time pricing using the dynamic pricing engine</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>Product</label>
          <select value={selectedProduct} onChange={handleProductChange} style={inputStyle}>
            <option value="">-- Select Product --</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {product && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              {product.category} {product.has_finishes ? '• Finishes available' : ''}
              {product.express_eligible !== undefined && (
                <span> • {product.express_eligible ? '⚡ Express eligible' : 'Standard only'}</span>
              )}
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>Quantity</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {quickQtys.map(q => (
              <button key={q} onClick={() => setQuantity(q)}
                style={{
                  ...chipStyle,
                  background: quantity === q ? '#2563eb' : '#f3f4f6',
                  color: quantity === q ? '#fff' : '#374151',
                }}>{q}</button>
            ))}
          </div>
          <input type="number" min={1} value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ ...inputStyle, width: '100%' }} />
        </div>
      </div>

      {/* Finishes */}
      {availableFinishes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Additional Finishes</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {availableFinishes.map(f => {
              const finDetail = finishes.find(fi => String(fi.id) === String(f.id));
              const active = selectedFinishes.includes(f.id);
              return (
                <button key={f.id} onClick={() => toggleFinish(f.id)}
                  style={{
                    ...chipStyle, padding: '6px 14px',
                    background: active ? '#2563eb' : '#f3f4f6',
                    color: active ? '#fff' : '#374151',
                    border: active ? '1px solid #2563eb' : '1px solid #e5e7eb',
                  }}>
                  {finDetail?.finish_name || f.name || `Finish #${f.id}`}
                  {f.price && <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>+{formatCurrency(f.price)}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button onClick={calculate} disabled={loading || !selectedProduct}
        style={{
          width: '100%', padding: '12px 24px', background: '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
          opacity: loading || !selectedProduct ? 0.6 : 1, marginBottom: 24, fontSize: 16,
        }}>
        {loading ? 'Calculating...' : 'Calculate Price'}
      </button>

      {calculation && !calculation.error && (
        <div style={{
          background: '#f9fafb', borderRadius: 12, padding: 24,
          border: '1px solid #e5e7eb',
        }}>
          <h3 style={{ marginBottom: 16, fontSize: 18 }}>Price Breakdown</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {calculation.unit_price != null && (
                <tr><td style={tdStyle}>Unit Price</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.unit_price)}</td></tr>
              )}
              {calculation.quantity != null && (
                <tr><td style={tdStyle}>Quantity</td><td style={{ ...tdStyle, textAlign: 'right' }}>{calculation.quantity.toLocaleString('en-IN')}</td></tr>
              )}
              {calculation.subtotal != null && (
                <tr><td style={tdStyle}>Subtotal</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.subtotal)}</td></tr>
              )}
              {calculation.setup_fee > 0 && (
                <tr><td style={tdStyle}>Setup Fee</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.setup_fee)}</td></tr>
              )}
              {calculation.finish_charges > 0 && (
                <tr><td style={tdStyle}>Finish Charges</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.finish_charges)}</td></tr>
              )}
              {calculation.cgst > 0 && (
                <tr><td style={tdStyle}>CGST (9%)</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.cgst)}</td></tr>
              )}
              {calculation.sgst > 0 && (
                <tr><td style={tdStyle}>SGST (9%)</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.sgst)}</td></tr>
              )}
              {calculation.gst_amount > 0 && (
                <tr><td style={tdStyle}>GST Total (18%)</td><td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(calculation.gst_amount)}</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...tdStyle, fontWeight: 700, fontSize: 18, borderTop: '2px solid #2563eb', paddingTop: 12 }}>Total</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontSize: 18, borderTop: '2px solid #2563eb', paddingTop: 12, color: '#2563eb' }}>
                  {formatCurrency(calculation.total)}
                </td>
              </tr>
            </tfoot>
          </table>
          {calculation.pricing_method && (
            <p style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
              Pricing method: {calculation.pricing_method} | {calculation.finishes_applied?.length > 0 ? `Finishes: ${calculation.finishes_applied.join(', ')}` : 'No finishes applied'}
            </p>
          )}
        </div>
      )}

      {calculation?.error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: 16, borderRadius: 8 }}>
          {calculation.error}
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 14, background: '#fff', outline: 'none', boxSizing: 'border-box',
};
const chipStyle = {
  padding: '5px 12px', border: '1px solid #e5e7eb', borderRadius: 6,
  fontSize: 12, cursor: 'pointer', fontWeight: 500,
};
const tdStyle = { padding: '8px 0', borderBottom: '1px solid #e5e7eb', fontSize: 14 };

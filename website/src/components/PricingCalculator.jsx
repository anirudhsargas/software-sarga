import { useState, useEffect, useCallback } from 'react'
import api from '../api'
import WhatsAppButton from './WhatsAppButton'
import { useCart } from '../context/CartContext'
import toast from 'react-hot-toast'

const QUICK_QTY = [10, 25, 50, 100, 250, 500, 1000, 5000]

export default function PricingCalculator({ product, preSelectedFinish, onAddToCart }) {
  const { addItem, openCart } = useCart()
  const [quantity, setQuantity] = useState(100)
  const [selectedFinishes, setSelectedFinishes] = useState([])
  const [isDoubleSide, setIsDoubleSide] = useState(false)
  const [paperRate, setPaperRate] = useState('')
  const [pricing, setPricing] = useState(null)
  const [finishes, setFinishes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (product?.id) {
      api.get(`/pricing/product/${product.id}/finishes`)
        .then(res => {
          if (res.data?.finishes) setFinishes(res.data.finishes)
        })
        .catch(() => {})
      // initialize paper rate from product metadata if present
      if (product?.has_paper_rate) {
        setPaperRate(product.paper_rate ? String(product.paper_rate) : '')
      } else {
        setPaperRate('')
      }
    }
  }, [product?.id])

  const calculatePrice = useCallback(async (qty) => {
    if (!product?.id || !qty || qty < 1) return
    setLoading(true)
    setError(null)
    try {
      const params = {
        product_id: product.id,
        quantity: qty
      }
      if (selectedFinishes.length > 0) {
        params.finish_ids = selectedFinishes.join(',')
      }
      if (isDoubleSide) params.is_double_side = true
      if (product?.has_paper_rate && paperRate !== '') params.paper_rate = Number(paperRate)
      const res = await api.get('/pricing/calculate', { params })
      setPricing(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Price calculation failed')
      setPricing(null)
    } finally {
      setLoading(false)
    }
  }, [product?.id, selectedFinishes, isDoubleSide, paperRate])

  useEffect(() => {
    const timer = setTimeout(() => calculatePrice(quantity), 300)
    return () => clearTimeout(timer)
  }, [quantity, selectedFinishes, calculatePrice])

  const toggleFinish = (finishId) => {
    setSelectedFinishes(prev =>
      prev.includes(finishId)
        ? prev.filter(id => id !== finishId)
        : [...prev, finishId]
    )
  }

  const handleAddToCart = () => {
    if (!pricing) return
    addItem({
      service: product.name,
      product_id: product.id,
      quantity: pricing.quantity,
      price: `₹${pricing.total}`,
      pricing_data: pricing
    })
    toast.success('Added to cart')
    openCart()
  }

  if (!product) return null

  return (
    <div className="pricing-calculator">
      <div className="pricing-calculator-card">
        <h3 className="pricing-title">Price Calculator</h3>

        {/* Quick Quantity Buttons */}
        <div className="pricing-quantities">
          <label className="pricing-label">Quantity</label>
          <div className="qty-btn-group">
            {QUICK_QTY.map(q => (
              <button
                key={q}
                className={`qty-btn ${quantity === q ? 'qty-btn--active' : ''}`}
                onClick={() => setQuantity(q)}
              >
                {q}
              </button>
            ))}
          </div>
          <input
            type="number"
            className="pricing-qty-input"
            value={quantity}
            min={1}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>

        {/* Double-side and Paper Rate Options */}
        {(product?.has_double_side_rate || product?.has_paper_rate) && (
          <div style={{ marginTop: 12, marginBottom: 8 }}>
            {product?.has_double_side_rate && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={isDoubleSide} onChange={(e) => setIsDoubleSide(e.target.checked)} />
                <span style={{ fontSize: '0.9rem' }}>Double-sided printing</span>
              </label>
            )}
            {product?.has_paper_rate && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: '0.9rem', minWidth: 90 }}>Paper rate</label>
                <input
                  type="number"
                  value={paperRate}
                  onChange={(e) => setPaperRate(e.target.value)}
                  placeholder={product.paper_rate ? String(product.paper_rate) : 'e.g. 12.50'}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e6eef6' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Finishes */}
        {finishes.length > 0 && (
          <div className="pricing-finishes">
            <label className="pricing-label">Add-on Finishes</label>
            <div className="finish-grid">
              {finishes.map(finish => (
                <button
                  key={finish.id}
                  className={`finish-chip ${selectedFinishes.includes(finish.id) ? 'finish-chip--active' : ''}`}
                  onClick={() => toggleFinish(finish.id)}
                >
                  <span className="finish-name">{finish.name}</span>
                  <span className="finish-price">+₹{Number(finish.unit_price).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && <div className="pricing-loading">Calculating...</div>}
        {error && <div className="pricing-error">{error}</div>}

        {/* Price Display */}
        {pricing && !loading && (
          <div className="pricing-result">
            <div className="pricing-breakdown">
              <div className="price-row">
                <span>Unit Price</span>
                <span>₹{pricing.unit_price.toFixed(2)}</span>
              </div>
              <div className="price-row">
                <span>Quantity</span>
                <span>{pricing.quantity}</span>
              </div>
              <div className="price-row">
                <span>Subtotal</span>
                <span>₹{pricing.subtotal.toFixed(2)}</span>
              </div>
              {pricing.setup_fee > 0 && (
                <div className="price-row">
                  <span>Setup Fee</span>
                  <span>₹{pricing.setup_fee.toFixed(2)}</span>
                </div>
              )}
              {pricing.finishes_total > 0 && (
                <div className="price-row">
                  <span>Finishes</span>
                  <span>₹{pricing.finishes_total.toFixed(2)}</span>
                </div>
              )}
              <div className="price-divider" />
              <div className="price-row">
                <span>Subtotal (excl. GST)</span>
                <span>₹{pricing.total_before_gst.toFixed(2)}</span>
              </div>
              <div className="price-row price-gst">
                <span>GST @ {pricing.gst_rate}%</span>
                <span>₹{pricing.gst_amount.toFixed(2)}</span>
              </div>
              {pricing.gst_breakdown && (
                <div className="price-row price-gst-sub">
                  <span>CGST @ 9%</span>
                  <span>₹{pricing.gst_breakdown.cgst.toFixed(2)}</span>
                </div>
              )}
              {pricing.gst_breakdown && (
                <div className="price-row price-gst-sub">
                  <span>SGST @ 9%</span>
                  <span>₹{pricing.gst_breakdown.sgst.toFixed(2)}</span>
                </div>
              )}
              <div className="price-divider price-divider--thick" />
              <div className="price-row price-total">
                <span>Total (incl. GST)</span>
                <span className="total-amount">₹{pricing.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pricing-actions">
              <button className="btn btn-primary btn-block" onClick={handleAddToCart}>
                Add to Cart
              </button>
              <WhatsAppButton
                phoneNumber="919895410035"
                productName={product.name}
                quantity={String(pricing.quantity)}
                size={product.size}
                type="order"
              />
            </div>
          </div>
        )}
      </div>

      <style>{`
        .pricing-calculator { font-family: inherit; }
        .pricing-calculator-card {
          background: var(--card-bg, #fff); border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        .pricing-title { font-size: 1.25rem; font-weight: 700; margin: 0 0 20px; color: var(--text-primary, #1a1a2e); }
        .pricing-label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary, #475569); }
        .qty-btn-group { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .qty-btn {
          padding: 6px 14px; border: 1px solid var(--border-color, #e2e8f0); border-radius: 6px;
          background: var(--bg-secondary, #f8fafc); cursor: pointer; font-size: 0.8rem;
          transition: all 0.2s; color: var(--text-primary, #1a1a2e);
        }
        .qty-btn:hover { border-color: var(--primary, #2563eb); color: var(--primary, #2563eb); }
        .qty-btn--active { background: var(--primary, #2563eb); color: #fff; border-color: var(--primary, #2563eb); }
        .pricing-qty-input {
          width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 8px; font-size: 1rem; margin-bottom: 16px;
        }
        .finish-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .finish-chip {
          display: flex; flex-direction: column; align-items: center; padding: 8px 14px;
          border: 1px solid var(--border-color, #e2e8f0); border-radius: 8px; cursor: pointer;
          background: var(--bg-secondary, #f8fafc); transition: all 0.2s; font-size: 0.75rem;
        }
        .finish-chip:hover { border-color: var(--primary, #2563eb); }
        .finish-chip--active { background: #eff6ff; border-color: var(--primary, #2563eb); }
        .finish-name { font-weight: 500; }
        .finish-price { color: var(--text-muted, #64748b); font-size: 0.7rem; }
        .pricing-loading { text-align: center; padding: 20px; color: var(--text-muted, #64748b); font-size: 0.9rem; }
        .pricing-error { color: #dc2626; text-align: center; padding: 12px; font-size: 0.85rem; }
        .pricing-breakdown { margin: 16px 0; }
        .price-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 0.85rem; color: var(--text-secondary, #475569); }
        .price-divider { height: 1px; background: var(--border-color, #e2e8f0); margin: 6px 0; }
        .price-divider--thick { height: 2px; background: var(--text-primary, #1a1a2e); margin: 8px 0; }
        .price-total { font-size: 1.1rem; font-weight: 700; color: var(--text-primary, #1a1a2e); }
        .total-amount { color: var(--primary, #2563eb); }
        .price-gst { font-size: 0.8rem; color: #64748b; }
        .price-gst-sub { font-size: 0.75rem; color: #94a3b8; padding-left: 16px; }
        .pricing-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
        .btn-block { width: 100%; justify-content: center; }
        .btn-primary {
          background: var(--primary, #2563eb); color: #fff; border: none; padding: 12px 24px;
          border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer;
          display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s;
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
      `}</style>
    </div>
  )
}

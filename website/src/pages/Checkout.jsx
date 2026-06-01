import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useCart } from '../context/CartContext'
import SEO from '../components/SEO'
import toast from 'react-hot-toast'
import './Checkout.css'

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true)
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => { toast.error('Failed to load payment gateway'); resolve(false) }
    document.body.appendChild(script)
  })
}

function FormField({ label, type = 'text', value, onChange, required, placeholder, error }) {
  return (
    <div className="checkout-field">
      <label className="checkout-label">{label} {required && <span className="required">*</span>}</label>
      {type === 'textarea' ? (
        <textarea className="checkout-input" value={value} onChange={onChange} placeholder={placeholder} rows={3} />
      ) : (
        <input className="checkout-input" type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} />
      )}
      {error && <span className="checkout-field-error">{error}</span>}
    </div>
  )
}

export default function Checkout() {
  const navigate = useNavigate()
  const { items, clearCart } = useCart()
  const [step, setStep] = useState('review')
  const [processing, setProcessing] = useState(false)

  // Form state
  const [form, setForm] = useState({
    customer_name: '', customer_phone: '', customer_email: '',
    gst_number: '', billing_address: '', delivery_address: '',
    payment_method: 'full', delivery_method: 'pickup',
    notes: ''
  })

  const [errors, setErrors] = useState({})
  const [orderResult, setOrderResult] = useState(null)

  const updateField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.customer_name?.trim()) errs.customer_name = 'Name is required'
    if (!form.customer_phone?.trim()) errs.customer_phone = 'Phone is required'
    else if (!/^[0-9]{10}$/.test(form.customer_phone.replace(/\D/g, ''))) errs.customer_phone = 'Valid 10-digit phone required'
    if (form.delivery_method === 'courier' && !form.delivery_address?.trim()) errs.delivery_address = 'Delivery address required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handlePlaceOrder = async () => {
    if (!validate()) return
    if (items.length === 0) { toast.error('Cart is empty'); return }

    setProcessing(true)
    try {
      // Create order + Razorpay order
      const payload = {
        payment_method: form.payment_method,
        delivery_method: form.delivery_method,
        gst_number: form.gst_number || null,
        billing_address: form.billing_address || null,
        delivery_address: form.delivery_address || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone.replace(/\D/g, '').slice(-10),
        customer_email: form.customer_email || null,
        notes: form.notes || null
      }

      const orderRes = await api.post('/checkout/create-order', payload)
      const order = orderRes.data

      if (order.razorpay_order_id) {
        setStep('payment')
        await processRazorpayPayment(order)
      } else {
        // Order created without payment gateway (manual)
        clearCart()
        setOrderResult(order)
        setStep('confirmation')
        toast.success('Order placed successfully!')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to place order')
    } finally {
      setProcessing(false)
    }
  }

  const processRazorpayPayment = async (order) => {
    const loaded = await loadRazorpay()
    if (!loaded) return

    const options = {
      key: order.razorpay_key_id,
      amount: order.razorpay_amount,
      currency: 'INR',
      name: 'Sarga Printing',
      description: `Order ${order.order_number}`,
      order_id: order.razorpay_order_id,
      handler: async (response) => {
        try {
          const verifyRes = await api.post('/checkout/verify-payment', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            method: 'razorpay'
          })
          if (verifyRes.data.verified) {
            clearCart()
            setOrderResult(order)
            setStep('confirmation')
            toast.success('Payment successful! Order confirmed.')
          }
        } catch (err) {
          toast.error('Payment verification failed. Please contact support.')
        }
      },
      modal: {
        ondismiss: () => {
          setStep('review')
          toast.error('Payment cancelled. You can try again.')
        }
      },
      prefill: {
        name: form.customer_name,
        email: form.customer_email,
        contact: form.customer_phone
      },
      theme: { color: '#2563eb' }
    }

    const rzp = new window.Razorpay(options)
    rzp.on('payment.failed', (response) => {
      toast.error('Payment failed. Please try again.')
      setStep('review')
    })
    rzp.open()
  }

  const cartTotal = items.reduce((sum, item) => {
    const price = item.pricing_data?.total || 0
    return sum + Number(price)
  }, 0)

  if (items.length === 0 && step !== 'confirmation') {
    return (
      <div className="checkout-page">
        <div className="checkout-empty">
          <h2>Your cart is empty</h2>
          <p>Browse our services and add items to get started.</p>
          <button className="btn btn-primary" onClick={() => navigate('/services')}>Browse Services</button>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout-page">
      <SEO title="Checkout - Sarga Printing" description="Complete your order with secure payment" />

      {step === 'review' && (
        <div className="checkout-container">
          <h1 className="checkout-title">Checkout</h1>

          <div className="checkout-layout">
            <div className="checkout-main">
              {/* Customer Details */}
              <section className="checkout-section">
                <h2>Contact Information</h2>
                <div className="checkout-row">
                  <FormField label="Full Name" value={form.customer_name} onChange={updateField('customer_name')} required error={errors.customer_name} placeholder="Your full name" />
                  <FormField label="Phone Number" type="tel" value={form.customer_phone} onChange={updateField('customer_phone')} required error={errors.customer_phone} placeholder="10-digit mobile number" />
                </div>
                <FormField label="Email (optional)" type="email" value={form.customer_email} onChange={updateField('customer_email')} placeholder="Email for receipt" />
              </section>

              {/* Delivery */}
              <section className="checkout-section">
                <h2>Delivery Method</h2>
                <div className="checkout-radio-group">
                  <label className={`radio-card ${form.delivery_method === 'pickup' ? 'radio-card--active' : ''}`}>
                    <input type="radio" name="delivery_method" value="pickup" checked={form.delivery_method === 'pickup'} onChange={updateField('delivery_method')} />
                    <div className="radio-content">
                      <span className="radio-title">Branch Pickup</span>
                      <span className="radio-desc">Pick up from Perambra or Meppayur</span>
                    </div>
                  </label>
                  <label className={`radio-card ${form.delivery_method === 'courier' ? 'radio-card--active' : ''}`}>
                    <input type="radio" name="delivery_method" value="courier" checked={form.delivery_method === 'courier'} onChange={updateField('delivery_method')} />
                    <div className="radio-content">
                      <span className="radio-title">Courier Delivery</span>
                      <span className="radio-desc">Delivered to your address</span>
                    </div>
                  </label>
                </div>
                {form.delivery_method === 'courier' && (
                  <FormField label="Delivery Address" type="textarea" value={form.delivery_address} onChange={updateField('delivery_address')} required error={errors.delivery_address} placeholder="Street, city, pincode..." />
                )}
              </section>

              {/* Billing */}
              <section className="checkout-section">
                <h2>Billing Details</h2>
                <FormField label="GST Number (optional)" value={form.gst_number} onChange={updateField('gst_number')} placeholder="22AAAAA0000A1Z5" />
                <FormField label="Billing Address (optional)" type="textarea" value={form.billing_address} onChange={updateField('billing_address')} placeholder="Billing address for invoice" />
              </section>

              {/* Payment Method */}
              <section className="checkout-section">
                <h2>Payment Method</h2>
                <div className="checkout-radio-group">
                  <label className={`radio-card ${form.payment_method === 'full' ? 'radio-card--active' : ''}`}>
                    <input type="radio" name="payment_method" value="full" checked={form.payment_method === 'full'} onChange={updateField('payment_method')} />
                    <div className="radio-content">
                      <span className="radio-title">Full Payment</span>
                      <span className="radio-desc">Pay 100% now via UPI / Card / Net Banking</span>
                    </div>
                  </label>
                  <label className={`radio-card ${form.payment_method === 'partial' ? 'radio-card--active' : ''}`}>
                    <input type="radio" name="payment_method" value="partial" checked={form.payment_method === 'partial'} onChange={updateField('payment_method')} />
                    <div className="radio-content">
                      <span className="radio-title">Pay 50% Advance</span>
                      <span className="radio-desc">Pay 50% now, balance on delivery</span>
                    </div>
                  </label>
                </div>
              </section>

              {/* Notes */}
              <section className="checkout-section">
                <h2>Order Notes (optional)</h2>
                <FormField label="" type="textarea" value={form.notes} onChange={updateField('notes')} placeholder="Any special instructions..." />
              </section>
            </div>

            {/* Order Summary Sidebar */}
            <div className="checkout-sidebar">
              <div className="checkout-summary-card">
                <h3>Order Summary</h3>
                <div className="summary-items">
                  {items.map((item, i) => (
                    <div key={item.id || i} className="summary-item">
                      <div className="summary-item-name">{item.service || item.product_name}</div>
                      <div className="summary-item-qty">Qty: {item.quantity || item.pricing_data?.quantity || 1}</div>
                      <div className="summary-item-price">₹{item.pricing_data?.total?.toFixed(2) || Number(item.price?.replace(/[^0-9.]/g, '') || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <div className="summary-total">
                  <span>Total</span>
                  <span className="summary-total-amount">₹{cartTotal.toFixed(2)}</span>
                </div>
                <div className="summary-gst-note">* GST included in price</div>

                <button
                  className="btn btn-primary btn-block checkout-place-order"
                  onClick={handlePlaceOrder}
                  disabled={processing}
                >
                  {processing ? 'Processing...' : `Place Order - ₹${cartTotal.toFixed(2)}`}
                </button>

                <div className="checkout-secure-note">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  Secured by Razorpay
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'confirmation' && orderResult && (
        <div className="checkout-confirmation">
          <div className="confirmation-card">
            <div className="confirmation-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <h1>Order Confirmed!</h1>
            <p className="confirmation-order-no">Order #{orderResult.order_number}</p>
            <p className="confirmation-amount">₹{Number(orderResult.amount).toFixed(2)}</p>
            <p className="confirmation-status">{orderResult.razorpay_order_id ? 'Payment received' : 'Payment pending (manual)'}</p>
            <div className="confirmation-actions">
              <button className="btn btn-primary" onClick={() => navigate(`/portal/order/${orderResult.order_number}`)}>View Order</button>
              <button className="btn btn-outline" onClick={() => navigate('/')}>Back to Home</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .checkout-page { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
        .checkout-empty { text-align: center; padding: 80px 20px; }
        .checkout-empty h2 { font-size: 1.5rem; margin-bottom: 8px; }
        .checkout-empty p { color: var(--text-muted, #64748b); margin-bottom: 24px; }
        .checkout-container { }
        .checkout-title { font-size: 1.75rem; font-weight: 700; margin-bottom: 24px; }
        .checkout-layout { display: grid; grid-template-columns: 1fr 380px; gap: 32px; align-items: start; }
        @media (max-width: 768px) { .checkout-layout { grid-template-columns: 1fr; } }
        .checkout-main { }
        .checkout-section { background: var(--card-bg,#fff); border: 1px solid var(--border-color,#e2e8f0); border-radius: 12px; padding: 24px; margin-bottom: 16px; }
        .checkout-section h2 { font-size: 1.1rem; font-weight: 600; margin: 0 0 16px; }
        .checkout-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 480px) { .checkout-row { grid-template-columns: 1fr; } }
        .checkout-field { margin-bottom: 12px; }
        .checkout-label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 4px; color: var(--text-secondary,#475569); }
        .required { color: #dc2626; }
        .checkout-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color,#e2e8f0); border-radius: 8px; font-size: 0.9rem; }
        .checkout-input:focus { outline: none; border-color: var(--primary,#2563eb); box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
        .checkout-field-error { display: block; color: #dc2626; font-size: 0.75rem; margin-top: 4px; }
        .checkout-radio-group { display: flex; flex-direction: column; gap: 8px; }
        .radio-card { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--border-color,#e2e8f0); border-radius: 8px; cursor: pointer; transition: all 0.2s; }
        .radio-card:hover { border-color: var(--primary,#2563eb); }
        .radio-card--active { border-color: var(--primary,#2563eb); background: #eff6ff; }
        .radio-card input { display: none; }
        .radio-content { display: flex; flex-direction: column; }
        .radio-title { font-weight: 600; font-size: 0.9rem; }
        .radio-desc { font-size: 0.8rem; color: var(--text-muted,#64748b); }
        .checkout-sidebar { }
        .checkout-summary-card { background: var(--card-bg,#fff); border: 1px solid var(--border-color,#e2e8f0); border-radius: 12px; padding: 24px; position: sticky; top: 100px; }
        .checkout-summary-card h3 { font-size: 1.1rem; font-weight: 600; margin: 0 0 16px; }
        .summary-items { margin-bottom: 16px; }
        .summary-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color,#e2e8f0); }
        .summary-item-name { font-size: 0.85rem; font-weight: 500; flex: 1; }
        .summary-item-qty { font-size: 0.75rem; color: var(--text-muted,#64748b); padding: 0 12px; }
        .summary-item-price { font-weight: 600; font-size: 0.9rem; }
        .summary-total { display: flex; justify-content: space-between; padding: 16px 0; font-size: 1.1rem; font-weight: 700; }
        .summary-total-amount { color: var(--primary,#2563eb); }
        .summary-gst-note { font-size: 0.75rem; color: var(--text-muted,#64748b); margin-bottom: 16px; }
        .checkout-place-order { width: 100%; padding: 14px; font-size: 1rem; }
        .checkout-secure-note { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.75rem; color: var(--text-muted,#64748b); margin-top: 12px; }
        .checkout-confirmation { display: flex; justify-content: center; padding: 60px 20px; }
        .confirmation-card { text-align: center; max-width: 480px; }
        .confirmation-icon { margin-bottom: 16px; }
        .confirmation-card h1 { font-size: 1.75rem; margin-bottom: 8px; }
        .confirmation-order-no { font-size: 1.1rem; color: var(--primary,#2563eb); font-weight: 600; margin-bottom: 8px; }
        .confirmation-amount { font-size: 2rem; font-weight: 700; margin-bottom: 4px; }
        .confirmation-status { color: var(--text-muted,#64748b); margin-bottom: 24px; }
        .confirmation-actions { display: flex; gap: 12px; justify-content: center; }
        .btn-outline { background: transparent; border: 1px solid var(--border-color,#e2e8f0); padding: 12px 24px; border-radius: 8px; cursor: pointer; font-size: 0.95rem; }
        .btn-outline:hover { background: var(--bg-secondary,#f8fafc); }
      `}</style>
    </div>
  )
}

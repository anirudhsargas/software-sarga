import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import './CartDrawer.css';
import { useCart } from '../../context/CartContext';
import api from '../../api';
import toast from 'react-hot-toast';

const CartDrawer = () => {
  const { items, removeItem, updateQuantity, clearCart, open, closeCart } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('sarga_customer_name') || ''; } catch { return ''; }
  });
  const [phone, setPhone] = useState(() => {
    try { return localStorage.getItem('sarga_customer_phone') || ''; } catch { return ''; }
  });
  const [mode, setMode] = useState('quote');

  const isLoggedIn = !!localStorage.getItem('sarga_customer_token');

  const requestQuote = async () => {
    if (!name || !phone) return toast.error('Name and phone required');
    setSubmitting(true);
    try {
      await api.post('/website/inquiry', {
        name, phone, email: null,
        service: 'Quote Cart',
        message: JSON.stringify(items),
        branch: 'Perambra'
      });
      clearCart();
      toast.success('Quote requested successfully!');
      closeCart();
    } catch {
      toast.error('Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const goToCheckout = () => {
    closeCart();
    navigate('/checkout');
  };

  const total = items.reduce((sum, item) => {
    const price = item.pricing_data?.total || parseFloat(String(item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return sum + Number(price);
  }, 0);

  if (!open) return null;

  return (
    <div className="cart-drawer-overlay" onClick={closeCart}>
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h3>Your Cart</h3>
          <div className="cart-header-info">
            <span>{items.length} items</span>
            {items.length > 0 && <span className="cart-total-label">₹{total.toFixed(2)}</span>}
          </div>
        </div>

        <div className="cart-mode-toggle">
          <button
            className={`mode-btn ${mode === 'quote' ? 'active' : ''}`}
            onClick={() => setMode('quote')}
          >
            Request Quote
          </button>
          <button
            className={`mode-btn ${mode === 'checkout' ? 'active' : ''}`}
            onClick={() => setMode('checkout')}
          >
            Order Now
          </button>
        </div>

        <div className="cart-body">
          {items.length === 0 && (
            <div className="empty">Your cart is empty. Browse services to add items.</div>
          )}
          {items.map(item => (
            <div className="cart-row" key={item.id}>
              <div className="cart-name">
                <div className="cart-item-title">{item.service || item.product_name}</div>
                {item.price && (
                  <div className="cart-item-price">{item.price}</div>
                )}
              </div>
              <div className="cart-qty">
                <input
                  type="number"
                  value={item.quantity}
                  min={1}
                  onChange={(e) => updateQuantity(item.id, Number(e.target.value))}
                />
              </div>
              <div className="cart-remove">
                <button onClick={() => removeItem(item.id)} className="remove-btn">✕</button>
              </div>
            </div>
          ))}
        </div>

        <div className="cart-footer">
          {mode === 'quote' ? (
            <>
              <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <button
                className="btn-cart-action btn btn-primary"
                onClick={requestQuote}
                disabled={submitting || items.length === 0}
              >
                {submitting ? 'Sending...' : 'Get My Custom Quote'}
              </button>
            </>
          ) : (
            <>
              <div className="cart-total-row">
                <span>Total</span>
                <span className="cart-total-amount">₹{total.toFixed(2)}</span>
              </div>
              <p className="text-caption" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', marginBottom: '8px', marginTop: '-4px' }}>Shipping calculated at next step.</p>
              <button
                className="btn-cart-action btn btn-primary"
                onClick={goToCheckout}
                disabled={items.length === 0}
              >
                Secure Checkout
              </button>
              <div className="trust-signals mt-sm" style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center', opacity: 0.6, marginTop: '8px' }}>
                <Lock size={12} /> <span className="text-caption" style={{ fontSize: '0.75rem' }}>256-bit Secure Checkout</span>
              </div>
              {!isLoggedIn && (
                <p className="cart-login-note">
                  Guest checkout available. <a href="/signin" onClick={(e) => { e.preventDefault(); closeCart(); navigate('/signin'); }}>Sign in</a> for faster checkout.
                </p>
              )}
            </>
          )}
        </div>

        <style>{`
          .cart-drawer { width: 420px; max-width: 100%; display: flex; flex-direction: column; }
          .cart-header-info { display: flex; align-items: center; gap: 12px; }
          .cart-total-label { font-size: 0.9rem; font-weight: 600; color: var(--primary,#2563eb); }
          .cart-mode-toggle { display: flex; border-bottom: 1px solid var(--border-color,#e2e8f0); }
          .mode-btn { flex: 1; padding: 10px; border: none; background: transparent; font-size: 0.85rem; font-weight: 500; cursor: pointer; color: var(--text-muted,#64748b); transition: all 0.2s; }
          .mode-btn.active { color: var(--primary,#2563eb); border-bottom: 2px solid var(--primary,#2563eb); font-weight: 600; }
          .cart-total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 1rem; font-weight: 700; }
          .cart-total-amount { color: var(--primary,#2563eb); }
          .btn-cart-action { width: 100%; padding: 12px; background: var(--primary,#2563eb); color: #fff; border: none; border-radius: 8px; font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
          .btn-cart-action:disabled { opacity: 0.5; cursor: not-allowed; }
          .btn-cart-action:hover:not(:disabled) { opacity: 0.9; }
          .cart-login-note { font-size: 0.75rem; color: var(--text-muted,#64748b); text-align: center; margin: 8px 0 0; }
          .cart-login-note a { color: var(--primary,#2563eb); }
          .cart-item-title { font-weight: 500; font-size: 0.85rem; }
          .cart-item-price { font-size: 0.75rem; color: var(--text-muted,#64748b); }
          .remove-btn { background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 0.85rem; padding: 4px; }
          .remove-btn:hover { color: #dc2626; }
        `}</style>
      </div>
    </div>
  );
};

export default CartDrawer;

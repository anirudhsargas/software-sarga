import React, { useState } from 'react';
import './CartDrawer.css';
import { useCart } from '../../context/CartContext';
import api from '../../api';
import toast from 'react-hot-toast';

const CartDrawer = () => {
  const { items, removeItem, updateQuantity, clearCart, open, closeCart } = useCart();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const requestQuote = async () => {
    if (!name || !phone) return toast.error('Name and phone required');
    setSubmitting(true);
    try {
      await api.post('/website/inquiry', { name, phone, email: null, service: 'Quote Cart', message: JSON.stringify(items), branch: 'Perambra' });
      clearCart();
      toast.success('Quote requested successfully!');
      closeCart();
    } catch (err) {
      toast.error('Failed to submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="cart-drawer-overlay" onClick={closeCart}>
      <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h3>Your Quote Cart</h3>
          <div>{items.length} items</div>
        </div>
        <div className="cart-body">
          {items.length === 0 && <div className="empty">Your cart is empty. Browse services to add items.</div>}
          {items.map(item => (
            <div className="cart-row" key={item.id}>
              <div className="cart-name">{item.service}</div>
              <div className="cart-qty"><input type="number" value={item.quantity} min={1} onChange={(e)=> updateQuantity(item.id, Number(e.target.value))} /></div>
              <div className="cart-remove"><button onClick={() => removeItem(item.id)}>Remove</button></div>
            </div>
          ))}
        </div>
        <div className="cart-footer">
          <input placeholder="Your name" value={name} onChange={(e)=> setName(e.target.value)} />
          <input placeholder="Phone" value={phone} onChange={(e)=> setPhone(e.target.value)} />
          <button onClick={requestQuote} disabled={submitting || items.length===0}>Request Quote</button>
        </div>
      </div>
    </div>
  );
};

export default CartDrawer;

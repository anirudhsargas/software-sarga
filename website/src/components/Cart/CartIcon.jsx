import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import './CartIcon.css';

const CartIcon = () => {
  const { items, openCart } = useCart();
  return (
    <button className="cart-icon" onClick={openCart} aria-label="Open cart">
      <ShoppingCart size={20} />
      {items.length > 0 && <span className="cart-badge">{items.length}</span>}
    </button>
  );
};

export default CartIcon;

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api';

const CartContext = createContext();

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sarga_cart') || '[]');
    } catch (e) {
      return [];
    }
  });
  const [open, setOpen] = useState(false);
  const [serverCartId, setServerCartId] = useState(null);

  useEffect(() => {
    localStorage.setItem('sarga_cart', JSON.stringify(items));
  }, [items]);

  // Sync cart to server on auth change
  useEffect(() => {
    const token = localStorage.getItem('sarga_customer_token');
    if (token) {
      api.get('/checkout/cart/items').then(res => {
        if (res.data?.cart) {
          setServerCartId(res.data.cart.id);
          if (res.data.items?.length > 0) {
            const serverItems = res.data.items.map(i => ({
              id: `server-${i.id}`,
              service: i.product_display_name || i.product_name,
              product_id: i.product_id,
              quantity: i.quantity,
              price: `₹${Number(i.line_total).toFixed(2)}`,
              pricing_data: { total: i.line_total, unit_price: i.unit_price }
            }));
            setItems(prev => {
              if (prev.length === 0) return serverItems;
              return prev;
            });
          }
        }
      }).catch(() => {});
    }
  }, []);

  const addItem = useCallback((item) => {
    setItems((prev) => [...prev, { id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2), ...item }]);

    // Also sync to server if logged in
    const token = localStorage.getItem('sarga_customer_token');
    if (token && item.product_id) {
      api.post('/checkout/cart/items', {
        product_id: item.product_id,
        product_name: item.service,
        quantity: item.quantity || 1,
        unit_price: item.pricing_data?.unit_price || 0,
        setup_fee: item.pricing_data?.setup_fee || 0,
        finishes: item.pricing_data?.finishes || [],
        line_total: item.pricing_data?.total || 0
      }).catch(() => {});
    }
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter(i => i.id !== id));
    if (id && id.startsWith('server-')) {
      const serverId = id.replace('server-', '');
      api.delete(`/checkout/cart/items/${serverId}`).catch(() => {});
    }
  }, []);

  const updateQuantity = useCallback((id, qty) => {
    setItems((prev) => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart,
      open, openCart, closeCart, serverCartId
    }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);

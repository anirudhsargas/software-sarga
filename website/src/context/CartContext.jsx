import React, { createContext, useContext, useEffect, useState } from 'react';

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

  useEffect(() => {
    localStorage.setItem('sarga_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (item) => {
    setItems((prev) => [...prev, { id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2), ...item }]);
  };
  const removeItem = (id) => setItems((prev) => prev.filter(i => i.id !== id));
  const updateQuantity = (id, qty) => setItems((prev) => prev.map(i => i.id === id ? { ...i, quantity: qty } : i));
  const clearCart = () => setItems([]);
  const openCart = () => setOpen(true);
  const closeCart = () => setOpen(false);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, open, openCart, closeCart }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);

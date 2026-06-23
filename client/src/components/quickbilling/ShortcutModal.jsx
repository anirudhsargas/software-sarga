import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Minus } from 'lucide-react';
import toast from 'react-hot-toast';

const ShortcutModal = ({ shortcut, onClose, onAdd }) => {
    const [quantity, setQuantity] = useState(1);
    const [price, setPrice] = useState(Number(shortcut.default_price));
    const [calculatedTotal, setCalculatedTotal] = useState(Number(shortcut.default_price));
    const inputRef = useRef(null);
    const triggerRef = useRef(null);

    // Capture triggering element on mount and restore on unmount
    useEffect(() => {
        triggerRef.current = document.activeElement;
        return () => {
            triggerRef.current?.focus();
        };
    }, []);

    // Auto focus quantity input
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    // Calculate price based on mode
    useEffect(() => {
        let currentPrice = Number(shortcut.default_price);
        
        if (shortcut.pricing_mode === 'tier' && shortcut.tiers) {
            // Find applicable tier
            const tier = shortcut.tiers.find(t => 
                quantity >= Number(t.min_qty) && 
                (!t.max_qty || quantity <= Number(t.max_qty))
            );
            if (tier) currentPrice = Number(tier.price);
        }

        setPrice(currentPrice);
        setCalculatedTotal(currentPrice * quantity);
    }, [quantity, shortcut]);

    const handleSubmit = (e) => {
        e?.preventDefault();
        onAdd({
            shortcut_id: shortcut.id,
            name: shortcut.display_name || shortcut.name,
            price: price,
            quantity: quantity,
            total: calculatedTotal
        });
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter') handleSubmit();
    };

    const quickValues = [1, 2, 5, 10, 50, 100];

    return (
        <div className="qb-modal-overlay" onClick={onClose} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-labelledby="shortcut-title">
            <div className="qb-modal" onClick={e => e.stopPropagation()}>
                <div className="qb-modal-header">
                    <h3 id="shortcut-title" style={{ margin: 0 }}>{shortcut.display_name || shortcut.name}</h3>
                    <button className="btn btn-icon" onClick={onClose} aria-label="Close shortcut modal"><X size={20} aria-hidden="true" /></button>
                </div>
                
                <div className="qb-modal-body">
                    <div className="qb-qty-stepper">
                        <button className="qb-qty-btn" onClick={() => setQuantity(q => Math.max(1, q - 1))} aria-label="Decrease quantity"><Minus size={20} aria-hidden="true" /></button>
                        <input 
                            ref={inputRef}
                            type="number" 
                            className="qb-qty-input"
                            value={quantity}
                            onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            min="1"
                        />
                        <button className="qb-qty-btn" onClick={() => setQuantity(q => q + 1)} aria-label="Increase quantity"><Plus size={20} aria-hidden="true" /></button>
                    </div>

                    <div className="qb-quick-values">
                        {quickValues.map(v => (
                            <button 
                                key={v} 
                                className="qb-quick-val-btn"
                                onClick={() => setQuantity(v)}
                            >
                                {v}
                            </button>
                        ))}
                    </div>

                    {shortcut.pricing_mode === 'manual' && (
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--muted)' }}>Override Price (₹)</label>
                            <input 
                                type="number" 
                                className="input" 
                                value={price} 
                                onChange={e => {
                                    const p = Number(e.target.value);
                                    setPrice(p);
                                    setCalculatedTotal(p * quantity);
                                }} 
                            />
                        </div>
                    )}

                    <div className="qb-total-row">
                        <span>Total:</span>
                        <span style={{ color: 'var(--primary)' }}>₹{calculatedTotal.toFixed(2)}</span>
                    </div>
                </div>

                <div className="qb-modal-footer">
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSubmit}>
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShortcutModal;

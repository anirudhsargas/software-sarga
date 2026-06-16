import { useState } from 'react';
import { X, Trash2, Printer, Save, CheckCircle2, ShoppingBag } from 'lucide-react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useBranches } from '../../contexts/BranchContext';
import useAuth from '../../hooks/useAuth';

const QuickCart = ({ isOpen, setIsOpen, items, setItems }) => {
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const { getUserBranch } = useBranches();
    const { user } = useAuth();
    const selectedBranch = getUserBranch(user);

    const subtotal = items.reduce((acc, item) => acc + item.total, 0);

    const handleCheckout = async () => {
        if (!items.length) return;
        setLoading(true);
        try {
            const payload = {
                items: items,
                payment_mode: 'Cash',
                branch_id: selectedBranch?.id || null
            };
            await api.post('/quick-billing/checkout', payload);
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                setItems([]);
                setIsOpen(false);
            }, 1500);
        } catch (err) {
            toast.error('Checkout failed');
        } finally {
            setLoading(false);
        }
    };

    const removeItem = (idx) => {
        setItems(prev => prev.filter((_, i) => i !== idx));
        if (items.length === 1) setIsOpen(false); // Close if last item removed
    };

    return (
        <>
            {/* Floating FAB to open cart if items exist and cart is closed */}
            {!isOpen && items.length > 0 && (
                <div className="qb-fab" onClick={() => setIsOpen(true)}>
                    <ShoppingBag size={24} />
                    <span className="qb-fab-badge">{items.length}</span>
                </div>
            )}

            <div className={`qb-cart-drawer ${isOpen ? 'open' : ''}`}>
                <div className="qb-cart-header">
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShoppingBag size={20}/> Quick Cart
                    </h3>
                    <button className="btn btn-icon" onClick={() => setIsOpen(false)}>
                        <X size={20} />
                    </button>
                </div>

                <div className="qb-cart-body">
                    {showSuccess ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--success)' }}>
                            <CheckCircle2 size={64} style={{ marginBottom: '1rem', animation: 'modalIn 0.3s ease-out' }} />
                            <h2>Saved Successfully!</h2>
                        </div>
                    ) : (
                        items.length === 0 ? (
                            <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: '2rem' }}>Cart is empty</p>
                        ) : (
                            items.map((item, idx) => (
                                <div key={idx} className="qb-cart-item">
                                    <div className="qb-cart-item-top">
                                        <span>{item.name}</span>
                                        <span>₹{item.total.toFixed(2)}</span>
                                    </div>
                                    <div className="qb-cart-item-controls">
                                        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Qty: {item.quantity} × ₹{item.price}</span>
                                        <button className="btn btn-icon" style={{ color: 'var(--error)', width: 24, height: 24 }} onClick={() => removeItem(idx)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )
                    )}
                </div>

                {!showSuccess && items.length > 0 && (
                    <div className="qb-cart-footer">
                        <div className="qb-cart-summary-row total">
                            <span>Total Payable</span>
                            <span>₹{subtotal.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {toast.success('Printed receipt'); handleCheckout();}}>
                                <Printer size={16} /> Print
                            </button>
                            <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleCheckout} disabled={loading}>
                                <Save size={16} /> {loading ? 'Saving...' : 'Save Bill'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default QuickCart;

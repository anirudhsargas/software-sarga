import { memo, useCallback } from 'react';
import { Wallet } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const QUICK_AMOUNTS = [500, 1000, 5000];

const CashOpeningSection = ({ balances, onChange, prevClosing, bookTabs }) => {
    const formatDisplay = useCallback((val) => {
        const n = Number(val);
        return !isNaN(n) && n > 0 ? formatCurrency(n) : '—';
    }, []);

    if (!bookTabs || bookTabs.length === 0) return null;

    return (
        <div className="os-section">
            <div className="os-section__header">
                <div className="os-section__icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                    <Wallet size={16} />
                </div>
                <div>
                    <h3 className="os-section__title">Cash Opening</h3>
                </div>
            </div>

            <div className="os-cash-grid">
                {bookTabs.map(tab => {
                    const val = balances[tab.key] || '';
                    const prev = prevClosing[tab.key] || 0;
                    return (
                        <div key={tab.key} className="os-cash-card">
                            <div className="os-cash-card__header">
                                <div className="os-cash-card__dot" style={{ background: tab.color }} />
                                <span className="os-cash-card__label">{tab.label}</span>
                                {prev > 0 && (
                                    <span className="os-cash-card__prev">Yesterday: {formatDisplay(prev)}</span>
                                )}
                            </div>
                            <div className="os-cash-card__input-wrap">
                                <span className="os-cash-card__currency">₹</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    className="os-cash-card__input"
                                    value={val}
                                    onChange={(e) => {
                                        const raw = e.target.value.replace(/[^0-9.]/g, '');
                                        if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
                                            onChange(tab.key, raw);
                                        }
                                    }}
                                    placeholder="0.00"
                                />
                            </div>
                            <div className="os-cash-card__chips">
                                {QUICK_AMOUNTS.map(amt => (
                                    <button
                                        key={amt}
                                        type="button"
                                        className="os-chip"
                                        onClick={() => onChange(tab.key, String(amt))}
                                    >
                                        ₹{amt.toLocaleString('en-IN')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default memo(CashOpeningSection);

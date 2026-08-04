import { memo, useCallback } from 'react';
import { Wallet, Sparkles, RotateCcw } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const QUICK_AMOUNTS = [500, 1000, 5000];

const CashOpeningSection = ({ balances, onChange, prevClosing, bookTabs }) => {
    const formatDisplay = useCallback((val) => {
        const n = Number(val);
        return !isNaN(n) && n > 0 ? formatCurrency(n) : '—';
    }, []);

    const handleCopyAllPrev = useCallback(() => {
        bookTabs.forEach(tab => {
            const prev = prevClosing[tab.key];
            if (prev !== undefined && prev !== null) {
                onChange(tab.key, String(prev));
            }
        });
    }, [bookTabs, prevClosing, onChange]);

    if (!bookTabs || bookTabs.length === 0) return null;

    const hasAnyPrev = bookTabs.some(tab => prevClosing[tab.key] > 0);

    return (
        <div className="os-section">
            <div className="os-section__header">
                <div className="os-section__icon" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                    <Wallet size={18} />
                </div>
                <div className="os-section__titles">
                    <h3 className="os-section__title">Cash Opening Balances</h3>
                    <p className="os-section__subtitle">Set starting cash drawer amounts for each register</p>
                </div>
                {hasAnyPrev && (
                    <button
                        type="button"
                        className="os-quick-copy-all-btn"
                        onClick={handleCopyAllPrev}
                        title="Use yesterday's closing balances for all books"
                    >
                        <Sparkles size={13} />
                        <span>Copy Yesterday&apos;s Balances</span>
                    </button>
                )}
            </div>

            <div className="os-cash-grid">
                {bookTabs.map(tab => {
                    const val = balances[tab.key] || '';
                    const prev = prevClosing[tab.key] || 0;
                    return (
                        <div
                            key={tab.key}
                            className="os-cash-card"
                            style={{ '--card-accent': tab.color }}
                        >
                            <div className="os-cash-card__header">
                                <div className="os-cash-card__dot" style={{ background: tab.color }} />
                                <span className="os-cash-card__label">{tab.label} Book</span>
                                {prev > 0 && (
                                    <button
                                        type="button"
                                        className="os-cash-card__prev-badge"
                                        onClick={() => onChange(tab.key, String(prev))}
                                        title="Click to copy yesterday's balance"
                                    >
                                        <RotateCcw size={10} /> Yest: {formatDisplay(prev)}
                                    </button>
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
                                {val !== '' && (
                                    <button
                                        type="button"
                                        className="os-card-clear-btn"
                                        onClick={() => onChange(tab.key, '')}
                                        title="Clear value"
                                    >
                                        &times;
                                    </button>
                                )}
                            </div>

                            <div className="os-cash-card__chips">
                                {prev > 0 && (
                                    <button
                                        type="button"
                                        className="os-chip os-chip--primary"
                                        onClick={() => onChange(tab.key, String(prev))}
                                    >
                                        Yesterday ({formatDisplay(prev)})
                                    </button>
                                )}
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

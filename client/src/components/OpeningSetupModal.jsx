import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { X, Sunrise, ArrowRight, Loader2, CheckCircle2, RotateCcw, Cpu, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { serverToday } from '../services/serverTime';
import { formatCurrency } from '../utils/formatters';
import CashOpeningSection from './CashOpeningSection';
import './OpeningSetupModal.css';

const BOOK_TABS = [
    { key: 'Offset', label: 'Offset', color: 'var(--info)' },
    { key: 'Laser', label: 'Laser', color: 'var(--warning)' },
    { key: 'Other', label: 'Other', color: 'var(--success)' },
];

const OpeningSetupModal = ({ balances, machines, prevClosing, branchName, onSave, onSkip, date }) => {
    const [cashValues, setCashValues] = useState(() => {
        const init = {};
        Object.keys(balances).forEach(k => { init[k] = balances[k]; });
        return init;
    });
    const [machineValues, setMachineValues] = useState(() =>
        machines.map(m => ({
            ...m,
            opening_count: m.opening_count || '',
            previous_count: prevClosing.machines?.[m.id] || 0,
            error: null,
        }))
    );
    const [saving, setSaving] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [editing, setEditing] = useState(false);
    const autosaveTimer = useRef(null);

    const today = date || serverToday();
    const formattedDate = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    const activeBookTabs = useMemo(() =>
        BOOK_TABS.filter(t => Object.prototype.hasOwnProperty.call(cashValues, t.key)),
        [cashValues]
    );

    const totalCash = useMemo(() => {
        return Object.values(cashValues).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    }, [cashValues]);

    const machinesUpdated = useMemo(() => {
        return machineValues.filter(m => m.opening_count !== '' && m.opening_count !== null).length;
    }, [machineValues]);

    const allMachinesValid = useMemo(() => {
        return machineValues.every(m => {
            if (m.opening_count === '' || m.opening_count === null) return false;
            const prev = Number(m.previous_count) || 0;
            const curr = Number(m.opening_count) || 0;
            return prev === 0 || curr >= prev;
        });
    }, [machineValues]);

    const allCashValid = useMemo(() => {
        return Object.values(cashValues).every(v => v === '' || v === null || !isNaN(parseFloat(v)));
    }, [cashValues]);

    const isValid = allCashValid && allMachinesValid && (totalCash > 0 || machinesUpdated > 0);

    const handleCashChange = useCallback((key, value) => {
        setCashValues(prev => ({ ...prev, [key]: value }));
    }, []);

    const handleMachineChange = useCallback((id, value) => {
        setMachineValues(prev => prev.map(m =>
            m.id === id ? { ...m, opening_count: value, error: null } : m
        ));
    }, []);

    const handleCopyAllMachinesPrev = useCallback(() => {
        setMachineValues(prev => prev.map(m => {
            const prevCount = m.previous_count || 0;
            return prevCount > 0 ? { ...m, opening_count: String(prevCount), error: null } : m;
        }));
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const books = Object.keys(cashValues);
            for (const bookType of books) {
                try {
                    await api.put('/daily-report/opening-balance', {
                        date: today,
                        book_type: bookType,
                        cash_opening: parseFloat(cashValues[bookType]) || 0,
                    });
                } catch (err) {
                    if (err.response?.status !== 403) throw err;
                }
            }

            let hasErrors = false;
            const updated = [...machineValues];
            for (let i = 0; i < updated.length; i++) {
                const m = updated[i];
                if (m.opening_count === '' || m.opening_count === null) {
                    updated[i] = { ...m, error: 'Please enter a counter reading' };
                    hasErrors = true;
                    continue;
                }
                try {
                    await api.post(`/machines/${m.id}/readings`, {
                        reading_date: today,
                        opening_count: parseInt(m.opening_count) || 0,
                    });
                    updated[i] = { ...m, error: null };
                } catch (err) {
                    if (err.response?.status === 403) {
                        updated[i] = { ...m, error: null };
                    } else {
                        updated[i] = { ...m, error: err.response?.data?.error || `Failed to save ${m.machine_name}` };
                        hasErrors = true;
                    }
                }
            }

            if (hasErrors) {
                setMachineValues(updated);
                toast.error('Fix errors before saving');
                return;
            }

            setCompleted(true);
            toast.success('Opening setup saved!');
            setTimeout(() => onSave?.(), 1200);
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to save opening values');
        } finally {
            setSaving(false);
        }
    }, [cashValues, machineValues, today, onSave]);

    useEffect(() => {
        if (editing) return;
        autosaveTimer.current = setInterval(() => {
            try {
                localStorage.setItem('fo-opening-draft', JSON.stringify({
                    cash: cashValues,
                    machines: machineValues.map(m => ({ id: m.id, opening_count: m.opening_count })),
                    savedAt: Date.now(),
                }));
            } catch { /* ignore */ }
        }, 10000);
        return () => clearInterval(autosaveTimer.current);
    }, [cashValues, machineValues, editing]);

    useEffect(() => {
        try {
            const draft = localStorage.getItem('fo-opening-draft');
            if (draft) {
                const parsed = JSON.parse(draft);
                if (parsed.savedAt && Date.now() - parsed.savedAt < 86400000) {
                    if (parsed.cash) setCashValues(prev => ({ ...prev, ...parsed.cash }));
                }
            }
        } catch { /* ignore */ }
    }, []);

    if (completed && !editing) {
        return (
            <div className="modal-backdrop os-modal-backdrop">
                <div className="modal os-modal os-modal--success" style={{ maxWidth: 440 }}>
                    <div className="os-success">
                        <div className="os-success__icon">
                            <CheckCircle2 size={44} />
                        </div>
                        <h2 className="os-success__title">Opening Completed!</h2>
                        <p className="os-success__text">Today&apos;s cash drawers and machine counters are recorded.</p>
                        
                        <div className="os-success__summary">
                            <div className="os-success__stat">
                                <span className="os-success__stat-label">Opening Cash</span>
                                <span className="os-success__stat-val">{formatCurrency(totalCash)}</span>
                            </div>
                            <div className="os-success__stat">
                                <span className="os-success__stat-label">Machines Set</span>
                                <span className="os-success__stat-val">{machinesUpdated} / {machineValues.length}</span>
                            </div>
                        </div>

                        <div className="os-success__actions">
                            <button className="btn btn-primary os-btn-glow" onClick={onSave}>Go to Dashboard →</button>
                            <button className="btn btn-ghost" onClick={() => { setCompleted(false); setEditing(true); }}>Edit Values</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const hasAnyMachinePrev = machineValues.some(m => Number(m.previous_count) > 0);

    return (
        <div className="modal-backdrop os-modal-backdrop">
            <div className="modal os-modal">
                <button className="modal-close os-close-btn" onClick={onSkip} aria-label="Close">
                    <X size={18} />
                </button>

                <div className="os-header">
                    <div className="os-header__icon">
                        <Sunrise size={22} />
                    </div>
                    <div className="os-header__text">
                        <div className="os-header__title-row">
                            <h2 className="os-header__title">Opening Setup</h2>
                            <span className="os-header__badge">{branchName || 'Main Branch'}</span>
                        </div>
                        <p className="os-header__meta">Set starting cash drawers and machine counters for {formattedDate}</p>
                    </div>
                </div>

                <div className="os-body">
                    {activeBookTabs.length > 0 && (
                        <CashOpeningSection
                            balances={cashValues}
                            onChange={handleCashChange}
                            prevClosing={prevClosing}
                            bookTabs={activeBookTabs}
                        />
                    )}

                    {machineValues.length > 0 && (
                        <div className="os-section">
                            <div className="os-section__header">
                                <div className="os-section__icon" style={{ background: 'var(--info-bg)', color: 'var(--info)' }}>
                                    <Cpu size={18} />
                                </div>
                                <div className="os-section__titles">
                                    <h3 className="os-section__title">Machine Readings</h3>
                                    <p className="os-section__subtitle">Record starting counter readings for print equipment</p>
                                </div>
                                {hasAnyMachinePrev && (
                                    <button
                                        type="button"
                                        className="os-quick-copy-all-btn"
                                        onClick={handleCopyAllMachinesPrev}
                                        title="Copy previous closing counters for all machines"
                                    >
                                        <Sparkles size={13} />
                                        <span>Copy Previous Counters</span>
                                    </button>
                                )}
                            </div>

                            <div className="os-machines-table">
                                {machineValues.map(m => {
                                    const prev = Number(m.previous_count) || 0;
                                    const curr = Number(m.opening_count) || 0;
                                    const diff = prev > 0 && curr > 0 ? curr - prev : null;
                                    const isInvalid = prev > 0 && curr > 0 && curr < prev;
                                    return (
                                        <div key={m.id} className={`os-machine-row ${m.error ? 'os-machine-row--error' : ''} ${isInvalid ? 'os-machine-row--invalid' : ''}`}>
                                            <div className="os-machine-row__info">
                                                <span className="os-machine-row__name">{m.machine_name}</span>
                                                <span className="os-machine-row__type">{m.type || 'Printer'}</span>
                                            </div>
                                            
                                            <div className="os-machine-row__prev-col">
                                                <span className="os-machine-row__prev">
                                                    {prev > 0 ? `Prev: ${prev.toLocaleString('en-IN')}` : 'Prev: —'}
                                                </span>
                                                {prev > 0 && m.opening_count === '' && (
                                                    <button
                                                        type="button"
                                                        className="os-machine-row__copy-btn"
                                                        onClick={() => handleMachineChange(m.id, String(prev))}
                                                        title="Copy previous counter"
                                                    >
                                                        <RotateCcw size={10} /> Same
                                                    </button>
                                                )}
                                            </div>

                                            <div className="os-machine-row__input-col">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className={`os-machine-row__input ${m.error ? 'os-machine-row__input--error' : ''} ${isInvalid ? 'os-machine-row__input--invalid' : ''}`}
                                                    value={m.opening_count}
                                                    onChange={(e) => {
                                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                                        handleMachineChange(m.id, raw);
                                                    }}
                                                    placeholder="Counter value"
                                                />
                                            </div>

                                            <div className="os-machine-row__status">
                                                {diff !== null && !isInvalid && (
                                                    <span className="os-machine-row__diff">+{diff.toLocaleString('en-IN')} prints</span>
                                                )}
                                                {curr > 0 && diff === 0 && (
                                                    <span className="os-machine-row__diff os-machine-row__diff--zero">No change</span>
                                                )}
                                            </div>

                                            {(m.error || isInvalid) && (
                                                <span className="os-machine-row__error">
                                                    {m.error || 'Counter cannot be lower than previous closing reading'}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <div className="os-footer">
                    <div className="os-footer__stats">
                        <div className="os-footer__stat-item">
                            <span className="os-footer__stat-lbl">Cash Total:</span>
                            <span className="os-footer__stat-val">{formatCurrency(totalCash)}</span>
                        </div>
                        {machineValues.length > 0 && (
                            <div className="os-footer__stat-item">
                                <span className="os-footer__stat-lbl">Machines:</span>
                                <span className={`os-footer__stat-val ${allMachinesValid ? 'os-footer__stat-val--ok' : ''}`}>
                                    {machinesUpdated}/{machineValues.length}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="os-footer__actions">
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={onSkip}
                        >
                            Skip for Now
                        </button>

                        <button
                            className="btn btn-primary os-footer__save os-btn-glow"
                            onClick={handleSave}
                            disabled={saving || !isValid}
                        >
                            {saving ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                            {saving ? 'Saving...' : 'Save & Continue →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default memo(OpeningSetupModal);

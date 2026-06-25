import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { X, Sunrise, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { serverToday } from '../services/serverTime';
import CashOpeningSection from './CashOpeningSection';

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
    const formattedDate = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

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
            toast.success('Opening values saved!');
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
            <div className="modal-backdrop">
                <div className="modal os-modal os-modal--success" style={{ maxWidth: 420 }}>
                    <div className="os-success">
                        <div className="os-success__icon">
                            <CheckCircle2 size={40} />
                        </div>
                        <h2 className="os-success__title">Opening Completed</h2>
                        <p className="os-success__text">Today&apos;s values saved successfully.</p>
                        <div className="os-success__actions">
                            <button className="btn btn-primary" onClick={onSave}>Go to Dashboard</button>
                            <button className="btn btn-ghost" onClick={() => { setCompleted(false); setEditing(true); }}>Edit Values</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-backdrop">
            <div className="modal os-modal">
                <button className="modal-close" onClick={onSkip} aria-label="Close">
                    <X size={18} />
                </button>

                <div className="os-header">
                    <div className="os-header__icon">
                        <Sunrise size={20} />
                    </div>
                    <div className="os-header__text">
                        <h2 className="os-header__title">Opening Setup</h2>
                        <p className="os-header__meta">{branchName || 'Branch'} • {formattedDate}</p>
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
                                    <span style={{ fontSize: 16 }}>⚙</span>
                                </div>
                                <div>
                                    <h3 className="os-section__title">Machine Readings</h3>
                                </div>
                            </div>
                            <div className="os-machines-table">
                                {machineValues.map(m => {
                                    const prev = Number(m.previous_count) || 0;
                                    const curr = Number(m.opening_count) || 0;
                                    const diff = prev > 0 && curr > 0 ? curr - prev : null;
                                    const isInvalid = prev > 0 && curr > 0 && curr < prev;
                                    return (
                                        <div key={m.id} className={`os-machine-row ${m.error ? 'os-machine-row--error' : ''} ${isInvalid ? 'os-machine-row--invalid' : ''}`}>
                                            <span className="os-machine-row__name">{m.machine_name}</span>
                                            <span className="os-machine-row__prev">
                                                {prev > 0 ? prev.toLocaleString('en-IN') : '—'}
                                            </span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className={`os-machine-row__input ${m.error ? 'os-machine-row__input--error' : ''} ${isInvalid ? 'os-machine-row__input--invalid' : ''}`}
                                                value={m.opening_count}
                                                onChange={(e) => {
                                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                                    handleMachineChange(m.id, raw);
                                                }}
                                                placeholder="Counter"
                                            />
                                            {diff !== null && !isInvalid && (
                                                <span className="os-machine-row__diff">+{diff.toLocaleString('en-IN')}</span>
                                            )}
                                            {(m.error || isInvalid) && (
                                                <span className="os-machine-row__error">
                                                    {m.error || 'Cannot be less than previous'}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {(isValid || saving) && (
                    <div className="os-footer">
                        <button
                            className="btn btn-primary os-footer__save"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                            {saving ? 'Saving...' : 'Continue →'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default memo(OpeningSetupModal);

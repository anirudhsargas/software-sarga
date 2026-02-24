import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    BookOpen, Printer, Package, RefreshCw, TrendingUp, TrendingDown,
    Monitor, Hash, Building2, Check, Edit3, Lock, Send, FileText,
    Calendar, Clock, ArrowUpRight, ArrowDownRight, X, Wallet, CreditCard,
    IndianRupee, ChevronRight, BarChart3
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../services/api';
import auth from '../services/auth';
import { serverToday, serverNow } from '../services/serverTime';

const TABS = [
    { key: 'Offset', label: 'Offset', icon: BookOpen, color: '#2563eb', bg: 'rgba(37,99,235,0.08)' },
    { key: 'Laser', label: 'Laser', icon: Printer, color: '#7c3aed', bg: 'rgba(124,58,237,0.08)' },
    { key: 'Other', label: 'Other', icon: Package, color: '#059669', bg: 'rgba(5,150,105,0.08)' }
];

const AUTO_REFRESH_INTERVAL = 30000;

const DailyReport = () => {
    const [activeTab, setActiveTab] = useState('Offset');
    const [reportDate, setReportDate] = useState(serverToday());
    const [loading, setLoading] = useState(false);
    const [openingBalances, setOpeningBalances] = useState({ Offset: 0, Laser: 0, Other: 0 });
    const [lockedBalances, setLockedBalances] = useState({ Offset: false, Laser: false, Other: false });
    const [editingBalance, setEditingBalance] = useState(null);
    const [tempBalance, setTempBalance] = useState('');

    // Change request state
    const [showChangeRequest, setShowChangeRequest] = useState(null);
    const [changeRequestValue, setChangeRequestValue] = useState('');
    const [changeRequestNote, setChangeRequestNote] = useState('');
    const [submittingRequest, setSubmittingRequest] = useState(false);

    // Branch state
    const [branches, setBranches] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState(null);

    // Opening balance prompt modal
    const [showOpeningPrompt, setShowOpeningPrompt] = useState(false);
    const [promptBalances, setPromptBalances] = useState({ Offset: '', Laser: '', Other: '' });
    const [promptMachines, setPromptMachines] = useState([]);
    const [savingPrompt, setSavingPrompt] = useState(false);
    const [promptDone, setPromptDone] = useState(false);

    // Tab data
    const [offsetData, setOffsetData] = useState({ entries: [], summary: {} });
    const [laserData, setLaserData] = useState({ machines: [], entries: [], summary: {} });
    const [otherData, setOtherData] = useState({ entries: [], summary: {} });
    const [liveCounts, setLiveCounts] = useState(null);

    // Machine editing
    const [editingMachine, setEditingMachine] = useState(null);
    const [machineReadingTemp, setMachineReadingTemp] = useState({ opening_count: '', closing_count: '' });

    const [lastRefresh, setLastRefresh] = useState(null);
    const refreshTimerRef = useRef(null);

    const user = auth.getUser();
    const headers = auth.getAuthHeader();
    const isAdmin = user.role === 'Admin';
    const isFrontOffice = user.role === 'Front Office';
    const canEditBalance = isFrontOffice || isAdmin;

    const branchParam = isAdmin && selectedBranch ? { branch_id: selectedBranch } : {};

    const formatCurrency = (val) => `₹${(Number(val) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatNum = (val) => (Number(val) || 0).toLocaleString('en-IN');
    const formatTime = (ts) => {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    };
    const formatDateDisplay = (dateStr) => {
        const d = new Date(dateStr + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };

    const currentTabMeta = TABS.find(t => t.key === activeTab);
    const branchName = branches.find(b => b.id === selectedBranch)?.name || '';

    // ─── Fetch Branches (Admin Only) ────────────────────────────
    useEffect(() => {
        if (!isAdmin) return;
        (async () => {
            try {
                const res = await api.get('/branches', { headers });
                setBranches(res.data);
                if (res.data.length > 0 && !selectedBranch) setSelectedBranch(res.data[0].id);
            } catch (err) { console.error('Error fetching branches:', err); }
        })();
    }, []);

    // ─── Check if Opening Balance Entered Today (Front Office) ──
    useEffect(() => {
        if (!isFrontOffice) return;
        const todayStr = serverToday();
        if (reportDate !== todayStr) return;

        (async () => {
            try {
                const res = await api.get('/daily-report/opening-balance', { params: { date: todayStr }, headers });
                const data = res.data;
                const balances = data.balances || data;
                const locked = data.locked || {};
                const anyEntered = Object.values(balances).some(v => Number(v) > 0);
                const anyLocked = Object.values(locked).some(v => v);
                if (!anyEntered && !anyLocked && !promptDone) {
                    try {
                        const machRes = await api.get('/machines', { params: { is_active: 'true' }, headers });
                        const digitalMachines = (machRes.data || []).filter(m => m.machine_type === 'Digital');
                        setPromptMachines(digitalMachines.map(m => ({
                            id: m.id, machine_name: m.machine_name, location: m.location, opening_count: ''
                        })));
                    } catch { }
                    setPromptBalances({ Offset: '', Laser: '', Other: '' });
                    setShowOpeningPrompt(true);
                }
            } catch (err) { console.error('Error checking opening balance:', err); }
        })();
    }, [reportDate]);

    // ─── Save Opening Prompt ────────────────────────────────────
    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        try {
            const balancePromises = ['Offset', 'Laser', 'Other'].map(bookType =>
                api.put('/daily-report/opening-balance', {
                    date: reportDate, book_type: bookType, cash_opening: parseFloat(promptBalances[bookType]) || 0
                }, { headers })
            );
            const machinePromises = promptMachines
                .filter(m => m.opening_count !== '' && m.opening_count !== null)
                .map(m => api.post(`/machines/${m.id}/readings`, {
                    reading_date: reportDate, opening_count: parseInt(m.opening_count) || 0
                }, { headers }));

            await Promise.all([...balancePromises, ...machinePromises]);
            setShowOpeningPrompt(false);
            setPromptDone(true);
            loadAllData();
        } catch (err) {
            console.error('Error saving opening data:', err);
            alert('Failed to save opening data. Please try again.');
        } finally { setSavingPrompt(false); }
    };

    // ─── Fetch Opening Balances ─────────────────────────────────
    const fetchOpeningBalances = useCallback(async () => {
        try {
            const res = await api.get('/daily-report/opening-balance', {
                params: { date: reportDate, ...branchParam }, headers
            });
            const data = res.data;
            if (data.balances) {
                setOpeningBalances(data.balances);
                setLockedBalances(data.locked || { Offset: false, Laser: false, Other: false });
            } else {
                setOpeningBalances(data);
            }
        } catch (err) { console.error('Error fetching opening balances:', err); }
    }, [reportDate, selectedBranch]);

    // ─── Save Opening Balance (inline edit) ─────────────────────
    const saveOpeningBalance = async (bookType, value) => {
        try {
            const res = await api.put('/daily-report/opening-balance', {
                date: reportDate, book_type: bookType, cash_opening: parseFloat(value) || 0, ...branchParam
            }, { headers });
            setOpeningBalances(prev => ({ ...prev, [bookType]: parseFloat(value) || 0 }));
            if (res.data.is_locked) setLockedBalances(prev => ({ ...prev, [bookType]: true }));
            setEditingBalance(null);
            loadTabData(bookType);
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.is_locked) {
                alert('This balance is locked. Please submit a change request to Admin.');
                setLockedBalances(prev => ({ ...prev, [bookType]: true }));
            } else {
                console.error('Error saving opening balance:', err);
                alert('Failed to save opening balance');
            }
            setEditingBalance(null);
        }
    };

    // ─── Save Machine Reading ───────────────────────────────────
    const saveMachineReading = async (machineId) => {
        try {
            await api.post(`/machines/${machineId}/readings`, {
                reading_date: reportDate,
                opening_count: parseInt(machineReadingTemp.opening_count) || 0,
                closing_count: machineReadingTemp.closing_count !== '' ? parseInt(machineReadingTemp.closing_count) : null
            }, { headers });
            setEditingMachine(null);
            loadTabData('Laser');
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.is_locked) {
                alert('Opening count is locked. You can still update the closing count, or submit a change request.');
            } else {
                console.error('Error saving machine reading:', err);
                alert('Failed to save machine reading');
            }
            setEditingMachine(null);
        }
    };

    // ─── Submit Change Request ──────────────────────────────────
    const submitChangeRequest = async () => {
        if (!showChangeRequest) return;
        setSubmittingRequest(true);
        try {
            await api.post('/daily-report/change-request', {
                date: reportDate, request_type: showChangeRequest.type,
                book_type: showChangeRequest.bookType || null, machine_id: showChangeRequest.machineId || null,
                current_value: showChangeRequest.currentValue || 0,
                requested_value: parseFloat(changeRequestValue) || 0,
                note: changeRequestNote || null, ...branchParam
            }, { headers });
            alert('Change request submitted! Admin will review it.');
            setShowChangeRequest(null);
            setChangeRequestValue('');
            setChangeRequestNote('');
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to submit change request');
        } finally { setSubmittingRequest(false); }
    };

    // ─── Fetch Tab Data ─────────────────────────────────────────
    const loadTabData = useCallback(async (tab) => {
        try {
            const endpoint = tab === 'Offset' ? '/daily-report/offset-live'
                : tab === 'Laser' ? '/daily-report/laser-live' : '/daily-report/other-live';
            const res = await api.get(endpoint, { params: { date: reportDate, ...branchParam }, headers });
            if (tab === 'Offset') setOffsetData(res.data);
            else if (tab === 'Laser') setLaserData(res.data);
            else setOtherData(res.data);
        } catch (err) { console.error(`Error fetching ${tab} data:`, err); }
    }, [reportDate, selectedBranch]);

    const fetchLiveCounts = useCallback(async () => {
        try {
            const res = await api.get('/daily-report/live-counts', { params: { date: reportDate, ...branchParam }, headers });
            setLiveCounts(res.data);
            setLastRefresh(serverNow());
        } catch (err) { console.error('Error fetching live counts:', err); }
    }, [reportDate, selectedBranch]);

    const loadAllData = useCallback(async () => {
        setLoading(true);
        try { await Promise.all([fetchOpeningBalances(), loadTabData(activeTab), fetchLiveCounts()]); }
        finally { setLoading(false); }
    }, [fetchOpeningBalances, loadTabData, fetchLiveCounts, activeTab]);

    useEffect(() => {
        if (isAdmin && !selectedBranch) return;
        loadAllData();
    }, [reportDate, selectedBranch]);

    useEffect(() => {
        if (isAdmin && !selectedBranch) return;
        loadTabData(activeTab);
    }, [activeTab, reportDate, selectedBranch]);

    useEffect(() => {
        refreshTimerRef.current = setInterval(() => {
            if (isAdmin && !selectedBranch) return;
            fetchLiveCounts();
            loadTabData(activeTab);
        }, AUTO_REFRESH_INTERVAL);
        return () => clearInterval(refreshTimerRef.current);
    }, [activeTab, reportDate, selectedBranch, fetchLiveCounts, loadTabData]);

    const manualRefresh = () => { fetchLiveCounts(); loadTabData(activeTab); };

    // ─── PDF Export ─────────────────────────────────────────────
    const generatePDF = () => {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();
        const margin = 14;
        let y = 16;

        const displayBranch = branchName || 'Branch';
        const dateStr = formatDateDisplay(reportDate);

        // Header
        doc.setFillColor(31, 42, 51);
        doc.rect(0, 0, pageW, 36, 'F');
        doc.setTextColor(247, 246, 243);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('SARGA', margin, 16);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('DAILY CASH BOOK REPORT', margin, 23);
        doc.setFontSize(9);
        doc.text(`${displayBranch}  |  ${dateStr}`, margin, 30);
        doc.setFontSize(8);
        doc.text(`Generated: ${serverNow().toLocaleString('en-IN')}`, pageW - margin, 30, { align: 'right' });

        y = 44;

        const sectionHeader = (title, color) => {
            doc.setFillColor(...color);
            doc.roundedRect(margin, y, pageW - margin * 2, 8, 1.5, 1.5, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text(title, margin + 4, y + 5.5);
            y += 12;
            doc.setTextColor(30, 30, 30);
            doc.setFont('helvetica', 'normal');
        };

        const kvRow = (label, value, options = {}) => {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.text(label, margin + 2, y);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(options.color || [30, 30, 30]);
            doc.text(String(value), pageW - margin - 2, y, { align: 'right' });
            y += 5.5;
        };

        const allData = [
            { key: 'Offset', data: offsetData, color: [37, 99, 235] },
            { key: 'Laser', data: laserData, color: [124, 58, 237] },
            { key: 'Other', data: otherData, color: [5, 150, 105] }
        ];

        allData.forEach(({ key, data, color }) => {
            const summary = data.summary || {};
            const entries = data.entries || [];
            const opening = openingBalances[key] || 0;

            if (y > 250) { doc.addPage(); y = 16; }

            sectionHeader(`${key.toUpperCase()} BOOK`, color);
            kvRow('Opening Cash Balance', formatCurrency(opening));

            if (key === 'Laser' && data.machines?.length > 0) {
                data.machines.forEach(m => {
                    kvRow(`${m.machine_name} — Opening`, formatNum(m.opening_count || 0));
                    kvRow(`${m.machine_name} — Closing`, formatNum(m.closing_count || 0));
                    kvRow(`${m.machine_name} — Copies`, formatNum(m.today_copies || 0), { color: [5, 150, 105] });
                });
            }

            if (entries.length > 0) {
                const isLaser = key === 'Laser';
                const head = isLaser
                    ? [['Time', 'Description', 'Copies', 'Cash', 'UPI', 'Total']]
                    : [['Time', 'Description', 'Type', 'Cash', 'UPI', 'Total']];

                const body = entries.map(e => {
                    const isExp = e.type === 'expense';
                    const sign = isExp ? '-' : '';
                    if (isLaser) {
                        return [formatTime(e.time), e.description || '', String(e.copies || ''),
                            `${sign}${formatCurrency(e.cash_amount)}`, `${sign}${formatCurrency(e.upi_amount)}`, `${sign}${formatCurrency(e.total)}`];
                    }
                    return [formatTime(e.time), e.description || '', isExp ? 'Expense' : 'Income',
                        `${sign}${formatCurrency(e.cash_amount)}`, `${sign}${formatCurrency(e.upi_amount)}`, `${sign}${formatCurrency(e.total)}`];
                });

                autoTable(doc, {
                    startY: y,
                    head,
                    body,
                    margin: { left: margin, right: margin },
                    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.2 },
                    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                    alternateRowStyles: { fillColor: [248, 248, 248] },
                    columnStyles: isLaser
                        ? { 0: { cellWidth: 18 }, 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
                        : { 0: { cellWidth: 18 }, 2: { cellWidth: 18 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
                });
                y = doc.lastAutoTable.finalY + 4;
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('No entries recorded', margin + 2, y);
                y += 6;
            }

            kvRow('Cash In', formatCurrency(summary.total_cash_in), { color: [47, 125, 74] });
            kvRow('UPI In', formatCurrency(summary.total_upi_in), { color: [47, 125, 74] });
            if (summary.total_cash_out !== undefined && summary.total_cash_out !== null) {
                kvRow('Cash Out', formatCurrency(summary.total_cash_out), { color: [176, 58, 46] });
            }
            if (summary.total_copies !== undefined) {
                kvRow('Total Copies', formatNum(summary.total_copies));
            }

            doc.setFillColor(245, 245, 240);
            doc.roundedRect(margin, y - 1, pageW - margin * 2, 8, 1.5, 1.5, 'F');
            kvRow('CASH CLOSING BALANCE', formatCurrency(summary.cash_closing), { color: color });
            y += 6;
        });

        // Footer on all pages
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(160, 160, 160);
            doc.text(`Page ${i} of ${totalPages}`, pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
            doc.text('SARGA — Confidential', margin, doc.internal.pageSize.getHeight() - 8);
        }

        doc.save(`Daily-Report_${displayBranch}_${reportDate}.pdf`);
    };

    // ═══════════════════ SUB-COMPONENTS ═══════════════════

    const OpeningBalanceCard = ({ bookType }) => {
        const isEditing = editingBalance === bookType;
        const currentValue = openingBalances[bookType] || 0;
        const isLocked = lockedBalances[bookType] && !isAdmin;
        const tabMeta = TABS.find(t => t.key === bookType);

        return (
            <div className="dr-opening-card" style={{ background: tabMeta.bg, borderColor: `${tabMeta.color}22` }}>
                <div>
                    <div className="dr-opening-label">
                        <Wallet size={13} />
                        Cash Opening — {bookType}
                        {isLocked && (
                            <span style={{ color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Lock size={11} /> Locked
                            </span>
                        )}
                    </div>
                    {isEditing ? (
                        <div className="row gap-sm" style={{ marginTop: 8 }}>
                            <input
                                type="number" className="input-field" value={tempBalance}
                                onChange={(e) => setTempBalance(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveOpeningBalance(bookType, tempBalance);
                                    if (e.key === 'Escape') setEditingBalance(null);
                                }}
                                autoFocus step="0.01" style={{ width: 160, fontSize: 16, fontWeight: 600 }}
                            />
                            <button className="btn btn-primary btn-sm" onClick={() => saveOpeningBalance(bookType, tempBalance)}>
                                <Check size={14} /> Save
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingBalance(null)}>
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="dr-opening-value" style={{ color: tabMeta.color }}>
                            {formatCurrency(currentValue)}
                        </div>
                    )}
                </div>
                {!isEditing && (
                    <div className="row gap-sm">
                        {canEditBalance && !isLocked && (
                            <button className="btn btn-ghost btn-sm" onClick={() => { setTempBalance(String(currentValue)); setEditingBalance(bookType); }}>
                                <Edit3 size={14} /> {currentValue > 0 ? 'Edit' : 'Set'}
                            </button>
                        )}
                        {isLocked && isFrontOffice && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                onClick={() => { setShowChangeRequest({ type: 'balance', bookType, currentValue }); setChangeRequestValue(String(currentValue)); setChangeRequestNote(''); }}
                                title="Request change from Admin"
                            >
                                <Send size={14} /> Request Change
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const EntryTable = ({ entries, type = 'offset' }) => {
        if (!entries?.length) return (
            <div className="dr-empty">
                <div className="dr-empty__icon"><FileText size={22} /></div>
                <p style={{ fontWeight: 500, marginBottom: 4 }}>No entries yet</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {type === 'laser' ? 'Laser work entries will appear here' : 'Data auto-syncs from billing & expenses'}
                </p>
            </div>
        );

        const isLaser = type === 'laser';

        return (
            <div style={{ overflowX: 'auto', borderRadius: 12 }}>
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ width: 70 }}>Time</th>
                            <th>{isLaser ? 'Customer / Work' : 'Description'}</th>
                            {isLaser
                                ? <th style={{ textAlign: 'right', width: 70 }}>Copies</th>
                                : <th style={{ width: 80 }}>Type</th>
                            }
                            <th style={{ textAlign: 'right', width: 100 }}>Cash</th>
                            <th style={{ textAlign: 'right', width: 100 }}>UPI</th>
                            <th style={{ textAlign: 'right', width: 100 }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry, i) => {
                            const isExpense = entry.type === 'expense';
                            return (
                                <tr key={`${type}-${entry.id}-${i}`}>
                                    <td>
                                        <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                            <Clock size={10} /> {formatTime(entry.time)}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{entry.description}</div>
                                        {entry.details && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{entry.details}</div>}
                                    </td>
                                    {isLaser ? (
                                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{entry.copies}</td>
                                    ) : (
                                        <td>
                                            <span className={`badge ${isExpense ? 'badge--danger' : 'badge--success'}`} style={{ fontSize: 10, gap: 3 }}>
                                                {isExpense
                                                    ? <><ArrowDownRight size={10} /> Expense</>
                                                    : <><ArrowUpRight size={10} /> Income</>
                                                }
                                            </span>
                                        </td>
                                    )}
                                    <td style={{ textAlign: 'right', color: isExpense ? 'var(--error)' : 'var(--success)', fontWeight: 500, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap' }}>
                                        {isExpense ? '-' : '+'}{formatCurrency(entry.cash_amount)}
                                    </td>
                                    <td style={{ textAlign: 'right', color: isExpense ? 'var(--error)' : 'var(--success)', fontWeight: 500, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap' }}>
                                        {isExpense ? '-' : '+'}{formatCurrency(entry.upi_amount)}
                                    </td>
                                    <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", whiteSpace: 'nowrap' }}>
                                        {isExpense ? '-' : ''}{formatCurrency(entry.total)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    const SummaryPanel = ({ summary, tabKey }) => {
        const tabMeta = TABS.find(t => t.key === tabKey);
        return (
            <div className="dr-summary">
                <div className="dr-summary-item">
                    <span className="dr-summary-item__label">Opening</span>
                    <span className="dr-summary-item__value">{formatCurrency(summary.cash_opening)}</span>
                </div>
                <div className="dr-summary-item">
                    <span className="dr-summary-item__label">
                        <TrendingUp size={12} style={{ display: 'inline', marginRight: 3, color: 'var(--success)' }} /> Cash In
                    </span>
                    <span className="dr-summary-item__value" style={{ color: 'var(--success)' }}>{formatCurrency(summary.total_cash_in)}</span>
                </div>
                <div className="dr-summary-item">
                    <span className="dr-summary-item__label">
                        <CreditCard size={12} style={{ display: 'inline', marginRight: 3, color: 'var(--success)' }} /> UPI In
                    </span>
                    <span className="dr-summary-item__value" style={{ color: 'var(--success)' }}>{formatCurrency(summary.total_upi_in)}</span>
                </div>
                {summary.total_cash_out !== undefined && summary.total_cash_out !== null && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label">
                            <TrendingDown size={12} style={{ display: 'inline', marginRight: 3, color: 'var(--error)' }} /> Cash Out
                        </span>
                        <span className="dr-summary-item__value" style={{ color: 'var(--error)' }}>{formatCurrency(summary.total_cash_out)}</span>
                    </div>
                )}
                {summary.total_copies !== undefined && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label">
                            <Hash size={12} style={{ display: 'inline', marginRight: 3 }} /> Total Copies
                        </span>
                        <span className="dr-summary-item__value">{formatNum(summary.total_copies)}</span>
                    </div>
                )}
                <div className="dr-summary-closing">
                    <span className="dr-summary-item__label">Cash Closing</span>
                    <span className="dr-summary-item__value" style={{ fontSize: 26, color: tabMeta?.color || 'var(--primary)' }}>
                        {formatCurrency(summary.cash_closing)}
                    </span>
                </div>
            </div>
        );
    };

    const StatRow = ({ items }) => (
        <div className="row gap-md" style={{ flexWrap: 'wrap' }}>
            {items.map((item, i) => (
                <div key={i} className="stat-card" style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                        {item.icon && <item.icon size={14} style={{ color: item.color || 'var(--muted)' }} />}
                    </div>
                    <div className="stat-value" style={{ color: item.color || 'var(--text)' }}>{item.value}</div>
                    <div className="stat-label">{item.label}</div>
                </div>
            ))}
        </div>
    );

    const MachineSection = () => {
        if (!laserData.machines?.length) return (
            <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Monitor size={16} /> Machines
                </h3>
                <div className="dr-empty">
                    <div className="dr-empty__icon"><Monitor size={22} /></div>
                    <p style={{ fontWeight: 500 }}>No active Digital machines</p>
                </div>
            </div>
        );

        return (
            <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Monitor size={16} />
                    Machines
                    <span className="badge badge--info" style={{ fontSize: 10, marginLeft: 4 }}>{laserData.machines.length} active</span>
                </h3>
                <div className="stack-sm">
                    {laserData.machines.map(m => {
                        const isEditingThis = editingMachine === m.id;
                        return (
                            <div key={m.id} className="dr-machine-card">
                                <div style={{ flex: 1, minWidth: 130 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.machine_name}</div>
                                    {m.location && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{m.location}</div>}
                                </div>

                                {isEditingThis ? (
                                    <div className="row gap-sm items-end" style={{ flexWrap: 'wrap' }}>
                                        <div className="stack-xs">
                                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                Opening
                                                {m.has_reading && !isAdmin && <Lock size={9} style={{ color: 'var(--warning)' }} />}
                                            </label>
                                            <input type="number" className="input-field"
                                                value={machineReadingTemp.opening_count}
                                                onChange={(e) => setMachineReadingTemp(prev => ({ ...prev, opening_count: e.target.value }))}
                                                autoFocus={!m.has_reading || isAdmin}
                                                disabled={m.has_reading && !isAdmin}
                                                style={{ width: 110, opacity: (m.has_reading && !isAdmin) ? 0.5 : 1 }}
                                            />
                                        </div>
                                        <div className="stack-xs">
                                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Closing</label>
                                            <input type="number" className="input-field"
                                                value={machineReadingTemp.closing_count}
                                                onChange={(e) => setMachineReadingTemp(prev => ({ ...prev, closing_count: e.target.value }))}
                                                style={{ width: 110 }} placeholder="Optional"
                                                autoFocus={m.has_reading && !isAdmin}
                                            />
                                        </div>
                                        <button className="btn btn-primary btn-sm" onClick={() => saveMachineReading(m.id)}>
                                            <Check size={14} /> Save
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingMachine(null)}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="row gap-lg items-center" style={{ flexWrap: 'wrap' }}>
                                        <div className="dr-machine-stat">
                                            <div className="dr-machine-stat__label">Opening</div>
                                            <div className="dr-machine-stat__value">
                                                {m.has_reading ? formatNum(m.opening_count) : '—'}
                                            </div>
                                        </div>
                                        <ChevronRight size={14} style={{ color: 'var(--muted)' }} />
                                        <div className="dr-machine-stat">
                                            <div className="dr-machine-stat__label">Current</div>
                                            <div className="dr-machine-stat__value" style={{ color: 'var(--primary)' }}>
                                                {m.closing_count !== null ? formatNum(m.closing_count) : '—'}
                                            </div>
                                        </div>
                                        <div className="dr-machine-stat" style={{ background: 'rgba(5,150,105,0.08)', padding: '8px 14px', borderRadius: 10 }}>
                                            <div className="dr-machine-stat__label">Today</div>
                                            <div className="dr-machine-stat__value" style={{ color: 'var(--success)', fontSize: 20 }}>
                                                {formatNum(m.today_copies)}
                                            </div>
                                        </div>
                                        {canEditBalance && (
                                            <button className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                    setEditingMachine(m.id);
                                                    setMachineReadingTemp({
                                                        opening_count: m.has_reading ? String(m.opening_count) : '',
                                                        closing_count: m.closing_count !== null ? String(m.closing_count) : ''
                                                    });
                                                }}
                                                title={m.has_reading && !isAdmin ? 'Edit closing count (opening locked)' : 'Edit machine counts'}
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                        )}
                                        {m.has_reading && isFrontOffice && (
                                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', padding: '4px 8px' }}
                                                onClick={() => {
                                                    setShowChangeRequest({ type: 'machine_count', machineId: m.id, machineName: m.machine_name, currentValue: m.opening_count });
                                                    setChangeRequestValue(String(m.opening_count));
                                                    setChangeRequestNote('');
                                                }}
                                                title="Request opening count change"
                                            >
                                                <Send size={12} />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ─── Tab Content ────────────────────────────────────────────
    const OffsetTab = () => (
        <div className="stack-md">
            <OpeningBalanceCard bookType="Offset" />
            {liveCounts?.offset && (
                <StatRow items={[
                    { value: liveCounts.offset.income_count, label: 'Billings', icon: BarChart3, color: '#2563eb' },
                    { value: liveCounts.offset.expense_count, label: 'Expenses', icon: TrendingDown, color: 'var(--error)' },
                    { value: formatCurrency(liveCounts.offset.total_collected), label: 'Collected', icon: TrendingUp, color: 'var(--success)' },
                    { value: formatCurrency(liveCounts.offset.total_expenses), label: 'Spent', icon: ArrowDownRight, color: 'var(--error)' }
                ]} />
            )}
            <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={16} />
                    Transactions
                    <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>{offsetData.entries?.length || 0}</span>
                </h3>
                <EntryTable entries={offsetData.entries} type="offset" />
            </div>
            <SummaryPanel summary={offsetData.summary || {}} tabKey="Offset" />
        </div>
    );

    const LaserTab = () => (
        <div className="stack-md">
            <OpeningBalanceCard bookType="Laser" />
            <MachineSection />
            {liveCounts?.laser && (
                <StatRow items={[
                    { value: liveCounts.laser.machine_count, label: 'Machines', icon: Monitor, color: '#7c3aed' },
                    { value: formatNum(liveCounts.laser.total_copies), label: 'Total Copies', icon: Hash, color: 'var(--success)' }
                ]} />
            )}
            <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={16} />
                    Laser Work Details
                    <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>{laserData.entries?.length || 0}</span>
                </h3>
                <EntryTable entries={laserData.entries} type="laser" />
            </div>
            <SummaryPanel summary={laserData.summary || {}} tabKey="Laser" />
        </div>
    );

    const OtherTab = () => (
        <div className="stack-md">
            <OpeningBalanceCard bookType="Other" />
            <div className="panel">
                <h3 className="panel-title" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Package size={16} />
                    Other Products
                    <span className="badge" style={{ fontSize: 10, marginLeft: 4 }}>{otherData.entries?.length || 0}</span>
                </h3>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                    Mementos, Photo Frames, Gifts & other non-printing products
                </p>
                <EntryTable entries={otherData.entries} type="other" />
            </div>
            <SummaryPanel summary={otherData.summary || {}} tabKey="Other" />
        </div>
    );

    // ═══════════════════ RENDER ═══════════════════

    return (
        <div className="stack-lg">
            {/* Opening Balance Prompt Modal */}
            {showOpeningPrompt && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: 560 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.1)', display: 'grid', placeItems: 'center' }}>
                                <IndianRupee size={20} style={{ color: '#2563eb' }} />
                            </div>
                            <div>
                                <h2 className="section-title" style={{ marginBottom: 0 }}>Good Morning!</h2>
                                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Set opening values for today</p>
                            </div>
                        </div>

                        <div className="stack-md" style={{ marginTop: 20 }}>
                            <div className="panel panel--tight" style={{ background: 'var(--surface-2)' }}>
                                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                                    <Wallet size={14} /> CASH OPENING BALANCES
                                </h4>
                                <div className="stack-sm">
                                    {TABS.map(tab => (
                                        <div key={tab.key} className="row gap-md items-center">
                                            <div style={{ width: 80, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: 3, background: tab.color }} />
                                                {tab.label}
                                            </div>
                                            <input type="number" className="input-field"
                                                value={promptBalances[tab.key]}
                                                onChange={(e) => setPromptBalances(prev => ({ ...prev, [tab.key]: e.target.value }))}
                                                placeholder="₹ 0.00" step="0.01" style={{ flex: 1 }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {promptMachines.length > 0 && (
                                <div className="panel panel--tight" style={{ background: 'var(--surface-2)' }}>
                                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
                                        <Monitor size={14} /> MACHINE OPENING COUNTS
                                    </h4>
                                    <div className="stack-sm">
                                        {promptMachines.map((m, idx) => (
                                            <div key={m.id} className="row gap-md items-center">
                                                <div style={{ flex: 1, minWidth: 120 }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.machine_name}</div>
                                                    {m.location && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.location}</div>}
                                                </div>
                                                <input type="number" className="input-field"
                                                    value={m.opening_count}
                                                    onChange={(e) => {
                                                        const updated = [...promptMachines];
                                                        updated[idx].opening_count = e.target.value;
                                                        setPromptMachines(updated);
                                                    }}
                                                    placeholder="Counter reading" style={{ width: 140 }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="row gap-sm justify-end" style={{ marginTop: 20 }}>
                            <button className="btn btn-ghost" onClick={() => { setShowOpeningPrompt(false); setPromptDone(true); }}>
                                Skip for now
                            </button>
                            <button className="btn btn-primary" onClick={handleSavePrompt} disabled={savingPrompt}>
                                <Check size={16} /> {savingPrompt ? 'Saving...' : 'Save & Continue'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change Request Modal */}
            {showChangeRequest && (
                <div className="modal-backdrop">
                    <div className="modal" style={{ maxWidth: 440 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(179,107,0,0.1)', display: 'grid', placeItems: 'center' }}>
                                    <Send size={16} style={{ color: 'var(--warning)' }} />
                                </div>
                                <div>
                                    <h2 className="section-title" style={{ marginBottom: 0, fontSize: 18 }}>Request Change</h2>
                                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                                        {showChangeRequest.type === 'balance'
                                            ? `Opening balance — ${showChangeRequest.bookType} book`
                                            : `Opening count — ${showChangeRequest.machineName || 'Machine'}`}
                                    </p>
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowChangeRequest(null)} style={{ padding: 6 }}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="stack-md">
                            <div>
                                <label className="label">Current Value</label>
                                <input type="text" className="input-field" disabled
                                    value={showChangeRequest.type === 'balance' ? formatCurrency(showChangeRequest.currentValue) : showChangeRequest.currentValue}
                                    style={{ opacity: 0.6 }}
                                />
                            </div>
                            <div>
                                <label className="label">New Value</label>
                                <input type="number" className="input-field" autoFocus
                                    value={changeRequestValue}
                                    onChange={(e) => setChangeRequestValue(e.target.value)}
                                    placeholder={showChangeRequest.type === 'balance' ? '₹ 0.00' : 'Counter reading'}
                                    step={showChangeRequest.type === 'balance' ? '0.01' : '1'}
                                />
                            </div>
                            <div>
                                <label className="label">Reason (optional)</label>
                                <textarea className="input-field" rows="2"
                                    value={changeRequestNote}
                                    onChange={(e) => setChangeRequestNote(e.target.value)}
                                    placeholder="Why do you need this change?"
                                />
                            </div>
                        </div>

                        <div className="row gap-sm justify-end" style={{ marginTop: 16 }}>
                            <button className="btn btn-ghost" onClick={() => setShowChangeRequest(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={submitChangeRequest} disabled={submittingRequest || !changeRequestValue}>
                                <Send size={14} /> {submittingRequest ? 'Submitting...' : 'Submit Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="dr-header">
                <div className="dr-title-row">
                    <div className="dr-icon-circle" style={{ background: currentTabMeta.bg }}>
                        <BarChart3 size={22} style={{ color: currentTabMeta.color }} />
                    </div>
                    <div>
                        <h1 className="section-title" style={{ marginBottom: 2 }}>Daily Report</h1>
                        <p style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            Live cash book — auto-synced
                            {isAdmin && branchName && (
                                <span className="badge badge--info" style={{ fontSize: 10 }}>{branchName}</span>
                            )}
                            {lastRefresh && (
                                <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <Clock size={10} /> {formatTime(lastRefresh)}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="dr-controls">
                    {isAdmin && branches.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Building2 size={15} style={{ color: 'var(--muted)' }} />
                            <select className="input-field" value={selectedBranch || ''}
                                onChange={(e) => setSelectedBranch(Number(e.target.value))}
                                style={{ width: 170, padding: '8px 12px', fontSize: 13 }}
                            >
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Calendar size={15} style={{ color: 'var(--muted)' }} />
                        <input type="date" className="input-field" value={reportDate}
                            onChange={(e) => setReportDate(e.target.value)}
                            style={{ width: 160, padding: '8px 12px', fontSize: 13 }}
                        />
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={manualRefresh} disabled={loading} title="Refresh">
                        <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={generatePDF} title="Download PDF" style={{ gap: 4 }}>
                        <FileText size={15} /> PDF
                    </button>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="dr-tab-bar">
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    const TabIcon = tab.icon;
                    return (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`dr-tab ${isActive ? 'dr-tab--active' : ''}`}
                            style={isActive ? { borderLeft: `3px solid ${tab.color}` } : {}}
                        >
                            <TabIcon size={15} style={{ color: isActive ? tab.color : undefined }} />
                            {tab.label}
                            {tab.key === 'Offset' && liveCounts?.offset && (
                                <span className="dr-tab__badge" style={{ background: isActive ? `${tab.color}15` : 'var(--accent-soft)', color: isActive ? tab.color : 'var(--muted)' }}>
                                    {liveCounts.offset.income_count}
                                </span>
                            )}
                            {tab.key === 'Laser' && liveCounts?.laser && (
                                <span className="dr-tab__badge" style={{ background: isActive ? `${tab.color}15` : 'var(--accent-soft)', color: isActive ? tab.color : 'var(--muted)' }}>
                                    {formatNum(liveCounts.laser.total_copies)}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    <RefreshCw size={28} className="spin" style={{ color: currentTabMeta.color }} />
                    <p style={{ marginTop: 10, color: 'var(--muted)', fontSize: 13 }}>Loading report...</p>
                </div>
            ) : (
                <>
                    {activeTab === 'Offset' && <OffsetTab />}
                    {activeTab === 'Laser' && <LaserTab />}
                    {activeTab === 'Other' && <OtherTab />}
                </>
            )}

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <RefreshCw size={10} /> Auto-refreshes every 30s
            </div>
        </div>
    );
};

export default DailyReport;

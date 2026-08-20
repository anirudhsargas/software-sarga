import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import usePolling from '../hooks/usePolling';
import {
    BookOpen, Printer, Package, RefreshCw, TrendingUp, TrendingDown,
    Monitor, Hash, Building2, Check, Edit3, Lock, Send, FileText, Plus, Trash2,
    Calendar, Clock, ArrowUpRight, ArrowDownRight, X, Wallet, CreditCard,
    ChevronRight, ChevronLeft, BarChart3, Users, Sunrise, User, Phone
} from 'lucide-react';

const PDFExport = lazyWithRetry(() => import('./DailyReportPDFExport'));
import api from '../services/api';
import auth from '../services/auth';
import offlineDb from '../services/offlineDb';
import { serverToday, serverNow } from '../services/serverTime';
import toast from 'react-hot-toast';
import { formatCurrencyDecimal } from '../constants';
import SkeletonLoader from '../components/SkeletonLoader';
import BranchSelect from '../components/ui/BranchSelect';
import './DailyReport.css';
import PageContainer from '../components/ui/PageContainer';
import NoInternetState from '../components/NoInternetState';
import OpeningSetupModal from '../components/OpeningSetupModal';

const TABS = [
    { key: 'Offset', label: 'Offset', icon: BookOpen, color: 'var(--accent)', bg: 'var(--surface-2)' },
    { key: 'Laser', label: 'Laser', icon: Printer, color: 'var(--accent)', bg: 'var(--surface-2)' },
    { key: 'Other', label: 'Other', icon: Package, color: 'var(--text)', bg: 'var(--surface-2)' },
    { key: 'Attendance', label: 'Attendance', icon: Users, color: 'var(--warning)', bg: 'var(--warning-bg)' }
];

const AUTO_REFRESH_INTERVAL = 30000;

const normalizeBookType = (value) => {
    if (value === 'Laser' || value === 'Other' || value === 'Offset') return value;
    return 'Offset';
};

const normalizeReportDate = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    if (typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
    try {
        return new Date(value).toISOString().slice(0, 10);
    } catch {
        return '';
    }
};

const toPendingEntry = (bill, tab) => {
    const lines = Array.isArray(bill.orderLines || bill.order_lines) ? (bill.orderLines || bill.order_lines) : [];
    const method = bill.paymentMethod || bill.payment_method || 'Cash';
    const cashAmt = Number(bill.cashAmount ?? bill.cash_amount ?? 0);
    const upiAmt = Number(bill.upiAmount ?? bill.upi_amount ?? 0);
    const advPaid = bill.advancePaid != null ? Number(bill.advancePaid) : (bill.advance_paid != null ? Number(bill.advance_paid) : 0);
    let cashIn = 0;
    let upiIn = 0;
    if (method === 'Both') {
        cashIn = cashAmt;
        upiIn = upiAmt;
    } else if (method === 'UPI') {
        upiIn = advPaid;
    } else {
        cashIn = advPaid;
    }

    const wastePrints = lines.reduce((sum, line) => sum + (Number(line.waste_prints) || 0), 0);
    const proofPrints = lines.reduce((sum, line) => sum + (Number(line.proof_prints) || 0), 0);
    const details = lines.map(line => line.product_name || line.job_name || line.description || '').filter(Boolean).join(', ');

    return {
        id: `local-bill-${bill.id}`,
        type: tab === 'Laser' ? 'billing' : 'income',
        description: bill.customer_name || bill.customerName || 'Walk-in',
        details: details || bill.description || 'Pending local sync',
        machine_name: tab === 'Laser' ? 'Pending sync' : undefined,
        copies: 0,
        payment_method: method,
        cash_amount: cashIn,
        upi_amount: upiIn,
        total: advPaid,
        time: bill.createdAt || bill.created_at || bill.paymentDate || bill.payment_date,
        waste_prints: wastePrints,
        proof_prints: proofPrints,
        discount_percent: Number(bill.discountPercent ?? bill.discount_percent) || 0,
        discount_amount: Number(bill.discountAmount ?? bill.discount_amount) || 0,
        order_lines: lines.map(line => ({
            name: line.product_name || line.job_name || line.description || 'Item',
            qty: Number(line.quantity) || 1,
            amount: Number(line.total_amount || 0),
            waste_prints: Number(line.waste_prints) || 0,
            proof_prints: Number(line.proof_prints) || 0
        })),
        is_local_pending: true
    };
};

const mergePendingEntries = (tab, data, pendingEntries) => {
    if (!pendingEntries.length) return data;

    const totalCashIn = pendingEntries.reduce((sum, entry) => sum + (Number(entry.cash_amount) || 0), 0);
    const totalUpiIn = pendingEntries.reduce((sum, entry) => sum + (Number(entry.upi_amount) || 0), 0);
    const totalWastePrints = pendingEntries.reduce((sum, entry) => sum + (Number(entry.waste_prints) || 0), 0);
    const totalProofPrints = pendingEntries.reduce((sum, entry) => sum + (Number(entry.proof_prints) || 0), 0);
    const summary = { ...(data.summary || {}) };

    summary.total_cash_in = (Number(summary.total_cash_in) || 0) + totalCashIn;
    summary.total_upi_in = (Number(summary.total_upi_in) || 0) + totalUpiIn;
    summary.waste_prints = (Number(summary.waste_prints) || 0) + totalWastePrints;
    summary.proof_prints = (Number(summary.proof_prints) || 0) + totalProofPrints;
    summary.entry_count = (Number(summary.entry_count) || 0) + pendingEntries.length;
    summary.cash_closing = (Number(summary.cash_closing) || 0) + totalCashIn;

    if (tab === 'Offset') {
        summary.income_count = (Number(summary.income_count) || 0) + pendingEntries.length;
    }

    return {
        ...data,
        entries: [...pendingEntries, ...(data.entries || [])].sort((a, b) => new Date(b.time) - new Date(a.time)),
        summary
    };
};

const mergePendingLiveCounts = (liveCounts, pendingByTab) => {
    const pendingOffset = pendingByTab.Offset || [];
    const pendingLaser = pendingByTab.Laser || [];
    const pendingOther = pendingByTab.Other || [];

    return {
        ...liveCounts,
        offset: liveCounts?.offset ? {
            ...liveCounts.offset,
            income_count: (Number(liveCounts.offset.income_count) || 0) + pendingOffset.length,
            total_collected: (Number(liveCounts.offset.total_collected) || 0) + pendingOffset.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0),
            total_cash_in: (Number(liveCounts.offset.total_cash_in) || 0) + pendingOffset.reduce((sum, entry) => sum + (Number(entry.cash_amount) || 0), 0),
            total_upi_in: (Number(liveCounts.offset.total_upi_in) || 0) + pendingOffset.reduce((sum, entry) => sum + (Number(entry.upi_amount) || 0), 0)
        } : liveCounts?.offset,
        laser: liveCounts?.laser ? {
            ...liveCounts.laser,
            income_count: (Number(liveCounts.laser.income_count) || 0) + pendingLaser.length,
            total_collected: (Number(liveCounts.laser.total_collected) || 0) + pendingLaser.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0),
            total_cash_in: (Number(liveCounts.laser.total_cash_in) || 0) + pendingLaser.reduce((sum, entry) => sum + (Number(entry.cash_amount) || 0), 0),
            total_upi_in: (Number(liveCounts.laser.total_upi_in) || 0) + pendingLaser.reduce((sum, entry) => sum + (Number(entry.upi_amount) || 0), 0)
        } : liveCounts?.laser,
        other: liveCounts?.other ? {
            ...liveCounts.other,
            income_count: (Number(liveCounts.other.income_count) || 0) + pendingOther.length,
            total_collected: (Number(liveCounts.other.total_collected) || 0) + pendingOther.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0)
        } : liveCounts?.other
    };
};

const DailyReport = () => {
    useSEO('Daily Report');

    const [activeTab, setActiveTab] = useState('Offset');
    const [reportDate, setReportDate] = useState(serverToday());
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    const [openingBalances, setOpeningBalances] = useState({ Offset: 0, Laser: 0, Other: 0 });
    const [lockedBalances, setLockedBalances] = useState({ Offset: false, Laser: false, Other: false });
    const [, setEditingBalance] = useState(null);
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
    const [promptBalances, setPromptBalances] = useState({});
    const [promptMachines, setPromptMachines] = useState([]);
    const [promptDone, setPromptDone] = useState(false);
    const [prevClosing, setPrevClosing] = useState({ Offset: 0, Laser: 0, Other: 0 });
    const [_myBooks, setMyBooks] = useState([]);

    // Tab data
    const [offsetData, setOffsetData] = useState({ entries: [], summary: {} });
    const [laserData, setLaserData] = useState({ machines: [], entries: [], summary: {} });
    const [otherData, setOtherData] = useState({ entries: [], summary: {} });
    const [liveCounts, setLiveCounts] = useState(null);
    const [attendanceData, setAttendanceData] = useState(null);
    const [attendanceLoading, setAttendanceLoading] = useState(false);
    const [creditTransactions, setCreditTransactions] = useState([]);
    const [laserCredits, setLaserCredits] = useState([]);
    const [otherCredits, setOtherCredits] = useState([]);
    const [showCreditModal, setShowCreditModal] = useState(false);
    const [creditModalData, setCreditModalData] = useState({
        book_type: 'Offset',
        transaction_type: 'Credit Out',
        customer_name: '',
        customer_phone: '',
        amount: '',
        remarks: ''
    });
    const [tabErrors, setTabErrors] = useState({ Offset: null, Laser: null, Other: null });


    // Machine editing
    const [editingMachine, setEditingMachine] = useState(null);
    const [machineReadingTemp, setMachineReadingTemp] = useState({ opening_count: '', closing_count: '', waste_prints: '', proof_prints: '' });

    const [lastRefresh, setLastRefresh] = useState(null);

    const user = auth.getUser();
    const isAdmin = user.role === 'Admin';
    const isAccountant = user.role === 'Accountant';
    const isFrontOffice = user.role === 'Front Office';
    const canViewAllBranches = isAdmin || isAccountant;
    const canEditBalance = isFrontOffice || isAdmin;

    const branchParam = canViewAllBranches && selectedBranch ? { branch_id: selectedBranch } : {};

    const formatCurrency = formatCurrencyDecimal;
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

    const getPendingEntriesForTab = useCallback(async (tab) => {
        const bills = await offlineDb.getAllBills();
        return bills
            .filter(bill => (bill.status || bill.syncStatus) !== 'synced')
            .filter(bill => normalizeReportDate(bill.paymentDate || bill.payment_date) === reportDate)
            .filter(bill => normalizeBookType(bill.book_type || bill.bookType) === tab)
            .filter(bill => {
                if (!selectedBranch) return true;
                const branchId = bill.branch_id || bill.branchId || null;
                return branchId == null || Number(branchId) === Number(selectedBranch);
            })
            .map(bill => toPendingEntry(bill, tab));
    }, [reportDate, selectedBranch]);

    const currentTabMeta = TABS.find(t => t.key === activeTab);
    const branchName = branches.find(b => b.id === selectedBranch)?.name || '';

    // ─── Fetch Branches (Admin & Accountant) ────────────────────────────
    useEffect(() => {
        if (!canViewAllBranches) return;
        (async () => {
            try {
                const res = await api.get('/branches');
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
                // Fetch which cash books this staff is assigned to
                let assignedBooks = [];
                try {
                    const booksRes = await api.get('/machines/my-books');
                    assignedBooks = booksRes.data || [];
                } catch { assignedBooks = []; }
                setMyBooks(assignedBooks);

            const res = await api.get('/daily-report/opening-balance', { params: { date: reportDate, ...branchParam } });
                const data = res.data;
                const balances = data.balances || data;
                const locked = data.locked || {};
                const relevantBooks = assignedBooks.length > 0 ? assignedBooks : [];
                const anyEntered = relevantBooks.some(b => Number(balances[b]) > 0);
                const anyLocked = relevantBooks.some(b => locked[b]);

                // Fetch assigned machines + their today reading status via laser-live
                // (authoritative source — has_reading is set per machine for the requested date)
                let myMachines = [];
                let machineHasReading = {}; // { machine_id: true/false }
                try {
                    const laserRes = await api.get('/daily-report/laser-live', { params: { date: reportDate, ...branchParam } });
                    myMachines = laserRes.data.machines || [];
                    myMachines.forEach(m => { machineHasReading[m.id] = !!m.has_reading; });
                } catch {  }

                if (!promptDone) {
                    let prevData = { Offset: 0, Laser: 0, Other: 0, machines: {} };
                    try {
                        const prevRes = await api.get('/daily-report/previous-closing', { params: { date: reportDate, ...branchParam } });
                        prevData = prevRes.data;
                    } catch {  }

                    const unenteredMachines = myMachines.filter(m => !machineHasReading[m.id]);

                    const needsBalances = relevantBooks.length > 0 && !anyEntered && !anyLocked;
                    const needsMachines = unenteredMachines.length > 0;

                    if (needsBalances || needsMachines) {
                        setPrevClosing({ Offset: prevData.Offset || 0, Laser: prevData.Laser || 0, Other: prevData.Other || 0 });
                        const machines = unenteredMachines.map(m => ({
                            id: m.id, machine_name: m.machine_name, location: m.location,
                            opening_count: prevData.machines?.[m.id] !== undefined ? String(prevData.machines[m.id]) : ''
                        }));
                        setPromptMachines(machines);
                        const newBalances = {};
                        relevantBooks.forEach(b => {
                            newBalances[b] = prevData[b] > 0 ? String(prevData[b]) : '';
                        });
                        setPromptBalances(newBalances);
                        setShowOpeningPrompt(true);
                    }
                }
            } catch (err) { console.error('Error checking opening balance:', err); }
        })();
    }, [reportDate]);


    const triggerOpeningSetup = useCallback(async () => {
        try {
            let assignedBooks = [];
            try {
                const booksRes = await api.get('/machines/my-books');
                assignedBooks = booksRes.data || [];
            } catch {
                assignedBooks = ['Offset', 'Laser', 'Other'];
            }
            if (assignedBooks.length === 0) {
                assignedBooks = ['Offset', 'Laser', 'Other'];
            }

            const balRes = await api.get('/daily-report/opening-balance', { params: { date: reportDate, ...branchParam } });
            const currentBalances = balRes.data.balances || balRes.data || {};

            let myMachines = [];
            try {
                const laserRes = await api.get('/daily-report/laser-live', { params: { date: reportDate, ...branchParam } });
                myMachines = laserRes.data.machines || [];
            } catch {}

            let prevData = { Offset: 0, Laser: 0, Other: 0, machines: {} };
            try {
                const prevRes = await api.get('/daily-report/previous-closing', { params: { date: reportDate, ...branchParam } });
                prevData = prevRes.data;
            } catch {}

            setPrevClosing({ Offset: prevData.Offset || 0, Laser: prevData.Laser || 0, Other: prevData.Other || 0 });

            const machines = myMachines.map(m => {
                let count = '';
                if (m.has_reading) {
                    count = String(m.opening_count);
                } else if (prevData.machines?.[m.id] !== undefined) {
                    count = String(prevData.machines[m.id]);
                }
                return {
                    id: m.id,
                    machine_name: m.machine_name,
                    location: m.location,
                    opening_count: count
                };
            });
            setPromptMachines(machines);

            const newBalances = {};
            assignedBooks.forEach(b => {
                if (Number(currentBalances[b]) > 0) {
                    newBalances[b] = String(currentBalances[b]);
                } else {
                    newBalances[b] = prevData[b] > 0 ? String(prevData[b]) : '';
                }
            });
            setPromptBalances(newBalances);
            setShowOpeningPrompt(true);
        } catch (err) {
            console.error('Error triggering opening setup:', err);
            toast.error('Failed to load opening setup data');
        }
    }, [reportDate, selectedBranch, branchParam]);

    // ─── Fetch Opening Balances ─────────────────────────────────
    const fetchOpeningBalances = useCallback(async () => {
        try {
            const res = await api.get('/daily-report/opening-balance', { params: { date: reportDate, ...branchParam } });
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
            });
            setOpeningBalances(prev => ({ ...prev, [bookType]: parseFloat(value) || 0 }));
            if (res.data.is_locked) setLockedBalances(prev => ({ ...prev, [bookType]: true }));
            setEditingBalance(null);
            loadTabData(bookType);
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.is_locked) {
                toast.success('This balance is locked. Please submit a change request to Admin.');
                setLockedBalances(prev => ({ ...prev, [bookType]: true }));
            } else {
                console.error('Error saving opening balance:', err);
                toast.error('Failed to save opening balance');
            }
            setEditingBalance(null);
        }
    };

    // ─── Save Machine Reading ───────────────────────────────────
    const saveMachineReading = async (machineId) => {
        // Find previous closing count for this machine
        const machine = laserData.machines.find(m => m.id === machineId);
        const prevClosing = machine?.prev_closing_count !== undefined ? Number(machine.prev_closing_count) : null;
        const enteredOpening = parseInt(machineReadingTemp.opening_count) || 0;
        if (prevClosing !== null && enteredOpening < prevClosing && !isAdmin) {
            toast.error(`Opening count cannot be less than previous closing count (${prevClosing})`);
            return;
        }
        try {
            await api.post(`/machines/${machineId}/readings`, {
                reading_date: reportDate,
                opening_count: enteredOpening,
                closing_count: machineReadingTemp.closing_count !== '' ? parseInt(machineReadingTemp.closing_count) : null,
                waste_prints: machineReadingTemp.waste_prints !== '' ? parseInt(machineReadingTemp.waste_prints) : 0,
                proof_prints: machineReadingTemp.proof_prints !== '' ? parseInt(machineReadingTemp.proof_prints) : 0
            });
            setEditingMachine(null);
            loadTabData('Laser');
        } catch (err) {
            if (err.response?.status === 403 && err.response?.data?.is_locked) {
                toast.success('Opening count is locked. You can still update the closing count, or submit a change request.');
            } else if (err.response?.status === 400 && err.response?.data?.min_opening_count !== undefined) {
                toast.error(err.response.data.error);
            } else {
                console.error('Error saving machine reading:', err);
                toast.error('Failed to save machine reading');
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
            });
            toast.success('Change request submitted! Admin will review it.');
            setShowChangeRequest(null);
            setChangeRequestValue('');
            setChangeRequestNote('');
        } catch (err) {
            toast.error(err.response?.data?.error || 'Failed to submit change request');
        } finally { setSubmittingRequest(false); }
    };

    // ─── Fetch Attendance Data ──────────────────────────────────
    const fetchAttendanceData = useCallback(async () => {
        setAttendanceLoading(true);
        try {
            const branch = branches.find(b => b.id === selectedBranch);
            let branchQuery = null;
            if (branch) {
                const name = branch.name.toLowerCase();
                // Map to the internal branch slugs used by CCTV system
                if (name.includes('perambra')) branchQuery = 'perambra';
                else if (name.includes('meppayur')) branchQuery = 'meppayur_main';
            }
            
            const res = await api.get('/cctv/attendance/summary', { 
                params: { 
                    date: reportDate,
                    branch: branchQuery
                } 
            });
            setAttendanceData(res.data);
        } catch (err) {
            console.error('Error fetching attendance summary:', err);
        } finally {
            setAttendanceLoading(false);
        }
    }, [reportDate, selectedBranch, branches]);

    const loadTabData = useCallback(async (tab) => {
        if (tab === 'Attendance') {
            fetchAttendanceData();
            return;
        }
        setTabErrors(prev => ({ ...prev, [tab]: null }));
        try {
            const endpoint = tab === 'Offset' ? '/daily-report/offset-live'
                : tab === 'Laser' ? '/daily-report/laser-live' : '/daily-report/other-live';
            const [res, pendingEntries] = await Promise.all([
                api.get(endpoint, { params: { date: reportDate, ...branchParam } }),
                getPendingEntriesForTab(tab)
            ]);
            const mergedData = mergePendingEntries(tab, res.data, pendingEntries);
            if (tab === 'Offset') setOffsetData(mergedData);
            else if (tab === 'Laser') setLaserData(mergedData);
            else setOtherData(mergedData);
        } catch (err) {
            console.error(`Error fetching ${tab} data:`, err);
            setTabErrors(prev => ({ ...prev, [tab]: err.message || 'Failed to load' }));
        }
    }, [reportDate, selectedBranch, branchParam, getPendingEntriesForTab, fetchAttendanceData]);


    const fetchLiveCounts = useCallback(async () => {
        try {
            const [res, pendingOffset, pendingLaser, pendingOther] = await Promise.all([
                api.get('/daily-report/live-counts', { params: { date: reportDate, ...branchParam } }),
                getPendingEntriesForTab('Offset'),
                getPendingEntriesForTab('Laser'),
                getPendingEntriesForTab('Other')
            ]);
            setLiveCounts(mergePendingLiveCounts(res.data, {
                Offset: pendingOffset,
                Laser: pendingLaser,
                Other: pendingOther
            }));
            setLastRefresh(serverNow());
        } catch (err) { console.error('Error fetching live counts:', err); }
    }, [reportDate, selectedBranch, branchParam, getPendingEntriesForTab]);

    

    // ─── Fetch Credit Transactions ──────────────────────────────
    const fetchCreditTransactions = useCallback(async () => {
        try {
            const response = await api.get('/daily-reports/offset', { params: { start_date: reportDate, end_date: reportDate, ...branchParam } });
            if (response.data.length > 0) {
                const detail = await api.get(`/daily-reports/offset/${response.data[0].id}`);
                setCreditTransactions(detail.data.credit_transactions || []);
            } else {
                const liveResp = await api.get('/daily-report/credits', {
                    params: { date: reportDate, book_type: 'Offset', branch_id: selectedBranch }
                });
                setCreditTransactions(liveResp.data || []);
            }
        } catch (err) { console.error('Offset credits fetch fail:', err); }
    }, [reportDate, selectedBranch]);

    const fetchLaserCredits = useCallback(async () => {
        try {
            const res = await api.get('/daily-report/credits', {
                params: { date: reportDate, book_type: 'Laser', branch_id: selectedBranch }
            });
            setLaserCredits(res.data || []);
        } catch (err) { console.error('Laser credits fetch fail:', err); }
    }, [reportDate, selectedBranch]);

    const fetchOtherCredits = useCallback(async () => {
        try {
            const res = await api.get('/daily-report/credits', {
                params: { date: reportDate, book_type: 'Other', branch_id: selectedBranch }
            });
            setOtherCredits(res.data || []);
        } catch (err) { console.error('Other credits fetch fail:', err); }
    }, [reportDate, selectedBranch]);

    const loadAllData = useCallback(async (isInitial = false) => {
        if (isInitial) setInitialLoading(true);
        else setLoading(true);

        try {
            await Promise.all([
                fetchOpeningBalances(),
                loadTabData('Offset'),
                loadTabData('Laser'),
                loadTabData('Other'),
                fetchCreditTransactions(),
                fetchLiveCounts(),
                fetchAttendanceData()
            ]);
        }
        finally {
            setLoading(false);
            setInitialLoading(false);
        }
    }, [fetchOpeningBalances, loadTabData, fetchLiveCounts, fetchCreditTransactions]);

    // ─── Handle Opening Prompt Save/Skip ────────────────────────
    const handleOpeningPromptSave = useCallback(() => {
        setShowOpeningPrompt(false);
        setPromptDone(true);
        loadAllData();
    }, [loadAllData]);

    const handleOpeningPromptSkip = useCallback(() => {
        setShowOpeningPrompt(false);
        setPromptDone(true);
    }, []);

    useEffect(() => {
        if (canViewAllBranches && !selectedBranch) return;
        loadAllData(true);
    }, [reportDate, selectedBranch]);

    // Clear tab data immediately when the branch changes so stale machines/entries
    // from the previously selected branch never appear in the UI or downloaded PDF.
    useEffect(() => {
        setOffsetData({ entries: [], summary: {} });
        setLaserData({ machines: [], entries: [], summary: {} });
        setOtherData({ entries: [], summary: {} });
        setLiveCounts(null);
        setAttendanceData(null);
        setCreditTransactions([]);
        setLaserCredits([]);
        setOtherCredits([]);
    }, [selectedBranch]);

    useEffect(() => {
        if (canViewAllBranches && !selectedBranch) return;
        // Skip if initial load just happened (all data already fetched)
        if (!initialLoading) {
            loadTabData(activeTab);
        }
    }, [activeTab]);

    const pollingEnabled = !(canViewAllBranches && !selectedBranch);
    usePolling(useCallback(() => {
        fetchLiveCounts();
        loadTabData('Offset');
        loadTabData('Laser');
        loadTabData('Other');
        fetchCreditTransactions();
        fetchAttendanceData();
    }, [fetchLiveCounts, loadTabData, fetchAttendanceData, fetchCreditTransactions]), AUTO_REFRESH_INTERVAL, pollingEnabled);

    const _manualRefresh = () => { loadAllData(); };

    // Credit totals for today's quick view
    const creditTotals = React.useMemo(() => (creditTransactions || []).reduce((acc, t) => {
        if (!t) return acc;
        const typ = String(t.transaction_type || '').toLowerCase();
        if (typ.includes('in')) acc.in += Number(t.amount || 0);
        else acc.out += Number(t.amount || 0);
        return acc;
    }, { in: 0, out: 0 }), [creditTransactions]);

    // ─── PDF Export ─────────────────────────────────────────────
    // PDF Export has been moved to DailyReportPDFExport.jsx

    const CreditList = ({ bookKey, credits = [], liveEntries = [] }) => {
        const derived = (liveEntries || []).filter(e => {
            const total = Number(e.total || 0);
            const paid = Number(e.cash_amount || 0) + Number(e.upi_amount || 0);
            return total > 0 && paid === 0;
        });

        const mappedPersisted = (credits || []).map((t, i) => ({
            id: t.id || `c-${i}`,
            type: t.transaction_type || t.type || 'Credit',
            customer: t.customer_name || t.customer || t.description || '—',
            details: t.remarks || t.details || '',
            amount: Number(t.amount || 0),
            reference: t.reference_number || t.reference || '',
            isManual: true
        }));

        const mappedLive = derived.map((e, i) => ({
            id: e.id || `l-${i}`,
            type: 'Credit (Live)',
            customer: e.description || e.customer_name || '—',
            details: e.details || '',
            amount: Number(e.total || 0),
            reference: e.reference || '',
            isManual: false
        }));

        const all = [...mappedPersisted, ...mappedLive];
        const total = all.reduce((s, x) => s + (Number(x.amount) || 0), 0);

        const handleDeleteCredit = async (id) => {
            if (!window.confirm('Are you sure you want to delete this manual credit?')) return;
            try {
                await api.delete(`/daily-report/credits/${id}`);
                toast.success('Credit deleted');
                if (bookKey === 'Offset') fetchCreditTransactions();
                else if (bookKey === 'Laser') fetchLaserCredits();
                else if (bookKey === 'Other') fetchOtherCredits();
            } catch {
                toast.error('Failed to delete credit');
            }
        };

        return (
            <div className="panel">
                <div className="panel-header credit-list-header">
                    <h2 className="panel-title credit-list-title">
                        <CreditCard size={16} /> Credits Outstanding — {bookKey}
                        <span className="badge credit-list-badge">{all.length}</span>
                    </h2>
                </div>

                <div className="credit-summary-bar">
                    <span className="credit-summary-label">Outstanding Balance Tally</span>
                    <span className="credit-summary-value">₹ {formatCurrency(total)}</span>
                </div>

                {all.length === 0 ? (
                    <div className="credit-list-empty">
                        <CreditCard size={24} style={{ opacity: 0.4 }} />
                        <span>No outstanding credits for this book / date.</span>
                    </div>
                ) : (
                    <div className="credit-list-table-container">
                        <table className="data-table credit-list-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Customer / Desc</th>
                                    <th>Details</th>
                                    <th>Amount</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {all.slice(0, 50).map(c => (
                                    <tr key={c.id}>
                                        <td>
                                            <span className={`credit-badge ${c.isManual ? 'credit-badge--manual' : 'credit-badge--live'}`}>
                                                {c.isManual ? 'Manual' : 'Live Billing'}
                                            </span>
                                        </td>
                                        <td>
                                            <div>{c.customer}</div>
                                        </td>
                                        <td>{c.details || c.reference || '—'}</td>
                                        <td>₹ {formatCurrency(c.amount)}</td>
                                        <td>
                                            {c.isManual && (
                                                <button className="btn btn-ghost btn-danger btn-sm" onClick={() => handleDeleteCredit(c.id)} title="Delete manual entry">
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const AttendanceView = () => {
        if ((attendanceLoading || initialLoading) && !attendanceData) {
            return (
                <div className="dr-empty">
                    <RefreshCw className="animate-spin" size={24} />
                    <p>Loading attendance data...</p>
                </div>
            );
        }

        if (!attendanceData || !attendanceData.staff) {
            return (
                <div className="dr-empty">
                    <Users size={24} />
                    <p>No attendance records found for this date/branch</p>
                </div>
            );
        }

        const STATUS_CLASSES = {
            present: 'badge badge--ok',
            absent: 'badge badge--danger',
            left: 'badge badge--info',
            left_early: 'badge badge--warning'
        };

        const { staff: rawStaff = [], alert_count = 0, discrepancy_count = 0 } = attendanceData;

        // If user is Front Office, restrict visible staff to their branch only
        const myBranchId = user?.branch_id;
        const staff = isFrontOffice
            ? (rawStaff || []).filter(s => {
                if (!s) return false;
                if (s.branch_id !== undefined && s.branch_id !== null) {
                    return String(s.branch_id) === String(myBranchId);
                }
                if (s.branch_name && branches && myBranchId) {
                    const myBranch = branches.find(b => String(b.id) === String(myBranchId));
                    if (myBranch && myBranch.name) {
                        const branchName = String(myBranch.name).toLowerCase();
                        const sBranch = String(s.branch_name).toLowerCase();
                        if (sBranch.includes(branchName) || branchName.includes(sBranch)) return true;
                    }
                }
                // If branch information is missing or cannot be matched, show the record
                // to avoid hiding staff who were marked present but lack branch metadata.
                if (!s.branch_name) return true;
                return false;
            })
            : (rawStaff || []);

        const total_staff = staff.length;
        const present = staff.filter(s => {
            if (!s) return false;
            const status = String(s.status || '').toLowerCase();
            return Boolean(s.entry_time) || status === 'present';
        }).length;
        const absent = Math.max(0, total_staff - present);

        return (
            <div className="stack-md">
                {/* Stats Grid */}
                <div className="attendance-stats-grid">
                    <div className="stat-card">
                        <div className="stat-value">{present} / {total_staff}</div>
                        <div className="stat-label">Staff Present</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{absent}</div>
                        <div className="stat-label">Staff Absent</div>
                    </div>
                    {alert_count > 0 && (
                        <div className="stat-card attendance-stat-card--alert">
                            <div className="stat-value attendance-stat-value--alert">{alert_count}</div>
                            <div className="stat-label">Not Arrived (Alert)</div>
                        </div>
                    )}
                    {discrepancy_count > 0 && (
                        <div className="stat-card attendance-stat-card--discrepancy">
                            <div className="stat-value attendance-stat-value--discrepancy">{discrepancy_count}</div>
                            <div className="stat-label">Time Flags</div>
                        </div>
                    )}
                </div>

                {/* Staff Table */}
                <div className="staff-table-container">
                    <table className="data-table staff-table">
                        <thead>
                            <tr>
                                <th>Staff Name</th>
                                <th>Entry</th>
                                <th>Exit</th>
                                <th>Status</th>
                                <th>Logs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {staff.map(s => {
                                const statusKey = String(s.status || '').toLowerCase();
                                const rowKey = s.staff_id || s.id || s.name || Math.random();
                                return (
                                    <tr key={rowKey} className={s?.absent_alert ? 'staff-table tr--alert' : ''}>
                                        <td>
                                            <div className="staff-table-name">{s.name}</div>
                                            <div className="staff-table-branch">{s.branch_name}</div>
                                        </td>
                                        <td>
                                            {s.entry_time ? (
                                                <div className="staff-table-time">
                                                    <Clock size={12} />
                                                    {formatTime(s.entry_time)}
                                                </div>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            {s.exit_time ? (
                                                <div className="staff-table-time">
                                                    <Clock size={12} />
                                                    {formatTime(s.exit_time)}
                                                </div>
                                            ) : '—'}
                                        </td>
                                        <td>
                                            <span className={STATUS_CLASSES[statusKey] || 'badge'}>
                                                {(s.status || '').replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="staff-table-logs">
                                            {s.event_count}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // ═══════════════════ SUB-COMPONENTS ═══════════════════

    const UnifiedCashbookHeader = ({ bookType, summary = {}, liveCounts = null }) => {
        const opening = Number(summary.cash_opening) || 0;
        const totalCashIn = Number(summary.total_cash_in) || 0;
        const totalUpiIn = Number(summary.total_upi_in) || 0;
        const totalIn = totalCashIn + totalUpiIn;
        const totalOut = Number(summary.total_cash_out) || 0;
        const closing = opening + totalIn - totalOut;
        const netChange = totalIn - totalOut;

        const currentValue = openingBalances[bookType] || 0;
        const isLocked = lockedBalances[bookType] && !isAdmin;
        const [localAmount, setLocalAmount] = useState('');
        const [saving, setSaving] = useState(false);
        const [showEdit, setShowEdit] = useState(false);

        const handleSet = async () => {
            if (!localAmount || saving) return;
            setSaving(true);
            try {
                await saveOpeningBalance(bookType, localAmount);
                setShowEdit(false);
                setLocalAmount('');
            } catch (err) {
                // errors handled inside saveOpeningBalance
            } finally {
                setSaving(false);
            }
        };

        const handleEditClick = () => {
            setLocalAmount(String(currentValue));
            setShowEdit(true);
        };

        return (
            <div className={`unified-cashbook-header ${bookType === 'Laser' && liveCounts ? 'has-extra-stats' : ''}`}>
                {/* Hero Balance Card */}
                <div className="balance-card">
                    <div className="balance-card-header">
                        <span className="balance-card-label">Closing Balance</span>
                        <div className="balance-card-icon">
                            <Wallet size={16} />
                        </div>
                    </div>
                    
                    <div className="balance-card-value">
                        ₹ {formatCurrency(closing)}
                    </div>

                    {!showEdit ? (
                        <div className="balance-card-opening">
                            <div className="balance-card-opening-label">
                                <Sunrise size={13} />
                                <span>Opening: ₹ {formatCurrency(currentValue)}</span>
                                {isLocked ? (
                                    <span className="badge" style={{ padding: '2px 6px', fontSize: 9, background: 'rgba(245, 158, 11, 0.2)', color: 'var(--warning)', border: '1px solid rgba(245, 158, 11, 0.3)' }} title="Locked">
                                        <Lock size={8} /> Locked
                                    </span>
                                ) : currentValue > 0 ? (
                                    <span className="badge" style={{ padding: '2px 6px', fontSize: 9, background: 'rgba(16, 185, 129, 0.2)', color: 'var(--success)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                        Set
                                    </span>
                                ) : null}
                            </div>
                            
                            <div className="balance-card-opening-value">
                                {canEditBalance && !isLocked && (
                                    <button className="balance-card-btn-inline" onClick={handleEditClick}>
                                        <Edit3 size={10} /> Edit
                                    </button>
                                )}
                                {isLocked && isFrontOffice && (
                                    <button className="balance-card-btn-inline" style={{ color: 'var(--warning)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
                                        onClick={() => { setShowChangeRequest({ type: 'balance', bookType, currentValue }); setChangeRequestValue(String(currentValue)); setChangeRequestNote(''); }}>
                                        <Send size={10} /> Req Change
                                    </button>
                                )}
                                <span className={`net-change-pill ${netChange >= 0 ? 'net-change-pill--positive' : 'net-change-pill--negative'}`}>
                                    {netChange >= 0 ? '+' : ''}₹ {formatCurrency(netChange)}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="balance-card-opening-form">
                            <div className="balance-card-opening-input-wrap">
                                <span className="balance-card-opening-input-prefix">₹</span>
                                <input
                                    type="number"
                                    className="balance-card-opening-input"
                                    placeholder="0.00"
                                    value={localAmount}
                                    onChange={e => setLocalAmount(e.target.value)}
                                    autoFocus
                                    min="0"
                                    step="0.01"
                                />
                            </div>
                            <button
                                className="balance-card-btn-inline submit-btn"
                                onClick={handleSet}
                                disabled={saving || !localAmount}
                            >
                                {saving ? 'Saving...' : 'Set'}
                            </button>
                            <button className="balance-card-btn-inline" onClick={() => setShowEdit(false)} disabled={saving}>
                                Cancel
                            </button>
                        </div>
                    )}
                </div>

                {/* Total Inflow Card */}
                <div className="premium-stat-card premium-stat-card--inflow">
                    <div className="premium-stat-card-header">
                        <span className="premium-stat-card-label">Total Inflow</span>
                        <div className="premium-stat-card-icon">
                            <TrendingUp size={16} />
                        </div>
                    </div>
                    <div className="premium-stat-card-value">
                        ₹ {formatCurrency(totalIn)}
                    </div>
                    <div className="premium-stat-card-footer">
                        <div className="premium-stat-card-footer-item">
                            <span>Cash: ₹ {formatCurrency(totalCashIn)}</span>
                        </div>
                        <span>•</span>
                        <div className="premium-stat-card-footer-item">
                            <span>UPI: ₹ {formatCurrency(totalUpiIn)}</span>
                        </div>
                        {liveCounts && liveCounts.income_count > 0 && (
                            <>
                                <span>•</span>
                                <span className="badge badge--success" style={{ fontSize: 9, padding: '1px 5px' }}>
                                    {liveCounts.income_count} Billings
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Total Outflow Card */}
                <div className="premium-stat-card premium-stat-card--outflow">
                    <div className="premium-stat-card-header">
                        <span className="premium-stat-card-label">Total Outflow</span>
                        <div className="premium-stat-card-icon">
                            <TrendingDown size={16} />
                        </div>
                    </div>
                    <div className="premium-stat-card-value">
                        ₹ {formatCurrency(totalOut)}
                    </div>
                    <div className="premium-stat-card-footer">
                        <span>Expenses & withdrawals</span>
                        {liveCounts && liveCounts.expense_count > 0 && (
                            <>
                                <span>•</span>
                                <span className="badge badge--danger" style={{ fontSize: 9, padding: '1px 5px' }}>
                                    {liveCounts.expense_count} Spent
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Laser Stats Card (only for Laser book) */}
                {bookType === 'Laser' && liveCounts && (
                    <div className="premium-stat-card premium-stat-card--info">
                        <div className="premium-stat-card-header">
                            <span className="premium-stat-card-label">Laser Copies</span>
                            <div className="premium-stat-card-icon">
                                <Printer size={16} />
                            </div>
                        </div>
                        <div className="premium-stat-card-value">
                            {formatNum(liveCounts.total_copies)}
                        </div>
                        <div className="premium-stat-card-footer">
                            <div className="premium-stat-card-footer-item">
                                <Monitor size={12} />
                                <span>{liveCounts.machine_count} Active Machines</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const CashbookAddRow = ({ bookType }) => {
        const [transactionType, setTransactionType] = useState('Credit In');
        const [customerName, setCustomerName] = useState('');
        const [customerPhone, setCustomerPhone] = useState('');
        const [amount, setAmount] = useState('');
        const [remarks, setRemarks] = useState('');
        const [saving, setSaving] = useState(false);

        const handleSubmit = async (e) => {
            if (e) e.preventDefault();
            if (!customerName || !amount || saving) return;
            setSaving(true);
            try {
                await api.post('/daily-report/credits', {
                    date: reportDate,
                    book_type: bookType,
                    transaction_type: transactionType,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    amount: parseFloat(amount),
                    remarks: remarks,
                    branch_id: selectedBranch
                });
                toast.success('Entry added successfully');
                setCustomerName('');
                setCustomerPhone('');
                setAmount('');
                setRemarks('');
                
                if (bookType === 'Offset') fetchCreditTransactions();
                else if (bookType === 'Laser') fetchLaserCredits();
                else if (bookType === 'Other') fetchOtherCredits();
                
                fetchLiveCounts();
            } catch (err) {
                console.error('Error adding credit transaction:', err);
                toast.error(err.response?.data?.error || 'Failed to add entry');
            } finally {
                setSaving(false);
            }
        };

        return (
            <form onSubmit={handleSubmit} className="cashbook-add-row">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Quick Tally Entry:</span>
                        <div className="segmented-control">
                            <button
                                type="button"
                                className={`segmented-control-btn type--credit-in ${transactionType === 'Credit In' ? 'segmented-control-btn--active' : ''}`}
                                onClick={() => setTransactionType('Credit In')}
                                disabled={saving}
                            >
                                <ArrowUpRight size={14} /> Credit In
                            </button>
                            <button
                                type="button"
                                className={`segmented-control-btn type--credit-out ${transactionType === 'Credit Out' ? 'segmented-control-btn--active' : ''}`}
                                onClick={() => setTransactionType('Credit Out')}
                                disabled={saving}
                            >
                                <ArrowDownRight size={14} /> Credit Out
                            </button>
                        </div>
                    </div>
                </div>

                <div className="cashbook-form-grid">
                    <div className="form-group-with-icon">
                        <User size={14} />
                        <input
                            type="text"
                            className="input-field form-input"
                            placeholder="Customer / Description *"
                            value={customerName}
                            onChange={e => setCustomerName(e.target.value)}
                            disabled={saving}
                            required
                        />
                    </div>
                    <div className="form-group-with-icon">
                        <Phone size={14} />
                        <input
                            type="tel"
                            className="input-field form-input"
                            placeholder="Phone (Optional)"
                            value={customerPhone}
                            onChange={e => setCustomerPhone(e.target.value)}
                            disabled={saving}
                        />
                    </div>
                    <div className="form-group-with-icon">
                        <FileText size={14} />
                        <input
                            type="text"
                            className="input-field form-input"
                            placeholder="Remarks / Details (Optional)"
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            disabled={saving}
                        />
                    </div>
                    <div className="cash-amount-input-wrap compact">
                        <span className="currency-prefix small">₹</span>
                        <input
                            type="number"
                            className="cash-amount-input compact"
                            placeholder="0.00 *"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            min="0"
                            step="0.01"
                            disabled={saving}
                            required
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={saving || !customerName || !amount}
                        style={{ height: 38, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                        <Plus size={16} />
                        {saving ? 'Adding...' : 'Add Transaction'}
                    </button>
                </div>
            </form>
        );
    };

    const EntryTable = ({ entries, type = 'offset' }) => {
        const PAGE_SIZE = 50;
        const [page, setPage] = useState(1);
        const [expandedIds, setExpandedIds] = useState(new Set());
        const totalPages = Math.ceil((entries?.length || 0) / PAGE_SIZE);
        const pagedEntries = (entries || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        const toggleExpand = (id) => {
            setExpandedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            });
        };

        if (!entries?.length) {
            if (initialLoading) {
                return <SkeletonLoader type="table" count={6} />;
            }
            return (
                <div className="dr-empty">
                    <div className="dr-empty__icon"><FileText size={22} /></div>
                    <p>No entries yet</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {type === 'laser' ? 'Laser work entries will appear here' : 'Data auto-syncs from billing & expenses'}
                    </p>
                </div>
            );
        }

        const isLaser = type === 'laser';
        const isOther = type === 'other';

        return (
            <div className="entry-table-container">
                {entries.length > PAGE_SIZE && (
                    <div className="entry-table-pagination">
                        <span>
                            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, entries.length)} of {entries.length}
                        </span>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={16} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><ChevronRight size={16} /></button>
                    </div>
                )}
                <table className="data-table entry-table">
                    <thead>
                        <tr>
                            <th style={{ width: '85px' }}>Time</th>
                            <th>{isLaser ? 'Customer / Work' : 'Description'}</th>
                            {isLaser && <th style={{ minWidth: '135px' }}>Machine</th>}
                            {isOther && <th style={{ minWidth: '120px' }}>Category</th>}
                            {isLaser
                                ? <th style={{ width: '70px', textAlign: 'right' }}>Copies</th>
                                : <th style={{ width: '95px' }}>Type</th>
                            }
                            {isLaser && <th style={{ width: '90px' }}>Type</th>}
                            <th style={{ width: '80px' }}>Mode</th>
                            <th style={{ width: '100px', textAlign: 'right' }}>Cash</th>
                            <th style={{ width: '100px', textAlign: 'right' }}>UPI</th>
                            <th style={{ width: '110px', textAlign: 'right' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedEntries.map((entry, i) => {
                            const isExpense = entry.type === 'expense';
                            const isInternal = !!entry.is_internal;
                            const hasLines = entry.order_lines?.length > 1;
                            const isExpanded = expandedIds.has(entry.id);
                            const rawCat = entry.category || entry.category_name || (entry.order_lines && entry.order_lines[0]?.category) || '';
                            const categoryText = (rawCat && isNaN(Number(rawCat)) && rawCat !== 'other category' && rawCat !== 'Other') ? rawCat : 'Other Products';
                            return (
                                <React.Fragment key={`${type}-${entry.id}-${i}`}>
                                    <tr className={hasLines ? 'entry-table tr--clickable' : ''} onClick={hasLines ? () => toggleExpand(entry.id) : undefined} role={hasLines ? "button" : "row"} aria-expanded={hasLines ? expandedIds.has(entry.id) : undefined} tabIndex={hasLines ? 0 : undefined} onKeyDown={hasLines ? (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(entry.id); } } : undefined}>
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            <span className="entry-table-time">
                                                <Clock size={11} /> {formatTime(entry.time)}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="entry-table-description" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isOther ? '220px' : '260px' }}>
                                                {hasLines && (
                                                    <ChevronRight size={14} className={`entry-table-chevron ${isExpanded ? 'entry-table-chevron--expanded' : ''}`} />
                                                )}
                                                <span title={entry.description}>{entry.description}</span>
                                                {hasLines && (
                                                    <span className="badge badge--default entry-table-badge" style={{ padding: '2px 6px', fontSize: 10, marginLeft: 4 }}>{entry.order_lines.length} items</span>
                                                )}
                                                {entry.is_local_pending && (
                                                    <span className="badge badge--warning entry-table-badge" style={{ padding: '2px 6px', fontSize: 10, marginLeft: 4 }}>Pending Sync</span>
                                                )}
                                            </div>
                                            {!hasLines && entry.details && <div className="entry-table-details" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>{entry.details}</div>}
                                            {(entry.waste_prints > 0 || entry.proof_prints > 0) && (
                                                <div className="entry-table-waste-proof">
                                                    {entry.waste_prints > 0 && <span className="entry-table-waste">Waste: {entry.waste_prints}</span>}
                                                    {entry.proof_prints > 0 && <span className="entry-table-proof">Proof: {entry.proof_prints}</span>}
                                                </div>
                                            )}
                                            {entry.discount_amount > 0 && (
                                                <div className="entry-table-discount">
                                                    Discount: {entry.discount_percent > 0 ? `${entry.discount_percent}%` : ''} (-{formatCurrency(entry.discount_amount)})
                                                </div>
                                            )}
                                        </td>
                                        {isLaser && (
                                            <td style={{ minWidth: '135px', maxWidth: '180px' }}>
                                                <div className="entry-table-machine">
                                                    {entry.machine_name || '—'}
                                                </div>
                                            </td>
                                        )}
                                        {isOther && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                <span className="badge badge--info entry-table-category-badge" style={{ fontSize: '11px', padding: '2px 8px', fontWeight: 500, background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary, #6366f1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                                                    {categoryText}
                                                </span>
                                            </td>
                                        )}
                                        {isLaser ? (
                                            <td className="entry-table-copies" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{entry.copies}</td>
                                        ) : (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                <span className={`badge ${isExpense ? 'badge--danger' : 'badge--success'} entry-table-badge`}>
                                                    {isExpense
                                                        ? <><ArrowDownRight size={10} /> Expense</>
                                                        : <><ArrowUpRight size={10} /> Income</>
                                                    }
                                                </span>
                                            </td>
                                        )}
                                        {isLaser && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {isInternal ? (
                                                    <span className="badge entry-table-internal-badge">🏠 Internal</span>
                                                ) : (
                                                    <span className="entry-table-line-qty">—</span>
                                                )}
                                            </td>
                                        )}
                                        <td style={{ whiteSpace: 'nowrap' }}>
                                            {(() => {
                                                const m = (entry.payment_method || 'Cash').toLowerCase();
                                                if (m.includes('upi')) {
                                                    return <span className="payment-badge payment-badge--upi">UPI</span>;
                                                } else if (m.includes('cash')) {
                                                    return <span className="payment-badge payment-badge--cash">Cash</span>;
                                                } else {
                                                    return <span className="payment-badge payment-badge--mixed">{entry.payment_method || 'Cash'}</span>;
                                                }
                                            })()}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} className={`entry-table-amount ${isExpense ? 'entry-table-amount--expense' : 'entry-table-amount--income'}`}>
                                            {isExpense ? '-' : '+'}{formatCurrency(entry.cash_amount)}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }} className={`entry-table-amount ${isExpense ? 'entry-table-amount--expense' : 'entry-table-amount--income'}`}>
                                            {isExpense ? '-' : '+'}{formatCurrency(entry.upi_amount)}
                                        </td>
                                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 700 }} className="entry-table-total">
                                            {isExpense ? '-' : ''}{formatCurrency(entry.total)}
                                        </td>
                                    </tr>
                                    {hasLines && isExpanded && entry.order_lines.map((line, li) => (
                                        <tr key={`${entry.id}-line-${li}`} className="entry-table-row--expanded">
                                            <td></td>
                                            <td colSpan={isLaser ? 3 : 2} className="entry-table-row-expanded-content">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span className="entry-table-line-name">{line.name || 'Item'}</span>
                                                    {line.qty > 1 && <span className="entry-table-line-qty">×{line.qty}</span>}
                                                    {(line.waste_prints > 0 || line.proof_prints > 0) && (
                                                        <span className="entry-table-line-waste-proof">
                                                            {line.waste_prints > 0 && <span className="entry-table-line-waste">Waste:{line.waste_prints} </span>}
                                                            {line.proof_prints > 0 && <span className="entry-table-line-proof">Proof:{line.proof_prints}</span>}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td></td>
                                            <td></td>
                                            <td></td>
                                            <td className="entry-table-line-amount">
                                                {formatCurrency(line.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };



    const StatRow = ({ items }) => (
        <div className="row gap-md stat-row">
            {items.map((item, i) => (
                <div key={i} className="stat-card" style={{flex: '1 1 140px', minWidth: 0}}>
                    <div className="stat-row-icon">
                        {item.icon && <item.icon size={16} />}
                    </div>
                    <div className="stat-value">{item.value}</div>
                    <div className="stat-label">{item.label}</div>
                </div>
            ))}
        </div>
    );

    const MachineSection = () => {
        if ((loading || initialLoading) && !laserData.machines?.length) {
            return (
                <div className="panel machine-loading">
                    <RefreshCw size={24} className="spin machine-loading-icon" />
                    <p className="machine-loading-text">Fetching machines...</p>
                </div>
            );
        }

        if (tabErrors.Laser) {
            return (
                <NoInternetState
                    variant="inline"
                    title="Connection Error"
                    message={tabErrors.Laser}
                    actionLabel="Retry"
                    onRetry={() => loadTabData('Laser')}
                />
            );
        }

        if (!laserData.machines?.length) return (

            <div className="panel">
                <h2 className="panel-title machine-panel-title">
                    <Monitor size={16} /> Machines
                </h2>
                <div className="dr-empty">
                    <div className="dr-empty__icon"><Monitor size={22} /></div>
                    <p className="machine-empty-text">No active Digital machines</p>
                </div>
            </div>
        );

        return (
            <div className="panel">
                <h2 className="panel-title machine-panel-title machine-panel-title--active">
                    <Monitor size={16} />
                    Machines
                    <span className="badge badge--info panel-title-badge">{laserData.machines.length} active</span>
                </h2>
                <div className="stack-sm">
                    {laserData.machines.map(m => {
                        const isEditingThis = editingMachine === m.id;
                        return (
                            <div key={m.id} className="dr-machine-card">
                                <div className="machine-card-info">
                                    <div className="machine-card-name">{m.machine_name}</div>
                                    {m.location && <div className="machine-card-location">{m.location}</div>}
                                </div>

                                {isEditingThis ? (
                                    <div className="row gap-sm items-end machine-edit-row">
                                        <div className="stack-xs">
                                            <label className="machine-edit-label">
                                                Opening
                                                {m.has_reading && !isAdmin && <Lock size={9} className="machine-edit-label-lock" />}
                                            </label>
                                            <input type="number" className={`input-field machine-edit-input ${m.has_reading && !isAdmin ? 'machine-edit-input--locked' : ''}`}
                                                value={machineReadingTemp.opening_count}
                                                onChange={(e) => setMachineReadingTemp(prev => ({ ...prev, opening_count: e.target.value }))}
                                                autoFocus={!m.has_reading || isAdmin}
                                                disabled={m.has_reading && !isAdmin}
                                            />
                                        </div>
                                        <div className="stack-xs">
                                            <label className="machine-edit-label">Closing</label>
                                            <input type="number" className="input-field machine-edit-input"
                                                value={machineReadingTemp.closing_count}
                                                onChange={(e) => setMachineReadingTemp(prev => ({ ...prev, closing_count: e.target.value }))}
                                                placeholder="Optional"
                                                autoFocus={m.has_reading && !isAdmin}
                                            />
                                        </div>
                                        <div className="stack-xs">
                                            <label className="machine-edit-label machine-edit-label--waste">Waste</label>
                                            <input type="number" className={`input-field machine-edit-input machine-edit-input--small ${machineReadingTemp.waste_prints ? 'machine-edit-input--waste' : ''}`} min="0"
                                                value={machineReadingTemp.waste_prints}
                                                onChange={(e) => setMachineReadingTemp(prev => ({ ...prev, waste_prints: e.target.value }))}
                                                placeholder="0"
                                            />
                                        </div>
                                        <div className="stack-xs">
                                            <label className="machine-edit-label machine-edit-label--proof">Proof</label>
                                            <input type="number" className={`input-field machine-edit-input machine-edit-input--small ${machineReadingTemp.proof_prints ? 'machine-edit-input--proof' : ''}`} min="0"
                                                value={machineReadingTemp.proof_prints}
                                                onChange={(e) => setMachineReadingTemp(prev => ({ ...prev, proof_prints: e.target.value }))}
                                                placeholder="0"
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
                                    <div className="row gap-lg items-center machine-view-row">
                                        <div className="dr-machine-stat">
                                            <div className="dr-machine-stat__label">Opening</div>
                                            <div className="dr-machine-stat__value">
                                                {m.has_reading ? formatNum(m.opening_count) : '—'}
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="machine-view-chevron" />
                                        <div className="dr-machine-stat">
                                            <div className="dr-machine-stat__label">Current</div>
                                            <div className="dr-machine-stat__value machine-stat-value--primary">
                                                {m.closing_count !== null ? formatNum(m.closing_count) : '—'}
                                            </div>
                                        </div>
                                        <div className="dr-machine-stat machine-stat--today">
                                            <div className="dr-machine-stat__label">Today</div>
                                            <div className="dr-machine-stat__value machine-stat-value--today">
                                                {formatNum(m.today_copies)}
                                            </div>
                                        </div>
                                        {(m.waste_prints > 0 || m.proof_prints > 0) && (
                                            <div className="dr-machine-stat machine-stat--waste">
                                                <div className="dr-machine-stat__label machine-stat-label--waste">Waste</div>
                                                <div className="dr-machine-stat__value machine-stat-value--waste">
                                                    {formatNum(m.waste_prints || 0)}
                                                </div>
                                                {m.billing_waste > 0 && (
                                                    <div className="machine-stat-billing-note">
                                                        incl. {formatNum(m.billing_waste)} from billing
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {(m.proof_prints > 0) && (
                                            <div className="dr-machine-stat machine-stat--proof">
                                                <div className="dr-machine-stat__label machine-stat-label--proof">Proof</div>
                                                <div className="dr-machine-stat__value machine-stat-value--proof">
                                                    {formatNum(m.proof_prints || 0)}
                                                </div>
                                                {m.billing_proof > 0 && (
                                                    <div className="machine-stat-billing-note--proof">
                                                        incl. {formatNum(m.billing_proof)} from billing
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {canEditBalance && (
                                            <button className="btn btn-ghost btn-sm"
                                                onClick={() => {
                                                    setEditingMachine(m.id);
                                                    setMachineReadingTemp({
                                                        opening_count: m.has_reading ? String(m.opening_count) : '',
                                                        closing_count: m.closing_count !== null ? String(m.closing_count) : '',
                                                        waste_prints: m.waste_prints != null ? String(m.waste_prints) : '',
                                                        proof_prints: m.proof_prints != null ? String(m.proof_prints) : ''
                                                    });
                                                }}
                                                title={m.has_reading && !isAdmin ? 'Edit closing count (opening locked)' : 'Edit machine counts'}
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                        )}
                                        {m.has_reading && isFrontOffice && (
                                            <button className="btn btn-ghost btn-sm machine-request-btn"
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
    const renderCashbookSummaryStrip = (summary) => {
        const totalIn = (Number(summary.total_cash_in) || 0) + (Number(summary.total_upi_in) || 0);
        const totalOut = Number(summary.total_cash_out) || 0;
        const opening = Number(summary.cash_opening) || 0;
        const closing = opening + totalIn - totalOut;
        return (
            <div className="dr-summary-cards">
                <div className="dr-summary-card dr-summary-card--income">
                    <div className="dr-summary-card__header">
                        <span className="dr-summary-card__label">Total Inflow</span>
                        <div className="dr-summary-card__icon">
                            <ArrowUpRight size={16} />
                        </div>
                    </div>
                    <div className="dr-summary-card__value">₹ {formatCurrency(totalIn)}</div>
                    <div className="dr-summary-card__footer">
                        <span>Cash: ₹ {formatCurrency(summary.total_cash_in || 0)}</span>
                        <span>•</span>
                        <span>UPI: ₹ {formatCurrency(summary.total_upi_in || 0)}</span>
                    </div>
                </div>
                <div className="dr-summary-card dr-summary-card--expense">
                    <div className="dr-summary-card__header">
                        <span className="dr-summary-card__label">Total Outflow</span>
                        <div className="dr-summary-card__icon">
                            <ArrowDownRight size={16} />
                        </div>
                    </div>
                    <div className="dr-summary-card__value">₹ {formatCurrency(totalOut)}</div>
                    <div className="dr-summary-card__footer">
                        <span>Expenses & withdrawals</span>
                    </div>
                </div>
                <div className="dr-summary-card dr-summary-card--balance">
                    <div className="dr-summary-card__header">
                        <span className="dr-summary-card__label">Closing Balance</span>
                        <div className="dr-summary-card__icon">
                            <Wallet size={16} />
                        </div>
                    </div>
                    <div className="dr-summary-card__value">₹ {formatCurrency(closing)}</div>
                    <div className="dr-summary-card__footer">
                        <span>Opening: ₹ {formatCurrency(opening)}</span>
                    </div>
                </div>
            </div>
        );
    };

    const OffsetTab = () => {
        if (tabErrors.Offset) {
            return (
                <NoInternetState
                    variant="inline"
                    title="Failed to load Offset data"
                    message={tabErrors.Offset}
                    actionLabel="Retry"
                    onRetry={() => loadTabData('Offset')}
                />
            );
        }
        return (
            <div className="stack-md">
                <UnifiedCashbookHeader bookType="Offset" summary={offsetData.summary} liveCounts={liveCounts?.offset} />
                <div className="panel">
                    <h2 className="panel-title panel-title--badge">
                        <FileText size={16} />
                        Transactions
                        <span className="badge panel-title-badge">{offsetData.entries?.length || 0}</span>
                    </h2>
                    <CashbookAddRow bookType="Offset" />
                    <EntryTable entries={offsetData.entries} type="offset" />
                </div>
                <CreditList bookKey="Offset" credits={creditTransactions} liveEntries={offsetData.entries} />
            </div>
        );
    };

    const LaserTab = () => (
        <div className="stack-md">
            <UnifiedCashbookHeader bookType="Laser" summary={laserData.summary} liveCounts={liveCounts?.laser} />
            <MachineSection />
            <div className="panel">
                <h2 className="panel-title panel-title--badge">
                    <FileText size={16} />
                    Laser Work Details
                    <span className="badge panel-title-badge">{laserData.entries?.length || 0}</span>
                </h2>
                <CashbookAddRow bookType="Laser" />
                <EntryTable entries={laserData.entries} type="laser" />
            </div>
            <CreditList bookKey="Laser" credits={laserCredits} liveEntries={laserData.entries} />
        </div>
    );

    const OtherTab = () => {
        if (tabErrors.Other) {
            return (
                <NoInternetState
                    variant="inline"
                    title="Failed to load Other data"
                    message={tabErrors.Other}
                    actionLabel="Retry"
                    onRetry={() => loadTabData('Other')}
                />
            );
        }
        return (
            <div className="stack-md">
                <UnifiedCashbookHeader bookType="Other" summary={otherData.summary} liveCounts={liveCounts?.other} />
                <div className="panel">
                    <h2 className="panel-title panel-title--badge">
                        <Package size={16} />
                        Other Products
                        <span className="badge panel-title-badge">{otherData.entries?.length || 0}</span>
                    </h2>
                    <p className="other-panel-description">
                        Mementos, Photo Frames, Gifts & other non-printing products
                    </p>
                    <CashbookAddRow bookType="Other" />
                    <EntryTable entries={otherData.entries} type="other" />
                </div>
                <CreditList bookKey="Other" credits={otherCredits} liveEntries={otherData.entries} />
            </div>
        );
    };

    // ═══════════════════ RENDER ═══════════════════

    // Listen for attendance updates from other pages (EmployeeDetail) and refresh in realtime
    useEffect(() => {
        const onStorage = (e) => {
            if (!e) return;
            if (e.key === 'attendance:updated') {
                try { fetchAttendanceData(); } catch (err) { console.error('fetchAttendanceData error on storage:', err); }
                try { fetchLiveCounts(); } catch (err) { console.error('fetchLiveCounts error on storage:', err); }
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [fetchAttendanceData, fetchLiveCounts]);

    return (
        <PageContainer>
            {showOpeningPrompt && (
                <OpeningSetupModal
                    balances={promptBalances}
                    machines={promptMachines}
                    prevClosing={prevClosing}
                    branchName={branchName}
                    onSave={handleOpeningPromptSave}
                    onSkip={handleOpeningPromptSkip}
                    date={reportDate}
                />
            )}

            {/* Change Request Modal */}
            {showChangeRequest && (
                <div className="modal-backdrop">
                    <div className="modal change-request-modal">
                        <div className="change-request-header">
                            <div className="change-request-header-left">
                                <div className="change-request-icon">
                                    <Edit3 size={16} />
                                </div>
                                <div>
                                    <h2 className="section-title change-request-title">Request Change</h2>
                                    <p className="change-request-subtitle">
                                        {showChangeRequest.type === 'balance'
                                            ? `Opening balance — ${showChangeRequest.bookType} book`
                                            : `Opening count — ${showChangeRequest.machineName || 'Machine'}`}
                                    </p>
                                </div>
                            </div>
                            <button className="btn btn-ghost btn-sm change-request-close-btn" onClick={() => setShowChangeRequest(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="stack-md">
                            <div>
                                <label className="label">Current Value</label>
                                <input type="text" className="input-field change-request-input-disabled" disabled
                                    value={showChangeRequest.type === 'balance' ? formatCurrency(showChangeRequest.currentValue) : showChangeRequest.currentValue}
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

                        <div className="row gap-sm justify-end change-request-actions">
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
                        {activeTab === 'Offset' && <BookOpen size={22} style={{ color: currentTabMeta.color }} />}
                        {activeTab === 'Laser' && <Printer size={22} style={{ color: currentTabMeta.color }} />}
                        {activeTab === 'Other' && <Package size={22} style={{ color: currentTabMeta.color }} />}
                        {activeTab === 'Attendance' && <Users size={22} style={{ color: currentTabMeta.color }} />}
                    </div>
                    <div>
                        <h1 className="section-title dr-title-section">Daily Report</h1>
                        <p className="dr-subtitle">
                            {formatDateDisplay(reportDate)}
                            {canViewAllBranches && branchName && (
                                <span className="badge badge--info dr-branch-badge" style={{marginLeft: 8}}>{branchName}</span>
                            )}
                            {lastRefresh && (
                                <span className="dr-refresh-time" style={{marginLeft: 8}}>
                                    <RefreshCw size={10} /> {formatTime(lastRefresh)}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="dr-controls">
                    <button className="dr-opening-setup-btn" onClick={triggerOpeningSetup}>
                        <Sunrise size={15} />
                        <span>Opening Setup</span>
                    </button>
                    {canViewAllBranches && branches.length > 0 && (
                        <div className="dr-controls-branch">
                            <Building2 size={15} />
                            <label htmlFor="branch-selector" className="sr-only">Select Branch</label>
                            <BranchSelect id="branch-selector" aria-label="Select Branch" className="input-field dr-controls-branch-select" value={selectedBranch || ''}
                                onChange={(e) => setSelectedBranch(Number(e.target.value))}
                            >
                                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </BranchSelect>
                        </div>
                    )}
                    <div className="dr-controls-date">
                        <label htmlFor="report-date" style={{display:'flex', alignItems:'center', gap:'8px'}}>
                            <Calendar size={15} />
                        </label>
                        <input id="report-date" type="date" className="input-field dr-controls-date-input" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                    </div>
                    <React.Suspense fallback={<button className="btn btn-primary btn-sm dr-pdf-btn" disabled><FileText size={15} /> Loading...</button>}>
                        <PDFExport
                            branchName={branchName}
                            reportDate={reportDate}
                            offsetData={offsetData}
                            laserData={laserData}
                            otherData={otherData}
                            openingBalances={openingBalances}
                            creditTotals={creditTotals}
                            creditTransactions={creditTransactions}
                            laserCredits={laserCredits}
                            otherCredits={otherCredits}
                            attendanceData={attendanceData}
                            isFrontOffice={isFrontOffice}
                            user={user}
                            branches={branches}
                            branchId={selectedBranch || user?.branch_id}
                        />
                    </React.Suspense>
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
                            style={{ '--tab-color': tab.color }}
                        >
                            <TabIcon size={15} className="dr-tab-icon" />
                            {tab.label}
                            {tab.key === 'Offset' && liveCounts?.offset && (
                                <span className="dr-tab__badge">
                                    {liveCounts.offset.income_count}
                                </span>
                            )}
                            {tab.key === 'Laser' && liveCounts?.laser && (
                                <span className="dr-tab__badge">
                                    {liveCounts.laser.income_count}
                                </span>
                            )}
                            {tab.key === 'Other' && liveCounts?.other && (
                                <span className="dr-tab__badge">
                                    {liveCounts.other.income_count}
                                </span>
                            )}
                            {tab.key === 'Attendance' && attendanceData && (
                                <span className="dr-tab__badge">
                                    {attendanceData.present}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Credits Today quick view */}
            {activeTab !== 'Attendance' && (() => {
                const book = [
                    { key: 'Offset', credits: creditTransactions, live: offsetData.entries },
                    { key: 'Laser', credits: laserCredits, live: laserData.entries },
                    { key: 'Other', credits: otherCredits, live: otherData.entries }
                ].find(b => b.key === activeTab);

                const manualIn = book ? book.credits.filter(c => c.transaction_type === 'Credit In').reduce((s, c) => s + Number(c.amount), 0) : 0;
                const manualOut = book ? book.credits.filter(c => c.transaction_type === 'Credit Out').reduce((s, c) => s + Number(c.amount), 0) : 0;
                const liveOut = book ? (book.live || []).filter(e => {
                    const t = Number(e.total || 0);
                    const p = Number(e.cash_amount || 0) + Number(e.upi_amount || 0);
                    return t > 0 && p === 0;
                }).reduce((s, e) => s + Number(e.total), 0) : 0;

                const totalOut = manualOut + liveOut;
                const net = manualIn - totalOut;

                return (
                <div className="panel dr-credits-panel">
                    <div className="panel-header dr-credits-panel-header">
                        <h2 className="panel-title">
                            <CreditCard size={15} />
                            Today's Credits — {activeTab}
                        </h2>
                    </div>
                    {initialLoading ? (
                        <div className="dr-credits-skeleton">
                            <SkeletonLoader type="cards" count={3} />
                        </div>
                    ) : (
                        <div className="dr-credits-grid" style={{display: 'flex', gap: 12}}>
                            <div className="stat-card" style={{flex: 1}}>
                                <div className="stat-label">Credit Out</div>
                                <div className="stat-value" style={{color: 'var(--warning)', fontSize: 22}}>₹ {formatCurrency(totalOut)}</div>
                            </div>
                            <div className="stat-card" style={{flex: 1}}>
                                <div className="stat-label">Credit In</div>
                                <div className="stat-value" style={{color: 'var(--success)', fontSize: 22}}>₹ {formatCurrency(manualIn)}</div>
                            </div>
                            <div className="stat-card" style={{flex: 1}}>
                                <div className="stat-label">Net Change</div>
                                <div className="stat-value" style={{color: net >= 0 ? 'var(--success)' : 'var(--error)', fontSize: 22}}>
                                    {net >= 0 ? '+' : ''}₹ {formatCurrency(net)}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                );
            })()}

            {/* Credit Add Modal */}
            {showCreditModal && (
                <div className="modal-backdrop">
                    <div className="modal-content" style={{ maxWidth: 450 }}>
                        <div className="modal-header">
                            <h2>Add Credit — {creditModalData.book_type}</h2>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowCreditModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body stack-md">
                            <div className="form-group">
                                <label className="form-label">Transaction Type</label>
                                <select className="input-field" value={creditModalData.transaction_type}
                                    onChange={(e) => setCreditModalData({ ...creditModalData, transaction_type: e.target.value })}>
                                    <option value="Credit Out">Credit Out (Sale on Credit / Cash Given)</option>
                                    <option value="Credit In">Credit In (Collection of Old Debt)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Customer Name</label>
                                <input type="text" className="input-field" value={creditModalData.customer_name}
                                    onChange={(e) => setCreditModalData({ ...creditModalData, customer_name: e.target.value })}
                                    placeholder="Enter customer name" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Amount (₹)</label>
                                <input type="number" className="input-field" value={creditModalData.amount}
                                    onChange={(e) => setCreditModalData({ ...creditModalData, amount: e.target.value })}
                                    placeholder="0.00" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Remarks (Optional)</label>
                                <input type="text" className="input-field" value={creditModalData.remarks}
                                    onChange={(e) => setCreditModalData({ ...creditModalData, remarks: e.target.value })}
                                    placeholder="Additional details..." />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowCreditModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={async () => {
                                if (!creditModalData.customer_name || !creditModalData.amount) {
                                    toast.error('Please fill name and amount');
                                    return;
                                }
                                try {
                                    await api.post('/daily-report/credits', {
                                        ...creditModalData,
                                        date: reportDate,
                                        branch_id: selectedBranch
                                    });
                                    toast.success('Credit added');
                                    setShowCreditModal(false);
                                    if (creditModalData.book_type === 'Offset') fetchCreditTransactions();
                                    else if (creditModalData.book_type === 'Laser') fetchLaserCredits();
                                    else if (creditModalData.book_type === 'Other') fetchOtherCredits();
                                } catch {
                                    toast.error('Failed to add credit');
                                }
                            }}>Save Credit</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <>
                {activeTab === 'Offset' && <OffsetTab />}
                {activeTab === 'Laser' && <LaserTab />}
                {activeTab === 'Other' && <OtherTab />}
                {activeTab === 'Attendance' && <AttendanceView />}
            </>

            <div className="dr-auto-refresh">
                <RefreshCw size={10} /> Auto-refreshes every 30s
            </div>
        </PageContainer>
    );
};

export default React.memo(DailyReport);

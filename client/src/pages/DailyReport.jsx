import { useSEO } from '../hooks/useSEO';
import React, { useState, useEffect, useCallback } from 'react';
import usePolling from '../hooks/usePolling';
import {
    BookOpen, Printer, Package, RefreshCw, TrendingUp, TrendingDown,
    Monitor, Hash, Building2, Check, Edit3, Lock, Send, FileText, Plus, Trash2,
    Calendar, Clock, ArrowUpRight, ArrowDownRight, X, Wallet, CreditCard,
    IndianRupee, ChevronRight, ChevronLeft, BarChart3, Users
} from 'lucide-react';

const PDFExport = React.lazy(() => import('./DailyReportPDFExport'));
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
    } catch (err) {
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
    const [promptBalances, setPromptBalances] = useState({ Offset: '', Laser: '', Other: '' });
    const [promptMachines, setPromptMachines] = useState([]);
    const [machineOpeningTemps, setMachineOpeningTemps] = useState({});
    const [savingPrompt, setSavingPrompt] = useState(false);
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
                } catch (err) { assignedBooks = []; }
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
                        setMachineOpeningTemps(
                            machines.reduce((acc, m) => ({ ...acc, [m.id]: m.opening_count }), {})
                        );
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

    // ─── Save Opening Prompt ────────────────────────────────────
    const handleSavePrompt = async () => {
        setSavingPrompt(true);
        try {
            // Save balances — ignore 403 (already locked from a prior attempt)
            for (const bookType of Object.keys(promptBalances)) {
                try {
                    await api.put('/daily-report/opening-balance', {
                        date: reportDate, book_type: bookType, cash_opening: parseFloat(promptBalances[bookType]) || 0
                    });
                } catch (err) {
                    if (err.response?.status !== 403) throw err;
                }
            }

            // Save machine readings — ignore 403 (already locked), fail on others
            for (const m of promptMachines.filter(m => m.opening_count !== '' && m.opening_count !== null)) {
                try {
                    await api.post(`/machines/${m.id}/readings`, {
                        reading_date: reportDate, opening_count: parseInt(m.opening_count) || 0
                    });
                } catch (err) {
                    if (err.response?.status !== 403) throw err;
                }
            }

            setShowOpeningPrompt(false);
            setPromptDone(true);
            loadAllData();
        } catch (err) {
            console.error('Error saving opening data:', err);
            toast.error(err.response?.data?.error || 'Failed to save opening data. Please try again.');
        } finally { setSavingPrompt(false); }
    };

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

    useEffect(() => {
        if (canViewAllBranches && !selectedBranch) return;
        loadAllData(true);
    }, [reportDate, selectedBranch]);

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

    const manualRefresh = () => { loadAllData(); };

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
            } catch (err) {
                toast.error('Failed to delete credit');
            }
        };

        return (
            <div className="panel">
                <div className="panel-header credit-list-header">
                    <h2 className="panel-title credit-list-title">
                        <IndianRupee size={16} /> Credits — {bookKey}
                        <span className="badge credit-list-badge">{all.length}</span>
                    </h2>
                    <div className="row gap-sm">
                        <span className="credit-list-total">Total: {formatCurrency(total)}</span>
                    </div>
                </div>

                {all.length === 0 ? (
                    <div className="credit-list-empty">No credit transactions for this book/date.</div>
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
                                        <td>{c.type}</td>
                                        <td>
                                            <div>{c.customer}</div>
                                        </td>
                                        <td>{c.details || c.reference}</td>
                                        <td>{formatCurrency(c.amount)}</td>
                                        <td>
                                            {c.isManual && (
                                                <button className="btn btn-ghost btn-danger btn-sm" onClick={() => handleDeleteCredit(c.id)}>
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

    const CashOpeningCard = ({ bookType }) => {
        const currentValue = openingBalances[bookType] || 0;
        const isLocked = lockedBalances[bookType] && !isAdmin;
        const isSet = currentValue > 0 && !isLocked;
        const [localAmount, setLocalAmount] = useState('');
        const [saving, setSaving] = useState(false);
        const [showEdit, setShowEdit] = useState(false);
        const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

        const handleSet = async () => {
            if (!localAmount || saving) return;
            setSaving(true);
            try {
                await saveOpeningBalance(bookType, localAmount);
                setShowEdit(false);
                setLocalAmount('');
            } finally {
                setSaving(false);
            }
        };

        return (
            <div className="cash-opening-card">
                <div className="cash-opening-header">
                    <div className="cash-opening-icon">
                        <Wallet size={20} />
                    </div>
                    <div>
                        <h3 className="cash-opening-title">Opening Balance — {bookType}</h3>
                        <p className="cash-opening-subtitle">{todayStr}</p>
                    </div>
                    {isSet && !showEdit && (
                        <span className="cash-opening-badge done">
                            <Check size={12} /> Set
                        </span>
                    )}
                    {isLocked && (
                        <span className="cash-opening-badge done" style={{ background: 'color-mix(in srgb, var(--warning), transparent 85%)', color: 'var(--warning)' }}>
                            <Lock size={12} /> Locked
                        </span>
                    )}
                </div>

                {!isSet || showEdit ? (
                    <div className="cash-opening-form">
                        <div className="cash-amount-input-wrap">
                            <span className="currency-prefix">₹</span>
                            <input
                                type="number"
                                className="cash-amount-input"
                                placeholder="0.00"
                                value={showEdit ? tempBalance : localAmount}
                                onChange={e => showEdit ? setTempBalance(e.target.value) : setLocalAmount(e.target.value)}
                                autoFocus
                                min="0"
                                step="0.01"
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                className="btn btn-primary cash-opening-submit"
                                onClick={showEdit ? () => saveOpeningBalance(bookType, tempBalance) : handleSet}
                                disabled={saving || (!showEdit && !localAmount)}
                                style={{ flex: 1 }}
                            >
                                {saving ? 'Saving\u2026' : (showEdit ? 'Save' : 'Set Opening Balance')}
                            </button>
                            {showEdit && (
                                <button className="btn btn-ghost" onClick={() => { setShowEdit(false); setEditingBalance(null); }} style={{ height: 44 }}>
                                    Cancel
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="cash-opening-set-display">
                        <span className="opening-amount-display">₹ {formatCurrency(currentValue)}</span>
                        <div className="row gap-sm">
                            {canEditBalance && !isLocked && (
                                <button className="btn btn-ghost btn-sm" onClick={() => { setTempBalance(String(currentValue)); setShowEdit(true); }}>
                                    <Edit3 size={14} /> Edit
                                </button>
                            )}
                            {isLocked && isFrontOffice && (
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                    onClick={() => { setShowChangeRequest({ type: 'balance', bookType, currentValue }); setChangeRequestValue(String(currentValue)); setChangeRequestNote(''); }}>
                                    <Send size={14} /> Request Change
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
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
                        <p>
                            {type === 'laser' ? 'Laser work entries will appear here' : 'Data auto-syncs from billing & expenses'}
                        </p>
                    </div>
                );
            }

        const isLaser = type === 'laser';

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
                            <th>Time</th>
                            <th>{isLaser ? 'Customer / Work' : 'Description'}</th>
                            {isLaser && <th>Machine</th>}
                            {isLaser
                                ? <th>Copies</th>
                                : <th>Type</th>
                            }
                            {isLaser && <th>Type</th>}
                            <th>Mode</th>
                            <th>Cash</th>
                            <th>UPI</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedEntries.map((entry, i) => {
                            const isExpense = entry.type === 'expense';
                            const isInternal = !!entry.is_internal;
                            const hasLines = entry.order_lines?.length > 1;
                            const isExpanded = expandedIds.has(entry.id);
                            return (
                                <React.Fragment key={`${type}-${entry.id}-${i}`}>
                                    <tr className={hasLines ? 'entry-table tr--clickable' : ''} onClick={hasLines ? () => toggleExpand(entry.id) : undefined} role={hasLines ? "button" : "row"} tabIndex={hasLines ? 0 : undefined} onKeyDown={hasLines ? (e) => { if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(entry.id); } } : undefined}>
                                        <td>
                                            <span className="entry-table-time">
                                                <Clock size={10} /> {formatTime(entry.time)}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="entry-table-description">
                                                {hasLines && (
                                                    <ChevronRight size={14} className={`entry-table-chevron ${isExpanded ? 'entry-table-chevron--expanded' : ''}`} />
                                                )}
                                                {entry.description}
                                                {hasLines && (
                                                    <span className="badge badge--default entry-table-badge">{entry.order_lines.length} items</span>
                                                )}
                                                {entry.is_local_pending && (
                                                    <span className="badge badge--warning entry-table-badge">Pending Sync</span>
                                                )}
                                            </div>
                                            {!hasLines && entry.details && <div className="entry-table-details">{entry.details}</div>}
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
                                            <td>
                                                <div className="entry-table-machine">
                                                    {entry.machine_name || '—'}
                                                </div>
                                            </td>
                                        )}
                                        {isLaser ? (
                                            <td className="entry-table-copies">{entry.copies}</td>
                                        ) : (
                                            <td>
                                                <span className={`badge ${isExpense ? 'badge--danger' : 'badge--success'} entry-table-badge`}>
                                                    {isExpense
                                                        ? <><ArrowDownRight size={10} /> Expense</>
                                                        : <><ArrowUpRight size={10} /> Income</>
                                                    }
                                                </span>
                                            </td>
                                        )}
                                        {isLaser && (
                                            <td>
                                                {isInternal ? (
                                                    <span className="badge entry-table-internal-badge">🏠 Internal</span>
                                                ) : (
                                                    <span className="entry-table-line-qty">—</span>
                                                )}
                                            </td>
                                        )}
                                        <td>
                                            <span className="badge badge--default entry-table-badge">
                                                {entry.payment_method || 'Cash'}
                                            </span>
                                        </td>
                                        <td className={`entry-table-amount ${isExpense ? 'entry-table-amount--expense' : 'entry-table-amount--income'}`}>
                                            {isExpense ? '-' : '+'}{formatCurrency(entry.cash_amount)}
                                        </td>
                                        <td className={`entry-table-amount ${isExpense ? 'entry-table-amount--expense' : 'entry-table-amount--income'}`}>
                                            {isExpense ? '-' : '+'}{formatCurrency(entry.upi_amount)}
                                        </td>
                                        <td className="entry-table-total">
                                            {isExpense ? '-' : ''}{formatCurrency(entry.total)}
                                        </td>
                                    </tr>
                                    {hasLines && isExpanded && entry.order_lines.map((line, li) => (
                                        <tr key={`${entry.id}-line-${li}`} className="entry-table-row--expanded">
                                            <td></td>
                                            <td colSpan={isLaser ? 2 : 1} className="entry-table-row-expanded-content">
                                                <span className="entry-table-line-name">{line.name || 'Item'}</span>
                                                {line.qty > 1 && <span className="entry-table-line-qty">×{line.qty}</span>}
                                                {(line.waste_prints > 0 || line.proof_prints > 0) && (
                                                    <span className="entry-table-line-waste-proof">
                                                        {line.waste_prints > 0 && <span className="entry-table-line-waste">Waste:{line.waste_prints} </span>}
                                                        {line.proof_prints > 0 && <span className="entry-table-line-proof">Proof:{line.proof_prints}</span>}
                                                    </span>
                                                )}
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
                        <TrendingUp size={12} /> Cash In
                    </span>
                    <span className="dr-summary-item__value dr-summary-item__value--success">{formatCurrency(summary.total_cash_in)}</span>
                </div>
                <div className="dr-summary-item">
                    <span className="dr-summary-item__label">
                        <CreditCard size={12} /> UPI In
                    </span>
                    <span className="dr-summary-item__value dr-summary-item__value--success">{formatCurrency(summary.total_upi_in)}</span>
                </div>
                {summary.total_cash_out !== undefined && summary.total_cash_out !== null && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label">
                            <TrendingDown size={12} /> Cash Out
                        </span>
                        <span className="dr-summary-item__value dr-summary-item__value--error">{formatCurrency(summary.total_cash_out)}</span>
                    </div>
                )}
                {summary.total_copies !== undefined && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label">
                            <Hash size={12} /> Total Copies
                        </span>
                        <span className="dr-summary-item__value">{formatNum(summary.total_copies)}</span>
                    </div>
                )}
                {summary.waste_prints > 0 && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label dr-summary-item__label--waste">
                            <Hash size={12} /> Waste Prints
                        </span>
                        <span className="dr-summary-item__value dr-summary-item__value--waste">{formatNum(summary.waste_prints)}</span>
                    </div>
                )}
                {summary.proof_prints > 0 && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label dr-summary-item__label--proof">
                            <Hash size={12} /> Proof Prints
                        </span>
                        <span className="dr-summary-item__value dr-summary-item__value--proof">{formatNum(summary.proof_prints)}</span>
                    </div>
                )}
                {summary.internal_prints > 0 && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label dr-summary-item__label--internal">
                            🏠 Internal Prints
                        </span>
                        <span className="dr-summary-item__value dr-summary-item__value--internal">{formatNum(summary.internal_prints)}</span>
                    </div>
                )}
                {summary.internal_bill_count > 0 && (
                    <div className="dr-summary-item">
                        <span className="dr-summary-item__label dr-summary-item__label--internal">Internal Jobs</span>
                        <span className="dr-summary-item__value dr-summary-item__value--internal">{summary.internal_bill_count}</span>
                    </div>
                )}
                <div className="dr-summary-closing">
                    <span className="dr-summary-item__label">Cash Closing</span>
                    <span className="dr-summary-item__value dr-summary-closing-value" style={{ color: tabMeta?.color || 'var(--primary)' }}>
                        {formatCurrency(summary.cash_closing)}
                    </span>
                </div>
            </div>
        );
    };

    const StatRow = ({ items }) => (
        <div className="row gap-md stat-row">
            {items.map((item, i) => (
                <div key={i} className="stat-card stat-row-item">
                    <div className="stat-row-icon">
                        {item.icon && <item.icon size={14} />}
                    </div>
                    <div className="stat-value stat-row-value">{item.value}</div>
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
                <div className="panel dr-error machine-error">
                    <div className="dr-empty__icon machine-error-icon"><Monitor size={22} /></div>
                    <p className="machine-error-title">Connection Error</p>
                    <p className="machine-error-message">{tabErrors.Laser}</p>
                    <button className="btn btn-ghost btn-sm mt-12" onClick={() => loadTabData('Laser')}>Try Again</button>
                </div>
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
            <div className="cashbook-summary-strip">
                <div className="summary-item income">
                    <span className="summary-label">Total In</span>
                    <span className="summary-value">₹ {formatCurrency(totalIn)}</span>
                </div>
                <div className="summary-divider" />
                <div className="summary-item expense">
                    <span className="summary-label">Total Out</span>
                    <span className="summary-value">₹ {formatCurrency(totalOut)}</span>
                </div>
                <div className="summary-divider" />
                <div className="summary-item balance">
                    <span className="summary-label">Closing Balance</span>
                    <span className="summary-value">₹ {formatCurrency(closing)}</span>
                </div>
            </div>
        );
    };

    const OffsetTab = () => (
        <div className="stack-md">
            <CashOpeningCard bookType="Offset" />
            {liveCounts?.offset && (
                <StatRow items={[
                    { value: liveCounts.offset.income_count, label: 'Billings', icon: BarChart3, color: 'var(--accent)' },
                    { value: liveCounts.offset.expense_count, label: 'Expenses', icon: TrendingDown, color: 'var(--error)' },
                    { value: formatCurrency(liveCounts.offset.total_collected), label: 'Collected', icon: TrendingUp, color: 'var(--success)' },
                    { value: formatCurrency(liveCounts.offset.total_expenses), label: 'Spent', icon: ArrowDownRight, color: 'var(--error)' }
                ]} />
            )}
            {renderCashbookSummaryStrip(offsetData.summary || {})}
            <div className="panel">
                <h2 className="panel-title panel-title--badge">
                    <FileText size={16} />
                    Transactions
                    <span className="badge panel-title-badge">{offsetData.entries?.length || 0}</span>
                </h2>
                <EntryTable entries={offsetData.entries} type="offset" />
            </div>
            <CreditList bookKey="Offset" credits={creditTransactions} liveEntries={offsetData.entries} />
        </div>
    );

    const LaserTab = () => (
        <div className="stack-md">
            <CashOpeningCard bookType="Laser" />
            <MachineSection />
            {liveCounts?.laser && (
                <StatRow items={[
                    { value: liveCounts.laser.income_count, label: 'Billings', icon: BarChart3, color: 'var(--accent)' },
                    { value: liveCounts.laser.machine_count, label: 'Machines', icon: Monitor, color: 'var(--accent)' },
                    { value: formatNum(liveCounts.laser.total_copies), label: 'Total Copies', icon: Hash, color: 'var(--success)' },
                    { value: formatCurrency(liveCounts.laser.total_collected), label: 'Collected', icon: TrendingUp, color: 'var(--success)' }
                ]} />
            )}
            {renderCashbookSummaryStrip(laserData.summary || {})}
            <div className="panel">
                <h2 className="panel-title panel-title--badge">
                    <FileText size={16} />
                    Laser Work Details
                    <span className="badge panel-title-badge">{laserData.entries?.length || 0}</span>
                </h2>
                <EntryTable entries={laserData.entries} type="laser" />
            </div>
            <CreditList bookKey="Laser" credits={laserCredits} liveEntries={laserData.entries} />
        </div>
    );

    const OtherTab = () => (
        <div className="stack-md">
            <CashOpeningCard bookType="Other" />
            {liveCounts?.other && (
                <StatRow items={[
                    { value: liveCounts.other.income_count, label: 'Billings', icon: BarChart3, color: 'var(--accent)' },
                    { value: formatCurrency(liveCounts.other.total_collected), label: 'Collected', icon: TrendingUp, color: 'var(--success)' }
                ]} />
            )}
            {renderCashbookSummaryStrip(otherData.summary || {})}
            <div className="panel">
                <h2 className="panel-title panel-title--badge">
                    <Package size={16} />
                    Other Products
                    <span className="badge panel-title-badge">{otherData.entries?.length || 0}</span>
                </h2>
                <p className="other-panel-description">
                    Mementos, Photo Frames, Gifts & other non-printing products
                </p>
                <EntryTable entries={otherData.entries} type="other" />
            </div>
            <CreditList bookKey="Other" credits={otherCredits} liveEntries={otherData.entries} />
        </div>
    );

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
            {/* Opening Balance Prompt Modal */}
            {showOpeningPrompt && (
                <div className="modal-backdrop">
                    <div className="modal opening-prompt-modal">
                        <div className="opening-prompt-header">
                            <div className="opening-prompt-icon">
                                <IndianRupee size={20} />
                            </div>
                            <div>
                                <h2 className="section-title opening-prompt-title">Good Morning!</h2>
                                <p className="opening-prompt-subtitle">Set opening values for today</p>
                            </div>
                        </div>

                        <div className="stack-md opening-prompt-content">
                            {Object.keys(promptBalances).length > 0 && (
                                <div className="panel panel--tight opening-prompt-panel">
                                    <h4 className="opening-prompt-panel-title">
                                        <Wallet size={14} /> CASH OPENING BALANCES
                                    </h4>
                                    <div className="stack-sm">
                                        {TABS.filter(tab => Object.prototype.hasOwnProperty.call(promptBalances, tab.key)).map(tab => (
                                            <div key={tab.key} className="row gap-md items-center opening-prompt-balance-row">
                                                <div className="opening-prompt-balance-label">
                                                    <div className="opening-prompt-balance-dot" style={{ background: tab.color }} />
                                                    {tab.label}
                                                </div>
                                                <div className="opening-prompt-balance-input-wrapper">
                                                    <input type="number" className="input-field opening-prompt-balance-input"
                                                        value={promptBalances[tab.key]}
                                                        onChange={(e) => setPromptBalances(prev => ({ ...prev, [tab.key]: e.target.value }))}
                                                        placeholder="₹ 0.00" step="0.01"
                                                    />
                                                    {prevClosing[tab.key] > 0 && (
                                                        <div className="opening-prompt-prev-closing">
                                                            prev: ₹{Number(prevClosing[tab.key]).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {promptMachines.length > 0 && (
                                <div className="panel panel--tight opening-prompt-panel">
                                    <h4 className="opening-prompt-machine-panel-title">
                                        <Monitor size={14} /> MACHINE OPENING COUNTS
                                    </h4>
                                    <div className="stack-sm">
                                        {promptMachines.map((m, idx) => (
                                            <div key={m.id} className="row gap-md items-center">
                                                <div className="opening-prompt-machine-info">
                                                    <div className="opening-prompt-machine-name">{m.machine_name}</div>
                                                    {m.location && <div className="opening-prompt-machine-location">{m.location}</div>}
                                                </div>
                                                <input type="number" className="input-field opening-prompt-machine-input"
                                                    value={machineOpeningTemps[m.id] || ''}
                                                    onChange={(e) => setMachineOpeningTemps(prev => ({ ...prev, [m.id]: e.target.value }))}
                                                    placeholder="Counter reading"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="row gap-sm justify-end opening-prompt-actions">
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
                    <div className="modal change-request-modal">
                        <div className="change-request-header">
                            <div className="change-request-header-left">
                                <div className="change-request-icon">
                                    <Send size={16} />
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
                        <BarChart3 size={22} style={{ color: currentTabMeta.color }} />
                    </div>
                    <div>
                        <h1 className="section-title dr-title-section">Daily Report</h1>
                        <p className="dr-subtitle">
                            Live cash book — auto-synced
                            {canViewAllBranches && branchName && (
                                <span className="badge badge--info dr-branch-badge">{branchName}</span>
                            )}
                            {lastRefresh && (
                                <span className="dr-refresh-time">
                                    <Clock size={10} /> {formatTime(lastRefresh)}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                <div className="dr-controls">
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
        <span className="sr-only">Select Date</span>
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
            attendanceData={attendanceData}
            isFrontOffice={isFrontOffice}
            user={user}
            branches={branches}
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
                                    {liveCounts.laser.income_count}
                                </span>
                            )}
                            {tab.key === 'Other' && liveCounts?.other && (
                                <span className="dr-tab__badge" style={{ background: isActive ? `${tab.color}15` : 'var(--accent-soft)', color: isActive ? tab.color : 'var(--muted)' }}>
                                    {liveCounts.other.income_count}
                                </span>
                            )}
                            {tab.key === 'Attendance' && attendanceData && (
                                <span className="dr-tab__badge" style={{ background: isActive ? `${tab.color}15` : 'var(--accent-soft)', color: isActive ? tab.color : 'var(--muted)' }}>
                                    {attendanceData.present}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Credits Today quick view */}
            {activeTab !== 'Attendance' && (
            <div className="panel dr-credits-panel">
                <div className="panel-header dr-credits-panel-header">
                    <h2 className="panel-title">Today's Credits — {activeTab}</h2>
                </div>
                <div className="row gap-lg dr-credits-grid">
                    {initialLoading ? (
                        <div className="dr-credits-skeleton">
                            <SkeletonLoader type="cards" count={3} />
                        </div>
                    ) : (
                        <div className="dr-credits-table-wrapper">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Book Type</th>
                                        <th style={{ textAlign: 'right' }}>Credit Out (Sales)</th>
                                        <th style={{ textAlign: 'right' }}>Credit In (Collections)</th>
                                        <th style={{ textAlign: 'right' }}>Net Credit Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { key: 'Offset', credits: creditTransactions, live: offsetData.entries },
                                        { key: 'Laser', credits: laserCredits, live: laserData.entries },
                                        { key: 'Other', credits: otherCredits, live: otherData.entries }
                                    ].filter(book => book.key === activeTab).map(book => {
                                        const manualIn = book.credits.filter(c => c.transaction_type === 'Credit In').reduce((s, c) => s + Number(c.amount), 0);
                                        const manualOut = book.credits.filter(c => c.transaction_type === 'Credit Out').reduce((s, c) => s + Number(c.amount), 0);
                                        const liveOut = (book.live || []).filter(e => {
                                            const t = Number(e.total || 0);
                                            const p = Number(e.cash_amount || 0) + Number(e.upi_amount || 0);
                                            return t > 0 && p === 0;
                                        }).reduce((s, e) => s + Number(e.total), 0);

                                        const totalOut = manualOut + liveOut;
                                        const net = manualIn - totalOut;

                                        return (
                                            <tr key={book.key}>
                                                <td style={{ fontWeight: 600 }}>{book.key}</td>
                                                <td style={{ textAlign: 'right', color: 'var(--warning)' }}>{formatCurrency(totalOut)}</td>
                                                <td style={{ textAlign: 'right', color: 'var(--success)' }}>{formatCurrency(manualIn)}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 700, color: net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                    {net >= 0 ? '+' : ''}{formatCurrency(net)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
            )}

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
                                } catch (err) {
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

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <RefreshCw size={10} /> Auto-refreshes every 30s
            </div>
        </PageContainer>
    );
};

export default React.memo(DailyReport);

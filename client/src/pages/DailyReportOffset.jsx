import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, Lock, FileText, IndianRupee, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import auth from '../services/auth';
import api from '../services/api';
import { serverToday } from '../services/serverTime';

const DailyReportOffset = () => {
    const [reportDate, setReportDate] = useState(serverToday());
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [openingBalance, setOpeningBalance] = useState(0);
    const [workEntries, setWorkEntries] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [creditTransactions, setCreditTransactions] = useState([]);
    const [staffAttendance, setStaffAttendance] = useState([]);
    const [staff, setStaff] = useState([]);

    const [syncing, setSyncing] = useState(false);
    const [syncSummary, setSyncSummary] = useState(null);

    const user = auth.getUser();

    useEffect(() => {
        fetchStaff();
    }, []);

    useEffect(() => {
        if (reportDate) {
            loadReport();
        }
    }, [reportDate]);

    const fetchStaff = async () => {
        try {
            const response = await api.get('/staff', {
                headers: auth.getAuthHeader()
            });
            setStaff(response.data);
        } catch (error) {
            console.error('Error fetching staff:', error);
        }
    };

    const loadReport = async () => {
        try {
            setLoading(true);
            const response = await api.get('/daily-reports/offset', {
                params: {
                    start_date: reportDate,
                    end_date: reportDate
                },
                headers: auth.getAuthHeader()
            });

            if (response.data.length > 0) {
                const existingReport = response.data[0];
                // Load full report details
                const detailResponse = await api.get(`/daily-reports/offset/${existingReport.id}`, {
                    headers: auth.getAuthHeader()
                });

                setReport(detailResponse.data);
                setOpeningBalance(detailResponse.data.opening_balance);
                setWorkEntries(detailResponse.data.work_entries || []);
                setExpenses(detailResponse.data.expenses || []);
                setCreditTransactions(detailResponse.data.credit_transactions || []);
                setStaffAttendance(detailResponse.data.staff_attendance || []);
            } else {
                // New report — auto-load opening balance from previous day
                setReport(null);
                setWorkEntries([]);
                setExpenses([]);
                setCreditTransactions([]);
                setStaffAttendance([]);
                // Fetch previous closing balance as today's opening
                try {
                    const syncResp = await api.get('/daily-reports/offset/sync-data', {
                        params: { date: reportDate },
                        headers: auth.getAuthHeader()
                    });
                    setOpeningBalance(syncResp.data.previous_closing_balance || 0);
                } catch {
                    setOpeningBalance(0);
                }
            }
        } catch (error) {
            console.error('Error loading report:', error);
        } finally {
            setLoading(false);
        }
    };

    const addWorkEntry = () => {
        setWorkEntries([...workEntries, {
            work_name: '',
            work_details: '',
            payment_type: 'Cash',
            cash_amount: 0,
            upi_amount: 0,
            amount_collected: 0,
            remarks: ''
        }]);
    };

    const updateWorkEntry = (index, field, value) => {
        const updated = [...workEntries];
        updated[index][field] = value;

        // Auto-calculate amount_collected
        if (field === 'cash_amount' || field === 'upi_amount') {
            updated[index].amount_collected =
                parseFloat(updated[index].cash_amount || 0) +
                parseFloat(updated[index].upi_amount || 0);
        }

        setWorkEntries(updated);
    };

    const removeWorkEntry = (index) => {
        setWorkEntries(workEntries.filter((_, i) => i !== index));
    };

    const addExpense = () => {
        setExpenses([...expenses, {
            expense_description: '',
            amount: 0,
            payment_method: 'Cash',
            remarks: ''
        }]);
    };

    const updateExpense = (index, field, value) => {
        const updated = [...expenses];
        updated[index][field] = value;
        setExpenses(updated);
    };

    const removeExpense = (index) => {
        setExpenses(expenses.filter((_, i) => i !== index));
    };

    const addCreditTransaction = () => {
        setCreditTransactions([...creditTransactions, {
            transaction_type: 'Credit Out',
            customer_name: '',
            customer_phone: '',
            amount: 0,
            remarks: ''
        }]);
    };

    const updateCreditTransaction = (index, field, value) => {
        const updated = [...creditTransactions];
        updated[index][field] = value;
        setCreditTransactions(updated);
    };

    const removeCreditTransaction = (index) => {
        setCreditTransactions(creditTransactions.filter((_, i) => i !== index));
    };

    const calculateTotals = () => {
        const totalCollected = workEntries.reduce((sum, entry) => sum + parseFloat(entry.amount_collected || 0), 0);
        const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
        const totalCreditOut = creditTransactions
            .filter(t => t.transaction_type === 'Credit Out')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const totalCreditIn = creditTransactions
            .filter(t => t.transaction_type === 'Credit In')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        const closingBalance = parseFloat(openingBalance) + totalCollected + totalCreditIn - totalExpenses - totalCreditOut;

        return { totalCollected, totalExpenses, totalCreditOut, totalCreditIn, closingBalance };
    };

    const handleSave = async () => {
        const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        if (!window.confirm(`Save daily report for ${reportDate}?\nExpenses: ₹${totalExpenses.toFixed(2)}\nWork entries: ${workEntries.length}\nCredit txns: ${creditTransactions.length}`)) return;
        try {
            setLoading(true);

            const payload = {
                report_date: reportDate,
                branch_id: user.branch_id,
                opening_balance: parseFloat(openingBalance),
                work_entries: workEntries,
                expenses,
                credit_transactions: creditTransactions,
                staff_attendance: staffAttendance
            };

            await api.post('/daily-reports/offset', payload, {
                headers: auth.getAuthHeader()
            });

            alert('Daily report saved successfully!');
            loadReport();
        } catch (error) {
            console.error('Error saving report:', error);
            alert(error.response?.data?.error || 'Failed to save report');
        } finally {
            setLoading(false);
        }
    };

    const handleFinalize = async () => {
        if (!report?.id) {
            alert('Please save the report first');
            return;
        }

        if (!confirm('Finalize this report? This action cannot be undone.')) return;

        try {
            await api.post(`/daily-reports/offset/${report.id}/finalize`, {}, {
                headers: auth.getAuthHeader()
            });
            alert('Report finalized successfully!');
            loadReport();
        } catch (error) {
            console.error('Error finalizing report:', error);
            alert(error.response?.data?.error || 'Failed to finalize report');
        }
    };

    const syncFromBilling = async () => {
        try {
            setSyncing(true);
            const response = await api.get('/daily-reports/offset/sync-data', {
                params: { date: reportDate },
                headers: auth.getAuthHeader()
            });
            const { customer_payments, completed_jobs, expense_payments, previous_closing_balance } = response.data;

            let addedWork = 0, addedExpenses = 0, addedCredit = 0;
            const existingWorkNames = new Set(workEntries.map(e => e.work_name));
            const existingExpNames = new Set(expenses.map(e => e.expense_description));

            // --- SYNC CUSTOMER PAYMENTS as Work Entries ---
            const newWorkFromBilling = (customer_payments || [])
                .filter(cp => !existingWorkNames.has(`Billing #${cp.id} - ${cp.customer_name}`))
                .map(cp => {
                    const cashAmt = Number(cp.cash_amount || 0);
                    const upiAmt = Number(cp.upi_amount || 0);
                    const advPaid = Number(cp.advance_paid || 0);
                    const method = cp.payment_method || 'Cash';
                    return {
                        work_name: `Billing #${cp.id} - ${cp.customer_name}`,
                        work_details: cp.description || (cp.order_lines ? `${JSON.parse(cp.order_lines || '[]').length} item(s)` : ''),
                        payment_type: method === 'Both' ? 'Both' : method,
                        cash_amount: method === 'Both' ? cashAmt : (method === 'UPI' ? 0 : advPaid),
                        upi_amount: method === 'Both' ? upiAmt : (method === 'UPI' ? advPaid : 0),
                        amount_collected: advPaid,
                        remarks: cp.reference_number ? `Ref: ${cp.reference_number}` : 'Synced from billing'
                    };
                });
            addedWork += newWorkFromBilling.length;

            // --- SYNC COMPLETED JOBS as Work Entries (if not already covered by billing) ---
            const billingNames = new Set([...existingWorkNames, ...newWorkFromBilling.map(e => e.work_name)]);
            const newWorkFromJobs = (completed_jobs || [])
                .filter(j => !billingNames.has(`Job ${j.job_number} - ${j.customer_name}`) && !billingNames.has(j.job_number))
                .map(j => ({
                    work_name: `Job ${j.job_number} - ${j.customer_name}`,
                    work_details: j.job_name || j.description || '',
                    payment_type: j.payment_status === 'Paid' ? 'Cash' : 'Credit',
                    cash_amount: j.payment_status === 'Paid' ? Number(j.total_amount || 0) : Number(j.advance_paid || 0),
                    upi_amount: 0,
                    amount_collected: j.payment_status === 'Paid' ? Number(j.total_amount || 0) : Number(j.advance_paid || 0),
                    remarks: `Synced from jobs (${j.status})`
                }));
            addedWork += newWorkFromJobs.length;

            // --- SYNC EXPENSE PAYMENTS as Expenses ---
            const newExpenses = (expense_payments || [])
                .filter(p => !existingExpNames.has(`${p.type}: ${p.payee_name} (#${p.id})`))
                .map(p => ({
                    expense_description: `${p.type}: ${p.payee_name} (#${p.id})`,
                    amount: Number(p.amount || 0),
                    payment_method: p.payment_method === 'Both' ? 'Cash' : (p.payment_method || 'Cash'),
                    remarks: [p.description, p.reference_number ? `Ref: ${p.reference_number}` : ''].filter(Boolean).join(' | ') || 'Synced from payments'
                }));
            addedExpenses += newExpenses.length;

            // --- SYNC CREDIT TRANSACTIONS from billing with balance ---
            const existingCreditNames = new Set(creditTransactions.map(t => t.customer_name + t.amount));
            const newCredit = (customer_payments || [])
                .filter(cp => Number(cp.total_amount) - Number(cp.advance_paid) > 0.5)
                .filter(cp => !existingCreditNames.has(cp.customer_name + (Number(cp.total_amount) - Number(cp.advance_paid))))
                .map(cp => ({
                    transaction_type: 'Credit Out',
                    customer_name: cp.customer_name,
                    customer_phone: '',
                    amount: Number(cp.total_amount) - Number(cp.advance_paid),
                    remarks: `Balance from Billing #${cp.id}`
                }));
            addedCredit += newCredit.length;

            // Apply all synced data
            if (newWorkFromBilling.length || newWorkFromJobs.length) {
                setWorkEntries(prev => [...prev, ...newWorkFromBilling, ...newWorkFromJobs]);
            }
            if (newExpenses.length) {
                setExpenses(prev => [...prev, ...newExpenses]);
            }
            if (newCredit.length) {
                setCreditTransactions(prev => [...prev, ...newCredit]);
            }
            // Update opening balance from previous day if not set
            if (!openingBalance && previous_closing_balance) {
                setOpeningBalance(previous_closing_balance);
            }

            const summary = `Synced: ${addedWork} work entries, ${addedExpenses} expenses, ${addedCredit} credit transactions`;
            setSyncSummary(summary);
            setTimeout(() => setSyncSummary(null), 5000);

            if (addedWork === 0 && addedExpenses === 0 && addedCredit === 0) {
                alert('Everything is already synced. No new data found.');
            }
        } catch (error) {
            console.error('Error syncing from billing:', error);
            alert('Failed to sync data from billing');
        } finally {
            setSyncing(false);
        }
    };

    const importCompletedJobs = async () => {
        await syncFromBilling();
    };

    const totals = calculateTotals();
    const isFinalized = report?.status === 'Finalized';

    return (
        <div className="stack-lg">
            <div className="page-header">
                <div>
                    <h1 className="section-title">Daily Report - Offset Book</h1>
                    <p className="section-subtitle">Daily work, expenses, and cash tracking</p>
                </div>
                <div className="row gap-sm" style={{ flexWrap: 'wrap' }}>
                    <input
                        type="date"
                        className="input-field"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        disabled={isFinalized}
                        style={{ width: '180px' }}
                    />
                    {!isFinalized && (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={syncFromBilling}
                            disabled={syncing || loading}
                            title="Sync billing, jobs & expense data for this date"
                        >
                            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
                            {syncing ? 'Syncing...' : 'Sync from Billing'}
                        </button>
                    )}
                    {isFinalized && (
                        <span className="badge badge--success">
                            <Lock size={14} /> Finalized
                        </span>
                    )}
                </div>
            </div>

            {syncSummary && (
                <div className="panel" style={{ background: 'var(--success-bg, #dcfce7)', border: '1px solid var(--success, #16a34a)', padding: '10px 16px', borderRadius: '8px' }}>
                    <span style={{ color: 'var(--success, #16a34a)', fontWeight: 500, fontSize: 14 }}>✓ {syncSummary}</span>
                </div>
            )}

            {/* Opening Balance */}
            <div className="panel">
                <h3 className="panel-title">Opening Balance</h3>
                <div className="form-group" style={{ maxWidth: '300px' }}>
                    <label className="form-label">Opening Balance (₹)</label>
                    <input
                        type="number"
                        className="input-field"
                        value={openingBalance}
                        onChange={(e) => setOpeningBalance(e.target.value)}
                        disabled={isFinalized}
                        step="0.01"
                    />
                </div>
            </div>

            {/* Work Entries */}
            <div className="panel">
                <div className="panel-header">
                    <h3 className="panel-title">
                        <FileText size={20} /> Work Entries
                    </h3>
                    {!isFinalized && (
                        <div className="row gap-sm">
                            <button
                                className="btn btn-ghost btn-primary btn-sm"
                                onClick={syncFromBilling}
                                disabled={syncing || loading}
                                title="Sync billing, jobs & expense data"
                            >
                                <RefreshCw size={16} className={syncing ? 'spin' : ''} /> Sync Data
                            </button>
                            <button className="btn btn-primary btn-sm" onClick={addWorkEntry}>
                                <Plus size={16} /> Add Work
                            </button>
                        </div>
                    )}
                </div>

                <div className="stack-md">
                    {workEntries.map((entry, index) => (
                        <div key={index} className="panel panel--nested">
                            <div className="row gap-md items-start">
                                <div className="flex-1 stack-sm">
                                    <div className="row gap-md">
                                        <div className="form-group flex-1">
                                            <label className="form-label">Work Name *</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                value={entry.work_name}
                                                onChange={(e) => updateWorkEntry(index, 'work_name', e.target.value)}
                                                disabled={isFinalized}
                                                placeholder="e.g., Business Cards"
                                            />
                                        </div>
                                        <div className="form-group flex-1">
                                            <label className="form-label">Payment Type</label>
                                            <select
                                                className="input-field"
                                                value={entry.payment_type}
                                                onChange={(e) => updateWorkEntry(index, 'payment_type', e.target.value)}
                                                disabled={isFinalized}
                                            >
                                                <option value="Cash">Cash</option>
                                                <option value="UPI">UPI</option>
                                                <option value="Both">Both</option>
                                                <option value="Credit">Credit</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="row gap-md">
                                        <div className="form-group flex-1">
                                            <label className="form-label">Cash Amount (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={entry.cash_amount}
                                                onChange={(e) => updateWorkEntry(index, 'cash_amount', e.target.value)}
                                                disabled={isFinalized}
                                                step="0.01"
                                            />
                                        </div>
                                        <div className="form-group flex-1">
                                            <label className="form-label">UPI Amount (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={entry.upi_amount}
                                                onChange={(e) => updateWorkEntry(index, 'upi_amount', e.target.value)}
                                                disabled={isFinalized}
                                                step="0.01"
                                            />
                                        </div>
                                        <div className="form-group flex-1">
                                            <label className="form-label">Total Collected (₹)</label>
                                            <input
                                                type="number"
                                                className="input-field"
                                                value={entry.amount_collected}
                                                disabled
                                                style={{ backgroundColor: 'var(--surface-secondary)' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">Work Details</label>
                                        <textarea
                                            className="input-field"
                                            value={entry.work_details}
                                            onChange={(e) => updateWorkEntry(index, 'work_details', e.target.value)}
                                            disabled={isFinalized}
                                            rows="2"
                                            placeholder="Additional details..."
                                        />
                                    </div>
                                </div>

                                {!isFinalized && (
                                    <button
                                        className="btn btn-ghost btn-danger"
                                        onClick={() => removeWorkEntry(index)}
                                        style={{ marginTop: '24px' }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {workEntries.length === 0 && (
                        <p className="text-center muted" style={{ padding: '20px' }}>
                            No work entries yet. Click "Add Work" to get started.
                        </p>
                    )}
                </div>
            </div>

            {/* Expenses */}
            <div className="panel">
                <div className="panel-header">
                    <h3 className="panel-title">
                        <IndianRupee size={20} /> Expenses
                    </h3>
                    {!isFinalized && (
                        <button className="btn btn-primary btn-sm" onClick={addExpense}>
                            <Plus size={16} /> Add Expense
                        </button>
                    )}
                </div>

                <div className="stack-sm">
                    {expenses.map((expense, index) => (
                        <div key={index} className="row gap-md items-end">
                            <div className="form-group flex-1">
                                <label className="form-label">Description *</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={expense.expense_description}
                                    onChange={(e) => updateExpense(index, 'expense_description', e.target.value)}
                                    disabled={isFinalized}
                                    placeholder="e.g., Paper purchase"
                                />
                            </div>
                            <div className="form-group" style={{ width: '150px' }}>
                                <label className="form-label">Amount (₹)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={expense.amount}
                                    onChange={(e) => updateExpense(index, 'amount', e.target.value)}
                                    disabled={isFinalized}
                                    step="0.01"
                                />
                            </div>
                            <div className="form-group" style={{ width: '120px' }}>
                                <label className="form-label">Method</label>
                                <select
                                    className="input-field"
                                    value={expense.payment_method}
                                    onChange={(e) => updateExpense(index, 'payment_method', e.target.value)}
                                    disabled={isFinalized}
                                >
                                    <option value="Cash">Cash</option>
                                    <option value="UPI">UPI</option>
                                    <option value="Both">Both</option>
                                </select>
                            </div>
                            {!isFinalized && (
                                <button
                                    className="btn btn-ghost btn-danger"
                                    onClick={() => removeExpense(index)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}

                    {expenses.length === 0 && (
                        <p className="text-center muted" style={{ padding: '20px' }}>
                            No expenses recorded.
                        </p>
                    )}
                </div>
            </div>

            {/* Credit Transactions */}
            <div className="panel">
                <div className="panel-header">
                    <h3 className="panel-title">Credit Transactions</h3>
                    {!isFinalized && (
                        <button className="btn btn-primary btn-sm" onClick={addCreditTransaction}>
                            <Plus size={16} /> Add Transaction
                        </button>
                    )}
                </div>

                <div className="stack-sm">
                    {creditTransactions.map((txn, index) => (
                        <div key={index} className="row gap-md items-end">
                            <div className="form-group" style={{ width: '140px' }}>
                                <label className="form-label">Type</label>
                                <select
                                    className="input-field"
                                    value={txn.transaction_type}
                                    onChange={(e) => updateCreditTransaction(index, 'transaction_type', e.target.value)}
                                    disabled={isFinalized}
                                >
                                    <option value="Credit Out">Credit Out</option>
                                    <option value="Credit In">Credit In</option>
                                </select>
                            </div>
                            <div className="form-group flex-1">
                                <label className="form-label">Customer Name *</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={txn.customer_name}
                                    onChange={(e) => updateCreditTransaction(index, 'customer_name', e.target.value)}
                                    disabled={isFinalized}
                                />
                            </div>
                            <div className="form-group" style={{ width: '150px' }}>
                                <label className="form-label">Phone</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={txn.customer_phone}
                                    onChange={(e) => updateCreditTransaction(index, 'customer_phone', e.target.value)}
                                    disabled={isFinalized}
                                />
                            </div>
                            <div className="form-group" style={{ width: '130px' }}>
                                <label className="form-label">Amount (₹)</label>
                                <input
                                    type="number"
                                    className="input-field"
                                    value={txn.amount}
                                    onChange={(e) => updateCreditTransaction(index, 'amount', e.target.value)}
                                    disabled={isFinalized}
                                    step="0.01"
                                />
                            </div>
                            {!isFinalized && (
                                <button
                                    className="btn btn-ghost btn-danger"
                                    onClick={() => removeCreditTransaction(index)}
                                >
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    ))}

                    {creditTransactions.length === 0 && (
                        <p className="text-center muted" style={{ padding: '20px' }}>
                            No credit transactions.
                        </p>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className="panel" style={{ backgroundColor: 'var(--surface-secondary)' }}>
                <h3 className="panel-title">Daily Summary</h3>
                <div className="row gap-lg" style={{ flexWrap: 'wrap' }}>
                    <div className="stack-xs">
                        <span className="text-sm muted">Opening Balance</span>
                        <span className="text-lg font-medium">₹{parseFloat(openingBalance).toFixed(2)}</span>
                    </div>
                    <div className="stack-xs">
                        <span className="text-sm muted">Total Collected</span>
                        <span className="text-lg font-medium text-success">
                            <TrendingUp size={18} style={{ display: 'inline', marginRight: '4px' }} />
                            ₹{totals.totalCollected.toFixed(2)}
                        </span>
                    </div>
                    <div className="stack-xs">
                        <span className="text-sm muted">Total Expenses</span>
                        <span className="text-lg font-medium text-error">
                            <TrendingDown size={18} style={{ display: 'inline', marginRight: '4px' }} />
                            ₹{totals.totalExpenses.toFixed(2)}
                        </span>
                    </div>
                    <div className="stack-xs">
                        <span className="text-sm muted">Credit Out</span>
                        <span className="text-lg font-medium text-warning">₹{totals.totalCreditOut.toFixed(2)}</span>
                    </div>
                    <div className="stack-xs">
                        <span className="text-sm muted">Credit In</span>
                        <span className="text-lg font-medium text-success">₹{totals.totalCreditIn.toFixed(2)}</span>
                    </div>
                    <div className="stack-xs" style={{ marginLeft: 'auto' }}>
                        <span className="text-sm muted">Closing Balance</span>
                        <span className="text-xl font-bold" style={{ color: 'var(--primary)' }}>
                            ₹{totals.closingBalance.toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Actions */}
            {!isFinalized && (
                <div className="row gap-md justify-end">
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={loading}
                    >
                        <Save size={18} />
                        {loading ? 'Saving...' : 'Save Report'}
                    </button>
                    {(user.role === 'Admin' || user.role === 'Accountant') && report?.id && (
                        <button
                            className="btn btn-success"
                            onClick={handleFinalize}
                        >
                            <Lock size={18} />
                            Finalize Report
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default DailyReportOffset;

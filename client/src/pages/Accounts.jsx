import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Loader2, Search, Download, Building2, FileText,
    ArrowUpRight, ArrowDownRight, Receipt, IndianRupee,
    ChevronLeft, ChevronRight, Calendar, Upload,
    Eye, Trash2, X, Sparkles, CheckCircle, AlertCircle,
    TrendingUp, TrendingDown, PieChart, BarChart3, FileUp,
    FolderOpen, Filter, MoreVertical, Edit3, Save, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import { formatCurrency as fmt } from '../constants';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import './Accounts.css';

const TABS = [
    { key: 'gst', label: 'GST Summary', icon: PieChart },
    { key: 'sales', label: 'Sales Register', icon: TrendingUp },
    { key: 'purchases', label: 'Purchase Register', icon: TrendingDown },
    { key: 'gst-report', label: 'GST Report', icon: BarChart3 },
    { key: 'bills', label: 'Bills & Documents', icon: FolderOpen },
    { key: 'upload', label: 'Upload Bill', icon: FileUp },
];

const DOCUMENT_TYPES = ['Invoice', 'Receipt', 'Bill', 'Quotation', 'Purchase Order', 'Agreement', 'License', 'Tax Document', 'Bank Statement', 'Other'];

const Accounts = () => {
    const [tab, setTab] = useState('gst');
    const [branches, setBranches] = useState([]);
    const [branchId, setBranchId] = useState('');

    useEffect(() => {
        api.get('/branches').then(r => setBranches(r.data)).catch(() => {});
    }, []);

    return (
        <div className="page-container">
            <div className="acc-header">
                <div className="acc-header__left">
                    <div className="acc-header__icon">
                        <Receipt size={24} />
                    </div>
                    <div>
                        <h1 className="acc-header__title">Accounts & GST</h1>
                        <p className="acc-header__subtitle">GST summary, registers, filing data & bill management</p>
                    </div>
                </div>
                <div className="acc-header__right">
                    <Building2 size={16} className="muted" />
                    <select className="acc-select" value={branchId} onChange={e => setBranchId(e.target.value)}>
                        <option value="">All Branches</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                </div>
            </div>

            <div className="acc-tab-bar">
                {TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.key}
                            className={`acc-tab ${tab === t.key ? 'acc-tab--active' : ''}`}
                            onClick={() => setTab(t.key)}
                        >
                            <Icon size={16} />
                            <span>{t.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="acc-content">
                {tab === 'gst' && <GSTSummaryTab branchId={branchId} />}
                {tab === 'sales' && <SalesRegisterTab branchId={branchId} />}
                {tab === 'purchases' && <PurchaseRegisterTab branchId={branchId} />}
                {tab === 'gst-report' && <GSTReportTab branchId={branchId} />}
                {tab === 'bills' && <BillsDocsTab branchId={branchId} />}
                {tab === 'upload' && <UploadBillTab onUploaded={() => setTab('bills')} />}
            </div>
        </div>
    );
};

/* ─────────────────────── GST Summary Tab ─────────────────────── */
const GSTSummaryTab = ({ branchId }) => {
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? `${now.getFullYear()}-04-01` : `${now.getFullYear() - 1}-04-01`;
    const fyEnd = now.getMonth() >= 3 ? `${now.getFullYear() + 1}-03-31` : `${now.getFullYear()}-03-31`;

    const [startDate, setStartDate] = useState(fyStart);
    const [endDate, setEndDate] = useState(fyEnd);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ startDate, endDate });
            if (branchId) params.append('branch_id', branchId);
            const res = await api.get(`/accounts/gst-summary?${params}`);
            setData(res.data);
        } catch { setData(null); }
        finally { setLoading(false); }
    }, [startDate, endDate, branchId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) return <LoadingSpinner />;
    if (!data) return <EmptyState text="Failed to load GST data" />;

    const t = data.totals;

    return (
        <div className="acc-stack">
            <div className="acc-date-bar">
                <Calendar size={16} className="muted" />
                <input type="date" className="acc-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                <span className="muted">to</span>
                <input type="date" className="acc-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                <button className="acc-btn acc-btn--ghost" onClick={fetchData} title="Refresh">
                    <RefreshCw size={15} />
                </button>
            </div>

            {/* KPI Cards */}
            <div className="acc-kpi-grid">
                <div className="acc-kpi acc-kpi--green">
                    <div className="acc-kpi__icon"><ArrowUpRight size={20} /></div>
                    <div className="acc-kpi__body">
                        <div className="acc-kpi__label">Output GST (Collected)</div>
                        <div className="acc-kpi__value">{fmt(t.output_total)}</div>
                    </div>
                </div>
                <div className="acc-kpi acc-kpi--amber">
                    <div className="acc-kpi__icon"><ArrowDownRight size={20} /></div>
                    <div className="acc-kpi__body">
                        <div className="acc-kpi__label">Input GST (Purchases)</div>
                        <div className="acc-kpi__value">{fmt(t.input_gst)}</div>
                    </div>
                </div>
                <div className={`acc-kpi ${t.net_gst_liability > 0 ? 'acc-kpi--red' : 'acc-kpi--green'}`}>
                    <div className="acc-kpi__icon"><IndianRupee size={20} /></div>
                    <div className="acc-kpi__body">
                        <div className="acc-kpi__label">Net GST Liability</div>
                        <div className="acc-kpi__value">{fmt(t.net_gst_liability)}</div>
                    </div>
                </div>
                <div className="acc-kpi acc-kpi--blue">
                    <div className="acc-kpi__icon"><TrendingUp size={20} /></div>
                    <div className="acc-kpi__body">
                        <div className="acc-kpi__label">Total Sales</div>
                        <div className="acc-kpi__value">{fmt(t.total_sales)}</div>
                    </div>
                </div>
            </div>

            <div className="acc-split-grid">
                {/* Output GST by month */}
                <div className="acc-card">
                    <div className="acc-card__header">
                        <h3 className="acc-card__title">
                            <ArrowUpRight size={18} className="text-ok" />
                            Output GST (Sales)
                        </h3>
                    </div>
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th className="text-right">Invoices</th>
                                    <th className="text-right">Taxable</th>
                                    <th className="text-right">SGST</th>
                                    <th className="text-right">CGST</th>
                                    <th className="text-right">Total GST</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.output_gst.map(r => (
                                    <tr key={r.month}>
                                        <td className="font-medium">{formatMonth(r.month)}</td>
                                        <td className="text-right">{r.invoice_count}</td>
                                        <td className="text-right">{fmt(Number(r.taxable_value))}</td>
                                        <td className="text-right">{fmt(Number(r.sgst_collected))}</td>
                                        <td className="text-right">{fmt(Number(r.cgst_collected))}</td>
                                        <td className="text-right font-bold">{fmt(Number(r.total_gst_collected))}</td>
                                    </tr>
                                ))}
                                {data.output_gst.length === 0 && <tr><td colSpan={6} className="text-center muted p-16">No sales data</td></tr>}
                            </tbody>
                            <tfoot>
                                <tr className="acc-table__total-row">
                                    <td>Total</td>
                                    <td className="text-right">{data.output_gst.reduce((s, r) => s + r.invoice_count, 0)}</td>
                                    <td className="text-right">{fmt(t.total_sales - t.output_total)}</td>
                                    <td className="text-right">{fmt(t.output_sgst)}</td>
                                    <td className="text-right">{fmt(t.output_cgst)}</td>
                                    <td className="text-right">{fmt(t.output_total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Input GST by month */}
                <div className="acc-card">
                    <div className="acc-card__header">
                        <h3 className="acc-card__title">
                            <ArrowDownRight size={18} className="text-warning" />
                            Input GST (Purchases)
                        </h3>
                    </div>
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>Month</th>
                                    <th className="text-right">Bills</th>
                                    <th className="text-right">Purchase Value</th>
                                    <th className="text-right">Est. Input GST</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.input_gst.map(r => (
                                    <tr key={r.month}>
                                        <td className="font-medium">{formatMonth(r.month)}</td>
                                        <td className="text-right">{r.bill_count}</td>
                                        <td className="text-right">{fmt(Number(r.total_purchase_value))}</td>
                                        <td className="text-right font-bold">{fmt(Number(r.estimated_input_gst))}</td>
                                    </tr>
                                ))}
                                {data.input_gst.length === 0 && <tr><td colSpan={4} className="text-center muted p-16">No purchase data</td></tr>}
                            </tbody>
                            <tfoot>
                                <tr className="acc-table__total-row">
                                    <td>Total</td>
                                    <td className="text-right">{data.input_gst.reduce((s, r) => s + r.bill_count, 0)}</td>
                                    <td className="text-right">{fmt(t.total_purchases)}</td>
                                    <td className="text-right">{fmt(t.input_gst)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>

            {/* Net liability card */}
            <div className={`acc-liability-card ${t.net_gst_liability > 0 ? 'acc-liability-card--payable' : 'acc-liability-card--credit'}`}>
                <div className="acc-liability-card__left">
                    <div className="acc-liability-card__label">Net GST Payable</div>
                    <div className="acc-liability-card__amount">
                        {fmt(Math.abs(t.net_gst_liability))}
                    </div>
                    <div className="acc-liability-card__hint">
                        {t.net_gst_liability > 0 ? 'You owe this to the government' : t.net_gst_liability < 0 ? 'Input tax credit available' : 'Balanced'}
                    </div>
                </div>
                <div className="acc-liability-card__right">
                    <div className="acc-liability-card__item">Output: <strong>{fmt(t.output_total)}</strong></div>
                    <div className="acc-liability-card__item">Input: <strong>{fmt(t.input_gst)}</strong></div>
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────── Sales Register Tab ─────────────────────── */
const SalesRegisterTab = ({ branchId }) => {
    const [rows, setRows] = useState([]);
    const [totals, setTotals] = useState({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 30, startDate, endDate });
            if (branchId) params.append('branch_id', branchId);
            if (search) params.append('search', search);
            const res = await api.get(`/accounts/sales-register?${params}`);
            setRows(res.data.data || []);
            setTotals(res.data.totals || {});
            setTotalPages(res.data.totalPages || 1);
        } catch { setRows([]); }
        finally { setLoading(false); }
    }, [page, startDate, endDate, branchId, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const exportCSV = () => {
        if (!rows.length) return;
        const headers = ['Date', 'Invoice', 'Customer', 'GSTIN', 'Branch', 'Taxable', 'SGST', 'CGST', 'Total', 'Paid', 'Balance'];
        const csv = [headers.join(','), ...rows.map(r =>
            [new Date(r.payment_date).toLocaleDateString('en-IN'), r.invoice_number || '', r.customer_name, r.customer_gstin || '', r.branch_name || '',
             Number(r.net_amount), Number(r.sgst_amount), Number(r.cgst_amount), Number(r.total_amount), Number(r.advance_paid), Number(r.balance_amount)]
            .map(v => `"${v}"`).join(',')
        )].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sales-register-${startDate}-to-${endDate}.csv`;
        a.click();
    };

    return (
        <div className="acc-stack">
            <div className="acc-date-bar">
                <Calendar size={16} className="muted" />
                <input type="date" className="acc-input" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
                <span className="muted">to</span>
                <input type="date" className="acc-input" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
                <div className="acc-date-bar__search">
                    <Search size={16} className="muted" />
                    <input type="text" className="acc-input" placeholder="Search customer / invoice..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <button className="acc-btn acc-btn--ghost" onClick={exportCSV} title="Export CSV">
                    <Download size={15} /> <span>Export</span>
                </button>
            </div>

            {/* Summary tiles */}
            <div className="acc-kpi-grid acc-kpi-grid--compact">
                <KpiTile label="Total Sales" value={fmt(totals.total_amount)} icon={<TrendingUp size={18} />} />
                <KpiTile label="Taxable Value" value={fmt(totals.total_taxable)} icon={<Receipt size={18} />} />
                <KpiTile label="SGST" value={fmt(totals.total_sgst)} icon={<IndianRupee size={18} />} />
                <KpiTile label="CGST" value={fmt(totals.total_cgst)} icon={<IndianRupee size={18} />} />
                <KpiTile label="Collected" value={fmt(totals.total_collected)} icon={<CheckCircle size={18} />} color="green" />
                <KpiTile label="Balance Due" value={fmt(totals.total_balance)} icon={<AlertCircle size={18} />} color="red" />
            </div>

            {loading ? <LoadingSpinner /> : (
                <div className="acc-card">
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Invoice</th>
                                    <th>Customer</th>
                                    <th>GSTIN</th>
                                    <th>Branch</th>
                                    <th className="text-right">Taxable</th>
                                    <th className="text-right">SGST</th>
                                    <th className="text-right">CGST</th>
                                    <th className="text-right">Total</th>
                                    <th className="text-right">Paid</th>
                                    <th className="text-right">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length > 0 ? rows.map(r => (
                                    <tr key={r.id}>
                                        <td className="text-nowrap">{new Date(r.payment_date).toLocaleDateString('en-IN')}</td>
                                        <td className="font-medium">{r.invoice_number || '—'}</td>
                                        <td>
                                            <div className="font-medium">{r.customer_name}</div>
                                            {r.customer_mobile && <div className="acc-sub-text">{r.customer_mobile}</div>}
                                        </td>
                                        <td className="acc-gstin">{r.customer_gstin || '—'}</td>
                                        <td>{r.branch_name || '—'}</td>
                                        <td className="text-right">{fmt(Number(r.net_amount))}</td>
                                        <td className="text-right">{fmt(Number(r.sgst_amount))}</td>
                                        <td className="text-right">{fmt(Number(r.cgst_amount))}</td>
                                        <td className="text-right font-bold">{fmt(Number(r.total_amount))}</td>
                                        <td className="text-right acc-text-ok">{fmt(Number(r.advance_paid))}</td>
                                        <td className="text-right" style={{ color: Number(r.balance_amount) > 0 ? 'var(--error, #dc2626)' : undefined }}>
                                            {fmt(Number(r.balance_amount))}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={11} className="text-center muted p-16">No sales found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </div>
            )}
        </div>
    );
};

/* ─────────────────────── Purchase Register Tab ─────────────────────── */
const PurchaseRegisterTab = ({ branchId }) => {
    const [rows, setRows] = useState([]);
    const [totals, setTotals] = useState({});
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(); d.setDate(1);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [expandedBill, setExpandedBill] = useState(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page, limit: 30, startDate, endDate });
            if (branchId) params.append('branch_id', branchId);
            if (search) params.append('search', search);
            const res = await api.get(`/accounts/purchase-register?${params}`);
            setRows(res.data.data || []);
            setTotals(res.data.totals || {});
            setTotalPages(res.data.totalPages || 1);
        } catch { setRows([]); }
        finally { setLoading(false); }
    }, [page, startDate, endDate, branchId, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const exportCSV = () => {
        if (!rows.length) return;
        const headers = ['Date', 'Bill No', 'Vendor', 'GSTIN', 'Branch', 'Amount', 'Est GST', 'Paid', 'Balance'];
        const csv = [headers.join(','), ...rows.map(r =>
            [new Date(r.bill_date).toLocaleDateString('en-IN'), r.bill_number || '', r.vendor_name, r.vendor_gstin || '', r.branch_name || '',
             Number(r.total_amount), Number(r.estimated_gst), Number(r.paid_amount), Number(r.total_amount) - Number(r.paid_amount)]
            .map(v => `"${v}"`).join(',')
        )].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `purchase-register-${startDate}-to-${endDate}.csv`;
        a.click();
    };

    return (
        <div className="acc-stack">
            <div className="acc-date-bar">
                <Calendar size={16} className="muted" />
                <input type="date" className="acc-input" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} />
                <span className="muted">to</span>
                <input type="date" className="acc-input" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} />
                <div className="acc-date-bar__search">
                    <Search size={16} className="muted" />
                    <input type="text" className="acc-input" placeholder="Search vendor / bill..." value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }} />
                </div>
                <button className="acc-btn acc-btn--ghost" onClick={exportCSV} title="Export CSV">
                    <Download size={15} /> <span>Export</span>
                </button>
            </div>

            <div className="acc-kpi-grid acc-kpi-grid--compact">
                <KpiTile label="Total Bills" value={totals.total_bills || 0} icon={<FileText size={18} />} />
                <KpiTile label="Total Purchases" value={fmt(totals.total_amount)} icon={<TrendingDown size={18} />} />
                <KpiTile label="Est. Input GST" value={fmt(totals.total_estimated_gst)} icon={<IndianRupee size={18} />} color="amber" />
            </div>

            {loading ? <LoadingSpinner /> : (
                <div className="acc-card">
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Bill No</th>
                                    <th>Vendor</th>
                                    <th>GSTIN</th>
                                    <th>Branch</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">Est. GST</th>
                                    <th className="text-right">Paid</th>
                                    <th className="text-right">Balance</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length > 0 ? rows.map(r => {
                                    const balance = Number(r.total_amount) - Number(r.paid_amount);
                                    const items = parseItems(r.items);
                                    return (
                                        <React.Fragment key={r.id}>
                                            <tr>
                                                <td className="text-nowrap">{new Date(r.bill_date).toLocaleDateString('en-IN')}</td>
                                                <td className="font-medium">{r.bill_number || '—'}</td>
                                                <td>
                                                    <div className="font-medium">{r.vendor_name}</div>
                                                    {r.vendor_phone && <div className="acc-sub-text">{r.vendor_phone}</div>}
                                                </td>
                                                <td className="acc-gstin">{r.vendor_gstin || '—'}</td>
                                                <td>{r.branch_name || '—'}</td>
                                                <td className="text-right font-bold">{fmt(Number(r.total_amount))}</td>
                                                <td className="text-right">{fmt(Number(r.estimated_gst))}</td>
                                                <td className="text-right acc-text-ok">{fmt(Number(r.paid_amount))}</td>
                                                <td className="text-right" style={{ color: balance > 0 ? 'var(--error, #dc2626)' : undefined }}>
                                                    {fmt(balance)}
                                                </td>
                                                <td>
                                                    {items.length > 0 && (
                                                        <button className="acc-btn acc-btn--ghost acc-btn--xs" onClick={() => setExpandedBill(expandedBill === r.id ? null : r.id)}>
                                                            {expandedBill === r.id ? 'Hide' : 'Items'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {expandedBill === r.id && items.length > 0 && (
                                                <tr>
                                                    <td colSpan={10} className="acc-expanded-row">
                                                        <table className="acc-table acc-table--nested">
                                                            <thead>
                                                                <tr>
                                                                    <th>Item</th>
                                                                    <th>SKU</th>
                                                                    <th className="text-right">Qty</th>
                                                                    <th className="text-right">Unit Cost</th>
                                                                    <th className="text-right">GST %</th>
                                                                    <th className="text-right">Total</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {items.map((it, idx) => (
                                                                    <tr key={idx}>
                                                                        <td>{it.item_name || '—'}</td>
                                                                        <td className="muted">{it.sku || '—'}</td>
                                                                        <td className="text-right">{it.quantity}</td>
                                                                        <td className="text-right">{fmt(Number(it.unit_cost))}</td>
                                                                        <td className="text-right">{it.gst_rate || 0}%</td>
                                                                        <td className="text-right font-bold">{fmt(Number(it.total_cost))}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                }) : (
                                    <tr><td colSpan={10} className="text-center muted p-16">No purchase bills found</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination page={page} totalPages={totalPages} onChange={setPage} />
                </div>
            )}
        </div>
    );
};

/* ─────────────────────── GST Report Tab (GSTR-1 / GSTR-3B) ─────────────────────── */
const GSTReportTab = ({ branchId }) => {
    const now = new Date();
    const [month, setMonth] = useState(String(now.getMonth() + 1));
    const [year, setYear] = useState(String(now.getFullYear()));
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ month, year });
            if (branchId) params.append('branch_id', branchId);
            const res = await api.get(`/accounts/gst-report?${params}`);
            setData(res.data);
        } catch { setData(null); }
        finally { setLoading(false); }
    }, [month, year, branchId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    const years = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y);

    if (loading) return <LoadingSpinner />;
    if (!data) return <EmptyState text="Failed to load GST report" />;

    const { gstr1, gstr3b } = data;

    return (
        <div className="acc-stack">
            <div className="acc-date-bar">
                <Calendar size={16} className="muted" />
                <select className="acc-input" value={month} onChange={e => setMonth(e.target.value)}>
                    {monthNames.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="acc-input" value={year} onChange={e => setYear(e.target.value)}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
            </div>

            {/* GSTR-3B Summary */}
            <div className="acc-card">
                <div className="acc-card__header">
                    <h3 className="acc-card__title">
                        <Receipt size={18} />
                        GSTR-3B Summary — {monthNames[Number(month) - 1]} {year}
                    </h3>
                </div>
                <div className="acc-kpi-grid acc-kpi-grid--compact" style={{ padding: '0 16px 16px' }}>
                    <KpiTile label="Gross Sales" value={fmt(gstr3b.gross_sales)} icon={<TrendingUp size={18} />} />
                    <KpiTile label="Taxable Value" value={fmt(gstr3b.total_taxable)} icon={<Receipt size={18} />} />
                    <KpiTile label="SGST" value={fmt(gstr3b.total_sgst)} icon={<IndianRupee size={18} />} />
                    <KpiTile label="CGST" value={fmt(gstr3b.total_cgst)} icon={<IndianRupee size={18} />} />
                    <KpiTile label="Total Output GST" value={fmt(gstr3b.total_output_gst)} icon={<AlertCircle size={18} />} color="red" />
                </div>
            </div>

            {/* GSTR-1: B2B */}
            <div className="acc-card">
                <div className="acc-card__header">
                    <h3 className="acc-card__title">
                        <FileText size={18} />
                        GSTR-1 — B2B Invoices (with GSTIN)
                    </h3>
                </div>
                {gstr1.b2b.length > 0 ? (
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>GSTIN</th>
                                    <th>Customer</th>
                                    <th className="text-right">Invoices</th>
                                    <th className="text-right">Taxable</th>
                                    <th className="text-right">SGST</th>
                                    <th className="text-right">CGST</th>
                                    <th className="text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gstr1.b2b.map((r, i) => (
                                    <tr key={i}>
                                        <td className="acc-gstin">{r.gstin}</td>
                                        <td className="font-medium">{r.customer_name}</td>
                                        <td className="text-right">{r.invoice_count}</td>
                                        <td className="text-right">{fmt(Number(r.taxable_value))}</td>
                                        <td className="text-right">{fmt(Number(r.sgst))}</td>
                                        <td className="text-right">{fmt(Number(r.cgst))}</td>
                                        <td className="text-right font-bold">{fmt(Number(r.total))}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <div className="text-center muted p-16">No B2B invoices this month</div>}
            </div>

            {/* GSTR-1: B2C */}
            <div className="acc-card">
                <div className="acc-card__header">
                    <h3 className="acc-card__title">
                        <IndianRupee size={18} />
                        GSTR-1 — B2C Sales (without GSTIN)
                    </h3>
                </div>
                <div className="acc-kpi-grid acc-kpi-grid--compact" style={{ padding: '0 16px 16px' }}>
                    <KpiTile label="Invoices" value={gstr1.b2c.count} icon={<FileText size={18} />} />
                    <KpiTile label="Taxable Value" value={fmt(gstr1.b2c.taxable_value)} icon={<Receipt size={18} />} />
                    <KpiTile label="SGST" value={fmt(gstr1.b2c.sgst)} icon={<IndianRupee size={18} />} />
                    <KpiTile label="CGST" value={fmt(gstr1.b2c.cgst)} icon={<IndianRupee size={18} />} />
                    <KpiTile label="Total" value={fmt(gstr1.b2c.total)} icon={<TrendingUp size={18} />} />
                </div>
            </div>
        </div>
    );
};

/* ─────────────────────── Bills & Documents Tab ─────────────────────── */
const BillsDocsTab = ({ branchId }) => {
    const { confirm } = useConfirm();
    const [docs, setDocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState({ document_type: '', vendor_name: '', start_date: '', end_date: '' });
    const [editingDoc, setEditingDoc] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadForm, setUploadForm] = useState({ document_type: 'Invoice', related_tab: '', vendor_name: '', bill_number: '', bill_date: new Date().toISOString().split('T')[0], amount: '', description: '', file: null });

    const fetchDocs = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (filter.document_type) params.document_type = filter.document_type;
            if (filter.vendor_name) params.vendor_name = filter.vendor_name;
            if (filter.start_date) params.start_date = filter.start_date;
            if (filter.end_date) params.end_date = filter.end_date;
            const r = await api.get('/bills-documents', { params });
            setDocs(r.data);
        } catch { setDocs([]); }
        finally { setLoading(false); }
    }, [filter]);

    useEffect(() => { fetchDocs(); }, [fetchDocs]);

    const handleDelete = async (id) => {
        const ok = await confirm({ title: 'Delete Document', message: 'Are you sure you want to delete this document?', confirmText: 'Delete', type: 'danger' });
        if (!ok) return;
        try { await api.delete(`/bills-documents/${id}`); toast.success('Document deleted'); fetchDocs(); } catch { toast.error('Delete failed'); }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        setUploading(true);
        try {
            const fd = new FormData();
            if (uploadForm.file) fd.append('file', uploadForm.file);
            fd.append('document_type', uploadForm.document_type);
            fd.append('related_tab', uploadForm.related_tab);
            fd.append('vendor_name', uploadForm.vendor_name);
            fd.append('bill_number', uploadForm.bill_number);
            fd.append('bill_date', uploadForm.bill_date);
            fd.append('amount', uploadForm.amount);
            fd.append('description', uploadForm.description);
            const url = uploadForm.file ? '/bills-documents/upload' : '/bills-documents';
            await api.post(url, uploadForm.file ? fd : uploadForm, uploadForm.file ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
            toast.success('Document uploaded');
            setShowUploadModal(false);
            setUploadForm({ document_type: 'Invoice', related_tab: '', vendor_name: '', bill_number: '', bill_date: new Date().toISOString().split('T')[0], amount: '', description: '', file: null });
            fetchDocs();
        } catch (err) { toast.error(err.response?.data?.message || 'Upload failed'); }
        finally { setUploading(false); }
    };

    const startEdit = (doc) => {
        setEditingDoc(doc.id);
        setEditForm({ vendor_name: doc.vendor_name || '', bill_number: doc.bill_number || '', amount: doc.amount || '', description: doc.description || '' });
    };

    const saveEdit = async (id) => {
        try {
            await api.put(`/bills-documents/${id}`, editForm);
            toast.success('Updated');
            setEditingDoc(null);
            fetchDocs();
        } catch { toast.error('Update failed'); }
    };

    const getFileUrl = (path) => {
        if (!path) return '';
        const base = api.defaults.baseURL?.replace(/\/api$/, '') || '';
        return `${base}${path}`;
    };

    const totalAmount = docs.reduce((s, d) => s + Number(d.amount || 0), 0);

    return (
        <div className="acc-stack">
            {/* Filters Bar */}
            <div className="acc-bills-toolbar">
                <div className="acc-bills-filters">
                    <select className="acc-input acc-input--sm" value={filter.document_type} onChange={e => setFilter(p => ({ ...p, document_type: e.target.value }))}>
                        <option value="">All Types</option>
                        {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <div className="acc-search-wrap">
                        <Search size={15} className="acc-search-icon" />
                        <input className="acc-input acc-input--sm" placeholder="Search vendor..." value={filter.vendor_name} onChange={e => setFilter(p => ({ ...p, vendor_name: e.target.value }))} />
                    </div>
                    <input type="date" className="acc-input acc-input--sm" value={filter.start_date} onChange={e => setFilter(p => ({ ...p, start_date: e.target.value }))} />
                    <input type="date" className="acc-input acc-input--sm" value={filter.end_date} onChange={e => setFilter(p => ({ ...p, end_date: e.target.value }))} />
                </div>
                <button className="acc-btn acc-btn--primary" onClick={() => setShowUploadModal(true)}>
                    <Upload size={15} /> Upload Document
                </button>
            </div>

            {/* Summary */}
            <div className="acc-kpi-grid acc-kpi-grid--compact">
                <KpiTile label="Total Documents" value={docs.length} icon={<FolderOpen size={18} />} />
                <KpiTile label="Total Value" value={fmt(totalAmount)} icon={<IndianRupee size={18} />} />
            </div>

            {/* Documents Table */}
            {loading ? <LoadingSpinner /> : docs.length > 0 ? (
                <div className="acc-card">
                    <div className="acc-table-wrap">
                        <table className="acc-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Vendor</th>
                                    <th>Bill #</th>
                                    <th className="text-right">Amount</th>
                                    <th>Description</th>
                                    <th>File</th>
                                    <th>Uploaded By</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {docs.map(d => (
                                    <tr key={d.id}>
                                        <td className="text-nowrap">{d.bill_date ? new Date(d.bill_date).toLocaleDateString('en-IN') : '—'}</td>
                                        <td><span className="acc-type-badge">{d.document_type}</span></td>
                                        {editingDoc === d.id ? (
                                            <>
                                                <td><input className="acc-input acc-input--sm" value={editForm.vendor_name} onChange={e => setEditForm(p => ({ ...p, vendor_name: e.target.value }))} /></td>
                                                <td><input className="acc-input acc-input--sm" value={editForm.bill_number} onChange={e => setEditForm(p => ({ ...p, bill_number: e.target.value }))} /></td>
                                                <td><input className="acc-input acc-input--sm" type="number" value={editForm.amount} onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} /></td>
                                                <td><input className="acc-input acc-input--sm" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="font-medium">{d.vendor_name || '—'}</td>
                                                <td>{d.bill_number || '—'}</td>
                                                <td className="text-right font-bold">{d.amount ? fmt(d.amount) : '—'}</td>
                                                <td className="acc-sub-text">{d.description || '—'}</td>
                                            </>
                                        )}
                                        <td>
                                            {d.file_path ? (
                                                <a href={getFileUrl(d.file_path)} target="_blank" rel="noreferrer" className="acc-btn acc-btn--ghost acc-btn--xs">
                                                    <Eye size={14} /> View
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td className="acc-sub-text">{d.uploaded_by_name || '—'}</td>
                                        <td>
                                            <div className="acc-action-group">
                                                {editingDoc === d.id ? (
                                                    <>
                                                        <button className="acc-btn acc-btn--ghost acc-btn--xs" onClick={() => saveEdit(d.id)}><Save size={14} /></button>
                                                        <button className="acc-btn acc-btn--ghost acc-btn--xs" onClick={() => setEditingDoc(null)}><X size={14} /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="acc-btn acc-btn--ghost acc-btn--xs" onClick={() => startEdit(d)}><Edit3 size={14} /></button>
                                                        <button className="acc-btn acc-btn--ghost acc-btn--xs acc-btn--danger" onClick={() => handleDelete(d.id)}><Trash2 size={14} /></button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="acc-empty">
                    <FolderOpen size={48} />
                    <h3>No documents yet</h3>
                    <p>Upload your first bill or document to get started</p>
                    <button className="acc-btn acc-btn--primary" onClick={() => setShowUploadModal(true)}>
                        <Upload size={15} /> Upload Document
                    </button>
                </div>
            )}

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="acc-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowUploadModal(false); }}>
                    <div className="acc-modal" onClick={e => e.stopPropagation()}>
                        <div className="acc-modal__header">
                            <h2>Upload Document</h2>
                            <button className="acc-btn acc-btn--ghost acc-btn--icon" onClick={() => setShowUploadModal(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUpload}>
                            <div className="acc-modal__body">
                                <div className="acc-form-grid">
                                    <div className="acc-form-group">
                                        <label>Document Type</label>
                                        <select className="acc-input" value={uploadForm.document_type} onChange={e => setUploadForm(p => ({ ...p, document_type: e.target.value }))}>
                                            {DOCUMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div className="acc-form-group">
                                        <label>Related Category</label>
                                        <select className="acc-input" value={uploadForm.related_tab} onChange={e => setUploadForm(p => ({ ...p, related_tab: e.target.value }))}>
                                            <option value="">General</option>
                                            <option value="office">Office</option>
                                            <option value="transport">Transport</option>
                                            <option value="misc">Misc</option>
                                            <option value="rent">Rent</option>
                                            <option value="vendor">Vendor</option>
                                        </select>
                                    </div>
                                    <div className="acc-form-group">
                                        <label>Vendor Name</label>
                                        <input className="acc-input" value={uploadForm.vendor_name} onChange={e => setUploadForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder="Vendor / supplier name" />
                                    </div>
                                    <div className="acc-form-group">
                                        <label>Bill Number</label>
                                        <input className="acc-input" value={uploadForm.bill_number} onChange={e => setUploadForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="e.g., INV-001" />
                                    </div>
                                    <div className="acc-form-group">
                                        <label>Bill Date</label>
                                        <input className="acc-input" type="date" value={uploadForm.bill_date} onChange={e => setUploadForm(p => ({ ...p, bill_date: e.target.value }))} />
                                    </div>
                                    <div className="acc-form-group">
                                        <label>Amount (₹)</label>
                                        <input className="acc-input" type="number" min="0" step="0.01" value={uploadForm.amount} onChange={e => setUploadForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
                                    </div>
                                    <div className="acc-form-group acc-form-group--full">
                                        <label>Description</label>
                                        <input className="acc-input" value={uploadForm.description} onChange={e => setUploadForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description..." />
                                    </div>
                                    <div className="acc-form-group acc-form-group--full">
                                        <label>File (JPG, PNG, PDF, XLS, DOC — max 10MB)</label>
                                        <input type="file" className="acc-input" accept=".jpg,.jpeg,.png,.webp,.pdf,.xls,.xlsx,.doc,.docx" onChange={e => setUploadForm(p => ({ ...p, file: e.target.files[0] || null }))} />
                                    </div>
                                </div>
                            </div>
                            <div className="acc-modal__footer">
                                <button type="button" className="acc-btn acc-btn--ghost" onClick={() => setShowUploadModal(false)}>Cancel</button>
                                <button type="submit" className="acc-btn acc-btn--primary" disabled={uploading}>
                                    {uploading ? <><Loader2 size={14} className="spin" /> Uploading...</> : <><Upload size={14} /> Upload</>}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ─────────────────────── Upload Bill Tab (Smart Upload) ─────────────────────── */
const UploadBillTab = ({ onUploaded }) => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState('upload');
    const [extractedData, setExtractedData] = useState(null);
    const [editableItems, setEditableItems] = useState([]);
    const [finalForm, setFinalForm] = useState({ document_type: 'Invoice', vendor_name: '', bill_number: '', bill_date: '', amount: '', description: '', related_tab: '' });
    const fileInputRef = useRef(null);

    const buildEditableItems = (items = []) =>
        items.map(item => {
            const quantity = item.quantity ?? '';
            const rate = item.rate ?? '';
            const gstPercent = item.gst_percent ?? '';
            const taxable = item.taxable_amount ?? (quantity && rate ? Number(quantity) * Number(rate) : '');
            const gstAmount = (taxable !== '' && gstPercent !== '') ? (Number(taxable) * Number(gstPercent) / 100) : '';
            const mrp = item.total_amount ?? (taxable !== '' && gstAmount !== '' ? Number(taxable) + Number(gstAmount) : taxable);
            return { item_name: item.description || '', hsn_sac: item.hsn_sac || '', quantity, rate, gst_percent: gstPercent, mrp: mrp !== '' && Number.isFinite(Number(mrp)) ? Number(mrp).toFixed(2) : '' };
        });

    const updateEditableItem = (index, key, value) => {
        setEditableItems(prev => {
            const next = [...prev];
            const row = { ...next[index], [key]: value };
            if (['quantity', 'rate', 'gst_percent'].includes(key)) {
                const taxable = Number(row.quantity || 0) * Number(row.rate || 0);
                const total = taxable + (taxable * Number(row.gst_percent || 0) / 100);
                row.mrp = Number.isFinite(total) ? total.toFixed(2) : row.mrp;
            }
            next[index] = row;
            return next;
        });
    };

    const extractBillDetails = async () => {
        if (!file) { setError('Please select a file'); return; }
        setLoading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post('/bills-documents/extract-details', formData);
            setExtractedData(response.data);
            setEditableItems(buildEditableItems(response.data.extracted_data?.items || []));
            setStep('review');
            setFinalForm(prev => ({
                ...prev,
                document_type: response.data.extracted_data.detected_type || 'Invoice',
                vendor_name: response.data.extracted_data.vendor_name || '',
                bill_number: response.data.extracted_data.bill_number || '',
                bill_date: response.data.extracted_data.bill_date || '',
                amount: response.data.extracted_data.amount || '',
                related_tab: response.data.category_suggestions?.[0]?.related_tab || ''
            }));
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Failed to extract bill details');
        } finally { setLoading(false); }
    };

    const submitBill = async () => {
        if (!finalForm.amount) { setError('Amount is required'); return; }
        setLoading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('document_type', finalForm.document_type);
            formData.append('related_tab', finalForm.related_tab);
            formData.append('vendor_name', finalForm.vendor_name);
            formData.append('bill_number', finalForm.bill_number);
            formData.append('bill_date', finalForm.bill_date);
            formData.append('amount', finalForm.amount);
            const autoDesc = editableItems.slice(0, 6).map(i => i.item_name).filter(Boolean).join(', ');
            formData.append('description', finalForm.description || autoDesc);
            formData.append('line_items', JSON.stringify(editableItems));
            await api.post('/bills-documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            toast.success('Bill uploaded successfully!');
            setStep('done');
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to upload bill');
        } finally { setLoading(false); }
    };

    return (
        <div className="acc-stack">
            {/* Step: Upload */}
            {step === 'upload' && (
                <div className="acc-upload-section">
                    <div className="acc-upload-header">
                        <Sparkles size={28} className="acc-upload-header__icon" />
                        <div>
                            <h2>Smart Bill Upload</h2>
                            <p>Upload a bill image or PDF — we'll auto-extract the details using AI</p>
                        </div>
                    </div>

                    <div
                        className="acc-upload-dropzone"
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) { setFile(f); setError(''); } }}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload size={48} className="acc-upload-dropzone__icon" />
                        <h3>Drag & drop your bill here</h3>
                        <p>or click to select a file</p>
                        <span className="acc-upload-dropzone__hint">Supports PNG, JPG, PDF (max 10MB)</span>
                        <input ref={fileInputRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setError(''); } }} />
                    </div>

                    {file && (
                        <div className="acc-file-selected">
                            <CheckCircle size={20} className="acc-text-ok" />
                            <span className="font-medium">{file.name}</span>
                            <span className="acc-sub-text">({(file.size / 1024).toFixed(0)} KB)</span>
                            <button className="acc-btn acc-btn--ghost acc-btn--xs" onClick={() => setFile(null)}>Change</button>
                        </div>
                    )}

                    {error && <div className="acc-error"><AlertCircle size={16} /> {error}</div>}

                    <button className="acc-btn acc-btn--primary acc-btn--lg" onClick={extractBillDetails} disabled={!file || loading}>
                        {loading ? <><Loader2 size={18} className="spin" /> Extracting...</> : <><Sparkles size={18} /> Extract Details</>}
                    </button>
                </div>
            )}

            {/* Step: Review extracted data */}
            {step === 'review' && extractedData && (
                <div className="acc-review-section">
                    <div className="acc-review-header">
                        <h2>Extracted Information</h2>
                        {extractedData.confidence < 0.5 && (
                            <div className="acc-warning">
                                <AlertCircle size={16} />
                                Low confidence ({Math.round((extractedData.confidence || 0) * 100)}%). Consider a clearer image.
                            </div>
                        )}
                    </div>

                    <div className="acc-card">
                        <div className="acc-card__header"><h3 className="acc-card__title">Basic Details</h3></div>
                        <div className="acc-form-grid" style={{ padding: '0 16px 16px' }}>
                            <div className="acc-form-group">
                                <label>Amount (₹)</label>
                                <input className="acc-input" type="number" value={finalForm.amount} onChange={e => setFinalForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
                            </div>
                            <div className="acc-form-group">
                                <label>Bill Number</label>
                                <input className="acc-input" value={finalForm.bill_number} onChange={e => setFinalForm(p => ({ ...p, bill_number: e.target.value }))} placeholder="INV-001" />
                            </div>
                            <div className="acc-form-group">
                                <label>Bill Date</label>
                                <input className="acc-input" type="date" value={finalForm.bill_date} onChange={e => setFinalForm(p => ({ ...p, bill_date: e.target.value }))} />
                            </div>
                            <div className="acc-form-group">
                                <label>Vendor Name</label>
                                <input className="acc-input" value={finalForm.vendor_name} onChange={e => setFinalForm(p => ({ ...p, vendor_name: e.target.value }))} placeholder="Vendor name" />
                            </div>
                            <div className="acc-form-group">
                                <label>Type</label>
                                <select className="acc-input" value={finalForm.document_type} onChange={e => setFinalForm(p => ({ ...p, document_type: e.target.value }))}>
                                    {DOCUMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="acc-form-group">
                                <label>Category</label>
                                <select className="acc-input" value={finalForm.related_tab} onChange={e => setFinalForm(p => ({ ...p, related_tab: e.target.value }))}>
                                    <option value="">General</option>
                                    <option value="office">Office</option>
                                    <option value="transport">Transport</option>
                                    <option value="misc">Misc</option>
                                    <option value="rent">Rent</option>
                                    <option value="vendor">Vendor</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Editable Items Table */}
                    {editableItems.length > 0 && (
                        <div className="acc-card">
                            <div className="acc-card__header"><h3 className="acc-card__title">Line Items (Editable)</h3></div>
                            <div className="acc-table-wrap">
                                <table className="acc-table">
                                    <thead>
                                        <tr>
                                            <th>Item Name</th>
                                            <th>HSN/SAC</th>
                                            <th className="text-right">Qty</th>
                                            <th className="text-right">Rate</th>
                                            <th className="text-right">GST %</th>
                                            <th className="text-right">MRP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editableItems.map((item, idx) => (
                                            <tr key={idx}>
                                                <td><input className="acc-input acc-input--sm" value={item.item_name} onChange={e => updateEditableItem(idx, 'item_name', e.target.value)} /></td>
                                                <td><input className="acc-input acc-input--sm" value={item.hsn_sac} onChange={e => updateEditableItem(idx, 'hsn_sac', e.target.value)} /></td>
                                                <td><input className="acc-input acc-input--sm" type="number" value={item.quantity} onChange={e => updateEditableItem(idx, 'quantity', e.target.value)} min="0" step="0.01" /></td>
                                                <td><input className="acc-input acc-input--sm" type="number" value={item.rate} onChange={e => updateEditableItem(idx, 'rate', e.target.value)} min="0" step="0.01" /></td>
                                                <td><input className="acc-input acc-input--sm" type="number" value={item.gst_percent} onChange={e => updateEditableItem(idx, 'gst_percent', e.target.value)} min="0" step="0.01" /></td>
                                                <td><input className="acc-input acc-input--sm" type="number" value={item.mrp} onChange={e => updateEditableItem(idx, 'mrp', e.target.value)} min="0" step="0.01" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {error && <div className="acc-error"><AlertCircle size={16} /> {error}</div>}

                    <div className="acc-action-bar">
                        <button className="acc-btn acc-btn--ghost" onClick={() => { setStep('upload'); setFile(null); setExtractedData(null); }}>
                            Upload Different File
                        </button>
                        <button className="acc-btn acc-btn--primary acc-btn--lg" onClick={submitBill} disabled={loading || !finalForm.amount}>
                            {loading ? <><Loader2 size={18} className="spin" /> Uploading...</> : <><Upload size={18} /> Upload Bill</>}
                        </button>
                    </div>
                </div>
            )}

            {/* Step: Success */}
            {step === 'done' && (
                <div className="acc-success-section">
                    <CheckCircle size={64} className="acc-text-ok" />
                    <h2>Bill Uploaded Successfully!</h2>
                    <p>Your bill has been saved and is now visible in the Bills & Documents tab.</p>
                    <div className="acc-action-bar">
                        <button className="acc-btn acc-btn--ghost" onClick={() => { setStep('upload'); setFile(null); setExtractedData(null); setEditableItems([]); setFinalForm({ document_type: 'Invoice', vendor_name: '', bill_number: '', bill_date: '', amount: '', description: '', related_tab: '' }); }}>
                            Upload Another
                        </button>
                        <button className="acc-btn acc-btn--primary" onClick={onUploaded}>
                            View Bills & Documents
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ─────────────────────── Shared Components ─────────────────────── */
const KpiTile = ({ label, value, icon, color }) => (
    <div className={`acc-mini-kpi ${color ? `acc-mini-kpi--${color}` : ''}`}>
        {icon && <div className="acc-mini-kpi__icon">{icon}</div>}
        <div>
            <div className="acc-mini-kpi__label">{label}</div>
            <div className="acc-mini-kpi__value">{value ?? '—'}</div>
        </div>
    </div>
);

const LoadingSpinner = () => (
    <div className="acc-loading">
        <Loader2 className="spin" size={36} />
    </div>
);

const EmptyState = ({ text }) => (
    <div className="acc-empty-text">{text}</div>
);

const Pagination = ({ page, totalPages, onChange }) => {
    if (totalPages <= 1) return null;
    return (
        <div className="acc-pagination">
            <button className="acc-btn acc-btn--ghost acc-btn--sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
                <ChevronLeft size={16} /> Prev
            </button>
            <span className="acc-pagination__info">Page {page} of {totalPages}</span>
            <button className="acc-btn acc-btn--ghost acc-btn--sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
                Next <ChevronRight size={16} />
            </button>
        </div>
    );
};

const formatMonth = (ym) => {
    const [y, m] = ym.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[Number(m) - 1]} ${y}`;
};

const parseItems = (items) => {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    try { return JSON.parse(items); } catch { return []; }
};

export default Accounts;

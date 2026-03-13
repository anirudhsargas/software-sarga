import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Calendar, CreditCard, Receipt, Loader2, Plus, Wallet,
  User, Phone, Hash, FileText, IndianRupee, CheckCircle2, Clock,
  AlertTriangle, Banknote, Smartphone, Building2, ChevronDown, ChevronUp,
  Search, X, Layers, CheckCircle, Printer, ShieldCheck, ShieldX, ShieldAlert
} from 'lucide-react';
import api from '../services/api';
import useAuth from '../hooks/useAuth';

import { serverToday } from '../services/serverTime';
import Pagination from '../components/Pagination';
import ReceiptModal from '../components/ReceiptModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './CustomerPayments.css';
import toast from 'react-hot-toast';
import { GST_RATE, formatCurrencyDecimal } from '../constants';
import { Tag } from 'lucide-react';

const paymentMethods = ['Cash', 'UPI', 'Cheque', 'Account Transfer'];

const CustomerPayments = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canVerify = ['Admin', 'Accountant'].includes(user?.role);
  const [loading, setLoading] = useState(false);
  const [verifyFilter, setVerifyFilter] = useState('all');
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [orderLines, setOrderLines] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerJobs, setCustomerJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [invoiceId] = useState(() => `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  const [confirming, setConfirming] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = React.useRef(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState(null);
  const [statementRange, setStatementRange] = useState({
    start: serverToday().slice(0, 8) + '01', // First of current month
    end: serverToday()
  });
  const [downloading, setDownloading] = useState(false);

  // Discount states
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountMode, setDiscountMode] = useState('amount'); // 'percent' | 'amount'
  const [discountInputAmount, setDiscountInputAmount] = useState(0);
  const [discountRequest, setDiscountRequest] = useState(null); // { id, status, discount_percent }
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  const [discountRequestLoading, setDiscountRequestLoading] = useState(false);

  const formatCurrency = formatCurrencyDecimal;

  const [formData, setFormData] = useState({
    customer_id: null,
    customer_name: '',
    customer_mobile: '',
    total_amount: 0,
    net_amount: 0,
    sgst_amount: 0,
    cgst_amount: 0,
    advance_paid: 0,
    balance_amount: 0,
    reference_number: '',
    description: '',
    payment_date: serverToday()
  });

  const [payment, setPayment] = useState({
    selectedMethods: ['Cash'],
    methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'Account Transfer': 0 },
  });

  useEffect(() => {
    let draft = location.state;
    if (!draft) {
      try {
        const stored = sessionStorage.getItem('billingPaymentDraft');
        if (stored) {
          draft = JSON.parse(stored);
          sessionStorage.removeItem('billingPaymentDraft');
        }
      } catch (storageError) {
        draft = null;
      }
    }

    // Prefill from job payment modal or navigation
    if (draft && draft.job_id) {
      const amountToPrefill = draft.amount || 0;
      setFormData((prev) => ({
        ...prev,
        customer_id: draft.customer_id || null,
        customer_name: draft.customer_name || prev.customer_name || 'Walk-in',
        customer_mobile: draft.customer_mobile || prev.customer_mobile,
        advance_paid: amountToPrefill,
        balance_amount: amountToPrefill,
        // Optionally prefill total_amount if present
        total_amount: draft.total_amount || amountToPrefill,
        net_amount: draft.net_amount || prev.net_amount,
        sgst_amount: draft.sgst_amount || prev.sgst_amount,
        cgst_amount: draft.cgst_amount || prev.cgst_amount,
        job_id: draft.job_id || prev.job_id
      }));
      setPayment((prev) => ({
        ...prev,
        methodAmounts: { ...prev.methodAmounts, Cash: amountToPrefill }
      }));
      if (draft.customer_name) {
        setCustomerSearch(draft.customer_name);
      } else {
        setCustomerSearch('Walk-in');
      }
    }

    const prefillCustomer = draft?.customer;
    const prefillTotals = draft?.billingPrefill;
    const prefillOrders = draft?.orders || [];
    const prefillJobIds = draft?.jobIds || [];

    if (prefillCustomer || prefillTotals) {
      setFormData((prev) => ({
        ...prev,
        customer_id: prefillCustomer?.id || null,
        customer_name: prefillCustomer?.name || prev.customer_name,
        customer_mobile: prefillCustomer?.mobile || prev.customer_mobile,
        total_amount: prefillTotals?.gross ?? prev.total_amount,
        net_amount: prefillTotals?.net ?? prev.net_amount,
        sgst_amount: prefillTotals?.sgst ?? prev.sgst_amount,
        cgst_amount: prefillTotals?.cgst ?? prev.cgst_amount,
        description: prefillOrders.length > 0
          ? `Billing for ${prefillOrders.length} item(s)`
          : prev.description
      }));
      setOrderLines(prefillOrders);
    }
    if (prefillJobIds.length > 0) {
      setSelectedJobId(null);
    }
  }, [location.state]);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchPayments(paymentsPage);
  }, [paymentsPage]);

  useEffect(() => {
    if (!formData.customer_id || orderLines.length > 0) return;
    fetchCustomerJobs(formData.customer_id);
  }, [formData.customer_id, orderLines.length]);

  useEffect(() => {
    if (!selectedJobId || orderLines.length > 0) return;

    let total = 0;
    let desc = '';
    const draftAmount = location.state?.amount;
    const isPrefilledJob = String(selectedJobId) === String(location.state?.job_id);

    if (selectedJobId === 'all') {
      // Sum all jobs — only use balance; if balance_amount is null/undefined, fall back to total_amount
      total = customerJobs.reduce((sum, j) => {
        return sum + getJobBalance(j);
      }, 0);
      desc = `Payment for all ${customerJobs.length} job(s)`;
    } else {
      const job = customerJobs.find((j) => String(j.id) === String(selectedJobId));
      if (!job) return;
      // If we came from the Job Dashboard with a specific amount, use it instead of recalculating
      total = isPrefilledJob && draftAmount !== undefined ? Number(draftAmount) : getJobBalance(job);
      desc = job.job_number ? `Payment for ${job.job_number}` : '';
    }

    const net = total / (1 + GST_RATE);
    const sgst = net * (GST_RATE / 2);
    const cgst = net * (GST_RATE / 2);

    setFormData((prev) => ({
      ...prev,
      total_amount: total,
      net_amount: net,
      sgst_amount: sgst,
      cgst_amount: cgst,
      description: desc || prev.description
    }));
  }, [selectedJobId, customerJobs, orderLines.length, location.state]);

  useEffect(() => {
    const total = Number(formData.total_amount) || 0;
    const advance = Number(formData.advance_paid) || 0;
    setFormData((prev) => ({
      ...prev,
      balance_amount: Math.max(total - advance, 0)
    }));
  }, [formData.total_amount, formData.advance_paid]);

  // Sync advance_paid from per-method amounts
  useEffect(() => {
    const total = payment.selectedMethods.reduce(
      (sum, m) => sum + (Number(payment.methodAmounts[m]) || 0), 0
    );
    setFormData((prev) => ({ ...prev, advance_paid: total }));
  }, [payment.selectedMethods, payment.methodAmounts]);

  const getJobBalance = (job) => {
    const total = Number(job?.total_amount);
    const advance = Number(job?.advance_paid);
    let bal;
    if (Number.isFinite(total) && Number.isFinite(advance)) {
      bal = Math.max(total - advance, 0);
    } else {
      const b = job?.balance_amount;
      bal = b != null ? Math.max(Number(b), 0) : (Number(job?.total_amount) || 0);
    }
    // Treat anything under ₹1 as fully paid (rounding dust)
    return bal < 1 ? 0 : bal;
  };

  const fetchPayments = async (page = paymentsPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      const response = await api.get(`/customer-payments?${params}`);
      const res = response.data;
      setPayments(res.data || []);
      setPaymentsTotal(res.total || 0);
      setPaymentsTotalPages(res.totalPages || 1);
      if (page !== paymentsPage) {
        setPaymentsPage(page);
      }
    } catch (err) {
      setError('Failed to fetch customer payments');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (paymentId, status) => {
    try {
      await api.patch(`/customer-payments/${paymentId}/verify`, { status });
      toast.success(`Payment ${status.toLowerCase()} successfully`);
      fetchPayments(paymentsPage);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Verification failed');
    }
  };

  const needsVerification = (p) => p.payment_method !== 'Cash' && (!p.verification_status || p.verification_status === 'Pending');

  const filteredPayments = useMemo(() => {
    if (verifyFilter === 'all') return payments;
    if (verifyFilter === 'pending') return payments.filter(p => needsVerification(p));
    if (verifyFilter === 'verified') return payments.filter(p => p.verification_status === 'Verified');
    if (verifyFilter === 'rejected') return payments.filter(p => p.verification_status === 'Rejected');
    return payments;
  }, [payments, verifyFilter]);

  const fetchCustomers = async () => {
    try {
      const response = await api.get('/customers?cross_branch=1');
      setCustomers(response.data || []);
    } catch (err) {
      setError('Failed to fetch customers');
    }
  };

  const fetchCustomerJobs = async (customerId) => {
    try {
      const response = await api.get(`/customers/${customerId}/jobs`);
      const jobs = response.data || [];
      setCustomerJobs(jobs);

      const prefilledJobId = location.state?.job_id;
      if (prefilledJobId && jobs.some(j => String(j.id) === String(prefilledJobId))) {
        setSelectedJobId(prefilledJobId);
      } else if (jobs.length > 1) {
        setSelectedJobId('all');
      } else if (jobs.length === 1) {
        setSelectedJobId(jobs[0].id);
      } else {
        setSelectedJobId(null);
      }
    } catch (err) {
      setCustomerJobs([]);
      setSelectedJobId(null);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.mobile || '').includes(q)
    );
  }, [customers, customerSearch]);

  const handleCustomerSelect = (customerId) => {
    const selected = customers.find((c) => String(c.id) === String(customerId));
    if (!selected) return;
    setCustomerSearch(selected.name);
    setShowCustomerDropdown(false);
    setFormData((prev) => ({
      ...prev,
      customer_id: selected.id,
      customer_name: selected.name || '',
      customer_mobile: selected.mobile || '',
      total_amount: 0,
      net_amount: 0,
      sgst_amount: 0,
      cgst_amount: 0,
      advance_paid: 0,
      balance_amount: 0
    }));
    setOrderLines([]);
    fetchCustomerJobs(selected.id);
  };

  const handleReview = (e) => {
    e.preventDefault();
    // Discount approval check (same rules as Billing)
    if (totals.activePct > 5) {
      if (!discountRequest || discountRequest.status === 'REJECTED') {
        setShowDiscountModal(true);
        return;
      }
      if (discountRequest.status === 'PENDING') {
        setError('Discount approval is still pending. Please wait for admin to approve, then try again.');
        return;
      }
    }
    setConfirming(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const jobIdsToSend = orderLines.length > 0
        ? (location.state?.jobIds || []).map(Number)
        : selectedJobId === 'all'
          ? customerJobs.filter((j) => getJobBalance(j) > 0).map((j) => Number(j.id))
          : (selectedJobId ? [Number(selectedJobId)] : []);

      // Calculate the original bill total for these jobs
      let billAmount = 0;
      if (orderLines.length > 0) {
        billAmount = orderLines.reduce((sum, line) => sum + (Number(line.total_amount) || 0), 0);
      } else {
        const selectedJobs = customerJobs.filter(j => jobIdsToSend.includes(Number(j.id)));
        billAmount = selectedJobs.reduce((sum, j) => sum + (Number(j.total_amount) || 0), 0);
      }

      // If we don't have job info (e.g. general credit payment), fall back to current payment total
      if (billAmount === 0) billAmount = Number(formData.total_amount);

      const cashAmount = Number(payment.methodAmounts.Cash) || 0;
      const upiAmount = Number(payment.methodAmounts.UPI) || 0;
      const selected = payment.selectedMethods.length > 0 ? payment.selectedMethods : ['Cash'];
      const isCashUpiCombo = selected.length === 2 && selected.includes('Cash') && selected.includes('UPI');
      const paymentMethod = isCashUpiCombo ? 'Both' : selected[0];

      const response = await api.post('/customer-payments', {
        ...formData,
        customer_id: formData.customer_id ? Number(formData.customer_id) : null,
        bill_amount: billAmount,
        total_amount: totals.gross,
        net_amount: totals.net,
        sgst_amount: totals.sgst,
        cgst_amount: totals.cgst,
        discount_percent: totals.effectiveDiscount || null,
        discount_amount: totals.discountAmount || null,
        advance_paid: Number(formData.advance_paid) || 0,
        balance_amount: Math.max(totals.gross - (Number(formData.advance_paid) || 0), 0),
        payment_method: paymentMethod,
        cash_amount: cashAmount,
        upi_amount: upiAmount,
        order_lines: orderLines,
        job_ids: jobIdsToSend
      });

      const savedPayment = response.data?.payment || {
        ...formData,
        payment_method: paymentMethod,
        balance_amount: Number(formData.balance_amount) || 0,
        id: response.data?.id
      };

      // Emit global event to trigger background refresh in other active views (like JobDetail, Summary)
      window.dispatchEvent(new CustomEvent('paymentRecorded'));

      // Show receipt modal instead of immediate reset
      setCurrentReceiptData(savedPayment);
      setShowReceipt(true);

      // Handle the rest of the success logic
      setConfirming(false);
      const keepCustomerId = formData.customer_id;
      setFormData({
        customer_id: keepCustomerId,
        customer_name: formData.customer_name,
        customer_mobile: formData.customer_mobile,
        total_amount: 0,
        net_amount: 0,
        sgst_amount: 0,
        cgst_amount: 0,
        advance_paid: 0,
        balance_amount: 0,
        reference_number: '',
        description: '',
        payment_date: serverToday()
      });
      setPayment({ selectedMethods: ['Cash'], methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'AccountTransfer': 0 } });
      setDiscountPercent(0);
      setDiscountInputAmount(0);
      setDiscountMode('amount');
      setDiscountRequest(null);
      setDiscountReason('');
      setOrderLines([]);
      setSelectedJobId(null);
      setCustomerJobs([]);

      if (keepCustomerId) {
        fetchCustomerJobs(keepCustomerId);
      }
      fetchPayments(1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save customer payment');
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => {
    const round2 = (n) => Math.round(n * 100) / 100;
    const subtotal = round2(Number(formData.total_amount) || 0);
    const activePct = discountMode === 'amount'
      ? (subtotal > 0 ? Math.min((discountInputAmount / subtotal) * 100, 100) : 0)
      : discountPercent;
    const effectiveDiscount = (
      activePct > 0 && activePct <= 5
    ) || (
      activePct > 5 &&
      discountRequest?.status === 'APPROVED' &&
      Math.abs(Number(discountRequest.discount_percent) - activePct) < 0.1
    ) ? activePct : 0;
    const gross = round2(subtotal * (1 - effectiveDiscount / 100));
    const discountAmount = round2(subtotal - gross);
    const net = round2(gross / (1 + GST_RATE));
    const sgst = round2(net * (GST_RATE / 2));
    const cgst = round2(net * (GST_RATE / 2));
    return { gross, net, sgst, cgst, subtotal, effectiveDiscount, discountAmount, activePct };
  }, [formData.total_amount, discountPercent, discountInputAmount, discountMode, discountRequest]);

  const checkDiscountApproval = async () => {
    try {
      const res = await api.get('/requests/discount/my');
      if (res.data) {
        setDiscountRequest(res.data);
        if (res.data.status === 'APPROVED') {
          setDiscountPercent(Number(res.data.discount_percent));
        }
      }
    } catch (e) {
      console.warn('Failed to check discount approval', e);
    }
  };

  const handleSubmitDiscountRequest = async () => {
    if (!discountReason.trim()) {
      toast.error('Please provide a reason for the discount.');
      return;
    }
    setDiscountRequestLoading(true);
    try {
      const res = await api.post('/requests/discount', {
        discount_percent: totals.activePct,
        total_amount: totals.subtotal,
        customer_name: formData.customer_name || 'Customer',
        reason: discountReason.trim()
      });
      setDiscountRequest({ id: res.data.id, status: 'PENDING', discount_percent: totals.activePct });
      setShowDiscountModal(false);
      setDiscountReason('');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to submit request.');
    } finally {
      setDiscountRequestLoading(false);
    }
  };

  const balanceStatus = useMemo(() => {
    if (formData.balance_amount <= 0 && formData.total_amount > 0) return 'Paid';
    if (formData.advance_paid > 0 && formData.balance_amount > 0) return 'Partial';
    return 'Due';
  }, [formData.balance_amount, formData.advance_paid, formData.total_amount]);

  const canSave = useMemo(() => {
    if (!formData.customer_name.trim()) return false;
    if (payment.selectedMethods.length === 0) return false;
    const totalPaid = payment.selectedMethods.reduce(
      (sum, m) => sum + (Number(payment.methodAmounts[m]) || 0), 0
    );
    return totalPaid > 0;
  }, [formData.customer_name, payment.selectedMethods, payment.methodAmounts]);

  const toggleMethod = (method) => {
    setPayment((prev) => {
      const exists = prev.selectedMethods.includes(method);
      const selectedMethods = exists
        ? prev.selectedMethods.filter((m) => m !== method)
        : [...prev.selectedMethods, method];
      return { ...prev, selectedMethods };
    });
  };

  const updateMethodAmount = (method, value) => {
    setPayment((prev) => ({
      ...prev,
      methodAmounts: { ...prev.methodAmounts, [method]: value }
    }));
  };

  const setPredefinedRange = (rangeType) => {
    const today = new Date();
    let start, end;

    if (rangeType === 'thisMonth') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date();
    } else if (rangeType === 'lastMonth') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (rangeType === 'financialYear') {
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      if (currentMonth < 3) { // Jan-Mar
        start = new Date(currentYear - 1, 3, 1);
        end = new Date();
      } else { // Apr-Dec
        start = new Date(currentYear, 3, 1);
        end = new Date();
      }
    }

    const formatDate = (date) => date.toISOString().split('T')[0];
    setStatementRange({ start: formatDate(start), end: formatDate(end) });
  };

  const handleDownloadStatement = async () => {
    setDownloading(true);
    try {
      const params = new URLSearchParams({
        startDate: statementRange.start,
        endDate: statementRange.end,
        limit: 1000 // Get a good chunk for statement
      });
      const res = await api.get(`/customer-payments?${params}`);
      // Handle both raw array and paginated object response
      const data = Array.isArray(res.data) ? res.data : (res.data.data || []);

      if (data.length === 0) {
        toast.success('No payments found for this range');
        return;
      }

      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.setTextColor(40);
      doc.text('Payment Statement', 14, 22);

      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`SARGA DIGITAL PRESS`, 14, 30);
      doc.text(`Period: ${statementRange.start} to ${statementRange.end}`, 14, 35);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 40);

      const tableData = data.map(p => [
        new Date(p.payment_date).toLocaleDateString('en-IN'),
        `${p.customer_name}\n${p.customer_mobile || ''}`,
        p.payment_method,
        `Rs. ${Number(p.advance_paid).toFixed(2)}`,
        `Rs. ${Number(p.balance_amount).toFixed(2)}`
      ]);

      const totalPaid = data.reduce((sum, p) => sum + Number(p.advance_paid), 0);

      autoTable(doc, {
        startY: 50,
        head: [['Date', 'Customer & Mobile', 'Method', 'Paid', 'Balance']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [44, 62, 80] },
        foot: [['', '', 'TOTAL', `Rs. ${totalPaid.toFixed(2)}`, '']],
        footStyles: { fillColor: [241, 245, 249], textColor: [44, 62, 80], fontStyle: 'bold' },
        showFoot: 'last'
      });

      doc.save(`Payment_Statement_${statementRange.start}_to_${statementRange.end}.pdf`);
    } catch (err) {
      console.error('Download err:', err);
      toast.error('Failed to generate statement');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="cp-page">
      {/* ── HEADER ── */}
      <div className="cp-header">
        <div className="cp-header-left">
          <div>
            <h1 className="cp-title">Customer Payments</h1>
            <p className="cp-subtitle">Collect advance or full payment for customer orders</p>
          </div>
        </div>
        <div className="cp-header-badge">
          <Receipt size={14} />
          <span>{invoiceId}</span>
        </div>
      </div>

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="cp-grid">
        {/* ─ LEFT: Customer & Bill ─ */}
        <div className="cp-panel">
          <div className="cp-panel-header">
            <div className="cp-panel-icon"><User size={18} /></div>
            <h2 className="cp-panel-title">Customer & Bill</h2>
          </div>

          {/* Customer selector (manual mode) */}
          {orderLines.length === 0 && (
            <div className="cp-form-grid">
              <div ref={customerDropdownRef} className="cp-search-wrap">
                <label className="label">Search & Select Customer</label>
                <div className="cp-search-input-wrap">
                  <Search size={15} className="cp-search-icon" />
                  <input
                    className="input-field cp-search-input"
                    placeholder="Type name or mobile..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                  />
                  {customerSearch && (
                    <button
                      type="button"
                      className="cp-search-clear"
                      onClick={() => {
                        setCustomerSearch('');
                        setShowCustomerDropdown(true);
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {showCustomerDropdown && (
                  <div className="cp-dropdown">
                    {filteredCustomers.length === 0 ? (
                      <div className="cp-dropdown-empty">No customers found</div>
                    ) : (
                      filteredCustomers.slice(0, 50).map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`cp-dropdown-item ${String(formData.customer_id) === String(c.id) ? 'cp-dropdown-item--active' : ''}`}
                          onClick={() => handleCustomerSelect(c.id)}
                        >
                          <div className="cp-dropdown-avatar">{(c.name || '?').charAt(0).toUpperCase()}</div>
                          <div className="cp-dropdown-info">
                            <span className="cp-dropdown-name">{c.name}</span>
                            <span className="cp-dropdown-mobile">{c.mobile ? `+91 ${c.mobile}` : 'No mobile'}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="label">Select Job</label>
                <select
                  className="input-field"
                  value={selectedJobId || ''}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  disabled={!formData.customer_id || customerJobs.length === 0}
                >
                  <option value="">Choose a job...</option>
                  {customerJobs.length > 1 && (
                    <option value="all">
                      ★ All Jobs — ₹{customerJobs.reduce((s, j) => s + getJobBalance(j), 0).toFixed(2)}
                    </option>
                  )}
                  {customerJobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.job_number || 'Job'} — ₹{getJobBalance(job).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Customer info strip */}
          <div className="cp-customer-strip">
            <div className="cp-customer-avatar">
              {(formData.customer_name || '?').charAt(0).toUpperCase()}
            </div>
            <div className="cp-customer-info">
              <span className="cp-customer-name">{formData.customer_name || 'No customer selected'}</span>
              <span className="cp-customer-meta">
                {formData.customer_mobile ? `+91 ${formData.customer_mobile}` : 'No mobile'}
              </span>
            </div>
            <div className="cp-info-chips">
              <span className="cp-chip"><FileText size={12} /> {orderLines.length} item{orderLines.length !== 1 ? 's' : ''}</span>
              <span className="cp-chip"><Calendar size={12} /> {formData.payment_date}</span>
            </div>
          </div>

          {/* Order lines or selected job */}
          {orderLines.length > 0 && (
            <div className="cp-order-summary">
              <div className="cp-order-summary-title">Order Lines</div>
              {orderLines.map((line) => (
                <div key={line.id} className="cp-order-line">
                  <span className="cp-order-line-name">{line.product_name}</span>
                  <span className="cp-order-line-qty">Qty {line.quantity} × ₹{Number(line.unit_price).toFixed(2)}</span>
                  <span className="cp-order-line-total">₹{Number(line.total_amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {orderLines.length === 0 && selectedJobId === 'all' && customerJobs.length > 0 && (
            <div className="cp-order-summary">
              <div className="cp-order-summary-title"><Layers size={13} /> All Jobs ({customerJobs.length})</div>
              {customerJobs.map((job) => (
                <div key={job.id} className="cp-order-line">
                  <span className="cp-order-line-name">{job.job_name || job.job_number || 'Job'}</span>
                  <span className="cp-order-line-total">₹{getJobBalance(job).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {orderLines.length === 0 && selectedJobId && selectedJobId !== 'all' && (
            <div className="cp-order-summary">
              <div className="cp-order-summary-title">Selected Job</div>
              {customerJobs
                .filter((job) => String(job.id) === String(selectedJobId))
                .map((job) => (
                  <div key={job.id} className="cp-order-line">
                    <span className="cp-order-line-name">{job.job_name || job.job_number || 'Job'}</span>
                    <span className="cp-order-line-total">₹{getJobBalance(job).toFixed(2)}</span>
                  </div>
                ))}
            </div>
          )}

          {/* Discount */}
          {totals.subtotal > 0 && (
            <div className="cp-discount-section">
              <div className="row gap-sm items-center mb-8">
                <label className="label" style={{ margin: 0 }}><Tag size={13} /> Discount</label>
                <div className="cp-discount-toggle">
                  <button
                    type="button"
                    className={`cp-discount-btn ${discountMode === 'percent' ? 'cp-discount-btn--active' : ''}`}
                    onClick={() => {
                      setDiscountMode('percent');
                      if (totals.subtotal > 0) {
                        setDiscountPercent(Math.round((discountInputAmount / totals.subtotal) * 1000) / 10);
                      }
                      if (discountRequest) setDiscountRequest(null);
                    }}
                  >%</button>
                  <button
                    type="button"
                    className={`cp-discount-btn ${discountMode === 'amount' ? 'cp-discount-btn--active' : ''}`}
                    onClick={() => {
                      setDiscountMode('amount');
                      if (totals.subtotal > 0) {
                        setDiscountInputAmount(Math.round(totals.subtotal * discountPercent / 100 * 100) / 100);
                      }
                      if (discountRequest) setDiscountRequest(null);
                    }}
                  >₹</button>
                </div>
              </div>
              <div className="row gap-md items-center" style={{ flexWrap: 'wrap' }}>
                {discountMode === 'percent' ? (
                  <input
                    type="number"
                    className="input-field"
                    style={{ maxWidth: '120px' }}
                    min="0"
                    max="100"
                    step="0.5"
                    value={discountPercent || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setDiscountPercent(val);
                      if (discountRequest && Math.abs(Number(discountRequest.discount_percent) - val) >= 0.1) {
                        setDiscountRequest(null);
                      }
                    }}
                  />
                ) : (
                  <input
                    type="number"
                    className="input-field"
                    style={{ maxWidth: '120px' }}
                    min="0"
                    max={totals.subtotal}
                    step="1"
                    value={discountInputAmount || ''}
                    placeholder="0.00"
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(totals.subtotal, Number(e.target.value) || 0));
                      setDiscountInputAmount(val);
                      if (discountRequest) setDiscountRequest(null);
                    }}
                  />
                )}
                {totals.activePct > 0 && (
                  <span className="text-sm muted">
                    {discountMode === 'percent'
                      ? `= ₹${(totals.subtotal * totals.activePct / 100).toFixed(2)} off`
                      : `= ${totals.activePct.toFixed(1)}% off`}
                  </span>
                )}
                {totals.activePct > 0 && totals.activePct <= 5 && (
                  <span className="cp-discount-status cp-discount-status--ok">✓ Applied</span>
                )}
                {totals.activePct > 5 && discountRequest?.status === 'APPROVED' && (
                  <span className="cp-discount-status cp-discount-status--ok">✓ Admin approved</span>
                )}
                {totals.activePct > 5 && discountRequest?.status === 'PENDING' && (
                  <div className="row gap-sm items-center">
                    <span className="cp-discount-status cp-discount-status--warn">⏳ Pending approval</span>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: '12px' }} onClick={checkDiscountApproval}>
                      Check
                    </button>
                  </div>
                )}
                {totals.activePct > 5 && discountRequest?.status === 'REJECTED' && (
                  <span className="cp-discount-status cp-discount-status--err">✗ Rejected</span>
                )}
                {totals.activePct > 5 && totals.activePct <= 10 && !discountRequest && (
                  <span className="cp-discount-status cp-discount-status--warn">⚠ &gt;5% needs approval</span>
                )}
                {totals.activePct > 10 && !discountRequest && (
                  <span className="cp-discount-status cp-discount-status--err">⚠ &gt;10% Admin only</span>
                )}
              </div>
            </div>
          )}

          {/* Bill totals */}
          <div className="cp-totals">
            {totals.effectiveDiscount > 0 && (
              <div className="cp-totals-row">
                <span className="muted">Original Amount</span>
                <span className="cp-discount-strike">₹{totals.subtotal.toFixed(2)}</span>
              </div>
            )}
            {totals.effectiveDiscount > 0 && (
              <div className="cp-totals-row cp-totals-row--discount">
                <span>Discount ({totals.effectiveDiscount.toFixed(1)}%)</span>
                <span>−₹{totals.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="cp-totals-row">
              <span className="muted">Subtotal</span>
              <span>₹{totals.net.toFixed(2)}</span>
            </div>
            <div className="cp-totals-row">
              <span className="muted">SGST (9%)</span>
              <span>₹{totals.sgst.toFixed(2)}</span>
            </div>
            <div className="cp-totals-row">
              <span className="muted">CGST (9%)</span>
              <span>₹{totals.cgst.toFixed(2)}</span>
            </div>
            <div className="cp-totals-row cp-totals-row--grand">
              <span>Grand Total</span>
              <span>₹{totals.gross.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ─ RIGHT: Payment Entry ─ */}
        <div className="cp-panel">
          <div className="cp-panel-header">
            <div className="cp-panel-icon cp-panel-icon--accent"><Wallet size={18} /></div>
            <h2 className="cp-panel-title">Payment Entry</h2>
          </div>

          {/* Amount to collect hero */}
          <div className="cp-amount-hero">
            <span className="cp-amount-hero-label">Amount to Collect</span>
            <span className="cp-amount-hero-value">₹{totals.gross.toFixed(2)}</span>
          </div>

          <form onSubmit={handleReview} className="cp-form">
            {/* Name & mobile */}
            <div className="cp-form-grid">
              <div>
                <label className="label">Customer Name</label>
                <input
                  className="input-field"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  placeholder="Enter name"
                  required
                />
              </div>
              <div>
                <label className="label">Mobile</label>
                <input
                  className="input-field"
                  value={formData.customer_mobile}
                  onChange={(e) => setFormData({ ...formData, customer_mobile: e.target.value })}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  maxLength={10}
                />
              </div>
            </div>

            {/* Amount paid / Balance / Date */}
            <div className="cp-form-grid cp-form-grid--3">
              <div>
                <label className="label">Amount Paid</label>
                <div className="cp-display-field cp-display-field--accent">
                  ₹{Number(formData.advance_paid).toFixed(2)}
                </div>
              </div>
              <div>
                <label className="label">Balance Due</label>
                <div className={`cp-display-field cp-display-field--${balanceStatus === 'Paid' ? 'success' : balanceStatus === 'Partial' ? 'warning' : 'error'}`}>
                  <span>₹{Number(formData.balance_amount).toFixed(2)}</span>
                  <span className="cp-balance-badge">{balanceStatus}</span>
                </div>
              </div>
              <div>
                <label className="label">Payment Date</label>
                <div className="cp-display-field" style={{ fontSize: 14 }}>
                  <Calendar size={14} style={{ flexShrink: 0 }} />
                  <span>{formData.payment_date}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>Today</span>
                </div>
              </div>
            </div>

            {/* Payment method toggles - multi-select like Billing */}
            <div>
              <label className="label">Payment Methods</label>
              <div className="cp-methods">
                {paymentMethods.map((method) => {
                  const icons = { Cash: Banknote, UPI: Smartphone, Cheque: FileText, 'Account Transfer': Building2 };
                  const Icon = icons[method] || CreditCard;
                  const active = payment.selectedMethods.includes(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      className={`cp-method-pill ${active ? 'cp-method-pill--active' : ''}`}
                      onClick={() => toggleMethod(method)}
                    >
                      <Icon size={14} /> {method}
                    </button>
                  );
                })}
              </div>
              {payment.selectedMethods.length === 0 && (
                <span className="cp-field-error">Select at least one payment method</span>
              )}
            </div>

            {/* Per-method amount inputs */}
            <div className="cp-form-grid">
              {payment.selectedMethods.includes('Cash') && (
                <div>
                  <label className="label"><Banknote size={13} /> Cash Amount</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    value={payment.methodAmounts.Cash}
                    onChange={(e) => updateMethodAmount('Cash', e.target.value)}
                  />
                </div>
              )}
              {payment.selectedMethods.includes('UPI') && (
                <div>
                  <label className="label"><Smartphone size={13} /> UPI Amount</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    value={payment.methodAmounts.UPI}
                    onChange={(e) => updateMethodAmount('UPI', e.target.value)}
                  />
                </div>
              )}
              {payment.selectedMethods.includes('Cheque') && (
                <div>
                  <label className="label"><FileText size={13} /> Cheque Amount</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    value={payment.methodAmounts.Cheque}
                    onChange={(e) => updateMethodAmount('Cheque', e.target.value)}
                  />
                </div>
              )}
              {payment.selectedMethods.includes('Account Transfer') && (
                <div>
                  <label className="label"><Building2 size={13} /> Transfer Amount</label>
                  <input
                    type="number"
                    className="input-field"
                    min="0"
                    value={payment.methodAmounts['Account Transfer']}
                    onChange={(e) => updateMethodAmount('Account Transfer', e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Ref number & notes */}
            {payment.selectedMethods.some((m) => m !== 'Cash') && (
              <div className="cp-form-grid">
                <div>
                  <label className="label">UTR / Reference No</label>
                  <input
                    className="input-field"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Transaction reference"
                  />
                </div>
                <div>
                  <label className="label">Purpose / Notes</label>
                  <input
                    className="input-field"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional notes"
                  />
                </div>
              </div>
            )}

            {payment.selectedMethods.length === 1 && payment.selectedMethods[0] === 'Cash' && (
              <div>
                <label className="label">Purpose / Notes</label>
                <input
                  className="input-field"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional notes"
                />
              </div>
            )}

            {error && (
              <div className="alert alert--error">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button type="submit" className="btn btn-primary btn--full cp-submit" disabled={saving || !canSave}>
              <CheckCircle2 size={16} /> Review & Confirm — ₹{totals.gross.toFixed(2)}
            </button>
          </form>

          {/* ── Confirmation Overlay ── */}
          {confirming && (
            <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirming(false); }}>
              <div className="em-modal em-modal--sm" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="em-modal__header"><h2>Confirm Customer Payment</h2><button className="btn btn-ghost btn-icon" onClick={() => setConfirming(false)}><X size={18} /></button></div>
                <form onSubmit={handleSubmit}>
                  <div className="em-modal__body">
                    <div className="em-confirm-summary">
                      <div className="em-confirm-summary__title"><CheckCircle size={18} /> Verify Payment Details</div>
                      <div className="em-confirm-summary__rows">
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Customer</span><span className="em-confirm-summary__value">{formData.customer_name}</span></div>
                        {formData.customer_mobile && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Mobile</span><span className="em-confirm-summary__value">{formData.customer_mobile}</span></div>}
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Total Amount</span><span className="em-confirm-summary__value em-confirm-summary__amount">₹{totals.gross.toFixed(2)}</span></div>
                        {totals.effectiveDiscount > 0 && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Discount ({totals.effectiveDiscount.toFixed(1)}%)</span><span className="em-confirm-summary__value" style={{ color: 'var(--clr-success, #10b981)' }}>−₹{totals.discountAmount.toFixed(2)}</span></div>}
                        {totals.sgst > 0 && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">GST (SGST + CGST)</span><span className="em-confirm-summary__value">₹{(totals.sgst + totals.cgst).toFixed(2)}</span></div>}
                        {payment.selectedMethods.map(m => (
                          <div key={m} className="em-confirm-summary__row"><span className="em-confirm-summary__label">{m}</span><span className="em-confirm-summary__value">₹{Number(payment.methodAmounts[m] || 0).toFixed(2)}</span></div>
                        ))}
                        <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Date</span><span className="em-confirm-summary__value">{formData.payment_date}</span></div>
                        {formData.reference_number && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Reference</span><span className="em-confirm-summary__value">{formData.reference_number}</span></div>}
                        {orderLines.length > 0 && <div className="em-confirm-summary__row"><span className="em-confirm-summary__label">Order Lines</span><span className="em-confirm-summary__value">{orderLines.length} item(s)</span></div>}
                      </div>
                      <div className="em-confirm-summary__warn"><AlertTriangle size={14} /> Please verify the payment details before confirming.</div>
                    </div>
                  </div>
                  <div className="em-modal__footer"><button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>← Back to Edit</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Processing...' : 'Confirm Payment'}</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Discount Approval Request Modal ── */}
      {showDiscountModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="row items-center justify-between mb-16">
              <h2 className="section-title">Request Discount Approval</h2>
              <button type="button" className="btn btn-ghost" onClick={() => { setShowDiscountModal(false); setDiscountReason(''); }}>Close</button>
            </div>
            <div className="stack-md">
              <div className="alert alert--warning">
                {totals.activePct > 10
                  ? <>Discount of <strong>{totals.activePct.toFixed(1)}%</strong> exceeds 10% — only <strong>Admin</strong> can approve this.</>
                  : <>Discount of <strong>{totals.activePct.toFixed(1)}%</strong> exceeds 5% — <strong>Accountant or Admin</strong> can approve this.</>
                } You can proceed once approved.
              </div>
              <div>
                <label className="label">Discount Amount</label>
                <div className="input-field" style={{ fontWeight: 600 }}>
                  {totals.activePct.toFixed(1)}% off ₹{totals.subtotal.toFixed(2)} = ₹{(totals.subtotal * totals.activePct / 100).toFixed(2)} discount
                </div>
              </div>
              <div>
                <label className="label">Reason for Discount <span style={{ color: 'var(--clr-error, var(--error))' }}>*</span></label>
                <textarea
                  className="input-field"
                  rows={3}
                  placeholder="Explain why this discount is needed..."
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                />
              </div>
              <div className="row gap-sm justify-end">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowDiscountModal(false); setDiscountReason(''); }} disabled={discountRequestLoading}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleSubmitDiscountRequest} disabled={discountRequestLoading || !discountReason.trim()}>
                  {discountRequestLoading ? 'Sending...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RECENT PAYMENTS TABLE ── */}
      <div className="cp-panel">
        <div className="cp-panel-header">
          <div className="cp-panel-icon"><Clock size={18} /></div>
          <h2 className="cp-panel-title">Recent Payments</h2>
          <span className="cp-panel-count">{paymentsTotal}</span>
        </div>

        {/* ── VERIFICATION FILTER ── */}
        {canVerify && (
          <div className="cp-verify-filters" style={{ padding: '8px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending', icon: ShieldAlert, color: '#f59e0b' }, { key: 'verified', label: 'Verified', icon: ShieldCheck, color: '#10b981' }, { key: 'rejected', label: 'Rejected', icon: ShieldX, color: '#ef4444' }].map(f => (
              <button
                key={f.key}
                className={`btn btn-xs ${verifyFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setVerifyFilter(f.key)}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                {f.icon && <f.icon size={13} style={{ color: verifyFilter === f.key ? undefined : f.color }} />}
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* ── STATEMENT FILTERS ── */}
        <div className="cp-statement-filters">
          <div className="row gap-md wrap items-end">
            <div>
              <label className="label">From</label>
              <input
                type="date"
                className="input-field input-field--sm"
                value={statementRange.start}
                onChange={e => setStatementRange(prev => ({ ...prev, start: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">To</label>
              <input
                type="date"
                className="input-field input-field--sm"
                value={statementRange.end}
                onChange={e => setStatementRange(prev => ({ ...prev, end: e.target.value }))}
              />
            </div>
            <div className="row gap-sm">
              <button className="btn btn-ghost btn-xs" onClick={() => setPredefinedRange('thisMonth')}>This Month</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setPredefinedRange('lastMonth')}>Last Month</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setPredefinedRange('financialYear')}>FY</button>
            </div>
            <button
              className="btn btn-primary btn-sm ml-auto"
              onClick={handleDownloadStatement}
              disabled={downloading}
            >
              {downloading ? <Loader2 size={16} className="cp-spin" /> : <FileText size={16} />}
              Download Statement
            </button>
          </div>
        </div>

        <div className="cp-table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Status</th>
                <th>Billed</th>
                <th>Paid</th>
                <th>Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center muted table-empty">
                    <Loader2 size={20} className="cp-spin" />
                  </td>
                </tr>
              ) : filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center muted table-empty">
                    <Receipt size={24} style={{ opacity: 0.4 }} />
                    <div style={{ marginTop: 6 }}>No customer payments recorded yet</div>
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => {
                  const bal = Number(p.balance_amount);
                  const vStatus = p.payment_method === 'Cash' ? 'N/A' : (p.verification_status || 'Pending');
                  return (
                    <tr key={p.id}>
                      <td className="text-sm">
                        <div className="row gap-sm">
                          <Calendar size={13} className="muted" />
                          {new Date(p.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td>
                        <div className="cp-table-customer">
                          <span className="cp-table-name">{p.customer_name}</span>
                          <span className="cp-table-mobile">{p.customer_mobile || '—'}</span>
                        </div>
                      </td>
                      <td>
                        <span className="cp-method-tag">
                          <Receipt size={12} /> {p.payment_method}
                        </span>
                      </td>
                      <td>
                        {vStatus === 'N/A' ? (
                          <span className="cp-verify-badge cp-verify-na" style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                        ) : vStatus === 'Verified' ? (
                          <span className="cp-verify-badge cp-verify-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                            <ShieldCheck size={13} /> Verified
                          </span>
                        ) : vStatus === 'Rejected' ? (
                          <span className="cp-verify-badge cp-verify-fail" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
                            <ShieldX size={13} /> Rejected
                          </span>
                        ) : (
                          <span className="cp-verify-badge cp-verify-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
                            <ShieldAlert size={13} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="cp-table-amount">₹{Number(p.total_amount).toFixed(2)}</td>
                      <td className="cp-table-amount cp-text-success">₹{Number(p.advance_paid).toFixed(2)}</td>
                      <td className={`cp-table-amount ${bal > 0 ? 'cp-text-error' : 'cp-text-success'}`}>
                        ₹{bal.toFixed(2)}
                      </td>
                      <td className="text-right" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {canVerify && vStatus === 'Pending' && (
                          <>
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Verify Payment"
                              style={{ color: '#10b981' }}
                              onClick={() => handleVerify(p.id, 'Verified')}
                            >
                              <ShieldCheck size={15} />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs"
                              title="Reject Payment"
                              style={{ color: '#ef4444' }}
                              onClick={() => handleVerify(p.id, 'Rejected')}
                            >
                              <ShieldX size={15} />
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title="Print Receipt"
                          onClick={() => {
                            setCurrentReceiptData(p);
                            setShowReceipt(true);
                          }}
                        >
                          <Printer size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={paymentsPage} totalPages={paymentsTotalPages} total={paymentsTotal} onPageChange={setPaymentsPage} />
      </div>

      <ReceiptModal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        paymentData={currentReceiptData}
        branchInfo={{ location: 'Meppayur' }}
      />
    </div>
  );
};

export default CustomerPayments;

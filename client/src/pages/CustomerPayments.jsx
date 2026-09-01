/* global jsPDF, autoTable */
import React, { useEffect, useMemo, useState } from 'react';
import { lazyWithRetry } from '../utils/errorUtils';
import { useLocation } from 'react-router-dom';
import {
  Calendar, CreditCard, Receipt, Loader2, Plus, Wallet,
  User, Phone, Hash, FileText, IndianRupee, CheckCircle2, Clock,
  AlertTriangle, Banknote, Smartphone, Building2, ChevronDown, ChevronUp,
  Search, X, Layers, CheckCircle, Printer, ShieldCheck, ShieldX, ShieldAlert, AlertCircle,
  Tag, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import localDb from '../services/localDb';
import useAuth from '../hooks/useAuth';
import { serverToday } from '../services/serverTime';
import Pagination from '../components/Pagination';
import './CustomerPayments.css';
import toast from 'react-hot-toast';
import { GST_RATE } from '../constants';
import { useOnlineStatus } from '../hooks/useOffline';
import { formatForDisplay } from '../utils/phone';
import SectionErrorBoundary from '../components/SectionErrorBoundary';
import PageContainer from '../components/ui/PageContainer';
import NoInternetState from '../components/NoInternetState';
// qrcode replaced with lightweight qr-creator (loaded on demand)

const ReceiptModal = lazyWithRetry(() => import('../components/ReceiptModal'));

const paymentMethods = ['Cash', 'UPI', 'Cheque', 'Account Transfer'];

const CustomerPayments = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
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
  const [filterPendingOnly, setFilterPendingOnly] = useState(true);
  const customerDropdownRef = React.useRef(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState(null);
  const [statementRange, setStatementRange] = useState({
    start: serverToday().slice(0, 8) + '01', // First of current month
    end: serverToday()
  });
  const [activePreset, setActivePreset] = useState('thisMonth');
  const [downloading, setDownloading] = useState(false);

  // Discount states
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountMode, setDiscountMode] = useState('amount'); // 'percent' | 'amount'
  const [discountInputAmount, setDiscountInputAmount] = useState(0);
  const [discountRequest, setDiscountRequest] = useState(null); // { id, status, discount_percent }
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  const [discountRequestLoading, setDiscountRequestLoading] = useState(false);

  const [pageError, setPageError] = useState(null);
  const [paymentsError, setPaymentsError] = useState(null);
  const [showUpiQr, setShowUpiQr] = useState(false);
  const [upiQrDataUrl, setUpiQrDataUrl] = useState('');
  const [branchUpiId, setBranchUpiId] = useState('');
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
      } catch {
        draft = null;
      }
    }

    const searchParams = new URLSearchParams(location.search);
    const queryJobId = searchParams.get('job') || searchParams.get('job_id');
    const queryCustomerId = searchParams.get('customer') || searchParams.get('customer_id');

    const targetDraft = draft?.paymentPrefill || draft || {};
    const effectiveJobId = targetDraft.job_id || queryJobId;
    const effectiveCustomerId = targetDraft.customer_id || queryCustomerId;

    if (effectiveJobId || targetDraft.amount || targetDraft.customer_name || effectiveCustomerId) {
      const amountToPrefill = Number(targetDraft.amount ?? targetDraft.balance_amount ?? targetDraft.total_amount ?? 0);
      setFormData((prev) => ({
        ...prev,
        customer_id: effectiveCustomerId ? Number(effectiveCustomerId) : (targetDraft.customer_id || prev.customer_id || null),
        customer_name: targetDraft.customer_name || prev.customer_name || 'Walk-in',
        customer_mobile: targetDraft.customer_mobile || prev.customer_mobile,
        advance_paid: amountToPrefill,
        balance_amount: Number(targetDraft.balance_amount ?? amountToPrefill),
        total_amount: Number(targetDraft.total_amount ?? amountToPrefill),
        description: targetDraft.description || (targetDraft.job_number ? `Payment for Job #${targetDraft.job_number} - ${targetDraft.job_name || ''}` : prev.description),
        job_id: effectiveJobId || prev.job_id
      }));
      if (amountToPrefill > 0) {
        setPayment((prev) => ({
          ...prev,
          methodAmounts: { ...prev.methodAmounts, Cash: amountToPrefill }
        }));
      }
      if (targetDraft.customer_name) {
        setCustomerSearch(targetDraft.customer_name);
      }
      if (effectiveJobId) {
        setSelectedJobId(effectiveJobId);
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
    const init = () => {
      fetchPayments();
      fetchCustomers();
    };
    if (window.requestIdleCallback) {
      requestIdleCallback(init, { timeout: 1500 });
    } else {
      init();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPayments(paymentsPage);
  }, [paymentsPage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!formData.customer_id || orderLines.length > 0) return;
    fetchCustomerJobs(formData.customer_id);
  }, [formData.customer_id, orderLines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/branches').then(r => {
      const branches = Array.isArray(r.data) ? r.data : [];
      const myBranch = branches.find(b => String(b.id) === String(user?.branch_id));
      if (myBranch?.upi_id) setBranchUpiId(myBranch.upi_id);
    }).catch(() => {});
  }, [user?.branch_id]);

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

  async function fetchPayments(page = paymentsPage) {
    setLoading(true);
    try {
      if (isOnline) {
        // Fetch from server with pagination
        const res = await api.get('/customer-payments', {
          params: { page, limit: 20 }
        });
        
        // Handle both raw array and paginated object response
        const data = res.data.data || res.data;
        const total = res.data.total || data.length;
        const totalPages = res.data.totalPages || 1;
        
        setPayments(data || []);
        setPaymentsTotal(total);
        setPaymentsTotalPages(totalPages);
      } else {
        // Fetch from local IndexedDB with pagination
        const result = await localDb.getPayments({ 
          type: 'Customer',
          page,
          limit: 20
        });
        
        setPayments(result.data || []);
        setPaymentsTotal(result.total || 0);
        setPaymentsTotalPages(result.totalPages || 1);
      }
    } catch (err) {
      console.error('[CustomerPayments] Fetch error:', err);
      setPaymentsError('Failed to fetch payments');
      // If server fails, try local as fallback
      try {
        const result = await localDb.getPayments({ type: 'Customer', page, limit: 20 });
        setPayments(result.data || []);
        setPaymentsTotal(result.total || 0);
        setPaymentsTotalPages(result.totalPages || 1);
        setPaymentsError(null);
      } catch (err) {
        setPaymentsError('Failed to fetch payments (online & offline both failed)');
      }
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

  async function fetchCustomers() {
    try {
      let data = [];
      try {
        const res = await api.get('/customers');
        data = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (Array.isArray(data) && data.length > 0) {
          data.forEach((c) => {
            if (localDb.saveCustomer) localDb.saveCustomer(c).catch(() => {});
          });
        }
      } catch (apiErr) {
        console.warn('[CustomerPayments] API fetchCustomers error, falling back to localDb:', apiErr);
        data = await localDb.getCustomers();
      }
      setCustomers(data || []);
    } catch {
      setError('Failed to fetch customers');
    }
  }

  async function fetchCustomerJobs(customerId) {
    if (!customerId) {
      setCustomerJobs([]);
      setSelectedJobId(null);
      return;
    }
    try {
      let jobs = [];
      try {
        const res = await api.get(`/customers/${customerId}/jobs`);
        jobs = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (Array.isArray(jobs) && jobs.length > 0) {
          jobs.forEach((j) => {
            if (localDb.saveJob) localDb.saveJob(j).catch(() => {});
          });
        }
      } catch (apiErr) {
        console.warn('[CustomerPayments] API fetchCustomerJobs error, falling back to localDb:', apiErr);
        jobs = await localDb.getCustomerJobs(customerId);
      }

      const activeJobs = (jobs || []).filter((j) => j && j.status !== 'Cancelled');
      setCustomerJobs(activeJobs);

      const prefilledJobId = location.state?.job_id;
      const jobsWithBalance = activeJobs.filter((j) => getJobBalance(j) > 0);

      if (prefilledJobId && activeJobs.some((j) => String(j.id) === String(prefilledJobId))) {
        setSelectedJobId(prefilledJobId);
      } else if (jobsWithBalance.length > 1) {
        setSelectedJobId('all');
      } else if (jobsWithBalance.length === 1) {
        setSelectedJobId(jobsWithBalance[0].id);
      } else if (activeJobs.length > 1) {
        setSelectedJobId('all');
      } else if (activeJobs.length === 1) {
        setSelectedJobId(activeJobs[0].id);
      } else {
        setSelectedJobId(null);
      }
    } catch (err) {
      console.error('[CustomerPayments] Error fetching customer jobs:', err);
      setCustomerJobs([]);
      setSelectedJobId(null);
    }
  }

  const filteredCustomers = useMemo(() => {
    const hasPendingBalance = (c) => Number(c.due_amount) > 0 || Number(c.outstanding_balance) > 0;
    let list = customers.filter((c) => (c.type || '').toLowerCase() !== 'walk-in');
    if (filterPendingOnly) {
      list = list.filter(hasPendingBalance);
    }
    if (!customerSearch.trim()) return list;
    const q = customerSearch.toLowerCase();
    const digits = customerSearch.replace(/\D/g, '');
    return list.filter((c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.mobile || '').includes(q) ||
      (c.phone || '').includes(q) ||
      (digits && String(c.mobile || '').replace(/\D/g, '').includes(digits)) ||
      (digits && String(c.phone || '').replace(/\D/g, '').includes(digits))
    );
  }, [customers, customerSearch, filterPendingOnly]);

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

      const cashAmount = payment.selectedMethods.includes('Cash') ? (Number(payment.methodAmounts.Cash) || 0) : 0;
      const upiAmount = payment.selectedMethods.includes('UPI') ? (Number(payment.methodAmounts.UPI) || 0) : 0;
      const chequeAmount = payment.selectedMethods.includes('Cheque') ? (Number(payment.methodAmounts.Cheque) || 0) : 0;
      const transferAmount = payment.selectedMethods.includes('Account Transfer') ? (Number(payment.methodAmounts['Account Transfer']) || 0) : 0;
      const totalAdvancePaid = cashAmount + upiAmount + chequeAmount + transferAmount;
      
      const selected = payment.selectedMethods.length > 0 ? payment.selectedMethods : ['Cash'];
      const isCashUpiCombo = selected.length === 2 && selected.includes('Cash') && selected.includes('UPI');
      const paymentMethod = isCashUpiCombo ? 'Both' : selected[0];

      const isWalkIn = !formData.customer_id || formData.customer_name === 'Walk-in';
      const savedPaymentLocal = {
        ...formData,
        customer_id: formData.customer_id ? Number(formData.customer_id) : null,
        bill_amount: billAmount,
        total_amount: totals.gross,
        net_amount: totals.net,
        sgst_amount: totals.sgst,
        cgst_amount: totals.cgst,
        discount_percent: totals.effectiveDiscount || null,
        discount_amount: totals.discountAmount || null,
        advance_paid: totalAdvancePaid,
        balance_amount: Math.max(totals.gross - totalAdvancePaid, 0),
        payment_method: paymentMethod,
        cash_amount: cashAmount,
        upi_amount: upiAmount,
        cheque_amount: chequeAmount,
        account_transfer_amount: transferAmount,
        order_lines: orderLines,
        job_ids: jobIdsToSend,
        type: 'Customer',
        auto_deliver: isWalkIn
      };

      const result = await localDb.createPayment(savedPaymentLocal);

      const savedPayment = {
        ...savedPaymentLocal,
        id: result.id
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
      setPayment({ selectedMethods: ['Cash'], methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'Account Transfer': 0 } });
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
      // Check if this is a network error
      const isNetworkError = !err.response && (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !navigator.onLine);
      
      if (isNetworkError) {
        // Queue payment for offline sync
        try {
          const cashAmount = payment.selectedMethods.includes('Cash') ? (Number(payment.methodAmounts.Cash) || 0) : 0;
          const upiAmount = payment.selectedMethods.includes('UPI') ? (Number(payment.methodAmounts.UPI) || 0) : 0;
          const chequeAmount = payment.selectedMethods.includes('Cheque') ? (Number(payment.methodAmounts.Cheque) || 0) : 0;
          const transferAmount = payment.selectedMethods.includes('Account Transfer') ? (Number(payment.methodAmounts['Account Transfer']) || 0) : 0;
          
          const { default: offlineDb } = await import('../services/offlineDb');
          await offlineDb.savePendingPayment({
            customer_id: formData.customer_id ? Number(formData.customer_id) : null,
            customer_name: formData.customer_name,
            customer_mobile: formData.customer_mobile || null,
            total_amount: totals.gross,
            net_amount: totals.net,
            sgst_amount: totals.sgst,
            cgst_amount: totals.cgst,
            discount_percent: totals.effectiveDiscount || null,
            discount_amount: totals.discountAmount || null,
            advance_paid: cashAmount + upiAmount + chequeAmount + transferAmount,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            cheque_amount: chequeAmount,
            account_transfer_amount: transferAmount,
            reference_number: formData.reference_number || null,
            description: formData.description || '',
            payment_date: formData.payment_date,
            order_lines: orderLines,
            job_ids: orderLines.length === 0 ? (selectedJobId === 'all' ? customerJobs.filter((j) => getJobBalance(j) > 0).map((j) => Number(j.id)) : (selectedJobId ? [Number(selectedJobId)] : [])) : []
          });
          
          toast.success(`Payment saved offline! It will sync when internet returns.`, { duration: 5000, icon: '📴' });
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
          setPayment({ selectedMethods: ['Cash'], methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'Account Transfer': 0 } });
          setDiscountPercent(0);
          setDiscountInputAmount(0);
          setDiscountMode('amount');
          
          if (keepCustomerId) {
            fetchCustomerJobs(keepCustomerId);
          }
        } catch (offlineErr) {
          console.error('[CustomerPayments] Failed to save payment offline:', offlineErr);
          setError('Failed to save payment (network and offline backup both failed)');
        }
      } else {
        setError(err.response?.data?.message || 'Failed to save customer payment');
      }
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
    const numValue = Number(value) || 0;
    setPayment((prev) => ({
      ...prev,
      methodAmounts: { ...prev.methodAmounts, [method]: numValue }
    }));
  };

  const setPredefinedRange = (rangeType) => {
    setActivePreset(rangeType);
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
      const [jsPDFModule, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const jsPDF = jsPDFModule.default;
      const autoTable = autoTableModule.default;

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
      doc.text(`SARGA OFFSET`, 14, 30);
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

  const LoadingSkeleton = () => (
    <PageContainer>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ width: 200, height: 26, borderRadius: 6, background: 'var(--surface-2)' }} />
          <div style={{ width: 300, height: 14, borderRadius: 4, marginTop: 8, background: 'var(--surface-2)' }} />
        </div>
        <div style={{ width: 180, height: 22, borderRadius: 6, background: 'var(--surface-2)' }} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 36, borderRadius: 8, background: 'var(--surface-2)' }} />
        <div style={{ flex: 1, height: 36, borderRadius: 8, background: 'var(--surface-2)' }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 28 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 80, borderRadius: 10, background: 'var(--surface-2)' }} />
        ))}
      </div>
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ padding: '14px 16px', background: 'var(--surface-2)' }}>
          <div style={{ display: 'flex', gap: 24 }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ width: 80, height: 14, borderRadius: 4, background: 'var(--bg)' }} />
            ))}
          </div>
        </div>
        {[1,2,3,4].map(r => (
          <div key={r} style={{ display: 'flex', gap: 24, padding: '16px', borderBottom: '1px solid var(--border)' }}>
            {[1,2,3,4,5,6].map(c => (
              <div key={c} style={{ width: 80, height: 14, borderRadius: 4, background: 'var(--surface-2)' }} />
            ))}
          </div>
        ))}
      </div>
    </PageContainer>
  );

  if (pageError && !loading) {
    return (
      <SectionErrorBoundary name="CustomerPaymentsPage">
        <PageContainer>
          <NoInternetState
            variant="fullPage"
            title="Unable to Load Payments"
            message={pageError}
            suggestion="Please check your connection and try again."
            actionLabel="Retry"
            onRetry={() => { setPageError(null); return fetchPayments(1); }}
          />
        </PageContainer>
      </SectionErrorBoundary>
    );
  }

  if (loading && payments.length === 0) {
    return <LoadingSkeleton />;
  }

  return (
    <SectionErrorBoundary name="CustomerPaymentsPage">
    <PageContainer>
      {/* ── HEADER ── */}
      <div className="cp-header">
        <div className="cp-header-left">
          <div>
            <h1 className="cp-title">Customer Payments</h1>
            <p className="cp-subtitle">{isOnline ? 'Collect advance or full payment for customer orders' : 'Offline — payments will sync when internet returns.'}</p>
          </div>
        </div>
        <div className="cp-header-badge">
          <Receipt size={14} aria-hidden="true" />
          <span>{invoiceId}</span>
        </div>
      </div>

      {!isOnline && (
        <NoInternetState
          variant="section"
          title="Offline Mode"
          message="Payments will be saved locally and sync when internet returns."
          actionLabel="Check"
        />
      )}

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="cp-grid">
        {/* ─ LEFT: Customer & Bill ─ */}
        <div className="cp-panel">
          <div className="cp-panel-header">
            <div className="cp-panel-icon"><User size={18} aria-hidden="true" /></div>
            <h2 className="cp-panel-title">Customer & Bill</h2>
          </div>

          {/* Customer selector (manual mode) */}
          {orderLines.length === 0 && (
            <div className="cp-form-grid">
              <div ref={customerDropdownRef} className="cp-search-wrap">
                <label className="label" htmlFor="cp-customer-search">Search & Select Customer</label>
                <div className="cp-search-input-wrap">
                  <Search size={15} className="cp-search-icon" />
                  <input
                    id="cp-customer-search"
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
                      className="cp-search-clear touch-target"
                      aria-label="Clear customer search"
                      onClick={() => {
                        setCustomerSearch('');
                        setShowCustomerDropdown(true);
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <label className="cp-filter-toggle">
                  <input
                    type="checkbox"
                    checked={filterPendingOnly}
                    onChange={(e) => { setFilterPendingOnly(e.target.checked); setShowCustomerDropdown(true); }}
                  />
                  Only show customers with pending balance
                </label>
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
                            <span className="cp-dropdown-mobile">{c.mobile ? formatForDisplay(c.mobile) : 'No mobile'}</span>
                            <span className="cp-dropdown-due">
                              Due: ₹{(Number(c.due_amount) || Number(c.outstanding_balance) || 0).toFixed(2)}
                            </span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="cp-job-select" className="label">Select Job</label>
                <select
                  id="cp-job-select"
                  className="input-field"
                  value={selectedJobId || ''}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  disabled={!formData.customer_id || customerJobs.length === 0}
                  aria-label="Select job for payment"
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
                {formData.customer_mobile ? formatForDisplay(formData.customer_mobile) : 'No mobile'}
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
                    aria-label="Discount percentage"
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
                    aria-label="Discount amount in rupees"
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
            <span className="cp-amount-hero-label">Total Amount Due</span>
            <span className="cp-amount-hero-value">₹{totals.gross.toFixed(2)}</span>
          </div>

          <form onSubmit={handleReview} className="cp-form">
            {/* Name & mobile */}
            <div className="cp-form-grid">
              <div>
                <label htmlFor="cp-customer-name" className="label">Customer Name</label>
                <input
                  id="cp-customer-name"
                  name="cpCustomerName"
                  className="input-field"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  placeholder="Enter name"
                  required
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="cp-customer-mobile" className="label">Mobile</label>
                <input
                  id="cp-customer-mobile"
                  name="cpCustomerMobile"
                  className="input-field"
                  value={formData.customer_mobile}
                  onChange={(e) => setFormData({ ...formData, customer_mobile: e.target.value })}
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                />
              </div>
            </div>

            {/* Amount paid / Balance / Date */}
            <div className="cp-form-grid cp-form-grid--3">
              <div>
                <label className="label">Amount Collecting Now</label>
                <div className="cp-display-field cp-display-field--accent">
                  ₹{Number(formData.advance_paid).toFixed(2)}
                </div>
              </div>
              <div>
                <label className="label">After Payment</label>
                <div className={`cp-display-field cp-display-field--${balanceStatus === 'Paid' ? 'success' : balanceStatus === 'Partial' ? 'warning' : 'error'}`}>
                  <span>₹{Number(formData.balance_amount).toFixed(2)}</span>
                  <span className="cp-balance-badge">{balanceStatus === 'Paid' ? 'Paid in Full' : balanceStatus}</span>
                </div>
              </div>
              <div>
                <label className="label">Payment Date</label>
                <div className="cp-display-field" style={{ fontSize: 14 }}>
                  <Calendar size={14} style={{ flexShrink: 0 }} />
                  <span>{formData.payment_date}</span>
                </div>
              </div>
            </div>

            {/* Quick preset collection buttons */}
            {totals.gross > 0 && (
              <div className="row gap-xs items-center my-2" style={{ flexWrap: 'wrap' }}>
                <span className="text-xs muted font-medium">Quick Fill Amount:</span>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => {
                    const primaryMethod = payment.selectedMethods[0] || 'Cash';
                    setPayment(prev => ({
                      ...prev,
                      selectedMethods: prev.selectedMethods.length ? prev.selectedMethods : ['Cash'],
                      methodAmounts: { ...prev.methodAmounts, [primaryMethod]: totals.gross }
                    }));
                  }}
                >
                  Pay Full (₹{totals.gross.toFixed(2)})
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-outline"
                  onClick={() => {
                    const primaryMethod = payment.selectedMethods[0] || 'Cash';
                    const half = Math.round((totals.gross / 2) * 100) / 100;
                    setPayment(prev => ({
                      ...prev,
                      selectedMethods: prev.selectedMethods.length ? prev.selectedMethods : ['Cash'],
                      methodAmounts: { ...prev.methodAmounts, [primaryMethod]: half }
                    }));
                  }}
                >
                  Pay 50% (₹{(totals.gross / 2).toFixed(2)})
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost"
                  onClick={() => {
                    setPayment(prev => ({
                      ...prev,
                      methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'Account Transfer': 0 }
                    }));
                  }}
                >
                  Clear Amount
                </button>
              </div>
            )}

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
                      className={`cp-method-pill touch-target ${active ? 'cp-method-pill--active' : ''}`}
                      onClick={() => toggleMethod(method)}
                      aria-pressed={active}
                      aria-label={`${active ? 'Remove' : 'Add'} ${method} payment method`}
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
                  <label htmlFor="cp-cash-amount" className="label"><Banknote size={13} /> Cash Amount</label>
                  <input
                    id="cp-cash-amount"
                    type="number"
                    className="input-field"
                    aria-label="Cash payment amount"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={payment.methodAmounts.Cash}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => updateMethodAmount('Cash', e.target.value)}
                  />
                </div>
              )}
              {payment.selectedMethods.includes('UPI') && (
                <div>
                  <label htmlFor="cp-upi-amount" className="label"><Smartphone size={13} /> UPI Amount</label>
                  <input
                    id="cp-upi-amount"
                    type="number"
                    className="input-field"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={payment.methodAmounts.UPI}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => updateMethodAmount('UPI', e.target.value)}
                    aria-label="UPI payment amount"
                  />
                  {Number(payment.methodAmounts.UPI) > 0 && branchUpiId && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline touch-target"
                      style={{ marginTop: 8, width: '100%' }}
                      onClick={async () => {
                        try {
                          const upiLink = `upi://pay?pa=${encodeURIComponent(branchUpiId)}&pn=${encodeURIComponent('SARGA OFFSET')}&am=${Number(payment.methodAmounts.UPI).toFixed(2)}&cu=INR&tn=Payment`;
                          const { default: QrCreator } = await import('qr-creator');
                          const canvas = document.createElement('canvas');
                          QrCreator.render({ text: upiLink, radius: 0.0, ecLevel: 'M', fill: '#000000', background: '#ffffff', size: 300 }, canvas);
                          setUpiQrDataUrl(canvas.toDataURL('image/png'));
                          setShowUpiQr(true);
                        } catch { toast.error('Failed to generate QR code'); }
                      }}
                    >
                      <Smartphone size={14} /> Show QR Code
                    </button>
                  )}
                </div>
              )}
              {payment.selectedMethods.includes('Cheque') && (
                <div>
                  <label htmlFor="cp-cheque-amount" className="label"><FileText size={13} /> Cheque Amount</label>
                  <input
                    id="cp-cheque-amount"
                    type="number"
                    className="input-field"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={payment.methodAmounts.Cheque}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => updateMethodAmount('Cheque', e.target.value)}
                    aria-label="Cheque payment amount"
                  />
                </div>
              )}
              {payment.selectedMethods.includes('Account Transfer') && (
                <div>
                  <label htmlFor="cp-transfer-amount" className="label"><Building2 size={13} /> Transfer Amount</label>
                  <input
                    id="cp-transfer-amount"
                    type="number"
                    className="input-field"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={payment.methodAmounts['Account Transfer']}
                    onWheel={(e) => e.target.blur()}
                    onChange={(e) => updateMethodAmount('Account Transfer', e.target.value)}
                    aria-label="Account transfer amount"
                  />
                </div>
              )}
            </div>

            {/* Ref number & notes */}
            {payment.selectedMethods.some((m) => m !== 'Cash') && (
              <div className="cp-form-grid">
                <div>
                  <label htmlFor="cp-ref-no" className="label">UTR / Reference No</label>
                  <input
                    id="cp-ref-no"
                    type="text"
                    className="input-field"
                    aria-label="UTR or reference number"
                    value={formData.reference_number}
                    onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
                    placeholder="Transaction reference"
                  />
                </div>
                <div>
                  <label htmlFor="cp-notes" className="label">Purpose / Notes</label>
                  <textarea
                    id="cp-notes"
                    className="input-field"
                    rows="3"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional notes"
                    aria-label="Payment purpose or notes"
                    style={{ resize: 'vertical', minHeight: 60 }}
                  />
                </div>
              </div>
            )}

            {payment.selectedMethods.length === 1 && payment.selectedMethods[0] === 'Cash' && (
              <div>
                <label htmlFor="cp-cash-notes" className="label">Purpose / Notes</label>
                <textarea
                  id="cp-cash-notes"
                  name="cpCashNotes"
                  className="input-field"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional notes"
                  style={{ resize: 'vertical', minHeight: 60 }}
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
            <button type="submit" className="btn btn-primary btn--full cp-submit touch-target" disabled={saving || !canSave}>
              <CheckCircle2 size={16} aria-hidden="true" /> Review & Confirm — ₹{totals.gross.toFixed(2)}
            </button>
          </form>

          {/* ── Confirmation Overlay ── */}
          {confirming && (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-payment-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirming(false); }}>
              <div className="em-modal em-modal--sm" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="em-modal__header"><h2 id="confirm-payment-title">Confirm Customer Payment</h2><button className="btn btn-ghost btn-icon" onClick={() => setConfirming(false)} aria-label="Go back to edit"><X size={18} aria-hidden="true" /></button></div>
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
                  <div className="em-modal__footer"><button type="button" className="btn btn-ghost touch-target" onClick={() => setConfirming(false)} aria-label="Go back to edit payment">← Back to Edit</button><button type="submit" className="btn btn-primary touch-target" disabled={saving} aria-label={saving ? 'Processing payment' : 'Confirm payment'}>{saving ? 'Processing...' : 'Confirm Payment'}</button></div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── UPI QR Code Modal ── */}
      {showUpiQr && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upi-qr-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowUpiQr(false); }}>
          <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div className="row items-center justify-between mb-16">
              <h2 id="upi-qr-title" className="section-title">UPI QR Code</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setShowUpiQr(false)} aria-label="Close QR code">Close</button>
            </div>
            <div style={{ padding: '16px 0' }}>
              {upiQrDataUrl && <img src={upiQrDataUrl} alt="UPI QR Code" style={{ width: 280, height: 280, borderRadius: 12 }} />}
              <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
                Scan with any UPI app to pay <strong>₹{Number(payment.methodAmounts.UPI).toFixed(2)}</strong>
              </div>
              {branchUpiId && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  UPI ID: {branchUpiId}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Discount Approval Request Modal ── */}
      {showDiscountModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="discount-modal-title">
          <div className="modal" style={{ maxWidth: '420px' }}>
            <div className="row items-center justify-between mb-16">
              <h2 id="discount-modal-title" className="section-title">Request Discount Approval</h2>
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
                <label htmlFor="cp-discount-reason" className="label">Reason for Discount <span style={{ color: 'var(--clr-error, var(--error))' }}>*</span></label>
                <textarea
                  id="cp-discount-reason"
                  name="cpDiscountReason"
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
          {paymentsError && (
            <span style={{ fontSize: 12, color: 'var(--error)', marginLeft: 12 }}>{paymentsError}</span>
          )}
        </div>

        {/* ── FILTERS BAR ── */}
        <div className="cp-filters-row" style={{ padding: '0 24px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
          {canVerify && (
            <div className="row gap-xs" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {[{ key: 'all', label: 'All' }, { key: 'pending', label: 'Pending', icon: ShieldAlert, color: 'var(--warning)' }, { key: 'verified', label: 'Verified', icon: ShieldCheck, color: 'var(--success)' }, { key: 'rejected', label: 'Rejected', icon: ShieldX, color: 'var(--destructive)' }].map(f => (
                <button
                  key={f.key}
                  className={`btn btn-xs ${verifyFilter === f.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setVerifyFilter(f.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, height: '32px', minHeight: '32px' }}
                >
                  {f.icon && <f.icon size={13} style={{ color: verifyFilter === f.key ? undefined : f.color }} />}
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div style={{ width: '1px', height: '24px', background: 'var(--border)', alignSelf: 'center', display: canVerify ? 'block' : 'none' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="cp-date-from" className="label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: 0 }}>From</label>
              <input
                id="cp-date-from"
                type="date"
                className="input-field input-field--sm"
                value={statementRange.start}
                onChange={e => { setStatementRange(prev => ({ ...prev, start: e.target.value })); setActivePreset(null); }}
                style={{ height: '32px', minHeight: '32px', width: '130px', padding: '0 8px', fontSize: '12px' }}
                aria-label="Statement start date"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="cp-date-to" className="label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--muted)', marginBottom: 0 }}>To</label>
              <input
                id="cp-date-to"
                type="date"
                className="input-field input-field--sm"
                value={statementRange.end}
                onChange={e => { setStatementRange(prev => ({ ...prev, end: e.target.value })); setActivePreset(null); }}
                style={{ height: '32px', minHeight: '32px', width: '130px', padding: '0 8px', fontSize: '12px' }}
                aria-label="Statement end date"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px' }}>
              <button
                type="button"
                className={`btn btn-xs cp-preset-btn ${activePreset === 'thisMonth' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPredefinedRange('thisMonth')}
              >
                This Month
              </button>
              <button
                type="button"
                className={`btn btn-xs cp-preset-btn ${activePreset === 'lastMonth' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPredefinedRange('lastMonth')}
              >
                Last Month
              </button>
              <button
                type="button"
                className={`btn btn-xs cp-preset-btn ${activePreset === 'financialYear' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setPredefinedRange('financialYear')}
              >
                FY
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm ml-auto"
              onClick={handleDownloadStatement}
              disabled={downloading}
              style={{ height: '32px', minHeight: '32px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              aria-label="Download payment statement"
            >
              {downloading ? <Loader2 size={14} className="cp-spin" aria-hidden="true" /> : <FileText size={14} aria-hidden="true" />}
              <span>Statement</span>
            </button>
          </div>
        </div>

        <div className="cp-table-wrap">
          <table className="table">
            <caption className="sr-only">Payment history table</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Customer</th>
                <th scope="col">Method</th>
                <th scope="col">Status</th>
                <th scope="col">Billed</th>
                <th scope="col">Paid</th>
                <th scope="col">Balance</th>
                <th scope="col">Actions</th>
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
                  const paid = isNaN(Number(p.advance_paid)) ? 0 : Number(p.advance_paid);
                  const bal = isNaN(Number(p.balance_amount)) ? 0 : Number(p.balance_amount);
                  const isCash = p.payment_method === 'Cash';
                  const vStatus = isCash ? 'N/A' : (p.verification_status || 'Pending');
                  const methodColor = {
                    Cash: 'var(--success)',
                    UPI: 'var(--muted-foreground)',
                    Cheque: 'var(--warning)',
                    'Account Transfer': 'var(--accent)',
                    Both: 'var(--accent)',
                  }[p.payment_method] || 'var(--text-muted)';
                  return (
                    <tr key={p.id}>
                      <td className="text-sm">
                        <div className="row gap-sm">
                          <Calendar size={13} className="muted" aria-hidden="true" />
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
                        <span className="cp-method-tag" style={{ color: methodColor, borderColor: methodColor + '33', border: '1px solid' }}>
                          <Receipt size={12} /> {p.payment_method || '—'}
                        </span>
                      </td>
                      <td>
                        {vStatus === 'N/A' ? (
                          <span className="cp-verify-badge cp-verify-na" style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                        ) : vStatus === 'Verified' ? (
                          <span className="cp-verify-badge cp-verify-ok" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
                            <ShieldCheck size={13} aria-hidden="true" /> Verified
                          </span>
                        ) : vStatus === 'Rejected' ? (
                          <span className="cp-verify-badge cp-verify-fail" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--destructive)', fontWeight: 600 }}>
                            <ShieldX size={13} aria-hidden="true" /> Rejected
                          </span>
                        ) : (
                          <span className="cp-verify-badge cp-verify-pending" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--warning)', fontWeight: 600 }}>
                            <ShieldAlert size={13} aria-hidden="true" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="cp-table-amount">₹{(isNaN(Number(p.total_amount)) ? 0 : Number(p.total_amount)).toFixed(2)}</td>
                      <td className="cp-table-amount cp-text-success">₹{paid.toFixed(2)}</td>
                      <td className={`cp-table-amount ${bal > 0 ? 'cp-text-error' : 'cp-text-success'}`}>
                        ₹{bal.toFixed(2)}
                      </td>
                      <td className="text-right" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {canVerify && !isCash && vStatus === 'Pending' && (
                          <>
                            <button
                              className="btn btn-ghost btn-xs touch-target"
                              title="Verify Payment"
                              aria-label={`Verify payment ${p.id}`}
                              style={{ color: 'var(--success)' }}
                              onClick={() => handleVerify(p.id, 'Verified')}
                            >
                              <ShieldCheck size={15} aria-hidden="true" />
                            </button>
                            <button
                              className="btn btn-ghost btn-xs touch-target"
                              title="Reject Payment"
                              aria-label={`Reject payment ${p.id}`}
                              style={{ color: 'var(--destructive)' }}
                              onClick={() => handleVerify(p.id, 'Rejected')}
                            >
                              <ShieldX size={15} aria-hidden="true" />
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-ghost btn-sm btn-icon touch-target"
                          title="Print Receipt"
                          aria-label={`Print receipt for payment ${p.id}`}
                          onClick={() => {
                            setCurrentReceiptData(p);
                            setShowReceipt(true);
                          }}
                        >
                          <Printer size={15} aria-hidden="true" />
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

      <React.Suspense fallback={null}>
        <SectionErrorBoundary name="ReceiptModal" title="Receipt unavailable" message="Failed to load the receipt preview.">
          <ReceiptModal
            isOpen={showReceipt}
            onClose={() => setShowReceipt(false)}
            paymentData={currentReceiptData}
            branchInfo={{ location: 'Meppayur' }}
          />
        </SectionErrorBoundary>
      </React.Suspense>
    </PageContainer>
    </SectionErrorBoundary>
  );
};

export default CustomerPayments;

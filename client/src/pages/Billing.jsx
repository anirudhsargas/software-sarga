import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';
import { serverToday } from '../services/serverTime';
import { Camera, Download, Printer, Scissors, WifiOff, Plus, Minus } from 'lucide-react';
import ScannerModal from '../components/ScannerModal';
import PaperOptimizer from '../components/PaperOptimizer';
import { calculateProductPrice } from '../utils/pricing';
import { downloadInvoicePDF, printInvoicePDF } from '../utils/invoicePdf';
import { useConfirm } from '../contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { GST_RATE } from '../constants';
import offlineDb from '../services/offlineDb';
import { useOnlineStatus } from '../hooks/useOffline';
import { getCachedHierarchy, getCachedMachines, getCachedBranches, prefetchBillingData } from '../services/offlineSync';

const customerTypes = ['Walk-in', 'Retail', 'Association', 'Offset'];
const paymentMethods = ['Cash', 'UPI', 'Cheque', 'Account Transfer'];

const Billing = () => {
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
    const isAdmin = auth.getUser()?.role === 'Admin';
  const { confirm } = useConfirm();
  const isOnline = useOnlineStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [customerSearching, setCustomerSearching] = useState(false);
  const mobileSearchRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const [hierarchy, setHierarchy] = useState([]);
  const [machines, setMachines] = useState([]);
  const [productError, setProductError] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [extraInputs, setExtraInputs] = useState([]);
  const [qrInput, setQrInput] = useState('');
  const [orderLines, setOrderLines] = useState([]);
  const [showPostBillOptions, setShowPostBillOptions] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignJobs, setAssignJobs] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [assignRoles, setAssignRoles] = useState({});
  const [assignSelections, setAssignSelections] = useState({});
  const [roleSuggestions, setRoleSuggestions] = useState({});
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [payment, setPayment] = useState({
    selectedMethods: ['Cash'],
    methodAmounts: {
      Cash: 0,
      UPI: 0,
      Cheque: 0,
      'Account Transfer': 0
    },
    referenceNumber: '',
    description: '',
    paymentDate: serverToday()
  });

  const [form, setForm] = useState({
    type: 'Walk-in',
    mobile: '',
    name: '',
    gst: '',
    email: '',
    address: ''
  });

  const [showScanner, setShowScanner] = useState(false);
  const [showPaperOptimizer, setShowPaperOptimizer] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [lastOrderCustomerType, setLastOrderCustomerType] = useState('');
  const [lastOrderAutoDelivered, setLastOrderAutoDelivered] = useState(false);
  const [lastBillData, setLastBillData] = useState(null);
  const [branchUpiId, setBranchUpiId] = useState('');
  const [scannedPreview, setScannedPreview] = useState(null); // { item, unitPrice, mrp } for inventory preview

  // Discount states
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountMode, setDiscountMode] = useState('amount'); // 'percent' | 'amount'
  const [discountInputAmount, setDiscountInputAmount] = useState(0); // raw ₹ input
  const [discountRequest, setDiscountRequest] = useState(null); // { id, status, discount_percent }
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountReason, setDiscountReason] = useState('');
  const [discountRequestLoading, setDiscountRequestLoading] = useState(false);

  const [jobData, setJobData] = useState({
    job_name: '',
    description: '',
    quantity: 1,
    unit_price: 0,
    total_amount: 0,
    advance_paid: 0,
    delivery_date: '',
    applied_extras: [],
    customPaperRate: 0,
    is_double_side: false,
    machine_id: ''
  });

  const resetBillingState = () => {
    setForm({
      type: 'Walk-in',
      mobile: '',
      name: '',
      gst: '',
      email: '',
      address: ''
    });
    setExistingCustomer(null);
    setOrderLines([]);
    setQrInput('');
    setSelectedProduct(null);
    setExtraInputs([]);
    setJobData({
      job_name: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      advance_paid: 0,
      delivery_date: '',
      applied_extras: [],
      customPaperRate: 0,
      is_double_side: false,
      machine_id: ''
    });
    setPayment({
      selectedMethods: ['Cash'],
      methodAmounts: {
        Cash: 0,
        UPI: 0,
        Cheque: 0,
        'Account Transfer': 0
      },
      referenceNumber: '',
      description: '',
      paymentDate: serverToday()
    });
    setError('');
    setProductError('');
    setDiscountPercent(0);
    setDiscountInputAmount(0);
    setDiscountMode('amount');
    setDiscountRequest(null);
    setDiscountReason('');
  };

  const loadStaffOptions = async () => {
    if (staffOptions.length > 0) return;
    const response = await api.get('/staff?all=true');
    const allStaff = response.data || [];
    // Sort: current user's branch staff first
    const userBranchId = auth.getUser()?.branch_id;
    allStaff.sort((a, b) => {
      const aMatch = a.branch_id === userBranchId ? 0 : 1;
      const bMatch = b.branch_id === userBranchId ? 0 : 1;
      return aMatch - bMatch;
    });
    setStaffOptions(allStaff);
  };

  const loadRoleSuggestions = async (jobsToAssign, role) => {
    if (!role || roleSuggestions[role]) return roleSuggestions[role];
    const productIds = jobsToAssign
      .map((job) => Number(job.product_id))
      .filter((id) => Number.isFinite(id));
    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length === 0) return {};

    const response = await api.get(
      `/jobs/assignments/suggestions?product_ids=${uniqueIds.join(',')}&role=${encodeURIComponent(role)}`
    );
    const suggestions = response.data?.suggestions || {};
    setRoleSuggestions((prev) => ({ ...prev, [role]: suggestions }));
    return suggestions;
  };

  useEffect(() => {
    if (!showAssignModal) return;
    const loadAssignData = async () => {
      setAssignError('');
      setAssignLoading(true);
      try {
        // Log the jobs structure for debugging
        console.log('===== MODAL OPENED =====');
        console.log('assignJobs:', assignJobs);
        assignJobs.forEach((job, idx) => {
          console.log(`Job ${idx}:`, {
            id: job.id,
            job_number: job.job_number,
            product_id: job.product_id,
            id_type: typeof job.id,
            id_as_number: Number(job.id),
            is_finite: Number.isFinite(Number(job.id))
          });
        });
        await loadStaffOptions();
      } catch (err) {
        console.error('Failed to load staff options:', err);
        setAssignError('Failed to load staff. Please try again.');
      } finally {
        setAssignLoading(false);
      }
    };
    loadAssignData();
  }, [showAssignModal, assignJobs]);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const response = await api.get('/machines?is_active=true');
        setMachines(response.data || []);
        offlineDb.cacheData('machines', response.data || []).catch(() => {});
      } catch (err) {
        try {
          const cached = await getCachedMachines();
          if (cached) setMachines(cached);
        } catch (_) {}
      }
    };

    const fetchBranches = async () => {
      try {
        const res = await api.get('/branches');
        setBranches(res.data || []);
        if (isAdmin && res.data?.length > 0 && !selectedBranchId) {
          setSelectedBranchId(res.data[0].id);
        }
        const userBranchId = auth.getUser()?.branch_id;
        const branch = (res.data || []).find(b => b.id === userBranchId);
        if (branch?.upi_id) setBranchUpiId(branch.upi_id);
        offlineDb.cacheData('branches', res.data || []).catch(() => {});
      } catch {
        try {
          const cached = await getCachedBranches();
          if (cached) {
            setBranches(cached);
            if (isAdmin && cached.length > 0 && !selectedBranchId) {
              setSelectedBranchId(cached[0].id);
            }
            const userBranchId = auth.getUser()?.branch_id;
            const branch = cached.find(b => b.id === userBranchId);
            if (branch?.upi_id) setBranchUpiId(branch.upi_id);
          }
        } catch (_) {}
      }
    };

    fetchMachines();
    fetchBranches();
  }, []);

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const response = await api.get('/product-hierarchy');
        setHierarchy(response.data || []);
        // Cache for offline use
        offlineDb.cacheData('product-hierarchy', response.data || []).catch(() => {});
      } catch (err) {
        // Fallback to offline cache
        console.warn('Failed to load products from server, trying offline cache...');
        try {
          const cached = await getCachedHierarchy();
          if (cached && cached.length > 0) {
            setHierarchy(cached);
            setProductError('');
            toast('Using cached product data (offline mode)', { icon: '📶' });
          } else {
            setProductError('Failed to load products — no cached data available');
          }
        } catch (_) {
          setProductError('Failed to load products');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchHierarchy();
  }, []);

  useEffect(() => {
    if (!hierarchy.length) return;
    if (!selectedCategoryId) {
      setSelectedCategoryId(hierarchy[0].id);
      return;
    }
    const category = hierarchy.find((c) => String(c.id) === String(selectedCategoryId));
    const subcategories = category?.subcategories || [];
    if (!subcategories.length) {
      setSelectedSubcategoryId('');
      return;
    }
    if (!selectedSubcategoryId || !subcategories.some((s) => String(s.id) === String(selectedSubcategoryId))) {
      setSelectedSubcategoryId(subcategories[0].id);
    }
  }, [hierarchy, selectedCategoryId, selectedSubcategoryId]);

  useEffect(() => {
    const prefill = location.state?.customer;
    if (!prefill) return;
    setForm((prev) => ({
      ...prev,
      type: prefill.type || prev.type,
      mobile: prefill.mobile || '',
      name: prefill.name || '',
      email: prefill.email || '',
      address: prefill.address || '',
      gst: prefill.gst || ''
    }));
    if (prefill.id || prefill.mobile) {
      setExistingCustomer(prefill);
    }
  }, [location.state]);

  useEffect(() => {
    if (form.mobile.length !== 10) {
      setExistingCustomer(null);
      return;
    }

    // Debounced server-side customer lookup
    if (mobileSearchRef.current) clearTimeout(mobileSearchRef.current);
    mobileSearchRef.current = setTimeout(async () => {
      try {
        setCustomerSearching(true);
        const response = await api.get('/customers', { params: { search: form.mobile } });
        const results = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        const match = results.find((c) => String(c.mobile) === form.mobile);
        if (!match) {
          setExistingCustomer(null);
          return;
        }
        setExistingCustomer(match);
        setForm((prev) => ({
          ...prev,
          name: match.name || prev.name,
          type: match.type || prev.type,
          email: match.email || prev.email,
          address: match.address || prev.address
        }));
      } catch (err) {
        console.error('Customer search failed:', err);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);

    return () => {
      if (mobileSearchRef.current) clearTimeout(mobileSearchRef.current);
    };
  }, [form.mobile]);

  // Warn user before refresh/close if there's unsaved billing data
  useEffect(() => {
    const hasData = orderLines.length > 0 || form.mobile.length > 0 || form.name.trim().length > 0;
    const handler = (e) => {
      if (hasData) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [orderLines.length, form.mobile, form.name]);

  const isWalkIn = form.type === 'Walk-in';
  const needsGst = form.type === 'Association' || form.type === 'Offset' || form.type === 'Retail';

  const canProceed = useMemo(() => {
    const customerReady = isWalkIn ? true : (form.mobile.length === 10 && form.name.trim().length > 0);
    return customerReady && orderLines.length > 0;
  }, [form.mobile, form.name, isWalkIn, orderLines.length]);

  const advancePaid = useMemo(() => {
    return payment.selectedMethods.reduce((sum, method) => {
      return sum + (Number(payment.methodAmounts[method]) || 0);
    }, 0);
  }, [payment.selectedMethods, payment.methodAmounts]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMobileChange = (value) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 10);
    handleChange('mobile', cleaned);
    if (cleaned.length > 0 && cleaned.length !== 10) {
      setFieldErrors((prev) => ({ ...prev, mobile: 'Mobile must be exactly 10 digits' }));
    } else {
      setFieldErrors((prev) => { const { mobile, ...rest } = prev; return rest; });
    }
  };

  const validateEmail = (email) => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateGST = (gst) => {
    if (!gst) return true;
    return /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/.test(gst);
  };

  const validateCustomerFields = () => {
    const errors = {};
    if (!isWalkIn) {
      if (!form.mobile || form.mobile.length !== 10) errors.mobile = 'Mobile must be exactly 10 digits';
      if (!form.name?.trim()) errors.name = 'Customer name is required';
    }
    if (form.email && !validateEmail(form.email)) errors.email = 'Invalid email format';
    if (form.gst && !validateGST(form.gst)) errors.gst = 'Invalid GST format (e.g., 29ABCDE1234F1Z5)';
    if (form.name && form.name.trim().length > 100) errors.name = 'Name must be under 100 characters';
    if (form.address && form.address.trim().length > 500) errors.address = 'Address must be under 500 characters';
    return errors;
  };

  const validatePayment = () => {
    const errors = {};
    if (payment.selectedMethods.length === 0) errors.paymentMethod = 'Select at least one payment method';
    if (advancePaid < 0) errors.advancePaid = 'Payment amount cannot be negative';
    if (advancePaid > totals.gross * 1.01) errors.advancePaid = 'Payment exceeds total amount';
    payment.selectedMethods.forEach((method) => {
      const amt = Number(payment.methodAmounts[method]) || 0;
      if (amt < 0) errors[method] = `${method} amount cannot be negative`;
    });
    if (payment.selectedMethods.some((m) => m !== 'Cash') && !payment.referenceNumber?.trim()) {
      errors.referenceNumber = 'Reference number required for non-cash payments';
    }
    return errors;
  };

  const ensureCustomer = async () => {
    const trimmedName = form.name?.trim() || (isWalkIn ? 'Walk-in Customer' : '');
    const trimmedMobile = form.mobile?.replace(/\D/g, '').slice(0, 10) || '';
    const trimmedEmail = form.email?.trim() || '';
    const trimmedGst = form.gst?.trim().toUpperCase() || '';
    const trimmedAddress = form.address?.trim() || '';

    if (existingCustomer) {
      const existingMobile = String(existingCustomer.mobile || '').replace(/\D/g, '').slice(0, 10);
      const payload = {
        mobile: existingMobile,
        name: trimmedName || existingCustomer.name || 'Walk-in Customer',
        type: form.type,
        email: trimmedEmail || null,
        gst: trimmedGst || null,
        address: trimmedAddress || null
      };

      const shouldUpdate =
        String(existingCustomer.type || '') !== String(payload.type || '') ||
        String(existingCustomer.name || '') !== String(payload.name || '') ||
        String(existingCustomer.email || '') !== String(payload.email || '') ||
        String(existingCustomer.gst || '') !== String(payload.gst || '') ||
        String(existingCustomer.address || '') !== String(payload.address || '');

      if (shouldUpdate && existingCustomer.id) {
        await api.put(`/customers/${existingCustomer.id}`, payload);
        const updatedCustomer = { ...existingCustomer, ...payload };
        setExistingCustomer(updatedCustomer);
        return updatedCustomer;
      }

      return existingCustomer;
    }

    // Walk-ins without mobile: skip customer creation, return null
    if (isWalkIn && !trimmedMobile) {
      return null;
    }

    // Non walk-in must have mobile + name
    if (!isWalkIn && (trimmedMobile.length !== 10 || !trimmedName)) {
      throw new Error('Customer name and valid 10-digit mobile are required');
    }

    const payload = {
      mobile: trimmedMobile || null,
      name: trimmedName,
      type: form.type,
      email: trimmedEmail || null,
      gst: trimmedGst || null,
      address: trimmedAddress || null
    };

    const response = await api.post('/customers', payload);
    const newCustomer = { id: response.data?.id, ...payload };
    setExistingCustomer(newCustomer);
    return newCustomer;
  };

  const handleAddOrder = async () => {
    if (!canProceed) {
      setError('Enter required customer details before continuing.');
      return;
    }

    // Validate customer fields
    const custErrors = validateCustomerFields();
    if (Object.keys(custErrors).length > 0) {
      setFieldErrors(custErrors);
      setError(Object.values(custErrors)[0]);
      return;
    }

    // Validate order lines
    if (orderLines.length === 0) {
      setError('Add at least one product to the bill.');
      return;
    }
    for (const line of orderLines) {
      if (!Number(line.quantity) || Number(line.quantity) <= 0) {
        setError(`Invalid quantity for ${line.product_name}. Must be greater than 0.`);
        return;
      }
      if (Number(line.total_amount) < 0) {
        setError(`Invalid total for ${line.product_name}. Amount cannot be negative.`);
        return;
      }
    }

    // Block negative or zero bill total (e.g. discount exceeds subtotal)
    if (totals.gross <= 0) {
      setError('Bill total must be greater than zero. Please adjust items or discount.');
      return;
    }

    // Validate payment
    const payErrors = validatePayment();
    if (Object.keys(payErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...payErrors }));
      setError(Object.values(payErrors)[0]);
      return;
    }

    // Walk-in customers must pay the full amount
    if (isWalkIn && advancePaid < totals.gross * 0.99) {
      setError('Walk-in customers must make full payment before creating a bill.');
      setFieldErrors((prev) => ({ ...prev, advancePaid: 'Full payment required for walk-in customers' }));
      return;
    }

    // Discount approval check
    if (totals.activePct > 5) {
      if (!discountRequest || discountRequest.status === 'REJECTED') {
        setShowDiscountModal(true);
        return;
      }
      if (discountRequest.status === 'PENDING') {
        setError('Discount approval is still pending. Please wait for admin to approve, then click Create Bill.');
        return;
      }
      // APPROVED — fall through
    }

    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      const customer = await ensureCustomer();
      let createdJobs = [];

      if (orderLines.length > 0) {
        const payload = {
          customer_id: customer?.id || null,
          order_lines: orderLines
        };
        if (isAdmin && selectedBranchId) {
          payload.branch_id = selectedBranchId;
        }
        const jobRes = await api.post('/jobs/bulk', payload);
        createdJobs = jobRes.data?.jobs || [];
        console.log('✓ Jobs created from /jobs/bulk:', createdJobs);
        createdJobs.forEach((j, idx) => {
          console.log(`  Job ${idx}: id=${j.id} (type: ${typeof j.id}), job_number=${j.job_number}`);
        });
      }

      const customerName = form.name?.trim() || existingCustomer?.name || 'Walk-in';
      const cashAmount = Number(payment.methodAmounts.Cash) || 0;
      const upiAmount = Number(payment.methodAmounts.UPI) || 0;
      const chequeAmount = Number(payment.methodAmounts.Cheque) || 0;
      const transferAmount = Number(payment.methodAmounts['Account Transfer']) || 0;
      const selectedMethods = payment.selectedMethods.length > 0
        ? payment.selectedMethods
        : ['Cash'];
      const isCashUpiCombo = selectedMethods.length === 2
        && selectedMethods.includes('Cash')
        && selectedMethods.includes('UPI');
      const paymentMethod = isCashUpiCombo
        ? 'Both'
        : selectedMethods[0];
      const paymentLabel = selectedMethods.join(' + ');

      const methodNote = selectedMethods.length > 1 ? `Methods: ${paymentLabel}` : '';
      const transferNotes = [];
      if (chequeAmount > 0) transferNotes.push(`Cheque ₹${chequeAmount.toFixed(2)}`);
      if (transferAmount > 0) transferNotes.push(`Transfer ₹${transferAmount.toFixed(2)}`);
      const autoDescription = [methodNote, transferNotes.join(', ')].filter(Boolean).join('. ');

      // Walk-in + fully paid → auto-deliver (no staff assignment needed)
      const isAutoDeliver = isWalkIn && advancePaid >= totals.gross * 0.99;

      const paymentRes = await api.post('/customer-payments', {
        customer_id: customer?.id || null,
        customer_name: customerName,
        customer_mobile: form.mobile || null,
        total_amount: totals.gross,
        net_amount: totals.net,
        sgst_amount: totals.sgst,
        cgst_amount: totals.cgst,
        discount_percent: totals.effectiveDiscount || null,
        discount_amount: totals.discountAmount || null,
        advance_paid: advancePaid,
        payment_method: paymentMethod,
        cash_amount: cashAmount,
        upi_amount: upiAmount,
        reference_number: payment.referenceNumber,
        description: payment.description || autoDescription,
        payment_date: payment.paymentDate,
        order_lines: orderLines,
        job_ids: createdJobs.map((job) => job.id),
        auto_deliver: isAutoDeliver
      });
      const jobsForAssign = createdJobs.map((job, index) => {
        const orderLine = orderLines[index] || {};
        return {
          id: job.id,  // Explicitly preserve job ID
          job_number: job.job_number,
          product_id: orderLine.product_id,
          product_name: orderLine.product_name || orderLine.job_name,
          quantity: orderLine.quantity,
          unit_price: orderLine.unit_price,
          total_amount: orderLine.total_amount,
          description: orderLine.description
        };
      });
      console.log('jobsForAssign created:', jobsForAssign);
      setAssignJobs(jobsForAssign);
      setAssignRoles({});
      setAssignSelections({});
      setRoleSuggestions({});
      // Use server-generated sequential invoice number (gap-free for tax compliance)
      const invoiceNumber = paymentRes.data?.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`;
      setLastBillData({
        invoiceNumber,
        invoiceDate: payment.paymentDate,
        customer: {
          name: customerName,
          mobile: form.mobile || null,
          type: form.type,
          email: form.email || null,
          address: form.address || null,
          gst: form.gst || null,
        },
        orderLines: orderLines.map((line) => ({ ...line })),
        totals: { ...totals },
        payment: {
          advancePaid,
          balance: Math.max((totals.gross || 0) - advancePaid, 0),
          methods: paymentLabel,
          cash: cashAmount,
          upi: upiAmount,
          cheque: chequeAmount,
          transfer: transferAmount,
          referenceNumber: payment.referenceNumber || null,
        },
        jobs: createdJobs,
        upiId: branchUpiId || undefined,
      });

      const currentCustomerType = form.type;
      resetBillingState();
      setLastOrderCustomerType(currentCustomerType);
      setLastOrderAutoDelivered(isAutoDeliver);
      setShowPostBillOptions(true);
    } catch (err) {
      // Detect network failure → queue bill offline
      const isNetworkError = !err.response && (err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !navigator.onLine);

      if (isNetworkError) {
        try {
          const customerName = form.name?.trim() || existingCustomer?.name || 'Walk-in';
          const cashAmount = Number(payment.methodAmounts.Cash) || 0;
          const upiAmount = Number(payment.methodAmounts.UPI) || 0;
          const selectedMethods = payment.selectedMethods.length > 0 ? payment.selectedMethods : ['Cash'];
          const isCashUpiCombo = selectedMethods.length === 2 && selectedMethods.includes('Cash') && selectedMethods.includes('UPI');
          const paymentMethod = isCashUpiCombo ? 'Both' : selectedMethods[0];

          await offlineDb.queueBill({
            customerId: existingCustomer?.id || null,
            customerName,
            customerMobile: form.mobile || null,
            customerType: form.type,
            totalAmount: totals.gross,
            netAmount: totals.net,
            sgstAmount: totals.sgst,
            cgstAmount: totals.cgst,
            discountPercent: totals.effectiveDiscount || null,
            discountAmount: totals.discountAmount || null,
            advancePaid,
            paymentMethod,
            cashAmount,
            upiAmount,
            referenceNumber: payment.referenceNumber || null,
            description: payment.description || '',
            paymentDate: payment.paymentDate,
            orderLines: orderLines.map(l => ({ ...l })),
          });

          toast.success(`Bill saved offline! It will sync when internet returns.`, { duration: 5000, icon: '📴' });
          resetBillingState();
          setShowPostBillOptions(false);
        } catch (offlineErr) {
          setError('Network unavailable and failed to save offline. Please try again.');
          console.error('Offline save failed:', offlineErr);
        }
      } else {
        const msg = err.response?.data?.error
          ? `${err.response.data.message}: ${err.response.data.error}`
          : (err.response?.data?.message || 'Failed to save customer');
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // Normalize code: remove BOM, trim, remove all whitespace, toUpperCase
  const normalizeCode = (value) => {
    let code = String(value || '');
    code = code.replace(/^\uFEFF/, ''); // Remove BOM if present
    code = code.trim();
    code = code.replace(/\s+/g, '');
    code = code.replace(/[\r\n]+/g, '');
    code = code.toUpperCase();
    return code;
  };

  // O(1) QR code lookup map built from hierarchy
  const qrLookupMap = useMemo(() => {
    const map = new Map();
    hierarchy.forEach((cat) => {
      (cat.subcategories || []).forEach((sub) => {
        (sub.products || []).forEach((prod) => {
          const code = String(prod.product_code || '').replace(/\s+/g, '').toUpperCase();
          if (code) map.set(code, { product: prod, catId: cat.id, subId: sub.id });
        });
      });
    });
    return map;
  }, [hierarchy]);

  const calculateDynamicPrice = (product, quantity, extras, paperRateOverride, isDoubleSideOverride) => {
    const effectiveDoubleSide = isDoubleSideOverride !== undefined
      ? isDoubleSideOverride
      : jobData.is_double_side;
    const result = calculateProductPrice({
      product,
      quantity,
      extras,
      paperRateOverride,
      currentPaperRate: jobData.customPaperRate,
      isOffset: form.type === 'Offset',
      isDoubleSide: effectiveDoubleSide
    });
    if (!result) return;
    setJobData((prev) => ({
      ...prev,
      ...result
    }));
  };

  const handleProductSelect = async (prod) => {
    if (!prod) return;
    setProductError('');
    try {
      const res = await api.get(`/products/${prod.id}`);
      const fullProd = res.data;
      setSelectedProduct(fullProd);
      setJobData((prev) => ({
        ...prev,
        job_name: fullProd.name,
        applied_extras: fullProd.extras || [],
        customPaperRate: fullProd.has_paper_rate ? Number(fullProd.paper_rate) || 0 : 0,
        is_double_side: false,
        machine_id: ''
      }));
      const extras = fullProd.extras || [];
      setExtraInputs(extras.map((e) => ({ purpose: e.purpose, amount: e.amount })));
      calculateDynamicPrice(fullProd, jobData.quantity, extras, fullProd.has_paper_rate ? fullProd.paper_rate : 0);
    } catch (err) {
      setProductError('Failed to fetch product details');
    }
  };

  const handleQrLookup = async (providedCode) => {
    const code = providedCode || qrInput;
    const normalized = normalizeCode(code);
    console.log('QR/Product code input:', { raw: code, normalized });
    if (!normalized) return;

    // 1. Try product hierarchy lookup first (O(1))
    const entry = qrLookupMap.get(normalized);
    if (entry) {
      setQrInput('');
      setSelectedCategoryId(entry.catId || selectedCategoryId);
      setSelectedSubcategoryId(entry.subId || selectedSubcategoryId);

      // If it's an inventory-only item, show preview popup
      if (entry.product.is_inventory_only) {
        setProductError('');
        try {
          const { data: invItem } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`);
          setScannedPreview({
            item: invItem,
            unitPrice: Number(invItem.sell_price) || 0,
            mrp: Number(invItem.mrp) || 0,
            category: entry.catId ? (hierarchy.find(c => c.id === entry.catId)?.name || 'Inventory') : 'Inventory',
            subcategory: entry.subId ? (hierarchy.find(c => c.id === entry.catId)?.subcategories?.find(s => s.id === entry.subId)?.name || '') : '',
          });
        } catch {
          // Fallback: add directly if preview fetch fails
          const unitPrice = Number(entry.product.sell_price) || 0;
          setScannedPreview({
            item: { id: entry.product.inventory_id, name: entry.product.name, sell_price: unitPrice, quantity: '?', image_url: null },
            unitPrice,
            mrp: unitPrice,
            category: 'Inventory',
            subcategory: '',
          });
        }
        return;
      }

      handleProductSelect(entry.product);
      return;
    }

    // 2. Fallback: look up inventory item by SKU — show preview
    try {
      const { data: invItem } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`);
      setQrInput('');
      setProductError('');
      setScannedPreview({
        item: invItem,
        unitPrice: Number(invItem.sell_price) || 0,
        mrp: Number(invItem.mrp) || 0,
        category: invItem.category || 'Inventory',
        subcategory: '',
      });
    } catch {
      setProductError('No product found for this code');
    }
  };

  const updateExtraInput = (idx, field, val) => {
    const next = [...extraInputs];
    next[idx][field] = val;
    setExtraInputs(next);
    calculateDynamicPrice(selectedProduct, jobData.quantity, next, jobData.customPaperRate);
  };

  const resetOrderForm = () => {
    setSelectedProduct(null);
    setExtraInputs([]);
    setQrInput('');
    setJobData({
      job_name: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      total_amount: 0,
      advance_paid: 0,
      delivery_date: '',
      applied_extras: [],
      customPaperRate: 0,
      is_double_side: false,
      machine_id: ''
    });
  };

  const addScannedItemToOrder = (preview) => {
    if (!preview) return;
    const item = preview.item;
    const unitPrice = preview.unitPrice;
    const line = {
      id: `inv-${item.id}-${Date.now()}`,
      product_id: null,
      inventory_item_id: item.id,
      product_name: item.name,
      calculation_type: 'flat',
      quantity: 1,
      unit_price: unitPrice,
      total_amount: unitPrice,
      applied_extras: [],
      customPaperRate: 0,
      is_double_side: false,
      description: `Inventory item${preview.category ? ` (${preview.category})` : ''}`,
      category: preview.category || 'Inventory',
      subcategory: preview.subcategory || '',
      machine_id: null,
      is_inventory_item: true
    };
    setOrderLines((prev) => [...prev, line]);
    toast.success(`Added: ${item.name} — ₹${unitPrice % 1 === 0 ? unitPrice : unitPrice.toFixed(2)}`);
    setScannedPreview(null);
    setQrInput('');
  };

  const handleAddLineItem = () => {
    if (!selectedProduct) {
      setProductError('Select a product before adding.');
      return;
    }
    const qty = Number(jobData.quantity);
    if (!qty || qty <= 0) {
      setProductError('Quantity must be at least 1.');
      return;
    }
    if (qty > 100000) {
      setProductError('Quantity seems too large. Please verify.');
      return;
    }
    const totalAmt = Number(jobData.total_amount);
    if (totalAmt < 0) {
      setProductError('Total amount cannot be negative.');
      return;
    }
    if (totalAmt > 10000000) {
      setProductError('Total amount seems too large (>₹1 crore). Please verify.');
      return;
    }
    if (isMachineRequired && !jobData.machine_id) {
      setProductError('Please select a machine for this category.');
      return;
    }
    setProductError('');
    const line = {
      id: `${selectedProduct.id}-${Date.now()}`,
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      calculation_type: selectedProduct.calculation_type,
      quantity: qty,
      unit_price: Number(jobData.unit_price) || 0,
      total_amount: totalAmt,
      applied_extras: extraInputs,
      customPaperRate: Number(jobData.customPaperRate) || 0,
      is_double_side: !!jobData.is_double_side,
      description: jobData.description?.trim() || '',
      category: selectedCategory?.name || '',
      subcategory: selectedSubcategory?.name || '',
      machine_id: jobData.machine_id || null
    };
    setOrderLines((prev) => [...prev, line]);
    resetOrderForm();
  };

  const removeOrderLine = (id) => {
    setOrderLines((prev) => prev.filter((line) => line.id !== id));
  };

  const totals = useMemo(() => {
    const round2 = (n) => Math.round(n * 100) / 100;
    const subtotal = round2(orderLines.reduce((sum, line) => sum + (Number(line.total_amount) || 0), 0));
    // Derive the active discount percent from whichever mode is active
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
  }, [orderLines, discountPercent, discountInputAmount, discountMode, discountRequest]);

  const paymentBalance = useMemo(() => {
    const total = Number(totals.gross) || 0;
    return Math.max(total - advancePaid, 0);
  }, [totals.gross, advancePaid]);

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
      toast.success('Please provide a reason for the discount.');
      return;
    }
    setDiscountRequestLoading(true);
    try {
      const res = await api.post('/requests/discount', {
        discount_percent: totals.activePct,
        total_amount: totals.subtotal,
        customer_name: form.name?.trim() || existingCustomer?.name || 'Walk-in',
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

  const handleChangeCustomer = () => {
    setExistingCustomer(null);
    setForm((prev) => ({
      ...prev,
      mobile: '',
      name: '',
      email: '',
      address: '',
      gst: ''
    }));
  };

  const handleSaveDraft = () => {
    const draft = {
      customer: form,
      orders: orderLines,
      totals
    };
    localStorage.setItem('billingDraft', JSON.stringify(draft));
  };

  const handleSaveAssignments = async () => {
    if (assignJobs.length === 0) {
      setShowAssignModal(false);
      return;
    }

    setAssignLoading(true);
    setAssignError('');
    try {
      const assignments = [];

      assignJobs.forEach((job) => {
        const jobId = Number(job.id);
        if (!Number.isFinite(jobId)) {
          console.warn(`Invalid job ID: ${job.id}`);
          return;
        }

        const roles = assignRoles[jobId] || [];
        console.log(`Job ${jobId}: roles=${JSON.stringify(roles)}, selections=${JSON.stringify(assignSelections[jobId])}`);

        roles.forEach((role) => {
          const staffIdValue = assignSelections?.[jobId]?.[role];
          console.log(`  Role ${role}: rawValue=${staffIdValue}, type=${typeof staffIdValue}`);

          // Handle role-based assignment (All [Role])
          if (staffIdValue === 'role') {
            assignments.push({
              job_id: jobId,
              staff_id: 'role',
              role
            });
            console.log(`✓ Added role-based assignment: job=${jobId}, role=${role} (all staff with this role)`);
            return;
          }

          const staffId = staffIdValue ? Number(staffIdValue) : null;
          console.log(`  Role ${role}: converted staffId=${staffId}, isFinite=${Number.isFinite(staffId)}`);

          if (!Number.isFinite(staffId) || staffId <= 0) {
            console.warn(`Skipping invalid staff: jobId=${jobId}, role=${role}, value=${staffIdValue}, converted=${staffId}`);
            return;
          }

          assignments.push({
            job_id: jobId,
            staff_id: staffId,
            role
          });
          console.log(`✓ Added assignment: job=${jobId}, staff=${staffId}, role=${role}`);
        });
      });

      console.log('Final assignments:', assignments);

      if (assignments.length === 0) {
        console.warn('No valid assignments found. Debug info:', {
          assignJobs: assignJobs.length,
          assignRoles,
          assignSelections,
          staffOptions: staffOptions.length
        });
        const skipConfirmed = await confirm({
          title: 'No Staff Assigned',
          message: 'You have not assigned any staff to this job. Are you sure you want to continue without assigning staff?',
          confirmText: 'Continue Without Staff',
          type: 'warning'
        });
        if (!skipConfirmed) {
          setAssignLoading(false);
          return;
        }
        setShowAssignModal(false);
        setAssignJobs([]);
        setAssignSelections({});
        setAssignLoading(false);
        return;
      }

      const isConfirmed = await confirm({
        title: 'Confirm Assignment',
        message: `Assign ${assignments.length} staff member(s) to ${assignJobs.length} job(s)?`,
        confirmText: 'Assign',
        type: 'primary'
      });
      if (!isConfirmed) {
        setAssignLoading(false);
        return;
      }

      await api.post('/jobs/assignments/bulk', { assignments });

      setShowAssignModal(false);
      setAssignJobs([]);
      setAssignSelections({});
    } catch (err) {
      setAssignError(err.response?.data?.message || 'Failed to save assignments');
    } finally {
      setAssignLoading(false);
    }
  };

  const selectedCategory = hierarchy.find((c) => String(c.id) === String(selectedCategoryId)) || hierarchy[0];

  const isMachineRequired = useMemo(() => {
    if (!selectedProduct) return false;

    // Find the category of the selected product by searching the hierarchy
    let prodCatName = '';
    hierarchy.forEach(cat => {
      (cat.subcategories || []).forEach(sub => {
        if ((sub.products || []).some(p => String(p.id) === String(selectedProduct.id))) {
          prodCatName = cat.name.toLowerCase();
        }
      });
    });

    if (!prodCatName) {
      // Fallback to currently selected category in UI if search fails (legacy)
      prodCatName = selectedCategory?.name?.toLowerCase() || '';
    }

    return prodCatName.includes('laser') || prodCatName.includes('photocopy') || prodCatName.includes('xerox');
  }, [selectedProduct, selectedCategory, hierarchy]);

  const subcategories = selectedCategory?.subcategories || [];
  const selectedSubcategory = subcategories.find((s) => String(s.id) === String(selectedSubcategoryId)) || subcategories[0];
  const products = selectedSubcategory?.products || [];

  return (
    <>
      {/* Branch selection for admin */}
      {isAdmin && branches.length > 0 && (
        <div className="mb-16">
          <label className="input-label">Select Branch</label>
          <select
            className="input-field"
            value={selectedBranchId || ''}
            onChange={e => setSelectedBranchId(Number(e.target.value))}
          >
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
      <section className="panel billing-panel">
        <div className="billing-header">
          <div>
            <h1 className="billing-title">
              Billing
              {!isOnline && (
                <span className="billing-offline-tag">
                  <WifiOff size={13} /> Offline
                </span>
              )}
            </h1>
            <p className="billing-subtitle">
              {isOnline
                ? 'Create bills in 3 simple steps — Customer → Products → Payment'
                : 'Offline — bills will sync when internet returns.'}
            </p>
          </div>
        </div>

        {loading && <div className="muted">Loading products...</div>}
        {customerSearching && <div className="muted" style={{ fontSize: '13px', padding: '4px 0' }}>Searching customer...</div>}
        {!loading && error && <div className="alert alert--error mb-16">{error}</div>}

        {/* Step Indicators */}
        <div className="billing-steps">
          <div className={`billing-step ${orderLines.length === 0 ? 'billing-step--active' : 'billing-step--done'}`}>
            <span className="billing-step__num">{orderLines.length > 0 ? '✓' : '1'}</span>
            <span className="billing-step__label">Customer</span>
          </div>
          <div className="billing-step__line" />
          <div className={`billing-step ${orderLines.length > 0 && !canProceed ? 'billing-step--active' : orderLines.length > 0 ? 'billing-step--done' : ''}`}>
            <span className="billing-step__num">{canProceed ? '✓' : '2'}</span>
            <span className="billing-step__label">Products</span>
          </div>
          <div className="billing-step__line" />
          <div className={`billing-step ${canProceed ? 'billing-step--active' : ''}`}>
            <span className="billing-step__num">3</span>
            <span className="billing-step__label">Payment</span>
          </div>
        </div>

        <div className="stack-md billing-stack">
          <div className="billing-card">
            <div className="billing-card__header">
              <h2 className="billing-card__title">Customer Details</h2>
              {existingCustomer && (
                <span className="billing-badge billing-badge--success">Returning Customer</span>
              )}
            </div>

            {existingCustomer ? (
              <div className="billing-customer-found">
                <div className="billing-customer-found__info">
                  <div className="billing-customer-found__name">{existingCustomer.name || 'Customer'}</div>
                  <div className="billing-customer-found__details">
                    {existingCustomer.mobile && <span>📱 {existingCustomer.mobile}</span>}
                    {existingCustomer.email && <span>✉ {existingCustomer.email}</span>}
                    {existingCustomer.address && <span>📍 {existingCustomer.address}</span>}
                  </div>
                  <div className="row gap-sm mt-8 wrap">
                    <div>
                      <label className="label">Customer Type</label>
                      <select
                        className="input-field"
                        value={form.type}
                        onChange={(e) => handleChange('type', e.target.value)}
                      >
                        {customerTypes.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    {form.type !== 'Walk-in' && (
                      <div>
                        <label className="label">GST Number (optional)</label>
                        <input
                          className={`input-field ${fieldErrors.gst ? 'input-field--error' : ''}`}
                          value={form.gst}
                          onChange={(e) => handleChange('gst', e.target.value.toUpperCase())}
                          placeholder="e.g. 29ABCDE1234F1Z5"
                          maxLength={15}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <button className="btn btn-ghost" type="button" onClick={handleChangeCustomer}>
                  Change
                </button>
              </div>
            ) : (
              <div className="stack-md">
                {/* Row 1: Type + Mobile */}
                <div className="billing-form-grid billing-form-grid--2">
                  <div>
                    <label className="label">Customer Type</label>
                    <select
                      className="input-field"
                      value={form.type}
                      onChange={(e) => handleChange('type', e.target.value)}
                    >
                      {customerTypes.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Mobile Number {isWalkIn ? '(optional)' : ''}</label>
                    <input
                      className={`input-field ${fieldErrors.mobile ? 'input-field--error' : ''}`}
                      value={form.mobile}
                      onChange={(e) => handleMobileChange(e.target.value)}
                      placeholder="10 digit mobile"
                      maxLength={10}
                      inputMode="numeric"
                    />
                    {fieldErrors.mobile && <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.mobile}</span>}
                  </div>
                </div>

                {/* Row 2: Name + Email */}
                <div className="billing-form-grid billing-form-grid--2">
                  <div>
                    <label className="label">Customer Name {isWalkIn ? '(optional)' : ''}</label>
                    <input
                      className={`input-field ${fieldErrors.name ? 'input-field--error' : ''}`}
                      value={form.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="Customer name"
                      maxLength={100}
                    />
                    {fieldErrors.name && <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.name}</span>}
                  </div>
                  <div>
                    <label className="label">Email Address (optional)</label>
                    <input
                      type="email"
                      className={`input-field ${fieldErrors.email ? 'input-field--error' : ''}`}
                      value={form.email}
                      onChange={(e) => {
                        handleChange('email', e.target.value);
                        if (e.target.value && !validateEmail(e.target.value)) {
                          setFieldErrors((prev) => ({ ...prev, email: 'Invalid email format' }));
                        } else {
                          setFieldErrors((prev) => { const { email, ...rest } = prev; return rest; });
                        }
                      }}
                      placeholder="Email"
                    />
                    {fieldErrors.email && <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.email}</span>}
                  </div>
                </div>

                {/* Row 3: Address + GST */}
                <div className={`billing-form-grid ${needsGst ? 'billing-form-grid--2' : 'billing-form-grid--1'}`}>
                  <div>
                    <label className="label">Address (optional)</label>
                    <textarea
                      className="input-field"
                      style={{ minHeight: '70px', resize: 'vertical' }}
                      value={form.address}
                      onChange={(e) => handleChange('address', e.target.value)}
                      placeholder="Address"
                      maxLength={500}
                    />
                    {fieldErrors.address && <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.address}</span>}
                  </div>
                  {needsGst && (
                    <div>
                      <label className="label">GST Number (optional)</label>
                      <input
                        className={`input-field ${fieldErrors.gst ? 'input-field--error' : ''}`}
                        value={form.gst}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          handleChange('gst', val);
                          if (val && !validateGST(val)) {
                            setFieldErrors((prev) => ({ ...prev, gst: 'Invalid GST format' }));
                          } else {
                            setFieldErrors((prev) => { const { gst, ...rest } = prev; return rest; });
                          }
                        }}
                        placeholder="e.g. 29ABCDE1234F1Z5"
                        maxLength={15}
                      />
                      {fieldErrors.gst && <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.gst}</span>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="billing-card">
            <div className="billing-card__header">
              <h2 className="billing-card__title">Add Product</h2>
              {orderLines.length > 0 && (
                <span className="billing-badge">{orderLines.length} item{orderLines.length > 1 ? 's' : ''} added</span>
              )}
            </div>
            <div className="stack-md">
              <div>
                <label className="label">Scan / Search Product</label>
                <div className="row gap-sm">
                  <input
                    className="input-field"
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQrLookup();
                      }
                    }}
                    placeholder="Scan QR or type product code"
                  />
                  <button className="btn btn-ghost" type="button" onClick={() => setShowScanner(true)}>
                    <Camera size={20} />
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={handleQrLookup}>Find</button>
                </div>
              </div>

              <ScannerModal
                isOpen={showScanner}
                onClose={() => setShowScanner(false)}
                onScan={(code) => {
                  handleQrLookup(code);
                }}
              />

              {/* Scanned Item Preview Popup */}
              {scannedPreview && (
                <div className="modal-overlay" onClick={() => setScannedPreview(null)}>
                  <div className="modal" style={{ maxWidth: 420, padding: 24 }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                      {scannedPreview.item.image_url ? (
                        <img src={scannedPreview.item.image_url} alt={scannedPreview.item.name}
                          style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                      ) : (
                        <div style={{ width: 100, height: 100, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>No Image</div>
                      )}
                      <div style={{ flex: 1 }}>
                        <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{scannedPreview.item.name}</h3>
                        {scannedPreview.item.sku && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>SKU: {scannedPreview.item.sku}</div>}
                        <div style={{ fontSize: 13, color: 'var(--muted)' }}>{scannedPreview.category}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, margin: '16px 0', textAlign: 'center' }}>
                      <div className="sev-success" style={{ borderRadius: 8, padding: '10px 8px' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>MRP</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>₹{scannedPreview.mrp % 1 === 0 ? scannedPreview.mrp : Number(scannedPreview.mrp).toFixed(2)}</div>
                      </div>
                      <div className="sev-info" style={{ borderRadius: 8, padding: '10px 8px' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Sell Price</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent-2)' }}>₹{scannedPreview.unitPrice % 1 === 0 ? scannedPreview.unitPrice : scannedPreview.unitPrice.toFixed(2)}</div>
                      </div>
                      <div className={Number(scannedPreview.item.quantity) > 0 ? 'sev-success' : 'sev-error'} style={{ borderRadius: 8, padding: '10px 8px' }}>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>In Stock</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{scannedPreview.item.quantity ?? '?'}</div>
                      </div>
                    </div>
                    {Number(scannedPreview.item.quantity) === 0 && (
                      <div className="sev-error" style={{ borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>Out of stock</div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => addScannedItemToOrder(scannedPreview)}>
                        <Plus size={16} /> Add to Bill
                      </button>
                      <button className="btn btn-ghost" onClick={() => setScannedPreview(null)}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <PaperOptimizer
                isOpen={showPaperOptimizer}
                onClose={() => setShowPaperOptimizer(false)}
                onApply={(data) => {
                  setJobData((prev) => ({ ...prev, quantity: data.sheetsNeeded }));
                  calculateDynamicPrice(selectedProduct, data.sheetsNeeded, extraInputs, jobData.customPaperRate);
                  toast.success(`${data.breakdown}`);
                }}
              />

              <div className="row gap-md billing-row">
                <div className="flex-1">
                  <label className="label">Category</label>
                  <select
                    className="input-field"
                    value={selectedCategory?.id || ''}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                  >
                    {hierarchy.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label">Sub-category</label>
                  <select
                    className="input-field"
                    value={selectedSubcategory?.id || ''}
                    onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                  >
                    {subcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="label">Product</label>
                  <select
                    className="input-field"
                    value={selectedProduct?.id || ''}
                    onChange={(e) => {
                      const prod = products.find((p) => String(p.id) === String(e.target.value));
                      setProductError('');
                      handleProductSelect(prod);
                    }}
                  >
                    <option value="" disabled>Select product</option>
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>{prod.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedProduct && (
                <>
                  <div className="billing-product-spotlight">
                    <div className="row items-center justify-between" style={{ marginBottom: 4 }}>
                      <span className="billing-product-name">{selectedProduct.name}</span>
                      <span className="billing-product-unit">₹{jobData.unit_price.toFixed(2)} <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>/ unit</span></span>
                    </div>
                    <div className="billing-product-type">{selectedProduct.calculation_type}</div>
                  </div>

                  {/* Quantity & Options Row */}
                  <div className="billing-qty-options">
                    <div className="billing-qty-group">
                      <label className="label">Quantity</label>
                      <div className="billing-qty-stepper">
                        <button
                          className="billing-qty-btn"
                          type="button"
                          onClick={() => calculateDynamicPrice(selectedProduct, Math.max(1, Number(jobData.quantity) - 1), extraInputs, jobData.customPaperRate)}
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          className="billing-qty-input"
                          value={jobData.quantity}
                          onChange={(e) => {
                            const value = e.target.value;
                            setJobData((prev) => ({ ...prev, quantity: value }));
                            calculateDynamicPrice(selectedProduct, value, extraInputs, jobData.customPaperRate);
                          }}
                          min="1"
                        />
                        <button
                          className="billing-qty-btn"
                          type="button"
                          onClick={() => calculateDynamicPrice(selectedProduct, Number(jobData.quantity) + 1, extraInputs, jobData.customPaperRate)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>

                    {selectedProduct.has_paper_rate && (
                      <div className="billing-option-field">
                        <label className="label">Paper Rate (Add-on)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-field"
                          value={jobData.customPaperRate}
                          onChange={(e) => {
                            const value = e.target.value;
                            setJobData((prev) => ({ ...prev, customPaperRate: value }));
                            calculateDynamicPrice(selectedProduct, jobData.quantity, extraInputs, value);
                          }}
                        />
                      </div>
                    )}
                    {selectedProduct.has_double_side_rate && (
                      <div className="billing-option-field">
                        <label className="label row items-center gap-xs">
                          <input
                            type="checkbox"
                            checked={jobData.is_double_side}
                            onChange={(e) => {
                              const nextValue = e.target.checked;
                              setJobData((prev) => ({ ...prev, is_double_side: nextValue }));
                              calculateDynamicPrice(selectedProduct, jobData.quantity, extraInputs, jobData.customPaperRate, nextValue);
                            }}
                          />
                          Double Side
                        </label>
                      </div>
                    )}
                    {isMachineRequired && (
                      <div className="billing-option-field">
                        <label className="label">Machine (Required)</label>
                        <select
                          className="input-field"
                          value={jobData.machine_id}
                          onChange={(e) => setJobData(prev => ({ ...prev, machine_id: e.target.value }))}
                        >
                          <option value="">Select Machine</option>
                          {machines.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.machine_name} {m.location ? `(${m.location})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Total & Actions Row */}
                  <div className="billing-total-bar">
                    <div className="billing-total-amount">
                      Total <span>₹{jobData.total_amount.toFixed(2)}</span>
                    </div>
                    <div className="row gap-sm">
                      <button
                        className="btn btn-ghost billing-paper-calc-btn"
                        type="button"
                        title="Paper Size Optimizer"
                        onClick={() => setShowPaperOptimizer(true)}
                      >
                        <Scissors size={14} /> Paper Calc
                      </button>
                      <button className="btn btn-primary billing-add-btn" type="button" onClick={handleAddLineItem}>
                        <Plus size={16} /> Add to Bill
                      </button>
                    </div>
                  </div>

                  {extraInputs.length > 0 && (
                    <div className="stack-sm">
                      <label className="label">Extras</label>
                      {extraInputs.map((ex, idx) => (
                        <div key={`${ex.purpose}-${idx}`} className="row gap-md">
                          <input className="input-field" value={ex.purpose} readOnly />
                          <input
                            type="number"
                            className="input-field"
                            value={ex.amount}
                            onChange={(e) => updateExtraInput(idx, 'amount', e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {productError && <div className="alert alert--error">{productError}</div>}
            </div>
          </div>

          {orderLines.length > 0 && (
            <div className="billing-card">
              <div className="billing-card__header">
                <h2 className="billing-card__title">Order Summary</h2>
                <span className="billing-badge">{orderLines.length} item{orderLines.length > 1 ? 's' : ''}</span>
              </div>

              <div className="billing-items-list">
                {orderLines.map((line, index) => (
                  <div key={line.id} className="billing-item-row">
                    <div className="billing-item-row__num">{index + 1}</div>
                    <div className="billing-item-row__info">
                      <div className="billing-item-row__name">{line.product_name}</div>
                      <div className="billing-item-row__meta">
                        Qty {line.quantity} × ₹{Number(line.unit_price).toFixed(2)}
                        {line.category && <span> · {line.category}</span>}
                      </div>
                    </div>
                    <div className="billing-item-row__amount">₹{Number(line.total_amount).toFixed(2)}</div>
                    <button className="billing-item-row__remove" type="button" onClick={() => removeOrderLine(line.id)} title="Remove">
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="billing-totals">
                <div className="billing-totals__row">
                  <div className="muted">Subtotal (excl. GST)</div>
                  <div>₹{totals.net.toFixed(2)}</div>
                </div>
                <div className="billing-totals__row">
                  <div className="muted">SGST (9%)</div>
                  <div>₹{totals.sgst.toFixed(2)}</div>
                </div>
                <div className="billing-totals__row">
                  <div className="muted">CGST (9%)</div>
                  <div>₹{totals.cgst.toFixed(2)}</div>
                </div>
                {totals.effectiveDiscount > 0 && (
                  <div className="billing-totals__row" style={{ color: 'var(--clr-success, #22c55e)' }}>
                    <div>Discount ({totals.effectiveDiscount}%)</div>
                    <div>-₹{totals.discountAmount.toFixed(2)}</div>
                  </div>
                )}
                <div className="billing-totals__row billing-totals__grand">
                  <div className="font-bold">Grand Total</div>
                  <div className="font-bold" style={{ fontSize: '18px' }}>₹{totals.gross.toFixed(2)}</div>
                </div>
              </div>
            </div>
          )}

          {orderLines.length > 0 && (
            <div className="billing-card">
              <div className="billing-card__header">
                <h2 className="billing-card__title">Payment</h2>
              </div>
              <div className="stack-md">
                {/* Amount Summary Cards */}
                <div className="billing-amount-cards">
                  <div className="billing-amount-card billing-amount-card--total">
                    <div className="billing-amount-card__label">To Collect</div>
                    <div className="billing-amount-card__value">₹{totals.gross.toFixed(2)}</div>
                  </div>
                  <div className="billing-amount-card billing-amount-card--paid">
                    <div className="billing-amount-card__label">Paid</div>
                    <div className="billing-amount-card__value">₹{Number(advancePaid).toFixed(2)}</div>
                  </div>
                  <div className={`billing-amount-card ${paymentBalance > 0 ? 'billing-amount-card--due' : 'billing-amount-card--clear'}`}>
                    <div className="billing-amount-card__label">Balance</div>
                    <div className="billing-amount-card__value">₹{Number(paymentBalance).toFixed(2)}</div>
                  </div>
                </div>

                {/* Discount */}
                <div className="billing-discount-section">
                  <div className="row gap-sm items-center mb-8">
                    <label className="label" style={{ margin: 0 }}>Discount</label>
                    <div className="billing-discount-toggle">
                      <button
                        type="button"
                        className={`billing-discount-btn ${discountMode === 'percent' ? 'billing-discount-btn--active' : ''}`}
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
                        className={`billing-discount-btn ${discountMode === 'amount' ? 'billing-discount-btn--active' : ''}`}
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
                        style={{ maxWidth: '140px' }}
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
                        style={{ maxWidth: '140px' }}
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
                          : `= ${totals.activePct.toFixed(1)}% off`
                        }
                      </span>
                    )}
                    {totals.activePct > 0 && totals.activePct <= 5 && (
                      <span className="billing-discount-status billing-discount-status--ok">✓ Applied</span>
                    )}
                    {totals.activePct > 5 && discountRequest?.status === 'APPROVED' && (
                      <span className="billing-discount-status billing-discount-status--ok">✓ Admin approved</span>
                    )}
                    {totals.activePct > 5 && discountRequest?.status === 'PENDING' && (
                      <div className="row gap-sm items-center">
                        <span className="billing-discount-status billing-discount-status--warn">⏳ Pending approval</span>
                        <button type="button" className="btn btn-ghost" style={{ padding: '2px 10px', fontSize: '12px' }} onClick={checkDiscountApproval}>
                          Check
                        </button>
                      </div>
                    )}
                    {totals.activePct > 5 && discountRequest?.status === 'REJECTED' && (
                      <span className="billing-discount-status billing-discount-status--err">✗ Rejected</span>
                    )}
                    {totals.activePct > 5 && totals.activePct <= 10 && !discountRequest && (
                      <span className="billing-discount-status billing-discount-status--warn">⚠ &gt;5% needs approval</span>
                    )}
                    {totals.activePct > 10 && !discountRequest && (
                      <span className="billing-discount-status billing-discount-status--err">⚠ &gt;10% Admin only</span>
                    )}
                  </div>
                </div>

                {/* Payment Methods */}
                <div>
                  <label className="label">Payment Method</label>
                  <div className="billing-method-pills">
                    {paymentMethods.map((method) => {
                      const active = payment.selectedMethods.includes(method);
                      return (
                        <button
                          key={method}
                          type="button"
                          className={`billing-method-pill ${active ? 'billing-method-pill--active' : ''}`}
                          onClick={() => {
                            setPayment((prev) => {
                              const exists = prev.selectedMethods.includes(method);
                              const selectedMethods = exists
                                ? prev.selectedMethods.filter((m) => m !== method)
                                : [...prev.selectedMethods, method];
                              return { ...prev, selectedMethods };
                            });
                            setFieldErrors((prev) => { const { paymentMethod, ...rest } = prev; return rest; });
                          }}
                        >
                          {method}
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.paymentMethod && <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.paymentMethod}</span>}
                </div>

                {/* Amount inputs for selected methods */}
                <div className="billing-form-grid billing-form-grid--2">
                  {payment.selectedMethods.includes('Cash') && (
                    <div>
                      <label className="label">Cash Amount</label>
                      <input
                        type="number"
                        className="input-field"
                        min="0"
                        value={payment.methodAmounts.Cash}
                        onChange={(e) => setPayment((prev) => ({
                          ...prev,
                          methodAmounts: { ...prev.methodAmounts, Cash: e.target.value }
                        }))}
                      />
                    </div>
                  )}
                  {payment.selectedMethods.includes('UPI') && (
                    <div>
                      <label className="label">UPI Amount</label>
                      <input
                        type="number"
                        className="input-field"
                        min="0"
                        value={payment.methodAmounts.UPI}
                        onChange={(e) => setPayment((prev) => ({
                          ...prev,
                          methodAmounts: { ...prev.methodAmounts, UPI: e.target.value }
                        }))}
                      />
                    </div>
                  )}
                  {payment.selectedMethods.includes('Cheque') && (
                    <div>
                      <label className="label">Cheque Amount</label>
                      <input
                        type="number"
                        className="input-field"
                        min="0"
                        value={payment.methodAmounts.Cheque}
                        onChange={(e) => setPayment((prev) => ({
                          ...prev,
                          methodAmounts: { ...prev.methodAmounts, Cheque: e.target.value }
                        }))}
                      />
                    </div>
                  )}
                  {payment.selectedMethods.includes('Account Transfer') && (
                    <div>
                      <label className="label">Transfer Amount</label>
                      <input
                        type="number"
                        className="input-field"
                        min="0"
                        value={payment.methodAmounts['Account Transfer']}
                        onChange={(e) => setPayment((prev) => ({
                          ...prev,
                          methodAmounts: { ...prev.methodAmounts, 'Account Transfer': e.target.value }
                        }))}
                      />
                    </div>
                  )}
                </div>

                {/* Ref & Notes for non-cash */}
                {(payment.selectedMethods.some((m) => m !== 'Cash')) && (
                  <div className="billing-form-grid billing-form-grid--2">
                    <div>
                      <label className="label">UTR / Ref No</label>
                      <input
                        className="input-field"
                        value={payment.referenceNumber}
                        onChange={(e) => setPayment((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                      />
                      {fieldErrors.referenceNumber && (
                        <span className="text-xs" style={{ color: 'var(--clr-error, var(--error))' }}>{fieldErrors.referenceNumber}</span>
                      )}
                    </div>
                    <div>
                      <label className="label">Purpose / Notes (optional)</label>
                      <input
                        className="input-field"
                        value={payment.description}
                        onChange={(e) => setPayment((prev) => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                  </div>
                )}

                {/* Notes for cash only */}
                {payment.selectedMethods.length === 1 && payment.selectedMethods[0] === 'Cash' && (
                  <div>
                    <label className="label">Purpose / Notes (optional)</label>
                    <input
                      className="input-field"
                      value={payment.description}
                      onChange={(e) => setPayment((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                )}

                {/* Create Bill Button */}
                <div className="billing-create-bar">
                  <button className="btn btn-primary billing-create-btn" type="button" onClick={handleAddOrder} disabled={!canProceed || saving}>
                    {saving ? 'Creating Bill...' : totals.activePct > 5 && !discountRequest ? `Request Discount & Create Bill` : `Create Bill — ₹${totals.gross.toFixed(2)}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Discount Approval Request Modal */}
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
                } You can create the bill once approved.
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

      {showPostBillOptions && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div className="billing-success-icon">✓</div>
            <h2 className="section-title" style={{ marginBottom: '6px' }}>
              {lastOrderAutoDelivered ? 'Bill Created & Delivered!' : 'Bill Created!'}
            </h2>
            <p className="muted" style={{ fontSize: '14px', marginBottom: '20px' }}>
              {lastOrderAutoDelivered
                ? 'Fully paid walk-in order — automatically marked as Delivered.'
                : 'Invoice has been recorded successfully.'}
            </p>
            {!lastOrderAutoDelivered && lastOrderCustomerType !== 'Walk-in' && (
              <div className="alert alert--warning" style={{ fontSize: '13px', textAlign: 'left', marginBottom: '16px' }}>
                <strong>Tip:</strong> Assign staff to track production for this {lastOrderCustomerType} order.
              </div>
            )}

            <div className="row" style={{ gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => lastBillData && downloadInvoicePDF(lastBillData)}
              >
                <Download size={16} /> PDF
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => lastBillData && printInvoicePDF(lastBillData)}
              >
                <Printer size={16} /> Print
              </button>
            </div>

            <div className="stack-sm">
              {!lastOrderAutoDelivered && (
                <button
                  className="btn btn-primary btn--full"
                  type="button"
                  onClick={() => {
                    setShowPostBillOptions(false);
                    setShowAssignModal(true);
                  }}
                >
                  Assign Staff
                </button>
              )}
              <button
                className={lastOrderAutoDelivered ? "btn btn-primary btn--full" : "btn btn-ghost btn--full"}
                type="button"
                onClick={async () => {
                  if (!lastOrderAutoDelivered) {
                    const isConfirmed = await confirm({
                      title: 'No Staff Assigned',
                      message: 'Continue without assigning staff to this job?',
                      confirmText: 'Continue',
                      type: 'warning'
                    });
                    if (!isConfirmed) return;
                  }
                  setShowPostBillOptions(false);
                }}
              >
                New Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '700px' }}>
            <div className="row items-center justify-between mb-16">
              <div>
                <h2 className="section-title">Assign Staff</h2>
                <p className="section-subtitle">Choose a staff member for each job.</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowAssignModal(false)}
              >
                Close
              </button>
            </div>

            {assignError && <div className="alert alert--error mb-12">{assignError}</div>}

            {assignJobs.length === 0 && (
              <div className="muted">No jobs available for assignment.</div>
            )}

            {assignJobs.length > 0 && (
              <div className="stack-md">
                {assignJobs.map((job, idx) => {
                  const jobId = Number(job.id);
                  const roleOptions = ['Designer', 'Printer', 'Other Staff'];
                  const jobRoles = assignRoles[jobId] || [];
                  const jobSelections = assignSelections[jobId] || {};
                  return (
                    <div key={jobId} className="row gap-md items-center" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 2 }}>
                        <div className="font-bold">{idx + 1}. {job.product_name || job.job_name || 'Job'}</div>
                        <div className="text-xs muted">Qty {job.quantity || 1} - Job #{job.job_number || job.id}</div>
                      </div>
                      <div style={{ flex: 3 }}>
                        <div className="row gap-sm wrap">
                          {roleOptions.map((role) => {
                            const active = jobRoles.includes(role);
                            return (
                              <button
                                key={role}
                                type="button"
                                className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
                                disabled={assignLoading}
                                onClick={async () => {
                                  const nextRoles = active
                                    ? jobRoles.filter((r) => r !== role)
                                    : [...jobRoles, role];
                                  setAssignRoles((prev) => ({
                                    ...prev,
                                    [jobId]: nextRoles
                                  }));

                                  if (active) {
                                    setAssignSelections((prev) => {
                                      const next = { ...prev };
                                      const jobSel = { ...(next[jobId] || {}) };
                                      delete jobSel[role];
                                      next[jobId] = jobSel;
                                      return next;
                                    });
                                    return;
                                  }

                                  // Try to load suggestions, but don't fail if it errors
                                  let suggestions = {};
                                  try {
                                    suggestions = await loadRoleSuggestions(assignJobs, role) || {};
                                  } catch (err) {
                                    console.warn('Failed to load suggestions, will show manual selection', err);
                                  }

                                  const suggested = suggestions?.[job.product_id]?.staff_id
                                    || roleSuggestions?.[role]?.[job.product_id]?.staff_id;
                                  const roleStaff = staffOptions.filter((staff) => staff.role === role);
                                  const fallbackStaffId = roleStaff.length > 0 ? roleStaff[0].id : null;
                                  const staffId = suggested || fallbackStaffId;
                                  if (staffId && Number.isFinite(Number(staffId))) {
                                    setAssignSelections((prev) => ({
                                      ...prev,
                                      [jobId]: { ...(prev[jobId] || {}), [role]: Number(staffId) }
                                    }));
                                  }
                                }}
                              >
                                {role}
                              </button>
                            );
                          })}
                        </div>

                        {jobRoles.length > 0 && (
                          <div className="stack-sm" style={{ marginTop: '12px' }}>
                            {jobRoles.map((role) => {
                              const roleStaff = staffOptions.filter((staff) => staff.role === role);
                              if (roleStaff.length === 0) {
                                return (
                                  <div key={`${jobId}-${role}`} className="row gap-md items-center">
                                    <div style={{ minWidth: '120px' }} className="text-sm">{role}</div>
                                    <div className="text-xs muted">No staff available for this role</div>
                                  </div>
                                );
                              }
                              return (
                                <div key={`${jobId}-${role}`} className="row gap-md items-center">
                                  <div style={{ minWidth: '120px' }} className="text-sm">{role}</div>
                                  <select
                                    className="input-field"
                                    value={jobSelections[role] ? String(jobSelections[role]) : ''}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setAssignSelections((prev) => ({
                                        ...prev,
                                        [jobId]: { ...(prev[jobId] || {}), [role]: value === 'role' ? 'role' : (value ? Number(value) : null) }
                                      }));
                                    }}
                                    disabled={assignLoading}
                                  >
                                    <option value="">Select staff</option>
                                    <option value="role" style={{ fontWeight: 600 }}>👥 All {role}s</option>
                                    {roleStaff.map((staff) => (
                                      <option key={staff.id} value={staff.id}>
                                        {staff.name}{staff.branch_name ? ` (${staff.branch_name})` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="row justify-end mt-16 gap-sm">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={async () => {
                  if (lastOrderCustomerType !== 'Walk-in') {
                    const isConfirmed = await confirm({
                      title: 'Skip Assignment',
                      message: 'Skip staff assignment? This is recommended for non-walk-in orders.',
                      confirmText: 'Skip',
                      type: 'warning'
                    });
                    if (!isConfirmed) {
                      return;
                    }
                  }
                  setShowAssignModal(false);
                  setAssignJobs([]);
                }}
                disabled={assignLoading}
              >
                Skip
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleSaveAssignments}
                disabled={assignLoading}
              >
                {assignLoading ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )
      }
    </>
  );
};

export default Billing;

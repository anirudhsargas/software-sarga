import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api';
import auth from '../services/auth';
import { serverToday } from '../services/serverTime';
import { Camera } from 'lucide-react';
import ScannerModal from '../components/ScannerModal';
import { calculateProductPrice } from '../utils/pricing';

const customerTypes = ['Walk-in', 'Retail', 'Association', 'Offset'];
const paymentMethods = ['Cash', 'UPI', 'Cheque', 'Account Transfer'];
const GST_RATE = 0.18;

const Billing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hierarchy, setHierarchy] = useState([]);
  const [productError, setProductError] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [extraInputs, setExtraInputs] = useState([]);
  const [qrInput, setQrInput] = useState('');
  const [orderLines, setOrderLines] = useState([]);
  const [showAddedItems, setShowAddedItems] = useState(false);
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
  const [fieldErrors, setFieldErrors] = useState({});

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
    is_double_side: false
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
    setShowAddedItems(false);
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
      is_double_side: false
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
  };

  const loadStaffOptions = async () => {
    if (staffOptions.length > 0) return;
    const response = await api.get('/staff', { headers: auth.getAuthHeader() });
    setStaffOptions(response.data || []);
  };

  const loadRoleSuggestions = async (jobsToAssign, role) => {
    if (!role || roleSuggestions[role]) return roleSuggestions[role];
    const productIds = jobsToAssign
      .map((job) => Number(job.product_id))
      .filter((id) => Number.isFinite(id));
    const uniqueIds = Array.from(new Set(productIds));
    if (uniqueIds.length === 0) return {};

    const response = await api.get(
      `/jobs/assignments/suggestions?product_ids=${uniqueIds.join(',')}&role=${encodeURIComponent(role)}`,
      { headers: auth.getAuthHeader() }
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
    const fetchCustomers = async () => {
      try {
        const response = await api.get('/customers', { headers: auth.getAuthHeader() });
        setCustomers(response.data || []);
      } catch (err) {
        setError('Failed to load customers');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomers();
  }, []);

  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        const response = await api.get('/product-hierarchy', { headers: auth.getAuthHeader() });
        setHierarchy(response.data || []);
      } catch (err) {
        setProductError('Failed to load products');
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
    const match = customers.find((c) => String(c.mobile) === form.mobile);
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
  }, [form.mobile, customers]);

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
    if (!payment.paymentDate) errors.paymentDate = 'Payment date is required';
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
    if (existingCustomer) return existingCustomer;

    const trimmedName = form.name?.trim() || (isWalkIn ? 'Walk-in Customer' : '');
    const trimmedMobile = form.mobile?.replace(/\D/g, '').slice(0, 10) || '';
    const trimmedEmail = form.email?.trim() || '';
    const trimmedGst = form.gst?.trim().toUpperCase() || '';
    const trimmedAddress = form.address?.trim() || '';

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

    const response = await api.post('/customers', payload, { headers: auth.getAuthHeader() });
    const newCustomer = { id: response.data?.id, ...payload };
    setCustomers((prev) => [...prev, newCustomer]);
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

    // Validate payment
    const payErrors = validatePayment();
    if (Object.keys(payErrors).length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...payErrors }));
      setError(Object.values(payErrors)[0]);
      return;
    }

    setError('');
    setFieldErrors({});
    setSaving(true);
    try {
      const customer = await ensureCustomer();
      let createdJobs = [];

      if (orderLines.length > 0) {
        const jobRes = await api.post('/jobs/bulk', {
          customer_id: customer?.id || null,
          order_lines: orderLines
        }, {
          headers: auth.getAuthHeader()
        });
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

      await api.post('/customer-payments', {
        customer_id: customer?.id || null,
        customer_name: customerName,
        customer_mobile: form.mobile || null,
        total_amount: totals.gross,
        net_amount: totals.net,
        sgst_amount: totals.sgst,
        cgst_amount: totals.cgst,
        advance_paid: advancePaid,
        payment_method: paymentMethod,
        cash_amount: cashAmount,
        upi_amount: upiAmount,
        reference_number: payment.referenceNumber,
        description: payment.description || autoDescription,
        payment_date: payment.paymentDate,
        order_lines: orderLines,
        job_ids: createdJobs.map((job) => job.id)
      }, {
        headers: auth.getAuthHeader()
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
      resetBillingState();
      setShowPostBillOptions(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const normalizeCode = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();

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
      const res = await api.get(`/products/${prod.id}`, { headers: auth.getAuthHeader() });
      const fullProd = res.data;
      setSelectedProduct(fullProd);
      setJobData((prev) => ({
        ...prev,
        job_name: fullProd.name,
        applied_extras: fullProd.extras || [],
        customPaperRate: fullProd.has_paper_rate ? Number(fullProd.paper_rate) || 0 : 0,
        is_double_side: false
      }));
      const extras = fullProd.extras || [];
      setExtraInputs(extras.map((e) => ({ purpose: e.purpose, amount: e.amount })));
      calculateDynamicPrice(fullProd, jobData.quantity, extras, fullProd.has_paper_rate ? fullProd.paper_rate : 0);
    } catch (err) {
      setProductError('Failed to fetch product details');
    }
  };

  const handleQrLookup = (providedCode) => {
    const code = providedCode || qrInput;
    const normalized = normalizeCode(code);
    if (!normalized) return;
    let found = null;
    let foundCatId = '';
    let foundSubId = '';
    hierarchy.forEach((cat) => {
      (cat.subcategories || []).forEach((sub) => {
        (sub.products || []).forEach((prod) => {
          if (!found && normalizeCode(prod.product_code) === normalized) {
            found = prod;
            foundCatId = cat.id;
            foundSubId = sub.id;
          }
        });
      });
    });
    if (!found) {
      setProductError('No product found for this code');
      return;
    }
    setQrInput(''); // Clear input after successful lookup
    setSelectedCategoryId(foundCatId || selectedCategoryId);
    setSelectedSubcategoryId(foundSubId || selectedSubcategoryId);
    handleProductSelect(found);
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
      is_double_side: false
    });
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
      description: jobData.description?.trim() || ''
    };
    setOrderLines((prev) => [...prev, line]);
    resetOrderForm();
  };

  const removeOrderLine = (id) => {
    setOrderLines((prev) => prev.filter((line) => line.id !== id));
  };

  const totals = useMemo(() => {
    const gross = orderLines.reduce((sum, line) => sum + (Number(line.total_amount) || 0), 0);
    const net = gross / (1 + GST_RATE);
    const sgst = net * (GST_RATE / 2);
    const cgst = net * (GST_RATE / 2);
    return {
      gross,
      net,
      sgst,
      cgst
    };
  }, [orderLines]);

  const paymentBalance = useMemo(() => {
    const total = Number(totals.gross) || 0;
    return Math.max(total - advancePaid, 0);
  }, [totals.gross, advancePaid]);

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
        setAssignError('Please select valid staff for at least one role before saving.');
        setAssignLoading(false);
        return;
      }

      if (!window.confirm(`Assign ${assignments.length} staff member(s) to ${assignJobs.length} job(s)?`)) {
        setAssignLoading(false);
        return;
      }

      await api.post('/jobs/assignments/bulk', { assignments }, {
        headers: auth.getAuthHeader()
      });

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
  const subcategories = selectedCategory?.subcategories || [];
  const selectedSubcategory = subcategories.find((s) => String(s.id) === String(selectedSubcategoryId)) || subcategories[0];
  const products = selectedSubcategory?.products || [];

  return (
    <>
    <section className="panel billing-panel">
      <div className="row items-center justify-between billing-header">
        <div>
          <h1 className="section-title">Billing</h1>
          <p className="section-subtitle">Add customer details, choose products, and build the bill.</p>
        </div>
      </div>

      {loading && <div className="muted">Loading customers...</div>}
      {!loading && error && <div className="alert alert--error mb-16">{error}</div>}

      <div className="stack-md billing-stack">
        <div className="billing-card">
          <h2 className="section-title mb-12">Customer Details</h2>
          <div className="stack-md">
            <div className="row gap-md billing-row">
              <div className="flex-1">
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
              <div className="flex-1">
                <label className="label">Mobile Number {isWalkIn ? '(optional)' : ''}</label>
                <input
                  className={`input-field ${fieldErrors.mobile ? 'input-field--error' : ''}`}
                  value={form.mobile}
                  onChange={(e) => handleMobileChange(e.target.value)}
                  placeholder="10 digit mobile"
                  maxLength={10}
                  inputMode="numeric"
                />
                {fieldErrors.mobile && <span className="text-xs" style={{ color: 'var(--clr-error, #ef4444)' }}>{fieldErrors.mobile}</span>}
              </div>
            </div>

            <div className="row gap-md billing-row">
              <div className="flex-1">
                <label className="label">Customer Name {isWalkIn ? '(optional)' : ''}</label>
                <input
                  className={`input-field ${fieldErrors.name ? 'input-field--error' : ''}`}
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Customer name"
                  maxLength={100}
                />
                {fieldErrors.name && <span className="text-xs" style={{ color: 'var(--clr-error, #ef4444)' }}>{fieldErrors.name}</span>}
              </div>
              <div className="flex-1">
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
                {fieldErrors.email && <span className="text-xs" style={{ color: 'var(--clr-error, #ef4444)' }}>{fieldErrors.email}</span>}
              </div>
            </div>

            <div className="row gap-md billing-row">
              <div className="flex-1">
                <label className="label">Address (optional)</label>
                <textarea
                  className="input-field"
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  value={form.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Address"
                  maxLength={500}
                />
                {fieldErrors.address && <span className="text-xs" style={{ color: 'var(--clr-error, #ef4444)' }}>{fieldErrors.address}</span>}
              </div>
              {needsGst && (
                <div className="flex-1">
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
                  {fieldErrors.gst && <span className="text-xs" style={{ color: 'var(--clr-error, #ef4444)' }}>{fieldErrors.gst}</span>}
                </div>
              )}
            </div>
          </div>

          {existingCustomer && (
            <div className="row items-center justify-between alert alert--info mt-16">
              <div>
                <div className="font-bold">{existingCustomer.name || 'Customer'}</div>
                <div className="text-xs">{existingCustomer.mobile || ''}</div>
                <div className="text-xs">{existingCustomer.address || ''}</div>
                <div className="text-xs">{existingCustomer.email || ''}</div>
              </div>
              <button className="btn btn-ghost" type="button" onClick={handleChangeCustomer}>
                Change
              </button>
            </div>
          )}
        </div>

        <div className="billing-card">
          <h2 className="section-title mb-12">Add Product</h2>
          <div className="stack-md">
            <div>
              <label className="label">Scan / Search Product</label>
              <div className="row gap-sm">
                <input
                  className="input-field"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
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
                <div className="row items-center justify-between billing-product-spotlight">
                  <div>
                    <div className="font-bold">{selectedProduct.name}</div>
                    <div className="text-xs muted">{selectedProduct.calculation_type}</div>
                  </div>
                  <div className="text-sm">Unit ₹{jobData.unit_price.toFixed(2)}</div>
                </div>

                <div className="row gap-md items-center billing-row">
                  <div className="row gap-sm items-center" style={{ minWidth: '180px', width: '100%' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                      type="button"
                      onClick={() => calculateDynamicPrice(selectedProduct, Math.max(1, Number(jobData.quantity) - 1), extraInputs, jobData.customPaperRate)}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      className="input-field"
                      value={jobData.quantity}
                      onChange={(e) => {
                        const value = e.target.value;
                        setJobData((prev) => ({ ...prev, quantity: value }));
                        calculateDynamicPrice(selectedProduct, value, extraInputs, jobData.customPaperRate);
                      }}
                      min="1"
                      style={{ maxWidth: '80px', textAlign: 'center' }}
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ flex: 1 }}
                      type="button"
                      onClick={() => calculateDynamicPrice(selectedProduct, Number(jobData.quantity) + 1, extraInputs, jobData.customPaperRate)}
                    >
                      +
                    </button>
                  </div>
                  {selectedProduct.has_paper_rate && (
                    <div className="flex-1" style={{ width: '100%' }}>
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
                    <div className="flex-1" style={{ width: '100%' }}>
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
                  <div className="text-sm font-bold">Total ₹{jobData.total_amount.toFixed(2)}</div>
                  <button className="btn btn-primary btn--full" type="button" onClick={handleAddLineItem}>
                    Add to Bill
                  </button>
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
            <div className="row items-center mb-12">
              <h2 className="section-title">Added Items</h2>
              <button
                className="btn btn-ghost billing-toggle"
                type="button"
                onClick={() => setShowAddedItems((prev) => !prev)}
              >
                {showAddedItems ? 'Hide details' : 'Show full details'}
              </button>
            </div>

            {!showAddedItems && (
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderLines.map((line, index) => (
                      <tr key={line.id}>
                        <td>{index + 1}. {line.product_name}</td>
                        <td>{line.quantity}</td>
                        <td>₹{Number(line.unit_price).toFixed(2)}</td>
                        <td>₹{Number(line.total_amount).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {showAddedItems && (
              <>
                <div className="table-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderLines.map((line, index) => (
                        <React.Fragment key={line.id}>
                          <tr>
                            <td>{index + 1}. {line.product_name}</td>
                            <td>{line.quantity}</td>
                            <td>₹{Number(line.unit_price).toFixed(2)}</td>
                            <td>₹{Number(line.total_amount).toFixed(2)}</td>
                            <td className="text-right">
                              <button className="btn btn-ghost" type="button" onClick={() => removeOrderLine(line.id)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                          <tr>
                            <td colSpan="5" className="text-xs muted">
                              Qty {line.quantity} x ₹{Number(line.unit_price).toFixed(2)}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
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
                  <div className="billing-totals__row billing-totals__grand">
                    <div className="font-bold">Grand Total</div>
                    <div className="font-bold">₹{totals.gross.toFixed(2)}</div>
                  </div>
                </div>

                <div className="row justify-end mt-16 gap-sm billing-actions">
                  <button className="btn btn-ghost" type="button" onClick={handleSaveDraft}>
                    Save Draft
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {orderLines.length > 0 && (
          <div className="billing-card">
            <h2 className="section-title mb-12">Customer Payment</h2>
            <div className="stack-md">
              <div className="row gap-md billing-row">
                <div className="flex-1">
                  <label className="label">Amount to Collect</label>
                  <div className="input-field" style={{ fontSize: '20px', textAlign: 'center', fontWeight: 600 }}>
                    ₹{totals.gross.toFixed(2)}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="label">Amount Paid</label>
                  <div className="input-field" style={{ fontWeight: 600 }}>
                    ₹{Number(advancePaid).toFixed(2)}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="label">Balance Due</label>
                  <div className="input-field" style={{ fontWeight: 600 }}>
                    ₹{Number(paymentBalance).toFixed(2)}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="label">Payment Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={payment.paymentDate}
                    onChange={(e) => setPayment((prev) => ({ ...prev, paymentDate: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="label">Payment Methods</label>
                <div className="row gap-sm">
                  {paymentMethods.map((method) => {
                    const active = payment.selectedMethods.includes(method);
                    return (
                      <button
                        key={method}
                        type="button"
                        className={`btn ${active ? 'btn-primary' : 'btn-ghost'}`}
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
                {fieldErrors.paymentMethod && <span className="text-xs" style={{ color: 'var(--clr-error, #ef4444)' }}>{fieldErrors.paymentMethod}</span>}
              </div>

              <div className="row gap-md billing-row">
                {payment.selectedMethods.includes('Cash') && (
                  <div className="flex-1">
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
                  <div className="flex-1">
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
                  <div className="flex-1">
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
                  <div className="flex-1">
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

              {(payment.selectedMethods.some((m) => m !== 'Cash')) && (
                <div className="row gap-md billing-row">
                  <div className="flex-1">
                    <label className="label">UTR / Ref No</label>
                    <input
                      className="input-field"
                      value={payment.referenceNumber}
                      onChange={(e) => setPayment((prev) => ({ ...prev, referenceNumber: e.target.value }))}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="label">Purpose / Notes (optional)</label>
                    <input
                      className="input-field"
                      value={payment.description}
                      onChange={(e) => setPayment((prev) => ({ ...prev, description: e.target.value }))}
                    />
                  </div>
                </div>
              )}

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

              <div className="row justify-end mt-16 gap-sm billing-actions">
                <button className="btn btn-primary" type="button" onClick={handleAddOrder} disabled={!canProceed || saving}>
                  {saving ? 'Saving...' : `Create Bill ₹${totals.gross.toFixed(2)}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>

    {showPostBillOptions && (
      <div className="modal-backdrop">
        <div className="modal" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
            <h2 className="section-title" style={{ marginBottom: '8px' }}>Bill Created Successfully</h2>
            <p className="section-subtitle">Your order has been recorded.</p>
          </div>

          <div className="stack-md" style={{ marginTop: '24px' }}>
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
            <button
              className="btn btn-ghost btn--full"
              type="button"
              onClick={() => setShowPostBillOptions(false)}
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
                                  const staffId = value ? Number(value) : null;
                                  setAssignSelections((prev) => ({
                                    ...prev,
                                    [jobId]: { ...(prev[jobId] || {}), [role]: staffId }
                                  }));
                                }}
                                disabled={assignLoading}
                              >
                                <option value="">Select staff</option>
                                {roleStaff.map((staff) => (
                                  <option key={staff.id} value={staff.id}>
                                    {staff.name}
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
              onClick={() => setShowAssignModal(false)}
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
    )}
    </>
  );
};

export default Billing;

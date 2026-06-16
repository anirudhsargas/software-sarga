import React, { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, X, Plus, Minus, Trash2, Copy, Camera, QrCode, Clock, Star, FileText, Printer,
  ChevronDown, ChevronUp, ShoppingCart, User, CreditCard, Save, Eye, Check, AlertCircle,
  Loader2, Building2, Hash, Calendar, UserCheck, Phone, Mail, MapPin, Percent, IndianRupee,
  RotateCcw, MessageSquare, Zap, ScanLine, Image, Package, Tag, Upload
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import localDb from '../services/localDb';
import auth from '../services/auth';
import { formatCurrency } from '../constants';
import { printInvoicePDF, downloadInvoicePDF } from '../utils/invoicePdf';
import { useConfirm } from '../contexts/ConfirmContext';
import './Billing.css';

const serverToday = () => new Date().toISOString().split('T')[0];

// ─── Helpers ───
const normalizeCode = (value) => {
  let code = String(value || '');
  code = code.replace(/^\uFEFF/, '').trim().replace(/\s+/g, '').replace(/[\r\n]+/g, '').toUpperCase();
  return code;
};

const defaultPayment = () => ({
  selectedMethods: ['Cash'],
  methodAmounts: { Cash: 0, UPI: 0, Cheque: 0, 'Account Transfer': 0 },
  referenceNumber: '', description: '', paymentDate: serverToday()
});

const defaultForm = () => ({
  type: 'Retail', mobile: '', name: '', gst: '', email: '', address: ''
});

const defaultJobData = () => ({
  job_name: '', description: '', quantity: 1, unit_price: 0, total_amount: 0, advance_paid: 0,
  delivery_date: '', applied_extras: [], customPaperRate: 0, is_double_side: false,
  machine_id: '', waste_prints: 0, proof_prints: 0, count_to_machine: false,
  colour: '', numbering_from: '', numbering_to: '', special_instructions: '',
  matter_text: '', matter_file: null, matter_preview: null
});

const STEPS = [
  { id: 'customer', label: 'Customer', icon: User },
  { id: 'products', label: 'Products', icon: ShoppingCart },
  { id: 'payment', label: 'Payment', icon: CreditCard },
];

// ─── Billing Component ───
const Billing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin';
  const isFrontOffice = user?.role === 'Front Office';

  // Refs
  const customerMobileRef = useRef(null);
  const customerNameRef = useRef(null);
  const customerGstRef = useRef(null);
  const customerEmailRef = useRef(null);
  const customerAddressRef = useRef(null);
  const productSearchRef = useRef(null);
  const paymentAmountRef = useRef(null);
  const paymentRefNumberRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Core state
  const [step, setStep] = useState('customer');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [form, setForm] = useState(defaultForm());
  const [existingCustomer, setExistingCustomer] = useState(null);
  const [customerMatches, setCustomerMatches] = useState([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [hierarchy, setHierarchy] = useState([]);
  const [machines, setMachines] = useState([]);
  const [orderLines, setOrderLines] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState('');
  const [extraInputs, setExtraInputs] = useState([]);
  const [jobData, setJobData] = useState(defaultJobData());
  const [showJobDetails, setShowJobDetails] = useState(false);
  const [showMachineDetails, setShowMachineDetails] = useState(false);
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [quickEntry, setQuickEntry] = useState({ name: '', amount: '', book_type: 'Laser' });
  const [payment, setPayment] = useState(defaultPayment());
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountMode, setDiscountMode] = useState('amount');
  const [discountInputAmount, setDiscountInputAmount] = useState(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedPreview, setScannedPreview] = useState(null);
  const [scannedQty, setScannedQty] = useState(1);
  const [lastBillData, setLastBillData] = useState(null);
  const [showPostBillOptions, setShowPostBillOptions] = useState(false);
  const [assignJobs, setAssignJobs] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [assignRoles, setAssignRoles] = useState({});
  const [assignSelections, setAssignSelections] = useState({});
  const [roleSuggestions, setRoleSuggestions] = useState({});
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [fieldErrors, setFieldErrors] = useState({});
  const [branchUpiId, setBranchUpiId] = useState('');
  const [printAfterSave, setPrintAfterSave] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [recentProducts, setRecentProducts] = useState(
    () => JSON.parse(localStorage.getItem('recentProducts') || '[]')
  );
  const [lastOrderCustomerType, setLastOrderCustomerType] = useState('');
  const [lastOrderAutoDelivered, setLastOrderAutoDelivered] = useState(false);
  const [showRecentBills, setShowRecentBills] = useState(false);

  // Derived
  const isWalkIn = form.type === 'Walk-in';
  const needsGst = form.type === 'Offset' || form.type === 'Retail' || form.type === 'Wholesale';
  const isInternalBill = location.state?.internal || form.type === 'Internal' || form.type === 'Stock Transfer';

  // ── Data loading ──
  useEffect(() => {
    Promise.all([
      localDb.getBranches().catch(() => []),
      localDb.getMachines().catch(() => []),
      localDb.getProducts().catch(() => []),
    ]).then(([b, m, h]) => {
      setBranches(b || []);
      setMachines(m || []);
      setHierarchy(h || []);
      setLoading(false);
    });
    api.get('/machines').then(r => setMachines(r.data || [])).catch(() => {});
    api.get('/product-hierarchy').then(r => { setHierarchy(r.data || []); }).catch(() => {});
    api.get('/branches').then(r => { setBranches(r.data || []); }).catch(() => {});
  }, []);

  // Fetch branch UPI
  useEffect(() => {
    if (!selectedBranchId) return;
    api.get(`/branches/${selectedBranchId}`).then(r => setBranchUpiId(r.data?.upi_id || '')).catch(() => {});
  }, [selectedBranchId]);

  // ── Computed totals ──
  const totals = useMemo(() => {
    const subtotal = orderLines.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
    const activePct = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
    const effectiveDiscount = discountMode === 'percent'
      ? subtotal * activePct / 100
      : (discountMode === 'amount' ? (Number(discountInputAmount) || 0) : 0);
    const discountAmount = Math.min(effectiveDiscount, subtotal);
    const afterDiscount = subtotal - discountAmount;
    const sgst = afterDiscount * 0.045;
    const cgst = afterDiscount * 0.045;
    const gross = afterDiscount + sgst + cgst;
    return { subtotal, activePct, effectiveDiscount, discountAmount, afterDiscount, sgst, cgst, gross };
  }, [orderLines, discountPercent, discountMode, discountInputAmount]);

  const advancePaid = useMemo(() =>
    payment.selectedMethods.reduce((s, m) => s + (Number(payment.methodAmounts[m]) || 0), 0),
    [payment.selectedMethods, payment.methodAmounts]
  );

  // ── Discount total helper ──
  const computeDiscTotal = useCallback((lines, discPct) => {
    const sub = lines.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
    return sub - Math.min(sub * Math.min(Math.max(Number(discPct) || 0, 0), 100) / 100, sub);
  }, []);

  const canProceed = useMemo(() => {
    if (isWalkIn) return orderLines.length > 0;
    if (form.type === 'Retail') return orderLines.length > 0;
    if (form.type === 'Wholesale') return form.gst.trim().length > 0 && orderLines.length > 0;
    return form.mobile.length === 10 && form.name.trim().length > 0 && orderLines.length > 0;
  }, [form.mobile, form.name, form.gst, form.type, isWalkIn, orderLines.length]);

  // ── Customer search (debounced) ──
  useEffect(() => {
    if (!form.mobile && form.name.length < 2) { setCustomerMatches([]); return; }
    const t = setTimeout(async () => {
      if (form.mobile.length === 10) {
        const all = await localDb.getCustomers().catch(() => []);
        const exact = all.find(c => c.mobile === form.mobile);
        if (exact) {
          setExistingCustomer(exact);
          setForm(p => ({ ...p, name: exact.name, type: exact.client_type || p.type, email: exact.email || '', address: exact.address || '', gst: exact.gstin || '' }));
          setCustomerMatches([]);
          return;
        }
      }
      if (form.name.length >= 2) {
        const results = await localDb.getCustomers({ search: form.name }).catch(() => []);
        setCustomerMatches(results.slice(0, 6));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [form.mobile, form.name]);

  const handleSelectCustomer = useCallback((c) => {
    setExistingCustomer(c);
    setCustomerMatches([]);
    setForm(p => ({ ...p, mobile: c.mobile || '', name: c.name || '', type: c.client_type || p.type, email: c.email || '', address: c.address || '', gst: c.gstin || '' }));
  }, []);

  const handleChangeCustomer = useCallback(() => {
    setExistingCustomer(null);
    setCustomerMatches([]);
    setForm(p => ({ ...p, mobile: '', name: '', email: '', address: '', gst: '' }));
  }, []);

  // ── Product search & select ──
  const qrLookupMap = useMemo(() => {
    const map = new Map();
    (hierarchy || []).forEach(cat => (cat.subcategories || []).forEach(sub => (sub.products || []).forEach(prod => {
      const code = normalizeCode(prod.name || prod.title || '');
      if (code) map.set(code, { product: prod, catId: cat.id, subId: sub.id });
    })));
    return map;
  }, [hierarchy]);

  // ── Real-time product search ──
  useEffect(() => {
    const q = productSearchQuery.trim();
    if (!q || q.length < 1) { setProductSuggestions([]); setSelectedSuggestionIdx(-1); setProductSearching(false); return; }
    setProductSearching(true);
    const t = setTimeout(() => {
      const lower = q.toLowerCase();
      const results = [];
      (hierarchy || []).forEach(cat => {
        const catMatch = cat.name?.toLowerCase().includes(lower);
        (cat.subcategories || []).forEach(sub => {
          const subMatch = sub.name?.toLowerCase().includes(lower);
          (sub.products || []).forEach(prod => {
            const name = (prod.name || prod.title || '').toLowerCase();
            const normalized = normalizeCode(prod.name || prod.title || '');
            const codeMatch = normalized.includes(normalizeCode(q));
            if (name.includes(lower) || codeMatch || catMatch || subMatch) {
              results.push({ product: prod, catId: cat.id, subId: sub.id, catName: cat.name, subName: sub.name });
            }
          });
        });
      });
      setProductSuggestions(results.slice(0, 10));
      setSelectedSuggestionIdx(-1);
      setProductSearching(false);
    }, 200);
    return () => clearTimeout(t);
  }, [productSearchQuery, hierarchy]);

  // ── Add line item ──
  const handleAddLineItem = useCallback(async (product, qty = 1, extras = [], catId, subId) => {
    const line = {
      id: `${product.id || Date.now()}-${Date.now()}`,
      product_id: product.id,
      product_name: product.name || product.title || 'Product',
      quantity: Number(qty) || 1,
      unit_price: Number(product.mrp || product.sell_price || 0),
      total_amount: (Number(qty) || 1) * Number(product.mrp || product.sell_price || 0),
      calculation_type: 'flat',
      applied_extras: extras,
      customPaperRate: 0,
      is_double_side: false,
      description: '',
      category: catId || '',
      subcategory: subId || '',
      machine_id: null,
      waste_prints: 0,
      proof_prints: 0,
      book_type: 'Offset',
      colour: '', numbering_from: '', numbering_to: '', special_instructions: '',
      matter_text: '', matter_file: null, matter_preview: null,
      is_inventory_item: false,
    };
    setOrderLines(prev => [...prev, line]);
    setSelectedProduct(null);
    setProductSearchQuery('');
    // Update recent
    setRecentProducts(prev => {
      const next = [{ id: product.id, name: product.name || product.title, mrp: product.mrp }, ...prev.filter(p => p.id !== product.id)].slice(0, 20);
      localStorage.setItem('recentProducts', JSON.stringify(next));
      return next;
    });
  }, []);

  // Quick add
  const handleQuickAdd = useCallback(() => {
    if (!quickEntry.name.trim() || !Number(quickEntry.amount)) { toast.error('Enter name and amount'); return; }
    setOrderLines(prev => [...prev, {
      id: `quick-${Date.now()}`,
      product_id: null,
      product_name: quickEntry.name.trim(),
      quantity: 1,
      unit_price: Number(quickEntry.amount),
      total_amount: Number(quickEntry.amount),
      calculation_type: 'flat',
      applied_extras: [], customPaperRate: 0, is_double_side: false, description: '',
      category: '', subcategory: '', machine_id: null,
      waste_prints: 0, proof_prints: 0, book_type: quickEntry.book_type,
      colour: '', numbering_from: '', numbering_to: '', special_instructions: '',
      matter_text: '', matter_file: null, matter_preview: null, is_inventory_item: false,
    }]);
    setQuickEntry({ name: '', amount: '', book_type: 'Laser' });
    setShowQuickEntry(false);
  }, [quickEntry]);

  // Remove line
  const removeLine = useCallback((id) => {
    setOrderLines(prev => prev.filter(l => l.id !== id));
  }, []);

  // Duplicate line
  const duplicateLine = useCallback((line) => {
    setOrderLines(prev => [...prev, { ...line, id: `${line.product_id || 'dup'}-${Date.now()}` }]);
  }, []);

  // Update line qty/rate
  const updateLine = useCallback((id, field, value) => {
    setOrderLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        updated.total_amount = (Number(field === 'quantity' ? value : l.quantity) || 0) * (Number(field === 'unit_price' ? value : l.unit_price) || 0);
      }
      return updated;
    }));
  }, []);

  // ── QR / Barcode scan ──
  const handleQrLookup = useCallback(async (code, autoAdd = true) => {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    // O(1) lookup in hierarchy map
    const match = qrLookupMap.get(normalized);
    if (match) {
      if (autoAdd) {
        handleAddLineItem(match.product, 1, [], match.catId, match.subId);
      } else {
        setScannedPreview({ product: match.product, catId: match.catId, subId: match.subId });
        setScannedQty(1);
      }
      return;
    }
    // Fallback: inventory by SKU
    try {
      const { data } = await api.get(`/inventory/by-sku/${encodeURIComponent(normalized)}`);
      if (data) {
        const invProduct = { id: data.id, name: data.name, mrp: data.mrp || data.sell_price, sku: data.sku };
        if (autoAdd) {
          setOrderLines(prev => [...prev, {
            id: `inv-${data.id}-${Date.now()}`,
            product_id: data.id,
            inventory_item_id: data.id,
            product_name: data.name,
            quantity: 1,
            unit_price: Number(data.mrp || data.sell_price || 0),
            total_amount: Number(data.mrp || data.sell_price || 0),
            calculation_type: 'flat', applied_extras: [], customPaperRate: 0, is_double_side: false,
            description: '', category: '', subcategory: '', machine_id: null,
            waste_prints: 0, proof_prints: 0, book_type: 'Offset',
            colour: '', numbering_from: '', numbering_to: '', special_instructions: '',
            matter_text: '', matter_file: null, matter_preview: null,
            is_inventory_item: true,
          }]);
          setRecentProducts(prev => {
            const next = [{ id: data.id, name: data.name, mrp: data.mrp }, ...prev.filter(p => p.id !== data.id)].slice(0, 20);
            localStorage.setItem('recentProducts', JSON.stringify(next));
            return next;
          });
        } else {
          setScannedPreview({ product: invProduct, isInventory: true });
          setScannedQty(1);
        }
      }
    } catch { toast.error('No product or inventory item found for this code.'); }
  }, [qrLookupMap, handleAddLineItem]);

  // ── Payment ──
  const handlePaymentMethod = useCallback((method) => {
    setPayment(prev => {
      const has = prev.selectedMethods.includes(method);
      if (has && prev.selectedMethods.length <= 1) return prev;
      if (has) {
        return { ...prev, selectedMethods: prev.selectedMethods.filter(m => m !== method) };
      }
      return { ...prev, selectedMethods: [...prev.selectedMethods, method], methodAmounts: { ...prev.methodAmounts, [method]: prev.methodAmounts[method] || 0 } };
    });
  }, []);

  const updateMethodAmount = useCallback((method, value) => {
    setPayment(prev => ({ ...prev, methodAmounts: { ...prev.methodAmounts, [method]: Math.max(0, Number(value) || 0) } }));
  }, []);

  // ── Handle submit ──
  const handleAddOrder = useCallback(async () => {
    if (!canProceed) { setError('Complete customer details and add at least one product.'); return; }
    if (orderLines.length === 0) { setError('Add at least one product.'); return; }
    if (advancePaid < 0) { setError('Invalid payment amount.'); return; }
    if (isWalkIn && advancePaid < totals.gross * 0.99) { setError('Walk-in customers must pay in full.'); return; }
    setError('');
    setSaving(true);
    try {
      // Ensure customer exists in local DB
      let customerId = existingCustomer?.id;
      if (!customerId && form.name) {
        const custPayload = { name: form.name, mobile: form.mobile || null, client_type: form.type, email: form.email || null, address: form.address || null, gstin: form.gst || null };
        const customer = await localDb.createCustomer(custPayload);
        customerId = customer.id;
      }
      // Build payment details
      const cashAmt = Number(payment.methodAmounts.Cash) || 0;
      const upiAmt = Number(payment.methodAmounts.UPI) || 0;
      const chequeAmt = Number(payment.methodAmounts.Cheque) || 0;
      const transferAmt = Number(payment.methodAmounts['Account Transfer']) || 0;
      const payMethodLabel = payment.selectedMethods.length === 1 ? payment.selectedMethods[0] : 'Split';
      // Build bill payload
      const billPayload = {
        customer_id: customerId || null,
        customer_name: form.name,
        customer_mobile: form.mobile || null,
        customer_type: form.type,
        total_amount: totals.gross,
        net_amount: totals.afterDiscount,
        sgst_amount: totals.sgst,
        cgst_amount: totals.cgst,
        discount_percent: discountPercent || null,
        discount_amount: totals.discountAmount || null,
        advance_paid: advancePaid,
        payment_method: payMethodLabel,
        cash_amount: cashAmt,
        upi_amount: upiAmt,
        cheque_amount: chequeAmt,
        account_transfer_amount: transferAmt,
        reference_number: payment.referenceNumber || '',
        description: payment.description || '',
        payment_date: payment.paymentDate,
        book_type: orderLines.reduce((acc, l) => l.book_type === 'Other' ? 'Other' : acc, orderLines[0]?.book_type || 'Offset'),
        is_internal: 0,
        order_lines: orderLines.map(l => ({ ...l, matter_file: undefined, matter_preview: undefined, id: Number(l.product_id) || null })),
        auto_deliver: isWalkIn,
      };
      if (isAdmin && selectedBranchId) billPayload.branch_id = selectedBranchId;
      const matterFiles = orderLines.map(l => l.matter_file).filter(Boolean);
      const result = await localDb.createBill(billPayload, matterFiles);
      // Build lastBillData for PDF
      const lastBill = {
        customer: { name: form.name, mobile: form.mobile, address: form.address, gst: form.gst },
        orderLines, totals, payment: { method: payMethodLabel, cash_amount: cashAmt, upi_amount: upiAmt, cheque_amount: chequeAmt, account_transfer_amount: transferAmt },
        jobs: result.jobs || [], upiId: branchUpiId
      };
      setLastBillData(lastBill);
      setLastOrderCustomerType(form.type);
      setLastOrderAutoDelivered(isWalkIn);
      // Reset
      setForm(defaultForm());
      setExistingCustomer(null);
      setOrderLines([]);
      setPayment(defaultPayment());
      setDiscountPercent(0);
      setDiscountInputAmount(0);
      setError('');
      setStep('customer');
      toast.success('Invoice created successfully!');
      if (result.payment?.id) {
        window.dispatchEvent(new CustomEvent('paymentRecorded'));
      }
      setShowPostBillOptions(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create invoice.');
      toast.error('Invoice creation failed.');
    } finally { setSaving(false); }
  }, [canProceed, orderLines, advancePaid, totals, isWalkIn, existingCustomer, form, payment, discountPercent, totals.discountAmount, totals.afterDiscount, totals.sgst, totals.cgst, totals.gross, isAdmin, selectedBranchId, branchUpiId]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); customerMobileRef.current?.focus(); customerMobileRef.current?.select(); }
      if (e.key === 'F3') { e.preventDefault(); productSearchRef.current?.focus(); productSearchRef.current?.select(); }
      if (e.key === 'F4') { e.preventDefault(); paymentAmountRef.current?.focus(); paymentAmountRef.current?.select(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); handleAddOrder(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); productSearchRef.current?.focus(); productSearchRef.current?.select(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAddOrder]);

  // ── Auto-save draft every 10s ──
  useEffect(() => {
    if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    saveTimerRef.current = setInterval(() => {
      if (orderLines.length > 0 || form.mobile || form.name) {
        localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: orderLines, totals }));
      }
    }, 10000);
    return () => clearInterval(saveTimerRef.current);
  }, [form, orderLines, totals]);

  // ── Print on save ──
  const handlePrintLast = useCallback(() => {
    if (lastBillData) printInvoicePDF(lastBillData);
  }, [lastBillData]);

  // ── Undo delete (5s) using simple toast ──
  const handleRemoveWithUndo = useCallback((line) => {
    setOrderLines(prev => prev.filter(l => l.id !== line.id));
    toast((t) => (
      <div className="row gap-sm items-center">
        <span>Item removed</span>
        <button className="btn btn-xs btn-primary" onClick={() => { setOrderLines(prev => [...prev, line]); toast.dismiss(t.id); }}>Undo</button>
      </div>
    ), { duration: 5000 });
  }, []);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="billing-page">
        <div className="billing-skeleton">
          {[1, 2, 3].map(i => <div key={i} className="skeleton-block" style={{ height: i === 1 ? 64 : 120, animationDelay: `${i * 0.1}s` }} />)}
        </div>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="billing-page">
      {/* HEADER */}
      <header className="billing-header">
        <div className="billing-header__left">
          <h1 className="billing-header__title">New Invoice</h1>
          <p className="billing-header__subtitle">Create invoice in under 30 seconds</p>
        </div>
        <div className="billing-header__right">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRecentBills(true)}><Clock size={15} aria-hidden="true" /> Recent</button>
          <button className="btn btn-ghost btn-sm" onClick={handleChangeCustomer}><User size={15} aria-hidden="true" /> New Customer</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddOrder} disabled={saving || !canProceed}>
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Zap size={15} aria-hidden="true" />} Create Invoice
          </button>
        </div>
      </header>

      {/* STICKY SUMMARY BAR */}
      <div className="billing-summary-bar">
        <div className="billing-summary-bar__item">
          <Building2 size={14} />
          <select value={selectedBranchId || ''} onChange={e => setSelectedBranchId(e.target.value || null)}>
            <option value="">Branch</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="billing-summary-bar__item">
          <Hash size={14} /><span>Auto</span>
        </div>
        <div className="billing-summary-bar__item">
          <Calendar size={14} /><span>{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="billing-summary-bar__item">
          <UserCheck size={14} /><span>{user?.name || 'Staff'}</span>
        </div>
        <div className="billing-summary-bar__spacer" />
        <div className="billing-summary-bar__item billing-summary-bar__item--total">
          <span>Items: {orderLines.length}</span>
          <span className="billing-summary-bar__amount">₹{totals.gross.toFixed(2)}</span>
        </div>
      </div>

      {/* STEP INDICATOR */}
      <div className="billing-steps">
        {STEPS.map((s, i) => {
          const currentIdx = STEPS.findIndex(x => x.id === step);
          const isActive = s.id === step;
          const isDone = currentIdx > i;
          return (
            <button key={s.id} className={`billing-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`} onClick={() => setStep(s.id)}>
              <span className="billing-step__icon">{isDone ? <Check size={14} /> : <s.icon size={14} />}</span>
              <span className="billing-step__label">{s.label}</span>
              {i < STEPS.length - 1 && <span className="billing-step__connector" />}
            </button>
          );
        })}
      </div>

      {/* ERROR */}
      {error && <div className="billing-error"><AlertCircle size={16} /> {error}</div>}

      {/* STEP 1: CUSTOMER */}
      {step === 'customer' && (
        <div className="billing-section billing-section--customer">
          <div className="billing-section__header"><User size={18} /> <h2>Customer</h2></div>

          {/* Customer type chips */}
          <div className="billing-chips">
            {['Retail', 'Walk-in', 'Offset', 'Wholesale'].map(t => (
              <button key={t} className={`chip ${form.type === t ? 'active' : ''}`} onClick={() => setForm(p => ({ ...p, type: t }))}>{t}</button>
            ))}
          </div>

          {/* Search existing */}
          <div className="billing-field">
            <Search size={14} className="billing-field__icon" aria-hidden="true" />
            <label htmlFor="billing-customer-search" className="sr-only">Search customer by mobile or name</label>
            <input id="billing-customer-search" name="billingCustomerSearch" ref={customerMobileRef} type="text" placeholder="Search by mobile / name / GST..." value={form.mobile || form.name}
              onChange={e => { const v = e.target.value; setForm(p => ({ ...p, mobile: v.replace(/\D/g, '').slice(0, 10) })); setExistingCustomer(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { customerNameRef.current?.focus(); } }}
              className="billing-field__input" autoComplete="off" />
            <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setShowScanner(true)} title="Scan barcode" aria-label="Scan barcode"><Camera size={14} aria-hidden="true" /></button>
          </div>

          {customerMatches.length > 0 && (
            <div className="billing-dropdown">
              {customerMatches.map(c => (
                <div key={c.id} className="billing-dropdown__item" onClick={() => handleSelectCustomer(c)}>
                  <span className="font-medium">{c.name}</span>
                  <span className="muted text-xs">{c.mobile}</span>
                </div>
              ))}
              <div className="billing-dropdown__item billing-dropdown__add" onClick={() => { setExistingCustomer(null); setCustomerMatches([]); customerNameRef.current?.focus(); }}>
                <Plus size={14} /> <span>Add New Customer</span>
              </div>
            </div>
          )}

          {/* Existing customer card */}
          {existingCustomer ? (
            <div className="billing-customer-card">
              <div className="billing-customer-card__header">
                <div className="user-avatar user-avatar--sm">{form.name?.[0] || '?'}</div>
                <div>
                  <div className="font-semibold">{form.name}</div>
                  <div className="text-xs muted">{form.mobile}</div>
                </div>
                <button className="btn btn-ghost btn-xs" onClick={handleChangeCustomer}><X size={14} /></button>
              </div>
              <div className="billing-customer-card__details">
                <span><Phone size={12} /> {form.mobile}</span>
                {form.gst && <span><FileText size={12} /> {form.gst}</span>}
                {form.address && <span><MapPin size={12} /> {form.address}</span>}
              </div>
              <button className="btn btn-primary btn-sm btn--full mt-8" onClick={() => setStep('products')}>
                Continue <ChevronDown size={14} />
              </button>
            </div>
          ) : (
            /* New customer form */
            <div className="billing-customer-form">
              <div className="billing-customer-form__grid">
                <div className="billing-field">
                  <User size={14} className="billing-field__icon" aria-hidden="true" />
                  <label htmlFor="billing-name" className="sr-only">Customer Name</label>
                  <input id="billing-name" name="billingName" ref={customerNameRef} type="text" placeholder={isWalkIn || form.type === 'Retail' ? 'Full Name' : 'Full Name *'} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { const next = needsGst ? customerGstRef : customerEmailRef; next.current?.focus(); } }}
                    className="billing-field__input" autoComplete="name" />
                </div>
                <div className="billing-field billing-field--mobile">
                  <Phone size={14} className="billing-field__icon" aria-hidden="true" />
                  <label htmlFor="billing-mobile" className="sr-only">Mobile Number</label>
                  <input id="billing-mobile" name="billingMobile" type="tel" placeholder={isWalkIn || form.type === 'Retail' ? 'Mobile' : 'Mobile *'} value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    onKeyDown={e => { if (e.key === 'Enter') { customerNameRef.current?.focus(); } }}
                    className="billing-field__input" autoComplete="tel" />
                </div>
                {needsGst && (
                  <div className="billing-field">
                    <FileText size={14} className="billing-field__icon" aria-hidden="true" />
                    <label htmlFor="billing-gst" className="sr-only">GST Number</label>
                    <input id="billing-gst" name="billingGst" ref={customerGstRef} type="text" placeholder={form.type === 'Wholesale' ? 'GST Number *' : 'GST Number'} value={form.gst} onChange={e => setForm(p => ({ ...p, gst: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { customerEmailRef.current?.focus(); } }}
                      className="billing-field__input" autoComplete="off" />
                  </div>
                )}
                <div className="billing-field">
                  <Mail size={14} className="billing-field__icon" aria-hidden="true" />
                  <label htmlFor="billing-email" className="sr-only">Email</label>
                  <input id="billing-email" name="billingEmail" ref={customerEmailRef} type="email" placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { customerAddressRef.current?.focus(); } }}
                    className="billing-field__input" autoComplete="email" />
                </div>
              </div>
              <div className="billing-field">
                <MapPin size={14} className="billing-field__icon" aria-hidden="true" />
                <label htmlFor="billing-address" className="sr-only">Address</label>
                <input id="billing-address" name="billingAddress" ref={customerAddressRef} type="text" placeholder="Address" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { document.querySelector('.billing-section--customer .btn--full')?.click(); } }}
                  className="billing-field__input" autoComplete="street-address" />
              </div>
              <button className="btn btn-primary btn-sm btn--full mt-8" onClick={() => setStep('products')} disabled={!canProceed && !isWalkIn}>
                Continue <ChevronDown size={14} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: PRODUCTS */}
      {step === 'products' && (
        <div className="billing-section billing-section--products">
          <div className="billing-section__header"><ShoppingCart size={18} /> <h2>Add Products</h2></div>

          {/* Search + Quick Actions */}
          <div className="billing-product-top">
            <div className="billing-search-row" style={{ position: 'relative' }}>
              <div className="billing-field billing-field--search">
                <Search size={16} className="billing-field__icon" aria-hidden="true" />
                <input ref={productSearchRef} id="billingProductSearch" name="billingProductSearch" type="text" placeholder="Scan barcode • Search product • Enter code" value={productSearchQuery}
                  onChange={e => { setProductSearchQuery(e.target.value); setSelectedSuggestionIdx(-1); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (selectedSuggestionIdx >= 0 && productSuggestions[selectedSuggestionIdx]) {
                        const s = productSuggestions[selectedSuggestionIdx];
                        handleAddLineItem(s.product, 1, [], s.catId, s.subId);
                        setProductSearchQuery('');
                        setProductSuggestions([]);
                      } else if (productSearchQuery.trim()) {
                        handleQrLookup(productSearchQuery);
                        setProductSearchQuery('');
                        setProductSuggestions([]);
                      }
                    }
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSuggestionIdx(i => Math.min(i + 1, productSuggestions.length - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSuggestionIdx(i => Math.max(i - 1, 0)); }
                    if (e.key === 'Escape') { setProductSuggestions([]); setProductSearchQuery(''); }
                  }}
                  className="billing-field__input" aria-label="Search products by name or barcode" autoComplete="off" />
                {productSearching && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />}
              </div>
              <div className="billing-quick-actions">
                <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setShowScanner(true)} title="Camera Scan" aria-label="Camera scan"><Camera size={16} aria-hidden="true" /></button>
                <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setShowQuickEntry(true)} title="Quick Add" aria-label="Quick add product"><Zap size={16} aria-hidden="true" /></button>
                {recentProducts.length > 0 && <button className="btn btn-ghost btn-icon btn-xs" onClick={() => { const r = recentProducts[0]; if (r) handleAddLineItem(r); }} title="Recent" aria-label="Add most recent product"><Clock size={16} aria-hidden="true" /></button>}
              </div>
              {/* Product suggestions dropdown */}
              {productSuggestions.length > 0 && (
                <div className="billing-product-suggestions">
                  {productSuggestions.map((s, i) => (
                    <div key={`${s.product.id}-${i}`} className={`billing-product-suggestions__item ${i === selectedSuggestionIdx ? 'selected' : ''}`}
                      onClick={() => { handleAddLineItem(s.product, 1, [], s.catId, s.subId); setProductSearchQuery(''); setProductSuggestions([]); }}
                      onMouseEnter={() => setSelectedSuggestionIdx(i)}>
                      <div className="billing-product-suggestions__name">{s.product.name || s.product.title}</div>
                      <div className="billing-product-suggestions__meta">
                        <span>₹{Number(s.product.mrp || s.product.sell_price || 0).toLocaleString()}</span>
                        {s.catName && <span className="muted">{s.catName}{s.subName ? ` / ${s.subName}` : ''}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Category filters */}
            <div className="billing-category-row">
              <select value={selectedCategoryId} onChange={e => { setSelectedCategoryId(e.target.value); setSelectedSubcategoryId(''); }} className="billing-select">
                <option value="">All Categories</option>
                {(hierarchy || []).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
              {selectedCategoryId && (
                <select value={selectedSubcategoryId} onChange={e => setSelectedSubcategoryId(e.target.value)} className="billing-select">
                  <option value="">All Subcategories</option>
                  {(hierarchy.find(c => c.id === selectedCategoryId)?.subcategories || []).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                </select>
              )}
            </div>
          </div>

          {/* Quick Entry popup */}
          {showQuickEntry && (
            <div className="billing-quick-entry">
              <label htmlFor="billing-quick-name" className="sr-only">Product name</label>
              <input id="billing-quick-name" name="billingQuickName" type="text" placeholder="Product name" value={quickEntry.name} onChange={e => setQuickEntry(p => ({ ...p, name: e.target.value }))} className="billing-field__input" autoComplete="off" />
              <label htmlFor="billing-quick-amount" className="sr-only">Amount</label>
              <input id="billing-quick-amount" name="billingQuickAmount" type="number" placeholder="Amount" value={quickEntry.amount} onChange={e => setQuickEntry(p => ({ ...p, amount: e.target.value }))} className="billing-field__input" />
              <label htmlFor="billing-quick-type" className="sr-only">Book type</label>
              <select id="billing-quick-type" name="billingQuickType" value={quickEntry.book_type} onChange={e => setQuickEntry(p => ({ ...p, book_type: e.target.value }))} className="billing-select">
                <option value="Laser">Laser</option><option value="Offset">Offset</option><option value="Other">Other</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleQuickAdd}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowQuickEntry(false)}>Cancel</button>
            </div>
          )}

          {/* Products from catalog */}
          {selectedSubcategoryId && (
            <div className="billing-catalog-grid">
              {(hierarchy.find(c => c.id === selectedCategoryId)?.subcategories.find(s => s.id === selectedSubcategoryId)?.products || []).slice(0, 12).map(prod => (
                <div key={prod.id} className="billing-catalog-item" onClick={() => handleAddLineItem(prod)}>
                  <div className="billing-catalog-item__icon"><Package size={20} aria-hidden="true" /></div>
                  <div className="billing-catalog-item__name">{prod.name || prod.title}</div>
                  <div className="billing-catalog-item__price">₹{Number(prod.mrp || prod.sell_price || 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {/* Selected Products Table */}
          {orderLines.length > 0 ? (
            <div className="billing-products-layout">
              <div className="billing-table-wrapper">
                  <table className="billing-table">
                  <thead>
                    <tr>
                      <th scope="col" style={{ width: '30%' }}>Product</th>
                      <th scope="col" style={{ width: '12%' }}>Qty</th>
                      <th scope="col" style={{ width: '12%' }}>Rate</th>
                      <th scope="col" style={{ width: '10%' }}>Disc%</th>
                      <th scope="col" style={{ width: '12%' }}>Tax</th>
                      <th scope="col" style={{ width: '14%' }}>Total</th>
                      <th scope="col" style={{ width: '10%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderLines.map((line) => (
                      <tr key={line.id}>
                        <td>
                          <div className="billing-product-cell">
                            <div className="billing-product-cell__name">{line.product_name}</div>
                            {line.book_type && <span className="badge badge--sm">{line.book_type}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="billing-qty-adjust">
                            <button className="btn btn-ghost btn-icon btn-xs" onClick={() => updateLine(line.id, 'quantity', Math.max(1, (Number(line.quantity) || 1) - 1))}><Minus size={12} /></button>
                            <input type="number" value={line.quantity} min="1" onChange={e => updateLine(line.id, 'quantity', Math.max(1, Number(e.target.value) || 1))} className="billing-qty-input" />
                            <button className="btn btn-ghost btn-icon btn-xs" onClick={() => updateLine(line.id, 'quantity', (Number(line.quantity) || 1) + 1)}><Plus size={12} /></button>
                          </div>
                        </td>
                        <td>
                          <input type="number" value={line.unit_price} onChange={e => updateLine(line.id, 'unit_price', Number(e.target.value) || 0)} className="billing-input-num" />
                        </td>
                        <td className="text-center">—</td>
                        <td className="text-center">—</td>
                        <td className="font-bold">₹{Number(line.total_amount).toLocaleString()}</td>
                        <td>
                          <div className="row gap-xxs">
                            <button className="btn btn-ghost btn-icon btn-xs" onClick={() => duplicateLine(line)} title="Duplicate"><Copy size={12} /></button>
                            <button className="btn btn-ghost btn-icon btn-xs text-error" onClick={() => handleRemoveWithUndo(line)} title="Remove"><Trash2 size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Right floating summary */}
              <div className="billing-summary-side">
                <div className="billing-summary-side__card">
                  <div className="billing-summary-side__row"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
                  {totals.discountAmount > 0 && <div className="billing-summary-side__row billing-summary-side__row--discount"><span>Discount</span><span>-₹{totals.discountAmount.toFixed(2)}</span></div>}
                  <div className="billing-summary-side__row"><span>SGST (4.5%)</span><span>₹{totals.sgst.toFixed(2)}</span></div>
                  <div className="billing-summary-side__row"><span>CGST (4.5%)</span><span>₹{totals.cgst.toFixed(2)}</span></div>
                  <div className="billing-summary-side__divider" />
                  <div className="billing-summary-side__row billing-summary-side__row--grand"><span>Grand Total</span><span>₹{totals.gross.toFixed(2)}</span></div>

                  {/* Discount controls */}
                  <div className="billing-discount-row">
                    <span className="text-xs muted">Discount</span>
                    <div className="row gap-xs">
                      <input type="number" placeholder="%" value={discountPercent || ''} onChange={e => setDiscountPercent(Number(e.target.value) || 0)} className="billing-input-sm" min="0" max="100" />
                      <button className={`btn btn-xs ${discountMode === 'percent' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDiscountMode('percent'); setDiscountPercent(0); }}>%</button>
                      <button className={`btn btn-xs ${discountMode === 'amount' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDiscountMode('amount'); setDiscountInputAmount(0); }}>₹</button>
                    </div>
                  </div>
                  {discountMode === 'amount' && (
                    <input type="number" placeholder="Discount amount" value={discountInputAmount || ''} onChange={e => setDiscountInputAmount(Number(e.target.value) || 0)} className="billing-input-sm btn--full mt-4" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="billing-empty-products">
              <Package size={32} className="muted" />
              <p className="muted text-sm">No products added yet</p>
              <p className="muted text-xs">Search above or scan a barcode to add items</p>
            </div>
          )}

          <div className="billing-section-actions">
            <button className="btn btn-primary btn-sm" onClick={() => setStep('payment')} disabled={orderLines.length === 0}>
              Continue to Payment <ChevronDown size={14} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: PAYMENT */}
      {step === 'payment' && (
        <div className="billing-section billing-section--payment">
          <div className="billing-section__header"><CreditCard size={18} /> <h2>Payment</h2></div>

          {/* Amount */}
          <div className="billing-payment-amount">
            <label className="text-xs muted">Amount Received</label>
            <div className="billing-payment-amount__value">₹{advancePaid.toFixed(2)}</div>
          </div>

          {/* Payment methods — click to toggle, supports split */}
          <div className="billing-chips billing-chips--payment">
            {['Cash', 'UPI', 'Card', 'Cheque', 'Account Transfer'].map(m => (
              <button key={m} className={`chip ${payment.selectedMethods.includes(m) ? 'active' : ''}`}
                onClick={() => handlePaymentMethod(m)}>
                {m}
                {payment.selectedMethods.length > 1 && payment.selectedMethods.includes(m) && <span className="chip__check"><Check size={10} /></span>}
              </button>
            ))}
          </div>

          {/* Per-method amounts */}
          <div className="billing-payment-inputs">
            {payment.selectedMethods.map((m, i) => (
              <div key={m} className="billing-field">
                <IndianRupee size={14} className="billing-field__icon" aria-hidden="true" />
                <input ref={m === 'Cash' ? paymentAmountRef : null} id={`paymentAmount-${m}`} name={`paymentAmount-${m}`} type="number" placeholder={`${m} amount`} value={payment.methodAmounts[m] || ''}
                  onChange={e => updateMethodAmount(m, e.target.value)} className="billing-field__input" aria-label={`${m} amount`} autoComplete="off" />
                <span className="text-xs muted">{m}</span>
              </div>
            ))}
            {payment.selectedMethods.length > 1 && (
              <div className="billing-payment-balance">
                <span>Remaining</span>
                <span className="font-bold">₹{Math.max(totals.gross - advancePaid, 0).toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Reference + Notes */}
          <div className="billing-payment-extras">
            <div className="billing-field">
              <Hash size={14} className="billing-field__icon" aria-hidden="true" />
              <label htmlFor="billing-ref" className="sr-only">Reference number</label>
              <input id="billing-ref" name="billingRef" ref={paymentRefNumberRef} type="text" placeholder="Reference number (required for non-cash)" value={payment.referenceNumber}
                onChange={e => setPayment(p => ({ ...p, referenceNumber: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { document.querySelector('.billing-bottom-bar .btn-primary')?.click(); } }}
                className="billing-field__input" autoComplete="off" />
            </div>
            <div className="billing-field">
              <MessageSquare size={14} className="billing-field__icon" aria-hidden="true" />
              <label htmlFor="billing-notes" className="sr-only">Notes</label>
              <input id="billing-notes" name="billingNotes" type="text" placeholder="Notes (optional)" value={payment.description}
                onChange={e => setPayment(p => ({ ...p, description: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { document.querySelector('.billing-bottom-bar .btn-primary')?.click(); } }}
                className="billing-field__input" autoComplete="off" />
            </div>
          </div>

          {/* Invoice options */}
          <div className="billing-invoice-options">
            <label className="checkbox-row text-xs">
              <input type="checkbox" checked={printAfterSave} onChange={e => setPrintAfterSave(e.target.checked)} />
              <span>Print after save</span>
            </label>
            <label className="checkbox-row text-xs">
              <input type="checkbox" checked={sendWhatsApp} onChange={e => setSendWhatsApp(e.target.checked)} />
              <span>Send WhatsApp</span>
            </label>
            <label className="checkbox-row text-xs">
              <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
              <span>Send Email</span>
            </label>
          </div>

          {/* Payment summary */}
          <div className="billing-payment-summary">
            <div className="billing-payment-summary__row"><span>Total Bill</span><span className="font-bold">₹{totals.gross.toFixed(2)}</span></div>
            <div className="billing-payment-summary__row"><span>Paid</span><span className="font-bold text-success">₹{advancePaid.toFixed(2)}</span></div>
            <div className="billing-payment-summary__row billing-payment-summary__row--balance">
              <span>Balance</span>
              <span className="font-bold">{advancePaid >= totals.gross ? 'Paid in Full' : `₹${Math.max(totals.gross - advancePaid, 0).toFixed(2)}`}</span>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM STICKY ACTION BAR */}
      <div className="billing-bottom-bar">
        <div className="billing-bottom-bar__left">
          <button className="btn btn-ghost btn-sm" onClick={() => { localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: orderLines, totals })); toast.success('Draft saved'); }}>
            <Save size={15} aria-hidden="true" /> Save Draft
          </button>
          {lastBillData && <button className="btn btn-ghost btn-sm" onClick={handlePrintLast}><Eye size={15} aria-hidden="true" /> Preview</button>}
        </div>
        <div className="billing-bottom-bar__right">
          <button className="btn btn-primary btn--full-mobile" onClick={handleAddOrder} disabled={saving || !canProceed}>
            {saving ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Saving...</> : <><Zap size={16} aria-hidden="true" /> {step === 'payment' ? 'Generate Invoice' : 'Create Invoice'}</>}
          </button>
        </div>
      </div>

      {/* Scanner Modal */}
      {showScanner && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="scanner-title" onClick={() => setShowScanner(false)}>
          <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 id="scanner-title">Scan Barcode / QR</h3>
              <button className="modal-close" onClick={() => setShowScanner(false)} aria-label="Close scanner"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body">
              <p className="text-xs muted mb-8">Enter code manually or use camera:</p>
              <label htmlFor="scanner-code" className="sr-only">Barcode or QR code</label>
              <input id="scanner-code" name="scannerCode" type="text" placeholder="Paste or type code..." className="billing-field__input"
                onKeyDown={e => { if (e.key === 'Enter' && e.target.value) { handleQrLookup(e.target.value); setShowScanner(false); } }} autoComplete="off" autoFocus />
            </div>
          </div>
        </div>
      )}

      {/* Post-bill options */}
      {showPostBillOptions && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="post-bill-title" onClick={() => setShowPostBillOptions(false)}>
          <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3 id="post-bill-title">Invoice Created!</h3>
              <button className="modal-close" aria-label="Close" onClick={() => setShowPostBillOptions(false)}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body stack-sm">
              <button className="btn btn-primary btn--full" onClick={() => { handlePrintLast(); setShowPostBillOptions(false); }}>
                <Printer size={16} className="mr-8" aria-hidden="true" /> Print Invoice
              </button>
              <button className="btn btn-ghost btn--full" onClick={() => { setShowPostBillOptions(false); }}>
                <Plus size={16} className="mr-8" aria-hidden="true" /> New Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scanned preview modal */}
      {scannedPreview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Preview scanned product: ${scannedPreview.product?.name}`} onClick={() => setScannedPreview(null)}>
          <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <h3>{scannedPreview.product?.name}</h3>
              <button className="modal-close" onClick={() => setScannedPreview(null)} aria-label="Close scanned preview"><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body stack-sm">
              <div className="row gap-sm items-center">
                <span className="text-xs muted">Qty:</span>
                <div className="billing-qty-adjust">
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setScannedQty(Math.max(1, scannedQty - 1))} aria-label="Decrease quantity"><Minus size={12} aria-hidden="true" /></button>
                  <span className="font-bold px-8">{scannedQty}</span>
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={() => setScannedQty(scannedQty + 1)} aria-label="Increase quantity"><Plus size={12} aria-hidden="true" /></button>
                </div>
              </div>
              <div className="row gap-sm">
                <button className="btn btn-primary btn-sm flex-1" onClick={() => { handleAddLineItem(scannedPreview.product, scannedQty); setScannedPreview(null); }}>
                  Add to Bill
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setScannedPreview(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Billing;

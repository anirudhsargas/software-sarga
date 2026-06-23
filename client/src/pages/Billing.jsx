import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import SecureImage from '../components/SecureImage';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Search, X, Plus, Minus, Trash2, Copy, Camera, QrCode, Clock, Star, FileText, Printer,
  ChevronDown, ChevronUp, ShoppingCart, User, CreditCard, Save, Eye, Check, AlertCircle,
  Loader2, Building2, Hash, Calendar, UserCheck, Phone, Mail, MapPin, Percent, IndianRupee,
  RotateCcw, MessageSquare, Zap, ScanLine, Image, Package, Tag, Upload, ArrowLeft, Users
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import QRCode from 'qrcode';
import api from '../services/api';
import localDb from '../services/localDb';
import auth from '../services/auth';
import { formatCurrency } from '../constants';
import { printInvoicePDF, downloadInvoicePDF } from '../utils/invoicePdf';
import { useConfirm } from '../contexts/ConfirmContext';
import { calculateProductPrice } from '../utils/pricing';
import './Billing.css';
import PageContainer from '../components/ui/PageContainer';
import ScannerModal from '../components/ScannerModal';

const serverToday = () => new Date().toISOString().split('T')[0];

// ─── Helpers ───
const normalizeCode = (value) => {
  let code = String(value || '');
  code = code.replace(/^\uFEFF/, '').trim().replace(/\s+/g, '').replace(/[\r\n]+/g, '').toUpperCase();
  return code;
};

// Derive book_type from category name
const bookTypeFromCategory = (catName) => {
  const name = String(catName || '').trim().toLowerCase();
  if (name === 'offset') return 'Offset';
  if (name === 'laser') return 'Laser';
  return 'Other';
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

// ─── Role-based discount limits ───
const DISCOUNT_LIMITS = {
  'Admin': 100,
  'Accountant': 30,
  'Front Office': 15,
};
const DEFAULT_DISCOUNT_LIMIT = 15;

// Job type options
const JOB_TYPE_OPTIONS = ['Offset', 'Laser', 'Digital', 'Flex', 'ID Card', 'Binding', 'Lamination', 'Other'];

// Billing tabs definition
const BILLING_TABS = [
  { key: 'customer', label: 'Customer', icon: User },
  { key: 'products', label: 'Add Products', icon: ShoppingCart },
  { key: 'payment', label: 'Payment', icon: CreditCard },
  { key: 'summary', label: 'Summary', icon: FileText },
];

// ─── Billing Component ───
const Billing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const user = auth.getUser();
  const isAdmin = user?.role === 'Admin';
  const isFrontOffice = user?.role === 'Front Office';
  const isAccountant = user?.role === 'Accountant';

  const maxDiscountPct = useMemo(() => {
    if (isAdmin) return 100;
    if (isAccountant && user?.has_discount_permission) return 30;
    if (isFrontOffice) return 15;
    return DEFAULT_DISCOUNT_LIMIT;
  }, [isAdmin, isAccountant, isFrontOffice, user]);

  // Refs
  const customerNameRef = useRef(null);
  const customerGstRef = useRef(null);
  const customerEmailRef = useRef(null);
  const customerAddressRef = useRef(null);
  const productSearchRef = useRef(null);
  const paymentAmountRef = useRef(null);
  const paymentRefNumberRef = useRef(null);
  const saveTimerRef = useRef(null);

  // Core state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState(user?.branch_id || null);
  const [jobType, setJobType] = useState('');
  const [activeTab, setActiveTab] = useState('customer');
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
  const [discountError, setDiscountError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannedPreview, setScannedPreview] = useState(null);
  const [scannedQty, setScannedQty] = useState(1);
  const [lastBillData, setLastBillData] = useState(null);
  const [showPostBillOptions, setShowPostBillOptions] = useState(false);
  const [assignJobs, setAssignJobs] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [assignSelections, setAssignSelections] = useState({});
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const customerSearchDebounced = useDebounce(customerSearchQuery, 350);
  const [highlightedCustomerIdx, setHighlightedCustomerIdx] = useState(-1);
  const [customerNoResults, setCustomerNoResults] = useState(false);
  const customerSearchRef = useRef(null);
  const customerDropdownRef = useRef(null);
  const [productSuggestions, setProductSuggestions] = useState([]);
  const [productSearching, setProductSearching] = useState(false);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
  const [fieldErrors, setFieldErrors] = useState({});
  const [branchUpiId, setBranchUpiId] = useState('');
  const [printAfterSave, setPrintAfterSave] = useState(true);
  const [sendWhatsApp, setSendWhatsApp] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [recentProducts, setRecentProducts] = useState(
    () => JSON.parse(localStorage.getItem('recentProducts') || '[]')
  );
  const [lastOrderCustomerType, setLastOrderCustomerType] = useState('');
  const [lastOrderAutoDelivered, setLastOrderAutoDelivered] = useState(false);
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBills, setRecentBills] = useState([]);
  const [loadingRecentBills, setLoadingRecentBills] = useState(false);
  const [catalogPage, setCatalogPage] = useState(1);
  const CATALOG_PAGE_SIZE = 24;

  // UPI QR state
  const [upiQrUrl, setUpiQrUrl] = useState('');
  const [upiQrLoading, setUpiQrLoading] = useState(false);

  const fetchRecentBills = useCallback(async () => {
    setLoadingRecentBills(true);
    try {
      let onlineBills = [];
      try {
        const res = await api.get('/customer-payments?limit=20');
        onlineBills = res.data?.data || res.data || [];
      } catch (err) {
        console.warn('Failed to fetch online bills', err);
      }

      let localBills = [];
      try {
        const offlineDb = (await import('../services/offlineDb')).default;
        localBills = await offlineDb.getAll('offlineBills');
      } catch (err) {
        console.warn('Failed to fetch offline bills', err);
      }

      const merged = [
        ...localBills.map(b => ({ ...b, isOffline: true })),
        ...onlineBills.filter(ob => !localBills.some(lb => lb.id === ob.id))
      ];

      merged.sort((a, b) => {
        const dateA = new Date(a.created_at || a.payment_date || a.paymentDate || 0);
        const dateB = new Date(b.created_at || b.payment_date || b.paymentDate || 0);
        return dateB - dateA;
      });

      setRecentBills(merged);
    } catch (err) {
      toast.error('Failed to load recent bills');
    } finally {
      setLoadingRecentBills(false);
    }
  }, []);

  const handlePrintRecent = useCallback((b) => {
    try {
      const printData = {
        invoice_number: b.invoice_number || b.id || 'Draft',
        customer_name: b.customer_name || b.customerName || 'Retail Customer',
        customer_mobile: b.customer_mobile || b.customerMobile || '',
        customer_email: b.customer_email || b.email || '',
        customer_address: b.customer_address || b.address || '',
        customer_gst: b.customer_gst || b.gst || '',
        net_amount: b.net_amount || b.netAmount || b.totalAmount || 0,
        advance_paid: b.advance_paid != null ? b.advance_paid : (b.advancePaid != null ? b.advancePaid : 0),
        payment_method: b.payment_method || b.paymentMethod || 'Cash',
        payment_date: b.payment_date || b.paymentDate || b.created_at,
        order_lines: b.orderLines || b.order_lines || []
      };
      printInvoicePDF(printData);
    } catch (err) {
      toast.error('Failed to print invoice');
    }
  }, []);

  // Derived
  const isWalkIn = form.type === 'Walk-in';
  const needsGst = form.type === 'Offset' || form.type === 'Retail' || form.type === 'Wholesale';
  const isInternalBill = location.state?.internal || form.type === 'Internal' || form.type === 'Stock Transfer';

  // ── Data loading ──
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      localDb.getBranches().catch(() => []),
      localDb.getMachines().catch(() => []),
      localDb.getProducts().catch(() => []),
    ]).then(([b, m, h]) => {
      if (cancelled) return;
      setBranches(b || []);
      setMachines(m || []);
      setHierarchy(h || []);
      setLoading(false);
    });
    api.get('/product-hierarchy').then(r => {
      if (cancelled || !r.data) return;
      setHierarchy(r.data);
    }).catch(() => {});
    api.get('/branches').then(r => {
      if (cancelled || !r.data) return;
      setBranches(r.data || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (user?.branch_id && !['admin', 'super_admin'].includes(user?.role?.toLowerCase())) {
      setSelectedBranchId(user.branch_id);
    }
  }, [user]);

  // Fetch branch UPI
  useEffect(() => {
    if (!selectedBranchId) { setBranchUpiId(''); return; }
    api.get(`/branches/${selectedBranchId}`).then(r => setBranchUpiId(r.data?.upi_id || '')).catch(() => {});
  }, [selectedBranchId]);

  // Fetch staff for assignment
  useEffect(() => {
    api.get('/staff?active=true').then(r => setStaffOptions(Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // ── Shortcut Prefill ──
  useEffect(() => {
    const sc = location.state?.fromShortcut && location.state?.shortcut;
    if (!sc) return;
    // Prefill customer type
    const typeMap = { walk_in: 'Walk-in', regular: 'Retail', credit: 'Wholesale' };
    setForm(prev => ({ ...prev, type: typeMap[sc.customer_type] || 'Walk-in' }));
    // Prefill order line
    const line = {
      id: `shortcut-${Date.now()}`,
      product_id: sc.product_id || null,
      product_name: sc.name,
      quantity: 1,
      unit_price: Number(sc.price) || 0,
      total_amount: Number(sc.price) || 0,
      calculation_type: 'flat',
      applied_extras: [],
      customPaperRate: 0,
      is_double_side: false,
      description: '',
      category: '',
      subcategory: '',
      machine_id: null,
      waste_prints: 0,
      proof_prints: 0,
      book_type: 'Laser',
      colour: '',
      numbering_from: '',
      numbering_to: '',
      special_instructions: '',
      matter_text: '',
      matter_file: null,
      matter_preview: null,
      is_inventory_item: false,
    };
    setOrderLines([line]);
    // Prefill payment mode
    const payMap = { cash: 'Cash', upi: 'UPI', card: 'Card', credit: 'Credit' };
    const method = payMap[sc.payment_mode] || 'Cash';
    setPayment(prev => ({
      ...prev,
      selectedMethods: [method],
      methodAmounts: { Cash: method === 'Cash' ? Number(sc.price) || 0 : 0, UPI: method === 'UPI' ? Number(sc.price) || 0 : 0, Cheque: 0, 'Account Transfer': 0 },
    }));
    // Switch to summary tab for quick review
    setActiveTab('summary');
    // Clear state so re-render doesn't re-trigger
    window.history.replaceState({}, document.title);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto UPI QR Generation ──
  useEffect(() => {
    const upiAmt = Number(payment.methodAmounts.UPI) || 0;
    const hasUpi = payment.selectedMethods.includes('UPI');

    if (!hasUpi || upiAmt <= 0 || !branchUpiId) {
      setUpiQrUrl('');
      return;
    }

    setUpiQrLoading(true);
    const upiStr = `upi://pay?pa=${encodeURIComponent(branchUpiId)}&pn=${encodeURIComponent('SARGA')}&am=${upiAmt.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Invoice Payment')}`;
    QRCode.toDataURL(upiStr, { width: 200, margin: 1 })
      .then(url => { setUpiQrUrl(url); setUpiQrLoading(false); })
      .catch(() => { setUpiQrUrl(''); setUpiQrLoading(false); });
  }, [payment.selectedMethods, payment.methodAmounts.UPI, branchUpiId]);

  // ── Computed totals ──
  const totals = useMemo(() => {
    const subtotal = orderLines.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
    const activePct = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);
    const effectiveDiscount = discountMode === 'percent'
      ? subtotal * activePct / 100
      : (discountMode === 'amount' ? (Number(discountInputAmount) || 0) : 0);
    const discountAmount = Math.min(effectiveDiscount, subtotal);
    const afterDiscount = subtotal - discountAmount;
    const gross = afterDiscount;
    return { subtotal, activePct, effectiveDiscount, discountAmount, afterDiscount, sgst: 0, cgst: 0, gross };
  }, [orderLines, discountPercent, discountMode, discountInputAmount]);

  const advancePaid = useMemo(() =>
    payment.selectedMethods.reduce((s, m) => s + (Number(payment.methodAmounts[m]) || 0), 0),
    [payment.selectedMethods, payment.methodAmounts]
  );

  const computeDiscTotal = useCallback((lines, discPct) => {
    const sub = lines.reduce((s, l) => s + (Number(l.total_amount) || 0), 0);
    return sub - Math.min(sub * Math.min(Math.max(Number(discPct) || 0, 0), 100) / 100, sub);
  }, []);

  const canProceed = useMemo(() => {
    if (!form.type) return false;
    if (isWalkIn) return orderLines.length > 0;
    if (form.type === 'Retail') return orderLines.length > 0;
    if (form.type === 'Wholesale') return form.gst.trim().length > 0 && orderLines.length > 0;
    return form.mobile.length === 10 && form.name.trim().length > 0 && orderLines.length > 0;
  }, [form.mobile, form.name, form.gst, form.type, isWalkIn, orderLines.length]);

  // ── Customer search — only show results after typing ──
  useEffect(() => {
    const q = customerSearchDebounced.trim();
    if (!q) {
      // Do NOT preload customers when empty — leave dropdown closed
      setCustomerMatches([]);
      setCustomerNoResults(false);
      setHighlightedCustomerIdx(-1);
      return;
    }
    setCustomerSearching(true);
    const t = setTimeout(async () => {
      try {
        const all = await localDb.getCustomers().catch(() => []);
        const filtered = (all || []).filter(c => c.client_type !== 'internal');
        const lower = q.toLowerCase();
        const results = filtered.filter(c =>
          (c.name && c.name.toLowerCase().includes(lower)) ||
          (c.mobile && c.mobile.includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.gstin && c.gstin.toLowerCase().includes(lower)) ||
          (c.gst && c.gst.toLowerCase().includes(lower)) ||
          (c.company_name && c.company_name.toLowerCase().includes(lower))
        ).slice(0, 8);
        setCustomerMatches(results);
        setCustomerNoResults(results.length === 0);
        setHighlightedCustomerIdx(-1);
      } catch {
        setCustomerMatches([]);
        setCustomerNoResults(true);
      } finally {
        setCustomerSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearchDebounced]);

  const handleSelectCustomer = useCallback((c) => {
    setExistingCustomer(c);
    setCustomerMatches([]);
    setCustomerSearchQuery('');
    setForm(p => ({ ...p, mobile: c.mobile || '', name: c.name || '', type: c.client_type || p.type, email: c.email || '', address: c.address || '', gst: c.gstin || '' }));
  }, []);

  const handleChangeCustomer = useCallback(() => {
    setExistingCustomer(null);
    setCustomerMatches([]);
    setCustomerSearchQuery('');
    setForm(p => ({ ...p, mobile: '', name: '', email: '', address: '', gst: '' }));
  }, []);

  const handleCustomerKeyDown = useCallback((e) => {
    if (!customerMatches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedCustomerIdx(prev => Math.min(prev + 1, customerMatches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedCustomerIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && highlightedCustomerIdx >= 0) {
      e.preventDefault();
      handleSelectCustomer(customerMatches[highlightedCustomerIdx]);
    } else if (e.key === 'Escape') {
      setCustomerMatches([]);
      setCustomerSearchQuery('');
    }
  }, [customerMatches, highlightedCustomerIdx, handleSelectCustomer]);

  // ── Product search & select ──
  const qrLookupMap = useMemo(() => {
    const map = new Map();
    (hierarchy || []).forEach(cat => (cat.subcategories || []).forEach(sub => (sub.products || []).forEach(prod => {
      const code = normalizeCode(prod.name || prod.title || '');
      if (code) map.set(code, { product: prod, catId: cat.id, subId: sub.id });
    })));
    return map;
  }, [hierarchy]);

  const filteredCatalogProducts = useMemo(() => {
    const all = [];
    (hierarchy || []).forEach(cat => {
      if (selectedCategoryId && String(cat.id) !== String(selectedCategoryId)) return;
      (cat.subcategories || []).forEach(sub => {
        if (selectedSubcategoryId && String(sub.id) !== String(selectedSubcategoryId)) return;
        (sub.products || []).forEach(prod => {
          all.push({ product: prod, catId: cat.id, subId: sub.id, catName: cat.name, subName: sub.name });
        });
      });
    });
    return all;
  }, [hierarchy, selectedCategoryId, selectedSubcategoryId]);

  useEffect(() => { setCatalogPage(1); }, [selectedCategoryId, selectedSubcategoryId, productSearchQuery]);

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

  const resolveProductUnitPrice = useCallback((product, qty = 1) => {
    if (product.mrp != null && Number(product.mrp) > 0) return Number(product.mrp);
    if (product.sell_price != null && Number(product.sell_price) > 0) return Number(product.sell_price);
    const result = calculateProductPrice({ product, quantity: qty, extras: [] });
    if (result) return result.unit_price;
    return 0;
  }, []);

  const handleAddLineItem = useCallback(async (product, qty = 1, extras = [], catId, subId, catName) => {
    const quantity = Number(qty) || 1;
    const derivedBookType = bookTypeFromCategory(catName);

    const priceResult = calculateProductPrice({ product, quantity, extras });
    const unitPrice = priceResult ? priceResult.unit_price : resolveProductUnitPrice(product, quantity);
    const totalAmount = priceResult ? priceResult.total_amount : quantity * unitPrice;

    const line = {
      id: `${product.id || Date.now()}-${Date.now()}`,
      product_id: product.id,
      product_name: product.name || product.title || 'Product',
      _product: product,
      quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      calculation_type: product.calculation_type || 'Normal',
      applied_extras: extras,
      customPaperRate: 0,
      is_double_side: false,
      description: '',
      category: catId || '',
      subcategory: subId || '',
      machine_id: null,
      waste_prints: 0,
      proof_prints: 0,
      book_type: derivedBookType,
      colour: '', numbering_from: '', numbering_to: '', special_instructions: '',
      matter_text: '', matter_file: null, matter_preview: null,
      is_inventory_item: false,
    };
    setOrderLines(prev => [...prev, line]);
    setSelectedProduct(null);
    setProductSearchQuery('');
    setRecentProducts(prev => {
      const next = [{ id: product.id, name: product.name || product.title, mrp: unitPrice }, ...prev.filter(p => p.id !== product.id)].slice(0, 20);
      localStorage.setItem('recentProducts', JSON.stringify(next));
      return next;
    });
  }, [resolveProductUnitPrice]);

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

  const removeLine = useCallback((id) => {
    setOrderLines(prev => prev.filter(l => l.id !== id));
  }, []);

  const duplicateLine = useCallback((line) => {
    setOrderLines(prev => [...prev, { ...line, id: `${line.product_id || 'dup'}-${Date.now()}` }]);
  }, []);

  const updateLine = useCallback((id, field, value) => {
    setOrderLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === 'quantity') {
        const newQty = Math.max(1, Number(value) || 1);
        updated.quantity = newQty;
        const calcType = l._product?.calculation_type || l.calculation_type;
        if (l._product && (calcType === 'Slab' || calcType === 'Range')) {
          const priceResult = calculateProductPrice({
            product: l._product,
            quantity: newQty,
            extras: l.applied_extras || [],
            currentPaperRate: l.customPaperRate || 0,
            isDoubleSide: l.is_double_side || false,
          });
          if (priceResult) {
            updated.unit_price = priceResult.unit_price;
            updated.total_amount = priceResult.total_amount;
          } else {
            updated.total_amount = newQty * (Number(l.unit_price) || 0);
          }
        } else {
          updated.total_amount = newQty * (Number(l.unit_price) || 0);
        }
      } else if (field === 'unit_price') {
        updated.total_amount = (Number(l.quantity) || 1) * (Number(value) || 0);
      }
      return updated;
    }));
  }, []);

  // ── QR / Barcode scan ──
  const handleQrLookup = useCallback(async (code, autoAdd = true) => {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    const match = qrLookupMap.get(normalized);
    if (match) {
      if (autoAdd) {
        handleAddLineItem(match.product, 1, [], match.catId, match.subId, match.catName);
      } else {
        setScannedPreview({ product: match.product, catId: match.catId, subId: match.subId, catName: match.catName });
        setScannedQty(1);
      }
      return;
    }
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
            waste_prints: 0, proof_prints: 0, book_type: 'Other',
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
    // Branch validation
    if (!selectedBranchId) {
      setError('Please select a branch before creating invoice.');
      toast.error('Branch is required.');
      return;
    }
    // Customer type validation
    if (!form.type) {
      setError('Please select a customer type.');
      toast.error('Customer type is required.');
      return;
    }
    // Job type is optional — save if selected, skip if not
    if (!canProceed) { setError('Complete customer details and add at least one product.'); return; }
    if (orderLines.length === 0) { setError('Add at least one product.'); return; }
    if (advancePaid < 0) { setError('Invalid payment amount.'); return; }
    if (discountError) { setError(discountError); return; }
    if (isWalkIn && advancePaid < totals.gross * 0.99) { setError('Walk-in customers must pay in full.'); return; }
    setError('');
    setSaving(true);
    try {
      let customerId = existingCustomer?.id;
      if (!customerId && form.name) {
        const custPayload = { name: form.name, mobile: form.mobile || null, client_type: form.type, email: form.email || null, address: form.address || null, gstin: form.gst || null };
        const customer = await localDb.createCustomer(custPayload);
        customerId = customer.id;
      }
      const cashAmt = Number(payment.methodAmounts.Cash) || 0;
      const upiAmt = Number(payment.methodAmounts.UPI) || 0;
      const chequeAmt = Number(payment.methodAmounts.Cheque) || 0;
      const transferAmt = Number(payment.methodAmounts['Account Transfer']) || 0;
      const payMethodLabel = payment.selectedMethods.length === 1 ? payment.selectedMethods[0] : 'Split';
      const billPayload = {
        customer_id: customerId || null,
        customer_name: form.name,
        customer_mobile: form.mobile || null,
        customer_type: form.type,
        total_amount: totals.gross,
        net_amount: totals.gross,
        sgst_amount: 0,
        cgst_amount: 0,
        discount_percent: discountMode === 'percent' ? (discountPercent || null) : (totals.subtotal > 0 ? Number(((totals.discountAmount / totals.subtotal) * 100).toFixed(2)) : null),
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
        book_type: jobType || (() => {
          if (orderLines.some(l => l.book_type === 'Offset')) return 'Offset';
          if (orderLines.some(l => l.book_type === 'Laser')) return 'Laser';
          return 'Other';
        })(),
        is_internal: 0,
        order_lines: orderLines.map(l => ({ ...l, matter_file: undefined, matter_preview: undefined, _product: undefined, id: Number(l.product_id) || null })),
        auto_deliver: isWalkIn,
        branch_id: selectedBranchId,
      };
      const matterFiles = orderLines.map(l => l.matter_file).filter(Boolean);
      const result = await localDb.createBill(billPayload, matterFiles);
      const lastBill = {
        customer: { name: form.name, mobile: form.mobile, address: form.address, gst: form.gst },
        orderLines, totals, payment: { method: payMethodLabel, cash_amount: cashAmt, upi_amount: upiAmt, cheque_amount: chequeAmt, account_transfer_amount: transferAmt },
        jobs: result.jobs || [], upiId: branchUpiId
      };
      setLastBillData(lastBill);
      setLastOrderCustomerType(form.type);
      setLastOrderAutoDelivered(isWalkIn);

      // Prepare assign jobs from result
      if (result.jobs && result.jobs.length > 0) {
        setAssignJobs(result.jobs);
        const init = {};
        result.jobs.forEach(j => { init[j.id] = ''; });
        setAssignSelections(init);
      } else {
        setAssignJobs([]);
        setAssignSelections({});
      }

      // Reset form
      setForm(defaultForm());
      setExistingCustomer(null);
      setOrderLines([]);
      setPayment(defaultPayment());
      setDiscountPercent(0);
      setDiscountInputAmount(0);
      setError('');
      setJobType('');
      toast.success('Invoice created successfully!');
      if (result.payment?.id) {
        window.dispatchEvent(new CustomEvent('paymentRecorded'));
      }
      setShowPostBillOptions(true);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create invoice.');
      toast.error('Invoice creation failed.');
    } finally { setSaving(false); }
  }, [canProceed, orderLines, advancePaid, totals, isWalkIn, existingCustomer, form, payment, discountPercent, totals.discountAmount, totals.gross, selectedBranchId, jobType, branchUpiId, discountError]);

  // ── Staff assignment submit ──
  const handleAssignStaff = useCallback(async () => {
    const assignments = Object.entries(assignSelections).filter(([, staffId]) => staffId);
    if (assignments.length === 0) { toast.error('Select at least one staff member to assign.'); return; }
    setAssignLoading(true);
    setAssignError('');
    try {
      await Promise.all(assignments.map(([jobId, staffId]) =>
        api.post(`/jobs/${jobId}/assign`, { staff_id: staffId })
      ));
      toast.success('Staff assigned successfully!');
      setShowPostBillOptions(false);
    } catch (err) {
      setAssignError(err?.response?.data?.message || 'Failed to assign staff.');
    } finally {
      setAssignLoading(false);
    }
  }, [assignSelections]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); customerSearchRef.current?.focus(); customerSearchRef.current?.select(); }
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
        const draftLines = orderLines.map(({ _product, matter_file, matter_preview, ...rest }) => rest);
        localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: draftLines, totals }));
      }
    }, 10000);
    return () => clearInterval(saveTimerRef.current);
  }, [form, orderLines, totals]);

  // ── Print on save ──
  const handlePrintLast = useCallback(() => {
    if (lastBillData) printInvoicePDF(lastBillData);
  }, [lastBillData]);

  // ── Undo delete (5s) ──
  const handleRemoveWithUndo = useCallback((line) => {
    setOrderLines(prev => prev.filter(l => l.id !== line.id));
    toast((t) => (
      <div className="row gap-sm items-center">
        <span>Item removed</span>
        <button className="btn btn-xs btn-primary" onClick={() => { setOrderLines(prev => [...prev, line]); toast.dismiss(t.id); }}>Undo</button>
      </div>
    ), { duration: 5000 });
  }, []);

  // ── Back navigation with draft guard ──
  const handleBack = useCallback(async () => {
    if (orderLines.length > 0 || form.name) {
      const yes = await confirm({
        title: 'Leave Invoice?',
        message: 'You have unsaved invoice data. Your draft will be auto-saved. Do you want to leave?',
        confirmText: 'Leave',
        cancelText: 'Stay',
      });
      if (!yes) return;
      const draftLines = orderLines.map(({ _product, matter_file, matter_preview, ...rest }) => rest);
      localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: draftLines, totals }));
    }
    navigate('/invoices');
  }, [orderLines, form, totals, confirm, navigate]);

  // ── Loading state ──
  if (loading) {
    return (
    <PageContainer className="billing-page">
        <div className="billing-skeleton">
          {[1, 2, 3].map(i => <div key={i} className="skeleton-block" style={{ height: i === 1 ? 64 : 120, animationDelay: `${i * 0.1}s` }} />)}
        </div>
    </PageContainer>
    );
  }

  const branchRequiresAttention = !selectedBranchId;

  // ── Render ──
  return (
    <PageContainer className="billing-page">
      {/* HEADER */}
      <header className="billing-header">
        <div className="billing-header__left" />
        <div className="billing-header__right">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/dashboard/shortcuts')} title="Quick Bill Shortcuts"><Zap size={15} aria-hidden="true" /> Shortcuts</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setShowRecentBills(true); fetchRecentBills(); }}><Clock size={15} aria-hidden="true" /> Recent</button>
          <button className="btn btn-ghost btn-sm" onClick={handleChangeCustomer}><User size={15} aria-hidden="true" /> New Customer</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddOrder} disabled={saving || !canProceed}>
            {saving ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Zap size={15} aria-hidden="true" />} Create Invoice
          </button>
        </div>
      </header>

      {/* STICKY SUMMARY BAR — Branch + Stats */}
      <div className="billing-summary-bar">
        {/* Branch selector / display */}
        {!['admin', 'super_admin'].includes(user?.role?.toLowerCase()) ? (
          <div className="billing-summary-bar__item">
            <Building2 size={14} />
            <span>{branches.find(b => String(b.id) === String(selectedBranchId || user?.branch_id))?.name || user?.branch_short_name || 'Branch'}</span>
          </div>
        ) : (
          <div className={`billing-summary-bar__item${branchRequiresAttention ? ' billing-summary-bar__item--branch-required' : ''}`}>
            <Building2 size={14} />
            <select
              value={selectedBranchId || ''}
              onChange={e => setSelectedBranchId(e.target.value || null)}
              aria-label="Select branch"
              title={branchRequiresAttention ? 'Branch is required' : ''}
            >
              <option value="">Branch *</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

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

      {/* ERROR */}
      {error && <div className="billing-error"><AlertCircle size={16} /> {error}</div>}

      {/* TABS NAVIGATION */}
      <div className="billing-tabs">
        {BILLING_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              className={`billing-tab ${activeTab === t.key ? 'billing-tab--active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* CUSTOMER SECTION */}
      <div className="billing-section billing-section--customer" style={{ display: activeTab === 'customer' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><User size={16} /> <h2>Customer</h2></div>

        {/* Customer Type Dropdown */}
        <div className="billing-field" style={{ marginBottom: '16px', position: 'relative' }}>
          <Users size={14} className="billing-field__icon" aria-hidden="true" />
          <label htmlFor="billing-customer-type" className="sr-only">Customer Type</label>
          <select
            id="billing-customer-type"
            name="customerType"
            className="billing-field__input"
            value={form.type || ''}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            required
            style={{
              appearance: 'none',
              background: 'transparent',
              border: 'none',
              width: '100%',
              outline: 'none',
              cursor: 'pointer',
              color: 'var(--text)',
              paddingRight: '24px'
            }}
          >
            <option value="" disabled style={{ background: 'var(--card)', color: 'var(--text-muted)' }}>Select Customer Type *</option>
            <option value="Retail" style={{ background: 'var(--card)' }}>Retail</option>
            <option value="Walk-in" style={{ background: 'var(--card)' }}>Walk-in</option>
            <option value="Offset" style={{ background: 'var(--card)' }}>Offset</option>
            <option value="Wholesale" style={{ background: 'var(--card)' }}>Wholesale</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: '12px', pointerEvents: 'none', color: 'var(--text-muted)' }} />
        </div>

        {/* Search existing customer */}
        <div className="autocomplete-wrapper" style={{ position: 'relative' }}>
          <div className="billing-field">
            <Search size={14} className="billing-field__icon" aria-hidden="true" />
            <label htmlFor="billing-customer-search" className="sr-only">Search customer by name or mobile</label>
            <input
              id="billing-customer-search"
              name="billingCustomerSearch"
              ref={customerSearchRef}
              type="text"
              placeholder="Search customer by name or mobile..."
              value={customerSearchQuery}
              onChange={e => { setCustomerSearchQuery(e.target.value); setExistingCustomer(null); setHighlightedCustomerIdx(-1); }}
              onKeyDown={handleCustomerKeyDown}
              onBlur={() => setTimeout(() => { setCustomerMatches([]); setCustomerNoResults(false); }, 200)}
              className="billing-field__input"
              autoComplete="off"
            />
            {customerSearching && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />}
          </div>

          {(customerMatches.length > 0 || (customerNoResults && customerSearchQuery.trim())) && (
            <div className="billing-dropdown" ref={customerDropdownRef} style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              overflowY: 'auto', maxHeight: 280
            }}>
              {customerMatches.length > 0 ? (
                customerMatches.map((c, i) => (
                  <div
                    key={c.id}
                    className={`billing-dropdown__item ${i === highlightedCustomerIdx ? 'billing-dropdown__item--highlighted' : ''}`}
                    onClick={() => handleSelectCustomer(c)}
                    onMouseEnter={() => setHighlightedCustomerIdx(i)}
                    role="option"
                    aria-selected={i === highlightedCustomerIdx}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="font-medium" style={{ fontSize: 13 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{c.mobile || c.phone || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {c.type && <span className="badge badge--sm">{c.type}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="billing-dropdown__item" style={{ justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  No customers found
                </div>
              )}
              {customerSearchQuery.trim().length > 0 && (
                <div className="billing-dropdown__item billing-dropdown__add" onClick={() => { setCustomerMatches([]); setCustomerSearchQuery(''); customerNameRef.current?.focus(); }}>
                  <Plus size={14} /> <span>Add New Customer</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Existing customer card */}
        {existingCustomer ? (
          <div className="billing-customer-card">
            <div className="billing-customer-card__header">
              <div className="user-avatar user-avatar--sm">{form.name?.[0] || '?'}</div>
              <div>
                <div className="font-semibold">{form.name}</div>
                <div className="text-xs muted">{form.mobile}</div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={handleChangeCustomer} style={{ marginLeft: 'auto' }} aria-label="Clear customer selection"><X size={14} aria-hidden="true" /></button>
            </div>
            <div className="billing-customer-card__details">
              <span><Phone size={12} /> {form.mobile}</span>
              {form.gst && <span><FileText size={12} /> {form.gst}</span>}
              {form.address && <span><MapPin size={12} /> {form.address}</span>}
            </div>
          </div>
        ) : (
          /* New customer form */
          <div className="billing-customer-form">
            <div className="billing-customer-form__grid">
              <div className="billing-field">
                <User size={14} className="billing-field__icon" aria-hidden="true" />
                <label htmlFor="billing-name" className="sr-only">Customer Name</label>
                <input id="billing-name" name="billingName" ref={customerNameRef} type="text"
                  placeholder={isWalkIn || form.type === 'Retail' ? 'Full Name' : 'Full Name *'}
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { const next = needsGst ? customerGstRef : customerEmailRef; next.current?.focus(); } }}
                  className="billing-field__input" autoComplete="name" />
              </div>
              <div className="billing-field billing-field--mobile">
                <Phone size={14} className="billing-field__icon" aria-hidden="true" />
                <label htmlFor="billing-mobile" className="sr-only">Mobile Number</label>
                <input id="billing-mobile" name="billingMobile" type="tel"
                  placeholder={isWalkIn || form.type === 'Retail' ? 'Mobile' : 'Mobile *'}
                  value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  onKeyDown={e => { if (e.key === 'Enter') { customerNameRef.current?.focus(); } }}
                  className="billing-field__input" autoComplete="tel" />
              </div>
              {needsGst && (
                <div className="billing-field">
                  <FileText size={14} className="billing-field__icon" aria-hidden="true" />
                  <label htmlFor="billing-gst" className="sr-only">GST Number</label>
                  <input id="billing-gst" name="billingGst" ref={customerGstRef} type="text"
                    placeholder={form.type === 'Wholesale' ? 'GST Number *' : 'GST Number'}
                    value={form.gst} onChange={e => setForm(p => ({ ...p, gst: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { customerEmailRef.current?.focus(); } }}
                    className="billing-field__input" autoComplete="off" />
                </div>
              )}
              <div className="billing-field">
                <Mail size={14} className="billing-field__icon" aria-hidden="true" />
                <label htmlFor="billing-email" className="sr-only">Email</label>
                <input id="billing-email" name="billingEmail" ref={customerEmailRef} type="email"
                  placeholder="Email"
                  value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { customerAddressRef.current?.focus(); } }}
                  className="billing-field__input" autoComplete="email" />
              </div>
            </div>
            <div className="billing-field">
              <MapPin size={14} className="billing-field__icon" aria-hidden="true" />
              <label htmlFor="billing-address" className="sr-only">Address</label>
              <input id="billing-address" name="billingAddress" ref={customerAddressRef} type="text"
                placeholder="Address"
                value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
                className="billing-field__input" autoComplete="street-address" />
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveTab('products')}>
            Next: Add Products →
          </button>
        </div>
      </div>

      {/* PRODUCTS SECTION */}
      <div className="billing-section billing-section--products" style={{ display: activeTab === 'products' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><ShoppingCart size={16} /> <h2>Add Products</h2></div>

        {/* Search + Quick Actions */}
        <div className="billing-product-top">
          <div className="billing-search-row" style={{ position: 'relative' }}>
            <div className="billing-field billing-field--search">
              <Search size={16} className="billing-field__icon" aria-hidden="true" />
              <input ref={productSearchRef} id="billingProductSearch" name="billingProductSearch" type="text"
                placeholder="Scan barcode • Search product • Enter code"
                value={productSearchQuery}
                onChange={e => { setProductSearchQuery(e.target.value); setSelectedSuggestionIdx(-1); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (selectedSuggestionIdx >= 0 && productSuggestions[selectedSuggestionIdx]) {
                      const s = productSuggestions[selectedSuggestionIdx];
                      handleAddLineItem(s.product, 1, [], s.catId, s.subId, s.catName);
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
                    onClick={() => { handleAddLineItem(s.product, 1, [], s.catId, s.subId, s.catName); setProductSearchQuery(''); setProductSuggestions([]); }}
                    onMouseEnter={() => setSelectedSuggestionIdx(i)}>
                    <div className="billing-product-suggestions__name">{s.product.name || s.product.title}</div>
                    <div className="billing-product-suggestions__meta">
                      {(() => { const p = resolveProductUnitPrice(s.product); return <span>{p > 0 ? `₹${p.toLocaleString()}` : 'Custom pricing'}</span>; })()}
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
                {(hierarchy.find(c => String(c.id) === String(selectedCategoryId))?.subcategories || []).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
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

        {/* Catalog Grid */}
        {(() => {
          const totalProducts = filteredCatalogProducts.length;
          const totalPages = Math.ceil(totalProducts / CATALOG_PAGE_SIZE);
          const safePage = Math.min(catalogPage, Math.max(1, totalPages));
          const pageProducts = filteredCatalogProducts.slice(
            (safePage - 1) * CATALOG_PAGE_SIZE,
            safePage * CATALOG_PAGE_SIZE
          );
          return (
            <>
              {totalProducts === 0 ? (
                <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No products found for the selected filters.
                </div>
              ) : (
                <>
                  <div className="billing-catalog-grid">
                    {pageProducts.map(({ product: prod, catId, subId, catName, subName }) => {
                      const displayPrice = resolveProductUnitPrice(prod);
                      return (
                        <div
                          key={prod.id}
                          className="billing-catalog-item"
                          onClick={() => handleAddLineItem(prod, 1, [], catId, subId, catName)}
                          title={`${catName} › ${subName}`}
                        >
                          <div className="billing-catalog-item__icon">
                            {prod.image_url ? (
                              <SecureImage
                                src={prod.image_url}
                                alt={prod.name || prod.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                              />
                            ) : (
                              <Package size={18} aria-hidden="true" />
                            )}
                          </div>
                          <div className="billing-catalog-item__name">{prod.name || prod.title}</div>
                          <div className="billing-catalog-item__price">
                            {displayPrice > 0 ? `₹${displayPrice.toLocaleString()}` : 'Custom'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 4px', fontSize: 12, color: 'var(--muted)'
                    }}>
                      <span>
                        {(safePage - 1) * CATALOG_PAGE_SIZE + 1}–{Math.min(safePage * CATALOG_PAGE_SIZE, totalProducts)} of {totalProducts} products
                      </span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-xs" disabled={safePage <= 1} onClick={() => setCatalogPage(p => Math.max(1, p - 1))} aria-label="Previous page">‹ Prev</button>
                        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 7) { pageNum = i + 1; }
                          else if (safePage <= 4) { pageNum = i + 1; }
                          else if (safePage >= totalPages - 3) { pageNum = totalPages - 6 + i; }
                          else { pageNum = safePage - 3 + i; }
                          return (
                            <button key={pageNum} className={`btn btn-xs ${pageNum === safePage ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCatalogPage(pageNum)} aria-label={`Page ${pageNum}`} aria-current={pageNum === safePage ? 'page' : undefined}>
                              {pageNum}
                            </button>
                          );
                        })}
                        <button className="btn btn-ghost btn-xs" disabled={safePage >= totalPages} onClick={() => setCatalogPage(p => Math.min(totalPages, p + 1))} aria-label="Next page">Next ›</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          );
        })()}

        {/* Selected Products Table */}
        {orderLines.length > 0 ? (
          <div className="billing-products-layout">
            <div className="billing-table-wrapper">
              <table className="billing-table">
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '30%' }}>Product</th>
                    <th scope="col" style={{ width: '15%' }}>Qty</th>
                    <th scope="col" style={{ width: '15%' }}>Rate</th>
                    <th scope="col" style={{ width: '16%' }}>Total</th>
                    <th scope="col" style={{ width: '14%', textAlign: 'right' }}>Actions</th>
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
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => updateLine(line.id, 'quantity', Math.max(1, (Number(line.quantity) || 1) - 1))} aria-label="Decrease quantity"><Minus size={12} /></button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={Number(line.quantity).toLocaleString('en-IN')}
                            min="1"
                            aria-label="Quantity"
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              updateLine(line.id, 'quantity', Math.max(1, Number(raw) || 1));
                            }}
                            className="billing-qty-input"
                          />
                          <button className="btn btn-ghost btn-icon btn-xs" onClick={() => updateLine(line.id, 'quantity', (Number(line.quantity) || 1) + 1)} aria-label="Increase quantity"><Plus size={12} /></button>
                        </div>
                      </td>
                      <td>
                        <input type="number" value={line.unit_price} onChange={e => updateLine(line.id, 'unit_price', Number(e.target.value) || 0)} className="billing-input-num" aria-label="Unit price" />
                      </td>
                      <td className="font-bold">₹{Number(line.total_amount).toLocaleString()}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>
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
                <div className="billing-summary-side__row">
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>GST incl. in price</span>
                </div>
                <div className="billing-summary-side__divider" />
                <div className="billing-summary-side__row billing-summary-side__row--grand"><span>Grand Total</span><span>₹{totals.gross.toFixed(2)}</span></div>

                {/* Discount controls */}
                <div className="billing-discount-row">
                  <span className="text-xs muted">Discount <span style={{ fontSize: 10, color: 'var(--muted)' }}>(max {maxDiscountPct}%)</span></span>
                  <div className="row gap-xs">
                    {discountMode === 'percent' ? (
                      <input
                        type="number"
                        placeholder="Discount %"
                        value={discountPercent || ''}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setDiscountPercent(val);
                          if (val > maxDiscountPct) {
                            setDiscountError(`You are not allowed to give more than ${maxDiscountPct}% discount`);
                          } else {
                            setDiscountError('');
                          }
                        }}
                        className="billing-input-sm"
                        min="0"
                        max={maxDiscountPct}
                        style={{ flex: 1 }}
                      />
                    ) : (
                      <input
                        type="number"
                        placeholder="Discount Amount (₹)"
                        value={discountInputAmount || ''}
                        onChange={e => {
                          const val = Number(e.target.value) || 0;
                          setDiscountInputAmount(val);
                          const subtotal = totals.subtotal;
                          if (subtotal > 0) {
                            const pct = (val / subtotal) * 100;
                            if (pct > maxDiscountPct) {
                              setDiscountError(`You are not allowed to give more than ${maxDiscountPct}% discount`);
                            } else {
                              setDiscountError('');
                            }
                          } else {
                            setDiscountError('');
                          }
                        }}
                        className="billing-input-sm"
                        min="0"
                        style={{ flex: 1 }}
                      />
                    )}
                    <button className={`btn btn-xs ${discountMode === 'percent' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDiscountMode('percent'); setDiscountPercent(0); setDiscountInputAmount(0); setDiscountError(''); }}>%</button>
                    <button className={`btn btn-xs ${discountMode === 'amount' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setDiscountMode('amount'); setDiscountPercent(0); setDiscountInputAmount(0); setDiscountError(''); }}>₹</button>
                  </div>
                </div>
                {discountError && (
                  <div className="billing-discount-error">
                    <AlertCircle size={12} />
                    <span>{discountError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="billing-empty-products">
            <Package size={28} className="muted" />
            <p className="muted text-sm">No products added yet</p>
            <p className="muted text-xs">Search above or scan a barcode to add items</p>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveTab('customer')}>
            ← Back: Customer
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveTab('payment')}>
            Next: Payment →
          </button>
        </div>
      </div>

      {/* PAYMENT SECTION */}
      <div className="billing-section billing-section--payment" style={{ display: activeTab === 'payment' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><CreditCard size={16} /> <h2>Payment</h2></div>

        {/* Amount received display */}
        <div className="billing-payment-amount">
          <label className="text-xs muted">Amount Received</label>
          <div className="billing-payment-amount__value">₹{advancePaid.toFixed(2)}</div>
        </div>

        {/* Payment method chips */}
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
          {payment.selectedMethods.map((m) => (
            <div key={m} className="billing-field">
              <IndianRupee size={14} className="billing-field__icon" aria-hidden="true" />
              <input
                ref={m === 'Cash' ? paymentAmountRef : null}
                id={`paymentAmount-${m}`}
                name={`paymentAmount-${m}`}
                type="number"
                placeholder={`${m} amount`}
                value={payment.methodAmounts[m] || ''}
                onChange={e => updateMethodAmount(m, e.target.value)}
                className="billing-field__input"
                aria-label={`${m} amount`}
                autoComplete="off"
              />
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

        {/* Auto UPI QR */}
        {payment.selectedMethods.includes('UPI') && (
          <div>
            {!branchUpiId && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} style={{ color: 'var(--destructive)' }} />
                Select a branch with a UPI ID to enable QR generation.
              </div>
            )}
            {branchUpiId && Number(payment.methodAmounts.UPI) > 0 && (
              <div className="billing-upi-qr">
                <span className="billing-upi-qr__label">Scan to Pay via UPI</span>
                {upiQrLoading ? (
                  <Loader2 size={32} className="animate-spin" style={{ color: 'var(--muted)' }} />
                ) : upiQrUrl ? (
                  <img src={upiQrUrl} alt="UPI QR Code" className="billing-upi-qr__img" width={160} height={160} />
                ) : null}
                <span className="billing-upi-qr__amount">₹{Number(payment.methodAmounts.UPI).toFixed(2)}</span>
                <span className="billing-upi-qr__id">{branchUpiId}</span>
              </div>
            )}
          </div>
        )}

        {/* Reference + Notes */}
        <div className="billing-payment-extras">
          <div className="billing-field">
            <Hash size={14} className="billing-field__icon" aria-hidden="true" />
            <label htmlFor="billing-ref" className="sr-only">Reference number</label>
            <input id="billing-ref" name="billingRef" ref={paymentRefNumberRef} type="text"
              placeholder="Reference number (required for non-cash)"
              value={payment.referenceNumber}
              onChange={e => setPayment(p => ({ ...p, referenceNumber: e.target.value }))}
              className="billing-field__input" autoComplete="off" />
          </div>
          <div className="billing-field">
            <MessageSquare size={14} className="billing-field__icon" aria-hidden="true" />
            <label htmlFor="billing-notes" className="sr-only">Notes</label>
            <input id="billing-notes" name="billingNotes" type="text"
              placeholder="Notes (optional)"
              value={payment.description}
              onChange={e => setPayment(p => ({ ...p, description: e.target.value }))}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveTab('products')}>
            ← Back: Products
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveTab('summary')}>
            Next: Summary →
          </button>
        </div>
      </div>

      {/* SUMMARY SECTION */}
      <div className="billing-section billing-section--summary" style={{ display: activeTab === 'summary' ? 'flex' : 'none' }}>
        <div className="billing-section__header"><FileText size={16} /> <h2>Summary</h2></div>

        {/* Totals breakdown */}
        <div className="billing-summary-final">
          <div className="billing-summary-final__row">
            <span>Subtotal</span>
            <span>₹{totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.discountAmount > 0 && (
            <div className="billing-summary-final__row billing-summary-final__row--discount">
              <span>Discount</span>
              <span>−₹{totals.discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="billing-summary-final__row">
            <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>GST included in price</span>
            <span />
          </div>
          <div className="billing-summary-final__divider" />
          <div className="billing-summary-final__row billing-summary-final__row--total">
            <span>Final Amount</span>
            <span>₹{totals.gross.toFixed(2)}</span>
          </div>
          <div className="billing-summary-final__row">
            <span>Paid</span>
            <span className="text-success font-bold">₹{advancePaid.toFixed(2)}</span>
          </div>
          <div className="billing-summary-final__row billing-summary-final__row--balance">
            <span>Balance Due</span>
            <span className={advancePaid >= totals.gross ? 'text-success font-bold' : 'font-bold'}>
              {advancePaid >= totals.gross ? '✓ Paid in Full' : `₹${Math.max(totals.gross - advancePaid, 0).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Draft + Preview actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setActiveTab('payment')}>
            ← Back: Payment
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
              const draftLines = orderLines.map(({ _product, matter_file, matter_preview, ...rest }) => rest);
              localStorage.setItem('billingDraft', JSON.stringify({ customer: form, orders: draftLines, totals }));
              toast.success('Draft saved');
            }}>
              <Save size={14} aria-hidden="true" /> Save Draft
            </button>
            {lastBillData && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={handlePrintLast}>
                <Eye size={14} aria-hidden="true" /> Preview Last
              </button>
            )}
          </div>
        </div>

        {/* Primary Create Invoice CTA */}
        <button
          className="btn btn-primary billing-summary-final__cta"
          onClick={handleAddOrder}
          disabled={saving || !canProceed}
          aria-label="Create Invoice"
        >
          {saving
            ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Creating Invoice...</>
            : <><Zap size={18} aria-hidden="true" /> Create Invoice</>}
        </button>

        {!canProceed && orderLines.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
            Add at least one product to create an invoice.
          </p>
        )}
      </div>

      {/* Scanner Modal */}
      <ScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQrLookup}
      />

      {/* Post-bill options with Staff Assignment */}
      {showPostBillOptions && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="post-bill-title" onClick={() => setShowPostBillOptions(false)}>
          <div className="modal modal--lg" onClick={e => e.stopPropagation()}>
            <div className="modal__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Check size={20} style={{ color: 'var(--success)' }} />
                <h3 id="post-bill-title">Invoice Created!</h3>
              </div>
              <button className="modal-close" aria-label="Close" onClick={() => setShowPostBillOptions(false)}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body stack-sm">
              {/* Print / New Invoice actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary flex-1" onClick={() => { handlePrintLast(); setShowPostBillOptions(false); }}>
                  <Printer size={16} className="mr-8" aria-hidden="true" /> Print Invoice
                </button>
                <button className="btn btn-ghost flex-1" onClick={() => { setShowPostBillOptions(false); }}>
                  <Plus size={16} className="mr-8" aria-hidden="true" /> New Invoice
                </button>
              </div>

              {/* Staff Assignment Panel */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Users size={16} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Assign Work to Staff</span>
                </div>

                {assignJobs.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>
                    No job lines available for assignment.
                  </div>
                ) : (
                  <div className="billing-assign-panel">
                    {assignJobs.map(job => (
                      <div key={job.id} className="billing-assign-row">
                        <div className="billing-assign-row__name" title={job.job_number || job.id}>
                          {job.job_number || `Job #${job.id}`}
                          {job.product_name && <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 11 }}>· {job.product_name}</span>}
                        </div>
                        <select
                          className="billing-assign-row__select"
                          value={assignSelections[job.id] || ''}
                          onChange={e => setAssignSelections(prev => ({ ...prev, [job.id]: e.target.value }))}
                          aria-label={`Assign staff for job ${job.job_number || job.id}`}
                        >
                          <option value="">— Assign Staff —</option>
                          {Array.isArray(staffOptions) && staffOptions.map(s => (
                            <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>
                          ))}
                        </select>
                      </div>
                    ))}

                    {assignError && (
                      <div className="billing-error" style={{ fontSize: 12 }}>
                        <AlertCircle size={14} /> {assignError}
                      </div>
                    )}

                    <div className="billing-assign-actions">
                      <button
                        className="btn btn-primary btn-sm flex-1"
                        onClick={handleAssignStaff}
                        disabled={assignLoading}
                      >
                        {assignLoading ? <><Loader2 size={14} className="animate-spin" /> Assigning...</> : <><Check size={14} /> Assign & Close</>}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowPostBillOptions(false)}>
                        Skip for now
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Bills Modal */}
      {showRecentBills && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="recent-bills-title" onClick={() => setShowRecentBills(false)}>
          <div className="modal modal--md" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className="modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <h3 id="recent-bills-title" className="modal__title" style={{ margin: 0 }}>Recent Invoices</h3>
              <button className="modal-close" onClick={() => setShowRecentBills(false)} aria-label="Close recent bills" style={{ position: 'static' }}><X size={18} aria-hidden="true" /></button>
            </div>
            <div className="modal__body" style={{ maxHeight: '60dvh', overflowY: 'auto', padding: '16px' }}>
              {loadingRecentBills ? (
                <div className="flex-center py-24"><Loader2 size={24} className="animate-spin" /></div>
              ) : recentBills.length === 0 ? (
                <div className="text-center muted py-24">No recent invoices found</div>
              ) : (
                <div className="recent-bills-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {recentBills.map((b) => (
                    <div key={b.id || b.localId} className="recent-bill-item" style={{
                      padding: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--surface-2, var(--bg-2))',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div className="font-semibold">{b.customer_name || b.customerName || 'Walk-in Customer'}</div>
                        <div className="text-xs muted">{b.customer_mobile || b.customerMobile || 'No mobile'} • {new Date(b.payment_date || b.paymentDate || b.created_at || Date.now()).toLocaleDateString()}</div>
                        <div className="text-xs" style={{ marginTop: 4 }}>
                          {b.isOffline ? (
                            <span style={{ color: 'var(--warning)' }}>Unsynced (Offline)</span>
                          ) : (
                            <span style={{ color: 'var(--success)' }}>Synced ({b.invoice_number || b.id})</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="font-bold">₹{Number(b.net_amount || b.netAmount || b.total_amount || b.totalAmount || 0).toFixed(2)}</div>
                        <button className="btn btn-ghost btn-xs btn-icon" onClick={() => handlePrintRecent(b)} title="Print invoice"><Printer size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                <button className="btn btn-primary btn-sm flex-1" onClick={() => { handleAddLineItem(scannedPreview.product, scannedQty, [], scannedPreview.catId, scannedPreview.subId, scannedPreview.catName); setScannedPreview(null); }}>
                  Add to Bill
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setScannedPreview(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default Billing;
